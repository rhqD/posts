package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/device/mock"
	"renhanquan/control/internal/store"
)

type testSMS struct{ sent, checked int }

func (s *testSMS) Name() string                       { return "test" }
func (s *testSMS) Send(context.Context, string) error { s.sent++; return nil }
func (s *testSMS) Check(_ context.Context, phone, code string) (bool, error) {
	s.checked++
	return code == "123456", nil
}
func managementFixture(t *testing.T) (*eventFixture, *store.Session, *testSMS) {
	t.Helper()
	f := newEventFixture(t)
	ctx := context.Background()
	now := time.Now().UTC()
	root := &store.User{ID: "root", Phone: "13800000001", Role: "admin", Name: "Owner", Builtin: true, CreatedAt: now, ActivatedAt: &now}
	if err := f.st.Users().Create(ctx, root); err != nil {
		t.Fatal(err)
	}
	p := store.Policy{ID: "root-policy", SubjectKind: store.KindUser, SubjectID: root.ID, Resource: "*", Action: "*", Effect: "allow"}
	if err := f.st.Policies().Insert(ctx, &p); err != nil {
		t.Fatal(err)
	}
	f.az.Load([]store.Policy{p})
	al, err := audit.New(f.st)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(al.Close)
	f.api.audit = al
	sms := &testSMS{}
	f.api.sms = sms
	f.api.provider = mock.New()
	f.api.cfg.AllowedOrigins = []string{trustedOrigin}
	return f, f.session(t, "root"), sms
}
func callManagement(f *eventFixture, sess *store.Session, method, path string, body any) *httptest.ResponseRecorder {
	var data []byte
	if body != nil {
		data, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	req.Header.Set("Origin", trustedOrigin)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Protection", "1")
	if sess != nil {
		req.AddCookie(&http.Cookie{Name: "sid", Value: string(sess.ID)})
	}
	w := httptest.NewRecorder()
	f.api.Handler().ServeHTTP(w, req)
	return w
}
func requireStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status %d, want %d: %s", w.Code, want, w.Body.String())
	}
}
func TestBuiltinUsersNoRegistrationAndFirstActivation(t *testing.T) {
	f, root, sms := managementFixture(t)
	phone := "13900000002"
	w := callManagement(f, nil, "POST", "/auth/sms/send", map[string]any{"phone": phone})
	requireStatus(t, w, 200)
	if sms.sent != 0 {
		t.Fatal("sent SMS to unknown account")
	}
	w = callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "123456"})
	requireStatus(t, w, 401)
	if sms.checked != 0 {
		t.Fatal("verified unknown account")
	}
	if _, err := f.st.Users().GetByPhone(context.Background(), phone); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("registered unknown account")
	}
	w = callManagement(f, root, "POST", "/admin/users", map[string]any{"name": "Family", "phone": phone})
	requireStatus(t, w, 201)
	var created map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created["activated"] != false || created["builtin"] != true {
		t.Fatalf("unexpected initial state %v", created)
	}
	requireStatus(t, callManagement(f, root, "POST", "/admin/users", map[string]any{"name": "Duplicate", "phone": phone}), 409)
	requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/send", map[string]any{"phone": phone}), 200)
	if sms.sent != 1 {
		t.Fatal("new builtin not admitted without restart")
	}
	requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "wrong"}), 401)
	u, _ := f.st.Users().GetByPhone(context.Background(), phone)
	if u.ActivatedAt != nil {
		t.Fatal("failed verification activated user")
	}
	w = callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "123456"})
	requireStatus(t, w, 200)
	u, _ = f.st.Users().GetByPhone(context.Background(), phone)
	if u.ActivatedAt == nil {
		t.Fatal("successful login not activated")
	}
	if len(w.Result().Cookies()) != 1 {
		t.Fatal("no session issued")
	}
}
func TestManagementRoutesRequireCapabilities(t *testing.T) {
	f, _, _ := managementFixture(t)
	member := f.session(t, "alice")
	paths := []struct {
		method, path string
		body         any
	}{{"GET", "/admin/users", nil}, {"GET", "/admin/subjects", nil}, {"GET", "/admin/devices", nil}, {"GET", "/admin/access?subject_kind=anonymous", nil}, {"POST", "/admin/users", map[string]any{}}, {"PATCH", "/admin/users/alice", map[string]any{"disabled": true}}, {"POST", "/admin/users/alice/revoke-sessions", map[string]any{}}, {"PATCH", "/admin/devices/a", map[string]any{"name": "renamed"}}, {"POST", "/admin/devices/sync", map[string]any{}}, {"PUT", "/admin/access", map[string]any{}}, {"PUT", "/admin/capabilities", map[string]any{}}}
	for _, p := range paths {
		for _, session := range []*store.Session{nil, member} {
			requireStatus(t, callManagement(f, session, p.method, p.path, p.body), 403)
		}
	}
}
func TestDisableAndEnableDoesNotRestoreSessions(t *testing.T) {
	f, root, _ := managementFixture(t)
	old := f.session(t, "alice")
	requireStatus(t, callManagement(f, root, "PATCH", "/admin/users/alice", map[string]any{"disabled": true}), 200)
	if _, _, err := f.sessions.Resolve(context.Background(), old.ID); err == nil {
		t.Fatal("disabled account session usable")
	}
	requireStatus(t, callManagement(f, root, "PATCH", "/admin/users/alice", map[string]any{"disabled": false}), 200)
	if _, _, err := f.sessions.Resolve(context.Background(), old.ID); err == nil {
		t.Fatal("re-enable restored revoked session")
	}
}
func TestLastActiveManagerProtected(t *testing.T) {
	f, root, _ := managementFixture(t)
	requireStatus(t, callManagement(f, root, "PATCH", "/admin/users/root", map[string]any{"disabled": true}), 409)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "root", "capabilities": map[string]bool{"permissions": false}}), 409)
	requireStatus(t, callManagement(f, root, "DELETE", "/admin/policies/root-policy", nil), 409)
	if _, _, err := f.sessions.Resolve(context.Background(), root.ID); err != nil {
		t.Fatal("protection revoked last manager session")
	}
	if !f.az.Can(store.Subject{Kind: store.KindUser, ID: "root"}, "policy:*", "grant") {
		t.Fatal("last manager lost permission")
	}
}
func TestDeviceAccessEffectivePermissionAndAnonymousIsolation(t *testing.T) {
	f, root, _ := managementFixture(t)
	body := map[string]any{"subject_kind": "anonymous", "subject_id": "", "device_key": "a", "access": "read"}
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", body), 200)
	if !f.az.Can(store.Anonymous(), "device:a", "read") || f.az.Can(store.Anonymous(), "device:a", "control") {
		t.Fatal("read grant broadened")
	}
	requireStatus(t, callManagement(f, nil, "GET", "/events", nil), 401)
	requireStatus(t, callManagement(f, nil, "GET", "/admin/users", nil), 403)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "", "capabilities": map[string]bool{"users": true}}), 400)
	body["access"] = "none"
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", body), 200)
	if f.az.Can(store.Anonymous(), "device:a", "read") {
		t.Fatal("revoked anonymous read still effective")
	}
}
func TestRestrictiveRuleCannotBeOverriddenSilently(t *testing.T) {
	f, root, _ := managementFixture(t)
	deny := store.Policy{ID: "deny", SubjectKind: store.KindUser, SubjectID: "alice", Resource: "device:*", Action: "read", Effect: "deny"}
	if err := f.st.Policies().Insert(context.Background(), &deny); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", map[string]any{"subject_kind": "user", "subject_id": "alice", "device_key": "a", "access": "read"}), 409)
	rules, _ := f.st.Policies().ListBySubject(context.Background(), store.KindUser, "alice")
	if len(rules) != 1 {
		t.Fatal("rejected permission change partially committed")
	}
}
func TestLimitedManagerCannotDelegateOrRemoveRootRule(t *testing.T) {
	f, root, _ := managementFixture(t)
	requireStatus(t, callManagement(f, root, "PUT", "/admin/capabilities", map[string]any{"subject_id": "alice", "capabilities": map[string]bool{"permissions": true}}), 200)
	actor := f.session(t, "alice")
	requireStatus(t, callManagement(f, actor, "PUT", "/admin/access", map[string]any{"subject_kind": "user", "subject_id": "bob", "device_key": "a", "access": "control"}), 403)
	requireStatus(t, callManagement(f, actor, "DELETE", "/admin/policies/root-policy", nil), 403)
	requireStatus(t, callManagement(f, actor, "POST", "/admin/policies", map[string]any{"subject_kind": "user", "subject_id": "bob", "resource": "*", "action": "*"}), 400)
}
func TestAvatarIsValidatedAndProfileCannotEscalate(t *testing.T) {
	f, root, _ := managementFixture(t)
	member := f.session(t, "alice")
	requireStatus(t, callManagement(f, member, "PATCH", "/auth/profile", map[string]any{"role": "admin"}), 400)
	requireStatus(t, callManagement(f, root, "PATCH", "/admin/users/alice", map[string]any{"avatar": "data:image/svg+xml;base64,PHN2Zz4="}), 400)
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	avatar := "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
	requireStatus(t, callManagement(f, member, "PATCH", "/auth/profile", map[string]any{"avatar": avatar, "name": "Member"}), 200)
	u, _ := f.st.Users().Get(context.Background(), "alice")
	if !strings.HasPrefix(u.Avatar, "data:image/jpeg;base64,") {
		t.Fatal("avatar not normalized")
	}
	if u.Role == "admin" {
		t.Fatal("profile escalated privileges")
	}
	requireStatus(t, callManagement(f, member, "GET", "/admin/users", nil), 403)
}

type failedAuditStore struct{ store.Store }
type failedAudit struct{ store.AuditStore }

func (s failedAuditStore) Audit() store.AuditStore              { return failedAudit{s.Store.Audit()} }
func (s failedAudit) Append(context.Context, store.Entry) error { return errors.New("disk full") }
func TestAuditFailurePreventsManagementCommit(t *testing.T) {
	f, root, _ := managementFixture(t)
	bad, err := audit.New(failedAuditStore{f.st})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(bad.Close)
	f.api.audit = bad
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", map[string]any{"subject_kind": "anonymous", "subject_id": "", "device_key": "a", "access": "control"}), 500)
	if f.az.Can(store.Anonymous(), "device:a", "control") {
		t.Fatal("audit failure granted access")
	}
	policies, _ := f.st.Policies().ListBySubject(context.Background(), store.KindAnonymous, "")
	if len(policies) != 0 {
		t.Fatal("audit failure persisted grant")
	}
	requireStatus(t, callManagement(f, root, "POST", "/admin/users", map[string]any{"name": "new", "phone": "13900000009"}), 500)
	if _, err := f.st.Users().GetByPhone(context.Background(), "13900000009"); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("audit failure created user")
	}
}
