package auth_test

import (
	"context"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
	"testing"
	"time"
)

func TestBuiltinMigrationPreservesHistoryAndSessions(t *testing.T) {
	ctx := context.Background()
	st, err := filestore.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	at := time.Now().UTC().Add(-time.Hour)
	users := []*store.User{
		{ID: "old-admin", Phone: "13800000001", Role: "admin", CreatedAt: at},
		{ID: "old-member", Phone: "13800000002", Role: "member", CreatedAt: at, DisabledAt: &at},
		{ID: "pending", Phone: "13800000003", Role: "member", CreatedAt: at, Builtin: true},
	}
	err = st.Tx(ctx, func(tx store.Store) error {
		for _, u := range users {
			if err := tx.Users().Create(ctx, u); err != nil {
				return err
			}
		}
		return tx.Sessions().Create(ctx, &store.Session{ID: "preserved", UserID: "old-member", CreatedAt: at, ExpiresAt: at.Add(48 * time.Hour)})
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Audit().Append(ctx, store.Entry{At: at, Kind: "auth.login.ok", Actor: store.Subject{Kind: store.KindUser, ID: "old-admin"}, Result: "ok"}); err != nil {
		t.Fatal(err)
	}
	phones := map[string]bool{"13800000002": true, "13800000004": true}
	for i := 0; i < 2; i++ {
		if err := auth.SeedBuiltin(ctx, st, phones); err != nil {
			t.Fatal(err)
		}
	}
	all, _ := st.Users().List(ctx)
	if len(all) != 4 {
		t.Fatalf("want 4 accounts, got %d", len(all))
	}
	for _, id := range []store.ID{"old-admin", "old-member"} {
		u, _ := st.Users().Get(ctx, id)
		if !u.Builtin || u.ActivatedAt == nil || !u.ActivatedAt.Equal(at) {
			t.Fatalf("legacy activation lost: %s", id)
		}
	}
	member, _ := st.Users().Get(ctx, "old-member")
	if !member.Disabled() {
		t.Fatal("configuration re-enabled disabled account")
	}
	for _, phone := range []string{"13800000003", "13800000004"} {
		u, _ := st.Users().GetByPhone(ctx, phone)
		if !u.Builtin || u.ActivatedAt != nil {
			t.Fatal("pending user became activated")
		}
	}
	if _, err := st.Sessions().Get(ctx, "preserved"); err != nil {
		t.Fatal("migration removed existing session")
	}
}
