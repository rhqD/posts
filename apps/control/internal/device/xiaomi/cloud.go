package xiaomi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type cloud struct {
	tokens *Tokens
	hc     *http.Client
	base   string
}

func (c *cloud) call(ctx context.Context, path string, body any, out any) error {
	for attempt := 0; attempt < 2; attempt++ {
		cred, err := c.tokens.current(ctx, attempt > 0)
		if err != nil {
			return err
		}
		payload, err := json.Marshal(body)
		if err != nil {
			return errors.New("xiaomi: invalid request")
		}
		req, err := http.NewRequestWithContext(ctx, "POST", c.base+path, bytes.NewReader(payload))
		if err != nil {
			return errors.New("xiaomi: invalid cloud endpoint")
		}
		req.Header.Set("Authorization", "Bearer"+cred.AccessToken)
		req.Header.Set("X-Client-BizId", "haapi")
		req.Header.Set("X-Client-AppId", ClientID)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "renhanquan-control/xiaomi")
		resp, err := c.hc.Do(req)
		if err != nil {
			return errors.New("xiaomi: cloud transport failed")
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if err != nil {
			return errors.New("xiaomi: cloud response read failed")
		}
		if resp.StatusCode == 401 && attempt == 0 {
			continue
		}
		if resp.StatusCode != 200 {
			return fmt.Errorf("xiaomi: cloud HTTP %d", resp.StatusCode)
		}
		var env struct {
			Code   int             `json:"code"`
			Result json.RawMessage `json:"result"`
		}
		if json.Unmarshal(raw, &env) != nil {
			return errors.New("xiaomi: invalid cloud response")
		}
		if env.Code != 0 {
			return fmt.Errorf("xiaomi: cloud rejected (%d)", env.Code)
		}
		if out != nil && json.Unmarshal(env.Result, out) != nil {
			return errors.New("xiaomi: invalid cloud result")
		}
		return nil
	}
	return errors.New("xiaomi: cloud authorization failed")
}
func newCloud(tokens *Tokens, region string) *cloud {
	host, _ := apiHost(region)
	return &cloud{tokens: tokens, base: "https://" + host, hc: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

type cloudDevice struct {
	DID    string `json:"did"`
	Name   string `json:"name"`
	Model  string `json:"model"`
	Online bool   `json:"isOnline"`
}
type propertyValue struct {
	DID   string `json:"did"`
	SIID  int    `json:"siid"`
	PIID  int    `json:"piid"`
	Value any    `json:"value,omitempty"`
	Code  *int   `json:"code,omitempty"`
}

func (c *cloud) devices(ctx context.Context) ([]cloudDevice, error) {
	var homes struct {
		Homes []struct {
			DIDs  []string `json:"dids"`
			Rooms []struct {
				DIDs []string `json:"dids"`
			} `json:"roomlist"`
		} `json:"homelist"`
	}
	if err := c.call(ctx, "/app/v2/homeroom/gethome", map[string]any{"limit": 150, "fetch_share": false, "fetch_share_dev": false, "plat_form": 0, "app_ver": 9}, &homes); err != nil {
		return nil, err
	}
	var ids []string
	for _, h := range homes.Homes {
		ids = append(ids, h.DIDs...)
		for _, r := range h.Rooms {
			ids = append(ids, r.DIDs...)
		}
	}
	if len(ids) == 0 {
		return nil, nil
	}
	var devices []cloudDevice
	for start := 0; start < len(ids); start += 150 {
		end := start + 150
		if end > len(ids) {
			end = len(ids)
		}
		cursor := ""
		seen := map[string]bool{}
		for page := 0; page < 100; page++ {
			var out struct {
				List []cloudDevice `json:"list"`
				More bool          `json:"has_more"`
				Next string        `json:"next_start_did"`
			}
			body := map[string]any{"limit": 200, "get_split_device": true, "get_third_device": true, "dids": ids[start:end]}
			if cursor != "" {
				body["start_did"] = cursor
			}
			if err := c.call(ctx, "/app/v2/home/device_list_page", body, &out); err != nil {
				return nil, err
			}
			devices = append(devices, out.List...)
			if !out.More {
				break
			}
			if out.Next == "" || seen[out.Next] || page == 99 {
				return nil, errors.New("xiaomi: invalid device pagination")
			}
			cursor = out.Next
			seen[cursor] = true
		}
	}
	return devices, nil
}
func (c *cloud) read(ctx context.Context, refs []propertyValue) ([]propertyValue, error) {
	var out []propertyValue
	if len(refs) == 0 {
		return out, nil
	}
	for i := 0; i < len(refs); i += 150 {
		end := i + 150
		if end > len(refs) {
			end = len(refs)
		}
		var part []propertyValue
		if err := c.call(ctx, "/app/v2/miotspec/prop/get", map[string]any{"datasource": 1, "params": refs[i:end]}, &part); err != nil {
			return nil, err
		}
		out = append(out, part...)
	}
	return out, nil
}
func (c *cloud) write(ctx context.Context, ref propertyValue) error {
	var out []propertyValue
	if err := c.call(ctx, "/app/v2/miotspec/prop/set", map[string]any{"params": []propertyValue{ref}}, &out); err != nil {
		return err
	}
	if len(out) != 1 || out[0].DID != ref.DID || out[0].SIID != ref.SIID || out[0].PIID != ref.PIID {
		return errors.New("xiaomi: invalid write receipt")
	}
	if out[0].Code == nil {
		return errors.New("xiaomi: missing write result code")
	}
	if *out[0].Code != 0 {
		return fmt.Errorf("xiaomi: device rejected operation (%d)", *out[0].Code)
	}
	return nil
}
