import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import PostCard from "@/components/post/PostCard";
import type { Post } from "@/lib/supabase/types";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from("categories").select("name").eq("slug", slug).single();
  if (!data) return {};
  return { title: `Category: ${data.name}` };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!category) notFound();

  const { data } = await supabase
    .from("posts")
    .select("*, category:categories(*), post_tags(tag:tags(*))")
    .eq("category_id", category.id)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts: Post[] = (data ?? []).map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Category: {category.name}</h1>
      {posts.length === 0 ? (
        <p className="text-gray-500">No posts in this category.</p>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
