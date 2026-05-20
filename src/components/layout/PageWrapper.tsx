export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{
      background: "#F9F7F4",
      color: "#1A1917",
      // Override dark CSS vars for blog pages
      "--color-bg": "#F9F7F4",
      "--color-surface": "#FFFFFF",
      "--color-border": "#E8E4DF",
      "--color-text": "#1A1917",
      "--color-muted": "#78716C",
      "--color-accent": "#C2410C",
    } as React.CSSProperties}>
      <div className="mx-auto max-w-3xl px-6 py-14">
        {children}
      </div>
    </div>
  );
}
