package auth_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
)

type sessionFixture struct {
	dir      string
	st       *filestore.File
	sessions *auth.Sessions
	user     *store.User
}

func newSessionFixture(t *testing.T) *sessionFixture {
	t.Helper()
	dir := t.TempDir()
	st, err := filestore.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	u := &store.User{ID: "user", Phone: "test"}
	if err := st.Tx(context.Background(), func(tx store.Store) error { return tx.Users().Create(context.Background(), u) }); err != nil {
		t.Fatal(err)
	}
	return &sessionFixture{dir, st, auth.NewSessions(st, time.Hour), u}
}
func (f *sessionFixture) issue(t *testing.T) *store.Session {
	t.Helper()
	s, err := f.sessions.Issue(context.Background(), f.user, "", "")
	if err != nil {
		t.Fatal(err)
	}
	return s
}
func (f *sessionFixture) reopen(t *testing.T) *filestore.File {
	t.Helper()
	st, err := filestore.Open(f.dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}
func (f *sessionFixture) breakPersistence(t *testing.T) func() {
	t.Helper()
	path := filepath.Join(f.dir, "state.json")
	backup := path + ".before-test"
	if err := os.Rename(path, backup); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	var once sync.Once
	restore := func() {
		once.Do(func() {
			if err := os.Remove(path); err != nil {
				t.Error(err)
			}
			if err := os.Rename(backup, path); err != nil {
				t.Error(err)
			}
		})
	}
	t.Cleanup(restore)
	return restore
}
func TestIssuedSessionSurvivesReopen(t *testing.T) {
	f := newSessionFixture(t)
	sess := f.issue(t)
	_, got, err := auth.NewSessions(f.reopen(t), time.Hour).Resolve(context.Background(), sess.ID)
	if err != nil || got.ID != sess.ID {
		t.Fatalf("issued session not durable: %v", err)
	}
}
func TestRevokedSessionDoesNotReturnAfterRestart(t *testing.T) {
	f := newSessionFixture(t)
	sess := f.issue(t)
	// Model a session that was already written to disk before logout.
	if err := f.st.Tx(context.Background(), func(store.Store) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if err := f.sessions.Revoke(context.Background(), sess.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := auth.NewSessions(f.reopen(t), time.Hour).Resolve(context.Background(), sess.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("revoked session revived: %v", err)
	}
}
func TestFailedRevocationDoesNotReportSuccess(t *testing.T) {
	f := newSessionFixture(t)
	sess := f.issue(t)
	restore := f.breakPersistence(t)
	if err := f.sessions.Revoke(context.Background(), sess.ID); err == nil {
		t.Fatal("revocation reported success without persisting")
	}
	if _, _, err := f.sessions.Resolve(context.Background(), sess.ID); err != nil {
		t.Fatalf("failed transaction changed memory: %v", err)
	}
	restore()
	if _, _, err := auth.NewSessions(f.reopen(t), time.Hour).Resolve(context.Background(), sess.ID); err != nil {
		t.Fatalf("failed transaction changed disk: %v", err)
	}
}
func TestFailedIssuanceDoesNotCreateUsableSession(t *testing.T) {
	f := newSessionFixture(t)
	restore := f.breakPersistence(t)
	if sess, err := f.sessions.Issue(context.Background(), f.user, "", ""); err == nil || sess != nil {
		t.Fatal("issued a session without persistence")
	}
	sessions, err := f.st.Sessions().List(context.Background())
	if err != nil || len(sessions) != 0 {
		t.Fatalf("uncommitted session in memory: %v", err)
	}
	restore()
	sessions, err = f.reopen(t).Sessions().List(context.Background())
	if err != nil || len(sessions) != 0 {
		t.Fatal("uncommitted session on disk")
	}
}
func TestExpiredCleanupIsDurable(t *testing.T) {
	for _, via := range []string{"resolve", "purge"} {
		t.Run(via, func(t *testing.T) {
			f := newSessionFixture(t)
			expired := f.issue(t)
			active := f.issue(t)
			expired.ExpiresAt = time.Now().Add(-time.Second)
			if err := f.st.Tx(context.Background(), func(tx store.Store) error { return tx.Sessions().Create(context.Background(), expired) }); err != nil {
				t.Fatal(err)
			}
			if via == "resolve" {
				if _, _, err := f.sessions.Resolve(context.Background(), expired.ID); !errors.Is(err, store.ErrNotFound) {
					t.Fatal("expired session accepted")
				}
			} else if n := f.sessions.PurgeExpired(context.Background()); n != 1 {
				t.Fatalf("purged %d", n)
			}
			st := f.reopen(t)
			if _, err := st.Sessions().Get(context.Background(), expired.ID); !errors.Is(err, store.ErrNotFound) {
				t.Fatal("expired session not removed from disk")
			}
			if _, err := st.Sessions().Get(context.Background(), active.ID); err != nil {
				t.Fatal("active session removed")
			}
		})
	}
}
func TestFailedExpiredCleanupDoesNotClaimRemoval(t *testing.T) {
	f := newSessionFixture(t)
	expired := f.issue(t)
	expired.ExpiresAt = time.Now().Add(-time.Second)
	if err := f.st.Tx(context.Background(), func(tx store.Store) error { return tx.Sessions().Create(context.Background(), expired) }); err != nil {
		t.Fatal(err)
	}
	f.breakPersistence(t)
	if n := f.sessions.PurgeExpired(context.Background()); n != 0 {
		t.Fatal("purge reported success without persisting")
	}
	if _, _, err := f.sessions.Resolve(context.Background(), expired.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("failed cleanup allowed expired session")
	}
}
