package sonoff_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"renhanquan/control/internal/device/sonoff"
)

func TestRefreshRenewsAccessToken(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/user/refresh" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		hits.Add(1)
		if got := r.Header.Get("X-CK-Session"); got != "rt-old" {
			http.Error(w, "bad session", http.StatusBadRequest)
			return
		}
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		if body["rt"] != "rt-old" {
			http.Error(w, "bad rt", http.StatusBadRequest)
			return
		}
		io.WriteString(w, `{"error":0,"data":{"at":"at-new","rt":"rt-new"}}`)
	}))
	defer srv.Close()

	tok := sonoff.NewRefreshToken(srv.URL, "at-old", "rt-old")
	ctx := context.Background()

	if got, _ := tok.Token(ctx); got != "at-old" {
		t.Fatalf("initial token = %q", got)
	}
	if hits.Load() != 0 {
		t.Fatal("must not refresh while the token is fresh")
	}

	tok.Invalidate()
	got, err := tok.Token(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got != "at-new" {
		t.Fatalf("after refresh token = %q, want at-new", got)
	}
	if hits.Load() != 1 {
		t.Fatalf("refresh calls = %d, want 1", hits.Load())
	}

	// A second call must reuse the renewed token, not refresh again.
	if _, _ = tok.Token(ctx); hits.Load() != 1 {
		t.Fatalf("unexpected extra refresh: %d", hits.Load())
	}
}

func TestRefreshFailureKeepsOldToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"error":10018,"msg":"refresh token expired"}`)
	}))
	defer srv.Close()

	tok := sonoff.NewRefreshToken(srv.URL, "at-old", "rt-dead")
	tok.Invalidate()
	got, err := tok.Token(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got != "at-old" {
		t.Fatalf("token = %q, want the old one to keep working", got)
	}
	if tok.Err() == nil {
		t.Fatal("the failure should be recorded for status")
	}
}
