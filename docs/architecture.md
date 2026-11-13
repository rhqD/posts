# 架构

## 一句话

构建时把 Notion 的内容拉成 JSON，渲染成静态 HTML，传到 OSS，由 CDN 分发。
线上不存在任何服务端进程。

## 数据流

```
Notion DB ──(make sync, Go)──> content/posts.index.json
                              content/posts/<slug>.json   (块树)
                                    │
                       (make images, sharp)
                                     │  下载 → 1600px WebP → OSS → 改写为 /images/<hash>.webp
                                     ▼
                              content/ (已就绪)
                                     │
                            (pnpm build, next export)
                                     ▼
                                   out/
                                     │
                          (scripts/deploy.sh, ossutil)
                                     ▼
                          OSS bucket renhanquan-site
                                     │  源站
                                     ▼
                          阿里云 CDN → 用户
```

## 渲染模式

全部是 `output: "export"` 的静态导出，没有 ISR、没有 SSR、没有 Route Handler。

| 路由 | 产出 |
| --- | --- |
| `/` | `out/index.html`（bio 直接内联在 HTML 里） |
| `/posts/` | `out/posts/index.html` |
| `/posts/<slug>/` | `out/posts/<slug>/index.html` |
| `/categories/<slug>/` | 构建时由 `generateStaticParams` 枚举 |
| `/tags/<slug>/` | 同上 |
| `/home/` | 3D 查看器（React 组件 + three.js，见下节） |
| `/garden/`、`/privacy/` | 静态页 |
| `/sitemap.xml` | 构建时生成 |

`trailingSlash: true` 让每个路由输出成目录 + index.html，
这样 OSS 静态网站托管才能正确处理 `/posts/`。

## 3D 查看器（/home）

- 页面在 `(bare)` 路由组：有站点 Header，没有 Footer，画布从顶栏下方开始。
- 场景是 `src/components/yard/yard-scene.ts`（命令式 three.js），由 `YardViewer.tsx` 在
  `useEffect` 里用 `import('./yard-scene')` 动态加载，three.js 因此不进主 bundle。
- 灯具配置来自 `public/yard/lights.json`（由 `make sync-yard` 从 yabai_home 解析生成），
  开关按钮由场景按这份 JSON 注入，增删灯具不需要改页面代码。
- 模型在 OSS `models/yard-web.glb`，页面用相对路径 `/models/yard-web.glb` 加载；
  draco 解码器在 `public/yard/draco/`。
- 光照是固定的下午角度（不再做日照模拟），切主题不影响画布。

## 数据来源

| 数据 | 时机 | 位置 |
| --- | --- | --- |
| 文章列表 / 正文 | 构建时 | `content/` 快照 |
| 图片 | 构建时 | OSS `images/`，HTML 里是 `/images/<hash>.webp` |
| 个人资料、技能、经历 | 手写 | `src/content/bio.ts` |

`src/lib/notion.ts` 的优先级：先读 `content/posts.index.json`；
没有快照且存在 `NOTION_API_KEY` 时才回退到 Notion API；两者都没有则返回空列表并打警告
（这样在没有密钥的环境里也能构建）。

## 缓存策略

部署脚本按类型分两批上传，Cache-Control 不同：

| 对象 | Cache-Control | 理由 |
| --- | --- | --- |
| `_next/static/**` | `public,max-age=31536000,immutable` | 文件名带 hash，内容不会变 |
| 图片 / 字体 / 音频 | 同上 | 内容寻址（hash 命名） |
| `**/*.html` | `no-cache` | 内容更新必须立刻可见 |
| `**/*.txt`（RSC payload） | `no-cache` | 同上，客户端导航依赖它 |
| `sitemap.xml` | `no-cache` | 同上 |

CDN 控制台也配了规则，优先级高于源站响应头，两处必须一致：

1. `/_next/static/` → 31536000
2. 文件后缀 `jpg,jpeg,png,webp,gif,svg,ico,mp3,woff,woff2` → 31536000
3. 兜底 `/` → 0（不缓存）

> 默认规则原本是 `/` 缓存 30 天，会把 HTML 一起缓存，已改掉。改 CDN 配置时务必保持这条。

## 为什么是这个架构

- **静态导出**：没有服务器要维护，成本接近零，CDN 边缘直接出内容。
- **HTML 不缓存**：换来了“发布即生效”，代价是同地域回源 OSS 的几毫秒。
- **图片构建期处理**：Notion 原图动辄 10MB+，且签名 1 小时过期，必须在构建时落地。
- **bio 手写**：一年改不了几次，不值得为它维护数据库和后台。