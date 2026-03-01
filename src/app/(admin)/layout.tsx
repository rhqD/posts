import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold">My Blog</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
            <Link href="/admin/posts" className="text-gray-600 hover:text-gray-900">Posts</Link>
            <Link href="/" className="text-gray-600 hover:text-gray-900">View site</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
