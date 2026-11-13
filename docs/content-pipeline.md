# 内容与图片管线

## 写一篇文章

1. 在 Notion 数据库里新建一行，填 `title` / `slug` / `summary` / `date` / `status` / `type` / `category` / `tags`。
2. 把 `status` 设为 `Published`、`type` 设为 `Post`。
3. 本地执行 `make publish`。

`slug` 建议手动填英文，留空会走自动 slugify；中文标题 slugify 后会为空，回退成 32 位 page id，URL 很难看。

## sync：Notion → content/

`apps/api/cmd/sync`，Go 写的，只用标准库。

```bash
make sync          # 增量：manifest 里 last_edited 没变的文章直接跳过
make sync-force    # 全量重拉
```

产出：

```
content/posts.index.json      # Post[]，按 published_at 倒序，驱动列表/首页/sitemap
content/posts/<slug>.json     # { post, blocks }
content/manifest.json         # page id -> { slug, last_edited }，用于增量判断
```

处理细节：

- 分页拉全量（Notion 单次最多 100 条）
- 块树递归拉取，`p-limit` 等价物：并发 3，遇 429 按 Retry-After 退避
- 站内链接改写：Notion 的 page id 链接 → `/posts/<slug>/`
- 失败即退出，不会写半份快照

## images：图片落地

`scripts/images.mjs`，用 sharp。

```bash
make images
node scripts/images.mjs --probe https://example.com/a.jpg   # 单张测试
```

做什么：

1. 扫 `content/posts/*.json` 里所有 `type: "image"` 且 URL 是 http 的块，以及每篇文章的 `cover_url`（Notion 内置封面 `app.notion.com` 跳过）
2. 并发 4 下载（25s 超时），失败只警告不中断
3. `sharp`：按 EXIF 旋转 → 宽度 ≤1600 → WebP q80
4. 内容 hash 命名 → `.images-tmp/<hash>.webp` → 一次 `ossutil cp -r` 上传
5. 把块和 `cover_url` 改写成 `/images/<hash>.webp`，并同步 `posts.index.json`

特性：

- **内容寻址**：同一张图在几篇文章里出现只存一份
- **幂等**：`.images-cache/` 记录 URL → 结果，重复运行不重复下载
- **失败可重试**：成功的已缓存，再跑一次只重试失败的

实测效果：25 张 72.2MB → 3.3MB（约 22 倍）。

## 数据契约

见 `content/README.md`。关键约束：

- `posts.index.json` 按 `published_at` 倒序
- 文件名必须等于 `post.slug`
- `blocks` 保持 Notion 原始块结构（渲染器依赖），内部链接已改写

## 3D 资产（另一条管线）

院子模型与灯具配置不来自 Notion，走 `make sync-yard`：

- 解析 `../yabai_home/web/preview.html` 的灯具定义 → `public/yard/lights.json`
- 上传 `exports/yard-web.glb` 与精简 report → OSS `models/`

细节见 [AGENTS.md](../AGENTS.md)。

## 常见问题

**图片 fetch failed**
源地址已失效（比如指向已删除的旧 bucket）。这类图在 Notion 里换一张，再 `make publish`。

**中文分类/标签的 URL 是乱码**
当前 slug 由名称派生，中文会保留在 URL 里（百分号编码）。要干净 URL，需要在 Notion 里给分类单独维护英文名，或在 sync 里加拼音/短 hash 映射。

**文章数不对**
检查 Notion 里的 `status` 是否为 `Published`、`type` 是否为 `Post`——两个条件同时满足才会被拉取。