package main

import (
	"context"
	"renhanquan/control/internal/acl"
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
