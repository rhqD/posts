package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/store"
)

type failingSessionTx struct{ store.Store }

func (s failingSessionTx) Tx(context.Context, func(store.Store) error) error {
	return errors.New("simulated storage failure")
}
func TestLogoutFailureKeepsCookieAndReturnsFailure(t *testing.T) {
	f := newEventFixture(t)
	session := f.session(t, "alice")
	f.api.sessions = auth.NewSessions(failingSessionTx{f.st}, time.Hour)
	f.api.cfg.AllowedOrigins = []string{trustedOrigin}
	al, err := audit.New(f.st)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(al.Close)
	f.api.audit = al
	req := httptest.NewRequest("POST", "/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "sid", Value: string(session.ID)})
	req.Header.Set("Origin", trustedOrigin)
	req.Header.Set("X-CSRF-Protection", "1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	f.api.Handler().ServeHTTP(w, req)
	if w.Code != 500 {
		t.Fatalf("logout claimed success: %d", w.Code)
	}
	if len(w.Result().Cookies()) != 0 {
		t.Fatal("cleared cookie despite failed revocation")
	}
	if _, _, err := f.sessions.Resolve(context.Background(), session.ID); err != nil {
		t.Fatal("failed revocation changed session")
	}
}
