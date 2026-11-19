package xiaomi

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/eclipse/paho.golang/autopaho"
	"github.com/eclipse/paho.golang/paho"
	"renhanquan/control/internal/device"
)

func (p *Provider) connectedState(connected bool) {
	p.mu.Lock()
	p.connected = connected
	keys := make([]string, 0, len(p.devices))
	for key := range p.devices {
		keys = append(keys, key)
	}
	p.mu.Unlock()
	for _, key := range keys {
		p.notify(key)
	}
}
func (p *Provider) topics() []paho.SubscribeOptions {
	p.mu.RLock()
	defer p.mu.RUnlock()
	var topics []paho.SubscribeOptions
	for _, d := range p.devices {
		topics = append(topics, paho.SubscribeOptions{Topic: "device/" + d.did + "/up/properties_changed/#"}, paho.SubscribeOptions{Topic: "device/" + d.did + "/state/#"})
	}
	return topics
}
func (p *Provider) handleMessage(topic string, payload []byte) {
	parts := strings.Split(topic, "/")
	if len(parts) < 4 || parts[0] != "device" || len(payload) > 64<<10 {
		return
	}
	key := "xiaomi-" + parts[1]
	p.mu.RLock()
	_, known := p.devices[key]
	p.mu.RUnlock()
	if !known {
		return
	}
	if len(parts) == 6 && parts[2] == "up" && parts[3] == "properties_changed" {
		var body struct {
			Params struct {
				SIID  int `json:"siid"`
				PIID  int `json:"piid"`
				Value any `json:"value"`
			} `json:"params"`
		}
		if json.Unmarshal(payload, &body) != nil {
			return
		}
		for _, b := range acBindings {
			if body.Params.SIID == b.siid && body.Params.PIID == b.piid && valid(b, body.Params.Value) {
				// Topic and body must agree; do not accept arbitrary cross-property writes.
				if parts[4] != itoa(b.siid) || parts[5] != itoa(b.piid) {
					return
				}
				p.mu.Lock()
				p.lastPush = time.Now()
				p.mu.Unlock()
				p.acceptValue(key, b, body.Params.Value, true)
				return
			}
		}
	} else if len(parts) == 4 && parts[2] == "state" {
		var body struct {
			Event string `json:"event"`
			DID   string `json:"device_id"`
		}
		if json.Unmarshal(payload, &body) != nil || body.DID != parts[1] || body.Event != parts[3] || (body.Event != "online" && body.Event != "offline") {
			return
		}
		p.mu.Lock()
		if d := p.devices[key]; d != nil {
			d.desc.Online = body.Event == "online"
		}
		p.lastPush = time.Now()
		p.mu.Unlock()
		p.notify(key, true)
	}
}
func itoa(n int) string { // small spec instance IDs; use strconv without accepting topic wildcards
	return strconv.Itoa(n)
}

// Run holds one outbound MQTT v5/TLS connection. There is no broker process,
// LAN discovery, or periodic device-status polling. Reconnect and configuration
// changes subscribe again and reconcile a single cloud snapshot.
func (p *Provider) Run(ctx context.Context, emit func(device.Update)) {
	workerCtx, cancelWorker := context.WithCancel(ctx)
	defer cancelWorker()
	go func() {
		for {
			select {
			case u := <-p.updates:
				emit(u)
			case <-workerCtx.Done():
				return
			}
		}
	}()
	for ctx.Err() == nil {
		// Drain discovery notifications already reflected in the current topic set.
		select {
		case <-p.reconfigure:
		default:
		}
		cred, err := p.tokens.Current(ctx)
		if err != nil {
			p.setError("xiaomi: credentials unavailable")
			if !wait(ctx, 10*time.Second) {
				return
			}
			continue
		}
		if len(p.topics()) == 0 {
			select {
			case <-p.reconfigure:
				continue
			case <-ctx.Done():
				return
			}
		}
		runCtx, cancel := context.WithCancel(ctx)
		broker, _ := url.Parse("tls://" + p.region + "-ha.mqtt.io.mi.com:8883")
		manager, err := autopaho.NewConnection(runCtx, autopaho.ClientConfig{
			ServerUrls: []*url.URL{broker}, TlsCfg: &tls.Config{MinVersion: tls.VersionTLS12}, KeepAlive: 60,
			CleanStartOnInitialConnection: true, ConnectTimeout: 15 * time.Second,
			ConnectUsername: ClientID, ConnectPassword: []byte(cred.AccessToken),
			ReconnectBackoff: func(attempt int) time.Duration {
				if attempt > 5 {
					attempt = 5
				}
				return time.Second * time.Duration(2<<attempt)
			},
			ConnectPacketBuilder: func(packet *paho.Connect, _ *url.URL) (*paho.Connect, error) {
				current, e := p.tokens.Current(runCtx)
				if e != nil {
					return nil, e
				}
				packet.Password = []byte(current.AccessToken)
				return packet, nil
			},
			OnConnectionUp: func(cm *autopaho.ConnectionManager, _ *paho.Connack) {
				subCtx, stop := context.WithTimeout(runCtx, 15*time.Second)
				defer stop()
				topics := p.topics()
				ack, e := cm.Subscribe(subCtx, &paho.Subscribe{Subscriptions: topics})
				if e != nil {
					p.setError("xiaomi: MQTT subscription failed")
					cancel()
					return
				}
				if ack == nil || len(ack.Reasons) != len(topics) || runCtx.Err() != nil {
					p.setError("xiaomi: incomplete MQTT subscription")
					cancel()
					return
				}
				for _, code := range ack.Reasons {
					if code >= 128 {
						p.setError("xiaomi: MQTT subscription rejected")
						cancel()
						return
					}
				}
				if e := p.snapshot(subCtx); e != nil {
					p.setError(e.Error())
					cancel()
					return
				}
				if runCtx.Err() == nil {
					p.connectedState(true)
				}
			},
			OnConnectError: func(error) { p.connectedState(false); p.setError("xiaomi: MQTT connection failed") },
			ClientConfig: paho.ClientConfig{
				ClientID:           cred.DeviceID,
				OnClientError:      func(error) { p.connectedState(false); p.setError("xiaomi: MQTT disconnected") },
				OnServerDisconnect: func(*paho.Disconnect) { p.connectedState(false); p.setError("xiaomi: MQTT server disconnected") },
				OnPublishReceived: []func(paho.PublishReceived) (bool, error){func(r paho.PublishReceived) (bool, error) {
					p.handleMessage(r.Packet.Topic, r.Packet.Payload)
					return true, nil
				}},
			},
		})
		if err != nil {
			cancel()
			p.setError("xiaomi: MQTT initialization failed")
			if !wait(ctx, 10*time.Second) {
				return
			}
			continue
		}
		ticker := time.NewTicker(time.Minute)
		running := true
		for running {
			select {
			case <-runCtx.Done():
				running = false
			case <-ctx.Done():
				running = false
			case <-p.reconfigure:
				running = false
			case <-ticker.C:
				current, e := p.tokens.Current(ctx)
				if e != nil {
					p.setError(e.Error())
					if current.AccessToken == "" {
						p.connectedState(false)
						running = false
					}
				} else if current.AccessToken != cred.AccessToken {
					running = false
				}
			}
		}
		ticker.Stop()
		stopCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
		_ = manager.Disconnect(stopCtx)
		stop()
		cancel()
		p.connectedState(false)
		if !wait(ctx, 3*time.Second) {
			return
		}
	}
}
func wait(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}
