package filestore

import (
	"context"
	"sort"

	"renhanquan/control/internal/store"
)

type users struct{ f *File }

func (r *users) Get(_ context.Context, id store.ID) (*store.User, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	u, ok := r.f.users[id]
	if !ok {
		return nil, notFound("user", id)
	}
	c := *u
	return &c, nil
}

func (r *users) GetByPhone(_ context.Context, phone string) (*store.User, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	id, ok := r.f.phones[phone]
	if !ok {
		return nil, notFound("phone", store.MaskPhone(phone))
	}
	c := *r.f.users[id]
	return &c, nil
}

func (r *users) Create(_ context.Context, u *store.User) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	c := *u
	r.f.users[u.ID] = &c
	r.f.phones[u.Phone] = u.ID
	return nil
}

func (r *users) Update(_ context.Context, u *store.User) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	if _, ok := r.f.users[u.ID]; !ok {
		return notFound("user", u.ID)
	}
	c := *u
	r.f.users[u.ID] = &c
	r.f.phones[u.Phone] = u.ID
	return nil
}

func (r *users) List(_ context.Context) ([]*store.User, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	out := make([]*store.User, 0, len(r.f.users))
	for _, u := range r.f.users {
		c := *u
		out = append(out, &c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out, nil
}

type policies struct{ f *File }

func (r *policies) ListBySubject(_ context.Context, kind store.SubjectKind, id store.ID) ([]store.Policy, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	out := make([]store.Policy, 0, len(r.f.policies))
	for _, p := range r.f.policies {
		if p.SubjectKind == kind && p.SubjectID == id {
			out = append(out, p)
		}
	}
	return out, nil
}

func (r *policies) ListAll(_ context.Context) ([]store.Policy, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	out := make([]store.Policy, 0, len(r.f.policies))
	for _, p := range r.f.policies {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].GrantedAt.Before(out[j].GrantedAt) })
	return out, nil
}

func (r *policies) Insert(_ context.Context, p *store.Policy) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	r.f.policies[p.ID] = *p
	return nil
}

func (r *policies) Delete(_ context.Context, id store.ID) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	if _, ok := r.f.policies[id]; !ok {
		return notFound("policy", id)
	}
	delete(r.f.policies, id)
	return nil
}

type devices struct{ f *File }

func (r *devices) Get(_ context.Context, key string) (*store.Device, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	d, ok := r.f.devices[key]
	if !ok {
		return nil, notFound("device", key)
	}
	c := *d
	return &c, nil
}

func (r *devices) List(_ context.Context) ([]*store.Device, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	out := make([]*store.Device, 0, len(r.f.devices))
	for _, d := range r.f.devices {
		c := *d
		out = append(out, &c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out, nil
}

func (r *devices) Upsert(_ context.Context, d *store.Device) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	c := *d
	r.f.devices[d.Key] = &c
	return nil
}

type sessions struct{ f *File }

func (r *sessions) Get(_ context.Context, id store.ID) (*store.Session, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	s, ok := r.f.sessions[id]
	if !ok {
		return nil, notFound("session", id)
	}
	c := *s
	return &c, nil
}

func (r *sessions) Create(_ context.Context, s *store.Session) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	c := *s
	r.f.sessions[s.ID] = &c
	return nil
}

func (r *sessions) Delete(_ context.Context, id store.ID) error {
	r.f.mu.Lock()
	defer r.f.mu.Unlock()
	delete(r.f.sessions, id)
	return nil
}

func (r *sessions) List(_ context.Context) ([]*store.Session, error) {
	r.f.mu.RLock()
	defer r.f.mu.RUnlock()
	out := make([]*store.Session, 0, len(r.f.sessions))
	for _, s := range r.f.sessions {
		c := *s
		out = append(out, &c)
	}
	return out, nil
}
