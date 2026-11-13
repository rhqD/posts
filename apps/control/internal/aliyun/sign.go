// Package aliyun holds the shared RPC signing used by every Aliyun call.
// Aliyun's classic RPC APIs (SMS verification, KMS, ...) all sign the same way.
package aliyun

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"net/url"
	"sort"
	"strings"
)

// SignV1 computes the RPC signature for a parameter set (HMAC-SHA1 over the
// canonical query, base64-encoded). The signature itself is not part of params.
func SignV1(secret string, params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k == "Signature" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var canonical strings.Builder
	for i, k := range keys {
		if i > 0 {
			canonical.WriteByte('&')
		}
		canonical.WriteString(PercentEncode(k))
		canonical.WriteByte('=')
		canonical.WriteString(PercentEncode(params[k]))
	}

	toSign := "GET" + "&" + PercentEncode("/") + "&" + PercentEncode(canonical.String())
	mac := hmac.New(sha1.New, []byte(secret+"&"))
	mac.Write([]byte(toSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// PercentEncode follows the RFC 3986 form Aliyun expects.
func PercentEncode(s string) string {
	e := url.QueryEscape(s)
	e = strings.ReplaceAll(e, "+", "%20")
	e = strings.ReplaceAll(e, "*", "%2A")
	e = strings.ReplaceAll(e, "%7E", "~")
	return e
}

// CanonicalQuery renders params as a sorted, encoded query string.
func CanonicalQuery(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var q strings.Builder
	for i, k := range keys {
		if i > 0 {
			q.WriteByte('&')
		}
		q.WriteString(PercentEncode(k))
		q.WriteByte('=')
		q.WriteString(PercentEncode(params[k]))
	}
	return q.String()
}
