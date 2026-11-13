package filestore

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"sync"

	"renhanquan/control/internal/store"
)

type auditFile struct {
	mu   sync.Mutex
	path string
}

func (a *auditFile) Append(_ context.Context, e store.Entry) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	b = append(b, 10) // trailing newline keeps the file JSONL

	a.mu.Lock()
	defer a.mu.Unlock()

	f, err := os.OpenFile(a.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func (a *auditFile) LastHash(_ context.Context) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	f, err := os.Open(a.path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()

	var last string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var e store.Entry
		if err := json.Unmarshal(line, &e); err == nil && e.Hash != "" {
			last = e.Hash
		}
	}
	return last, sc.Err()
}

func (a *auditFile) Query(_ context.Context, q store.Query, limit int) ([]store.Entry, error) {
	if limit <= 0 {
		limit = 200
	}
	if d := q.From; !d.IsZero() {
		_ = d
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	f, err := os.Open(a.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	out := make([]store.Entry, 0, limit)
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var e store.Entry
		if err := json.Unmarshal(line, &e); err != nil {
			continue
		}
		if q.Kind != "" && e.Kind != q.Kind {
			continue
		}
		if q.Result != "" && e.Result != q.Result {
			continue
		}
		if !q.From.IsZero() && e.At.Before(q.From) {
			continue
		}
		if !q.To.IsZero() && e.At.After(q.To) {
			continue
		}
		out = append(out, e)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
