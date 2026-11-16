package api

import (
	"context"
	"errors"
	"net/http"
	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/store"
	"strings"
	"time"
)

func validateSubject(ctx context.Context, st store.Store, kind store.SubjectKind, id store.ID) error {
	if kind == store.KindAnonymous {
		if id != "" {
			return errInvalid
		}
		return nil
	}
	if kind != store.KindUser || id == "" {
		return errInvalid
	}
	_, err := st.Users().Get(ctx, id)
	return err
}
func allowedPolicyTarget(ctx context.Context, st store.Store, p store.Policy) bool {
	if strings.HasPrefix(p.Resource, "device:") && (p.Action == "read" || p.Action == "control") && !strings.Contains(strings.TrimPrefix(p.Resource, "device:"), "*") {
		_, err := st.Devices().Get(ctx, strings.TrimPrefix(p.Resource, "device:"))
		return err == nil
	}
	if p.SubjectKind == store.KindAnonymous {
		return false
	}
	for _, c := range managementCapabilities {
		if p.Resource == c.resource && p.Action == c.action {
			return true
		}
	}
	return false
}
func candidateACL(ctx context.Context, st store.Store) (*acl.Authorizer, []store.Policy, error) {
	p, err := st.Policies().ListAll(ctx)
	if err != nil {
		return nil, nil, err
	}
	az := acl.New()
	az.Load(p)
	return az, p, nil
}
func (s *Server) accessSummary(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireCapability(w, r, "permissions")
	if !ok {
		return
	}
	kind := store.SubjectKind(r.URL.Query().Get("subject_kind"))
	id := store.ID(r.URL.Query().Get("subject_id"))
	if err := validateSubject(r.Context(), s.st, kind, id); err != nil {
		managementFailure(w, err)
		return
	}
	subject := store.Subject{Kind: kind, ID: id}
	all, err := s.st.Devices().List(r.Context())
	if err != nil {
		managementFailure(w, err)
		return
	}
	az, policies, err := candidateACL(r.Context(), s.st)
	if err != nil {
		managementFailure(w, err)
		return
	}
	rows := make([]map[string]any, 0, len(all))
	for _, d := range all {
		resource := "device:" + d.Key
		sources := []store.Policy{}
		for _, p := range policies {
			if p.SubjectKind == kind && p.SubjectID == id && acl.Match(p.Resource, resource) {
				sources = append(sources, p)
			}
		}
		rows = append(rows, map[string]any{"device": d, "read": az.Can(subject, resource, "read"), "control": az.Can(subject, resource, "control"), "sources": sources, "grantable": map[string]bool{"read": s.acl.Can(actor, resource, "read"), "control": s.acl.Can(actor, resource, "control")}})
	}
	writeJSON(w, 200, map[string]any{"devices": rows, "capabilities": s.capabilities(subject), "grantable_capabilities": s.capabilities(actor)})
}
func policyFor(subject store.Subject, actor store.Subject, resource, action, effect string) store.Policy {
	return store.Policy{ID: store.NewID(), SubjectKind: subject.Kind, SubjectID: subject.ID, Resource: resource, Action: action, Effect: effect, GrantedBy: actor.ID, GrantedAt: time.Now().UTC()}
}
func (s *Server) setAccess(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireCapability(w, r, "permissions")
	if !ok {
		return
	}
	var b struct {
		SubjectKind store.SubjectKind `json:"subject_kind"`
		SubjectID   store.ID          `json:"subject_id"`
		DeviceKey   string            `json:"device_key"`
		Access      string            `json:"access"`
	}
	if decode(r, &b) != nil || (b.Access != "none" && b.Access != "read" && b.Access != "control") {
		fail(w, 400, "invalid_input")
		return
	}
	subject := store.Subject{Kind: b.SubjectKind, ID: b.SubjectID}
	resource := "device:" + b.DeviceKey
	detail := map[string]any{"subject": subject, "device": b.DeviceKey, "access": b.Access}
	err := s.managementChange(r, "policy.device.set", detail, func(tx store.Store) error {
		if err := validateSubject(r.Context(), tx, b.SubjectKind, b.SubjectID); err != nil {
			return err
		}
		if _, err := tx.Devices().Get(r.Context(), b.DeviceKey); err != nil {
			return err
		}
		// Freeze authorization before any edits, including edits to ourselves.
		before, _, err := candidateACL(r.Context(), tx)
		if err != nil {
			return err
		}
		canRead := before.Can(actor, resource, "read")
		canControl := before.Can(actor, resource, "control")
		if !canRead || (!canControl && (b.Access == "control" || before.Can(subject, resource, "control"))) {
			return errForbidden
		}
		current, err := tx.Policies().ListBySubject(r.Context(), b.SubjectKind, b.SubjectID)
		if err != nil {
			return err
		}
		for _, p := range current {
			if p.Resource == resource && (p.Action == "read" || p.Action == "control" || p.Action == "*") {
				// A read-only manager must leave control policies untouched.
				if p.Action == "control" && !canControl {
					continue
				}
				if !before.Can(actor, p.Resource, p.Action) {
					return errForbidden
				}
				if err := tx.Policies().Delete(r.Context(), p.ID); err != nil {
					return err
				}
			}
		}
		rules := []store.Policy{}
		if b.Access == "none" {
			rules = append(rules, policyFor(subject, actor, resource, "read", "deny"))
		}
		if b.Access == "read" {
			rules = append(rules, policyFor(subject, actor, resource, "read", "allow"))
		}
		if b.Access != "control" && canControl {
			rules = append(rules, policyFor(subject, actor, resource, "control", "deny"))
		}
		if b.Access == "control" {
			rules = append(rules, policyFor(subject, actor, resource, "control", "allow"))
		}
		for _, p := range rules {
			p := p
			if err := tx.Policies().Insert(r.Context(), &p); err != nil {
				return err
			}
		}
		az, _, err := candidateACL(r.Context(), tx)
		if err != nil {
			return err
		}
		if az.Can(subject, resource, "read") != (b.Access != "none") || az.Can(subject, resource, "control") != (b.Access == "control") {
			return errConflictingRules
		}
		detail["policies"] = rules
		return nil
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

var errConflictingRules = errors.New("conflicting_rules")

func (s *Server) setCapabilities(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireCapability(w, r, "permissions")
	if !ok {
		return
	}
	var b struct {
		SubjectID    store.ID        `json:"subject_id"`
		Capabilities map[string]bool `json:"capabilities"`
	}
	if decode(r, &b) != nil || len(b.Capabilities) == 0 {
		fail(w, 400, "invalid_input")
		return
	}
	for key := range b.Capabilities {
		if _, ok := managementCapabilities[key]; !ok {
			fail(w, 400, "invalid_input")
			return
		}
	}
	subject := store.Subject{Kind: store.KindUser, ID: b.SubjectID}
	detail := map[string]any{"subject": subject, "capabilities": b.Capabilities}
	err := s.managementChange(r, "policy.capabilities.set", detail, func(tx store.Store) error {
		if err := validateSubject(r.Context(), tx, subject.Kind, subject.ID); err != nil {
			return err
		}
		old, err := tx.Policies().ListBySubject(r.Context(), subject.Kind, subject.ID)
		if err != nil {
			return err
		}
		before, _, err := candidateACL(r.Context(), tx)
		if err != nil {
			return err
		}
		rules := []store.Policy{}
		for key, enabled := range b.Capabilities {
			c := managementCapabilities[key]
			if !before.Can(actor, c.resource, c.action) {
				return errForbidden
			}
			for _, p := range old {
				if p.Resource == c.resource && p.Action == c.action {
					if err := tx.Policies().Delete(r.Context(), p.ID); err != nil {
						return err
					}
				}
			}
			effect := "deny"
			if enabled {
				effect = "allow"
			}
			p := policyFor(subject, actor, c.resource, c.action, effect)
			rules = append(rules, p)
			if err := tx.Policies().Insert(r.Context(), &p); err != nil {
				return err
			}
		}
		az, _, err := candidateACL(r.Context(), tx)
		if err != nil {
			return err
		}
		for key, want := range b.Capabilities {
			c := managementCapabilities[key]
			if az.Can(subject, c.resource, c.action) != want {
				return errConflictingRules
			}
		}
		detail["policies"] = rules
		return nil
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
