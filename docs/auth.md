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

没有公开注册流程，只有数据库里的**内置用户**。管理员在 `/manage/users/` 新增用户，填写姓名、手机号和可选头像；创建时未激活且没有设备/管理权限，不需要改配置或重启。首次短信验证成功后记录 `activated_at`。激活状态和启用/停用独立，停用会在同一事务内撤销该用户所有会话，重新启用不会恢复旧会话。

| 配置 | 作用 |
| --- | --- |
| `ALLOWED_PHONES` | 启动时补建缺失的内置用户；不覆盖已有账号、不重新启用停用账号；登录以数据库为准 |
| `ADMIN_PHONE` | 首次启动自动建管理员，并授予根策略 `*`/`*` |

登录：

1. `POST /auth/sms/send`：只有已建且启用的账号才发短信；所有号码均返回同样的 200 和随机 `sid_login` Cookie（跟随 `COOKIE_NAME` 前缀）。发送失败、限流不暴露账号是否存在，具体原因记录在服务端审计。
2. `POST /auth/sms/verify`：必须携带本次发送产生的登录 Cookie，验证已建账号，首次成功时激活；陌生号码不会自动创建。Cookie 为 `HttpOnly; Secure; SameSite=Lax; Path=/auth/sms`，有效期 5 分钟，最多校验 5 次，成功后不可重放。无效/过期/耗尽的登录凭据统一返回 401，不会消耗其他浏览器的验证码尝试次数。
3. 服务端签发 256 bit 随机会话 ID，写 `HttpOnly; Secure; SameSite=Lax` cookie。

发码按 IP 每小时 20 次、已建号码每分钟 1 次限流；校验按 IP 每 10 分钟 30 次限流，限流判断在账号查询之前，对所有号码一致。IP 仅信任本机回环代理的 `X-Forwarded-For` 最后一跳；nginx 必须覆盖该头或追加真实客户端 IP，不可原样转发客户端值。其他来源忽略转发头。限流桶有数量上限并自动清理。

登录凭据仅在内存中维护，控制面重启后正在登录的人需要重新获取验证码；已经签发的会话不受影响。浏览器继续使用 `credentials: include`，无需前端读取 Cookie；脚本客户端需要保存发码响应 Cookie 并在校验时携带。

旧账号迁移：历史成功登录审计/会话用于推断激活时间；旧版只在登录后创建的 member 以创建时间兜底。新建账号不会在重启时被自动激活。迁移不清空任何会话。

头像由用户在账号菜单修改，也可由用户管理员编辑。姓名统一用于账号菜单、用户列表、授权对象和确认提示；未设置时提示补全，不以手机号代替称呼。本人可在账号菜单编辑姓名，手机号只用于登录和账号资料识别。浏览器支持 JPG/PNG/WebP，选图后可拖动、缩放和预览裁剪；不按原图文件大小拒绝，原图只在本地解码，并缩小为最长边 2048px 的裁剪预览。确认后导出 256px JPEG，按实际编码大小自动降低质量/尺寸，保证 data URL 不超过服务端的 180,000 字符限制，仅上传裁剪后的头像。服务端仍限制尺寸不超过 512px 并重新编码，拒绝 SVG 和外链。图片随账号存储，不上传公开 CDN，不向匿名 `/auth/me` 暴露。

头像浏览器回归：先运行 `NEXT_PUBLIC_YARD_API=https://api.renhanquan.com pnpm build`，再运行 `pnpm test:avatar`（需 Playwright Chromium，或用 `CHROME_PATH` 指向本机 Chrome）。测试会拦截所有控制面请求，不会修改线上账号；覆盖超过 5 MB 的原图、拖动/缩放后的实际导出、失败重试、触屏与嵌套弹窗取消。

会话签发、注销和过期清理必须经 `Store.Tx` 持久化，不能只改内存。
签发落盘失败不发 Cookie；注销落盘失败返回 `logout_failed`，保留 Cookie，
前端显示错误供重试，不能把失败当成已退出。回归测试需重新打开存储，确认
已注销会话不会恢复，并覆盖磁盘写失败。

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
| 管理授权（仍受自身权限范围约束） | `policy:*` / `grant` |
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

授予、拒绝、撤销及降级时必须同时满足：

1. 操作者具有 `policy:* / grant` 管理能力
2. **操作者自己持有每条被修改规则对应的 (资源, 操作)**，不能通过 `false`、`none` 或删除规则绕过

变更使用事务开始时的 ACL 快照判断，整笔请求有一项越界就全部回滚。只读管理员可以授予/撤销读取，但保留控制规则，不能把可控制对象降为只读或不可访问；改动通配操作策略也需持有相应完整权限。

最后一位启用且已激活的权限管理员仍受到保护；系统未增加不可修改的 Owner 角色，同样具有某项能力的权限管理员可以管理彼此的该项能力。回归见 `access_security_test.go` 和 `management_test.go`。

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

1. **厂商字段使用白名单。** `controllableParams` 声明可写动作；`publicReadings` 声明可公开状态。SSID、BSSID、MAC、绑定资料、诊断及未知字段在进入缓存前被过滤；多路开关只保留 `outlet` / `switch`。设备清单、指令回执和 SSE 共用这份过滤后的状态。新字段需要在 provider 明确评估后加入白名单。
2. **读缓存 + 写穿透。** `Read` 有 1 秒 TTL；`Discover` 一次拿全量，
   所以刷新 N 台设备只发一次请求。写成功后立刻删掉该设备缓存，下次读是新状态。

外呼串行 + 最小间隔 200ms：厂商没公布限流策略，就按克制的方式调用。

**密钥存放**：CoolKit 的 `at`/`rt` 可以放在 **OOS 参数仓库的加密参数**里
（`SONOFF_SECRET_PARAM`），服务启动时用实例角色读一次，机器上不落盘。

⚠️ 创建加密参数时**「KMS 专属实例 ID」必须留空**——留空走旧版默认 KMS，免费，
每地域上限 200 个；填了实例 ID 就走付费的专属 KMS（30 元/天起）。

KMS 凭据管家那条路（`SONOFF_SECRET_NAME`）代码保留但默认不用：它要求一个
KMS 实例，最低 30 元/天 + QPS 费，为两个 token 不值。

**自动写回**：CoolKit 每次续期都会轮换 `rt`，旧值立刻失效。所以刷新成功后
服务会把新的 `at`/`rt` 写回同一个加密参数（`oos:UpdateSecretParameter`），
重启永远能拿到有效凭证。

`at` 不需要特意回填：它过期了用 `rt` 换一个就行。**`rt` 才是不更新就会出事的那一个。**

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

任一不满足 → 保持纯前端动画。所以**无设备权限、映射缺失时都只显示前端预览；匿名访客若有设备授权，也可操作**。

读状态和下发都走通用设备接口，没有灯专用端点：

```
GET  /devices              每台设备带 actions / state / permissions
POST /devices/{key}/commands   {action, params}
```

前端始终拿不到"设备清单之外"的东西：`/devices` 已经按 ACL 过滤过，
不在响应里的设备连 key 都不存在。

## Origin 与 CSRF 防护

所有修改状态的请求（包括发验证码、登录、注销、设备命令、授权和撤权）必须同时满足：

- `Origin` 精确匹配 `ALLOWED_ORIGINS` 中的完整来源（协议、主机、端口）；
  缺失、`null`、通配符和其他子域均不自动放行。
- `X-CSRF-Protection: 1`。这是 JSON API 的自定义请求头防护，利用浏览器的
  CORS 预检限制伪造请求，不是登录凭证，也不替代设备 ACL。
- `Content-Type: application/json`，可带 charset；表单和 `text/plain` 均拒绝。

CORS 只允许精确白名单来源，以及 GET/POST/PUT/PATCH/DELETE 和必要请求头。
非法来源连实际请求也会被拒绝，而不只是缺少 CORS 响应头。
GET/HEAD 不要求 CSRF 请求头；不携带 Origin 的服务端健康检查仍可用。
脚本或 curl 调用写接口时同样需要上述三个头和原有身份凭证。

网页的写请求统一经过 `src/lib/control.ts` 的 `controlWrite`。
发布需要先让后端允许新请求头、再更新网页、最后启用强制检查；旧网页需要刷新。
不得通过扩大 Origin 白名单来代替登录或权限校验。

## 实时推送的权限边界

`GET /events` 当前仍要求有效登录会话，不因匿名 ACL 授权而自动开放。
服务端对每条广播重新解析会话，并按当前 `device:<key>` / `read` 权限重建
`states` 响应；`control` 蕴含 `read`，显式拒绝优先，隐藏或已删除的设备不推送。
没有可见设备的广播直接丢弃，未知字段和格式错误的事件不会原样转发。

权限撤销对后续事件生效；注销、会话吊销或账号禁用后，下次事件或心跳检查
关闭连接（空闲时最多 15 秒），会话到期由独立定时器关闭，即使没有广播也不续留。
客户端不能用一次建立的 SSE 连接绕过后续鉴权。未来开放匿名 SSE 时也必须沿用
逐事件的设备权限过滤，不能直接移除登录检查后转发原始广播。

回归测试：`apps/control/internal/api/events_test.go`，覆盖多用户隔离、显式拒绝、
控制蕴含读取、隐藏/删除、权限撤销、会话吊销/过期与账号禁用。

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

当前实现是一个目录：

```
data/
  state.json    # version=1，users/policies/devices/sessions 的统一快照，0600
  audit.jsonl   # 独立追加审计链
```

`Tx` 复制内存状态，统一写临时快照、fsync、rename，成功后再替换内存；多用户/授权/会话改动不会部分提交。首次启动只在不存在 `state.json` 时读取旧 `users.json` 等四个文件；旧文件保留但不再更新。存在但损坏的快照直接报错，不能回退旧文件而恢复已撤销会话。备份需包含整个数据目录；不要单独恢复旧 sessions 文件。

### 换成 SQL 时不能改的三件事

1. **ID 由应用层生成**（`store.NewID`，时间前缀 + 熵），不用自增主键
2. **多对象写入走 `Tx`**，不要在业务代码里连调两次
3. **不要有 `SaveAll` / `Find(任意条件)`**——接口一旦暴露存储形态，换库就要重写调用方

升级阶梯：JSON 文件 → SQLite（也是文件，接口不变）→ Postgres / RDS。
真正该换的信号：需要多实例、记录到几万条、开始要复杂查询。

## 审计

### 写入时机与失败处理

管理变更（用户、授权、设备资料）在提交统一快照前同步写入带 operation ID 的 `pending` 意图记录，写审计失败就不提交数据。提交后再异步写 `ok`/`failed` 结果。意图和业务快照是两个文件，不宣称跨文件原子：崩溃留下 pending 时要对照当前状态调查。设备发现同步也先记意图。

登录、访问拒绝、限流、注销等事件通过后台有界队列写入；队列满会丢弃并计数。它们用于追踪行为，不代表登录或注销的事务提交点。会话是否有效以 `state.json` 为准。

审计是请求发生时记录日志；`control verify` 是另一个离线检查命令，不会定时自动执行，也不会自动报警。

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
- 已登录显示头像和称呼/脱敏手机号，点开可改头像或退出；具有管理能力时显示管理入口
- 发码请求成功时提示「若该号码已开通登录，验证码将发送至手机」，已建与未建账号保持一致；网络错误或 HTTP 失败时显示失败提示，留在手机号输入步骤并允许重试

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
短信发送失败并写审计，不会降级到 fake；对外仍返回统一响应，避免用上游错误枚举账号。

## API

```
POST   /auth/sms/send
POST   /auth/sms/verify          -> Set-Cookie
POST   /auth/logout
GET    /auth/me                  // 本人资料和能力
PATCH  /auth/profile             // 本人称呼、头像

GET    /devices                  // 按 ACL 过滤，没权限的设备根本不出现
POST   /devices/{key}/commands   {action, params}
GET/POST  /admin/users
PATCH     /admin/users/{id}
POST      /admin/users/{id}/revoke-sessions
GET       /admin/subjects
GET/PATCH /admin/devices[/{key}]
POST      /admin/devices/sync
GET/PUT   /admin/access
PUT       /admin/capabilities
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
| `SONOFF_SECRET_PARAM` | — | 从 OOS 参数仓库的加密参数读，值形如 `renhanquan/ewelink` |
| `SONOFF_SECRET_NAME` | — | 同上，但走 KMS 凭据管家（**要付费实例，默认不用**） |
| `ALIYUN_ROLE_NAME` | 回退 `SMS_ROLE_NAME` | 读参数用的实例角色 |
| `SONOFF_REGION` | `cn` | `cn` / `as` / `us` / `eu` |
| `SONOFF_BASE_URL` | 按 region | 覆盖 API 域名，测试或自建代理用 |
| `ALLOWED_ORIGINS` | 空 | 跨域白名单，如 `https://www.renhanquan.com` |

前端构建期变量（在 `.env.local` 或 CI 里设）：

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_YARD_API` | 控制面地址，如 `https://api.renhanquan.com`；留空则整站保持纯虚拟 |

备份就是打包目录。

## 管理页面

- `/manage/users/`：新增内置用户、激活/启用状态、资料头像、定向撤销会话。
- `/manage/permissions/`：按用户或匿名访客配置每台设备的不可访问/只读/可控制，展示策略来源；管理能力单独授权。
- `/manage/devices/`：设备状态、名称/区域/隐藏编辑、同步厂商清单、只读 3D 映射。

页面仍然静态导出，数据只从控制面 API 读取，所有管理接口服务端检查会话和 ACL：`user:* / manage`、`device:* / manage`、`policy:* / grant`、`audit:* / read`。角色名称不决定权限。不能把自己没有的能力转授他人，也不能移除最后一位启用且已激活的权限管理员。匿名访客仅支持设备授权，不能授予管理能力。

设备同步保留本地名称、区域、隐藏设置；厂商列表暂时缺失的设备保留为 missing/offline，不暴露到普通设备列表或 SSE。隐藏不代表撤销授权；需要撤权时在权限页调整。

## 未完成

- 米家 / 涂鸦 provider
- 告警：连续登录失败、新 IP 登录、授权变更主动通知
- 自动备份
