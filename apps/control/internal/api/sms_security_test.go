package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSMSResponsesDoNotEnumerateAccounts(t *testing.T) {
	for _, phone := range []string{"13800000001", "13999999999", "alice"} {
		t.Run(phone, func(t *testing.T) {
			f, root, _ := managementFixture(t)
			requireStatus(t, callManagement(f, root, "PATCH", "/admin/users/alice", map[string]any{"disabled": true}), 200)
			sent := callManagement(f, nil, "POST", "/auth/sms/send", map[string]any{"phone": phone})
			requireStatus(t, sent, 200)
			cookies := sent.Result().Cookies()
			if len(cookies) != 1 || len(cookies[0].Value) != 64 || !cookies[0].HttpOnly || cookies[0].Path != "/auth/sms" {
				t.Fatal("challenge cookie contract")
			}
			for i := 0; i < 31; i++ {
				want := 401
				if i == 30 {
					want = 429
				}
				res := callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "wrong"}, cookies[0])
				requireStatus(t, res, want)
				if i < 30 && res.Body.String() != "{\"error\":\"login_failed\"}\n" {
					t.Fatal("account-dependent response")
				}
			}
		})
	}
}

func TestUnrelatedRequestsCannotConsumeSMSAttempts(t *testing.T) {
	f, _, sp := managementFixture(t)
	phone := "13800000001"
	sent := callManagement(f, nil, "POST", "/auth/sms/send", map[string]any{"phone": phone})
	challenge := sent.Result().Cookies()[0]
	for i := 0; i < 8; i++ {
		requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "wrong"}), 401)
		requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "wrong"}, &http.Cookie{Name: challenge.Name, Value: strings.Repeat("0", 64)}), 401)
	}
	if sp.checked != 0 {
		t.Fatal("unrelated requests reached SMS provider")
	}
	requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "123456"}, challenge), 200)
	requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "123456"}, challenge), 401)
	if sp.checked != 1 {
		t.Fatal("successful challenge was replayed")
	}
}

func TestSMSChallengeAttemptExpiryReplacementAndConcurrentCheck(t *testing.T) {
	c := newSMSChallenges()
	a := strings.Repeat("a", 64)
	b := strings.Repeat("b", 64)
	c.activate("phone", a)
	if c.begin("other", a) || c.begin("phone", b) {
		t.Fatal("unbound challenge accepted")
	}
	for i := 0; i < 5; i++ {
		if !c.begin("phone", a) {
			t.Fatal("missing attempt")
		}
		if c.begin("phone", a) {
			t.Fatal("parallel check accepted")
		}
		c.finish("phone", a, false)
	}
	if c.begin("phone", a) {
		t.Fatal("sixth attempt accepted")
	}
	c.activate("phone", b)
	if c.begin("phone", a) {
		t.Fatal("old challenge accepted")
	}
	c.byPhone["phone"].expires = time.Now().Add(-time.Second)
	if c.begin("phone", b) {
		t.Fatal("expired challenge accepted")
	}
	c.activate("phone", a)
	c.begin("phone", a)
	c.activate("phone", b)
	if c.finish("phone", a, true) {
		t.Fatal("in-flight old challenge accepted")
	}
	if !c.begin("phone", b) || !c.finish("phone", b, true) {
		t.Fatal("replacement challenge failed")
	}
}

type failedSMS struct{}

func (failedSMS) Name() string                       { return "failed" }
func (failedSMS) Send(context.Context, string) error { return errors.New("upstream down") }
func (failedSMS) Check(context.Context, string, string) (bool, error) {
	return false, errors.New("upstream down")
}

func TestSMSSendFailureAndThrottleDoNotRevealMembership(t *testing.T) {
	f, _, _ := managementFixture(t)
	f.api.sms = failedSMS{}
	for _, phone := range []string{"13800000001", "13800000001", "13999999999"} {
		res := callManagement(f, nil, "POST", "/auth/sms/send", map[string]any{"phone": phone})
		requireStatus(t, res, 200)
		if res.Body.String() != "{\"ok\":true}\n" || len(res.Result().Cookies()) != 1 {
			t.Fatal("send outcome revealed")
		}
		requireStatus(t, callManagement(f, nil, "POST", "/auth/sms/verify", map[string]any{"phone": phone, "code": "123456"}, res.Result().Cookies()[0]), 401)
	}
}

func TestClientIPTrustsOnlyLocalProxyLastHop(t *testing.T) {
	for _, tc := range []struct{ peer, xff, want string }{
		{"192.0.2.1:1234", "198.51.100.9", "192.0.2.1"},
		{"127.0.0.1:1234", "198.51.100.9, 192.0.2.1", "192.0.2.1"},
		{"[::1]:1234", "2001:db8::1", "2001:db8::1"},
		{"127.0.0.1:1234", "not-an-ip", "127.0.0.1"},
	} {
		req := httptest.NewRequest("POST", "/auth/sms/send", nil)
		req.RemoteAddr = tc.peer
		req.Header.Set("X-Forwarded-For", tc.xff)
		if got := clientIP(req); got != tc.want {
			t.Fatalf("%s: %s", tc.peer, got)
		}
	}
}
