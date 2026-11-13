package audit_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
)

func newLogger(t *testing.T) (*audit.Logger, string) {
	t.Helper()
	dir := t.TempDir()
	st, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	l, err := audit.New(st)
	if err != nil {
		t.Fatal(err)
	}
	return l, filepath.Join(dir, "audit.jsonl")
}

func TestChainVerifies(t *testing.T) {
	l, path := newLogger(t)
	for i := 0; i < 5; i++ {
		if err := l.RecordSync(context.Background(), store.Entry{
			Kind: audit.KindLogin, Result: audit.ResultOK,
			Actor: store.Anonymous(),
		}); err != nil {
			t.Fatal(err)
		}
	}
	l.Close()

	res, err := audit.Verify(path)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK || res.Entries != 5 {
		t.Fatalf("want 5 valid entries, got %+v", res)
	}
}

func TestChainDetectsEdit(t *testing.T) {
	l, path := newLogger(t)
	for i := 0; i < 3; i++ {
		_ = l.RecordSync(context.Background(), store.Entry{
			Kind: audit.KindLogin, Result: audit.ResultOK,
			Actor: store.Anonymous(),
		})
	}
	l.Close()

	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	edited := strings.Replace(string(body), `"result":"ok"`, `"result":"denied"`, 1)
	if edited == string(body) {
		t.Skip("nothing to edit")
	}
	if err := os.WriteFile(path, []byte(edited), 0o600); err != nil {
		t.Fatal(err)
	}

	res, err := audit.Verify(path)
	if err != nil {
		t.Fatal(err)
	}
	if res.OK {
		t.Fatal("expected the chain to break after an edit")
	}
}
