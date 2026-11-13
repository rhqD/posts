import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.renhanquan.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F7F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

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
      <body>
        {children}
      </body>
    </html>
  );
}

