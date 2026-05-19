import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import type { Post, Category, Tag } from "@/lib/supabase/types";

const NOTION_DATABASE_ID = "21fc53874c4e8071b064ff3db3afdf6c";
const NOTION_API_KEY = process.env.NOTION_API_KEY!;

function getClient() {
  return new Client({ auth: NOTION_API_KEY });
}

function getN2M() {
  return new NotionToMarkdown({ notionClient: getClient() });
}

// Use REST API directly since SDK v5 dropped databases.query
async function notionApi(path: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToPost(page: any): Post {
  const props = page.properties;
  const title = props.title?.title?.[0]?.plain_text || "Untitled";
  const slug =
    props.slug?.rich_text?.[0]?.plain_text ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const excerpt = props.summary?.rich_text?.[0]?.plain_text || "";
  const publishedDate = props.date?.date?.start || page.created_time;
  const status = props.status?.select?.name === "Published" ? "published" : "draft";
  const coverUrl = props.icon?.rich_text?.[0]?.plain_text || page.cover?.external?.url || null;
  const categoryName = props.category?.select?.name || null;
  const tagNames: string[] = props.tags?.multi_select?.map?.((t: { name: string }) => t.name) || [];

  return {
    id: page.id,
    title,
    slug,
    content: null,
    excerpt,
    cover_url: coverUrl,
    category_id: null,
    status: status as "draft" | "published",
    published_at: publishedDate,
    created_at: page.created_time,
    updated_at: page.last_edited_time,
    category: categoryName ? { id: categoryName, name: categoryName, slug: categoryName.toLowerCase().replace(/\s+/g, "-"), created_at: "" } : undefined,
    tags: tagNames.map((t) => ({ id: t, name: t, slug: t.toLowerCase().replace(/\s+/g, "-"), created_at: "" })),
  };
}

export async function getPublishedPosts(): Promise<Post[]> {
  const data = await notionApi(`databases/${NOTION_DATABASE_ID}/query`, {
    filter: {
      and: [
        { property: "status", select: { equals: "Published" } },
        { property: "type", select: { equals: "Post" } },
      ],
    },
    sorts: [{ property: "date", direction: "descending" }],
  });

  return (data.results || []).map(mapToPost);
}

export async function getPostContent(pageId: string): Promise<string> {
  const n2m = getN2M();
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  return n2m.toMarkdownString(mdBlocks).parent;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const posts = await getPublishedPosts();
  return posts.find((p) => p.slug === slug) || null;
}

export async function getPostsByCategory(categorySlug: string): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.category?.slug === categorySlug);
}

export async function getPostsByTag(tagSlug: string): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.filter((p) => p.tags?.some((t) => t.slug === tagSlug));
}

export async function getFeaturedPosts(limit = 4): Promise<Post[]> {
  const posts = await getPublishedPosts();
  return posts.slice(0, limit);
}

export async function getAllCategories(): Promise<Category[]> {
  const posts = await getPublishedPosts();
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const p of posts) {
    if (p.category && !seen.has(p.category.slug)) {
      seen.add(p.category.slug);
      categories.push(p.category);
    }
  }
  return categories;
}

export async function getAllTags(): Promise<Tag[]> {
  const posts = await getPublishedPosts();
  const seen = new Set<string>();
  const tags: Tag[] = [];
  for (const p of posts) {
    for (const t of p.tags || []) {
      if (!seen.has(t.slug)) {
        seen.add(t.slug);
        tags.push(t);
      }
    }
  }
  return tags;
}
