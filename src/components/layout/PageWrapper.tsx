export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#F9F7F4", color: "#1A1917" }}>
      <div className="mx-auto max-w-3xl px-6 py-14">
        {children}
      </div>
    </div>
  );
}
