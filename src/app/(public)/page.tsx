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
  const [featured, ...rest] = posts;

  return (
    <div>
      {/* Page heading */}
      <div className="mb-12 pb-10" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-accent)" }}>
          Writing
        </p>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight" style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)" }}>
          Thoughts on technology,<br />design, and craft.
        </h1>
      </div>

      {posts.length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: "var(--color-muted)" }}>
          No posts yet. Check back soon.
        </div>
      ) : (
        <>
          {/* Featured post */}
          {featured && page === 1 && (
            <PostCard post={featured} featured />
          )}

          {/* Rest of posts */}
          <div>
            {(page === 1 ? rest : posts).map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-16">
          {page > 1 && (
            <a href={`/?page=${page - 1}`} className="px-4 py-2 text-sm rounded-lg font-medium transition-colors hover:opacity-70" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              ← Newer
            </a>
          )}
          <span className="text-xs px-2" style={{ color: "var(--color-muted)" }}>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <a href={`/?page=${page + 1}`} className="px-4 py-2 text-sm rounded-lg font-medium transition-colors hover:opacity-70" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              Older →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
