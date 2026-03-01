import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export default async function Header() {
  const session = await auth();

  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          My Blog
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-gray-600 hover:text-gray-900">
            Home
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-gray-600 hover:text-gray-900">
                  Sign out
                </button>
              </form>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
