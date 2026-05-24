export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #E8E4DF", background: "#fff" }}>
      <div className="mx-auto max-w-7xl px-6 sm:px-12 lg:px-20 py-6 flex items-center justify-between text-[11px] text-stone-400">
        <span>© {new Date().getFullYear()} Ren Hanquan</span>
        <div className="flex items-center gap-4">
          <a href="https://github.com/rhqD" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 transition-colors">GitHub</a>
          <span>Built with Next.js & Notion</span>
        </div>
      </div>
    </footer>
  );
}
