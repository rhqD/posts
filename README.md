# renhanquan.com

个人主页 + 博客。内容在 Notion 写，构建期拉取，输出纯静态文件，托管在阿里云 OSS + CDN。

- 线上：https://www.renhanquan.com
- 技术栈：Next.js 16（静态导出）、Tailwind v4、framer-motion、Go（内容同步）、sharp（图片处理）

## 特点

- **零服务端**：没有 Node 进程、没有数据库、没有后台。构建产物是一堆 HTML/JS/CSS。
- **HTML 不缓存**：每次请求回源 OSS（同地域 2～5ms），保证发布即生效。
- **资源永久缓存**：带 hash 的 JS/CSS 与图片 `max-age=31536000, immutable`。
- **图片构建期处理**：Notion 原图（几十 MB）压缩成 1600px WebP，体积降一个数量级。

## 快速开始

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

博客内容来自 `content/` 快照，仓库里已经有一份，克隆下来就能跑。
要更新内容，需要 `.env.local` 里的 `NOTION_API_KEY`：

```bash
echo "NOTION_API_KEY=ntn_xxx" >> .env.local
make sync           # Notion -> content/
make images         # 图片压缩并上传 OSS
make publish        # 上面两步 + 构建 + 部署
```

## 目录

```
src/               前端（Next.js App Router）
apps/api/          Go 写的 Notion 同步工具
content/           构建期内容快照（提交进 git）
scripts/           图片管线、部署脚本
docs/              架构与运维文档
```

## 文档

- [AGENTS.md](AGENTS.md) —— 接手前必读，含硬性约束与已知坑
- [docs/architecture.md](docs/architecture.md) —— 渲染模式、数据流、缓存策略
- [docs/deploy.md](docs/deploy.md) —— 部署与运维 runbook
- [docs/content-pipeline.md](docs/content-pipeline.md) —— Notion 同步与图片管线

## 许可

内容版权归作者所有，代码可参考。
