export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-6 py-14">{children}</div>;
}
