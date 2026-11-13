// Package device defines the provider seam. A provider turns a vendor API
// (CoolKit, Miio, Tuya, ...) into a uniform list of descriptors plus
// read/apply calls. The core never learns a vendor name.
package device

import (
	"context"
	"errors"
)

var ErrUnsupported = errors.New("unsupported action")

// Reading is one observable value, e.g. {"power": true}.
type Readings map[string]any

// Command is a vendor-neutral instruction. Params carries whatever the
// descriptor declared for that action.
type Command struct {
	Action string         `json:"action"`
	Params map[string]any `json:"params,omitempty"`
}

// Descriptor is what a provider knows about a device at rest.
type Descriptor struct {
	Key      string
	Name     string
	Room     string
	Provider string
	Kind     string
	Online   bool
	Readings []string
	Actions  map[string]ParamSpec
}

// ParamSpec describes the accepted params for one action so the API can
// validate requests without knowing the vendor.
type ParamSpec struct {
	Type string   `json:"type"` // bool | int | float | string
	Min  *int     `json:"min,omitempty"`
	Max  *int     `json:"max,omitempty"`
	Enum []string `json:"enum,omitempty"`
}

type Provider interface {
	Name() string
	Discover(ctx context.Context) ([]Descriptor, error)
	Read(ctx context.Context, keys []string) (map[string]Readings, error)
	Apply(ctx context.Context, key string, cmd Command) error
}
