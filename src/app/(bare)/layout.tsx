import Header from "@/components/layout/Header";

// Same header as the public layout, but without the footer — used by pages that
// fill the viewport (the 3D viewer).
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}
