// Package api exposes the HTTP surface. Every handler resolves a subject
// first (real user or anonymous), then asks the authorizer, then acts. Nothing
// is filtered in the browser: an unreadable device is simply absent from the
// response.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/device"
	"renhanquan/control/internal/events"
	"renhanquan/control/internal/ratelimit"
	"renhanquan/control/internal/sms"
	"renhanquan/control/internal/store"
)

type Config struct {
	AllowedPhones  map[string]bool
	AllowedOrigins []string
	CookieName     string
	CookieSecure   bool
	CookieDomain   string
}

type Server struct {
	manageMu sync.Mutex
	cfg      Config
	st       store.Store
	sessions *auth.Sessions
	acl      *acl.Authorizer
	audit    *audit.Logger
	sms      sms.Provider
	provider device.Provider
	hub      *events.Hub

	phoneLimit  *ratelimit.Limiter
	ipLimit     *ratelimit.Limiter
	verifyLimit *ratelimit.Limiter
	challenges  *smsChallenges
}

func New(cfg Config, st store.Store, sessions *auth.Sessions, az *acl.Authorizer, al *audit.Logger, sp sms.Provider, dp device.Provider, hub *events.Hub) *Server {
	return &Server{
		hub:         hub,
		cfg:         cfg,
		st:          st,
		sessions:    sessions,
		acl:         az,
		audit:       al,
		sms:         sp,
		provider:    dp,
		phoneLimit:  ratelimit.New(60*time.Second, 1),
		ipLimit:     ratelimit.New(time.Hour, 20),
		verifyLimit: ratelimit.New(10*time.Minute, 30),
		challenges:  newSMSChallenges(),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /auth/sms/send", s.sendSMS)
	mux.HandleFunc("POST /auth/sms/verify", s.verifySMS)
	mux.HandleFunc("POST /auth/logout", s.logout)
	mux.HandleFunc("GET /auth/me", s.me)
	mux.HandleFunc("GET /devices", s.listDevices)
	mux.HandleFunc("POST /devices/{key}/commands", s.command)
	mux.HandleFunc("GET /admin/policies", s.listPolicies)
	mux.HandleFunc("POST /admin/policies", s.grant)
	mux.HandleFunc("DELETE /admin/policies/{id}", s.revoke)
	mux.HandleFunc("GET /admin/audit", s.listAudit)
	mux.HandleFunc("GET /admin/status", s.adminStatus)
	mux.HandleFunc("GET /events", s.streamEvents)
	s.managementRoutes(mux)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	return s.withCORS(s.withWriteProtection(mux))
}

// withCORS allows the static site to call the API from another origin (the
// www host) while still sending the session cookie.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		if origin != "" && !s.originAllowed(origin) {
			fail(w, http.StatusForbidden, "origin_forbidden")
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Protection")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			if origin == "" {
				fail(w, http.StatusForbidden, "origin_forbidden")
				return
			}
			method := r.Header.Get("Access-Control-Request-Method")
			if method != "GET" && method != "POST" && method != "PUT" && method != "PATCH" && method != "DELETE" {
				fail(w, http.StatusForbidden, "preflight_forbidden")
				return
			}
			for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
				header = strings.ToLower(strings.TrimSpace(header))
				if header != "" && header != "content-type" && header != "x-csrf-protection" {
					fail(w, http.StatusForbidden, "preflight_forbidden")
					return
				}
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	// Credentials require exact origins. Never accept wildcards, opaque origins,
	// path suffixes or URLs containing userinfo as a browser origin.
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil || origin != u.Scheme+"://"+u.Host {
		return false
	}
	for _, o := range s.cfg.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	return false
}

// All state changes are JSON API calls, never form submissions. The custom
// header forces a browser CORS preflight; exact Origin checking also protects
// same-site requests and fails closed when the source is missing or opaque.
// This is CSRF protection, not authentication: every handler still checks ACL.
func (s *Server) withWriteProtection(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		if !s.originAllowed(r.Header.Get("Origin")) {
			fail(w, http.StatusForbidden, "origin_forbidden")
			return
		}
		if r.Header.Get("X-CSRF-Protection") != "1" {
			fail(w, http.StatusForbidden, "csrf_required")
			return
		}
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			fail(w, http.StatusUnsupportedMediaType, "json_required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---- subject ----------------------------------------------------------

func (s *Server) subject(r *http.Request) (store.Subject, *store.User) {
	c, err := r.Cookie(s.cfg.CookieName)
	if err != nil || c.Value == "" {
		return store.Anonymous(), nil
	}
	u, _, err := s.sessions.Resolve(r.Context(), store.ID(c.Value))
	if err != nil {
		return store.Anonymous(), nil
	}
	return store.UserSubject(u), u
}

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		// Only the local nginx is trusted. It must overwrite X-Forwarded-For
		// or append the actual peer; caller-controlled prefixes are ignored.
		if peer := net.ParseIP(host); peer != nil && peer.IsLoopback() {
			xff := r.Header.Get("X-Forwarded-For")
			last := strings.TrimSpace(xff[strings.LastIndexByte(xff, ',')+1:])
			if ip := net.ParseIP(last); ip != nil {
				return ip.String()
			}
		}
		return host
	}
	return r.RemoteAddr
}

func (s *Server) record(r *http.Request, subj store.Subject, kind, result string, detail map[string]any) {
	s.audit.Record(store.Entry{
		Kind:   kind,
		Actor:  subj,
		IP:     clientIP(r),
		UA:     userAgent(r),
		Result: result,
		Detail: detail,
	})
}

func userAgent(r *http.Request) string {
	ua := r.UserAgent()
	if len(ua) > 200 {
		ua = ua[:200]
	}
	return ua
}

// ---- auth -------------------------------------------------------------

func (s *Server) sendSMS(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, http.StatusBadRequest, "bad_request")
		return
	}
	phone := strings.TrimSpace(body.Phone)
	ip := clientIP(r)
	token, err := newChallengeToken()
	if err != nil {
		fail(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	// Identical cookie and response shape for known, unknown, disabled,
	// throttled and upstream-failed numbers. Only a real send activates it.
	http.SetCookie(w, s.challengeCookie(token))
	if !s.ipLimit.Allow(ip) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	// Unknown numbers get the same answer as known ones: this endpoint must
	// never reveal whether a phone number belongs to this household.
	if u, err := s.st.Users().GetByPhone(r.Context(), phone); err != nil || u.Disabled() {
		s.record(r, store.Anonymous(), audit.KindSMS, audit.ResultDenied, map[string]any{
			"phone": store.MaskPhone(phone), "why": "not_allowed",
		})
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if !s.phoneLimit.Allow(phone) {
		s.record(r, store.Anonymous(), audit.KindSMS, audit.ResultThrottled, map[string]any{
			"phone": store.MaskPhone(phone),
		})
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if err := s.sms.Send(r.Context(), phone); err != nil {
		s.record(r, store.Anonymous(), audit.KindSMS, audit.ResultFailed, map[string]any{
			"phone": store.MaskPhone(phone), "err": err.Error(),
		})
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	s.challenges.activate(phone, token)
	s.record(r, store.Anonymous(), audit.KindSMS, audit.ResultOK, map[string]any{
		"phone": store.MaskPhone(phone),
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) verifySMS(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, http.StatusBadRequest, "bad_request")
		return
	}
	phone := strings.TrimSpace(body.Phone)
	// IP throttling runs before account lookup, with identical responses for
	// every phone. Unrelated requests cannot burn a victim's code attempts.
	if !s.verifyLimit.Allow(clientIP(r)) {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultThrottled, map[string]any{"phone": store.MaskPhone(phone)})
		fail(w, http.StatusTooManyRequests, "too_many_attempts")
		return
	}
	cookie, cookieErr := r.Cookie(s.cfg.CookieName + "_login")
	if cookieErr != nil || !s.challenges.begin(phone, cookie.Value) {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultDenied, map[string]any{"phone": store.MaskPhone(phone), "why": "invalid_challenge"})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}
	if u, err := s.st.Users().GetByPhone(r.Context(), phone); err != nil || u.Disabled() {
		s.challenges.finish(phone, cookie.Value, false)
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultDenied, map[string]any{
			"phone": store.MaskPhone(phone), "why": "not_allowed",
		})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}
	pass, err := s.sms.Check(r.Context(), phone, strings.TrimSpace(body.Code))
	pass = s.challenges.finish(phone, cookie.Value, pass && err == nil)
	if err != nil {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultFailed, map[string]any{
			"phone": store.MaskPhone(phone), "err": err.Error(),
		})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}
	if !pass {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultDenied, map[string]any{
			"phone": store.MaskPhone(phone), "why": "bad_code",
		})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}

	u, err := s.userForPhone(r.Context(), phone)
	if err != nil {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultFailed, map[string]any{
			"phone": store.MaskPhone(phone), "err": err.Error(),
		})
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	if u.Disabled() {
		s.record(r, store.UserSubject(u), audit.KindLogin, audit.ResultDenied, map[string]any{"why": "disabled"})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}

	sess, err := s.sessions.Issue(r.Context(), u, clientIP(r), userAgent(r))
	if err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	s.setCookie(w, sess)
	s.record(r, store.UserSubject(u), audit.KindLoginOK, audit.ResultOK, map[string]any{
		"session": string(sess.ID)[:8],
	})
	writeJSON(w, http.StatusOK, s.mePayload(u))
}

// Successful verification activates an existing built-in account; never register.
func (s *Server) userForPhone(ctx context.Context, phone string) (*store.User, error) {
	s.manageMu.Lock()
	defer s.manageMu.Unlock()
	var out *store.User
	err := s.st.Tx(ctx, func(tx store.Store) error {
		u, err := tx.Users().GetByPhone(ctx, phone)
		if err != nil {
			return err
		}
		if u.Disabled() {
			return store.ErrNotFound
		}
		if u.ActivatedAt == nil {
			now := time.Now().UTC()
			u.ActivatedAt = &now
		}
		u.Builtin = true
		if err := tx.Users().Update(ctx, u); err != nil {
			return err
		}
		out = u
		return nil
	})
	return out, err
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	subj, u := s.subject(r)
	if u == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if c, err := r.Cookie(s.cfg.CookieName); err == nil {
		if err := s.sessions.Revoke(r.Context(), store.ID(c.Value)); err != nil {
			s.record(r, subj, audit.KindLogout, audit.ResultFailed, nil)
			fail(w, http.StatusInternalServerError, "logout_failed")
			return
		}
	}
	s.record(r, subj, audit.KindLogout, audit.ResultOK, nil)
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.CookieName,
		Value:    "",
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		Secure:   s.cfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	_, u := s.subject(r)
	if u == nil {
		fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	writeJSON(w, http.StatusOK, s.mePayload(u))
}

func (s *Server) mePayload(u *store.User) map[string]any {
	return map[string]any{
		"id":           u.ID,
		"phone":        store.MaskPhone(u.Phone),
		"name":         u.Name,
		"role":         u.Role,
		"avatar":       u.Avatar,
		"activated_at": u.ActivatedAt,
		"capabilities": s.capabilities(store.UserSubject(u)),
	}
}

// ---- devices ----------------------------------------------------------

// listDevices is the single entry point clients use to learn what exists,
// what they may do with it, and what it currently looks like. Filtering happens
// here: a device the subject cannot read is simply absent.
func (s *Server) listDevices(w http.ResponseWriter, r *http.Request) {
	subj, _ := s.subject(r)
	all, err := s.st.Devices().List(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}

	visible := make([]*store.Device, 0, len(all))
	keys := make([]string, 0, len(all))
	for _, d := range all {
		if d.Hidden || d.Missing || !s.acl.Can(subj, "device:"+d.Key, "read") {
			continue
		}
		visible = append(visible, d)
		keys = append(keys, d.Key)
	}

	states := map[string]device.Readings{}
	if len(keys) > 0 {
		if got, err := s.provider.Read(r.Context(), keys); err == nil {
			states = got
		}
	}

	out := make([]map[string]any, 0, len(visible))
	for _, d := range visible {
		actions := d.Actions
		if actions == nil {
			actions = map[string]any{}
		}
		state := states[d.Key]
		if state == nil {
			state = device.Readings{}
		}
		out = append(out, map[string]any{
			"key":      d.Key,
			"name":     d.Name,
			"room":     d.Room,
			"kind":     d.Kind,
			"online":   d.Online,
			"readings": d.Readings,
			"actions":  actions,
			"state":    state,
			"permissions": map[string]any{
				"read":    true,
				"control": s.acl.Can(subj, "device:"+d.Key, "control"),
			},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": out})
}

func (s *Server) command(w http.ResponseWriter, r *http.Request) {
	subj, _ := s.subject(r)
	key := r.PathValue("key")

	var body struct {
		Action string         `json:"action"`
		Params map[string]any `json:"params"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, http.StatusBadRequest, "bad_request")
		return
	}

	dev, err := s.st.Devices().Get(r.Context(), key)
	if err != nil {
		// Deliberately 404 for both "missing" and "forbidden".
		fail(w, http.StatusNotFound, "not_found")
		return
	}
	if !s.acl.Can(subj, "device:"+dev.Key, "control") {
		s.record(r, subj, audit.KindDeviceDeny, audit.ResultDenied, map[string]any{"device": key})
		fail(w, http.StatusNotFound, "not_found")
		return
	}
	if !dev.Supports(body.Action) {
		fail(w, http.StatusUnprocessableEntity, "unsupported_action")
		return
	}

	if err := s.provider.Apply(r.Context(), key, device.Command{Action: body.Action, Params: body.Params}); err != nil {
		s.record(r, subj, audit.KindDeviceCtl, audit.ResultFailed, map[string]any{
			"device": key, "action": body.Action, "err": err.Error(),
		})
		fail(w, http.StatusBadGateway, "apply_failed")
		return
	}
	s.record(r, subj, audit.KindDeviceCtl, audit.ResultOK, map[string]any{
		"device": key, "action": body.Action,
	})
	state, _ := s.provider.Read(r.Context(), []string{key})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "readings": state[key]})
}

// ---- live stream ------------------------------------------------------

// streamEvents has the same device visibility boundary as listDevices. A
// subscription is not an authorization snapshot: recheck before every event.
// Anonymous subscriptions remain disabled until explicitly supported.
func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(s.cfg.CookieName)
	if err != nil || cookie.Value == "" {
		fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	sessionID := store.ID(cookie.Value)
	_, session, err := s.sessions.Resolve(r.Context(), sessionID)
	if err != nil {
		fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no") // keep nginx from buffering
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch, cancel := s.hub.Subscribe()
	defer cancel()

	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	expires := time.NewTimer(time.Until(session.ExpiresAt))
	defer expires.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-expires.C:
			return
		case payload, ok := <-ch:
			if !ok {
				return
			}
			u, _, err := s.sessions.Resolve(r.Context(), sessionID)
			if err != nil {
				return
			}
			filtered, err := s.filterEventStates(r.Context(), store.UserSubject(u), payload)
			if err != nil || len(filtered) == 0 {
				continue // Fail closed; never forward an unrecognized payload.
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", filtered); err != nil {
				return
			}
			flusher.Flush()
		case <-ping.C:
			if _, _, err := s.sessions.Resolve(r.Context(), sessionID); err != nil {
				return
			}
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// Only emit explicitly permitted, still-existing, non-hidden device states.
// Rebuild the envelope so other fields can never bypass device filtering.
func (s *Server) filterEventStates(ctx context.Context, subj store.Subject, payload []byte) ([]byte, error) {
	var frame struct {
		States map[string]json.RawMessage `json:"states"`
	}
	if err := json.Unmarshal(payload, &frame); err != nil {
		return nil, err
	}
	visible := make(map[string]json.RawMessage)
	for key, state := range frame.States {
		if !s.acl.Can(subj, "device:"+key, "read") {
			continue
		}
		d, err := s.st.Devices().Get(ctx, key)
		if err != nil || d.Hidden || d.Missing {
			continue
		}
		visible[key] = state
	}
	if len(visible) == 0 {
		return nil, nil
	}
	return json.Marshal(struct {
		States map[string]json.RawMessage `json:"states"`
	}{States: visible})
}

// ---- admin ------------------------------------------------------------

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (store.Subject, bool) {
	return s.requireCapability(w, r, "permissions")
}

func (s *Server) listPolicies(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	all, err := s.st.Policies().ListAll(r.Context())
	if err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"policies": all})
}

func (s *Server) grant(w http.ResponseWriter, r *http.Request) {
	subj, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var b struct {
		SubjectKind string `json:"subject_kind"`
		SubjectID   string `json:"subject_id"`
		Resource    string `json:"resource"`
		Action      string `json:"action"`
		Effect      string `json:"effect"`
	}
	if decode(r, &b) != nil {
		fail(w, 400, "bad_request")
		return
	}
	if b.Effect == "" {
		b.Effect = "allow"
	}
	if (b.SubjectKind != "user" && b.SubjectKind != "anonymous") || (b.Effect != "allow" && b.Effect != "deny") {
		fail(w, 400, "invalid_input")
		return
	}
	p := store.Policy{ID: store.NewID(), SubjectKind: store.SubjectKind(b.SubjectKind), SubjectID: store.ID(b.SubjectID), Resource: b.Resource, Action: b.Action, Effect: b.Effect, GrantedBy: subj.ID, GrantedAt: time.Now().UTC()}
	err := s.managementChange(r, audit.KindPolicyGrant, map[string]any{"policy": p}, func(tx store.Store) error {
		if err := validateSubject(r.Context(), tx, p.SubjectKind, p.SubjectID); err != nil {
			return err
		}
		if !allowedPolicyTarget(r.Context(), tx, p) {
			return errInvalid
		}
		if !s.acl.Can(subj, p.Resource, p.Action) {
			return errForbidden
		}
		return tx.Policies().Insert(r.Context(), &p)
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 201, p)
}
func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	id := store.ID(r.PathValue("id"))
	err := s.managementChange(r, audit.KindPolicyRevoke, map[string]any{"policy": id}, func(tx store.Store) error {
		rules, err := tx.Policies().ListAll(r.Context())
		if err != nil {
			return err
		}
		for _, p := range rules {
			if p.ID == id {
				if !s.acl.Can(actor, p.Resource, p.Action) {
					return errForbidden
				}
				return tx.Policies().Delete(r.Context(), id)
			}
		}
		return store.ErrNotFound
	})
	if err != nil {
		managementFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) reloadACL(r *http.Request) error {
	all, err := s.st.Policies().ListAll(r.Context())
	if err != nil {
		return err
	}
	s.acl.Load(all)
	return nil
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	subj, _ := s.subject(r)
	if !s.acl.Can(subj, "audit:*", "read") {
		s.record(r, subj, audit.KindDeny, audit.ResultDenied, map[string]any{"path": r.URL.Path})
		fail(w, http.StatusForbidden, "forbidden")
		return
	}
	q := store.Query{
		Kind:   r.URL.Query().Get("kind"),
		Result: r.URL.Query().Get("result"),
	}
	entries, err := s.st.Audit().Query(r.Context(), q, 200)
	if err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

type statusReporter interface{ Status() map[string]any }

// adminStatus exposes provider health. It exists so a dying access token is
// visible in one request instead of showing up as "the lamps stopped working".
func (s *Server) adminStatus(w http.ResponseWriter, r *http.Request) {
	subj, _ := s.subject(r)
	if !s.acl.Can(subj, "system:*", "read") {
		s.record(r, subj, audit.KindDeny, audit.ResultDenied, map[string]any{"path": r.URL.Path})
		fail(w, http.StatusForbidden, "forbidden")
		return
	}
	out := map[string]any{"provider": s.provider.Name()}
	if rep, ok := s.provider.(statusReporter); ok {
		out["health"] = rep.Status()
	}
	out["audit_dropped"] = s.audit.Dropped()
	writeJSON(w, http.StatusOK, out)
}

// ---- plumbing ---------------------------------------------------------

func (s *Server) setCookie(w http.ResponseWriter, sess *store.Session) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.CookieName,
		Value:    string(sess.ID),
		Path:     "/",
		Domain:   s.cfg.CookieDomain,
		Expires:  sess.ExpiresAt,
		Secure:   s.cfg.CookieSecure,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func decode(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]any{"error": code})
}
