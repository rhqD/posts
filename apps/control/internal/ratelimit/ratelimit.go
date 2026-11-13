package ratelimit

import (
	"sync"
	"time"
)

// Limiter is a tiny fixed-window limiter. It exists to stop SMS abuse and
// anonymous write floods, not to be a general-purpose rate limiter.
type Limiter struct {
	mu      sync.Mutex
	window  time.Duration
	limit   int
	buckets map[string]*bucket
}

type bucket struct {
	count int
	reset time.Time
}

func New(window time.Duration, limit int) *Limiter {
	return &Limiter{window: window, limit: limit, buckets: map[string]*bucket{}}
}

// Allow consumes one token for key. Callers that need to know the outcome get
// a plain bool; there is no retry-after bookkeeping here.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b, ok := l.buckets[key]
	if !ok || now.After(b.reset) {
		l.buckets[key] = &bucket{count: 1, reset: now.Add(l.window)}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}

func (l *Limiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, b := range l.buckets {
		if now.After(b.reset) {
			delete(l.buckets, k)
		}
	}
}
