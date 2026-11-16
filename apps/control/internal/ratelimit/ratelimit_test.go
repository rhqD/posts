package ratelimit

import (
	"fmt"
	"testing"
	"time"
)

func TestLimiterBoundsBucketsAndReclaimsExpiredSources(t *testing.T) {
	l := New(time.Minute, 2)
	for i := 0; i < 10000; i++ {
		if !l.Allow(fmt.Sprint(i)) {
			t.Fatal("early capacity rejection")
		}
	}
	if l.Allow("overflow") || len(l.buckets) != 10000 {
		t.Fatal("unbounded limiter")
	}
	if !l.Allow("0") || l.Allow("0") {
		t.Fatal("existing source limit changed")
	}
	l.buckets["0"].reset = time.Now().Add(-time.Second)
	l.nextSweep = time.Time{}
	if !l.Allow("replacement") || len(l.buckets) != 10000 {
		t.Fatal("expired bucket not reclaimed")
	}
}
