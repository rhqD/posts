package sonoff_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"renhanquan/control/internal/device"
	"renhanquan/control/internal/device/sonoff"
)

type stub struct {
	srv      *httptest.Server
	listHits atomic.Int32
	lastBody map[string]any
	unauth   atomic.Bool
}

func newStub(t *testing.T) *stub {
	t.Helper()
	s := &stub{}
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/device/thing", func(w http.ResponseWriter, r *http.Request) {
		s.listHits.Add(1)
		if s.unauth.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		io.WriteString(w, `{"error":0,"data":{"thingList":[
			{"itemType":1,"itemData":{"deviceid":"1000abc","name":"Yard","roomName":"Garden",
			 "params":{"switch":"off","brightness":70,"rssi":-50,"sledOnline":true}}},
			{"itemType":2,"itemData":{"deviceid":"1000def","name":"Sensor",
			 "params":{"temperature":21.5,"humidity":44,"battery":90}}},
			{"itemType":3,"itemData":{"name":"Group only"}}
		]}}`)
	})
	mux.HandleFunc("/v2/device/thing/status", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		s.lastBody = body
		io.WriteString(w, `{"error":0,"data":{}}`)
	})
	s.srv = httptest.NewServer(mux)
	t.Cleanup(s.srv.Close)
	return s
}

func newProvider(t *testing.T, s *stub, ttl time.Duration) *sonoff.Provider {
	t.Helper()
	return sonoff.New("cn",
		sonoff.NewStaticToken("token-123"),
		sonoff.WithBaseURL(s.srv.URL),
		sonoff.WithCacheTTL(ttl),
		sonoff.WithMinGap(0),
	)
}

func TestDiscoverDerivesActions(t *testing.T) {
	s := newStub(t)
	p := newProvider(t, s, time.Minute)

	list, err := p.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("want 2 devices (group skipped), got %d", len(list))
	}

	byKey := map[string]device.Descriptor{}
	for _, d := range list {
		byKey[d.Key] = d
	}

	lamp := byKey["1000abc"]
	if _, ok := lamp.Actions["set_switch"]; !ok {
		t.Error("switch should become set_switch")
	}
	if _, ok := lamp.Actions["set_brightness"]; !ok {
		t.Error("brightness should become set_brightness")
	}
	if _, ok := lamp.Actions["set_rssi"]; ok {
		t.Error("rssi must stay read-only")
	}

	sensor := byKey["1000def"]
	if len(sensor.Actions) != 0 {
		t.Errorf("sensor should expose no actions, got %v", sensor.Actions)
	}
}

func TestReadIsCached(t *testing.T) {
	s := newStub(t)
	p := newProvider(t, s, time.Minute)
	ctx := context.Background()

	if _, err := p.Read(ctx, []string{"1000abc"}); err != nil {
		t.Fatal(err)
	}
	first := s.listHits.Load()

	got, err := p.Read(ctx, []string{"1000abc"})
	if err != nil {
		t.Fatal(err)
	}
	if s.listHits.Load() != first {
		t.Fatalf("second read within TTL should not hit the cloud (hits %d -> %d)", first, s.listHits.Load())
	}
	if got["1000abc"]["brightness"].(float64) != 70 {
		t.Errorf("unexpected readings: %v", got)
	}
}

func TestReadAfterTTLRefetches(t *testing.T) {
	s := newStub(t)
	p := newProvider(t, s, 10*time.Millisecond)
	ctx := context.Background()

	if _, err := p.Read(ctx, []string{"1000abc"}); err != nil {
		t.Fatal(err)
	}
	first := s.listHits.Load()
	time.Sleep(20 * time.Millisecond)
	if _, err := p.Read(ctx, []string{"1000abc"}); err != nil {
		t.Fatal(err)
	}
	if s.listHits.Load() <= first {
		t.Fatal("stale cache should trigger a refetch")
	}
}

func TestApplyShapesPayloadAndInvalidatesCache(t *testing.T) {
	s := newStub(t)
	p := newProvider(t, s, time.Minute)
	ctx := context.Background()

	if _, err := p.Read(ctx, []string{"1000abc"}); err != nil {
		t.Fatal(err)
	}
	hitsAfterRead := s.listHits.Load()

	err := p.Apply(ctx, "1000abc", device.Command{
		Action: "set_switch",
		Params: map[string]any{"value": true},
	})
	if err != nil {
		t.Fatal(err)
	}

	params, _ := s.lastBody["params"].(map[string]any)
	if params["switch"] != "on" {
		t.Errorf("switch should be serialised as on/off, got %v", params["switch"])
	}
	if s.lastBody["id"] != "1000abc" {
		t.Errorf("unexpected id %v", s.lastBody["id"])
	}
	if s.lastBody["type"].(float64) != 1 {
		t.Errorf("shared/group type should be carried from discovery, got %v", s.lastBody["type"])
	}

	// The write must drop the cache, so the next read refetches.
	if _, err := p.Read(ctx, []string{"1000abc"}); err != nil {
		t.Fatal(err)
	}
	if s.listHits.Load() <= hitsAfterRead {
		t.Error("write should invalidate the cache")
	}
}

func TestUnauthorizedSurfaces(t *testing.T) {
	s := newStub(t)
	s.unauth.Store(true)
	p := newProvider(t, s, time.Minute)

	if _, err := p.Discover(context.Background()); err == nil {
		t.Fatal("expected an auth error")
	}
	status := p.Status()
	if status["last_error"] == "" {
		t.Error("status should record the last error")
	}
}

func TestUnknownDeviceRefreshesOnce(t *testing.T) {
	s := newStub(t)
	p := newProvider(t, s, time.Minute)
	ctx := context.Background()

	if err := p.Apply(ctx, "1000abc", device.Command{
		Action: "set_switch", Params: map[string]any{"value": false},
	}); err != nil {
		t.Fatalf("provider should discover on demand: %v", err)
	}
	params, _ := s.lastBody["params"].(map[string]any)
	if params["switch"] != "off" {
		t.Errorf("got %v", params)
	}
}

func TestDiagnosticParamsAreNotActions(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"error":0,"data":{"thingList":[
			{"itemType":1,"itemData":{"deviceid":"1001abc","name":"Bedroom",
			 "params":{"switch":"off","rssi":-50,"excvaddr":0,"rstReason":3,
			           "depc":0,"longOffline":0,"epc1":0,"version":8}}}
		]}}`)
	}))
	defer srv.Close()

	p := sonoff.New("cn", sonoff.NewStaticToken("t"),
		sonoff.WithBaseURL(srv.URL), sonoff.WithMinGap(0))
	list, err := p.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("got %d devices", len(list))
	}
	acts := list[0].Actions
	if _, ok := acts["set_switch"]; !ok {
		t.Error("switch must remain controllable")
	}
	for _, bad := range []string{"set_excvaddr", "set_rstReason", "set_depc", "set_longOffline", "set_epc1", "set_version"} {
		if _, ok := acts[bad]; ok {
			t.Errorf("%s must not be an action: it is device state, not a control", bad)
		}
	}
}

func TestMultiGangUsesSwitchesArray(t *testing.T) {
	var got atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v2/device/thing" {
			io.WriteString(w, `{"error":0,"data":{"thingList":[
				{"itemType":1,"itemData":{"deviceid":"1001e500e6","name":"Floodlight","online":true,
				 "params":{"switches":[{"outlet":0,"switch":"off"},{"outlet":1,"switch":"off"},
				                       {"outlet":2,"switch":"off"},{"outlet":3,"switch":"off"}]}}}
			]}}`)
			return
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		got.Store(body)
		io.WriteString(w, `{"error":0,"data":{}}`)
	}))
	defer srv.Close()

	p := sonoff.New("cn", sonoff.NewStaticToken("t"), sonoff.WithBaseURL(srv.URL), sonoff.WithMinGap(0))
	list, err := p.Discover(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	spec, ok := list[0].Actions["set_switch"]
	if !ok {
		t.Fatal("multi-gang device must expose set_switch")
	}
	if spec.Outlets != 4 {
		t.Fatalf("outlets = %d, want 4", spec.Outlets)
	}

	if err := p.Apply(context.Background(), "1001e500e6", device.Command{
		Action: "set_switch",
		Params: map[string]any{"value": true, "outlet": float64(2)},
	}); err != nil {
		t.Fatal(err)
	}

	body, _ := got.Load().(map[string]any)
	params, _ := body["params"].(map[string]any)
	arr, _ := params["switches"].([]any)
	if len(arr) != 1 {
		t.Fatalf("expected one switches entry, got %v", params)
	}
	entry, _ := arr[0].(map[string]any)
	if entry["outlet"] != float64(2) || entry["switch"] != "on" {
		t.Fatalf("wrong payload: %v", entry)
	}
}
