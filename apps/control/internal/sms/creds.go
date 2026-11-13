package sms

import "renhanquan/control/internal/aliyun"

// Credentials live in the shared aliyun package so KMS and SMS agree on one
// implementation of instance-role fetching.
type Cred = aliyun.Cred
type Credentials = aliyun.Credentials
type StaticCreds = aliyun.StaticCreds
type ECSRoleCreds = aliyun.ECSRoleCreds
