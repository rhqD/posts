// Package xiaomi integrates the MIoT cloud using the independently observed
// OAuth/HTTP/MQTT protocol. It does not import Home Assistant or use LAN control.
package xiaomi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const ClientID = "2882303761520251711"

type Credentials struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Region       string `json:"region"`
	DeviceID     string `json:"device_id"`
	RedirectURL  string `json:"redirect_url"`
	ObtainedAt   int64  `json:"obtained_at"`
	ExpiresIn    int64  `json:"expires_in"`
}

func (c Credentials) Validate() error {
	if c.AccessToken == "" || c.RefreshToken == "" || c.DeviceID == "" || c.ObtainedAt <= 0 || c.ExpiresIn <= 0 {
		return errors.New("xiaomi: incomplete cloud credentials")
	}
	if _, err := apiHost(c.Region); err != nil {
		return err
	}
	u, err := url.Parse(c.RedirectURL)
	if err != nil || u.Host != "homeassistant.local:8123" || u.Scheme != "http" || u.Path == "" {
		return errors.New("xiaomi: invalid OAuth redirect identity")
	}
	return nil
}

func apiHost(region string) (string, error) {
	switch region {
	case "cn":
		return "ha.api.io.mi.com", nil
	case "de", "i2", "ru", "sg", "us":
		return region + ".ha.api.io.mi.com", nil
	}
	return "", errors.New("xiaomi: unsupported cloud region")
}

// Tokens serializes renewal and persists the complete rotated bundle before it
// is used. A failed OOS write is retried with the same bundle, never by rotating
// again; neither credentials nor query-bearing transport errors are logged.
type Tokens struct {
	mu         sync.Mutex
	value      Credentials
	hc         *http.Client
	base       string
	persist    func(context.Context, Credentials) error
	dirty      bool
	retryAfter time.Time
	lastErr    error
}

func NewTokens(c Credentials, persist func(context.Context, Credentials) error) (*Tokens, error) {
	if err := c.Validate(); err != nil {
		return nil, err
	}
	if persist == nil {
		return nil, errors.New("xiaomi: credential persistence is required")
	}
	host, _ := apiHost(c.Region)
	return &Tokens{value: c, persist: persist, base: "https://" + host, hc: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}
func (t *Tokens) Current(ctx context.Context) (Credentials, error) { return t.current(ctx, false) }

// Refresh is used by the private operator check to verify renewal + OOS writeback.
func (t *Tokens) Refresh(ctx context.Context) (Credentials, error) { return t.current(ctx, true) }
func (t *Tokens) current(ctx context.Context, force bool) (Credentials, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.dirty {
		if err := t.persist(ctx, t.value); err != nil {
			t.lastErr = errors.New("xiaomi: OOS credential persistence failed")
			return Credentials{}, t.lastErr
		}
		t.dirty = false
		t.lastErr = nil
	}
	now := time.Now()
	due := time.Unix(t.value.ObtainedAt+t.value.ExpiresIn*7/10, 0)
	if !force && now.Before(due) {
		return t.value, nil
	}
	if !force && now.Before(t.retryAfter) {
		if now.Unix() >= t.value.ObtainedAt+t.value.ExpiresIn {
			return Credentials{}, t.lastErr
		}
		return t.value, nil
	}
	data, _ := json.Marshal(map[string]any{"client_id": json.Number(ClientID), "redirect_uri": t.value.RedirectURL, "refresh_token": t.value.RefreshToken})
	req, _ := http.NewRequestWithContext(ctx, "GET", t.base+"/app/v2/ha/oauth/get_token?"+url.Values{"data": {string(data)}}.Encode(), nil)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := t.hc.Do(req)
	if err != nil {
		err = errors.New("xiaomi: token refresh transport failed")
	} else {
		defer resp.Body.Close()
		var out struct {
			Code   int `json:"code"`
			Result struct {
				AccessToken  string `json:"access_token"`
				RefreshToken string `json:"refresh_token"`
				ExpiresIn    int64  `json:"expires_in"`
			} `json:"result"`
		}
		if resp.StatusCode != 200 {
			err = fmt.Errorf("xiaomi: token refresh HTTP %d", resp.StatusCode)
		} else if e := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); e != nil {
			err = errors.New("xiaomi: invalid token refresh response")
		} else if out.Code != 0 || out.Result.AccessToken == "" || out.Result.ExpiresIn <= 0 {
			err = fmt.Errorf("xiaomi: token refresh rejected (%d)", out.Code)
		} else {
			t.value.AccessToken = out.Result.AccessToken
			if out.Result.RefreshToken != "" {
				t.value.RefreshToken = out.Result.RefreshToken
			}
			t.value.ObtainedAt = now.Unix()
			t.value.ExpiresIn = out.Result.ExpiresIn
			t.dirty = true
			if e := t.persist(ctx, t.value); e != nil {
				t.lastErr = errors.New("xiaomi: OOS credential persistence failed")
				return Credentials{}, t.lastErr
			}
			t.dirty = false
			t.lastErr = nil
			t.retryAfter = time.Time{}
			return t.value, nil
		}
	}
	t.lastErr = err
	t.retryAfter = now.Add(time.Minute)
	if !force && now.Unix() < t.value.ObtainedAt+t.value.ExpiresIn {
		return t.value, nil
	}
	return Credentials{}, err
}
func (t *Tokens) Status() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	s := map[string]any{"expires_at": time.Unix(t.value.ObtainedAt+t.value.ExpiresIn, 0).UTC(), "persist_pending": t.dirty}
	if t.lastErr != nil {
		s["last_error"] = t.lastErr.Error()
	}
	return s
}
