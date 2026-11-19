package main

import (
	"context"
	"encoding/json"
	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/events"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
	"testing"
	"time"
)

func TestBootstrapNeverRestoresRevokedRoot(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	st, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	az := acl.New()
	phone := "13800000001"
	if err := bootstrap(ctx, st, az, phone, time.Hour); err != nil {
		t.Fatal(err)
	}
	u, _ := st.Users().GetByPhone(ctx, phone)
	if !az.Can(store.UserSubject(u), "policy:*", "grant") {
		t.Fatal("new admin not bootstrapped")
	}
	rules, _ := st.Policies().ListAll(ctx)
	if err := st.Tx(ctx, func(tx store.Store) error { return tx.Policies().Delete(ctx, rules[0].ID) }); err != nil {
		t.Fatal(err)
	}
	restarted, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if err := bootstrap(ctx, restarted, az, phone, time.Hour); err != nil {
		t.Fatal(err)
	}
	if az.Can(store.UserSubject(u), "policy:*", "grant") {
		t.Fatal("restart restored revoked root policy")
	}
	all, _ := restarted.Users().List(ctx)
	if len(all) != 1 {
		t.Fatal("duplicate bootstrap user")
	}
}

func TestPushUpdatesPreserveMetadataAndUseExistingSSEEnvelope(t *testing.T) {
	ctx := context.Background()
	st, err := filestore.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	d := &store.Device{Key: "xiaomi-ac", Name: "Local name", Provider: "xiaomi", Hidden: true, Online: true}
	if err := st.Devices().Upsert(ctx, d); err != nil {
		t.Fatal(err)
	}
	hub := events.New()
	ch, cancel := hub.Subscribe()
	defer cancel()
	publishDeviceUpdate(ctx, st, hub, device.Update{Key: d.Key, Online: false, State: device.Readings{"indicator": true}, Pushed: true})
	select {
	case payload := <-ch:
		var frame map[string]json.RawMessage
		if json.Unmarshal(payload, &frame) != nil || len(frame) != 1 || frame["states"] == nil {
			t.Fatal("push bypassed the existing SSE states envelope")
		}
	case <-time.After(time.Second):
		t.Fatal("no push published")
	}
	saved, _ := st.Devices().Get(ctx, d.Key)
	if saved.Online || saved.Name != "Local name" || !saved.Hidden {
		t.Fatal("online update destroyed local metadata")
	}
}
