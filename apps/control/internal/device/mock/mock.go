// Package mock is a stand-in provider used for local development and tests.
// It is replaced by the CoolKit provider once credentials exist.
package mock

import (
	"context"
	"sync"

	"renhanquan/control/internal/device"
)

type Provider struct {
	mu    sync.Mutex
	state map[string]device.Readings
}

func New() *Provider {
	return &Provider{state: map[string]device.Readings{
		"yard-lamp":   {"power": false, "brightness": 70},
		"living-lamp": {"power": false, "brightness": 40},
		"door-sensor": {"open": false, "battery": 92},
	}}
}

func (p *Provider) Name() string { return "mock" }

func (p *Provider) Discover(context.Context) ([]device.Descriptor, error) {
	return []device.Descriptor{
		{
			Key: "yard-lamp", Name: "庭院灯", Room: "庭院", Provider: "mock", Kind: "light",
			Readings: []string{"power", "brightness"},
			Actions: map[string]device.ParamSpec{
				"set_power":      {Type: "bool"},
				"set_brightness": {Type: "int", Min: intp(0), Max: intp(100)},
			},
		},
		{
			Key: "living-lamp", Name: "客厅主灯", Room: "客厅", Provider: "mock", Kind: "light",
			Readings: []string{"power", "brightness"},
			Actions: map[string]device.ParamSpec{
				"set_power":      {Type: "bool"},
				"set_brightness": {Type: "int", Min: intp(0), Max: intp(100)},
			},
		},
		{
			Key: "door-sensor", Name: "入户门磁", Room: "玄关", Provider: "mock", Kind: "sensor",
			Readings: []string{"open", "battery"},
		},
	}, nil
}

func (p *Provider) Read(_ context.Context, keys []string) (map[string]device.Readings, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := map[string]device.Readings{}
	for _, k := range keys {
		if s, ok := p.state[k]; ok {
			cp := device.Readings{}
			for kk, vv := range s {
				cp[kk] = vv
			}
			out[k] = cp
		}
	}
	return out, nil
}

func (p *Provider) Apply(_ context.Context, key string, cmd device.Command) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	s, ok := p.state[key]
	if !ok {
		return device.ErrUnsupported
	}
	switch cmd.Action {
	case "set_power":
		v, _ := cmd.Params["value"].(bool)
		s["power"] = v
	case "set_brightness":
		v, _ := cmd.Params["value"].(float64)
		s["brightness"] = int(v)
	default:
		return device.ErrUnsupported
	}
	return nil
}

func intp(v int) *int { return &v }
