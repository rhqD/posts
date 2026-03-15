import Link from "next/link";
import Image from "next/image";
import { formatDate, readingTime } from "@/lib/utils";
import type { Post } from "@/lib/supabase/types";

export default function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  if (featured) {
    return (
      <article className="group mb-14 pb-14" style={{ borderBottom: "1px solid var(--color-border)" }}>
        {post.cover_url && (
          <div className="mb-6 rounded-2xl overflow-hidden aspect-[2/1] bg-stone-100">
            <Image
              src={post.cover_url}
              alt={post.title}
              width={900}
              height={450}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-xs mb-3 font-medium" style={{ color: "var(--color-muted)" }}>
          {post.category && (
            <Link href={`/categories/${post.category.slug}`} className="uppercase tracking-widest transition-colors hover:opacity-70" style={{ color: "var(--color-accent)" }}>
              {post.category.name}
            </Link>
          )}
          {post.category && <span style={{ color: "var(--color-border)" }}>·</span>}
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
          {post.content && <><span style={{ color: "var(--color-border)" }}>·</span><span>{readingTime(post.content)}</span></>}
        </div>
        <h2 className="text-2xl font-semibold leading-snug mb-3 tracking-tight" style={{ color: "var(--color-text)" }}>
          <Link href={`/posts/${post.slug}`} className="transition-opacity hover:opacity-70">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && (
          <p className="leading-relaxed mb-4 line-clamp-3" style={{ color: "var(--color-muted)", fontSize: "0.9375rem" }}>
            {post.excerpt}
          </p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:opacity-70" style={{ background: "#EDE9E4", color: "var(--color-muted)" }}>
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <article className="group py-7 flex gap-6 items-start" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs mb-2 font-medium" style={{ color: "var(--color-muted)" }}>
          {post.category && (
            <Link href={`/categories/${post.category.slug}`} className="uppercase tracking-widest transition-opacity hover:opacity-70" style={{ color: "var(--color-accent)" }}>
              {post.category.name}
            </Link>
          )}
          {post.category && <span style={{ color: "var(--color-border)" }}>·</span>}
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
          {post.content && <><span style={{ color: "var(--color-border)" }}>·</span><span>{readingTime(post.content)}</span></>}
        </div>
        <h2 className="font-semibold leading-snug mb-1.5 tracking-tight" style={{ color: "var(--color-text)", fontSize: "1.0625rem" }}>
          <Link href={`/posts/${post.slug}`} className="transition-opacity hover:opacity-70">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && (
          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "var(--color-muted)" }}>
            {post.excerpt}
          </p>
        )}
      </div>
      {post.cover_url && (
        <div className="flex-shrink-0 w-24 h-16 rounded-xl overflow-hidden bg-stone-100">
          <Image
            src={post.cover_url}
            alt={post.title}
            width={96}
            height={64}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
    </article>
  );
}
