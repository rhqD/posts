# 控制面：部署与运维

这份文档描述**那台 ECS 上实际装着什么、怎么改、怎么排障**。设计取舍见
[docs/auth.md](auth.md)，基础设施边界见 [docs/infra.md](infra.md)。

## 拓扑

```
浏览器 ── HTTPS ──► api.renhanquan.com ──► ECS (nginx:443) ──► 127.0.0.1:8080 (control)
                                                                      │
                                              ┌───────────────────────┼───────────────────────┐
                                              ▼                       ▼                       ▼
                                      CoolKit 云 (Sonoff)     阿里云 dypns (短信)       OOS 参数仓库
```

静态站不在这里：它仍然是 OSS + CDN，和这台机器没有任何运行时耦合。

## 机器

| | |
| --- | --- |
| 实例 | `i-2zei3tvz1fhlkbfab0i6`，cn-beijing-g |
| 规格 | ecs.e-c1m1.large（2 核 2G），包年包月 |
| 系统 | Ubuntu 26.04 LTS |
| 网络 | 自带公网 IP，3 Mbps 固定带宽；安全组只开 22 / 443 |
| 归属 | ROS 资源栈 `renhanquan-control`（导入接管，不是 ROS 创建的） |

## 文件布局

```
/usr/local/bin/control              二进制（本机交叉编译后 scp）
/etc/systemd/system/renhanquan-control.service
/etc/renhanquan-control.env         配置，0600 root，含家人手机号
/var/lib/renhanquan-control/        数据目录（state.json + audit.jsonl；旧 JSON 仅迁移用）
/etc/nginx/sites-available/api.renhanquan.com
/etc/ssl/renhanquan/fullchain.pem   Let's Encrypt 通配符证书
/etc/ssl/renhanquan/key.pem         0600
```

`systemd` 单元带 `ProtectSystem=strict` + `ReadWritePaths=/var/lib/renhanquan-control`，
所以二进制以外的地方对这个进程是只读的。

## 凭证：磁盘上没有密钥

| 用途 | 来源 |
| --- | --- |
| 短信（dypns） | 实例角色 `home-server` 的临时凭证 |
| eWeLink `at`/`rt` | OOS 加密参数 `renhanquan/ewelink`，启动时读一次 |
| 续期后的新 token | 刷新成功即写回同一个参数（`oos:UpdateSecretParameter`） |

角色需要的策略（三条，缺一条就会在启动日志里看到对应的 403）：

```json
{ "Effect": "Allow", "Action": ["dypns:SendSmsVerifyCode", "dypns:CheckSmsVerifyCode"], "Resource": "*" }
{ "Effect": "Allow", "Action": ["oos:GetSecretParameter", "oos:UpdateSecretParameter"], "Resource": "*" }
{ "Effect": "Allow", "Action": ["kms:GetSecretValue", "kms:Decrypt"], "Resource": "*" }
```

> 这些 `Resource` 都是 `*`：精确 ARN 在阿里云的策略校验里反复被拒（见 infra.md）。
> 想收窄请先改一处、观察一天，别一次改三个。

## 发布一个新版本

```bash
# 1. 交叉编译（本机，macOS 也可以）
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -C apps/control \
  -trimpath -ldflags "-s -w" -o /tmp/control ./cmd/server

# 2. 传到临时路径
scp -i ~/.ssh/renhanquan-control /tmp/control root@39.97.233.107:/tmp/control.new

# 3. 停机 → 改名 → 启动（不能直接覆盖正在运行的二进制，会 ETXTBSY）
ssh -i ~/.ssh/renhanquan-control root@39.97.233.107 '
  systemctl stop renhanquan-control
  mv /tmp/control.new /usr/local/bin/control && chmod 755 /usr/local/bin/control
  systemctl start renhanquan-control && sleep 2 && systemctl is-active renhanquan-control
'
```

改配置同理：编辑 `/etc/renhanquan-control.env` → `systemctl restart`。

本机缺少上述 SSH 私钥时，也可使用已有阿里云身份通过 ECS 云助手
`RunCommand` 部署，不需要新增访问权限或改 SSH 信任配置。二进制临时传输到
私有 OSS 对象，使用短时签名 URL 下载，先核对目标旧版本和新文件 SHA-256；
保留 `/usr/local/bin/control.before-sse-*` 形式的独立备份后再替换、重启。
健康检查失败时恢复旧二进制；如已经迁移到统一快照，须先按下文从当前快照转换旧格式，不能直接回读历史文件。成功后删除本次私有临时对象，保留回滚备份。
不要把签名 URL、会话 Cookie 或云密钥写进仓库或日志。

会话持久化修复不会主动清空历史会话。若需要清理旧版本可能残留的已注销会话，
必须单独确认全量失效的影响（所有用户需要重新登录），并保留私有备份。
不要把历史会话备份恢复到运行目录，以免重新启用已失效的登录。

## 内置用户与存储迁移

管理员从静态站 `/manage/users/` 新增账号，不开放注册。账号首次短信验证成功才激活；停用和定向撤销会话通过管理 API 完成，不需要修改环境变量或重启。

2026-11 管理功能版把四份业务 JSON 迁移为统一 `state.json`（version=1，0600），每笔事务原子替换整份快照；`audit.jsonl` 仍独立追加。已有用户/策略/设备/会话保留，旧文件不会删除，但不再更新。上线前停服务并在 `/var/backups/renhanquan-control/` 创建私有数据备份，同时备份二进制。服务启动后检查快照和旧记录数量/ID，不能把内容打印进日志。

迁移后不要直接回滚到只识别四份旧 JSON 的二进制：旧文件已经过时，可能重新启用被撤销的会话。应优先修复前进；若必须降级，先停服务，从**当前快照**转换四份业务文件并留存当前快照，再切旧二进制，不能恢复旧会话备份。

## 验证

```bash
# 服务与代理
systemctl is-active renhanquan-control nginx
curl --resolve api.renhanquan.com:443:127.0.0.1 https://api.renhanquan.com/healthz        # {"ok":true}

# 审计链完整（断链返回 1）
DATA_DIR=/var/lib/renhanquan-control /usr/local/bin/control verify

# 设备是否真的连上厂商云
curl --resolve api.renhanquan.com:443:127.0.0.1 https://api.renhanquan.com/admin/status \
  -b <admin cookie>
```

启动日志里应该出现这两行；出现 `device provider unavailable` 就去 `/admin/status` 看原因：

```
sonoff credentials loaded from parameter "renhanquan/ewelink"
device provider: sonoff
```

## 证书

`~/certs/renhanquan/deploy.sh` 在 acme.sh 续期后同时做两件事：

1. 上传到 CDN（静态站）
2. `scp` 到这台机器并 `nginx -s reload`

**第二步失败会中止整个 hook**——静默过期的证书比响亮的报错危险得多。

## SSE（/events）

设备状态推送。nginx 必须对这个路径关掉缓冲，否则消息会攒着不发：

```
location = /events {
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

服务器每 15 秒发一行 `: ping` 注释保活；只有**至少一个浏览器在听**时才轮询厂商云。

## 常见故障

| 现象 | 先看什么 |
| --- | --- |
| 登录收不到验证码 | 启动日志有没有 `sms provider: aliyun`；阿里云里签名/模板是否还是「恒创联众 / 100001」 |
| 灯不响应 | `/admin/status` 的 `last_error`；设备 `online` 是否为 false；`outlet` 是否接对 |
| 页面状态不自动刷新 | `/events` 是否 200；nginx 那段 `proxy_buffering off` 是否还在 |
| 启动即退出 | `ALLOWED_PHONES` 为空会直接 `log.Fatal`（故意的） |
| 503 / 502 | `systemctl status renhanquan-control`；磁盘是否满（`journalctl` 会写满） |

## 备份（尚未自动化）

数据就在 `/var/lib/renhanquan-control`，一个目录。手工备份：

```bash
umask 077
mkdir -p /var/backups/renhanquan-control
chmod 700 /var/backups/renhanquan-control
# 停止写入后创建私有本机备份，禁止上传到 public-read 的站点对象
tar czf /var/backups/renhanquan-control/data-$(date +%F-%H%M%S).tgz -C /var/lib renhanquan-control
```

自动备份需要在机器上放一个只具备 `oss:PutObject` 的凭证，这一步还没做。
