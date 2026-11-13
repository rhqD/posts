package aliyun

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// UpdateSecretParameter rewrites an OOS encrypted parameter. Used to persist a
// rotated refresh token, so a restart never finds a dead one.
func UpdateSecretParameter(ctx context.Context, hc *http.Client, region string, creds Credentials, name, value string) error {
	if hc == nil {
		hc = &http.Client{Timeout: 10 * time.Second}
	}
	endpoint := "https://oos." + region + ".aliyuncs.com/"
	body, err := Call(ctx, hc, endpoint, "UpdateSecretParameter", "2019-06-01", creds, map[string]string{
		"Name":  name,
		"Value": value,
	})
	if err != nil {
		return err
	}
	var out struct {
		Parameter struct {
			Name string `json:"Name"`
		} `json:"Parameter"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return fmt.Errorf("oos: decode: %w", err)
	}
	if out.Parameter.Name == "" {
		return fmt.Errorf("oos: update %q returned no parameter", name)
	}
	return nil
}
