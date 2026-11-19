# 小米云接入

小米适配器运行在独立 Go 控制面，使用云端 HTTPS 控制与 MQTT v5/TLS 订阅；不安装
Home Assistant，不运行 Python 服务、不部署 MQTT broker，也不扫描或连接家庭局域网。

这是独立实现的社区云协议接入，不是小米向本站签发的通用开放平台授权。
OAuth 使用米家 HA 集成的专用客户端身份；未来可能要求重新授权或调整协议。
没有复制官方 HA 集成源码。设备协议参考社区项目
[mi_home_cli](https://github.com/slightc/mi_home_cli)，MQTT 客户端为 Eclipse Paho Go。

## 配置与凭据

生产配置保留 Sonoff，同时启用小米：

```dotenv
DEVICE_PROVIDER=sonoff,xiaomi
XIAOMI_SECRET_PARAM=renhanquan/xiaomi
XIAOMI_DEVICE_IDS=<已验证空调的 did>
```

设备白名单必须显式配置。目前仅支持已验证的 `xiaomi.airc.h09h00` 空调，其他型号
和米家账号中的其他设备不会自动开放。设备键为 `xiaomi-<did>`，新设备沿用现有
ACL；不会给匿名访客或现有普通用户自动授予权限。

凭据采用与 Sonoff 相同的 OOS **加密参数**，但使用独立参数，不覆盖 `renhanquan/ewelink`。
实例角色负责读取和刷新写回，配置文件只保存参数名。值为 JSON，字段如下（此处没有真实值）：

- `access_token`、`refresh_token`
- `region`（当前中国大陆为 `cn`）
- `device_id`（OAuth 与 MQTT 需要同一身份）
- `redirect_url`（首次授权时注册的完整回调 URL）
- `obtained_at`（Unix 秒）、`expires_in`（秒）

使用约 70% 有效期后续期。新的整组凭据同步写回 OOS 后才供调用者使用；写回失败保留
待写入的版本并重试，不用旧刷新令牌再次轮换。健康状态显示写回是否待完成以及到期时间，
绝不返回令牌。MQTT 每分钟检查凭据，需要时更新令牌并重连；每次重连重新订阅和补读状态。

首次创建加密参数的操作者需要 `oos:CreateSecretParameter` 及所需的 KMS 权限。
不能把 RAM 用户的权限误认为 ECS 实例角色的权限。运行期沿用现有角色的
`oos:GetSecretParameter` / `oos:UpdateSecretParameter` 与解密权限，还必须为实例角色授予
底层凭据 `oos/renhanquan/xiaomi` 的 `kms:PutSecretValue`。只给 RAM 用户授权不影响实例角色。
注意 OOS 文档里的“UpdateSecretValue”并不是应填写的 KMS Action，实际写入权限为
`kms:PutSecretValue`，以 KMS 授权信息表和实测为准。

## 状态和控制边界

只公开开关、运行模式、目标温度、环境温度/湿度、风速、上下扫风及指示灯。
可写动作以 `set_` 开头，统一用 `params.value`。参数的类型、范围和步长在适配器内校验；
禁止任意服务/属性 ID、设备 token、网络资料、工程参数及重置功能透传。

`set_targetTemperature` 范围 16–31℃、步长 0.5℃；模式值为制冷 2、除湿 3、送风 4、
制热 5；风速为 0–8。部分操作受设备当前运行状态限制：实测关机时修改温度会被设备拒绝，
应呈现失败，不能假装成功或擅自开机。

页面读取缓存，SSE 更新驱动显示；登录、重连和命令确认时补读快照，不因场景重绘请求小米云。启动、MQTT 重连和十分钟
设备重同步时读取快照，控制后补读目标属性。平时由 MQTT 更新缓存并立即送入已有 SSE hub。
服务端仍逐事件重新验证会话、隐藏/删除状态和设备 read ACL；没有新增匿名 SSE。
`online` 表示设备云端在线状态，`stateFresh` 表示 MQTT 已成功订阅，断线时状态标为非实时。

Sonoff 与小米各自失败不会让另一家设备失效。厂商发现失败时保留旧设备和本地配置，
不把暂时不可达的设备当成已删除；健康详情通过现有 `/admin/status` 查看。

## 运维验证

`cmd/xiaomi-check` 是只供服务器操作者使用的云端自检，凭据从 OOS 读取，不接收命令行令牌。
可用 `-refresh` 验证一次实际续期和 OOS 写回；默认只读取状态并验证订阅。
联调续期时可传 `-pending-file /root/<私有目录>/pending.json`，在 OOS 写入失败时暂存
新凭据以便修复权限后恢复，不能丢弃已经轮换的凭据或恢复旧版本。生产运行不使用该诊断文件。
`-cycle-indicator` 会临时切换指示灯，验证收到真实 MQTT 消息，再恢复原值，不改变空调开关/温度。

**不要与正式小米 provider 同时运行这个检查工具**：同一个 OAuth device_id 只能保持一个
MQTT 客户端连接，会互相挤下线。应在启用生产小米 provider 前运行，或停服务后检查。

```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -C apps/control -o /tmp/xiaomi-check ./cmd/xiaomi-check
# 在 ECS 上加载受保护的生产配置；首次启用前可临时注入 XIAOMI_* 参数名/设备白名单
set -a; . /etc/renhanquan-control.env; set +a
/path/to/xiaomi-check -refresh -cycle-indicator
```

生产仍使用同一个 `control` 二进制、原有数据目录与 systemd 单元。发布前私有备份旧二进制、
配置和数据快照；不清空会话、不改既有授权。仅修改网关时无需发布静态站；本次 `/home`
空调胶囊、精细控制面板和模型联动还需要同步 GLB 并发布网页，见 [部署说明](deploy.md)。

## 2026-11-19 上线验证

- 凭据已存入北京地域 `renhanquan/xiaomi` 加密参数，实例角色的续期写回和读回一致性验证通过。
- 原生 Go 云端控制和 MQTT 推送通过，指示灯临时切换后恢复原值；未改变空调开关、模式和目标温度。
- 正式服务的控制 API → 小米云 → MQTT → 已认证 SSE 联调通过，观察到约 0.59 秒的状态通知。
- 匿名设备读取和控制均未获授权；原有用户、活跃会话、权限策略与四个 Sonoff 设备记录保留。
