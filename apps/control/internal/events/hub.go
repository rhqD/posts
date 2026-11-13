// Package events is a tiny fan-out hub for server-sent events.
//
// Only one direction is needed (server to browser): device state changes are
// pushed, and commands already travel over ordinary POSTs. SSE avoids a
// websocket dependency and reconnects on its own.
package events

import "sync"

type Hub struct {
	mu   sync.RWMutex
	subs map[chan []byte]struct{}
}

func New() *Hub {
	return &Hub{subs: make(map[chan []byte]struct{})}
}

// Subscribe returns a channel of payloads and a cancel func. The channel is
// closed on cancel, so a handler ranging over it exits cleanly.
func (h *Hub) Subscribe() (<-chan []byte, func()) {
	ch := make(chan []byte, 8)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			delete(h.subs, ch)
			close(ch)
			h.mu.Unlock()
		})
	}
	return ch, cancel
}

// Publish drops the payload for a subscriber that is not keeping up. A slow
// client must never block the poller or another client.
func (h *Hub) Publish(payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs {
		select {
		case ch <- payload:
		default:
		}
	}
}

// Count is how many browsers are currently listening; the poller idles when it
// is zero, so an unwatched house does not hammer the vendor API.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs)
}
