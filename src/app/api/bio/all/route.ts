import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getFeaturedPosts } from "@/lib/notion";

export async function GET() {
  const supabase = createServiceClient();

  const [profileRes, skillsRes, experiencesRes] = await Promise.all([
    supabase.from("profiles").select("*").limit(1).single(),
    supabase.from("skills").select("*").order("sort_order", { ascending: true }),
    supabase.from("experiences").select("*").order("sort_order", { ascending: true }),
  ]);

  const featuredPosts = await getFeaturedPosts(4);

  return NextResponse.json({
    profile: profileRes.data ?? null,
    skills: skillsRes.data ?? [],
    experiences: experiencesRes.data ?? [],
    featuredPosts,
  });
}
