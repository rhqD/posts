// Package audit writes the security trail.
//
// The hot path never blocks: Record builds an entry and hands it to a bounded
// channel, dropping (and counting) if the writer falls behind. Security-critical
// changes use RecordSync, which waits for the write to hit disk.
//
// Entries are chained: hash = sha256(prevHash || entry). Any deletion or edit in
// the middle of the file breaks the chain, so tampering is detectable even
// though the file itself is append-only, not immutable.
package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"renhanquan/control/internal/store"
)

const (
	KindLogin        = "auth.login"
	KindLoginOK      = "auth.login.ok"
	KindSMS          = "auth.sms.send"
	KindLogout       = "auth.logout"
	KindDeny         = "acl.deny"
	KindPolicyGrant  = "policy.grant"
	KindPolicyRevoke = "policy.revoke"
	KindDeviceCtl    = "device.control"
	KindDeviceDeny   = "device.deny"

	ResultOK        = "ok"
	ResultDenied    = "denied"
	ResultFailed    = "failed"
	ResultThrottled = "throttled"
)

type item struct {
	e   store.Entry
	ack chan error
}

type Logger struct {
	st    store.Store
	ch    chan item
	prev  string
	drops atomic.Uint64

	mu     sync.Mutex
	closed bool
	quit   chan struct{}
	wg     sync.WaitGroup
}

func New(st store.Store) (*Logger, error) {
	prev, err := st.Audit().LastHash(context.Background())
	if err != nil {
		return nil, err
	}
	l := &Logger{
		st:   st,
		ch:   make(chan item, 4096),
		prev: prev,
		quit: make(chan struct{}),
	}
	l.wg.Add(1)
	go l.run()
	return l, nil
}

// Record never blocks the caller.
func (l *Logger) Record(e store.Entry) {
	l.submit(item{e: e})
}

// RecordSync waits until the entry is durably written.
func (l *Logger) RecordSync(ctx context.Context, e store.Entry) error {
	it := item{e: e, ack: make(chan error, 1)}
	select {
	case l.ch <- it:
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case err := <-it.ack:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (l *Logger) Dropped() uint64 { return l.drops.Load() }

func (l *Logger) submit(it item) {
	select {
	case l.ch <- it:
	default:
		l.drops.Add(1)
	}
}

func (l *Logger) run() {
	defer l.wg.Done()
	for {
		select {
		case it := <-l.ch:
			l.write(it)
		case <-l.quit:
			for {
				select {
				case it := <-l.ch:
					l.write(it)
				default:
					return
				}
			}
		}
	}
}

func (l *Logger) write(it item) {
	e := it.e
	if e.ID == "" {
		e.ID = string(store.NewID())
	}
	if e.At.IsZero() {
		e.At = time.Now().UTC()
	}
	e.PrevHash = l.prev
	e.Hash = ""

	payload, err := json.Marshal(e)
	if err != nil {
		if it.ack != nil {
			it.ack <- err
		}
		return
	}
	sum := sha256.Sum256(append([]byte(l.prev), payload...))
	e.Hash = hex.EncodeToString(sum[:])

	if err := l.st.Audit().Append(context.Background(), e); err != nil {
		if it.ack != nil {
			it.ack <- err
		}
		return
	}
	l.prev = e.Hash
	if it.ack != nil {
		it.ack <- nil
	}
}

func (l *Logger) Close() {
	l.mu.Lock()
	if l.closed {
		l.mu.Unlock()
		return
	}
	l.closed = true
	l.mu.Unlock()
	close(l.quit)
	l.wg.Wait()
}
