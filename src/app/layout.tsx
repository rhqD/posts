import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "My Blog", template: "%s | My Blog" },
  description: "A personal blog about technology and ideas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="git-commit" content={commitSha} />
      </head>
      <body>{children}</body>
    </html>
  );
}

