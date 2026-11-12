import fs from "node:fs";
import path from "node:path";
import type { Post, Category, Tag } from "@/lib/types";

// Blog content is produced at build time by the sync tool (apps/api/cmd/sync) and
// written to content/. If that snapshot exists we never touch the network; the
// Notion API fallback only exists so the repo can still be built without a sync.

const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? "21fc53874c4e8071b064ff3db3afdf6c";
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CONTENT_DIR = path.join(process.cwd(), "content");
const INDEX_FILE = path.join(CONTENT_DIR, "posts.index.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NotionBlock = any;

type LocalPostFile = { post: Post; blocks: NotionBlock[] };

let indexCache: Post[] | null | undefined;

function readLocalIndex(): Post[] | null {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8")) as Post[];
  } catch {
    return null;
  }
}

function readLocalPost(slug: string): LocalPostFile | null {
  try {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, "posts", `${slug}.json`), "utf8");
    return JSON.parse(raw) as LocalPostFile;
  } catch {
    return null;
  }
}

function localIndex(): Post[] | null {
  if (indexCache === undefined) indexCache = readLocalIndex();
  return indexCache;
}

async function notionApi(pathname: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.notion.com/v1/${pathname}`, {
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
  const title = props.title?.title?.map?.((t: { plain_text: string }) => t.plain_text).join("") || "Untitled";
  const slug =
    props.slug?.rich_text?.[0]?.plain_text ||
    (() => {
      const auto = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return auto || page.id.replace(/-/g, "");
    })();
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
    category: categoryName
      ? { id: categoryName, name: categoryName, slug: categoryName.toLowerCase().replace(/\s+/g, "-"), created_at: "" }
      : undefined,
    tags: tagNames.map((t) => ({ id: t, name: t, slug: t.toLowerCase().replace(/\s+/g, "-"), created_at: "" })),
  };
}

export async function getPublishedPosts(): Promise<Post[]> {
  const local = localIndex();
  if (local) return local;

  if (!NOTION_API_KEY) {
    console.warn(
      "[notion] content/posts.index.json is missing and NOTION_API_KEY is not set — building with an empty post list",
    );
    return [];
  }

  // Paginate: the Notion API returns at most 100 results per request.
  const results: unknown[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionApi(`databases/${NOTION_DATABASE_ID}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
      filter: {
        and: [
          { property: "status", select: { equals: "Published" } },
          { property: "type", select: { equals: "Post" } },
        ],
      },
      sorts: [{ property: "date", direction: "descending" }],
    });
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const posts = results.map(mapToPost);
  indexCache = posts;
  return posts;
}

export async function getPostBlocks(post: Post): Promise<NotionBlock[]> {
  const local = readLocalPost(post.slug);
  if (local) return local.blocks;

  if (!NOTION_API_KEY) return [];

  const posts = await getPublishedPosts();
  const idToSlug: Record<string, string> = {};
  for (const p of posts) {
    idToSlug[p.id.replace(/-/g, "")] = p.slug;
  }

  // Rewrite Notion internal links to /posts/ links
  function rewriteLinks(block: NotionBlock) {
    const richTexts = block[block.type]?.rich_text;
    if (richTexts) {
      for (const t of richTexts) {
        const url = t.text?.link?.url || t.href;
        if (!url) continue;
        const match = url.match(/([0-9a-f]{32})/i);
        if (match) {
          const targetSlug = idToSlug[match[1]];
          if (targetSlug) {
            if (t.text?.link) t.text.link.url = `/posts/${targetSlug}`;
            else t.href = `/posts/${targetSlug}`;
          }
        }
      }
    }
    if (block.children) {
      for (const child of block.children) rewriteLinks(child);
    }
  }

  async function fetchChildren(blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const data = await notionApi(`blocks/${blockId}/children?${params.toString()}`);
      blocks.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    for (const block of blocks) {
      block.children = [];
      if (block.has_children) {
        block.children = await fetchChildren(block.id);
      }
      rewriteLinks(block);
    }
    return blocks;
  }

  return fetchChildren(post.id);
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
