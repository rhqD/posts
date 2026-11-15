package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/events"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
)

type eventFixture struct {
	st       *filestore.File
	sessions *auth.Sessions
	az       *acl.Authorizer
	hub      *events.Hub
	api      *Server
}

func newEventFixture(t *testing.T) *eventFixture {
	t.Helper()
	st, err := filestore.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	f := &eventFixture{st: st, sessions: auth.NewSessions(st, time.Hour), az: acl.New(), hub: events.New()}
	f.api = New(Config{CookieName: "sid"}, st, f.sessions, f.az, nil, nil, nil, f.hub)
	for _, id := range []store.ID{"alice", "bob"} {
		if err := st.Users().Create(context.Background(), &store.User{ID: id, Phone: string(id)}); err != nil {
			t.Fatal(err)
		}
	}
	for _, key := range []string{"a", "b", "marker", "hidden", "blocked"} {
		if err := st.Devices().Upsert(context.Background(), &store.Device{Key: key, Hidden: key == "hidden"}); err != nil {
			t.Fatal(err)
		}
	}
	return f
}

func allow(user store.ID, resource, action string) store.Policy {
	return store.Policy{SubjectKind: store.KindUser, SubjectID: user, Resource: resource, Action: action, Effect: "allow"}
}

func (f *eventFixture) session(t *testing.T, id store.ID) *store.Session {
	t.Helper()
	u, err := f.st.Users().Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	session, err := f.sessions.Issue(context.Background(), u, "", "")
	if err != nil {
		t.Fatal(err)
	}
	return session
}

func TestEventFilterEnforcesDeviceVisibility(t *testing.T) {
	f := newEventFixture(t)
	deny := allow("alice", "device:blocked", "read")
	deny.Effect = "deny"
	f.az.Load([]store.Policy{allow("alice", "device:*", "read"), deny, allow("bob", "device:b", "read")})
	payload := []byte(`{"states":{"a":{"switch":"on"},"b":{"power":true},"hidden":{"secret":1},"blocked":{"secret":2},"missing":{"secret":3}},"unfilteredSecret":"must not escape"}`)
	for _, tc := range []struct {
		id   store.ID
		want string
	}{
		{"alice", `{"states":{"a":{"switch":"on"},"b":{"power":true}}}`},
		{"bob", `{"states":{"b":{"power":true}}}`},
	} {
		t.Run(string(tc.id), func(t *testing.T) {
			got, err := f.api.filterEventStates(context.Background(), store.Subject{Kind: store.KindUser, ID: tc.id}, payload)
			if err != nil {
				t.Fatal(err)
			}
			var actual, expected any
			if err := json.Unmarshal(got, &actual); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal([]byte(tc.want), &expected); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(actual, expected) {
				t.Fatalf("got %s; want %s", got, tc.want)
			}
		})
	}
	// The same control-implies-read rule as GET /devices applies to events.
	f.az.Load([]store.Policy{allow("alice", "device:a", "control")})
	got, err := f.api.filterEventStates(context.Background(), store.Subject{Kind: store.KindUser, ID: "alice"}, payload)
	if err != nil || string(got) != `{"states":{"a":{"switch":"on"}}}` {
		t.Fatalf("control implies read: %s, %v", got, err)
	}
	for _, payload := range []string{`{"states":{"b":{"secret":1}}}`, `{"states":{}}`, `{"secret":"no envelope"}`} {
		got, err := f.api.filterEventStates(context.Background(), store.Subject{Kind: store.KindUser, ID: "alice"}, []byte(payload))
		if err != nil || len(got) != 0 {
			t.Fatalf("unexpected frame: %s %v", got, err)
		}
	}
	if _, err := f.api.filterEventStates(context.Background(), store.Subject{}, []byte(`not-json`)); err == nil {
		t.Fatal("malformed event was accepted")
	}
}

type testEventStream struct {
	frames chan map[string]json.RawMessage
	done   chan struct{}
}

func (f *eventFixture) open(t *testing.T, server *httptest.Server, session *store.Session) *testEventStream {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, server.URL+"/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.AddCookie(&http.Cookie{Name: "sid", Value: string(session.ID)})
	res, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d", res.StatusCode)
	}
	if res.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatal("missing SSE content type")
	}
	stream := &testEventStream{frames: make(chan map[string]json.RawMessage, 16), done: make(chan struct{})}
	go func() {
		defer close(stream.done)
		defer close(stream.frames)
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			var frame struct {
				States map[string]json.RawMessage `json:"states"`
			}
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &frame); err != nil {
				continue
			}
			stream.frames <- frame.States
		}
	}()
	return stream
}

func (f *eventFixture) awaitSubscribers(t *testing.T, n int) {
	t.Helper()
	timeout := time.NewTimer(2 * time.Second)
	defer timeout.Stop()
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for f.hub.Count() != n {
		select {
		case <-timeout.C:
			t.Fatalf("subscribers: got %d, want %d", f.hub.Count(), n)
		case <-tick.C:
		}
	}
}

func expectEventKeys(t *testing.T, s *testEventStream, keys ...string) {
	t.Helper()
	select {
	case frame, ok := <-s.frames:
		if !ok {
			t.Fatal("stream closed unexpectedly")
		}
		if len(frame) != len(keys) {
			t.Fatalf("unexpected states %v; want keys %v", frame, keys)
		}
		for _, key := range keys {
			if _, ok := frame[key]; !ok {
				t.Fatalf("missing %s in %v", key, frame)
			}
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no filtered event")
	}
}

func TestEventStreamsIsolateUsersAndRecheckPermissions(t *testing.T) {
	f := newEventFixture(t)
	f.az.Load([]store.Policy{allow("alice", "device:a", "read"), allow("alice", "device:marker", "read"), allow("bob", "device:b", "control")})
	server := httptest.NewServer(f.api.Handler())
	t.Cleanup(server.Close)
	alice := f.open(t, server, f.session(t, "alice"))
	bob := f.open(t, server, f.session(t, "bob"))
	f.awaitSubscribers(t, 2)
	f.hub.Publish([]byte(`{"states":{"a":{"value":1},"b":{"value":2},"hidden":{"value":3}}}`))
	expectEventKeys(t, alice, "a")
	expectEventKeys(t, bob, "b")
	// Existing subscriptions must not keep the permissions they opened with.
	f.az.Load([]store.Policy{allow("alice", "device:marker", "read"), allow("bob", "device:b", "control")})
	f.hub.Publish([]byte(`{"states":{"a":{"secret":"revoked"},"b":{"value":4},"marker":{"value":5}}}`))
	expectEventKeys(t, alice, "marker")
	expectEventKeys(t, bob, "b")
	// Hidden/deleted devices are checked at delivery, not cached at subscription.
	f.az.Load([]store.Policy{allow("alice", "device:*", "read"), allow("bob", "device:b", "read")})
	if err := f.st.Devices().Delete(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	f.hub.Publish([]byte(`{"states":{"a":{"secret":"deleted"},"hidden":{"secret":"hidden"},"marker":{"value":6}}}`))
	expectEventKeys(t, alice, "marker")
}

func TestEventStreamsRejectInvalidSessions(t *testing.T) {
	f := newEventFixture(t)
	// Even an anonymous ACL grant must not silently enable public SSE.
	f.az.Load([]store.Policy{{SubjectKind: store.KindAnonymous, Resource: "*", Action: "*", Effect: "allow"}})
	expired := f.session(t, "alice")
	expired.ExpiresAt = time.Now().Add(-time.Second)
	if err := f.st.Sessions().Create(context.Background(), expired); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"", "unknown", string(expired.ID)} {
		t.Run(fmt.Sprintf("cookie-%s", id), func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/events", nil)
			if id != "" {
				req.AddCookie(&http.Cookie{Name: "sid", Value: id})
			}
			w := httptest.NewRecorder()
			f.api.Handler().ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("status %d", w.Code)
			}
		})
	}
	if f.hub.Count() != 0 {
		t.Fatal("invalid session subscribed")
	}
}

func TestEventStreamClosesWhenSessionBecomesInvalid(t *testing.T) {
	for _, reason := range []string{"revoked", "disabled", "expired"} {
		t.Run(reason, func(t *testing.T) {
			f := newEventFixture(t)
			f.az.Load([]store.Policy{allow("alice", "device:*", "read")})
			session := f.session(t, "alice")
			if reason == "expired" {
				session.ExpiresAt = time.Now().Add(500 * time.Millisecond)
				if err := f.st.Sessions().Create(context.Background(), session); err != nil {
					t.Fatal(err)
				}
			}
			server := httptest.NewServer(f.api.Handler())
			t.Cleanup(server.Close)
			stream := f.open(t, server, session)
			f.awaitSubscribers(t, 1)
			switch reason {
			case "revoked":
				if err := f.sessions.Revoke(context.Background(), session.ID); err != nil {
					t.Fatal(err)
				}
			case "disabled":
				u, err := f.st.Users().Get(context.Background(), "alice")
				if err != nil {
					t.Fatal(err)
				}
				now := time.Now()
				u.DisabledAt = &now
				if err := f.st.Users().Update(context.Background(), u); err != nil {
					t.Fatal(err)
				}
			}
			if reason != "expired" {
				f.hub.Publish([]byte(`{"states":{"a":{"secret":"after invalidation"}}}`))
			}
			select {
			case <-stream.done:
			case <-time.After(2 * time.Second):
				t.Fatal("invalid session kept streaming")
			}
			for frame := range stream.frames {
				t.Fatalf("data sent after invalidation: %v", frame)
			}
			f.awaitSubscribers(t, 0)
		})
	}
}
