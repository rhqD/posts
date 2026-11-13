# 鉴权与设备控制面

## 一句话

博客继续纯静态；**设备控制单独长成一个服务**（`apps/control`），
它负责三件事：证明你是谁、判断你能不能动这个资源、以及把每一次判断记下来。

**静态站不能当鉴权边界。** 页面可以公开，API 必须服务端验。

## 为什么不是「回到 Next.js 服务端」

- `output: "export"` 是资产，博客不需要 SSR
- 控制面有完全不同的生命周期：密钥、内网、长连接、审计
- 耦合的代价是「改一篇文章的发布可能重启了控制服务」

## 身份

没有注册流程。**家庭成员就是配置里的一组手机号。**

| 配置 | 作用 |
| --- | --- |
| `ALLOWED_PHONES` | 允许登录的手机号，逗号分隔 |
| `ADMIN_PHONE` | 首次启动自动建管理员，并授予根策略 `*`/`*` |

登录：

1. `POST /auth/sms/send`：号码命中白名单才真发短信；**不在白名单也返回同样的 200**，
   否则这个接口就成了「你家手机号探测机」
2. `POST /auth/sms/verify`：校验通过后**首次登录自动建号**（role=member）
3. 服务端签发 256 bit 随机会话 ID，写 `HttpOnly; Secure; SameSite=Lax` cookie

短信走阿里云**号码认证服务的「短信认证」**（dypnsapi）：个人实名可用、免签名免模板。
传统 SMS 的验证码模板要求企业资质，个人申请不下来。

## 权限

### 模型

一条策略 = (主体, 资源, 操作, 效果)。资源与操作都是字符串，支持 `*` 通配。

```
资源命名空间
  device:<key>     一台设备
  device:*         所有设备
  user:<id>        某个用户
  policy:*         权限本身
  audit:*          审计日志
  *                一切
```

**权限系统不认识「设备」。** 设备只是资源命名空间的一个前缀；`policy` 也是。

### 自指

「管理权限的权限」不是特殊机制，就是 `policy:*` 上的 `grant` 操作：

| 意图 | 策略 |
| --- | --- |
| 管理员 | `*` / `*` |
| 只能管客厅设备的授权 | `device:living-*` / `grant` |
| 只能看 | `device:*` / `read` |
| 匿名可读庭院灯 | anonymous + `device:yard-lamp` / `read` |

### 判定

```
1. 命中任意 deny（且操作匹配）→ 拒绝
2. 命中任意 allow → 允许
3. 默认拒绝
```

`control` **蕴含** `read`：能操作设备的人必然能看见它。

策略全量载入内存做匹配。通配本来就无法下推到 SQL；家庭规模几十条策略，
O(n) 匹配完全够用，不要提前优化。

### 防止提权

授予时必须同时满足：

1. 授予者对目标资源有 `grant` 操作
2. **授予者自己已经持有要授出的那条 (资源, 操作)**

第二条是安全底线：否则一个只有 `device:living-*` 的人能给自己发 `*`/`*`。
已由测试覆盖：受限主体授予 `*`/`*` 返回 403。

## 设备抽象

按**能力**建，不按品牌建。

```go
type Provider interface {
    Name() string
    Discover(ctx) ([]Descriptor, error)
    Read(ctx, keys []string) (map[string]Readings, error)
    Apply(ctx, key string, cmd Command) error
}
```

`Descriptor` 自带 `Readings`（可读字段）和 `Actions`（可执行操作 + 参数规格）。
**能力是开放集合**，不是枚举：新设备类型自己声明，核心代码不用改。

指令校验是数据驱动的：设备没声明这个 action，直接 422。

`Read` 是批量的，因为厂商云接口本来就是「一次返回全量状态」，省掉 N 次往返。

### 已实现的 provider：Sonoff / CoolKit

走的是 eWeLink App 同一套云接口，**不刷机、不要本地 broker、不开入站端口**：

```
GET  /v2/device/thing          设备列表，每台自带 params
POST /v2/device/thing/status   {type, id, params}
```

两个设计点：

1. **能力从 `params` 反推。** 云端说哪个字段可写，就生成 `set_<字段>` 动作；
   `rssi` / `battery` / `temperature` 这类观察字段进 `readOnlyParams`。
   结果就是**没见过的设备类型也能直接控制**，不用改代码。
2. **读缓存 + 写穿透。** `Read` 有 1 秒 TTL；`Discover` 一次拿全量，
   所以刷新 N 台设备只发一次请求。写成功后立刻删掉该设备缓存，下次读是新状态。

外呼串行 + 最小间隔 200ms：厂商没公布限流策略，就按克制的方式调用。

**密钥存放**：CoolKit 的 `at`/`rt` 放在 KMS **凭据管家**里，服务启动时用实例角色读一次
（`SONOFF_SECRET_NAME`）。机器上不落盘，控制台可改、可审计。

⚠️ 读回来的是**快照**：如果服务运行期间 token 被刷新过，KMS 里的 `rt` 会慢慢变旧。
超过约 60 天没更新凭据，重启后就续不上了——记得定期把新值写回（或以后加写回逻辑）。

**token 续期**：CoolKit 有 `/v2/user/refresh`，只要 `at` 和 `rt` 就能续，
不需要重新登录（登录要用 App 私有密钥做 HMAC 签名，那一步我们不做）。配上
`SONOFF_REFRESH_TOKEN` 后，401 时自动刷新一次并重试。

没配 `rt` 就退化成 `StaticToken`：`at` 约 30 天过期，过期后 `/admin/status` 显示
`last_error`，不会静默失效。

⚠️ **一个 bearer 就能控账号下所有设备**，没有二次验证、没有按设备授权。所以：
token 只放服务端；泄露的处置只有改 eWeLink 密码、作废全部 token。

### 3D 灯具映射（/home）

3D 场景里的灯是 Blender 对象名，真设备是厂商 deviceid。两者靠一张**客户端**表连接：

```ts
// src/components/yard/device-map.ts
export const DEVICE_MAP = {
  entry: { device: "1000abc" },                       // 默认 set_switch
  desk:  { device: "1000def", action: "set_power" },
};
```

**为什么放客户端**：服务端只知道设备，不知道「庭院灯」这种展示概念。灯是 UI 的事，
映射不该污染设备模型。代价是改完要重新 build + deploy，而不是改个文件就生效。

一台灯要真正联网，三个条件全满足：

1. 灯在 `DEVICE_MAP` 里（不在就永远不请求）
2. `/devices` 返回的这台设备 `permissions.control == true`
3. 设备 `actions` 里确实有这个动作

任一不满足 → 保持纯前端动画。所以**陌生人、未登录、映射缺失，三种情况表现完全一致**。

读状态和下发都走通用设备接口，没有灯专用端点：

```
GET  /devices              每台设备带 actions / state / permissions
POST /devices/{key}/commands   {action, params}
```

前端始终拿不到"设备清单之外"的东西：`/devices` 已经按 ACL 过滤过，
不在响应里的设备连 key 都不存在。

## 存储契约

```go
type Store interface {
    Users() Users
    Policies() Policies
    Devices() Devices
    Sessions() Sessions
    Audit() AuditStore
    Tx(ctx, fn func(Store) error) error
    Close() error
}
```

P1 实现是**一个目录的 JSON 文件**：

```
data/
  users.json  policies.json  devices.json  sessions.json
  audit.jsonl
```

写操作 = 临时文件 + `fsync` + `rename`，崩溃最多丢最后一次写，不会写坏文件。

### 换成 SQL 时不能改的三件事

1. **ID 由应用层生成**（`store.NewID`，时间前缀 + 熵），不用自增主键
2. **多对象写入走 `Tx`**，不要在业务代码里连调两次
3. **不要有 `SaveAll` / `Find(任意条件)`**——接口一旦暴露存储形态，换库就要重写调用方

升级阶梯：JSON 文件 → SQLite（也是文件，接口不变）→ Postgres / RDS。
真正该换的信号：需要多实例、记录到几万条、开始要复杂查询。

## 审计

### 两条通道

| 类型 | 例子 | 写入 | 失败处理 |
| --- | --- | --- | --- |
| 安全事件 | 授权变更、登录成功、吊销 | 同步 + fsync | **操作失败** |
| 访问事件 | 403、限流、匿名操作 | 异步 + 有界队列 | 丢弃并计数 |

授权变更 fail-closed：日志都写不进去的时候，让权限改动生效才是危险的。
登录失败反过来不能 fail-closed，否则磁盘一满全家登不进来。

### 不影响接口性能

请求路径上只做两件事：构造 `Entry`、非阻塞投递。

```go
select {
case l.ch <- it:   // 命中
default:           // 队列满：直接丢弃，计数
    l.drops.Add(1)
}
```

JSON 编码、fsync、哈希计算全在后台单个 goroutine 里做。
日志不在关键路径上，接口耗时不受它影响。

### 防篡改

每条记录串链：`hash = sha256(prevHash || canonical_json(entry))`。

```bash
DATA_DIR=./data ./control verify     # 断链返回 1
```

删除中间一行、改一个字段、调整顺序，链立刻断掉。
建议放进 cron 每天跑一次；配合每日把最后一条 hash 传到 OSS，连「删掉末尾」也能发现。

### 脱敏

| 字段 | 落库 |
| --- | --- |
| 手机号 | `138****5678` |
| 会话 ID | 前 8 位 |
| 验证码 / 密码 / eWeLink token | **不记录** |

用 JSONL 而不是文本日志，顺带防了日志注入（换行会被转义）。

## 前端入口

登录入口在**全站 Header**（`src/components/layout/LoginControl.tsx`），不是查看器的一部分：

- `NEXT_PUBLIC_YARD_API` 为空时整个组件不渲染，静态部署不会出现一个点不动的按钮
- 未登录显示「登录」，点开是手机号 → 验证码两步
- 已登录显示脱敏手机号，点开可退出
- 发码后一律提示「验证码已发送」，和服务的响应口径一致

登录/登出后派发 `window` 事件 `auth-change`，`/home` 收到后重新拉 `/devices` 并刷新灯具，
不用刷新页面。

### 生产环境的短信凭证

服务器上**不放 AccessKey**。实例挂 RAM 角色 `home-server`，凭据从
`100.100.100.200` 的元数据服务取，一小时一换，到期前 5 分钟自动刷新。

```
GET /latest/meta-data/ram/security-credentials/home-server
→ {AccessKeyId, AccessKeySecret, SecurityToken, Expiration}
```

签名时把 `SecurityToken` 一并带上（STS 凭证必需）。角色没了、元数据取不到时，
短信发送直接失败并写审计，不会静默降级。

## API

```
POST   /auth/sms/send
POST   /auth/sms/verify          -> Set-Cookie
POST   /auth/logout
GET    /auth/me

GET    /devices                  // 按 ACL 过滤，没权限的设备根本不出现
POST   /devices/{key}/commands   {action, params}
GET    /admin/policies
POST   /admin/policies
DELETE /admin/policies/{id}
GET    /admin/audit
GET    /healthz
```

约定：

- 设备「不存在」和「没权限」都返回 **404**，不泄露存在性
- 所有响应 `Cache-Control: no-store`
- 同域时免 CORS；跨子域时 cookie 用 `Domain=.renhanquan.com` + 显式白名单

## 运行

```bash
cd apps/control
ADDR=:8080 DATA_DIR=./data SMS_MODE=fake \
  ALLOWED_PHONES=13800000001,13800000002 ADMIN_PHONE=13800000001 \
  COOKIE_SECURE=false go run ./cmd/server
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ADDR` | `:8080` | 监听地址 |
| `DATA_DIR` | `./data` | 数据目录 |
| `SMS_MODE` | `fake` | `fake` 打印验证码；`aliyun` 走 dypnsapi |
| `SMS_CREDENTIALS` | `env` | `ecs-role` 从实例元数据取临时凭证；`env` 读静态 AK |
| `SMS_ROLE_NAME` | — | `SMS_CREDENTIALS=ecs-role` 时必填，如 `home-server` |
| `SMS_SIGN_NAME` | — | 平台赠送签名，如 `恒创联众`；与模板必须配套 |
| `SMS_TEMPLATE_CODE` | — | 平台赠送模板，如 `100001` |
| `SMS_TEMPLATE_PARAM` | `{"code":"##code##","min":"5"}` | 由平台生成验证码 |
| `ALIYUN_ACCESS_KEY_ID/SECRET` | — | 仅 `SMS_CREDENTIALS=env` 时需要 |
| `ALLOWED_PHONES` | — | 必填，空则启动失败 |
| `ADMIN_PHONE` | — | 首次启动建管理员 |
| `SESSION_TTL` | `720h` | 会话有效期 |
| `COOKIE_SECURE` | `true` | 本地 http 调试设 `false` |
| `COOKIE_DOMAIN` | 空 | 跨子域时设 `.renhanquan.com` |
| `DEVICE_PROVIDER` | `mock` | `mock` 假设备；`sonoff` 走 CoolKit |
| `SONOFF_ACCESS_TOKEN` | — | `DEVICE_PROVIDER=sonoff` 必填，eWeLink 的 `at` |
| `SONOFF_REFRESH_TOKEN` | — | eWeLink 的 `rt`；配上后 token 会自动续期，不会 30 天到期 |
| `SONOFF_SECRET_NAME` | — | 改为从 KMS 凭据管家读，值形如 `renhanquan/ewelink`；配上后不再需要上面两个 |
| `ALIYUN_ROLE_NAME` | 回退 `SMS_ROLE_NAME` | 调 KMS 用的实例角色 |
| `SONOFF_REGION` | `cn` | `cn` / `as` / `us` / `eu` |
| `SONOFF_BASE_URL` | 按 region | 覆盖 API 域名，测试或自建代理用 |
| `ALLOWED_ORIGINS` | 空 | 跨域白名单，如 `https://www.renhanquan.com` |

前端构建期变量（在 `.env.local` 或 CI 里设）：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_YARD_API` | 控制面地址，如 `https://api.renhanquan.com`；留空则整站保持纯虚拟 |

备份就是打包目录。

## 未完成

- Sonoff token 自动续期（需要厂商开发者凭据，不是逆向私钥）
- 米家 / 涂鸦 provider
- 管理界面（目前只有 API）
- 告警：连续登录失败、新 IP 登录、授权变更主动通知
- 前端登录页与 `/home` 集成