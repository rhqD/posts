// xiaomi-check is an operator-only OOS/HTTP/MQTT check. Never run it alongside
// the production Xiaomi provider: Xiaomi permits one connection per client ID.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"renhanquan/control/internal/aliyun"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/device/xiaomi"
	"strings"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	cycle := flag.Bool("cycle-indicator", false, "briefly toggle and restore the AC indicator to verify a real push")
	refresh := flag.Bool("refresh", false, "renew the cloud credentials and verify OOS readback")
	pending := flag.String("pending-file", "", "private recovery file if a staged OOS renewal write fails")
	flag.Parse()
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	role := os.Getenv("ALIYUN_ROLE_NAME")
	if role == "" {
		role = os.Getenv("SMS_ROLE_NAME")
	}
	if role == "" {
		return errors.New("ECS role required")
	}
	creds := &aliyun.ECSRoleCreds{Role: role}
	region := os.Getenv("ALIYUN_REGION")
	if region == "" {
		region = "cn-beijing"
	}
	name := os.Getenv("XIAOMI_SECRET_PARAM")
	if name == "" {
		return errors.New("XIAOMI_SECRET_PARAM required")
	}
	raw, err := aliyun.GetSecretParameter(ctx, nil, region, creds, name)
	if err != nil {
		return errors.New("OOS read failed")
	}
	var bundle xiaomi.Credentials
	if json.Unmarshal([]byte(raw), &bundle) != nil {
		return errors.New("invalid credential JSON")
	}
	tokens, err := xiaomi.NewTokens(bundle, func(ctx context.Context, next xiaomi.Credentials) error {
		payload, _ := json.Marshal(next)
		err := aliyun.UpdateSecretParameter(ctx, nil, region, creds, name, string(payload))
		if err != nil && *pending != "" {
			f, saveErr := os.OpenFile(*pending, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
			if saveErr == nil {
				saveErr = f.Chmod(0600)
				if saveErr == nil {
					_, saveErr = f.Write(payload)
				}
				_ = f.Close()
			}
			if saveErr != nil {
				return errors.New("OOS writeback and private recovery save both failed")
			}
			fmt.Fprintln(os.Stderr, "OOS writeback failed; rotated credentials retained in private recovery file")
		}
		return err
	})
	if err != nil {
		return err
	}
	if *refresh {
		renewed, err := tokens.Refresh(ctx)
		if err != nil {
			return err
		}
		latest, err := aliyun.GetSecretParameter(ctx, nil, region, creds, name)
		if err != nil {
			return errors.New("OOS renewal readback failed")
		}
		var saved xiaomi.Credentials
		if json.Unmarshal([]byte(latest), &saved) != nil || saved != renewed {
			return errors.New("OOS renewal readback mismatch")
		}
		fmt.Println(`{"credential_refresh":true,"oos_readback":true}`)
	}
	p := xiaomi.New(tokens, bundle.Region, strings.Split(os.Getenv("XIAOMI_DEVICE_IDS"), ","))
	list, err := p.Discover(ctx)
	if err != nil {
		return err
	}
	if len(list) != 1 {
		return errors.New("exactly one allowlisted AC required for this check")
	}
	key := list[0].Key
	states, err := p.Read(ctx, []string{key})
	if err != nil {
		return err
	}
	initial := states[key]
	fmt.Printf("cloud_snapshot: %s\n", mustJSON(initial))
	events := make(chan device.Update, 128)
	go p.Run(ctx, func(u device.Update) {
		select {
		case events <- u:
		case <-ctx.Done():
		}
	})
	deadline := time.NewTimer(25 * time.Second)
	defer deadline.Stop()
	for p.Status()["mqtt_connected"] != true {
		select {
		case <-events:
		case <-time.After(100 * time.Millisecond):
		case <-deadline.C:
			return errors.New("MQTT did not subscribe")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	fmt.Println(`{"mqtt_subscribed":true}`)
	if !*cycle {
		return nil
	}
	original, ok := initial["indicator"].(bool)
	if !ok {
		return errors.New("indicator state unavailable")
	}
	// Detached restore context survives the check deadline. This does not alter
	// power, mode, or temperature. State must match the actual observed baseline.
	attempted := false
	defer func() {
		if attempted {
			restoreCtx, stop := context.WithTimeout(context.Background(), 20*time.Second)
			defer stop()
			err := p.Apply(restoreCtx, key, device.Command{Action: "set_indicator", Params: map[string]any{"value": original}})
			restored := false
			// Cloud readback and MQTT delivery are asynchronous. Give the real
			// notification time to arrive instead of treating an old cache value
			// immediately after the write as a failed physical restoration.
			deadline := time.Now().Add(6 * time.Second)
			for err == nil && time.Now().Before(deadline) {
				states, _ := p.Read(restoreCtx, []string{key})
				if states[key]["indicator"] == original {
					restored = true
					break
				}
				time.Sleep(100 * time.Millisecond)
			}
			fmt.Printf("{\"indicator_restored\":%t}\n", restored)
			if !restored {
				fmt.Fprintln(os.Stderr, "RESTORE FAILED: check AC indicator manually")
				os.Exit(2)
			}
		}
	}()
	// Discard snapshot notifications; only Pushed=true can prove MQTT delivery.
	for len(events) > 0 {
		<-events
	}
	attempted = true
	started := time.Now()
	if err := p.Apply(ctx, key, device.Command{Action: "set_indicator", Params: map[string]any{"value": !original}}); err != nil {
		return err
	}
	timeout := time.NewTimer(15 * time.Second)
	defer timeout.Stop()
	for {
		select {
		case u := <-events:
			if u.Key == key && u.Pushed && u.State["indicator"] == !original {
				fmt.Printf("{\"cloud_control\":true,\"mqtt_push\":true,\"latency_ms\":%d}\n", time.Since(started).Milliseconds())
				return nil
			}
		case <-timeout.C:
			return errors.New("cloud control succeeded but no matching MQTT push received")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }
