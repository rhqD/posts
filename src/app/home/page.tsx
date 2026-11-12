import type { Metadata } from "next";
import Header from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Home · 3D",
  description: "Interactive 3D model of the courtyard.",
  alternates: { canonical: "/home/" },
};

// The viewer is a self-contained three.js page in public/yard (vendored).
// Keeping it in an iframe avoids pulling three.js into the app bundle and keeps
// the demo's own UI (sun panel, lamp switches, view presets) intact.
export default function HomePage() {
  return (
    <>
      <Header solid />
      <iframe
        src="/yard/?embed=1"
        title="院子 3D 模型"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 0 }}
        allow="fullscreen"
      />
    </>
  );
}
