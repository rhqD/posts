package api

import (
	"context"
	"reflect"
	"renhanquan/control/internal/store"
	"testing"
	"time"
)

func TestLimitedManagerCannotRevokeUnownedCapabilities(t *testing.T) {
	f, root, _ := managementFixture(t)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "alice", "capabilities": map[string]bool{"permissions": true}}), 200)
	// Activate the second manager so last-manager protection cannot mask the bug.
	u, _ := f.st.Users().Get(context.Background(), "alice")
	now := time.Now()
	u.ActivatedAt = &now
	if err := f.st.Users().Update(context.Background(), u); err != nil {
		t.Fatal(err)
	}
	actor := f.session(t, "alice")
	for _, target := range []string{"root", "bob"} {
		for _, enabled := range []bool{false, true} {
			w := callManagement(f, actor, "PUT", "/admin/capabilities", map[string]any{"subject_id": target, "capabilities": map[string]bool{"users": enabled, "devices": enabled, "audit": enabled, "permissions": false}})
			requireStatus(t, w, 403)
		}
	}
	requireStatus(t, callManagement(f, root, "GET", "/admin/users", nil), 200)
	requireStatus(t, callManagement(f, root, "GET", "/admin/policies", nil), 200)
}

func TestReadOnlyManagerPreservesControlRules(t *testing.T) {
	f, root, _ := managementFixture(t)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "alice", "capabilities": map[string]bool{"permissions": true}}), 200)
	set := func(actor *store.Session, subject, access string) {
		t.Helper()
		requireStatus(t, callManagement(f, actor, "PUT", "/admin/access", map[string]any{"subject_kind": "user", "subject_id": subject, "device_key": "a", "access": access}), 200)
	}
	set(root, "alice", "read")
	actor := f.session(t, "alice")
	// A read-only manager can grant/revoke read, without inserting control denies.
	set(actor, "bob", "read")
	set(actor, "bob", "none")
	rules, _ := f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	for _, p := range rules {
		if p.Action != "read" {
			t.Fatalf("unowned policy changed: %+v", p)
		}
	}
	set(root, "bob", "control")
	before, _ := f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	for _, level := range []string{"none", "read", "control"} {
		requireStatus(t, callManagement(f, actor, "PUT", "/admin/access", map[string]any{"subject_kind": "user", "subject_id": "bob", "device_key": "a", "access": level}), 403)
	}
	after, _ := f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	if !reflect.DeepEqual(before, after) {
		t.Fatal("rejected downgrade mutated policies")
	}
	// Raw grant/revoke endpoints enforce the same boundary.
	requireStatus(t, callManagement(f, actor, "POST", "/admin/policies", map[string]any{"subject_kind": "user", "subject_id": "bob", "resource": "device:a", "action": "control", "effect": "deny"}), 403)
	requireStatus(t, callManagement(f, actor, "DELETE", "/admin/policies/"+string(before[0].ID), nil), 403)
	set(root, "bob", "read")
	rules, _ = f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	var denyID store.ID
	for _, p := range rules {
		if p.Action == "control" {
			denyID = p.ID
		}
	}
	set(actor, "bob", "none")
	set(actor, "bob", "read")
	rules, _ = f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	found := false
	for _, p := range rules {
		if p.ID == denyID && p.Effect == "deny" {
			found = true
		}
	}
	if !found {
		t.Fatal("read-only manager replaced control denial")
	}
}

func TestNoDevicePermissionCannotDenyAndWildcardRulesRemainIntact(t *testing.T) {
	f, root, _ := managementFixture(t)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "alice", "capabilities": map[string]bool{"permissions": true}}), 200)
	actor := f.session(t, "alice")
	body := map[string]any{"subject_kind": "user", "subject_id": "bob", "device_key": "a", "access": "none"}
	requireStatus(t, callManagement(f, actor, "PUT", "/admin/access", body), 403)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", map[string]any{"subject_kind": "user", "subject_id": "alice", "device_key": "a", "access": "control"}), 200)
	p := store.Policy{ID: "wild", SubjectKind: store.KindUser, SubjectID: "bob", Resource: "device:a", Action: "*", Effect: "allow"}
	if err := f.st.Policies().Insert(context.Background(), &p); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, callManagement(f, actor, "PUT", "/admin/access", body), 403)
	rules, _ := f.st.Policies().ListBySubject(context.Background(), store.KindUser, "bob")
	if len(rules) != 1 || rules[0].ID != "wild" {
		t.Fatal("wildcard rule was removed")
	}
}
