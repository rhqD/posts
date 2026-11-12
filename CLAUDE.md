# CLAUDE.md

这个仓库的操作手册在 **[AGENTS.md](AGENTS.md)**，先读它。

下面只重复三条最容易踩的约束：

1. **没有服务端。** `next.config.ts` 是 `output: "export"`。不要加 Route Handler、
   Server Action、依赖 cookie/header 的动态页面——构建会直接失败。
2. **图片必须是本地路径。** Notion 的 S3 签名 URL 一小时就过期，HTML 里只能出现
   `/images/<hash>.webp`，由 `make images` 生成。
3. **HTML 不缓存、资源长缓存。** 部署用 `make deploy`，它已经处理了上传顺序和 Cache-Control；
   不要手动 `ossutil cp -r out/ oss://...` 覆盖全套。

常用命令：`make sync` / `make images` / `make deploy` / `make publish` / `pnpm dev`。

更多：

- [docs/architecture.md](docs/architecture.md)
- [docs/deploy.md](docs/deploy.md)
- [docs/content-pipeline.md](docs/content-pipeline.md)
