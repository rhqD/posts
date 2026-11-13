// Package unavailable stands in for a device provider that could not start.
//
// Login and permissions must not be hostage to one vendor's credentials: if the
// device side is broken the service still boots, serves auth, and reports the
// reason in /admin/status instead of refusing to run.
package unavailable

import (
	"context"

	"renhanquan/control/internal/device"
)

type Provider struct{ Err error }

func (p Provider) Name() string { return "unavailable" }

func (p Provider) Discover(context.Context) ([]device.Descriptor, error) { return nil, nil }

func (p Provider) Read(context.Context, []string) (map[string]device.Readings, error) {
	return nil, p.Err
}

func (p Provider) Apply(context.Context, string, device.Command) error { return p.Err }

func (p Provider) Status() map[string]any {
	if p.Err == nil {
		return map[string]any{"provider": "unavailable"}
	}
	return map[string]any{"provider": "unavailable", "last_error": p.Err.Error()}
}
