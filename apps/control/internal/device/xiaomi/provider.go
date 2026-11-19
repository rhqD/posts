package xiaomi

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"renhanquan/control/internal/device"
)

type binding struct {
	name           string
	siid, piid     int
	kind           string
	min, max, step float64
	writable       bool
}

// Only explicitly reviewed household properties of the tested model are
// exposed. No network identifiers, credentials, diagnostics, reset actions, or
// arbitrary siid/piid passthrough can reach the public cache or command API.
var acBindings = []binding{
	{"switch", 2, 1, "bool", 0, 0, 0, true},
	{"mode", 2, 2, "number", 2, 5, 1, true},
	{"targetTemperature", 2, 4, "number", 16, 31, .5, true},
	{"fanLevel", 3, 2, "number", 0, 8, 1, true},
	{"verticalSwing", 3, 4, "bool", 0, 0, 0, true},
	{"temperature", 4, 7, "number", -50, 150, .1, false},
	{"humidity", 4, 9, "number", 0, 100, 1, false},
	{"indicator", 6, 1, "bool", 0, 0, 0, true},
}

type entry struct {
	desc     device.Descriptor
	did      string
	state    device.Readings
	versions map[string]uint64
}
type Provider struct {
	mu          sync.RWMutex
	discoverMu  sync.Mutex
	cloud       *cloud
	tokens      *Tokens
	region      string
	allowed     map[string]bool
	devices     map[string]*entry
	revision    uint64
	connected   bool
	lastErr     string
	lastOK      time.Time
	lastPush    time.Time
	unsupported int
	updates     chan device.Update
	reconfigure chan struct{}
}

func New(tokens *Tokens, region string, allowedDIDs []string) *Provider {
	allowed := map[string]bool{}
	for _, id := range allowedDIDs {
		if id != "" && !strings.ContainsAny(id, "/+#") {
			allowed[id] = true
		}
	}
	return &Provider{tokens: tokens, region: region, allowed: allowed, cloud: newCloud(tokens, region), devices: map[string]*entry{}, updates: make(chan device.Update, 64), reconfigure: make(chan struct{}, 1)}
}
func (p *Provider) Name() string            { return "xiaomi" }
func (p *Provider) setError(message string) { p.mu.Lock(); p.lastErr = message; p.mu.Unlock() }
func (p *Provider) Discover(ctx context.Context) ([]device.Descriptor, error) {
	p.discoverMu.Lock()
	defer p.discoverMu.Unlock()
	list, err := p.cloud.devices(ctx)
	if err != nil {
		p.setError(err.Error())
		return nil, err
	}
	p.mu.Lock()
	next := map[string]*entry{}
	changed := false
	unsupported := 0
	for _, d := range list {
		if !p.allowed[d.DID] {
			continue
		}
		if d.Model != "xiaomi.airc.h09h00" {
			unsupported++
			continue
		}
		key := "xiaomi-" + d.DID
		state := device.Readings{}
		versions := map[string]uint64{}
		if old, ok := p.devices[key]; ok {
			state = copyState(old.state)
			versions = old.versions
		} else {
			changed = true
		}
		desc := device.Descriptor{Key: key, Name: d.Name, Provider: "xiaomi", Kind: "climate", Online: d.Online, Actions: map[string]device.ParamSpec{}}
		for _, b := range acBindings {
			desc.Readings = append(desc.Readings, b.name)
			if b.writable {
				spec := device.ParamSpec{Type: b.kind}
				if b.kind == "number" {
					lo, hi := int(b.min), int(b.max)
					spec.Min = &lo
					spec.Max = &hi
				}
				desc.Actions["set_"+b.name] = spec
			}
		}
		next[key] = &entry{desc: desc, did: d.DID, state: state, versions: versions}
	}
	if len(next) != len(p.devices) {
		changed = true
	}
	p.devices = next
	p.unsupported = unsupported
	p.mu.Unlock()
	if err := p.snapshot(ctx); err != nil {
		p.setError(err.Error())
		return nil, err
	}
	if changed {
		select {
		case p.reconfigure <- struct{}{}:
		default:
		}
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]device.Descriptor, 0, len(p.devices))
	for _, d := range p.devices {
		out = append(out, d.desc)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}
func copyState(in device.Readings) device.Readings {
	out := device.Readings{}
	for k, v := range in {
		out[k] = v
	}
	return out
}
func valid(b binding, v any) bool {
	if b.kind == "bool" {
		_, ok := v.(bool)
		return ok
	}
	n, ok := v.(float64)
	if !ok || math.IsNaN(n) || math.IsInf(n, 0) || n < b.min || n > b.max {
		return false
	}
	steps := (n - b.min) / b.step
	return math.Abs(steps-math.Round(steps)) < 1e-6
}
func (p *Provider) snapshot(ctx context.Context) error {
	p.mu.RLock()
	rev := p.revision
	var refs []propertyValue
	for _, d := range p.devices {
		for _, b := range acBindings {
			refs = append(refs, propertyValue{DID: d.did, SIID: b.siid, PIID: b.piid})
		}
	}
	p.mu.RUnlock()
	values, err := p.cloud.read(ctx, refs)
	if err != nil {
		return err
	}
	p.mu.Lock()
	for _, r := range values {
		d := p.devices["xiaomi-"+r.DID]
		if d == nil || r.Code == nil || *r.Code != 0 {
			continue
		}
		for _, b := range acBindings {
			if r.SIID == b.siid && r.PIID == b.piid && valid(b, r.Value) && d.versions[b.name] <= rev {
				d.state[b.name] = r.Value
			}
		}
	}
	p.lastOK = time.Now()
	p.lastErr = ""
	keys := make([]string, 0, len(p.devices))
	for key := range p.devices {
		keys = append(keys, key)
	}
	p.mu.Unlock()
	for _, key := range keys {
		p.notify(key)
	}
	return nil
}
func (p *Provider) Read(_ context.Context, keys []string) (map[string]device.Readings, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := map[string]device.Readings{}
	for _, key := range keys {
		if d := p.devices[key]; d != nil {
			state := copyState(d.state)
			state["online"] = d.desc.Online
			state["stateFresh"] = p.connected
			out[key] = state
		}
	}
	return out, nil
}
func (p *Provider) Apply(ctx context.Context, key string, cmd device.Command) error {
	p.mu.RLock()
	d := p.devices[key]
	did := ""
	if d != nil {
		did = d.did
	}
	p.mu.RUnlock()
	if did == "" {
		return device.ErrUnsupported
	}
	var selected *binding
	for i := range acBindings {
		b := &acBindings[i]
		if b.writable && cmd.Action == "set_"+b.name {
			selected = b
			break
		}
	}
	if selected == nil {
		return device.ErrUnsupported
	}
	value, ok := cmd.Params["value"]
	if !ok || len(cmd.Params) != 1 || !valid(*selected, value) {
		return errors.New("xiaomi: invalid command value")
	}
	if err := p.cloud.write(ctx, propertyValue{DID: did, SIID: selected.siid, PIID: selected.piid, Value: value}); err != nil {
		p.setError(err.Error())
		return err
	}
	// Never optimistically claim a device changed. MQTT will update the cache;
	// read back once as reconciliation for devices that omit a notification.
	p.mu.RLock()
	readRevision := p.revision
	p.mu.RUnlock()
	values, err := p.cloud.read(ctx, []propertyValue{{DID: did, SIID: selected.siid, PIID: selected.piid}})
	if err == nil {
		for _, v := range values {
			if v.DID == did && v.SIID == selected.siid && v.PIID == selected.piid && v.Code != nil && *v.Code == 0 && valid(*selected, v.Value) {
				p.acceptReadback(key, *selected, v.Value, readRevision)
			}
		}
	}
	return nil
}

func (p *Provider) acceptReadback(key string, b binding, value any, revision uint64) {
	p.mu.Lock()
	d := p.devices[key]
	if d == nil || d.versions[b.name] > revision {
		p.mu.Unlock()
		return
	}
	p.revision++
	d.state[b.name] = value
	d.versions[b.name] = p.revision
	p.mu.Unlock()
	p.notify(key)
}
func (p *Provider) acceptValue(key string, b binding, value any, pushed ...bool) {
	p.mu.Lock()
	d := p.devices[key]
	if d == nil {
		p.mu.Unlock()
		return
	}
	p.revision++
	d.state[b.name] = value
	d.versions[b.name] = p.revision
	p.mu.Unlock()
	p.notify(key, pushed...)
}
func (p *Provider) notify(key string, pushed ...bool) {
	p.mu.RLock()
	d := p.devices[key]
	if d == nil {
		p.mu.RUnlock()
		return
	}
	state := copyState(d.state)
	state["online"] = d.desc.Online
	state["stateFresh"] = p.connected
	update := device.Update{Key: key, State: state, Online: d.desc.Online, Pushed: len(pushed) > 0 && pushed[0]}
	p.mu.RUnlock()
	select {
	case p.updates <- update:
	default:
	} // cache reads reconcile a burst; MQTT never blocks on disk/SSE
}
func (p *Provider) Status() map[string]any {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return map[string]any{"provider": "xiaomi", "mqtt_connected": p.connected, "devices": len(p.devices), "unsupported_devices": p.unsupported, "last_error": p.lastErr, "last_ok": p.lastOK, "last_push": p.lastPush, "credentials": p.tokens.Status()}
}
func keyDID(key string) string { return strings.TrimPrefix(key, "xiaomi-") }

var _ device.Provider = (*Provider)(nil)
