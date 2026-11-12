import type { Metadata } from "next";

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
    <div style={{ position: "fixed", inset: 0 }}>
      <iframe
        src="/yard/"
        title="院子 3D 模型"
        style={{ width: "100%", height: "100%", border: 0 }}
        allow="fullscreen"
      />
      <a
        href="/"
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
          padding: "8px 16px",
          borderRadius: 999,
          background: "rgba(250,251,246,.92)",
          border: "1px solid #fff",
          boxShadow: "0 6px 24px rgba(51,65,43,.10)",
          color: "#3d4a34",
          fontSize: 12,
          textDecoration: "none",
          backdropFilter: "blur(12px)",
        }}
      >
        ← 返回站点
      </a>
    </div>
  );
}
