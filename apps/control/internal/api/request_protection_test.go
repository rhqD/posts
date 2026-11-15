package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"renhanquan/control/internal/audit"
)

const trustedOrigin = "https://www.renhanquan.com"

func TestWriteProtection(t *testing.T) {
	for _, tc := range []struct {
		name, origin, csrf, contentType string
		want                            int
	}{
		{"valid", trustedOrigin, "1", "application/json", 204},
		{"charset", trustedOrigin, "1", "application/json; charset=utf-8", 204},
		{"missing origin", "", "1", "application/json", 403},
		{"opaque origin", "null", "1", "application/json", 403},
		{"foreign origin", "https://attacker.example", "1", "application/json", 403},
		{"suffix attack", "https://www.renhanquan.com.attacker.example", "1", "application/json", 403},
		{"sibling subdomain", "https://other.renhanquan.com", "1", "application/json", 403},
		{"userinfo attack", "https://www.renhanquan.com@attacker.example", "1", "application/json", 403},
		{"path origin", trustedOrigin + "/", "1", "application/json", 403},
		{"different port", trustedOrigin + ":8443", "1", "application/json", 403},
		{"missing csrf", trustedOrigin, "", "application/json", 403},
		{"wrong csrf", trustedOrigin, "true", "application/json", 403},
		{"missing type", trustedOrigin, "1", "", 415},
		{"form type", trustedOrigin, "1", "application/x-www-form-urlencoded", 415},
		{"text form", trustedOrigin, "1", "text/plain", 415},
		{"multipart form", trustedOrigin, "1", "multipart/form-data; boundary=test", 415},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: Config{AllowedOrigins: []string{trustedOrigin}}}
			calls := 0
			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls++; w.WriteHeader(204) })
			req := httptest.NewRequest("POST", "/devices/a/commands", strings.NewReader(`{"action":"set_switch"}`))
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("X-CSRF-Protection", tc.csrf)
			req.Header.Set("Content-Type", tc.contentType)
			w := httptest.NewRecorder()
			s.withCORS(s.withWriteProtection(next)).ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status=%d, want %d: %s", w.Code, tc.want, w.Body.String())
			}
			wantCalls := 0
			if tc.want == 204 {
				wantCalls = 1
			}
			if calls != wantCalls {
				t.Fatalf("blocked request reached handler: %d calls", calls)
			}
			if tc.origin != trustedOrigin && w.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("CORS allowed untrusted origin")
			}
		})
	}
}

func TestCORSPreflightIsRestricted(t *testing.T) {
	for _, tc := range []struct {
		name, origin, method, headers string
		want                          int
	}{
		{"valid", trustedOrigin, "POST", "content-type,x-csrf-protection", 204},
		{"delete", trustedOrigin, "DELETE", "X-CSRF-Protection, Content-Type", 204},
		{"read", trustedOrigin, "GET", "", 204},
		{"no origin", "", "POST", "content-type", 403},
		{"foreign", "https://attacker.example", "POST", "content-type,x-csrf-protection", 403},
		{"unsupported method", trustedOrigin, "TRACE", "content-type", 403},
		{"missing method", trustedOrigin, "", "", 403},
		{"unsupported header", trustedOrigin, "POST", "x-not-allowed", 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: Config{AllowedOrigins: []string{trustedOrigin}}}
			next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("preflight reached handler") })
			req := httptest.NewRequest("OPTIONS", "/auth/logout", nil)
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Access-Control-Request-Method", tc.method)
			req.Header.Set("Access-Control-Request-Headers", tc.headers)
			w := httptest.NewRecorder()
			s.withCORS(next).ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status %d, want %d", w.Code, tc.want)
			}
			if tc.want == 204 && !strings.Contains(w.Header().Get("Access-Control-Allow-Headers"), "X-CSRF-Protection") {
				t.Fatal("CSRF header not allowed")
			}
		})
	}
	s := &Server{cfg: Config{AllowedOrigins: []string{"*", "null"}}}
	for _, origin := range []string{trustedOrigin, "null", "*"} {
		if s.originAllowed(origin) {
			t.Fatalf("wildcard/opaque configuration accepted %s", origin)
		}
	}
}

func TestAllWriteRoutesRequireProtection(t *testing.T) {
	f := newEventFixture(t)
	f.api.cfg.AllowedOrigins = []string{trustedOrigin}
	for _, path := range []string{"/auth/sms/send", "/auth/sms/verify", "/auth/logout", "/devices/a/commands", "/admin/policies"} {
		t.Run(path, func(t *testing.T) {
			w := httptest.NewRecorder()
			f.api.Handler().ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader(`{}`)))
			if w.Code != 403 {
				t.Fatalf("unguarded write: %s status %d", path, w.Code)
			}
		})
	}
	w := httptest.NewRecorder()
	f.api.Handler().ServeHTTP(w, httptest.NewRequest("DELETE", "/admin/policies/example", nil))
	if w.Code != 403 {
		t.Fatal("unguarded policy deletion")
	}
}

func TestCSRFDoesNotGrantDevicePermission(t *testing.T) {
	f := newEventFixture(t)
	f.api.cfg.AllowedOrigins = []string{trustedOrigin}
	al, err := audit.New(f.st)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(al.Close)
	f.api.audit = al
	req := httptest.NewRequest("POST", "/devices/a/commands", strings.NewReader(`{"action":"set_switch","params":{"value":true}}`))
	req.Header.Set("Origin", trustedOrigin)
	req.Header.Set("X-CSRF-Protection", "1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.api.Handler().ServeHTTP(w, req)
	if w.Code != 404 {
		t.Fatalf("valid CSRF headers bypassed ACL: status %d", w.Code)
	}
}

func TestReadWithoutOriginStillWorks(t *testing.T) {
	f := newEventFixture(t)
	w := httptest.NewRecorder()
	f.api.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/healthz", nil))
	if w.Code != 200 {
		t.Fatalf("read requires CSRF: %d", w.Code)
	}
}
