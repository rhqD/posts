// Package sms sends and checks login codes.
package sms

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"
)

type Provider interface {
	Name() string
	Send(ctx context.Context, phone string) error
	Check(ctx context.Context, phone, code string) (bool, error)
}

func sixDigits() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64())
}

type pending struct {
	code  string
	exp   time.Time
	tries int
}

// Fake is for local development: it prints the code instead of sending it.
type Fake struct {
	mu  sync.Mutex
	m   map[string]pending
	ttl time.Duration
	out func(string)
}

func NewFake(out func(string)) *Fake {
	if out == nil {
		out = func(s string) { fmt.Println(s) }
	}
	return &Fake{m: map[string]pending{}, ttl: 5 * time.Minute, out: out}
}

func (f *Fake) Name() string { return "fake" }

func (f *Fake) Send(_ context.Context, phone string) error {
	code := sixDigits()
	f.mu.Lock()
	f.m[phone] = pending{code: code, exp: time.Now().Add(f.ttl)}
	f.mu.Unlock()
	f.out("[sms:fake] " + phone + " code=" + code)
	return nil
}

func (f *Fake) Check(_ context.Context, phone, code string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.m[phone]
	if !ok || time.Now().After(p.exp) {
		delete(f.m, phone)
		return false, nil
	}
	p.tries++
	if p.tries > 5 {
		delete(f.m, phone)
		return false, nil
	}
	if p.code != code {
		f.m[phone] = p
		return false, nil
	}
	delete(f.m, phone)
	return true, nil
}
