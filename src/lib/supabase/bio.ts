import { createServiceClient } from "@/lib/supabase/server";
import { getFeaturedPosts } from "@/lib/notion";
import type { Profile, Skill, Experience, Post, HomepageData } from "@/lib/supabase/types";

export async function getHomepageData(): Promise<HomepageData> {
  const supabase = createServiceClient();

  const [profileRes, skillsRes, experiencesRes] = await Promise.all([
    supabase.from("profiles").select("*").limit(1).single(),
    supabase.from("skills").select("*").order("sort_order", { ascending: true }),
    supabase.from("experiences").select("*").order("sort_order", { ascending: true }),
  ]);

  const profile: Profile | null = profileRes.data ?? null;
  const skills: Skill[] = (skillsRes.data ?? []) as Skill[];
  const experiences: Experience[] = (experiencesRes.data ?? []) as Experience[];
  const featuredPosts: Post[] = await getFeaturedPosts(4);

  return { profile, skills, experiences, featuredPosts };
}
