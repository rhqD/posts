package filestore_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
	"testing"
)

func TestLegacyMigrationAndAtomicMultiResourceCommit(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()
	legacy := map[string]any{"users.json": []store.User{{ID: "u", Phone: "test", Name: "Old"}}, "policies.json": []store.Policy{}, "devices.json": []store.Device{}, "sessions.json": []store.Session{{ID: "old", UserID: "u"}}}
	for name, value := range legacy {
		b, _ := json.Marshal(value)
		if err := os.WriteFile(filepath.Join(dir, name), b, 0600); err != nil {
			t.Fatal(err)
		}
	}
	st, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	err = st.Tx(ctx, func(tx store.Store) error {
		u, _ := tx.Users().Get(ctx, "u")
		u.Name = "New"
		if err := tx.Users().Update(ctx, u); err != nil {
			return err
		}
		return tx.Sessions().Delete(ctx, "old")
	})
	if err != nil {
		t.Fatal(err)
	}
	reopened, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	u, _ := reopened.Users().Get(ctx, "u")
	if u.Name != "New" {
		t.Fatal("update not committed")
	}
	if _, err := reopened.Sessions().Get(ctx, "old"); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("revoked legacy session resurrected")
	}
	b, _ := os.ReadFile(filepath.Join(dir, "sessions.json"))
	if string(b) == "[]" {
		t.Fatal("legacy evidence overwritten")
	}
	// Failed multi-resource mutation changes neither the durable snapshot nor memory.
	path := filepath.Join(dir, "state.json")
	backup := path + ".backup"
	if err := os.Rename(path, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	err = st.Tx(ctx, func(tx store.Store) error {
		u, _ := tx.Users().Get(ctx, "u")
		u.Name = "Uncommitted"
		if err := tx.Users().Update(ctx, u); err != nil {
			return err
		}
		return tx.Sessions().Create(ctx, &store.Session{ID: "new", UserID: "u"})
	})
	if err == nil {
		t.Fatal("commit unexpectedly succeeded")
	}
	u, _ = st.Users().Get(ctx, "u")
	if u.Name != "New" {
		t.Fatal("failed commit changed memory")
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(backup, path); err != nil {
		t.Fatal(err)
	}
	after, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer after.Close()
	u, _ = after.Users().Get(ctx, "u")
	if u.Name != "New" {
		t.Fatal("failed commit changed disk")
	}
	if _, err := after.Sessions().Get(ctx, "new"); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("partial session committed")
	}
}
func TestCorruptSnapshotNeverFallsBackToLegacy(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "users.json"), []byte(`[{"id":"legacy","phone":"test"}]`), 0600)
	for _, body := range []string{`{}`, `not-json`} {
		os.WriteFile(filepath.Join(dir, "state.json"), []byte(body), 0600)
		if _, err := filestore.Open(dir); err == nil {
			t.Fatal("corrupt state fell back to legacy")
		}
	}
}
