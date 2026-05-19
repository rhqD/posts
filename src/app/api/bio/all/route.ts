import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServiceClient();

  const [profileRes, skillsRes, experiencesRes, postsRes] = await Promise.all([
    supabase.from("profiles").select("*").limit(1).single(),
    supabase.from("skills").select("*").order("sort_order", { ascending: true }),
    supabase.from("experiences").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("posts")
      .select("*, category:categories(*), post_tags(tag:tags(*))")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(4),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const featuredPosts = (postsRes.data ?? []).map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  return NextResponse.json({
    profile: profileRes.data ?? null,
    skills: skillsRes.data ?? [],
    experiences: experiencesRes.data ?? [],
    featuredPosts,
  });
}
