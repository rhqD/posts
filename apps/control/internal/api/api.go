// Package api exposes the HTTP surface. Every handler resolves a subject
// first (real user or anonymous), then asks the authorizer, then acts. Nothing
// is filtered in the browser: an unreadable device is simply absent from the
// response.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"renhanquan/control/internal/acl"
	"renhanquan/control/internal/audit"
	"renhanquan/control/internal/auth"
	"renhanquan/control/internal/device"
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
	cfg      Config
	st       store.Store
	sessions *auth.Sessions
	acl      *acl.Authorizer
	audit    *audit.Logger
	sms      sms.Provider
	provider device.Provider

	phoneLimit  *ratelimit.Limiter
	ipLimit     *ratelimit.Limiter
	verifyLimit *ratelimit.Limiter
}

func New(cfg Config, st store.Store, sessions *auth.Sessions, az *acl.Authorizer, al *audit.Logger, sp sms.Provider, dp device.Provider) *Server {
	return &Server{
		cfg:         cfg,
		st:          st,
		sessions:    sessions,
		acl:         az,
		audit:       al,
		sms:         sp,
		provider:    dp,
		phoneLimit:  ratelimit.New(60*time.Second, 1),
		ipLimit:     ratelimit.New(time.Hour, 20),
		verifyLimit: ratelimit.New(10*time.Minute, 5),
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
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	return s.withCORS(mux)
}

// withCORS allows the static site to call the API from another origin (the
// www host) while still sending the session cookie.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) originAllowed(origin string) bool {
	for _, o := range s.cfg.AllowedOrigins {
		if o == "*" || o == origin {
			return true
		}
	}
	return false
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
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
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

	// Unknown numbers get the same answer as known ones: this endpoint must
	// never reveal whether a phone number belongs to this household.
	if !s.cfg.AllowedPhones[phone] {
		s.record(r, store.Anonymous(), audit.KindSMS, audit.ResultDenied, map[string]any{
			"phone": store.MaskPhone(phone), "why": "not_allowed",
		})
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if !s.phoneLimit.Allow(phone) || !s.ipLimit.Allow(ip) {
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
		fail(w, http.StatusBadGateway, "send_failed")
		return
	}
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
	if !s.cfg.AllowedPhones[phone] {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultDenied, map[string]any{
			"phone": store.MaskPhone(phone), "why": "not_allowed",
		})
		fail(w, http.StatusUnauthorized, "login_failed")
		return
	}
	if !s.verifyLimit.Allow(phone) {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultThrottled, map[string]any{
			"phone": store.MaskPhone(phone),
		})
		fail(w, http.StatusTooManyRequests, "too_many_attempts")
		return
	}

	pass, err := s.sms.Check(r.Context(), phone, strings.TrimSpace(body.Code))
	if err != nil {
		s.record(r, store.Anonymous(), audit.KindLogin, audit.ResultFailed, map[string]any{
			"phone": store.MaskPhone(phone), "err": err.Error(),
		})
		fail(w, http.StatusBadGateway, "verify_failed")
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

// userForPhone creates the account on first successful login. Membership is
// bound to the configured phone list, so there is no sign-up flow.
func (s *Server) userForPhone(ctx context.Context, phone string) (*store.User, error) {
	var out *store.User
	err := s.st.Tx(ctx, func(tx store.Store) error {
		u, err := tx.Users().GetByPhone(ctx, phone)
		if err == nil {
			out = u
			return nil
		}
		if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		nu := &store.User{
			ID:        store.NewID(),
			Phone:     phone,
			Role:      "member",
			CreatedAt: time.Now().UTC(),
		}
		if err := tx.Users().Create(ctx, nu); err != nil {
			return err
		}
		out = nu
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
		_ = s.sessions.Revoke(r.Context(), store.ID(c.Value))
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
		"id":    u.ID,
		"phone": store.MaskPhone(u.Phone),
		"name":  u.Name,
		"role":  u.Role,
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
		if d.Hidden || !s.acl.Can(subj, "device:"+d.Key, "read") {
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

// ---- admin ------------------------------------------------------------

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (store.Subject, bool) {
	subj, _ := s.subject(r)
	if !s.acl.Can(subj, "policy:*", "grant") {
		s.record(r, subj, audit.KindDeny, audit.ResultDenied, map[string]any{"path": r.URL.Path})
		fail(w, http.StatusForbidden, "forbidden")
		return subj, false
	}
	return subj, true
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
	var body struct {
		SubjectKind string `json:"subject_kind"`
		SubjectID   string `json:"subject_id"`
		Resource    string `json:"resource"`
		Action      string `json:"action"`
		Effect      string `json:"effect"`
	}
	if err := decode(r, &body); err != nil {
		fail(w, http.StatusBadRequest, "bad_request")
		return
	}
	if body.Effect == "" {
		body.Effect = "allow"
	}
	if body.SubjectKind == "" || body.Resource == "" || body.Action == "" {
		fail(w, http.StatusBadRequest, "bad_request")
		return
	}

	// No escalation: a grantor may only hand out what they already hold.
	if !s.acl.Can(subj, body.Resource, body.Action) {
		s.record(r, subj, audit.KindDeny, audit.ResultDenied, map[string]any{
			"why": "escalation", "resource": body.Resource, "action": body.Action,
		})
		fail(w, http.StatusForbidden, "forbidden")
		return
	}

	p := store.Policy{
		ID:          store.NewID(),
		SubjectKind: store.SubjectKind(body.SubjectKind),
		SubjectID:   store.ID(body.SubjectID),
		Resource:    body.Resource,
		Action:      body.Action,
		Effect:      body.Effect,
		GrantedBy:   subj.ID,
		GrantedAt:   time.Now().UTC(),
	}
	if err := s.st.Tx(r.Context(), func(tx store.Store) error {
		return tx.Policies().Insert(r.Context(), &p)
	}); err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	if err := s.reloadACL(r); err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	// Security-critical: the operation only counts if the trail lands on disk.
	if err := s.audit.RecordSync(r.Context(), store.Entry{
		Kind:     audit.KindPolicyGrant,
		Actor:    subj,
		IP:       clientIP(r),
		UA:       userAgent(r),
		Resource: body.Resource,
		Action:   body.Action,
		Result:   audit.ResultOK,
		Detail: map[string]any{
			"policy": p.ID, "subject_kind": p.SubjectKind,
			"subject_id": p.SubjectID, "effect": p.Effect,
		},
	}); err != nil {
		fail(w, http.StatusInternalServerError, "audit_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request) {
	subj, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	id := store.ID(r.PathValue("id"))
	if err := s.st.Tx(r.Context(), func(tx store.Store) error {
		return tx.Policies().Delete(r.Context(), id)
	}); err != nil {
		fail(w, http.StatusNotFound, "not_found")
		return
	}
	if err := s.reloadACL(r); err != nil {
		fail(w, http.StatusInternalServerError, "internal")
		return
	}
	if err := s.audit.RecordSync(r.Context(), store.Entry{
		Kind:   audit.KindPolicyRevoke,
		Actor:  subj,
		IP:     clientIP(r),
		UA:     userAgent(r),
		Result: audit.ResultOK,
		Detail: map[string]any{"policy": id},
	}); err != nil {
		fail(w, http.StatusInternalServerError, "audit_unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
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
