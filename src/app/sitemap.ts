import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/notion";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const posts = await getPublishedPosts();

  return [
    { url: siteUrl, lastModified: new Date() },
    { url: `${siteUrl}/posts/`, lastModified: new Date() },
    ...posts.map((p) => ({
      url: `${siteUrl}/posts/${p.slug}/`,
      lastModified: new Date(p.updated_at),
    })),
  ];
}
