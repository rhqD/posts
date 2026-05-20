export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="mx-auto max-w-3xl px-6 py-14">
        {children}
      </div>
    </div>
  );
}
