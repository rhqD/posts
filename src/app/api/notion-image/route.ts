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

  let imageUrl: string | null = null;

  // If we have a block_id, get a fresh URL from Notion
  if (blockId) {
    imageUrl = await getFreshImageUrl(blockId);
  }
  // Fall back to the raw URL
  if (!imageUrl) imageUrl = url;
  if (!imageUrl) return NextResponse.json({ error: "Missing url or block_id" }, { status: 400 });

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new NextResponse(res.body, { headers });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
