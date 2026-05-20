import { NextRequest, NextResponse } from "next/server";

const NOTION_KEY = process.env.NOTION_API_KEY!;

async function getFreshImageUrl(blockId: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
    headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) return null;
  const block = await res.json();
  const file = block.image?.file || block.image?.external || {};
  return file.url || null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const blockId = req.nextUrl.searchParams.get("block_id");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    // Try the original S3 URL first (fast path)
    let res = await fetch(url);
    // If expired, get a fresh URL from Notion and retry
    if ((res.status === 403 || res.status === 400) && blockId) {
      const freshUrl = await getFreshImageUrl(blockId);
      if (freshUrl) res = await fetch(freshUrl);
    }
    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") || "image/png");
    headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");

    return new NextResponse(res.body, { headers });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
