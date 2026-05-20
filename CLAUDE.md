# Claude Code Instructions for posts (renhanquan.com)

## Project Overview
Personal website with bio homepage + blog. Next.js 16, Tailwind v4, Supabase (bio data), Notion API (blog content), Vercel hosting.

- **URL**: https://www.renhanquan.com
- **Package manager**: pnpm
- **Dev**: `pnpm dev`, **Build**: `pnpm build`
- **Deploy**: `vercel --prod` (manual redeploy after Notion updates)

## Architecture

### Route Groups
- `(public)/page.tsx` — Bio homepage with dark theme, framer-motion animations, Canvas particles
- `(public)/posts/page.tsx` — Blog archive (Notion data, ISR every hour)
- `(public)/posts/[slug]/page.tsx` — Individual post (SSG from Notion, custom Notion block renderer)
- `(public)/categories/[slug]/page.tsx`, `(public)/tags/[slug]/page.tsx` — Category/tag filters
- `(admin)/admin/bio/page.tsx` — Admin panel for profile, skills, experiences (Supabase)

### Data Sources
- **Blog posts**: Notion API (database `21fc53874c4e8071b064ff3db3afdf6c`)
  - Protocol: NotionNext-compatible schema (title, slug, summary, date, status, category, tags, icon)
  - Content: Block tree fetched recursively, rendered by `NotionRenderer.tsx`
  - Cache: Images proxied through `/api/notion-image`, stored in Supabase Storage
- **Bio data** (profile, skills, experiences): Supabase `profiles`, `skills`, `experiences` tables
  - Public read, authenticated full access via service role key

### Key Components
- `src/lib/notion.ts` — Notion API client, post fetching, slug generation, link rewriting
- `src/components/post/NotionRenderer.tsx` — Custom block renderer (headings, code, mermaid, KaTeX, images, callouts, toggles, tables, column lists)
- `src/components/home/` — HeroSection, AboutSection, SkillsSection, TimelineSection, PostsSection, ContactSection
- `src/components/layout/` — Header (fixed, glass morphism), Footer, PageWrapper, ThemeToggle, BGMPlayer
- `src/hooks/useTypewriter.ts` — Typewriter effect hook

### Animation & Theme
- All homepage sections use `whileInView` + `viewport={{ once: true }}` (NOT `useInView` + conditional `animate`)
- Dark/light mode: `.dark` class on `<html>`, CSS variables overridden in globals.css
- Homepage is dark-themed, blog pages are light (white bg, dark text) via PageWrapper
- Garden illustration: AI-generated via Volcano Engine Seedream, day/night versions for theme toggle

### Dependencies
- **framer-motion** — animations
- **react-notion-x, notion-client** — installed but currently NOT used (replaced by custom renderer)
- **@notionhq/client** — Notion SDK (v5, databases.query removed → use REST API directly)
- **notion-to-md** — installed but NOT used in the current pipeline
- **marked** — installed but NOT used (NotionRenderer handles blocks directly)
- **prismjs** — code syntax highlighting
- **katex** — math rendering
- **mermaid** — diagram rendering
- **next-auth** — GitHub OAuth

## Important Conventions
- PostCard uses `var(--color-*)` CSS variables → ensure `.dark` class is present on homepage
- Blog pages override CSS vars in PageWrapper to light mode
- Never use `useInView` + conditional `animate={isInView ? ... : {}}` — always use `whileInView`
- Notion internal links are rewritten from `/pageid` format to `/posts/{slug}`
- Image proxy: `/api/notion-image?url=...` with Supabase Storage fallback cache
- Chinese-titled posts without custom slug use full page ID as slug

## Architecture Decisions (why things are the way they are)

### Blog data source: Notion API, not Supabase
**Decision**: All blog content (posts, categories, tags, page content) comes from Notion via REST API.
**Why**: User writes in Notion, uses NotionNext-compatible schema. Better writing UX than Supabase. Supabase retains only structured bio data (profiles, skills, experiences).

### Custom NotionRenderer, not react-notion-x or notion-to-md
**Decision**: Built `src/components/post/NotionRenderer.tsx` from scratch using Notion REST API blocks.
**Why**: `notion-client` v7 was incompatible with the current Notion API (returned undefined block types). `notion-to-md` lost formatting (mermaid, callouts, toggles, columns). Custom renderer gives full control over KaTeX, Prism, mermaid integration.

### Image proxy + Supabase Storage cache
**Decision**: Notion S3 URLs are proxied through `/api/notion-image`. On first fetch, the image is cached in Supabase Storage. Subsequent requests hit Supabase first, zero Notion API calls.
**Why**: Notion S3 pre-signed URLs expire after 1 hour. SSG bakes expired URLs into HTML. The proxy fetches fresh URLs via Notion block API on expiry. Supabase cache eliminates repeat Notion API hits for the same image. CDN (immutable, 1 year) makes most requests never touch the origin.

### Direct REST API instead of @notionhq/client SDK
**Decision**: Use `fetch()` to `api.notion.com` directly.
**Why**: SDK v5 removed `databases.query`. REST API is stable and our needs are simple.

### Force-static homepage + client-side data fetch
**Decision**: Homepage is `export const dynamic = "force-static"`. Bio data fetched client-side via `/api/bio/all`.
**Why**: Supabase is in Tokyo, Vercel builds in Washington DC. Blocking 2s+ Supabase queries at build time made page loads 3s+. Static HTML loads instantly, data fills in asynchronously.

### whileInView instead of useInView
**Decision**: All homepage sections use `whileInView={{ opacity: 1 }} viewport={{ once: true }}` pattern.
**Why**: `useInView` + `animate={isInView ? ... : {}}` had a race condition where `isInView` stayed false, keeping opacity at 0 forever. `whileInView` is framer-motion's built-in solution without the race.

### Dark homepage, light blog pages
**Decision**: Homepage is dark-themed (hardcoded backgrounds), blog pages are light (white bg, dark text) via PageWrapper CSS variable overrides.
**Why**: Dark = visual impact for a bio page. Light = better readability for long-form text. Toggle only controls the Hero garden image (day/night), not the entire page theme.

### `var(--color-*)` CSS variables for PostCard
**Decision**: PostCard uses CSS custom properties for all colors. Dark values set via `.dark` class on homepage wrapper. Blog pages override to light values in PageWrapper.
**Why**: PostCard is shared between dark homepage and light blog pages. Variables let it adapt without a theme prop.

## Environment Variables (in .env.local, NOT committed)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NOTION_API_KEY` (ntn_...)
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `NEXTAUTH_URL`
- `NEXT_PUBLIC_SITE_URL`
