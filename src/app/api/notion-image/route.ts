import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.NOTION_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") || "image/png");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new NextResponse(res.body, { headers });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
