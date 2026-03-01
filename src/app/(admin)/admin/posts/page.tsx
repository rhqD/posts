import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Post } from "@/lib/supabase/types";

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "all" } = await searchParams;
  const supabase = createServiceClient();

  let query = supabase
    .from("posts")
    .select("*, category:categories(*)")
    .order("updated_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);

  const { data: postsData } = await query;
  const posts = postsData as (Post & { category: { id: string; name: string; slug: string } | null })[] | null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Posts</h1>
        <Link
          href="/admin/posts/new"
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
        >
          New post
        </Link>
      </div>
      <div className="flex gap-2 mb-6 text-sm">
        {["all", "published", "draft"].map((s) => (
          <Link
            key={s}
            href={`/admin/posts?status=${s}`}
            className={`px-3 py-1 rounded-full border ${
              status === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 hover:border-gray-400"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {(posts ?? []).length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No posts found.</p>
        ) : (
          (posts ?? []).map((post) => (
            <div key={post.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{post.title}</div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {post.status === "published" && post.published_at
                    ? `Published ${formatDate(post.published_at)}`
                    : "Draft"}{" "}
                  {post.category && `· ${post.category.name}`}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Link href={`/admin/posts/${post.id}/edit`} className="text-gray-600 hover:text-gray-900">
                  Edit
                </Link>
                {post.status === "published" && (
                  <Link
                    href={`/posts/${post.slug}`}
                    target="_blank"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    View
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
