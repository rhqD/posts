package sms

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Aliyun talks to the 号码认证 service (dypnsapi) "短信认证", which individual
// developers can use without a business licence, a custom signature or a
// custom template.
//
// NOTE: the request parameters below still need one live verification pass
// once real credentials exist. Everything else (signing, error handling) is
// standard RPC style.
type Aliyun struct {
	AK       string
	Secret   string
	Endpoint string
	HTTP     *http.Client
}

func NewAliyun(ak, secret string) *Aliyun {
	return &Aliyun{
		AK:       ak,
		Secret:   secret,
		Endpoint: "https://dypnsapi.aliyuncs.com/",
		HTTP:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Aliyun) Name() string { return "aliyun" }

func (a *Aliyun) Send(ctx context.Context, phone string) error {
	_, err := a.call(ctx, map[string]string{
		"Action":          "SendSmsVerifyCode",
		"PhoneNumber":     phone,
		"CountryCode":     "86",
		"CodeLength":      "6",
		"ValidTime":       "300",
		"DuplicatePolicy": "1",
	})
	return err
}

func (a *Aliyun) Check(ctx context.Context, phone, code string) (bool, error) {
	res, err := a.call(ctx, map[string]string{
		"Action":      "CheckSmsVerifyCode",
		"PhoneNumber": phone,
		"VerifyCode":  code,
	})
	if err != nil {
		return false, err
	}
	var body struct {
		Code  string `json:"Code"`
		Model struct {
			VerifyResult string `json:"VerifyResult"`
		} `json:"Model"`
	}
	if err := json.Unmarshal(res, &body); err != nil {
		return false, err
	}
	return strings.EqualFold(body.Model.VerifyResult, "PASS"), nil
}

func (a *Aliyun) call(ctx context.Context, params map[string]string) ([]byte, error) {
	p := map[string]string{
		"Format":           "JSON",
		"Version":          "2017-05-25",
		"AccessKeyId":      a.AK,
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureVersion": "1.0",
		"SignatureNonce":   fmt.Sprintf("%d", time.Now().UnixNano()),
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
	}
	for k, v := range params {
		p[k] = v
	}
	p["Signature"] = a.sign(p)

	keys := make([]string, 0, len(p))
	for k := range p {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var q strings.Builder
	for i, k := range keys {
		if i > 0 {
			q.WriteByte('&')
		}
		q.WriteString(percentEncode(k))
		q.WriteByte('=')
		q.WriteString(percentEncode(p[k]))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.Endpoint+"?"+q.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aliyun sms: status %d: %s", resp.StatusCode, string(body))
	}
	var head struct {
		Code    string `json:"Code"`
		Message string `json:"Message"`
	}
	if err := json.Unmarshal(body, &head); err == nil && head.Code != "" && head.Code != "OK" {
		return nil, errors.New("aliyun sms: " + head.Code + " " + head.Message)
	}
	return body, nil
}

func (a *Aliyun) sign(params map[string]string) string {
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
		canonical.WriteString(percentEncode(k))
		canonical.WriteByte('=')
		canonical.WriteString(percentEncode(params[k]))
	}

	toSign := "GET" + "&" + percentEncode("/") + "&" + percentEncode(canonical.String())
	mac := hmac.New(sha1.New, []byte(a.Secret+"&"))
	mac.Write([]byte(toSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func percentEncode(s string) string {
	e := url.QueryEscape(s)
	e = strings.ReplaceAll(e, "+", "%20")
	e = strings.ReplaceAll(e, "*", "%2A")
	e = strings.ReplaceAll(e, "%7E", "~")
	return e
}
