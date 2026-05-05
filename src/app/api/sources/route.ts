import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";

const sourceSchema = z.object({
  name: z.string().min(1),
  source_url: z.string().url(),
  coupon_selector: z.string().optional(),
  coupon_regex: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = sourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("coupon_sources")
    .insert({
      name: parsed.data.name,
      source_url: parsed.data.source_url,
      coupon_selector: parsed.data.coupon_selector || null,
      coupon_regex: parsed.data.coupon_regex || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
