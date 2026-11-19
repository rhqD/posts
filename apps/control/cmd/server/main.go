// Command server runs the household control API.
//
// It is deliberately a single binary with a file-backed store: no external
// services, no ORM, no migrations. Everything it needs is a directory of JSON.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/aliyun"
	"renhanquan/control/internal/api"
	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/device/composite"
	"renhanquan/control/internal/device/mock"
	"renhanquan/control/internal/device/sonoff"
	"renhanquan/control/internal/device/unavailable"
	"renhanquan/control/internal/device/xiaomi"
	"renhanquan/control/internal/events"
	"renhanquan/control/internal/sms"
	"renhanquan/control/internal/store"
	"renhanquan/control/internal/store/filestore"
)

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)

	if len(os.Args) > 1 && os.Args[1] == "verify" {
		os.Exit(verifyAudit())
	}

	addr := env("ADDR", ":8080")
	dataDir := env("DATA_DIR", "./data")
	cookieName := env("COOKIE_NAME", "sid")
	cookieSecure := env("COOKIE_SECURE", "true") == "true"
	cookieDomain := os.Getenv("COOKIE_DOMAIN")
	adminPhone := os.Getenv("ADMIN_PHONE")
	ttl := durationEnv("SESSION_TTL", 720*time.Hour)

	allowed := map[string]bool{}
	for _, p := range splitList(os.Getenv("ALLOWED_PHONES")) {
		allowed[p] = true
	}
	if len(allowed) == 0 {
		log.Fatal("ALLOWED_PHONES is empty: nobody would be able to log in")
	}

	ctx, cancelBackground := context.WithCancel(context.Background())
	defer cancelBackground()

	st, err := filestore.Open(dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	az := acl.New()
	if err := reloadACL(ctx, st, az); err != nil {
		log.Fatalf("load policies: %v", err)
	}

	al, err := audit.New(st)
	if err != nil {
		log.Fatalf("audit: %v", err)
	}
	defer al.Close()

	prov, err := newDeviceProvider(ctx)
	if err != nil {
		// Degrade instead of dying: authentication is the service's main job and
		// must keep working even when a vendor credential is broken. The reason
		// is visible in /admin/status.
		log.Printf("device provider unavailable: %v", err)
		prov = unavailable.Provider{Err: err}
	}
	log.Printf("device provider: %s", prov.Name())
	if err := syncDevices(ctx, st, prov); err != nil {
		log.Fatalf("sync devices: %v", err)
	}

	if err := bootstrap(ctx, st, az, adminPhone, ttl); err != nil {
		log.Fatalf("bootstrap: %v", err)
	}

	if err := auth.SeedBuiltin(ctx, st, allowed); err != nil {
		log.Fatalf("seed builtin users: %v", err)
	}

	sp, err := newSMSProvider()
	if err != nil {
		log.Fatalf("sms: %v", err)
	}
	log.Printf("sms provider: %s", sp.Name())

	sessions := auth.NewSessions(st, ttl)
	hub := events.New()
	srv := api.New(api.Config{
		AllowedPhones:  allowed,
		AllowedOrigins: splitList(os.Getenv("ALLOWED_ORIGINS")),
		CookieName:     cookieName,
		CookieSecure:   cookieSecure,
		CookieDomain:   cookieDomain,
	}, st, sessions, az, al, sp, prov, hub)

	httpSrv := &http.Server{
		Addr:              addr,
		Handler:           logRequests(srv.Handler()),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go housekeeping(ctx, st, sessions, prov)
	go watchDevices(ctx, st, prov, hub)
	if source, ok := prov.(device.PushSource); ok {
		go source.Run(ctx, func(update device.Update) {
			publishDeviceUpdate(ctx, st, hub, update)
		})
	}

	go func() {
		log.Printf("listening on %s (data=%s)", addr, dataDir)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("listen: %v", err)
			stop <- syscall.SIGTERM
		}
	}()

	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)
	cancelBackground()
	log.Printf("stopped (audit entries dropped: %d)", al.Dropped())
}

// verifyAudit replays the audit trail and exits non-zero when the hash chain
// is broken. Run it from cron: a silent tamper is worse than a loud one.
func verifyAudit() int {
	path := filepath.Join(env("DATA_DIR", "./data"), "audit.jsonl")
	res, err := audit.Verify(path)
	if err != nil {
		log.Printf("verify: %v", err)
		return 2
	}
	out, _ := json.Marshal(res)
	log.Print(string(out))
	if !res.OK {
		return 1
	}
	return 0
}

func newDeviceProvider(ctx context.Context) (device.Provider, error) {
	names := splitList(env("DEVICE_PROVIDER", "mock"))
	if len(names) == 1 {
		return newSingleDeviceProvider(ctx, names[0])
	}
	children := make([]composite.Child, 0, len(names))
	seen := map[string]bool{}
	for _, name := range names {
		if seen[name] {
			return nil, fmt.Errorf("duplicate device provider %q", name)
		}
		seen[name] = true
		p, err := newSingleDeviceProvider(ctx, name)
		children = append(children, composite.Child{Name: name, Provider: p, Err: err})
	}
	return composite.New(children...), nil
}

func newSingleDeviceProvider(ctx context.Context, name string) (device.Provider, error) {
	switch name {
	case "mock":
		return mock.New(), nil
	case "xiaomi":
		return newXiaomiProvider(ctx)
	case "sonoff":
		at := os.Getenv("SONOFF_ACCESS_TOKEN")
		rt := os.Getenv("SONOFF_REFRESH_TOKEN")
		bundle := sonoff.Credentials{At: at, Rt: rt, AppSecret: os.Getenv("SONOFF_APP_SECRET")}
		var secretFields map[string]json.RawMessage

		// The credential can live in Aliyun's parameter store instead of the env
		// file: read once at startup with the instance role, never written down.
		// OOS encrypted parameters are free (legacy KMS, up to 200 per region);
		// KMS Secrets Manager needs a paid instance, kept as a fallback.
		secretParam := os.Getenv("SONOFF_SECRET_PARAM")
		regionName := env("ALIYUN_REGION", "cn-beijing")
		if name := firstNonEmpty(secretParam, os.Getenv("SONOFF_SECRET_NAME")); name != "" {
			creds, err := aliyunCredentials()
			if err != nil {
				return nil, err
			}
			var raw string
			if os.Getenv("SONOFF_SECRET_PARAM") != "" {
				raw, err = aliyun.GetSecretParameter(ctx, nil, regionName, creds, name)
			} else {
				raw, err = aliyun.GetSecret(ctx, nil, regionName, creds, name)
			}
			if err != nil {
				return nil, fmt.Errorf("sonoff secret %q: %w", name, err)
			}
			if err := json.Unmarshal([]byte(raw), &bundle); err != nil {
				return nil, fmt.Errorf("sonoff secret %q must be json with at/rt fields: %w", name, err)
			}
			if err := json.Unmarshal([]byte(raw), &secretFields); err != nil {
				return nil, errors.New("sonoff: invalid credential object")
			}
			at, rt = bundle.At, bundle.Rt
			log.Printf("sonoff credentials loaded from parameter %q", name)
		}
		if at == "" {
			return nil, errors.New("SONOFF_ACCESS_TOKEN or SONOFF_SECRET_NAME required for DEVICE_PROVIDER=sonoff")
		}
		region := env("SONOFF_REGION", "cn")
		base := env("SONOFF_BASE_URL", sonoff.BaseURL(region))

		opts := []sonoff.Option{}
		if v := os.Getenv("SONOFF_BASE_URL"); v != "" {
			opts = append(opts, sonoff.WithBaseURL(v))
		}

		// With a refresh token the credential survives restarts and renews
		// itself; without one it dies after ~30 days.
		var source sonoff.TokenSource
		if rt != "" {
			refresher := sonoff.NewRefreshToken(base, bundle)
			// CoolKit rotates the refresh token on every renewal. Write the new
			// pair back, otherwise the stored one goes stale and the next
			// restart cannot renew at all.
			if secretParam != "" {
				refresher.SetOnRefresh(func(ctx context.Context, next sonoff.Credentials) error {
					payload, err := sonoffCredentialPayload(secretFields, next)
					if err != nil {
						return err
					}
					creds, err := aliyunCredentials()
					if err != nil {
						return err
					}
					writeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
					defer cancel()
					if err := aliyun.UpdateSecretParameter(writeCtx, nil, regionName, creds, secretParam, string(payload)); err != nil {
						return err
					}
					log.Printf("sonoff: rotated credentials persisted to %q", secretParam)
					return nil
				})
			}
			source = refresher
		} else {
			source = sonoff.NewStaticToken(at)
		}

		p := sonoff.New(region, source, opts...)
		// Discovery is performed by syncDevices, then retried periodically. Do
		// not discard this provider after a transient refresh/network failure:
		// it owns any rotated pair still waiting for durable persistence.
		return p, nil
	default:
		return nil, fmt.Errorf("unknown DEVICE_PROVIDER %q", name)
	}
}

// Retain signing configuration and future metadata on every credential rotation.
func sonoffCredentialPayload(existing map[string]json.RawMessage, next sonoff.Credentials) ([]byte, error) {
	raw, err := json.Marshal(next)
	if err != nil {
		return nil, err
	}
	merged := make(map[string]json.RawMessage, len(existing)+4)
	for k, v := range existing {
		merged[k] = v
	}
	var updated map[string]json.RawMessage
	if err := json.Unmarshal(raw, &updated); err != nil {
		return nil, err
	}
	for k, v := range updated {
		merged[k] = v
	}
	return json.Marshal(merged)
}

func newXiaomiProvider(ctx context.Context) (device.Provider, error) {
	param := os.Getenv("XIAOMI_SECRET_PARAM")
	ids := splitList(os.Getenv("XIAOMI_DEVICE_IDS"))
	if param == "" || len(ids) == 0 {
		return nil, errors.New("XIAOMI_SECRET_PARAM and XIAOMI_DEVICE_IDS required")
	}
	region := env("ALIYUN_REGION", "cn-beijing")
	creds, err := aliyunCredentials()
	if err != nil {
		return nil, err
	}
	raw, err := aliyun.GetSecretParameter(ctx, nil, region, creds, param)
	if err != nil {
		return nil, errors.New("xiaomi: cannot load OOS credentials")
	}
	var bundle xiaomi.Credentials
	if json.Unmarshal([]byte(raw), &bundle) != nil {
		return nil, errors.New("xiaomi: invalid OOS credentials")
	}
	tokens, err := xiaomi.NewTokens(bundle, func(ctx context.Context, next xiaomi.Credentials) error {
		payload, err := json.Marshal(next)
		if err != nil {
			return err
		}
		return aliyun.UpdateSecretParameter(ctx, nil, region, creds, param, string(payload))
	})
	if err != nil {
		return nil, err
	}
	return xiaomi.New(tokens, bundle.Region, ids), nil
}

// Vendor pushes enter the existing hub; streamEvents still rechecks sessions,
// hidden/missing devices, and per-device read ACL for every recipient/event.
func publishDeviceUpdate(ctx context.Context, st store.Store, hub *events.Hub, update device.Update) {
	d, err := st.Devices().Get(ctx, update.Key)
	if err != nil {
		return
	}
	if d.Online != update.Online {
		if err := st.Tx(ctx, func(tx store.Store) error {
			current, err := tx.Devices().Get(ctx, update.Key)
			if err != nil {
				return err
			}
			current.Online = update.Online
			return tx.Devices().Upsert(ctx, current)
		}); err != nil {
			log.Printf("device online state persistence failed")
			return
		}
	}
	payload, err := json.Marshal(map[string]any{"states": map[string]device.Readings{update.Key: update.State}})
	if err == nil {
		hub.Publish(payload)
	}
}

// aliyunCredentials picks the signing identity for Aliyun API calls: the ECS
// instance role when available, a static key otherwise.
func aliyunCredentials() (aliyun.Credentials, error) {
	if env("SMS_CREDENTIALS", "env") == "ecs-role" {
		role := os.Getenv("ALIYUN_ROLE_NAME")
		if role == "" {
			role = os.Getenv("SMS_ROLE_NAME")
		}
		if role == "" {
			return nil, errors.New("ALIYUN_ROLE_NAME (or SMS_ROLE_NAME) required for ecs-role credentials")
		}
		return &aliyun.ECSRoleCreds{Role: role}, nil
	}
	ak := os.Getenv("ALIYUN_ACCESS_KEY_ID")
	sk := os.Getenv("ALIYUN_ACCESS_KEY_SECRET")
	if ak == "" || sk == "" {
		return nil, errors.New("ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET required")
	}
	return aliyun.StaticCreds{AccessKeyID: ak, AccessKeySecret: sk}, nil
}

func newSMSProvider() (sms.Provider, error) {
	switch env("SMS_MODE", "fake") {
	case "fake":
		return sms.NewFake(func(s string) { log.Print(s) }), nil
	case "aliyun":
		sign := os.Getenv("SMS_SIGN_NAME")
		tpl := os.Getenv("SMS_TEMPLATE_CODE")
		if sign == "" || tpl == "" {
			return nil, errors.New("SMS_SIGN_NAME / SMS_TEMPLATE_CODE required: the platform's gifted sign and template must be passed explicitly")
		}

		var p *sms.Aliyun
		switch env("SMS_CREDENTIALS", "env") {
		case "ecs-role":
			role := os.Getenv("SMS_ROLE_NAME")
			if role == "" {
				return nil, errors.New("SMS_ROLE_NAME required when SMS_CREDENTIALS=ecs-role")
			}
			p = sms.NewAliyun("", "")
			p.Creds = &sms.ECSRoleCreds{Role: role}
		case "env":
			ak := os.Getenv("ALIYUN_ACCESS_KEY_ID")
			sk := os.Getenv("ALIYUN_ACCESS_KEY_SECRET")
			if ak == "" || sk == "" {
				return nil, errors.New("ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET required")
			}
			p = sms.NewAliyun(ak, sk)
		default:
			return nil, fmt.Errorf("unknown SMS_CREDENTIALS %q", os.Getenv("SMS_CREDENTIALS"))
		}

		p.SignName = sign
		p.TemplateCode = tpl
		if v := os.Getenv("SMS_TEMPLATE_PARAM"); v != "" {
			p.TemplateParam = v
		}
		return p, nil
	default:
		return nil, fmt.Errorf("unknown SMS_MODE %q", os.Getenv("SMS_MODE"))
	}
}

// syncDevices refreshes descriptors from the provider while keeping local
// presentation overrides (name, room, hidden).
func syncDevices(ctx context.Context, st store.Store, p device.Provider) error {
	return device.Sync(ctx, st, p)
}

func bootstrap(ctx context.Context, st store.Store, az *acl.Authorizer, adminPhone string, ttl time.Duration) error {
	if adminPhone == "" {
		log.Print("ADMIN_PHONE not set: no root policy will be created")
		return nil
	}
	// ADMIN_PHONE bootstraps a new account only. Never recreate permissions
	// removed through management when an existing account restarts.
	err := st.Tx(ctx, func(tx store.Store) error {
		if _, err := tx.Users().GetByPhone(ctx, adminPhone); err == nil {
			return nil
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		u := &store.User{ID: store.NewID(), Phone: adminPhone, Role: "admin", CreatedAt: time.Now().UTC()}
		if err := tx.Users().Create(ctx, u); err != nil {
			return err
		}
		return tx.Policies().Insert(ctx, &store.Policy{
			ID: store.NewID(), SubjectKind: store.KindUser, SubjectID: u.ID,
			Resource: "*", Action: "*", Effect: "allow", GrantedAt: time.Now().UTC(),
		})
	})
	if err != nil {
		return err
	}
	return reloadACL(ctx, st, az)
}

func reloadACL(ctx context.Context, st store.Store, az *acl.Authorizer) error {
	all, err := st.Policies().ListAll(ctx)
	if err != nil {
		return err
	}
	az.Load(all)
	return nil
}

// watchDevices polls the vendor while a browser is listening and pushes only
// what changed. Idle houses do not generate traffic: no subscribers, no calls.
func watchDevices(ctx context.Context, st store.Store, prov device.Provider, hub *events.Hub) {
	const interval = 4 * time.Second
	last := map[string]map[string]any{}

	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if hub.Count() == 0 {
				continue
			}
			list, err := st.Devices().List(ctx)
			if err != nil {
				continue
			}
			keys := make([]string, 0, len(list))
			for _, d := range list {
				keys = append(keys, d.Key)
			}
			states, err := prov.Read(ctx, keys)
			if err != nil {
				continue
			}
			changed := make(map[string]any, len(states))
			for key, state := range states {
				if !reflect.DeepEqual(last[key], map[string]any(state)) {
					changed[key] = state
				}
			}
			if len(changed) == 0 {
				continue
			}
			for key, state := range states {
				last[key] = map[string]any(state)
			}
			payload, err := json.Marshal(map[string]any{"states": changed})
			if err != nil {
				continue
			}
			hub.Publish(payload)
		}
	}
}

func housekeeping(ctx context.Context, st store.Store, sessions *auth.Sessions, prov device.Provider) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			if n := sessions.PurgeExpired(ctx); n > 0 {
				log.Printf("purged %d expired sessions", n)
			}
			// A device that was offline at boot reports fewer params, so its
			// action list would stay empty until a restart. Re-sync so actions
			// appear once the device comes back.
			if err := syncDevices(ctx, st, prov); err != nil {
				log.Printf("device resync failed: %v", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func durationEnv(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func splitList(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
