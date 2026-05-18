import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const supabase = createServiceClient();
  const { data } = await supabase.from("profiles").select("*").limit(1).single();
  return NextResponse.json({ profile: data ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("profiles").select("id").limit(1).single();

  if (existing) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({ ...body })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data }, { status: 201 });
}
