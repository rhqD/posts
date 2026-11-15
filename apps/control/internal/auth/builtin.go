package auth

import (
	"context"
	"errors"
	"renhanquan/control/internal/store"
	"strings"
	"time"
)

// SeedBuiltin imports existing accounts and configured household numbers once.
// Configuration seeds login accounts, never re-enables a disabled account.
func SeedBuiltin(ctx context.Context, st store.Store, phones map[string]bool) error {
	history, err := st.Audit().Query(ctx, store.Query{Kind: "auth.login.ok"}, 10000)
	if err != nil {
		return err
	}
	return st.Tx(ctx, func(tx store.Store) error {
		users, err := tx.Users().List(ctx)
		if err != nil {
			return err
		}
		sessions, err := tx.Sessions().List(ctx)
		if err != nil {
			return err
		}
		for _, u := range users {
			if u.Builtin {
				continue
			}
			u.Builtin = true
			if u.ActivatedAt == nil {
				for _, entry := range history {
					if entry.Actor.ID == u.ID && (u.ActivatedAt == nil || entry.At.Before(*u.ActivatedAt)) {
						at := entry.At
						u.ActivatedAt = &at
					}
				}
				for _, sess := range sessions {
					if sess.UserID == u.ID && (u.ActivatedAt == nil || sess.CreatedAt.Before(*u.ActivatedAt)) {
						at := sess.CreatedAt
						u.ActivatedAt = &at
					}
				}
				// Legacy members were only created following successful verification.
				if u.ActivatedAt == nil && u.Role == "member" {
					at := u.CreatedAt
					u.ActivatedAt = &at
				}
			}
			if err := tx.Users().Update(ctx, u); err != nil {
				return err
			}
		}
		for phone, enabled := range phones {
			phone = strings.TrimSpace(phone)
			if !enabled || phone == "" {
				continue
			}
			if _, err := tx.Users().GetByPhone(ctx, phone); err == nil {
				continue
			} else if !errors.Is(err, store.ErrNotFound) {
				return err
			}
			u := &store.User{ID: store.NewID(), Phone: phone, Role: "member", Builtin: true, CreatedAt: time.Now().UTC()}
			if err := tx.Users().Create(ctx, u); err != nil {
				return err
			}
		}
		return nil
	})
}
