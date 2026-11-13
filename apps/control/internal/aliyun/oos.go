package aliyun

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// GetSecretParameter reads an encrypted parameter from OOS Parameter Store.
//
// Unlike KMS Secrets Manager, the encrypted-parameter path does not need a paid
// KMS instance: leaving the instance id empty uses the legacy default KMS and
// allows up to 200 encrypted parameters per region for free.
func GetSecretParameter(ctx context.Context, hc *http.Client, region string, creds Credentials, name string) (string, error) {
	if hc == nil {
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	endpoint := "https://oos." + region + ".aliyuncs.com/"
	body, err := Call(ctx, hc, endpoint, "GetSecretParameter", "2019-06-01", creds, map[string]string{
		"Name":           name,
		"WithDecryption": "true",
	})
	if err != nil {
		return "", err
	}
	var out struct {
		Parameter struct {
			Value string `json:"Value"`
		} `json:"Parameter"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("oos: decode: %w", err)
	}
	if out.Parameter.Value == "" {
		return "", fmt.Errorf("oos: parameter %q is empty", name)
	}
	return out.Parameter.Value, nil
}
