import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createSlug } from "@/lib/utils";

const postSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  cover_url: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published"]).default("draft"),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "10");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("posts")
    .select("*, category:categories(*), post_tags(tag:tags(*))", { count: "exact" })
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  else query = query.eq("status", "published");

  if (category) query = query.eq("categories.slug", category);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts = data?.map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  return NextResponse.json({ posts, total: count, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tag_ids, ...postData } = parsed.data;
  const slug = createSlug(postData.title);
  const supabase = createServiceClient();

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      ...postData,
      slug,
      published_at: postData.status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (tag_ids?.length) {
    await supabase.from("post_tags").insert(
      tag_ids.map((tag_id) => ({ post_id: post.id, tag_id }))
    );
  }

  return NextResponse.json({ post }, { status: 201 });
}
