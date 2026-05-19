import { NextRequest, NextResponse } from "next/server";
import { getPublishedPosts } from "@/lib/notion";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");

  let posts = await getPublishedPosts();

  if (category) posts = posts.filter((p) => p.category?.slug === category);
  if (tag) posts = posts.filter((p) => p.tags?.some((t) => t.slug === tag));

  const total = posts.length;
  const offset = (page - 1) * limit;
  posts = posts.slice(offset, offset + limit);

  return NextResponse.json({ posts, total, page, limit });
}
