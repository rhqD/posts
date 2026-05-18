import { createServiceClient } from "@/lib/supabase/server";
import type { Profile, Skill, Experience, Post, HomepageData } from "@/lib/supabase/types";

export async function getHomepageData(): Promise<HomepageData> {
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

  const profile: Profile | null = profileRes.data ?? null;

  const skills: Skill[] = (skillsRes.data ?? []) as Skill[];

  const experiences: Experience[] = (experiencesRes.data ?? []) as Experience[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const featuredPosts: Post[] = (postsRes.data ?? []).map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  return { profile, skills, experiences, featuredPosts };
}
