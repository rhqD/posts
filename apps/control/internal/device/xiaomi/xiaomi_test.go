package xiaomi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"renhanquan/control/internal/device"
	"strings"
	"sync"
	"testing"
	"time"
)

func credential() Credentials {
	return Credentials{AccessToken: "old-access", RefreshToken: "old-refresh", Region: "cn", DeviceID: "ha.test", RedirectURL: "http://homeassistant.local:8123/api/webhook/test", ObtainedAt: time.Now().Unix(), ExpiresIn: 3600}
}
func TestRenewalRetriesPersistenceBeforeUsingRotatedPair(t *testing.T) {
	c := credential()
	c.ObtainedAt -= 7200
	renewals, writes := 0, 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		renewals++
		var q map[string]any
		json.Unmarshal([]byte(r.URL.Query().Get("data")), &q)
		if q["refresh_token"] != c.RefreshToken {
			t.Error("wrong refresh identity")
		}
		fmt.Fprint(w, `{"code":0,"result":{"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600}}`)
	}))
	defer srv.Close()
	var saved Credentials
	tok, _ := NewTokens(c, func(_ context.Context, v Credentials) error {
		writes++
		saved = v
		if writes == 1 {
			return errors.New("OOS unavailable")
		}
		return nil
	})
	tok.base = srv.URL
	if _, err := tok.Current(context.Background()); err == nil {
		t.Fatal("used credentials before persistence")
	}
	if _, err := tok.Current(context.Background()); err != nil {
		t.Fatal(err)
	}
	if renewals != 1 || writes != 2 || saved.RefreshToken != "new-refresh" || saved.RedirectURL != c.RedirectURL || saved.DeviceID != c.DeviceID {
		t.Fatal("rotated again or lost OAuth identity")
	}
	restart, _ := NewTokens(saved, func(context.Context, Credentials) error { return nil })
	v, err := restart.Current(context.Background())
	if err != nil || v.AccessToken != "new-access" {
		t.Fatal("restart lost rotated credential")
	}
	raw, _ := json.Marshal(tok.Status())
	if strings.Contains(string(raw), "new-access") || strings.Contains(string(raw), "new-refresh") {
		t.Fatal("health leaked secrets")
	}
}
func TestTransportErrorRedactsRefreshQuery(t *testing.T) {
	c := credential()
	c.ObtainedAt -= 7200
	tok, _ := NewTokens(c, func(context.Context, Credentials) error { return nil })
	tok.base = "http://127.0.0.1:1"
	_, err := tok.Current(context.Background())
	if err == nil || strings.Contains(err.Error(), c.RefreshToken) || strings.Contains(err.Error(), "data=") {
		t.Fatal("missing or unredacted error")
	}
}

type stub struct {
	mu            sync.Mutex
	reads, writes int
}

func fixture(t *testing.T) (*Provider, *stub) {
	t.Helper()
	s := &stub{}
	c := credential()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer"+c.AccessToken {
			t.Error("wrong authorization header")
		}
		switch r.URL.Path {
		case "/app/v2/homeroom/gethome":
			fmt.Fprint(w, `{"code":0,"result":{"homelist":[{"dids":["ac1","ac2"]}]}}`)
		case "/app/v2/home/device_list_page":
			fmt.Fprint(w, `{"code":0,"result":{"list":[{"did":"ac1","name":"AC","model":"xiaomi.airc.h09h00","isOnline":true,"token":"PRIVATE","ssid":"PRIVATE","local_ip":"192.168.1.7"},{"did":"ac2","name":"Unselected","model":"xiaomi.airc.h09h00","isOnline":true}]}}`)
		case "/app/v2/miotspec/prop/get":
			s.reads++
			fmt.Fprint(w, `{"code":0,"result":[{"did":"ac1","siid":2,"piid":1,"value":false,"code":0},{"did":"ac1","siid":2,"piid":4,"value":24,"code":0},{"did":"ac1","siid":6,"piid":1,"value":true,"code":0},{"did":"ac1","siid":39,"piid":1,"value":"PRIVATE","code":0}]}`)
		case "/app/v2/miotspec/prop/set":
			s.writes++
			var in struct {
				Params []propertyValue `json:"params"`
			}
			json.NewDecoder(r.Body).Decode(&in)
			fmt.Fprintf(w, `{"code":0,"result":[{"did":"ac1","siid":%d,"piid":%d,"code":0}]}`, in.Params[0].SIID, in.Params[0].PIID)
		default:
			t.Error("unexpected cloud endpoint")
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	tok, _ := NewTokens(c, func(context.Context, Credentials) error { return nil })
	p := New(tok, "cn", []string{"ac1"})
	p.cloud.base = srv.URL
	if _, err := p.Discover(context.Background()); err != nil {
		t.Fatal(err)
	}
	return p, s
}
func TestAllowlistPrivacyAndCacheReads(t *testing.T) {
	p, s := fixture(t)
	if len(p.devices) != 1 {
		t.Fatal("unselected device imported")
	}
	for i := 0; i < 5; i++ {
		state, _ := p.Read(context.Background(), []string{"xiaomi-ac1"})
		raw, _ := json.Marshal(state)
		if strings.Contains(string(raw), "PRIVATE") || strings.Contains(string(raw), "local_ip") {
			t.Fatal("private state leaked")
		}
		state["xiaomi-ac1"]["switch"] = true
	}
	if s.reads != 1 {
		t.Fatal("cache reads polled cloud")
	}
	state, _ := p.Read(context.Background(), []string{"xiaomi-ac1"})
	if state["xiaomi-ac1"]["switch"] != false {
		t.Fatal("caller mutated cache")
	}
}
func TestCommandValidation(t *testing.T) {
	p, s := fixture(t)
	ctx := context.Background()
	for _, cmd := range []device.Command{
		{Action: "set_targetTemperature", Params: map[string]any{"value": 24.25}},
		{Action: "set_targetTemperature", Params: map[string]any{"value": 32.0}},
		{Action: "set_switch", Params: map[string]any{"value": "on"}},
		{Action: "set_indicator", Params: map[string]any{"value": false, "siid": 39.0}},
		{Action: "set_system-parm", Params: map[string]any{"value": true}},
	} {
		if p.Apply(ctx, "xiaomi-ac1", cmd) == nil {
			t.Fatal("accepted invalid command")
		}
	}
	if s.writes != 0 {
		t.Fatal("invalid command reached cloud")
	}
	if err := p.Apply(ctx, "xiaomi-ac1", device.Command{Action: "set_targetTemperature", Params: map[string]any{"value": 24.5}}); err != nil {
		t.Fatal(err)
	}
	if s.writes != 1 {
		t.Fatal("valid command not sent")
	}
}
func TestPushValidationAndConcurrentCache(t *testing.T) {
	p, _ := fixture(t)
	for _, msg := range []struct{ topic, body string }{
		{"device/ac2/up/properties_changed/2/1", `{"params":{"siid":2,"piid":1,"value":true}}`},
		{"device/ac1/up/properties_changed/2/1", `{"params":{"siid":39,"piid":1,"value":"PRIVATE"}}`},
		{"device/ac1/up/properties_changed/6/1", `{"params":{"siid":2,"piid":1,"value":true}}`},
		{"device/ac1/up/properties_changed/2/1", `{"params":{"siid":2,"piid":1,"value":"true"}}`},
		{"device/ac1/state/offline", `{"device_id":"ac2","event":"offline"}`},
	} {
		p.handleMessage(msg.topic, []byte(msg.body))
	}
	state, _ := p.Read(context.Background(), []string{"xiaomi-ac1"})
	if state["xiaomi-ac1"]["switch"] != false || !p.devices["xiaomi-ac1"].desc.Online {
		t.Fatal("untrusted push changed cache")
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			p.handleMessage("device/ac1/up/properties_changed/6/1", []byte(`{"params":{"siid":6,"piid":1,"value":false}}`))
		}()
		go func() { defer wg.Done(); p.Read(context.Background(), []string{"xiaomi-ac1"}) }()
	}
	wg.Wait()
	state, _ = p.Read(context.Background(), []string{"xiaomi-ac1"})
	if state["xiaomi-ac1"]["indicator"] != false {
		t.Fatal("push ignored")
	}
	p.handleMessage("device/ac1/state/offline", []byte(`{"device_id":"ac1","event":"offline"}`))
	if p.devices["xiaomi-ac1"].desc.Online {
		t.Fatal("offline notification ignored")
	}
}

func TestLateHTTPReadbackCannotOverwriteNewerPush(t *testing.T) {
	p, _ := fixture(t)
	revision := p.revision
	p.handleMessage("device/ac1/up/properties_changed/6/1", []byte(`{"params":{"siid":6,"piid":1,"value":false}}`))
	var b binding
	for _, candidate := range acBindings {
		if candidate.name == "indicator" {
			b = candidate
		}
	}
	p.acceptReadback("xiaomi-ac1", b, true, revision)
	states, _ := p.Read(context.Background(), []string{"xiaomi-ac1"})
	if states["xiaomi-ac1"]["indicator"] != false {
		t.Fatal("stale HTTP response overwrote real-time state")
	}
	pushed := false
	for len(p.updates) > 0 {
		u := <-p.updates
		if u.Pushed && u.State["indicator"] == false {
			pushed = true
		}
	}
	if !pushed {
		t.Fatal("real MQTT notification not distinguished from snapshot")
	}
}
