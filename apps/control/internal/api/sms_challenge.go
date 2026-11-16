package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

const challengeTTL = 5 * time.Minute

type smsChallenge struct {
	token    string
	expires  time.Time
	attempts int
	busy     bool
}

type smsChallenges struct {
	mu      sync.Mutex
	byPhone map[string]*smsChallenge
}

func newSMSChallenges() *smsChallenges {
	return &smsChallenges{byPhone: make(map[string]*smsChallenge)}
}

// Called only after a successful send to an enabled, existing account. At
// most one challenge per household account; unknown numbers allocate nothing.
func (c *smsChallenges) activate(phone, token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for key, pending := range c.byPhone {
		if !now.Before(pending.expires) {
			delete(c.byPhone, key)
		}
	}
	c.byPhone[phone] = &smsChallenge{token: token, expires: now.Add(challengeTTL)}
}

func (c *smsChallenges) begin(phone, token string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	p := c.byPhone[phone]
	if p == nil || len(token) != 64 || subtle.ConstantTimeCompare([]byte(p.token), []byte(token)) != 1 || !time.Now().Before(p.expires) || p.attempts >= 5 || p.busy {
		return false
	}
	p.attempts++
	p.busy = true
	return true
}

// A challenge can only succeed once, and an in-flight check cannot accept an
// older code after another send replaced its challenge.
func (c *smsChallenges) finish(phone, token string, passed bool) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	p := c.byPhone[phone]
	if p == nil || p.token != token {
		return false
	}
	p.busy = false
	if !time.Now().Before(p.expires) {
		delete(c.byPhone, phone)
		return false
	}
	if passed {
		delete(c.byPhone, phone)
	}
	return passed
}

func (s *Server) challengeCookie(token string) *http.Cookie {
	return &http.Cookie{Name: s.cfg.CookieName + "_login", Value: token, Path: "/auth/sms", Domain: s.cfg.CookieDomain,
		Secure: s.cfg.CookieSecure, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: int(challengeTTL.Seconds())}
}

func newChallengeToken() (string, error) {
	var token [32]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(token[:]), nil
}
