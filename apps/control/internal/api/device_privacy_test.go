package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/device/sonoff"
	"renhanquan/control/internal/store"
	"strings"
	"testing"
)

func TestVendorPrivateFieldsNeverReachDeviceResponsesOrEvents(t *testing.T) {
	f, root, _ := managementFixture(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"error":0,"data":{"thingList":[{"itemType":1,"itemData":{"deviceid":"lamp","name":"Lamp","online":true,"params":{"switch":"off","temperature":22,"ssid":"PRIVATE_WIFI","bssid":"PRIVATE_MAC","staMac":"PRIVATE_DEVICE","bindInfos":{"owner":"PRIVATE_OWNER"},"unknownField":"PRIVATE_FUTURE","voltage":{"secret":"PRIVATE_NESTED"},"switches":[{"outlet":0,"switch":"on","token":"PRIVATE_GANG"}]}}}]}}`))
	}))
	defer upstream.Close()
	p := sonoff.New("cn", sonoff.NewStaticToken("test"), sonoff.WithBaseURL(upstream.URL), sonoff.WithMinGap(0))
	f.api.provider = p
	if err := device.Sync(context.Background(), f.st, p); err != nil {
		t.Fatal(err)
	}
	requireStatus(t, callManagement(f, root, "PUT", "/admin/access", map[string]any{"subject_kind": "anonymous", "subject_id": "", "device_key": "lamp", "access": "read"}), 200)
	list := callManagement(f, nil, "GET", "/devices", nil)
	requireStatus(t, list, 200)
	if strings.Contains(list.Body.String(), "PRIVATE_") || !strings.Contains(list.Body.String(), `"temperature":22`) {
		t.Fatal("unsafe or missing list state", list.Body.String())
	}
	states, err := p.Read(context.Background(), []string{"lamp"})
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"states": states})
	frame, err := f.api.filterEventStates(context.Background(), store.Anonymous(), payload)
	if err != nil || strings.Contains(string(frame), "PRIVATE_") || !strings.Contains(string(frame), `"switch":"on"`) {
		t.Fatal("unsafe or missing event state", string(frame), err)
	}
	// Command acknowledgements use this same filtered provider cache.
	if strings.Contains(string(payload), "PRIVATE_") {
		t.Fatal("provider cache contains private metadata")
	}
}
