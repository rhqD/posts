import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("experiences").select("*").order("sort_order", { ascending: true });
  return NextResponse.json({ experiences: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("experiences")
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ experience: data }, { status: 201 });
}
