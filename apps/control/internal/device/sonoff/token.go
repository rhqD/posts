package sonoff

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// RefreshToken keeps a CoolKit access token alive without re-login.
//
// The login endpoint needs an HMAC over the exact request bytes with a key the
// vendor never published, so we never do it. Instead we start from an at/rt
// pair and renew with /v2/user/refresh, which only needs a bearer plus the
// refresh token in X-CK-Session.
type RefreshToken struct {
	base string
	hc   *http.Client

	// onRefresh persists a rotated pair. Best effort: a failure here must not
	// break the call that triggered the renewal.
	onRefresh func(at, rt string)

	mu      sync.Mutex
	at      string
	rt      string
	stale   bool
	lastErr error
}

// SetOnRefresh registers a persistence callback for rotated credentials.
func (r *RefreshToken) SetOnRefresh(fn func(at, rt string)) {
	r.mu.Lock()
	r.onRefresh = fn
	r.mu.Unlock()
}

func NewRefreshToken(base, at, rt string) *RefreshToken {
	return &RefreshToken{
		base:  base,
		hc:    &http.Client{Timeout: 10 * time.Second},
		at:    at,
		rt:    rt,
		stale: false,
	}
}

func (r *RefreshToken) Token(ctx context.Context) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.at == "" {
		return "", fmt.Errorf("sonoff: no access token configured")
	}
	if !r.stale {
		return r.at, nil
	}
	if err := r.refreshLocked(ctx); err != nil {
		r.lastErr = err
		// Keep serving the old token: a refresh hiccup should not turn every
		// device call into a hard failure while the token may still work.
		return r.at, nil
	}
	return r.at, nil
}

// Invalidate marks the current token as suspect; the next Token call renews it.
func (r *RefreshToken) Invalidate() {
	r.mu.Lock()
	r.stale = true
	r.mu.Unlock()
}

func (r *RefreshToken) refreshLocked(ctx context.Context) error {
	if r.rt == "" {
		return fmt.Errorf("sonoff: no refresh token configured")
	}
	body, _ := json.Marshal(map[string]string{"rt": r.rt})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.base+"/v2/user/refresh", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.at)
	req.Header.Set("X-CK-Session", r.rt)
	req.Header.Set("X-CK-Appid", AppID)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}

	var env struct {
		Error int    `json:"error"`
		Msg   string `json:"msg"`
		Data  struct {
			At string `json:"at"`
			Rt string `json:"rt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("sonoff: refresh decode: %w", err)
	}
	if env.Error != 0 || env.Data.At == "" {
		return fmt.Errorf("sonoff: refresh failed (%d %s) — the refresh token is probably dead", env.Error, env.Msg)
	}

	r.at = env.Data.At
	if env.Data.Rt != "" {
		r.rt = env.Data.Rt // CoolKit rotates it
	}
	r.stale = false
	r.lastErr = nil

	// Persist outside the lock so a slow write cannot stall other callers.
	if r.onRefresh != nil {
		at, rt, hook := r.at, r.rt, r.onRefresh
		go hook(at, rt)
	}
	return nil
}

// Err exposes the last refresh failure for /admin/status.
func (r *RefreshToken) Err() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.lastErr
}
