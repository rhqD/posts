import { getPublishedPosts } from "@/lib/notion";
import PostCard from "@/components/post/PostCard";
import PageWrapper from "@/components/layout/PageWrapper";

export const revalidate = 3600;

export default async function PostsArchivePage() {
  const posts = await getPublishedPosts();

  return (
    <PageWrapper>
      <div className="mb-12 pb-10" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-accent)" }}>
          Writing
        </p>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight" style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)" }}>
          All Posts
        </h1>
      </div>

      {posts.filter(p => p.status === "published").length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: "var(--color-muted)" }}>
          No posts yet.
        </div>
      ) : (
        posts.filter(p => p.status === "published").map((post) => (
          <PostCard key={post.id} post={post} />
        ))
      )}
    </PageWrapper>
  );
}
