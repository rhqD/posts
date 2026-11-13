# AGENTS.md — 接手这个仓库前先读这一页

这个文件是给 AI agent（以及未来的你）看的操作手册。README.md 面向人类访客，
docs/ 下有更细的专题文档。**如果文档和代码冲突，以代码为准，并顺手修文档。**

## 这是什么

个人网站 renhanquan.com：主页 + 博客。
博客内容在 Notion 里写，构建时拉取，产出纯静态 HTML 上传到阿里云 OSS，由 CDN 分发。

- 线上：https://www.renhanquan.com
- 仓库：github.com/rhqD/posts

**博客本身没有服务端、没有数据库、没有后台。** 这是最重要的一个事实。

唯一例外是 `apps/control`：一个独立的家庭设备网关（Go，自带鉴权/权限/审计），
部署在自己的机器上，和静态站**没有任何运行时耦合**。见 [docs/auth.md](docs/auth.md)。

## 一分钟看懂架构

```
Notion (database)
   |  make sync   (apps/api/cmd/sync, Go)
   v
content/posts/*.json  +  content/posts.index.json
   |  make images (scripts/images.mjs, sharp)
   |   下载 -> 1600px WebP -> 上传 OSS -> 改写 URL 为 /images/<hash>.webp
   v
pnpm build  (next build, output: "export")
   v
out/  (纯静态目录)
   |  scripts/deploy.sh (ossutil，先资源后 HTML)
   v
OSS bucket renhanquan-site (cn-hangzhou)
   |  源站
   v
阿里云 CDN  www.renhanquan.com  <-- User
```

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| `src/app` | Next.js App Router 页面（全部静态导出） |
| `src/components` | home / post / layout 组件 |
| `src/content/bio.ts` | 个人资料、技能、经历，**手写的静态数据** |
| `src/lib/notion.ts` | 读 `content/` 快照；没有快照时才回退到 Notion API |
| `apps/api/cmd/sync` | Notion → content/ 的同步工具（Go，零外部依赖） |
| `apps/control` | 家庭设备网关：短信登录、权限、设备抽象、审计（独立部署） |
| `content/` | 构建期内容快照，**要提交进 git** |
| `scripts/images.mjs` | 图片管线 |
| `scripts/deploy.sh` | 构建产物上传 OSS |
| `src/app/(bare)/home` | `/home` 3D 页面（仅 Header，无 Footer） |
| `src/components/yard` | 3D 场景组件与本仓库自有的查看器 UI |
| `public/yard` | 运行时资产：`lights.json` + draco 解码器 |
| `docs/` | 架构、部署、内容管线的细节 |

## 常用命令

```bash
pnpm dev          # 本地开发，修改 src/content/bio.ts 或 content/ 会热更新
make control-dev  # 控制面本地跑（fake 短信，验证码打印在 stdout）
make control-test # 控制面测试
make control-verify # 校验审计哈希链，断链返回非 0
make sync         # Notion -> content/（需要 NOTION_API_KEY）
make images       # 图片处理 + 上传 OSS
make deploy       # 构建 + 上传 OSS
make publish      # sync + images + deploy
```

`make sync` 会加载 `.env.local`（Makefile 里已处理）。

## 硬性约束（改代码前必须知道）

1. **不能给 Next.js 引入任何运行时服务端逻辑。** `next.config.ts` 是 `output: "export"`，
   一旦出现 Route Handler、Server Action、需要请求头/cookie 的动态页面，构建会失败。
   历史上这里有过 `/api/bio/*`、`/api/posts`、`/api/upload`、`/api/auth`，全部删除。
   这条只管 `src/` 和 `next.config.ts`；`apps/control` 是另一个进程，不受约束。
2. **Notion 图片 URL 只有 1 小时有效期。** 任何出现在 HTML 里的图片地址必须是
   `/images/<hash>.webp`，由 `make images` 生成。绝不把 S3 签名 URL 写进内容。
3. **HTML 不能缓存，资源必须长缓存。** `scripts/deploy.sh` 用不同的 Cache-Control 分两次上传，
   顺序是「先资源、后 HTML」，否则会出现新 HTML 指向未上传 JS 的 404 窗口。
4. **不要随手删除 OSS 上的旧文件。** 用户浏览器可能还开着旧页面，deploy 脚本从不用 --delete。
   需要清理时跑 `node scripts/prune-oss.mjs`（默认 dry-run，加 `--delete` 才删）：
   它把 `out/` 的全部文件 **加上页面里引用的 `/images`、`/models`、`/yard` 路径** 作为保留清单。
   ⚠️ 图片不由 Next 构建产出（`make images` 直接传 OSS），只看 `out/` 会把整站配图当垃圾删掉。
5. **`trailingSlash: true` 不能关。** OSS 静态托管靠目录 index，关了会导致 /posts 404。
6. **bio 数据在 `src/content/bio.ts` 里手写**，不要重新引入数据库或后台。

## 部署（细节见 docs/deploy.md）

```
OSS    oss://renhanquan-site   (cn-hangzhou, public-read, 静态网站托管 index.html/404.html)
CDN    www.renhanquan.com      CNAME -> www.renhanquan.com.w.kunlunaq.com
DNS    阿里云云解析 ns1/ns2.alidns.com
TLS    Let's Encrypt 通配符 *.renhanquan.com，acme.sh 管理，自动续期
HTTP/2 已开启（https_option 的 http2 参数）
```

CDN 缓存规则（控制台优先级高于源站头，两处别配冲突）：

| 路径 | TTL |
| --- | --- |
| `/_next/static/` | 31536000 |
| `jpg,jpeg,png,webp,gif,svg,ico,mp3,woff,woff2,glb,gltf,bin,ktx2` | 31536000 |
| `/`（兜底，含 HTML/TXT/XML） | 0（不缓存） |

## 密钥放在哪

| 凭证 | 位置 | 用途 |
| --- | --- | --- |
| `NOTION_API_KEY` | `.env.local`（gitignore） | make sync |
| 阿里云 AK | `~/.ossutilconfig`、`~/.aliyun/config.json` | ossutil / aliyun CLI |
| TLS 证书与私钥 | `~/certs/renhanquan/` | acme.sh 续期后自动上传 |
| Cloudflare（已弃用） | 不再使用，DNS 已迁到阿里云 |

**永远不要把密钥写进仓库或提交历史。**

## 已知的坑

- **阿里云的「用户 / 角色 / 策略」是三层，授权不通用。** 挂到用户 `blogs_manager` 上的策略，对以**角色**身份运行的服务无效；反过来也一样。排查 403 时先确认报错里的 `AuthPrincipalDisplayName` 是哪个身份（形如 `home-server:vm-ram-v1-...` 就是角色）。这一点上我们为 PassRole、OOS、KMS 反复折腾过很多轮。
- **RAM 策略里的资源 ARN 光看文档不够，要实测。** `ram:PassRole` 写成 `acs:ram::<uid>:role/<name>` 会被拒，改成 `*` 才通；KMS 的 `secret/...` ARN 在控制台里会被判成"无匹配操作"。遇到这种先简化再逐步收窄，别一开始追精确 ARN。

- OSS 默认域名访问 HTML 会强制下载，所以不能直接用 OSS 域名预览站点。
- bucket 必须是 public-read：CDN 的「私有 Bucket 回源」需要在控制台做一次一键授权，
  API 无法完成；`BlockPublicAccess` 会禁止设置公共 ACL。
- `/posts` 不带斜杠时靠 OSS 的 `SupportSubDir` 302 到 `/posts/`，改 bucket 网站配置时别丢这个字段。
- 文章里可能残留指向旧域名的死链图片，`make images` 会报 `fetch failed`，属正常，需在 Notion 里换图。
- 中文标题如果没有填 slug，会被 slugify 成空串再回退成 page id；中文分类同理。

## 3D 页面（/home）

**同步边界：只同步「模型 + 灯具配置」，页面本身归本仓库所有。**

- `make sync-yard`（`scripts/sync-yard.mjs`）是唯一入口，它做四件事：
  1. 从 `../yabai_home/web/preview.html` 解析 `extraLights` 与开关文案，生成 `public/yard/lights.json`
  2. 对 glb 取 sha256 前 8 位，上传成 **`models/yard-web.<hash>.glb`**（配 `immutable` 一年缓存）
  3. 上传精简后的 `report.json`（只保留 glb 统计，避免泄露本机路径）
  4. 把 `model.url` / `model.report` 写进 `lights.json`，并在 `public/models/` 建一个同名软链，本地 dev 也能用同一个 URL
- **不要**从 yabai_home 复制 `preview.html`：面板布局、视角、日照逻辑都以本仓库为准。
- 灯具增删只改 Blender 侧对象名并重新导出，再跑 `make sync-yard`；`lights.json` 变了，开关按钮会自动增删。
- 房屋外的起伏草地、松林、石阶步道、自然溪流与连续山体由 `src/components/yard/yard-environment.ts` 本地生成，独立于 Blender 同步；默认「园景」视角展示完整房屋与环境，「山水」视角可查看河道与山峦；灯光按钮平铺展示，胶囊右侧 ↗ 按钮可直达灯具视角；**宽度 <700px 时灯光区改为换行排列**，不做横向滚动。
- 日照由 `yard-solar.ts` 按房屋坐标 108.09°E / 34.18°N 与当前真实时间计算，每 10 秒更新（北京时间 UTC+8）。面板按**宽度**（`min-width: 700px`）显示，与设备类型无关；宽屏为左上常驻面板，窄屏为底部面板，展开时同样能看到时间控件。可手动调日期/时间并通过「跟随实时」恢复。天空、雾与环境光随昼夜变化。
- 左侧面板可整体收起（`data-open`）：收起时高度用 `grid-template-rows: 1fr → 0fr` 过渡、内容淡出上移、宽度收到 132px，只留一个胶囊。**自动旋转在面板的「视图」区**（`#rotate`），线框功能已移除，右上角不再有工具胶囊。
- 溪流水面由 `yard-river.ts` 着色器按河道弧长生成流纹（`uv.y` 是**世界米数**，不是 0..1，频率按米给），白色浪花是沿流向拉长的丝状噪声而不是正弦横纹。山间源头由 `yard-waterfall.ts` 生成瀑布：水幕**逐顶点贴合崖面**（独立曲线会埋进岩体），落水点是卡通水花（圆球气泡 + 抛物线水珠 + 泡沫池 + 扩散环），可用「瀑布」视角查看；画面不可见、室内预设或减少动态效果开启时不更新。动物已移除。灯具关闭时仅将强度归零，保持灯光布局稳定；加载阶段异步预编译并预热静态阴影，太阳变化时只刷新太阳阴影。
- 全站 `viewport-fit: cover`，Header 与 `/home` 按 safe-area inset 布局；Safari theme-color 随页面主题与天空更新。只在 3D 查看器禁用触控文字选取/长按菜单，日期时间输入仍可编辑。
- 查看器是 React 组件 `src/components/yard/YardViewer.tsx` + `yard-scene.ts`，three.js 从 npm 引入，跟随应用一起打包（按需 dynamic import）。
- ⚠️ **`yard-scene.ts` 第一行是 `@ts-nocheck`**（当初从 yabai_home 的 preview.html 搬进来时加的，因为 imperative 的 three.js 代码补类型收益低）。**类型检查对这个文件完全失效**，`tsc` 通过不代表它是对的：模块级初始化顺序错误（比如往一个后面才声明的 `const` 里写入）属于运行时 TDZ，TypeScript 看不见。
  改这个文件之后必须**用浏览器跑一遍**：起静态服务打开 `/home/`，确认加载遮罩消失、没有 JS 异常。不要再靠「构建通过」判断。
- 想正经加类型，方向不是逐行补 `any`（实测 195 个错误里 159 个是隐式 any 噪音），而是把纯逻辑抽到单独的模块，渲染部分继续不检查。
- `public/yard/` 只保留运行时资产：`lights.json`（灯具配置）和 `draco/`（解码器 wasm/js）。
- 不要再引入 importmap 或 vendor 版 three：场景已走 npm 依赖，旧 `public/yard/index.html` 已删除。
- 模型在 OSS：`oss://renhanquan-site/models/yard-web.<hash>.glb`。页面**不硬编码文件名**，从 `lights.json` 的 `model.url` 读（同源，避免 CORS）。
- 换模型只需重新导出后跑 `make sync-yard`：文件名里的 hash 变了，URL 随之变化，CDN 和浏览器都能安全地按 immutable 缓存，**不需要刷 CDN**。
- `yard/lights.json` 必须 `no-cache`（它指向当前 hash），`deploy.sh` 已单独用 `NO_CACHE` 上传并排除在 immutable 批次外。

## 不要做的事

- 不要恢复 Supabase、NextAuth、admin 后台、Lexical/Notion 编辑器。
- 不要把 `content/` 加进 .gitignore（构建需要它，且它是可复现性的一部分）。
- 不要在 `src/` 里用 `fs` 以外的 Node API（构建期 Node 环境可用，但别在客户端组件里用）。
- 不要为了「省事」把图片直接引用 Notion 原始 URL。

## 待办 / 已知缺口

- 没有 CI：发布靠本地 `make publish`。计划加 GitHub Actions。
- 根域 renhanquan.com 仍指向 Vercel 做 307 跳转，可改为直接指向 CDN。
- ROS 模板未落地：分层方案见 [docs/infra.md](docs/infra.md)，模板还没写。
- 控制面缺：CoolKit 之外的 provider、管理界面、告警、前端登录页。
- `rose-eden` 一篇文章中有一张图指向已失效的旧域名，需在 Notion 侧替换。
- 3D 场景未与真实尺寸对齐：房屋、河道、山体的比例来自程序生成的环境，和实测尺寸有偏差，导致阴影长短/朝向细节与实景对不上。计划按真实测量校准 `yard-environment.ts` 的尺度，并把 `YARD_SITE` 保留为唯一坐标来源。

## 文档索引

- `README.md` — 项目简介与快速开始
- [docs/auth.md](docs/auth.md) — 鉴权、权限模型、设备抽象、审计
- [docs/infra.md](docs/infra.md) — 基础设施与 ROS 分层
- `docs/architecture.md` — 渲染模式、数据流、缓存策略
- `docs/deploy.md` — 部署与运维 runbook
- `docs/content-pipeline.md` — 内容与图片管线
- `content/README.md` — 快照格式契约