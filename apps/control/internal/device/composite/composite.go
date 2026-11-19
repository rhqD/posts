// Package composite routes device operations to independent vendors. A failed
// vendor must not hide the devices or discard the cache of a healthy vendor.
package composite

import (
	"context"
	"errors"
	"fmt"
	"renhanquan/control/internal/device"
	"sync"
)

type Child struct {
	Name     string
	Provider device.Provider
	Err      error
}
type Provider struct {
	mu         sync.RWMutex
	discoverMu sync.Mutex
	children   []Child
	routes     map[string]device.Provider
	failed     map[string]bool
	lastErrors map[string]string
}

func New(children ...Child) *Provider {
	return &Provider{children: children, routes: map[string]device.Provider{}, failed: map[string]bool{}, lastErrors: map[string]string{}}
}
func (p *Provider) Name() string { return "multi" }
func (p *Provider) Discover(ctx context.Context) ([]device.Descriptor, error) {
	p.discoverMu.Lock()
	defer p.discoverMu.Unlock()
	p.mu.RLock()
	oldRoutes := make(map[string]device.Provider, len(p.routes))
	for key, owner := range p.routes {
		oldRoutes[key] = owner
	}
	p.mu.RUnlock()
	var found []device.Descriptor
	routes := map[string]device.Provider{}
	failed := map[string]bool{}
	errs := map[string]string{}
	for _, c := range p.children {
		var ds []device.Descriptor
		err := c.Err
		if err == nil {
			ds, err = c.Provider.Discover(ctx)
		}
		if err != nil {
			failed[c.Name] = true
			errs[c.Name] = err.Error()
			for key, owner := range oldRoutes {
				if owner == c.Provider {
					routes[key] = owner
				}
			}
			continue
		}
		for _, d := range ds {
			if _, exists := routes[d.Key]; exists {
				return nil, fmt.Errorf("duplicate device key %q", d.Key)
			}
			routes[d.Key] = c.Provider
			found = append(found, d)
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.routes = routes
	p.failed = failed
	p.lastErrors = errs
	return found, nil
}
func (p *Provider) FailedProviders() map[string]bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := map[string]bool{}
	for n, v := range p.failed {
		out[n] = v
	}
	return out
}
func (p *Provider) Read(ctx context.Context, keys []string) (map[string]device.Readings, error) {
	p.mu.RLock()
	groups := map[device.Provider][]string{}
	for _, k := range keys {
		if owner := p.routes[k]; owner != nil {
			groups[owner] = append(groups[owner], k)
		}
	}
	p.mu.RUnlock()
	out := map[string]device.Readings{}
	var errs []error
	for owner, ks := range groups {
		states, err := owner.Read(ctx, ks)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		for k, v := range states {
			out[k] = v
		}
	}
	if len(out) > 0 {
		return out, nil
	}
	return out, errors.Join(errs...)
}
func (p *Provider) Apply(ctx context.Context, key string, cmd device.Command) error {
	p.mu.RLock()
	owner := p.routes[key]
	p.mu.RUnlock()
	if owner == nil {
		return device.ErrUnsupported
	}
	return owner.Apply(ctx, key, cmd)
}
func (p *Provider) Run(ctx context.Context, emit func(device.Update)) {
	var wg sync.WaitGroup
	for _, c := range p.children {
		if c.Err != nil {
			continue
		}
		if source, ok := c.Provider.(device.PushSource); ok {
			wg.Add(1)
			go func(s device.PushSource) { defer wg.Done(); s.Run(ctx, emit) }(source)
		}
	}
	wg.Wait()
}
func (p *Provider) Status() map[string]any {
	p.mu.RLock()
	defer p.mu.RUnlock()
	children := map[string]any{}
	for _, c := range p.children {
		var status any = map[string]any{"provider": c.Name}
		if c.Err != nil {
			status = map[string]any{"last_error": c.Err.Error()}
		} else if s, ok := c.Provider.(interface{ Status() map[string]any }); ok {
			status = s.Status()
		}
		children[c.Name] = map[string]any{"health": status, "discovery_error": p.lastErrors[c.Name]}
	}
	return map[string]any{"providers": children}
}
