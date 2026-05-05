import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";

const courseSchema = z.object({
  title: z.string().min(1),
  udemy_url: z.string().url(),
  instructor_name: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = courseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      title: parsed.data.title,
      udemy_url: parsed.data.udemy_url,
      instructor_name: parsed.data.instructor_name || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
