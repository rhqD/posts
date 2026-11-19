package sonoff_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

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
		if got := r.Header.Get("Authorization"); got != "Bearer at-old" {
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

	tok := sonoff.NewRefreshToken(srv.URL, sonoff.Credentials{At: "at-old", Rt: "rt-old"})
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

func TestRefreshFailureDoesNotServeRejectedToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"error":10018,"msg":"refresh token expired"}`)
	}))
	defer srv.Close()

	tok := sonoff.NewRefreshToken(srv.URL, sonoff.Credentials{At: "at-old", Rt: "rt-dead"})
	tok.Invalidate()
	got, err := tok.Token(context.Background())
	if err == nil || got != "" {
		t.Fatalf("rejected token was reused: token present=%v, err=%v", got != "", err)
	}
	if tok.Err() == nil {
		t.Fatal("the failure should be recorded for status")
	}
}

func TestRefreshPersistsRotatedPair(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"error":0,"data":{"at":"at-2","rt":"rt-2"}}`)
	}))
	defer srv.Close()

	tok := sonoff.NewRefreshToken(srv.URL, sonoff.Credentials{At: "at-1", Rt: "rt-1"})
	done := make(chan [2]string, 1)
	tok.SetOnRefresh(func(_ context.Context, next sonoff.Credentials) error {
		done <- [2]string{next.At, next.Rt}
		return nil
	})

	tok.Invalidate()
	if _, err := tok.Token(context.Background()); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-done:
		if got[0] != "at-2" || got[1] != "rt-2" {
			t.Fatalf("persisted %v, want at-2/rt-2", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("refresh did not call the persistence hook")
	}
}

func TestCloud402RefreshesAndRetriesDiscoveryOnce(t *testing.T) {
	var refreshes, requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v2/user/refresh" {
			refreshes.Add(1)
			io.WriteString(w, `{"error":0,"data":{"at":"new","rt":"renewed"}}`)
			return
		}
		requests.Add(1)
		if r.Header.Get("Authorization") == "Bearer old" {
			io.WriteString(w, `{"error":402,"msg":"access token expired"}`)
			return
		}
		if r.Header.Get("Authorization") != "Bearer new" {
			t.Error("wrong renewed credential")
		}
		io.WriteString(w, `{"error":0,"data":{"thingList":[]}}`)
	}))
	defer server.Close()
	source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "old", Rt: "refresh"})
	p := sonoff.New("cn", source, sonoff.WithBaseURL(server.URL), sonoff.WithMinGap(0))
	if _, err := p.Discover(context.Background()); err != nil {
		t.Fatal(err)
	}
	if refreshes.Load() != 1 || requests.Load() != 2 {
		t.Fatalf("expected one renewal/retry, got %d/%d", refreshes.Load(), requests.Load())
	}
}
func TestPersistentCloud402HasBoundedRetry(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		io.WriteString(w, `{"error":402,"msg":"access token expired"}`)
	}))
	defer server.Close()
	p := sonoff.New("cn", sonoff.NewStaticToken("dead"), sonoff.WithBaseURL(server.URL), sonoff.WithMinGap(0))
	if _, err := p.Discover(context.Background()); err == nil {
		t.Fatal("persistent unauthorized response reported success")
	}
	if requests.Load() != 2 {
		t.Fatalf("retry not bounded: %d", requests.Load())
	}
}

// Model the production failure: an expired bearer is rejected even on the
// renewal endpoint; signed renewal must work without asking the user to log in.
func TestExpiredBearerUsesSignedRefreshAndSurvivesRestart(t *testing.T) {
	var refreshes atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v2/user/refresh" {
			if r.Header.Get("Authorization") == "Bearer expired" {
				io.WriteString(w, `{"error":402,"msg":"access token expired"}`)
			} else {
				io.WriteString(w, `{"error":0,"data":{"thingList":[]}}`)
			}
			return
		}
		refreshes.Add(1)
		raw, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte("test-client-key"))
		mac.Write(raw)
		want := "Sign " + base64.StdEncoding.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(r.Header.Get("Authorization")), []byte(want)) || r.Header.Get("X-CK-Appid") != sonoff.AppID {
			io.WriteString(w, `{"error":402}`)
			return
		}
		if string(raw) != `{"rt":"refresh-valid"}` {
			t.Error("refresh did not sign/send the exact expected payload")
		}
		io.WriteString(w, `{"error":0,"data":{"at":"renewed","rt":"rotated"}}`)
	}))
	defer server.Close()
	var saved []byte
	source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "expired", Rt: "refresh-valid", AppSecret: "test-client-key"})
	source.SetOnRefresh(func(_ context.Context, next sonoff.Credentials) error {
		var err error
		saved, err = json.Marshal(next)
		return err
	})
	p := sonoff.New("cn", source, sonoff.WithBaseURL(server.URL), sonoff.WithMinGap(0))
	if _, err := p.Discover(context.Background()); err != nil {
		t.Fatal(err)
	}
	var loaded sonoff.Credentials
	if err := json.Unmarshal(saved, &loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.AppSecret != "test-client-key" || loaded.RefreshedAt.IsZero() || loaded.Rt != "rotated" {
		t.Fatal("rotated bundle lost signing configuration or renewal metadata")
	}
	restarted := sonoff.NewRefreshToken(server.URL, loaded)
	if got, err := restarted.Token(context.Background()); err != nil || got != "renewed" || refreshes.Load() != 1 {
		t.Fatal("restart could not reuse durable credentials")
	}
}

func TestPersistenceFailureRetriesSamePairBeforeUse(t *testing.T) {
	var refreshes, writes atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		refreshes.Add(1)
		io.WriteString(w, `{"error":0,"data":{"at":"new-at","rt":"new-rt"}}`)
	}))
	defer server.Close()
	source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "old-at", Rt: "old-rt"})
	source.SetOnRefresh(func(_ context.Context, next sonoff.Credentials) error {
		if next.At != "new-at" || next.Rt != "new-rt" {
			t.Error("persistence retry used a different pair")
		}
		if writes.Add(1) == 1 {
			return errors.New("private OOS failure detail")
		}
		return nil
	})
	source.Invalidate()
	if got, err := source.Token(context.Background()); got != "" || err == nil || strings.Contains(err.Error(), "private") {
		t.Fatal("unpersisted pair was served or internal error was exposed")
	}
	if source.Status()["persist_pending"] != true {
		t.Fatal("pending persistence is not visible")
	}
	// Concurrent readers must retry writeback once, without another rotation or
	// an out-of-order asynchronous write that overwrites a newer refresh token.
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if got, err := source.Token(context.Background()); err != nil || got != "new-at" {
				t.Error("credential did not recover after successful persistence")
			}
		}()
	}
	wg.Wait()
	if refreshes.Load() != 1 || writes.Load() != 2 || source.Status()["persist_pending"] != false || source.Err() != nil {
		t.Fatal("writeback retry rotated again or left stale health")
	}
}

func TestProactiveRenewalFailureKeepsUnrejectedTokenAndBacksOff(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
		io.WriteString(w, "sensitive detail")
	}))
	defer server.Close()
	source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "still-valid", Rt: "refresh", RefreshedAt: time.Now().Add(-21 * 24 * time.Hour)})
	for range 3 {
		if got, err := source.Token(context.Background()); err != nil || got != "still-valid" {
			t.Fatal("early renewal failure discarded a token not rejected by the vendor")
		}
	}
	if requests.Load() != 1 || source.Err() == nil {
		t.Fatal("renewal failure did not back off or report health")
	}
	source.Invalidate()
	if got, err := source.Token(context.Background()); err == nil || got != "" {
		t.Fatal("explicitly rejected token was reused during refresh backoff")
	}
}

func TestPendingWritebackThenInvalidationNeverReturnsEmptySuccess(t *testing.T) {
	var refreshes, writes int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		refreshes++
		io.WriteString(w, `{"error":0,"data":{"at":"new-at","rt":"new-rt"}}`)
	}))
	defer server.Close()
	source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "old", Rt: "old-rt"})
	source.SetOnRefresh(func(context.Context, sonoff.Credentials) error {
		writes++
		if writes == 1 {
			return errors.New("temporary persistence failure")
		}
		return nil
	})
	source.Invalidate()
	if _, err := source.Token(context.Background()); err == nil {
		t.Fatal("expected initial persistence failure")
	}
	// A concurrent vendor response may invalidate a token while its new pair is
	// pending persistence. Completing that write must clear the old backoff.
	source.Invalidate()
	got, err := source.Token(context.Background())
	if err != nil || got != "new-at" || writes != 3 || refreshes != 2 {
		t.Fatalf("recovery returned unusable credential: present=%v err=%v writes=%d refreshes=%d", got != "", err, writes, refreshes)
	}
}

func TestRefreshRejectsMalformedSuccessAndRedactsVendorErrors(t *testing.T) {
	for _, body := range []string{`{"data":{"at":"injected","rt":"injected"}}`, `{"error":0,"data":{"at":"incomplete"}}`, `{"error":401,"msg":"private-refresh-token"}`} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, body) }))
			defer server.Close()
			source := sonoff.NewRefreshToken(server.URL, sonoff.Credentials{At: "old", Rt: "old-refresh"})
			source.Invalidate()
			got, err := source.Token(context.Background())
			if got != "" || err == nil || strings.Contains(err.Error(), "private-refresh-token") {
				t.Fatal("invalid success or sensitive vendor error was accepted")
			}
		})
	}
}
