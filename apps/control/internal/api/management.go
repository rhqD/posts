package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"net/http"
	"regexp"
	"strings"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/store"
)

type capability struct{ resource, action string }

var managementCapabilities = map[string]capability{
	"users": {"user:*", "manage"}, "devices": {"device:*", "manage"}, "permissions": {"policy:*", "grant"}, "audit": {"audit:*", "read"},
}

func (s *Server) capabilities(subject store.Subject) map[string]bool {
	out := map[string]bool{}
	for key, c := range managementCapabilities {
		out[key] = s.acl.Can(subject, c.resource, c.action)
	}
	return out
}
func (s *Server) requireCapability(w http.ResponseWriter, r *http.Request, key string) (store.Subject, bool) {
	subject, u := s.subject(r)
	c := managementCapabilities[key]
	if u == nil || !s.acl.Can(subject, c.resource, c.action) {
		if s.audit != nil {
			s.record(r, subject, audit.KindDeny, audit.ResultDenied, map[string]any{"path": r.URL.Path, "capability": key})
		}
		fail(w, 403, "forbidden")
		return subject, false
	}
	return subject, true
}
func (s *Server) managementRoutes(m *http.ServeMux) {
	m.HandleFunc("GET /admin/users", s.listUsers)
	m.HandleFunc("POST /admin/users", s.createUser)
	m.HandleFunc("PATCH /admin/users/{id}", s.updateUser)
	m.HandleFunc("POST /admin/users/{id}/revoke-sessions", s.revokeUserSessions)
	m.HandleFunc("GET /admin/subjects", s.listSubjects)
	m.HandleFunc("GET /admin/devices", s.adminDevices)
	m.HandleFunc("PATCH /admin/devices/{key}", s.updateDevice)
	m.HandleFunc("POST /admin/devices/sync", s.syncManagedDevices)
	m.HandleFunc("GET /admin/access", s.accessSummary)
	m.HandleFunc("PUT /admin/access", s.setAccess)
	m.HandleFunc("PUT /admin/capabilities", s.setCapabilities)
	m.HandleFunc("PATCH /auth/profile", s.updateProfile)
}

// Changes are serialized with last-administrator checks. The complete change
// intent is durably audited BEFORE the atomic state commit. Failed audit means
// no state mutation. A crash between intent and outcome is distinguishable by
// the operation id and the committed state, rather than an unaudited grant.
func (s *Server) managementChange(r *http.Request, kind string, details map[string]any, fn func(store.Store) error) error {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	subject, u := s.subject(r)
	if u == nil {
		return errForbidden
	}
	capKey := "permissions"
	if strings.HasPrefix(kind, "user.") {
		capKey = "users"
	}
	if strings.HasPrefix(kind, "device.") {
		capKey = "devices"
	}
	if kind != "user.profile" {
		c := managementCapabilities[capKey]
		if !s.acl.Can(subject, c.resource, c.action) {
			return errForbidden
		}
	}
	before, err := managerCount(r.Context(), s.st)
	if err != nil {
		return err
	}
	operation := string(store.NewID())
	details["operation"] = operation
	err = s.st.Tx(r.Context(), func(tx store.Store) error {
		if err := fn(tx); err != nil {
			return err
		}
		next, err := managerCount(r.Context(), tx)
		if err != nil {
			return err
		}
		if before > 0 && next == 0 {
			return errLastManager
		}
		if s.audit == nil {
			return fmt.Errorf("audit unavailable")
		}
		return s.audit.RecordSync(r.Context(), store.Entry{Kind: kind, Actor: subject, IP: clientIP(r), UA: userAgent(r), Result: "pending", Detail: details})
	})
	if err != nil {
		if s.audit != nil {
			s.record(r, subject, kind, audit.ResultFailed, map[string]any{"operation": operation})
		}
		return err
	}
	if err := s.reloadACL(r); err != nil {
		return err
	}
	s.record(r, subject, kind, audit.ResultOK, map[string]any{"operation": operation})
	return nil
}
func managerCount(ctx context.Context, st store.Store) (int, error) {
	policies, err := st.Policies().ListAll(ctx)
	if err != nil {
		return 0, err
	}
	az := acl.New()
	az.Load(policies)
	users, err := st.Users().List(ctx)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, u := range users {
		if !u.Disabled() && u.ActivatedAt != nil && az.Can(store.UserSubject(u), "policy:*", "grant") {
			n++
		}
	}
	return n, nil
}

var errForbidden = errors.New("forbidden")
var errLastManager = errors.New("last_manager")
var errInvalid = errors.New("invalid_input")

func managementFailure(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		fail(w, 403, "forbidden")
	case errors.Is(err, store.ErrNotFound):
		fail(w, 404, "not_found")
	case errors.Is(err, errConflictingRules):
		fail(w, 409, "conflicting_rules")
	case errors.Is(err, store.ErrConflict):
		fail(w, 409, "already_exists")
	case errors.Is(err, errLastManager):
		fail(w, 409, "last_manager")
	case errors.Is(err, errInvalid):
		fail(w, 400, "invalid_input")
	default:
		fail(w, 500, "change_failed")
	}
}
func userPayload(u *store.User) map[string]any {
	return map[string]any{"id": u.ID, "name": u.Name, "phone": store.MaskPhone(u.Phone), "role": u.Role, "builtin": true, "avatar": u.Avatar, "activated": u.ActivatedAt != nil, "activated_at": u.ActivatedAt, "created_at": u.CreatedAt, "disabled": u.Disabled(), "disabled_at": u.DisabledAt}
}
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "users"); !ok {
		return
	}
	users, err := s.st.Users().List(r.Context())
	if err != nil {
		managementFailure(w, err)
		return
	}
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		out = append(out, userPayload(u))
	}
	writeJSON(w, 200, map[string]any{"users": out})
}
func (s *Server) listSubjects(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "permissions"); !ok {
		return
	}
	users, err := s.st.Users().List(r.Context())
	if err != nil {
		managementFailure(w, err)
		return
	}
	out := make([]map[string]any, 0, len(users))
	for _, u := range users {
		out = append(out, userPayload(u))
	}
	writeJSON(w, 200, map[string]any{"users": out})
}

var validPhone = regexp.MustCompile(`^\+?[0-9]{7,15}$`)

func cleanAvatar(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	if len(value) > 180000 {
		return "", errInvalid
	}
	head, encoded, ok := strings.Cut(value, ",")
	if !ok || (head != "data:image/jpeg;base64" && head != "data:image/png;base64") {
		return "", errInvalid
	}
	b, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", errInvalid
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || cfg.Width > 512 || cfg.Height > 512 || cfg.Width < 1 || cfg.Height < 1 {
		return "", errInvalid
	}
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return "", errInvalid
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 85}); err != nil {
		return "", errInvalid
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(out.Bytes()), nil
}
func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "users"); !ok {
		return
	}
	var b struct {
		Name   string `json:"name"`
		Phone  string `json:"phone"`
		Avatar string `json:"avatar"`
	}
	if decode(r, &b) != nil {
		fail(w, 400, "bad_request")
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	b.Phone = strings.TrimSpace(b.Phone)
	if b.Name == "" || len(b.Name) > 100 || !validPhone.MatchString(b.Phone) {
		fail(w, 400, "invalid_input")
		return
	}
	avatar, err := cleanAvatar(b.Avatar)
	if err != nil {
		managementFailure(w, err)
		return
	}
	u := &store.User{ID: store.NewID(), Phone: b.Phone, Name: b.Name, Role: "member", Builtin: true, Avatar: avatar, CreatedAt: time.Now().UTC()}
	err = s.managementChange(r, "user.create", map[string]any{"user": u.ID, "name": u.Name, "phone": store.MaskPhone(u.Phone)}, func(tx store.Store) error { return tx.Users().Create(r.Context(), u) })
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 201, userPayload(u))
}
func dropUserSessions(ctx context.Context, st store.Store, id store.ID) error {
	all, err := st.Sessions().List(ctx)
	if err != nil {
		return err
	}
	for _, sess := range all {
		if sess.UserID == id {
			if err := st.Sessions().Delete(ctx, sess.ID); err != nil {
				return err
			}
		}
	}
	return nil
}
func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "users"); !ok {
		return
	}
	var b struct {
		Name     *string `json:"name"`
		Avatar   *string `json:"avatar"`
		Disabled *bool   `json:"disabled"`
	}
	if decode(r, &b) != nil {
		fail(w, 400, "bad_request")
		return
	}
	var result *store.User
	err := s.managementChange(r, "user.update", map[string]any{"user": r.PathValue("id"), "disabled": b.Disabled, "name": b.Name, "avatar_changed": b.Avatar != nil}, func(tx store.Store) error {
		u, err := tx.Users().Get(r.Context(), store.ID(r.PathValue("id")))
		if err != nil {
			return err
		}
		if b.Name != nil {
			u.Name = strings.TrimSpace(*b.Name)
			if u.Name == "" || len(u.Name) > 100 {
				return errInvalid
			}
		}
		if b.Avatar != nil {
			u.Avatar, err = cleanAvatar(*b.Avatar)
			if err != nil {
				return err
			}
		}
		if b.Disabled != nil {
			if *b.Disabled {
				now := time.Now().UTC()
				u.DisabledAt = &now
			} else {
				u.DisabledAt = nil
			}
			if err := dropUserSessions(r.Context(), tx, u.ID); err != nil {
				return err
			}
		}
		result = u
		return tx.Users().Update(r.Context(), u)
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, userPayload(result))
}
func (s *Server) revokeUserSessions(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "users"); !ok {
		return
	}
	id := store.ID(r.PathValue("id"))
	err := s.managementChange(r, "user.sessions.revoke", map[string]any{"user": id}, func(tx store.Store) error {
		if _, err := tx.Users().Get(r.Context(), id); err != nil {
			return err
		}
		return dropUserSessions(r.Context(), tx, id)
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}
func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	_, u := s.subject(r)
	if u == nil {
		fail(w, 401, "unauthorized")
		return
	}
	var b struct {
		Name   *string `json:"name"`
		Avatar *string `json:"avatar"`
	}
	if decode(r, &b) != nil {
		fail(w, 400, "bad_request")
		return
	}
	err := s.managementChange(r, "user.profile", map[string]any{"user": u.ID, "avatar_changed": b.Avatar != nil}, func(tx store.Store) error {
		current, err := tx.Users().Get(r.Context(), u.ID)
		if err != nil {
			return err
		}
		if b.Name != nil {
			current.Name = strings.TrimSpace(*b.Name)
			if current.Name == "" || len(current.Name) > 100 {
				return errInvalid
			}
		}
		if b.Avatar != nil {
			current.Avatar, err = cleanAvatar(*b.Avatar)
			if err != nil {
				return err
			}
		}
		u = current
		return tx.Users().Update(r.Context(), u)
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, s.mePayload(u))
}
func (s *Server) adminDevices(w http.ResponseWriter, r *http.Request) {
	subject, u := s.subject(r)
	caps := s.capabilities(subject)
	if u == nil || (!caps["devices"] && !caps["permissions"]) {
		fail(w, 403, "forbidden")
		return
	}
	all, err := s.st.Devices().List(r.Context())
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"devices": all})
}
func (s *Server) updateDevice(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireCapability(w, r, "devices"); !ok {
		return
	}
	var b struct {
		Name   *string `json:"name"`
		Room   *string `json:"room"`
		Hidden *bool   `json:"hidden"`
	}
	if decode(r, &b) != nil {
		fail(w, 400, "bad_request")
		return
	}
	var result *store.Device
	err := s.managementChange(r, "device.update", map[string]any{"device": r.PathValue("key"), "name": b.Name, "room": b.Room, "hidden": b.Hidden}, func(tx store.Store) error {
		d, err := tx.Devices().Get(r.Context(), r.PathValue("key"))
		if err != nil {
			return err
		}
		if b.Name != nil {
			d.Name = strings.TrimSpace(*b.Name)
			if d.Name == "" || len(d.Name) > 100 {
				return errInvalid
			}
		}
		if b.Room != nil {
			d.Room = strings.TrimSpace(*b.Room)
			if len(d.Room) > 100 {
				return errInvalid
			}
		}
		if b.Hidden != nil {
			d.Hidden = *b.Hidden
		}
		result = d
		return tx.Devices().Upsert(r.Context(), d)
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (s *Server) syncManagedDevices(w http.ResponseWriter, r *http.Request) {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	subj, ok := s.requireCapability(w, r, "devices")
	if !ok {
		return
	}
	if s.audit == nil || s.audit.RecordSync(r.Context(), store.Entry{Kind: "device.sync", Actor: subj, IP: clientIP(r), Result: "pending"}) != nil {
		fail(w, 500, "audit_unavailable")
		return
	}
	if err := device.Sync(r.Context(), s.st, s.provider); err != nil {
		s.record(r, subj, "device.sync", audit.ResultFailed, nil)
		fail(w, 502, "sync_failed")
		return
	}
	s.record(r, subj, "device.sync", audit.ResultOK, nil)
	writeJSON(w, 200, map[string]any{"ok": true})
}
