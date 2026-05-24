import type { Metadata } from "next";
import Providers from "@/components/layout/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ren Hanquan", template: "%s | Ren Hanquan" },
  description: "Senior Frontend Engineer — Frontend Performance, Low-Code Platforms, and Gardening",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <meta name="git-commit" content={commitSha} />
      </head>
      <body className="bg-[#0a0a0f]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

