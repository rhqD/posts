# renhanquan.com

Personal website & blog. Built with Next.js 16, Tailwind CSS v4, Notion API, and Supabase.

## Quick Start

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
vercel --prod   # deploy
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Styling**: Tailwind CSS v4, framer-motion
- **Blog CMS**: Notion API (NotionNext-compatible schema)
- **Bio Data**: Supabase (PostgreSQL + Storage)
- **Auth**: NextAuth v5 (GitHub OAuth)
- **Hosting**: Vercel

## Project Structure

```
src/
├── app/
│   ├── (public)/           # Public-facing pages
│   │   ├── page.tsx        # Bio homepage
│   │   ├── posts/          # Blog archive & detail
│   │   ├── categories/     # Category filter
│   │   └── tags/           # Tag filter
│   ├── (admin)/admin/bio/  # Admin panel (profile/skills/experiences)
│   ├── api/bio/            # Bio CRUD endpoints
│   └── api/notion-image/   # Notion image proxy
├── components/
│   ├── home/               # Homepage sections (Hero, About, Skills, Timeline, Posts, Contact)
│   ├── layout/             # Header, Footer, ThemeToggle, BGMPlayer
│   └── post/               # NotionRenderer, PostCard, PostContent
└── lib/
    ├── notion.ts           # Notion API client
    ├── supabase/           # Supabase server & type definitions
    └── animations.ts       # framer-motion shared variants
```

## Notion Blog Setup

Blog posts live in a Notion database with these properties:
- `title` — post title
- `slug` — URL slug (for Chinese titles, fill this manually)
- `summary` — excerpt
- `date` — published date
- `status` — "Published" or "Draft"
- `type` — "Post"
- `category` — select
- `tags` — multi-select
- `icon` — cover image URL

To update blog content: edit in Notion, then run `vercel --prod` to redeploy.

## Environment Variables

See `.env.local` (not committed). Required:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NOTION_API_KEY
AUTH_SECRET
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
NEXTAUTH_URL
NEXT_PUBLIC_SITE_URL
```
