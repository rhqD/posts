import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import PostContent from "@/components/post/PostContent";
import GiscusComments from "@/components/post/GiscusComments";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from("posts").select("title, excerpt").eq("slug", slug).single();
  if (!data) return {};
  return { title: data.title, description: data.excerpt ?? undefined };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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

  return (
    <article>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
          {post.category && (
            <>
              <span>·</span>
              <Link href={`/categories/${post.category.slug}`} className="hover:text-gray-900">
                {post.category.name}
              </Link>
            </>
          )}
        </div>
        <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag: { id: string; name: string; slug: string }) => (
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
      </header>
      <PostContent post={post} />
      <GiscusComments
        repo={process.env.NEXT_PUBLIC_GISCUS_REPO ?? ""}
        repoId={process.env.NEXT_PUBLIC_GISCUS_REPO_ID ?? ""}
        category={process.env.NEXT_PUBLIC_GISCUS_CATEGORY ?? ""}
        categoryId={process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID ?? ""}
        term={slug}
      />
    </article>
  );
}
