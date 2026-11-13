import type { Metadata } from "next";
import YardViewer from "@/components/yard/YardViewer";

export const metadata: Metadata = {
  title: "Home · 3D",
  description: "Interactive 3D model of the courtyard.",
  alternates: { canonical: "/home/" },
};

export default function HomePage() {
  return (
    <div className="yard-page">
      <YardViewer />
    </div>
  );
}
