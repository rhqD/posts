// Package filestore is the P1 persistence backend: a directory of JSON files.
//
// Shape of ./data:
//
//	users.json      users
//	policies.json   grants
//	devices.json    cached device descriptors
//	sessions.json   live sessions
//	audit.jsonl     append-only audit trail
//
// Every write is a temp-file + fsync + rename, so a crash can lose the last
// write but never corrupt a file.
package filestore

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"renhanquan/control/internal/store"
)

type File struct {
	mu       sync.RWMutex
	dir      string
	users    map[store.ID]*store.User
	phones   map[string]store.ID
	policies map[store.ID]store.Policy
	devices  map[string]*store.Device
	sessions map[store.ID]*store.Session
	auditLog *auditFile
}

func Open(dir string) (*File, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	f := &File{
		dir:      dir,
		users:    map[store.ID]*store.User{},
		phones:   map[string]store.ID{},
		policies: map[store.ID]store.Policy{},
		devices:  map[string]*store.Device{},
		sessions: map[store.ID]*store.Session{},
		auditLog: &auditFile{path: filepath.Join(dir, "audit.jsonl")},
	}
	var users []*store.User
	if err := readJSON(filepath.Join(dir, "users.json"), &users); err != nil {
		return nil, err
	}
	for _, u := range users {
		f.users[u.ID] = u
		f.phones[u.Phone] = u.ID
	}
	var policies []store.Policy
	if err := readJSON(filepath.Join(dir, "policies.json"), &policies); err != nil {
		return nil, err
	}
	for _, p := range policies {
		f.policies[p.ID] = p
	}
	var devices []*store.Device
	if err := readJSON(filepath.Join(dir, "devices.json"), &devices); err != nil {
		return nil, err
	}
	for _, d := range devices {
		f.devices[d.Key] = d
	}
	var sessions []*store.Session
	if err := readJSON(filepath.Join(dir, "sessions.json"), &sessions); err != nil {
		return nil, err
	}
	for _, s := range sessions {
		f.sessions[s.ID] = s
	}
	return f, nil
}

func (f *File) Users() store.Users       { return &users{f} }
func (f *File) Policies() store.Policies { return &policies{f} }
func (f *File) Devices() store.Devices   { return &devices{f} }
func (f *File) Sessions() store.Sessions { return &sessions{f} }
func (f *File) Audit() store.AuditStore  { return f.auditLog }
func (f *File) Close() error             { return nil }

// Tx applies fn to a snapshot and only commits when fn succeeds.
func (f *File) Tx(ctx context.Context, fn func(store.Store) error) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	next := f.snapshot()
	if err := fn(next); err != nil {
		return err
	}
	if err := next.persist(); err != nil {
		return err
	}
	f.users, f.phones, f.policies, f.devices, f.sessions =
		next.users, next.phones, next.policies, next.devices, next.sessions
	return nil
}

func (f *File) snapshot() *File {
	next := &File{
		dir:      f.dir,
		users:    make(map[store.ID]*store.User, len(f.users)),
		phones:   make(map[string]store.ID, len(f.phones)),
		policies: make(map[store.ID]store.Policy, len(f.policies)),
		devices:  make(map[string]*store.Device, len(f.devices)),
		sessions: make(map[store.ID]*store.Session, len(f.sessions)),
		auditLog: f.auditLog,
	}
	for k, v := range f.users {
		c := *v
		next.users[k] = &c
	}
	for k, v := range f.phones {
		next.phones[k] = v
	}
	for k, v := range f.policies {
		next.policies[k] = v
	}
	for k, v := range f.devices {
		c := *v
		next.devices[k] = &c
	}
	for k, v := range f.sessions {
		c := *v
		next.sessions[k] = &c
	}
	return next
}

func (f *File) persist() error {
	users := make([]*store.User, 0, len(f.users))
	for _, u := range f.users {
		users = append(users, u)
	}
	policies := make([]store.Policy, 0, len(f.policies))
	for _, p := range f.policies {
		policies = append(policies, p)
	}
	devices := make([]*store.Device, 0, len(f.devices))
	for _, d := range f.devices {
		devices = append(devices, d)
	}
	sessions := make([]*store.Session, 0, len(f.sessions))
	for _, s := range f.sessions {
		sessions = append(sessions, s)
	}
	if err := writeJSON(filepath.Join(f.dir, "users.json"), users); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(f.dir, "policies.json"), policies); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(f.dir, "devices.json"), devices); err != nil {
		return err
	}
	return writeJSON(filepath.Join(f.dir, "sessions.json"), sessions)
}

func readJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if len(b) == 0 {
		return nil
	}
	return json.Unmarshal(b, v)
}

func writeJSON(path string, v any) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)

	enc := json.NewEncoder(tmp)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, 0o600); err != nil {
		return err
	}
	return os.Rename(name, path)
}

func notFound(kind string, id any) error {
	return fmt.Errorf("%s %v: %w", kind, id, store.ErrNotFound)
}
