// Package acl answers one question: may this subject perform this action on
// this resource? Resources and actions are free-form strings; '*' is a
// wildcard. Policies are loaded wholesale into memory because wildcard
// matching cannot be pushed into SQL anyway, and the table is tiny.
package acl

import (
	"strings"
	"sync"

	"renhanquan/control/internal/store"
)

// Match reports whether value matches a glob pattern in which '*' spans any
// run of characters. Everything else is literal.
func Match(pattern, value string) bool {
	pi, vi := 0, 0
	star, mark := -1, 0
	for vi < len(value) {
		if pi < len(pattern) && pattern[pi] == value[vi] {
			pi++
			vi++
			continue
		}
		if pi < len(pattern) && pattern[pi] == '*' {
			star = pi
			pi++
			mark = vi
			continue
		}
		if star >= 0 {
			pi = star + 1
			mark++
			vi = mark
			continue
		}
		return false
	}
	for pi < len(pattern) && pattern[pi] == '*' {
		pi++
	}
	return pi == len(pattern)
}

type Authorizer struct {
	mu    sync.RWMutex
	rules map[string][]store.Policy
}

func New() *Authorizer {
	return &Authorizer{rules: map[string][]store.Policy{}}
}

func key(kind store.SubjectKind, id store.ID) string {
	return strings.Join([]string{string(kind), string(id)}, "|")
}

func (a *Authorizer) Load(all []store.Policy) {
	rules := make(map[string][]store.Policy, len(all))
	for _, p := range all {
		k := key(p.SubjectKind, p.SubjectID)
		rules[k] = append(rules[k], p)
	}
	a.mu.Lock()
	a.rules = rules
	a.mu.Unlock()
}

// Can reports whether s may perform action on resource. Explicit deny wins;
// otherwise any matching allow grants access; otherwise it is denied.
func (a *Authorizer) Can(s store.Subject, resource, action string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()

	rules := a.rules[key(s.Kind, s.ID)]
	allowed := false
	for _, p := range rules {
		if !Match(p.Resource, resource) {
			continue
		}
		// "control" implies "read": whoever may operate a device may also see it.
		implied := action == "read" && Match(p.Action, "control")
		if p.Effect == "deny" {
			if Match(p.Action, action) {
				return false
			}
			continue
		}
		if Match(p.Action, action) || implied {
			allowed = true
		}
	}
	return allowed
}
