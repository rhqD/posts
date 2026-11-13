// Command diag dumps the raw CoolKit thing list. It is a debugging aid, not
// part of the service: run it on the instance so the role can read the secret.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"time"

	"renhanquan/control/internal/aliyun"
	"renhanquan/control/internal/device/sonoff"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	creds := &aliyun.ECSRoleCreds{Role: os.Getenv("ALIYUN_ROLE_NAME")}
	raw, err := aliyun.GetSecretParameter(ctx, nil, "cn-beijing", creds, "renhanquan/ewelink")
	if err != nil {
		fmt.Println("secret:", err)
		os.Exit(1)
	}
	var secret struct {
		At string `json:"at"`
	}
	if err := json.Unmarshal([]byte(raw), &secret); err != nil {
		fmt.Println("json:", err)
		os.Exit(1)
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, sonoff.BaseURL("cn")+"/v2/device/thing", nil)
	req.Header.Set("Authorization", "Bearer "+secret.At)
	req.Header.Set("X-CK-Appid", sonoff.AppID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Println("call:", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	// Redact anything that identifies the physical unit.
	redact := regexp.MustCompile(`"(apikey|staMac|bssid|ssid)"\s*:\s*"[^"]*"`)
	fmt.Println(string(redact.ReplaceAll(body, []byte(`"$1":"<redacted>"`))))
}
