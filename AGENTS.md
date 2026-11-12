# AGENTS.md — 接手这个仓库前先读这一页

这个文件是给 AI agent（以及未来的你）看的操作手册。README.md 面向人类访客，
docs/ 下有更细的专题文档。**如果文档和代码冲突，以代码为准，并顺手修文档。**

## 这是什么

个人网站 renhanquan.com：主页 + 博客。
博客内容在 Notion 里写，构建时拉取，产出纯静态 HTML 上传到阿里云 OSS，由 CDN 分发。

- 线上：https://www.renhanquan.com
- 仓库：github.com/rhqD/posts

**没有服务端、没有数据库、没有后台。** 这是最重要的一个事实。

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
| `content/` | 构建期内容快照，**要提交进 git** |
| `scripts/images.mjs` | 图片管线 |
| `scripts/deploy.sh` | 构建产物上传 OSS |
| `docs/` | 架构、部署、内容管线的细节 |

## 常用命令

```bash
pnpm dev          # 本地开发，修改 src/content/bio.ts 或 content/ 会热更新
make sync         # Notion -> content/（需要 NOTION_API_KEY）
make images       # 图片处理 + 上传 OSS
make deploy       # 构建 + 上传 OSS
make publish      # sync + images + deploy
```

`make sync` 会加载 `.env.local`（Makefile 里已处理）。

## 硬性约束（改代码前必须知道）

1. **不能引入任何运行时服务端逻辑。** `next.config.ts` 是 `output: "export"`，
   一旦出现 Route Handler、Server Action、需要请求头/cookie 的动态页面，构建会失败。
   历史上这里有过 `/api/bio/*`、`/api/posts`、`/api/upload`、`/api/auth`，全部删除。
2. **Notion 图片 URL 只有 1 小时有效期。** 任何出现在 HTML 里的图片地址必须是
   `/images/<hash>.webp`，由 `make images` 生成。绝不把 S3 签名 URL 写进内容。
3. **HTML 不能缓存，资源必须长缓存。** `scripts/deploy.sh` 用不同的 Cache-Control 分两次上传，
   顺序是「先资源、后 HTML」，否则会出现新 HTML 指向未上传 JS 的 404 窗口。
4. **不要删除 OSS 上的旧 hash 文件。** 用户浏览器可能还开着旧页面。deploy 脚本从不用 --delete。
5. **`trailingSlash: true` 不能关。** OSS 静态托管靠目录 index，关了会导致 /posts 404。
6. **bio 数据在 `src/content/bio.ts` 里手写**，不要重新引入数据库或后台。

## 部署（细节见 docs/deploy.md）

```
OSS    oss://renhanquan-site   (cn-hangzhou, public-read, 静态网站托管 index.html/404.html)
CDN    www.renhanquan.com      CNAME -> www.renhanquan.com.w.kunlunaq.com
DNS    阿里云云解析 ns1/ns2.alidns.com
TLS    Let's Encrypt 通配符 *.renhanquan.com，acme.sh 管理，自动续期
```

CDN 缓存规则（控制台优先级高于源站头，两处别配冲突）：

| 路径 | TTL |
| --- | --- |
| `/_next/static/` | 31536000 |
| `jpg,jpeg,png,webp,gif,svg,ico,mp3,woff,woff2` | 31536000 |
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

- OSS 默认域名访问 HTML 会强制下载，所以不能直接用 OSS 域名预览站点。
- bucket 必须是 public-read：CDN 的「私有 Bucket 回源」需要在控制台做一次一键授权，
  API 无法完成；`BlockPublicAccess` 会禁止设置公共 ACL。
- `/posts` 不带斜杠时靠 OSS 的 `SupportSubDir` 302 到 `/posts/`，改 bucket 网站配置时别丢这个字段。
- 文章里可能残留指向旧域名的死链图片，`make images` 会报 `fetch failed`，属正常，需在 Notion 里换图。
- 中文标题如果没有填 slug，会被 slugify 成空串再回退成 page id；中文分类同理。

## 不要做的事

- 不要恢复 Supabase、NextAuth、admin 后台、Lexical/Notion 编辑器。
- 不要把 `content/` 加进 .gitignore（构建需要它，且它是可复现性的一部分）。
- 不要在 `src/` 里用 `fs` 以外的 Node API（构建期 Node 环境可用，但别在客户端组件里用）。
- 不要为了「省事」把图片直接引用 Notion 原始 URL。

## 待办 / 已知缺口

- 没有 CI：发布靠本地 `make publish`。计划加 GitHub Actions。
- 根域 renhanquan.com 仍指向 Vercel 做 307 跳转，可改为直接指向 CDN。
- ROS 模板未落地，基础设施目前是手工创建的。
- `rose-eden` 一篇文章中有一张图指向已失效的旧域名，需在 Notion 侧替换。

## 文档索引

- `README.md` — 项目简介与快速开始
- `docs/architecture.md` — 渲染模式、数据流、缓存策略
- `docs/deploy.md` — 部署与运维 runbook
- `docs/content-pipeline.md` — 内容与图片管线
- `content/README.md` — 快照格式契约
