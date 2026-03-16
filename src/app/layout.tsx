import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "My Blog", template: "%s | My Blog" },
  description: "A personal blog about technology and ideas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="git-commit" content="ee42b86" />
      </head>
      <body>{children}</body>
    </html>
  );
}

