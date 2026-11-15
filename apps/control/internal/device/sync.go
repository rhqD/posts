package device

import (
	"context"
	"renhanquan/control/internal/store"
)

// Sync preserves local presentation and keeps temporarily missing descriptors.
func Sync(ctx context.Context, st store.Store, provider Provider) error {
	found, err := provider.Discover(ctx)
	if err != nil {
		return err
	}
	return st.Tx(ctx, func(tx store.Store) error {
		seen := map[string]bool{}
		for _, d := range found {
			seen[d.Key] = true
		}
		previous, err := tx.Devices().List(ctx)
		if err != nil {
			return err
		}
		for _, d := range previous {
			if !seen[d.Key] {
				d.Missing = true
				d.Online = false
				if err := tx.Devices().Upsert(ctx, d); err != nil {
					return err
				}
			}
		}
		for _, d := range found {
			actions := map[string]any{}
			for k, v := range d.Actions {
				actions[k] = v
			}
			next := &store.Device{Key: d.Key, Name: d.Name, Room: d.Room, Kind: d.Kind, Online: d.Online, Provider: d.Provider, Readings: d.Readings, Actions: actions}
			if prev, err := tx.Devices().Get(ctx, d.Key); err == nil {
				if prev.Name != "" {
					next.Name = prev.Name
				}
				next.Room = prev.Room
				next.Hidden = prev.Hidden
			}
			if err := tx.Devices().Upsert(ctx, next); err != nil {
				return err
			}
		}
		return nil
	})
}
