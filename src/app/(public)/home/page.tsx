import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home · 3D",
  description: "Interactive 3D model of the courtyard.",
  alternates: { canonical: "/home/" },
};

// The viewer is a self-contained three.js page in public/yard (vendored). The
// iframe keeps three.js out of the app bundle and preserves the demo's own UI.
// The site header comes from the (public) layout; the canvas starts below it.
export default function HomePage() {
  return (
    <div className="bg-[#F9F7F4] pt-12 sm:pt-14">
      <iframe
        src="/yard/?embed=1"
        title="院子 3D 模型"
        allow="fullscreen"
        className="block w-full border-0 h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-3.5rem)]"
      />
    </div>
  );
}
