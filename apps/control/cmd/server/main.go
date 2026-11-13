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
	"strings"
	"syscall"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/aliyun"
	"renhanquan/control/internal/api"
	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/device/mock"
	"renhanquan/control/internal/device/sonoff"
	"renhanquan/control/internal/device/unavailable"
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

	ctx := context.Background()

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

	sp, err := newSMSProvider()
	if err != nil {
		log.Fatalf("sms: %v", err)
	}
	log.Printf("sms provider: %s", sp.Name())

	sessions := auth.NewSessions(st, ttl)
	srv := api.New(api.Config{
		AllowedPhones:  allowed,
		AllowedOrigins: splitList(os.Getenv("ALLOWED_ORIGINS")),
		CookieName:     cookieName,
		CookieSecure:   cookieSecure,
		CookieDomain:   cookieDomain,
	}, st, sessions, az, al, sp, prov)

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

	go housekeeping(ctx, st, sessions)

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
	switch env("DEVICE_PROVIDER", "mock") {
	case "mock":
		return mock.New(), nil
	case "sonoff":
		at := os.Getenv("SONOFF_ACCESS_TOKEN")
		rt := os.Getenv("SONOFF_REFRESH_TOKEN")

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
			var secret struct {
				At string `json:"at"`
				Rt string `json:"rt"`
			}
			if err := json.Unmarshal([]byte(raw), &secret); err != nil {
				return nil, fmt.Errorf("sonoff secret %q must be json with at/rt fields: %w", name, err)
			}
			at, rt = secret.At, secret.Rt
			log.Printf("sonoff credentials loaded from parameter %q", name)
		}
		if at == "" {
			return nil, errors.New("SONOFF_ACCESS_TOKEN or SONOFF_SECRET_NAME required for DEVICE_PROVIDER=sonoff")
		}
		tok := at
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
			refresher := sonoff.NewRefreshToken(base, tok, rt)
			// CoolKit rotates the refresh token on every renewal. Write the new
			// pair back, otherwise the stored one goes stale and the next
			// restart cannot renew at all.
			if secretParam != "" {
				refresher.SetOnRefresh(func(newAt, newRt string) {
					payload, _ := json.Marshal(map[string]string{"at": newAt, "rt": newRt})
					creds, err := aliyunCredentials()
					if err != nil {
						log.Printf("sonoff: cannot persist rotated credentials: %v", err)
						return
					}
					writeCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
					defer cancel()
					if err := aliyun.UpdateSecretParameter(writeCtx, nil, regionName, creds, secretParam, string(payload)); err != nil {
						log.Printf("sonoff: cannot persist rotated credentials to %q: %v", secretParam, err)
						return
					}
					log.Printf("sonoff: rotated credentials persisted to %q", secretParam)
				})
			}
			source = refresher
		} else {
			source = sonoff.NewStaticToken(tok)
		}

		p := sonoff.New(region, source, opts...)
		// Fail fast: a token that is already dead should stop the boot, not
		// surface as an empty device list hours later.
		if _, err := p.Discover(ctx); err != nil {
			return nil, fmt.Errorf("sonoff discovery failed: %w", err)
		}
		return p, nil
	default:
		return nil, fmt.Errorf("unknown DEVICE_PROVIDER %q", os.Getenv("DEVICE_PROVIDER"))
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
	found, err := p.Discover(ctx)
	if err != nil {
		return err
	}
	return st.Tx(ctx, func(tx store.Store) error {
		for _, d := range found {
			prev, err := tx.Devices().Get(ctx, d.Key)
			next := &store.Device{
				Key:      d.Key,
				Name:     d.Name,
				Room:     d.Room,
				Provider: d.Provider,
				Kind:     d.Kind,
				Readings: d.Readings,
				Actions:  actionsOf(d),
			}
			if err == nil {
				if prev.Name != "" {
					next.Name = prev.Name
				}
				if prev.Room != "" {
					next.Room = prev.Room
				}
				next.Hidden = prev.Hidden
			}
			if err := tx.Devices().Upsert(ctx, next); err != nil {
				return err
			}
		}
		return nil
	})
}

func actionsOf(d device.Descriptor) map[string]any {
	if len(d.Actions) == 0 {
		return nil
	}
	out := make(map[string]any, len(d.Actions))
	for k, v := range d.Actions {
		out[k] = v
	}
	return out
}

func bootstrap(ctx context.Context, st store.Store, az *acl.Authorizer, adminPhone string, ttl time.Duration) error {
	if adminPhone == "" {
		log.Print("ADMIN_PHONE not set: no root policy will be created")
		return nil
	}
	var admin *store.User
	if err := st.Tx(ctx, func(tx store.Store) error {
		u, err := tx.Users().GetByPhone(ctx, adminPhone)
		if err == nil {
			admin = u
			return nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		nu := &store.User{ID: store.NewID(), Phone: adminPhone, Role: "admin", CreatedAt: time.Now().UTC()}
		if err := tx.Users().Create(ctx, nu); err != nil {
			return err
		}
		admin = nu
		return nil
	}); err != nil {
		return err
	}

	existing, err := st.Policies().ListBySubject(ctx, store.KindUser, admin.ID)
	if err != nil {
		return err
	}
	for _, p := range existing {
		if p.Resource == "*" && p.Action == "*" && p.Effect == "allow" {
			return nil
		}
	}
	root := store.Policy{
		ID:          store.NewID(),
		SubjectKind: store.KindUser,
		SubjectID:   admin.ID,
		Resource:    "*",
		Action:      "*",
		Effect:      "allow",
		GrantedAt:   time.Now().UTC(),
	}
	if err := st.Tx(ctx, func(tx store.Store) error {
		return tx.Policies().Insert(ctx, &root)
	}); err != nil {
		return err
	}
	if err := reloadACL(ctx, st, az); err != nil {
		return err
	}
	log.Printf("bootstrapped admin %s with root policy", store.MaskPhone(adminPhone))
	return nil
}

func reloadACL(ctx context.Context, st store.Store, az *acl.Authorizer) error {
	all, err := st.Policies().ListAll(ctx)
	if err != nil {
		return err
	}
	az.Load(all)
	return nil
}

func housekeeping(ctx context.Context, st store.Store, sessions *auth.Sessions) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			if n := sessions.PurgeExpired(ctx); n > 0 {
				log.Printf("purged %d expired sessions", n)
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
