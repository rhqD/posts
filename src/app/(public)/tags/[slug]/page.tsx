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
  const { data } = await supabase.from("tags").select("name").eq("slug", slug).single();
  if (!data) return {};
  return { title: `Tag: ${data.name}` };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: tag } = await supabase.from("tags").select("*").eq("slug", slug).single();
  if (!tag) notFound();

  const { data } = await supabase
    .from("post_tags")
    .select("post:posts(*, category:categories(*), post_tags(tag:tags(*)))")
    .eq("tag_id", tag.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts: Post[] = (data ?? []).map((pt: any) => pt.post).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => !!p && p.status === "published"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Tag: {tag.name}</h1>
      {posts.length === 0 ? (
        <p className="text-gray-500">No posts with this tag.</p>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
