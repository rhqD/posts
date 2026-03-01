import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/lib/supabase/types";

export default function PostCard({ post }: { post: Post }) {
  return (
    <article className="py-8 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        {post.published_at && <time>{formatDate(post.published_at)}</time>}
        {post.category && (
          <>
            <span>·</span>
            <Link
              href={`/categories/${post.category.slug}`}
              className="hover:text-gray-900"
            >
              {post.category.name}
            </Link>
          </>
        )}
      </div>
      <h2 className="text-xl font-semibold mb-2">
        <Link href={`/posts/${post.slug}`} className="hover:underline">
          {post.title}
        </Link>
      </h2>
      {post.excerpt && (
        <p className="text-gray-600 text-sm leading-relaxed">{post.excerpt}</p>
      )}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {post.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
