package sms

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// Cred is one set of credentials for an Aliyun API call. Token is empty for a
// static access key and set for STS / instance-role credentials.
type Cred struct {
	AccessKeyID     string
	AccessKeySecret string
	SecurityToken   string
	Expires         time.Time
}

type Credentials interface {
	Fetch(ctx context.Context) (Cred, error)
}

// StaticCreds reads a long-lived RAM access key from configuration. Kept for
// local development; on ECS prefer ECSRoleCreds so no secret sits on disk.
type StaticCreds struct {
	AccessKeyID     string
	AccessKeySecret string
}

func (s StaticCreds) Fetch(context.Context) (Cred, error) {
	return Cred{AccessKeyID: s.AccessKeyID, AccessKeySecret: s.AccessKeySecret}, nil
}

// ECSRoleCreds pulls short-lived credentials from the instance metadata
// service. Nothing is persisted; the credentials rotate on their own.
type ECSRoleCreds struct {
	Role   string
	Client *http.Client

	mu     sync.Mutex
	cached Cred
}

const metadataBase = "http://100.100.100.200"

func (e *ECSRoleCreds) Fetch(ctx context.Context) (Cred, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Refresh five minutes before expiry so a call never straddles the boundary.
	if !e.cached.Expires.IsZero() && time.Until(e.cached.Expires) > 5*time.Minute {
		return e.cached, nil
	}
	if e.Role == "" {
		return Cred{}, fmt.Errorf("sms: instance role name is empty")
	}

	hc := e.Client
	if hc == nil {
		hc = &http.Client{Timeout: 5 * time.Second}
	}

	token, err := e.metadataToken(ctx, hc)
	if err != nil {
		return Cred{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		metadataBase+"/latest/meta-data/ram/security-credentials/"+e.Role, nil)
	if err != nil {
		return Cred{}, err
	}
	req.Header.Set("X-aliyun-ecs-metadata-token", token)
	resp, err := hc.Do(req)
	if err != nil {
		return Cred{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return Cred{}, fmt.Errorf("sms: metadata returned %d: %s", resp.StatusCode, string(body))
	}

	var payload struct {
		AccessKeyID     string `json:"AccessKeyId"`
		AccessKeySecret string `json:"AccessKeySecret"`
		SecurityToken   string `json:"SecurityToken"`
		Expiration      string `json:"Expiration"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return Cred{}, err
	}
	exp, _ := time.Parse(time.RFC3339, payload.Expiration)
	e.cached = Cred{
		AccessKeyID:     payload.AccessKeyID,
		AccessKeySecret: payload.AccessKeySecret,
		SecurityToken:   payload.SecurityToken,
		Expires:         exp,
	}
	return e.cached, nil
}

func (e *ECSRoleCreds) metadataToken(ctx context.Context, hc *http.Client) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, metadataBase+"/latest/api/token", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-aliyun-ecs-metadata-token-ttl-seconds", strconv.Itoa(21600))
	resp, err := hc.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 512))
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sms: metadata token %d: %s", resp.StatusCode, string(body))
	}
	return string(body), nil
}
