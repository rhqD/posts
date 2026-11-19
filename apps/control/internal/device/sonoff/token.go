package sonoff

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// Credentials is kept in the encrypted parameter, including the signing key
// needed when an expired bearer is rejected by the refresh endpoint itself.
// AppSecret is configured privately, never built into the binary.
type Credentials struct {
	At          string    `json:"at"`
	Rt          string    `json:"rt"`
	AppSecret   string    `json:"app_secret,omitempty"`
	RefreshedAt time.Time `json:"refreshed_at,omitempty"`
}

// RefreshToken serializes rotation and durable writeback. If persistence fails,
// the same new pair is retried before any further rotation or use.
type RefreshToken struct {
	base       string
	hc         *http.Client
	mu         sync.Mutex
	value      Credentials
	onRefresh  func(context.Context, Credentials) error
	stale      bool
	dirty      bool
	retryAfter time.Time
	lastErr    error
}

func NewRefreshToken(base string, value Credentials) *RefreshToken {
	return &RefreshToken{base: base, value: value, hc: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (r *RefreshToken) SetOnRefresh(fn func(context.Context, Credentials) error) {
	r.mu.Lock()
	r.onRefresh = fn
	r.mu.Unlock()
}

func (r *RefreshToken) persistLocked(ctx context.Context) error {
	if !r.dirty {
		return nil
	}
	if r.onRefresh != nil {
		if err := r.onRefresh(ctx, r.value); err != nil {
			r.lastErr = errors.New("sonoff: rotated credential persistence failed")
			return r.lastErr
		}
	}
	r.dirty = false
	r.retryAfter = time.Time{}
	r.lastErr = nil
	return nil
}

func (r *RefreshToken) Token(ctx context.Context) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.value.At == "" {
		return "", errors.New("sonoff: no access token configured")
	}
	if err := r.persistLocked(ctx); err != nil {
		return "", err
	}
	// Renew ahead of the documented 30-day lifetime. The invalidation path is
	// still required for server-side revocation and older credentials without a date.
	due := !r.value.RefreshedAt.IsZero() && time.Since(r.value.RefreshedAt) >= 20*24*time.Hour
	if !r.stale && !due {
		return r.value.At, nil
	}
	if time.Now().Before(r.retryAfter) {
		if r.stale {
			return "", r.lastErr
		}
		return r.value.At, nil
	}
	if err := r.refreshLocked(ctx); err != nil {
		r.lastErr = err
		r.retryAfter = time.Now().Add(time.Minute)
		if r.stale || r.dirty {
			return "", err
		}
		// An early renewal transport failure need not discard a valid bearer.
		return r.value.At, nil
	}
	return r.value.At, nil
}

// Invalidate marks a token explicitly rejected by the vendor. It must not be
// served again on a refresh failure; callers need the actual renewal error.
func (r *RefreshToken) Invalidate() { r.mu.Lock(); r.stale = true; r.mu.Unlock() }

func (r *RefreshToken) refreshLocked(ctx context.Context) error {
	if r.value.Rt == "" {
		return errors.New("sonoff: no refresh token configured")
	}
	body, _ := json.Marshal(map[string]string{"rt": r.value.Rt})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.base+"/v2/user/refresh", bytes.NewReader(body))
	if err != nil {
		return errors.New("sonoff: invalid refresh endpoint")
	}
	if r.value.AppSecret != "" {
		mac := hmac.New(sha256.New, []byte(r.value.AppSecret))
		mac.Write(body)
		req.Header.Set("Authorization", "Sign "+base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	} else {
		// Compatibility with a still-valid bearer. Signed refresh is needed if the
		// endpoint rejects an expired bearer (402) before checking the refresh token.
		req.Header.Set("Authorization", "Bearer "+r.value.At)
	}
	req.Header.Set("X-CK-Appid", AppID)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.hc.Do(req)
	if err != nil {
		return errors.New("sonoff: refresh transport failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sonoff: refresh HTTP %d", resp.StatusCode)
	}
	var env struct {
		Error *int `json:"error"`
		Data  struct {
			At string `json:"at"`
			Rt string `json:"rt"`
		} `json:"data"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&env) != nil || env.Error == nil {
		return errors.New("sonoff: invalid refresh response")
	}
	if *env.Error != 0 {
		if *env.Error == 402 && r.value.AppSecret == "" {
			return errors.New("sonoff: refresh rejected expired bearer (402); configure app_secret for signed renewal")
		}
		return fmt.Errorf("sonoff: refresh rejected (%d)", *env.Error)
	}
	if env.Data.At == "" || env.Data.Rt == "" {
		return errors.New("sonoff: incomplete refreshed credential pair")
	}
	r.value.At, r.value.Rt = env.Data.At, env.Data.Rt
	r.value.RefreshedAt = time.Now().UTC()
	r.stale = false
	r.dirty = true
	r.retryAfter = time.Time{}
	return r.persistLocked(ctx)
}

func (r *RefreshToken) Err() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.lastErr
}
func (r *RefreshToken) Status() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := map[string]any{"signed_refresh": r.value.AppSecret != "", "persist_pending": r.dirty, "refreshed_at": r.value.RefreshedAt}
	if r.lastErr != nil {
		s["last_error"] = r.lastErr.Error()
	}
	return s
}
