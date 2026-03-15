import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export default async function Header() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-20 border-b" style={{ background: "rgba(249,247,244,0.85)", backdropFilter: "blur(12px)", borderColor: "var(--color-border)" }}>
      <div className="mx-auto max-w-3xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight text-sm" style={{ color: "var(--color-text)" }}>
          ✦ My Blog
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-lg transition-colors hover:bg-stone-100" style={{ color: "var(--color-muted)" }}>
            Home
          </Link>
          {session ? (
            <>
              <Link href="/admin" className="px-3 py-1.5 rounded-lg transition-colors hover:bg-stone-100" style={{ color: "var(--color-muted)" }}>
                Admin
              </Link>
              <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                <button type="submit" className="px-3 py-1.5 rounded-lg transition-colors hover:bg-stone-100 text-sm" style={{ color: "var(--color-muted)" }}>
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
