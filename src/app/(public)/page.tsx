import { createServiceClient } from "@/lib/supabase/server";
import PostCard from "@/components/post/PostCard";
import type { Post } from "@/lib/supabase/types";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = parseInt(pageParam ?? "1");
  const limit = 10;
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();
  const { data, count } = await supabase
    .from("posts")
    .select("*, category:categories(*), post_tags(tag:tags(*))", { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts: Post[] = (data ?? []).map((p: any) => ({
    ...p,
    tags: p.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  }));

  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Posts</h1>
      {posts.length === 0 ? (
        <p className="text-gray-500">No posts yet.</p>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/?page=${p}`}
              className={`px-3 py-1 rounded border text-sm ${
                p === page ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
