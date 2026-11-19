package composite

import (
	"context"
	"errors"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/store/filestore"
	"testing"
)

type vendor struct {
	name, key     string
	fail, applied bool
}

func (v *vendor) Name() string { return v.name }
func (v *vendor) Discover(context.Context) ([]device.Descriptor, error) {
	if v.fail {
		return nil, errors.New("vendor down")
	}
	return []device.Descriptor{{Key: v.key, Provider: v.name, Name: v.key, Online: true}}, nil
}
func (v *vendor) Read(context.Context, []string) (map[string]device.Readings, error) {
	if v.fail {
		return nil, errors.New("vendor down")
	}
	return map[string]device.Readings{v.key: {"switch": true}}, nil
}
func (v *vendor) Apply(context.Context, string, device.Command) error { v.applied = true; return nil }
func TestVendorOutageKeepsOtherVendorAndStoredMetadata(t *testing.T) {
	a, b := &vendor{name: "sonoff", key: "lamp"}, &vendor{name: "xiaomi", key: "xiaomi-ac"}
	p := New(Child{Name: a.name, Provider: a}, Child{Name: b.name, Provider: b})
	ctx := context.Background()
	st, err := filestore.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if err := device.Sync(ctx, st, p); err != nil {
		t.Fatal(err)
	}
	d, _ := st.Devices().Get(ctx, b.key)
	d.Name = "My AC"
	d.Hidden = true
	st.Devices().Upsert(ctx, d)
	b.fail = true
	if err := device.Sync(ctx, st, p); err != nil {
		t.Fatal(err)
	}
	d, _ = st.Devices().Get(ctx, b.key)
	if d.Missing || d.Online || !d.Hidden || d.Name != "My AC" {
		t.Fatal("outage destroyed metadata")
	}
	states, err := p.Read(ctx, []string{a.key, b.key})
	if err != nil || states[a.key] == nil {
		t.Fatal("xiaomi outage broke sonoff")
	}
	if p.Apply(ctx, a.key, device.Command{}) != nil || !a.applied || b.applied {
		t.Fatal("incorrect command routing")
	}
}
