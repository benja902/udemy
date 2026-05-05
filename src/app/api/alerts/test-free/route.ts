import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/monitor/telegram";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createSupabaseAdmin();

  try {
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id,title,udemy_url")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single<{ id: string; title: string; udemy_url: string }>();

    if (courseError || !course) {
      return NextResponse.json(
        { error: "Primero registra al menos un curso activo." },
        { status: 400 },
      );
    }

    const { data: coupon, error: couponError } = await supabase
      .from("coupons")
      .select("id,code")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .single<{ id: string; code: string }>();

    if (couponError || !coupon) {
      return NextResponse.json(
        { error: "Primero ejecuta una revisión para detectar un cupón." },
        { status: 400 },
      );
    }

    const message = `[PRUEBA] Curso gratis detectado\n\n${course.title}\nCupón: ${coupon.code}\n${course.udemy_url}`;

    const dedupeKey = `test_free:${course.id}:${coupon.id}:${new Date()
      .toISOString()
      .slice(0, 10)}`;

    const { error: alertError } = await supabase.from("alerts").insert({
      course_id: course.id,
      coupon_id: coupon.id,
      alert_type: "test_course_free",
      dedupe_key: dedupeKey,
      sent_to: "telegram",
      message,
    });

    if (alertError && alertError.code !== "23505") {
      throw alertError;
    }

    await sendTelegramMessage(message);

    return NextResponse.json({
      ok: true,
      deduplicated: alertError?.code === "23505",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
