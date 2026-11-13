package events_test

import (
	"testing"
	"time"

	"renhanquan/control/internal/events"
)

func TestPublishReachesSubscribers(t *testing.T) {
	h := events.New()
	ch, cancel := h.Subscribe()
	defer cancel()

	if h.Count() != 1 {
		t.Fatalf("count = %d", h.Count())
	}
	h.Publish([]byte("hello"))

	select {
	case got := <-ch:
		if string(got) != "hello" {
			t.Fatalf("got %q", got)
		}
	case <-time.After(time.Second):
		t.Fatal("no message")
	}
}

func TestSlowSubscriberDoesNotBlock(t *testing.T) {
	h := events.New()
	_, cancel := h.Subscribe()
	defer cancel()

	// Far more messages than the buffer holds: publish must never block.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			h.Publish([]byte("x"))
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publish blocked on a slow subscriber")
	}
}

func TestCancelClosesChannelAndCount(t *testing.T) {
	h := events.New()
	ch, cancel := h.Subscribe()
	cancel()

	if h.Count() != 0 {
		t.Fatalf("count after cancel = %d", h.Count())
	}
	if _, ok := <-ch; ok {
		t.Fatal("channel should be closed")
	}
	// Publishing with no subscribers, and cancelling twice, must not panic.
	h.Publish([]byte("after"))
	cancel()
}
