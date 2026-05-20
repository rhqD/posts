import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const NOTION_KEY = process.env.NOTION_API_KEY!;

async function getFreshImageUrl(blockId: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
    headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) return null;
  const block = await res.json();
  return block.image?.file?.url || block.image?.external?.url || null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const blockId = req.nextUrl.searchParams.get("block_id");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Use block_id or URL hash as cache key
  const cacheKey = blockId || Buffer.from(url).toString("base64").replace(/[/+=]/g, "").slice(0, 32);

  try {
    // Try S3 URL directly (fast path)
    let res = await fetch(url);
    // If expired, get fresh URL from Notion
    if ((res.status === 403 || res.status === 400) && blockId) {
      const freshUrl = await getFreshImageUrl(blockId);
      if (freshUrl) res = await fetch(freshUrl);
    }
    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    // Cache this image in Supabase Storage for next time
    try {
      const supabase = createServiceClient();
      const blob = await res.clone().arrayBuffer();
      const ct = res.headers.get("Content-Type") || "image/png";
      const ext = ct.split("/")[1] || "png";
      await supabase.storage.from("images").upload(`${cacheKey}.${ext}`, blob, {
        contentType: ct,
        upsert: true,
        cacheControl: "31536000",
      });
    } catch {}

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");

    return new NextResponse(res.body, { headers });
  } catch {
    // Last resort: try Supabase cache even if original fetch failed
    try {
      const supabase = createServiceClient();
      const { data: files } = await supabase.storage.from("images").list("", { search: cacheKey });
      if (files?.length) {
        const { data: cached } = supabase.storage.from("images").getPublicUrl(files[0].name);
        if (cached?.publicUrl) {
          const cachedRes = await fetch(cached.publicUrl);
          if (cachedRes.ok) {
            const headers = new Headers();
            headers.set("Content-Type", cachedRes.headers.get("Content-Type") || "image/png");
            headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
            return new NextResponse(cachedRes.body, { headers });
          }
        }
      }
    } catch {}
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
