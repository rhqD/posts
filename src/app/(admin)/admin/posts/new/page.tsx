import { createServiceClient } from "@/lib/supabase/server";
import PostForm from "@/components/post/PostForm";

export default async function NewPostPage() {
  const supabase = createServiceClient();
  const [{ data: categories }, { data: tags }] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("tags").select("*").order("name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Post</h1>
      <PostForm categories={categories ?? []} tags={tags ?? []} />
    </div>
  );
}
