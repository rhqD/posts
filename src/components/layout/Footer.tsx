export default function Footer() {
  return (
    <footer className="mt-24" style={{ borderTop: "1px solid var(--color-border)" }}>
      <div className="mx-auto max-w-3xl px-6 py-8 flex items-center justify-between text-xs" style={{ color: "var(--color-muted)" }}>
        <span>© {new Date().getFullYear()} My Blog</span>
        <span>Built with Next.js & Supabase</span>
      </div>
    </footer>
  );
}
