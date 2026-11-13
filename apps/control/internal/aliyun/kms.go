package aliyun

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Cred is one set of credentials. Token is empty for a static key and set for
// STS / instance-role credentials.
type Cred struct {
	AccessKeyID     string
	AccessKeySecret string
	SecurityToken   string
	Expires         time.Time
}

type Credentials interface {
	Fetch(ctx context.Context) (Cred, error)
}

// StaticCreds is a long-lived RAM key. Development only.
type StaticCreds struct {
	AccessKeyID     string
	AccessKeySecret string
}

func (s StaticCreds) Fetch(context.Context) (Cred, error) {
	return Cred{AccessKeyID: s.AccessKeyID, AccessKeySecret: s.AccessKeySecret}, nil
}

// Call performs one signed RPC request and returns the raw response body.
func Call(ctx context.Context, hc *http.Client, endpoint, action, version string, creds Credentials, params map[string]string) ([]byte, error) {
	cred, err := creds.Fetch(ctx)
	if err != nil {
		return nil, err
	}

	p := map[string]string{
		"Format":           "JSON",
		"Version":          version,
		"AccessKeyId":      cred.AccessKeyID,
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureVersion": "1.0",
		"SignatureNonce":   fmt.Sprintf("%d", time.Now().UnixNano()),
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"Action":           action,
	}
	if cred.SecurityToken != "" {
		p["SecurityToken"] = cred.SecurityToken
	}
	for k, v := range params {
		p[k] = v
	}
	p["Signature"] = SignV1(cred.AccessKeySecret, p)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+CanonicalQuery(p), nil)
	if err != nil {
		return nil, err
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aliyun %s: http %d: %s", action, resp.StatusCode, string(body))
	}
	return body, nil
}

// GetSecret reads one secret version from KMS Secrets Manager.
func GetSecret(ctx context.Context, hc *http.Client, region string, creds Credentials, name string) (string, error) {
	if hc == nil {
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	endpoint := "https://kms." + region + ".aliyuncs.com/"
	body, err := Call(ctx, hc, endpoint, "GetSecretValue", "2016-01-20", creds, map[string]string{
		"SecretName":   name,
		"VersionStage": "ACSCURRENT",
	})
	if err != nil {
		return "", err
	}
	var out struct {
		SecretData string `json:"SecretData"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("kms: decode: %w", err)
	}
	if out.SecretData == "" {
		return "", fmt.Errorf("kms: secret %q is empty", name)
	}
	return out.SecretData, nil
}
