import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

async function getFreshImageUrl(blockId: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
    headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) return null;
  const block = await res.json();
  return block.image?.file?.url || block.image?.external?.url || null;
}

function cacheKey(blockId: string | null, url: string): string {
  return (blockId || Buffer.from(url).toString("base64").replace(/[/+=]/g, "").slice(0, 32));
}

// Check Supabase Storage cache
async function getCached(key: string) {
  try {
    const supabase = createServiceClient();
    const { data: files } = await supabase.storage.from("images").list("", { search: key, limit: 1 });
    if (files?.length) {
      const { data } = supabase.storage.from("images").getPublicUrl(files[0].name);
      return data?.publicUrl || null;
    }
  } catch {}
  return null;
}

// Store buffer in Supabase
async function storeInSupabase(key: string, data: ArrayBuffer) {
  try {
    const supabase = createServiceClient();
    await supabase.storage.from("images").upload(`${key}.jpg`, data, {
      contentType: "image/jpeg", upsert: true, cacheControl: "31536000",
    });
  } catch {}
}

function serveBytes(buf: ArrayBuffer) {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const blockId = req.nextUrl.searchParams.get("block_id");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const key = cacheKey(blockId, url);

  // 1. Supabase cache hit? Return immediately
  const cached = await getCached(key);
  if (cached) {
    const res = await fetch(cached);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return serveBytes(buf);
    }
  }

  // 2. Fetch from original S3 URL
  let sourceUrl = url;
  let buf: ArrayBuffer | null = null;

  try {
    let res = await fetch(sourceUrl);
    if ((res.status === 403 || res.status === 400) && blockId) {
      const freshUrl = await getFreshImageUrl(blockId);
      if (freshUrl) {
        sourceUrl = freshUrl;
        res = await fetch(sourceUrl);
      }
    }
    if (res.ok) buf = await res.arrayBuffer();
  } catch {}

  if (!buf) return NextResponse.json({ error: "Failed" }, { status: 500 });

  // 3. Store in Supabase for next time (background, don't wait)
  storeInSupabase(key, buf).catch(() => {});

  return serveBytes(buf);
}
