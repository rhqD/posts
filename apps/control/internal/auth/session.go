package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"renhanquan/control/internal/store"
)

type Sessions struct {
	st  store.Store
	ttl time.Duration
}

func NewSessions(st store.Store, ttl time.Duration) *Sessions {
	return &Sessions{st: st, ttl: ttl}
}

func (s *Sessions) Issue(ctx context.Context, u *store.User, ip, ua string) (*store.Session, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	sess := &store.Session{
		ID:        store.ID(hex.EncodeToString(buf)),
		UserID:    u.ID,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(s.ttl),
		IP:        ip,
		UserAgent: ua,
	}
	if err := s.st.Tx(ctx, func(tx store.Store) error {
		current, err := tx.Users().Get(ctx, u.ID)
		if err != nil {
			return err
		}
		if current.Disabled() {
			return store.ErrNotFound
		}
		return tx.Sessions().Create(ctx, sess)
	}); err != nil {
		return nil, err
	}
	return sess, nil
}

func (s *Sessions) Resolve(ctx context.Context, id store.ID) (*store.User, *store.Session, error) {
	sess, err := s.st.Sessions().Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if sess.Expired(time.Now().UTC()) {
		_ = s.Revoke(ctx, id)
		return nil, nil, store.ErrNotFound
	}
	u, err := s.st.Users().Get(ctx, sess.UserID)
	if err != nil {
		return nil, nil, err
	}
	if u.Disabled() {
		return nil, nil, store.ErrNotFound
	}
	return u, sess, nil
}

func (s *Sessions) Revoke(ctx context.Context, id store.ID) error {
	return s.st.Tx(ctx, func(tx store.Store) error {
		return tx.Sessions().Delete(ctx, id)
	})
}

func (s *Sessions) PurgeExpired(ctx context.Context) int {
	now := time.Now().UTC()
	list, err := s.st.Sessions().List(ctx)
	if err != nil {
		return 0
	}
	hasExpired := false
	for _, sess := range list {
		if sess.Expired(now) {
			hasExpired = true
			break
		}
	}
	if !hasExpired {
		return 0
	}
	n := 0
	if err := s.st.Tx(ctx, func(tx store.Store) error {
		// Re-read under the transaction so concurrent issuance is preserved.
		current, err := tx.Sessions().List(ctx)
		if err != nil {
			return err
		}
		for _, sess := range current {
			if sess.Expired(now) {
				if err := tx.Sessions().Delete(ctx, sess.ID); err != nil {
					return err
				}
				n++
			}
		}
		return nil
	}); err != nil {
		return 0
	}
	return n
}
