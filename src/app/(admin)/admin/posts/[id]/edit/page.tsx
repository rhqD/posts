import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import PostForm from "@/components/post/PostForm";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: post }, { data: categories }, { data: tags }] = await Promise.all([
    supabase
      .from("posts")
      .select("*, post_tags(tag_id)")
      .eq("id", id)
      .single(),
    supabase.from("categories").select("*").order("name"),
    supabase.from("tags").select("*").order("name"),
  ]);

  if (!post) notFound();

  const initialData = {
    title: post.title,
    excerpt: post.excerpt ?? "",
    content: post.content ?? "",
    category_id: post.category_id,
    status: post.status as "draft" | "published",
    tag_ids: post.post_tags?.map((pt: { tag_id: string }) => pt.tag_id) ?? [],
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit Post</h1>
      <PostForm
        postId={id}
        initialData={initialData}
        categories={categories ?? []}
        tags={tags ?? []}
      />
    </div>
  );
}
