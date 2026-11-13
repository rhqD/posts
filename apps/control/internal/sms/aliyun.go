package sms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"renhanquan/control/internal/aliyun"
)

// Aliyun talks to the 号码认证 service (dypnsapi) "短信认证", which individual
// developers can use without a business licence, a custom signature or a
// custom template.
//
// NOTE: the request parameters below still need one live verification pass
// once real credentials exist. Everything else (signing, error handling) is
// standard RPC style.
type Aliyun struct {
	// Creds supplies the signing key. On ECS use ECSRoleCreds so nothing is
	// stored on disk; AK/Secret are the development fallback.
	Creds  Credentials
	AK     string
	Secret string
	// 短信认证只能用平台赠送的签名与模板，两者必须配套，且都要显式传参。
	SignName      string
	TemplateCode  string
	TemplateParam string // 默认 {"code":"##code##","min":"5"}，由平台生成验证码
	CodeLength    int

	Endpoint string
	HTTP     *http.Client
}

func NewAliyun(ak, secret string) *Aliyun {
	return &Aliyun{
		Creds:         StaticCreds{AccessKeyID: ak, AccessKeySecret: secret},
		AK:            ak,
		Secret:        secret,
		TemplateParam: `{"code":"##code##","min":"5"}`,
		CodeLength:    6,
		Endpoint:      "https://dypnsapi.aliyuncs.com/",
		HTTP:          &http.Client{Timeout: 10 * time.Second},
	}
}

func (a *Aliyun) validate() error {
	if a.SignName == "" || a.TemplateCode == "" {
		return fmt.Errorf("sonoff: sign name and template code are required (see dypns console)")
	}
	return nil
}

func (a *Aliyun) Name() string { return "aliyun" }

func (a *Aliyun) Send(ctx context.Context, phone string) error {
	if err := a.validate(); err != nil {
		return err
	}
	n := a.CodeLength
	if n < 4 || n > 8 {
		n = 6
	}
	_, err := a.call(ctx, map[string]string{
		"Action":        "SendSmsVerifyCode",
		"PhoneNumber":   phone,
		"CountryCode":   "86",
		"SignName":      a.SignName,
		"TemplateCode":  a.TemplateCode,
		"TemplateParam": a.TemplateParam,
		"CodeLength":    strconv.Itoa(n),
		"ValidTime":     "300",
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
	cred, err := a.credentials(ctx)
	if err != nil {
		return nil, err
	}

	p := map[string]string{
		"Format":           "JSON",
		"Version":          "2017-05-25",
		"AccessKeyId":      cred.AccessKeyID,
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureVersion": "1.0",
		"SignatureNonce":   fmt.Sprintf("%d", time.Now().UnixNano()),
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
	}
	if cred.SecurityToken != "" {
		p["SecurityToken"] = cred.SecurityToken
	}
	for k, v := range params {
		p[k] = v
	}
	p["Signature"] = aliyun.SignV1(cred.AccessKeySecret, p)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.Endpoint+"?"+aliyun.CanonicalQuery(p), nil)
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

// credentials resolves the key pair used for this call.
func (a *Aliyun) credentials(ctx context.Context) (Cred, error) {
	if a.Creds != nil {
		return a.Creds.Fetch(ctx)
	}
	if a.AK == "" {
		return Cred{}, fmt.Errorf("dypns: no credentials configured")
	}
	return Cred{AccessKeyID: a.AK, AccessKeySecret: a.Secret}, nil
}
