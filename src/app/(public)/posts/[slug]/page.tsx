import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import PostContent from "@/components/post/PostContent";
import { formatDate, readingTime } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from("posts").select("title, excerpt, cover_url").eq("slug", slug).single();
  if (!data) return {};
  return {
    title: data.title,
    description: data.excerpt ?? undefined,
    openGraph: data.cover_url ? { images: [data.cover_url] } : undefined,
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("posts")
    .select("*, category:categories(*), post_tags(tag:tags(*))")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!data) notFound();

  const post = {
    ...data,
    tags: data.post_tags?.map((pt: { tag: unknown }) => pt.tag) ?? [],
  };

  const mins = post.content ? readingTime(post.content) : null;

  return (
    <article>
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-medium mb-12 transition-opacity hover:opacity-60" style={{ color: "var(--color-muted)" }}>
        ← All posts
      </Link>

      {/* Header */}
      <header className="mb-10">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium mb-5" style={{ color: "var(--color-muted)" }}>
          {post.category && (
            <Link href={`/categories/${post.category.slug}`} className="uppercase tracking-widest transition-opacity hover:opacity-70" style={{ color: "var(--color-accent)" }}>
              {post.category.name}
            </Link>
          )}
          {post.category && <span style={{ color: "var(--color-border)" }}>·</span>}
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
          {mins && <><span style={{ color: "var(--color-border)" }}>·</span><span>{mins}</span></>}
        </div>

        <h1
          className="text-4xl font-semibold leading-tight tracking-tight mb-6"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-serif)", letterSpacing: "-0.02em" }}
        >
          {post.title}
        </h1>

        {post.excerpt && (
          <p className="text-lg leading-relaxed mb-6" style={{ color: "var(--color-muted)", fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
            {post.excerpt}
          </p>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag: { id: string; name: string; slug: string }) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="text-xs px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-70" style={{ background: "#EDE9E4", color: "var(--color-muted)" }}>
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Cover image */}
      {post.cover_url && (
        <div className="mb-12 -mx-6 sm:mx-0 sm:rounded-2xl overflow-hidden">
          <Image src={post.cover_url} alt={post.title} width={900} height={500} className="w-full object-cover" />
        </div>
      )}

      {/* Divider */}
      <div className="mb-12" style={{ borderTop: "1px solid var(--color-border)" }} />

      {/* Body */}
      <PostContent post={post} />

      {/* Footer */}
      <div className="mt-20 pt-10" style={{ borderTop: "1px solid var(--color-border)" }}>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60" style={{ color: "var(--color-muted)" }}>
          ← Back to all posts
        </Link>
      </div>
    </article>
  );
}
