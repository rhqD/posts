import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createServiceClient();

  const [{ count: published }, { count: drafts }] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-3xl font-bold">{published ?? 0}</div>
          <div className="text-sm text-gray-500 mt-1">Published posts</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-3xl font-bold">{drafts ?? 0}</div>
          <div className="text-sm text-gray-500 mt-1">Drafts</div>
        </div>
      </div>
      <Link
        href="/admin/posts/new"
        className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
      >
        New post
      </Link>
    </div>
  );
}
