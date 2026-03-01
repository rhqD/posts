import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  cover_url: z.string().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published"]).optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("posts")
    .select("*, category:categories(*), post_tags(tag:tags(*))")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({
    post: { ...data, tags: data.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [] },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tag_ids, ...postData } = parsed.data;
  const supabase = createServiceClient();

  const updatePayload: Record<string, unknown> = { ...postData, updated_at: new Date().toISOString() };
  if (postData.status === "published") {
    const { data: existing } = await supabase.from("posts").select("published_at").eq("id", id).single();
    if (!existing?.published_at) updatePayload.published_at = new Date().toISOString();
  }

  const { data: post, error } = await supabase
    .from("posts")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (tag_ids !== undefined) {
    await supabase.from("post_tags").delete().eq("post_id", id);
    if (tag_ids.length) {
      await supabase.from("post_tags").insert(tag_ids.map((tag_id) => ({ post_id: id, tag_id })));
    }
  }

  return NextResponse.json({ post });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
