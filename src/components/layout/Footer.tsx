export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0a0a0f" }}>
      <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
        <span>© {new Date().getFullYear()} Ren Hanquan</span>
        <div className="flex items-center gap-4">
          <a href="https://github.com/rhqD" target="_blank" rel="noopener noreferrer" className="hover:text-white/50 transition-colors">GitHub</a>
          <span>Built with Next.js & Supabase</span>
        </div>
      </div>
    </footer>
  );
}
