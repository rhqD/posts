// Package sonoff is the CoolKit (eWeLink) provider.
//
// It talks to the same HTTP API the eWeLink app uses, so it needs no flashing,
// no local broker and no inbound port. The trade-off is that every command
// leaves the house and comes back through the vendor cloud.
//
// Shape of the integration:
//
//	GET  /v2/device/thing         list devices, each carrying its own params
//	POST /v2/device/thing/status  {type, id, params}
//
// Reads are served from a short-lived cache and coalesced into one request per
// window; a write invalidates that device so the next read is fresh.
package sonoff

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"

	"renhanquan/control/internal/device"
)

// AppID is the public app identifier the mobile client sends. It is not a
// secret; it only identifies which client is calling.
const AppID = "R8Oq3y0eSZSYdKccHlrQzT1ACCOUT9Gv"

var baseURLs = map[string]string{
	"cn": "https://cn-apia.coolkit.cn",
	"as": "https://as-apia.coolkit.cc",
	"us": "https://us-apia.coolkit.cc",
	"eu": "https://eu-apia.coolkit.cc",
}

// controllableParams is an allowlist, not a denylist.
//
// Real eWeLink payloads are full of internal registers — depc, epc1, excvaddr,
// rstReason, longOffline — and treating "anything writable" as a control would
// offer the user buttons that poke firmware state. Only these are user actions.
var controllableParams = map[string]bool{
	"switch":           true,
	"brightness":       true,
	"colorTemperature": true,
	"mode":             true,
	"channel":          true,
}

// noisyReadings are device fingerprints rather than state; they stay out of the
// descriptor so the UI does not have to filter them.
var noisyReadings = map[string]bool{
	"bindInfos": true, "bssid": true, "ssid": true, "staMac": true,
	"only_device": true,
}

// TokenSource supplies an access token. Implementations may refresh it.
type TokenSource interface {
	Token(ctx context.Context) (string, error)
	Invalidate()
}

// StaticToken wraps a token pasted from configuration. It cannot refresh, so
// the provider surfaces token death instead of hiding it.
type StaticToken struct{ token string }

func NewStaticToken(t string) *StaticToken { return &StaticToken{token: t} }

func (s *StaticToken) Token(context.Context) (string, error) {
	if s.token == "" {
		return "", fmt.Errorf("sonoff: no access token configured")
	}
	return s.token, nil
}

func (s *StaticToken) Invalidate() {}

type meta struct {
	desc     device.Descriptor
	itemType int
}

type cached struct {
	readings device.Readings
	expire   time.Time
}

type Provider struct {
	base  string
	token TokenSource
	hc    *http.Client
	ttl   time.Duration
	gap   time.Duration

	callMu   sync.Mutex
	lastCall time.Time

	mu      sync.RWMutex
	devices map[string]meta
	cache   map[string]cached

	statusMu sync.RWMutex
	lastOK   time.Time
	lastErr  string
	calls    int
}

type Option func(*Provider)

func WithBaseURL(u string) Option          { return func(p *Provider) { p.base = u } }
func WithHTTPClient(c *http.Client) Option { return func(p *Provider) { p.hc = c } }
func WithCacheTTL(d time.Duration) Option  { return func(p *Provider) { p.ttl = d } }
func WithMinGap(d time.Duration) Option    { return func(p *Provider) { p.gap = d } }

// BaseURL resolves a region to its API host, so callers building a token
// source end up on the same host the provider talks to.
func BaseURL(region string) string {
	if b, ok := baseURLs[region]; ok {
		return b
	}
	return baseURLs["cn"]
}

func New(region string, token TokenSource, opts ...Option) *Provider {
	base := BaseURL(region)
	p := &Provider{
		base:    base,
		token:   token,
		hc:      &http.Client{Timeout: 10 * time.Second},
		ttl:     time.Second,
		gap:     200 * time.Millisecond,
		devices: map[string]meta{},
		cache:   map[string]cached{},
	}
	for _, o := range opts {
		o(p)
	}
	return p
}

func (p *Provider) Name() string { return "sonoff" }

var _ device.Provider = (*Provider)(nil)

// ---- transport --------------------------------------------------------

type envelope struct {
	Error int             `json:"error"`
	Msg   string          `json:"msg"`
	Data  json.RawMessage `json:"data"`
}

func (p *Provider) call(ctx context.Context, method, path string, body any, out any) error {
	// Serialise outbound calls and keep a minimum gap between them: the vendor
	// does not publish rate limits, so we behave like a polite client.
	p.callMu.Lock()
	if !p.lastCall.IsZero() {
		if wait := p.gap - time.Since(p.lastCall); wait > 0 {
			select {
			case <-time.After(wait):
			case <-ctx.Done():
				p.callMu.Unlock()
				return ctx.Err()
			}
		}
	}
	p.lastCall = time.Now()
	p.statusMu.Lock()
	p.calls++
	p.statusMu.Unlock()
	p.callMu.Unlock()

	tok, err := p.token.Token(ctx)
	if err != nil {
		p.setErr(err)
		return err
	}

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.base+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("X-CK-Appid", AppID)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.hc.Do(req)
	if err != nil {
		p.setErr(err)
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		p.setErr(err)
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		p.token.Invalidate()
		err = fmt.Errorf("sonoff: unauthorized (token expired?)")
		p.setErr(err)
		return err
	}
	if resp.StatusCode != http.StatusOK {
		err = fmt.Errorf("sonoff: http %d", resp.StatusCode)
		p.setErr(err)
		return err
	}

	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		err = fmt.Errorf("sonoff: bad json: %w", err)
		p.setErr(err)
		return err
	}
	if env.Error != 0 {
		if env.Error == 401 {
			p.token.Invalidate()
		}
		err = fmt.Errorf("sonoff: api error %d: %s", env.Error, env.Msg)
		p.setErr(err)
		return err
	}

	p.statusMu.Lock()
	p.lastOK = time.Now()
	p.lastErr = ""
	p.statusMu.Unlock()

	if out != nil && len(env.Data) > 0 {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return fmt.Errorf("sonoff: decode data: %w", err)
		}
	}
	return nil
}

func (p *Provider) setErr(err error) {
	p.statusMu.Lock()
	p.lastErr = err.Error()
	p.statusMu.Unlock()
}

// Status is a cheap health snapshot for logs and admin endpoints.
func (p *Provider) Status() map[string]any {
	p.statusMu.RLock()
	defer p.statusMu.RUnlock()
	return map[string]any{
		"provider":   "sonoff",
		"base":       p.base,
		"calls":      p.calls,
		"last_ok":    p.lastOK,
		"last_error": p.lastErr,
	}
}

// ---- discovery --------------------------------------------------------

type thing struct {
	ItemType int `json:"itemType"`
	ItemData struct {
		DeviceID string         `json:"deviceid"`
		Name     string         `json:"name"`
		Room     string         `json:"roomName"`
		Online   bool           `json:"online"`
		Params   map[string]any `json:"params"`
	} `json:"itemData"`
}

func (p *Provider) Discover(ctx context.Context) ([]device.Descriptor, error) {
	var data struct {
		ThingList []thing `json:"thingList"`
	}
	if err := p.call(ctx, http.MethodGet, "/v2/device/thing", nil, &data); err != nil {
		return nil, err
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	out := make([]device.Descriptor, 0, len(data.ThingList))
	for _, t := range data.ThingList {
		if t.ItemData.DeviceID == "" {
			continue // groups and homes carry no deviceid
		}
		d := buildDescriptor(t.ItemData.DeviceID, t.ItemData.Name, t.ItemData.Room, t.ItemData.Online, t.ItemData.Params)
		p.devices[d.Key] = meta{desc: d, itemType: t.ItemType}
		p.cache[d.Key] = cached{readings: copyReadings(t.ItemData.Params), expire: time.Now().Add(p.ttl)}
		out = append(out, d)
	}
	return out, nil
}

// buildDescriptor derives capabilities from the params a device reports. This
// is why a device type the code has never seen still works: whatever the cloud
// says is writable becomes a set_* action.
func buildDescriptor(key, name, room string, online bool, params map[string]any) device.Descriptor {
	d := device.Descriptor{
		Key:      key,
		Name:     name,
		Room:     room,
		Provider: "sonoff",
		Kind:     "device",
		Online:   online,
		Actions:  map[string]device.ParamSpec{},
	}

	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		if !noisyReadings[k] {
			d.Readings = append(d.Readings, k)
		}
		if !controllableParams[k] {
			continue
		}
		// eWeLink reports switches as the string "on"/"off", not as a bool.
		if k == "switch" {
			d.Actions["set_switch"] = device.ParamSpec{Type: "bool"}
			continue
		}
		spec := device.ParamSpec{Type: "number"}
		if k == "brightness" || k == "colorTemperature" {
			lo, hi := 1, 100
			spec.Min, spec.Max = &lo, &hi
		}
		d.Actions["set_"+k] = spec
	}
	return d
}

func copyReadings(params map[string]any) device.Readings {
	out := make(device.Readings, len(params))
	for k, v := range params {
		out[k] = v
	}
	return out
}

// ---- read / write -----------------------------------------------------

func (p *Provider) Read(ctx context.Context, keys []string) (map[string]device.Readings, error) {
	now := time.Now()

	p.mu.RLock()
	out := map[string]device.Readings{}
	stale := false
	for _, k := range keys {
		if c, ok := p.cache[k]; ok && now.Before(c.expire) {
			out[k] = cloneReadings(c.readings)
			continue
		}
		stale = true
	}
	p.mu.RUnlock()

	if !stale {
		return out, nil
	}

	// One call refreshes everything: the cloud returns the full thing list
	// anyway, so refreshing per device would be pure waste.
	if _, err := p.Discover(ctx); err != nil {
		// Serve whatever was cached rather than failing the whole request.
		p.mu.RLock()
		for _, k := range keys {
			if c, ok := p.cache[k]; ok {
				out[k] = cloneReadings(c.readings)
			}
		}
		p.mu.RUnlock()
		return out, err
	}

	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, k := range keys {
		if c, ok := p.cache[k]; ok {
			out[k] = cloneReadings(c.readings)
		}
	}
	return out, nil
}

func cloneReadings(r device.Readings) device.Readings {
	out := make(device.Readings, len(r))
	for k, v := range r {
		out[k] = v
	}
	return out
}

func (p *Provider) Apply(ctx context.Context, key string, cmd device.Command) error {
	p.mu.RLock()
	m, ok := p.devices[key]
	p.mu.RUnlock()
	if !ok {
		// Unknown device: refresh once, then retry.
		if _, err := p.Discover(ctx); err != nil {
			return err
		}
		p.mu.RLock()
		m, ok = p.devices[key]
		p.mu.RUnlock()
		if !ok {
			return fmt.Errorf("sonoff: unknown device %q", key)
		}
	}

	paramKey := actionParam(cmd.Action)
	if paramKey == "" {
		return device.ErrUnsupported
	}
	value, ok := cmd.Params["value"]
	if !ok {
		return fmt.Errorf("sonoff: %s needs params.value", cmd.Action)
	}
	body := map[string]any{
		"type":   m.itemType,
		"id":     key,
		"params": map[string]any{paramKey: convert(paramKey, value)},
	}
	if body["type"] == 0 {
		body["type"] = 1
	}

	if err := p.call(ctx, http.MethodPost, "/v2/device/thing/status", body, nil); err != nil {
		return err
	}

	// Write-through: drop the cache so the next read shows the new state.
	p.mu.Lock()
	delete(p.cache, key)
	p.mu.Unlock()
	return nil
}

// actionParam turns "set_switch" back into the param key "switch".
func actionParam(action string) string {
	const prefix = "set_"
	if len(action) <= len(prefix) || action[:len(prefix)] != prefix {
		return ""
	}
	return action[len(prefix):]
}

// convert adapts a JSON value to what this param expects.
func convert(param string, v any) any {
	switch param {
	case "switch":
		if b, ok := v.(bool); ok {
			if b {
				return "on"
			}
			return "off"
		}
	}
	return v
}
