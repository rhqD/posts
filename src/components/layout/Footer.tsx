export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--color-border, #E8E4DF)", background: "var(--color-bg, #F9F7F4)", color: "var(--color-muted, #78716C)" }}>
      <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-xs">
        <span>© {new Date().getFullYear()} Ren Hanquan</span>
        <div className="flex items-center gap-4">
          <a href="https://github.com/rhqD" target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">GitHub</a>
          <span>Built with Next.js & Supabase</span>
        </div>
      </div>
    </footer>
  );
}
