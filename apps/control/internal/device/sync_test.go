package device_test

import (
	"context"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
	"testing"
)

type discovered struct{ devices []device.Descriptor }

func (p *discovered) Name() string                                          { return "test" }
func (p *discovered) Discover(context.Context) ([]device.Descriptor, error) { return p.devices, nil }
func (p *discovered) Read(context.Context, []string) (map[string]device.Readings, error) {
	return nil, nil
}
func (p *discovered) Apply(context.Context, string, device.Command) error { return nil }
func TestSyncPreservesPresentationAndMissingDevices(t *testing.T) {
	ctx := context.Background()
	st, err := filestore.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if err := st.Tx(ctx, func(tx store.Store) error {
		return tx.Devices().Upsert(ctx, &store.Device{Key: "lamp", Name: "My lamp", Room: "Patio", Hidden: true, Online: true})
	}); err != nil {
		t.Fatal(err)
	}
	p := &discovered{}
	if err := device.Sync(ctx, st, p); err != nil {
		t.Fatal(err)
	}
	d, _ := st.Devices().Get(ctx, "lamp")
	if !d.Missing || d.Online {
		t.Fatal("missing device not retained as offline")
	}
	p.devices = []device.Descriptor{{Key: "lamp", Name: "Vendor name", Room: "Vendor room", Provider: "test", Online: true, Actions: map[string]device.ParamSpec{"set_switch": {Type: "bool"}}}}
	if err := device.Sync(ctx, st, p); err != nil {
		t.Fatal(err)
	}
	d, _ = st.Devices().Get(ctx, "lamp")
	if d.Missing || !d.Online || !d.Hidden || d.Name != "My lamp" || d.Room != "Patio" || !d.Supports("set_switch") {
		t.Fatal("sync lost presentation or failed to refresh capabilities")
	}
}
