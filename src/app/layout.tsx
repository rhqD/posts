import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.renhanquan.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Ren Hanquan", template: "%s | Ren Hanquan" },
  description: "Senior Frontend Engineer — Frontend Performance, Low-Code Platforms, and Gardening",
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="git-commit" content={commitSha} />
      </head>
      <body className="bg-[#0a0a0f]">
        {children}
      </body>
    </html>
  );
}

