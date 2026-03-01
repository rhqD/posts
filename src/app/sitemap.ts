import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return [{ url: siteUrl }];
  }

  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const supabase = createServiceClient();
    const { data: posts } = await supabase
      .from("posts")
      .select("slug, updated_at")
      .eq("status", "published");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postUrls = (posts ?? []).map((p: any) => ({
      url: `${siteUrl}/posts/${p.slug}`,
      lastModified: new Date(p.updated_at),
    }));

    return [{ url: siteUrl }, ...postUrls];
  } catch {
    return [{ url: siteUrl }];
  }
}
