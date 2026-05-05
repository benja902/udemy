import { createSupabaseAdmin } from "@/lib/supabase";
import { detectCoupon } from "@/lib/monitor/coupon-detector";
import { verifyCourseFromSource } from "@/lib/monitor/source-course-verifier";
import { sendTelegramMessage } from "@/lib/monitor/telegram";
import { verifyUdemyCoupon } from "@/lib/monitor/udemy-verifier";
import type { Coupon, CouponSource, Course, VerificationResult } from "@/lib/monitor/types";

type RunMonitorOptions = {
  trigger: "manual" | "cron";
};

type RunMonitorSummary = {
  checkId: string;
  detectedCoupons: number;
  checkedCourses: number;
  alertsCreated: number;
  errors: string[];
};

async function acquireLock(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60_000).toISOString();

  await supabase.from("review_locks").delete().eq("lock_name", "monitor").lt("expires_at", now.toISOString());

  const { error } = await supabase.from("review_locks").insert({
    lock_name: "monitor",
    expires_at: expiresAt,
  });

  if (error) {
    return false;
  }

  return true;
}

async function releaseLock(supabase: ReturnType<typeof createSupabaseAdmin>) {
  await supabase.from("review_locks").delete().eq("lock_name", "monitor");
}

async function createAlertOnce(params: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  dedupeKey: string;
  alertType: string;
  message: string;
  courseId?: string;
  couponId?: string;
}) {
  const { supabase, dedupeKey, alertType, message, courseId, couponId } = params;

  const { error } = await supabase.from("alerts").insert({
    course_id: courseId ?? null,
    coupon_id: couponId ?? null,
    alert_type: alertType,
    dedupe_key: dedupeKey,
    sent_to: "telegram",
    message,
  });

  if (error) {
    if (error.code === "23505") {
      return false;
    }

    throw error;
  }

  await sendTelegramMessage(message);
  return true;
}

async function upsertCoupon(params: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  source: CouponSource;
  code: string;
  rawContext: string | null;
}) {
  const { supabase, source, code, rawContext } = params;

  const { data, error } = await supabase
    .from("coupons")
    .upsert(
      {
        source_id: source.id,
        code,
        source_url: source.source_url,
        raw_context: rawContext,
        last_seen_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: "source_id,code" },
    )
    .select("*")
    .single<Coupon>();

  if (error) {
    throw error;
  }

  return data;
}

async function storeVerificationResult(params: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  checkId: string;
  course: Course;
  coupon: Coupon;
  result: VerificationResult;
}) {
  const { supabase, checkId, course, coupon, result } = params;

  const { error } = await supabase.from("course_check_results").insert({
    check_id: checkId,
    course_id: course.id,
    coupon_id: coupon.id,
    coupon_code: coupon.code,
    status: result.status,
    final_price: result.finalPrice,
    currency: result.currency,
    detected_label: result.detectedLabel,
    udemy_checked_url: result.checkedUrl,
    error_message: result.errorMessage ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function runMonitor(options: RunMonitorOptions): Promise<RunMonitorSummary> {
  const supabase = createSupabaseAdmin();
  const lockAcquired = await acquireLock(supabase);

  if (!lockAcquired) {
    throw new Error("Ya hay una revisión en curso o el lock aún no expiró.");
  }

  const { data: check, error: checkError } = await supabase
    .from("checks")
    .insert({ trigger: options.trigger })
    .select("id")
    .single<{ id: string }>();

  if (checkError) {
    await releaseLock(supabase);
    throw checkError;
  }

  const summary: RunMonitorSummary = {
    checkId: check.id,
    detectedCoupons: 0,
    checkedCourses: 0,
    alertsCreated: 0,
    errors: [],
  };

  try {
    const [{ data: sources, error: sourcesError }, { data: courses, error: coursesError }] =
      await Promise.all([
        supabase.from("coupon_sources").select("*").eq("active", true).returns<CouponSource[]>(),
        supabase.from("courses").select("*").eq("active", true).returns<Course[]>(),
      ]);

    if (sourcesError) {
      throw sourcesError;
    }

    if (coursesError) {
      throw coursesError;
    }

    for (const source of sources ?? []) {
      try {
        const previousCoupon = source.last_seen_coupon;
        const detection = await detectCoupon(source);

        await supabase
          .from("coupon_sources")
          .update({
            last_seen_coupon: detection.code,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id);

        if (!detection.code) {
          summary.errors.push(`No se detectó cupón en ${source.name}.`);
          continue;
        }

        summary.detectedCoupons += 1;
        const coupon = await upsertCoupon({
          supabase,
          source,
          code: detection.code,
          rawContext: detection.rawContext,
        });

        if (previousCoupon && previousCoupon !== coupon.code) {
          const created = await createAlertOnce({
            supabase,
            alertType: "coupon_changed",
            couponId: coupon.id,
            dedupeKey: `coupon_changed:${source.id}:${coupon.id}`,
            message: `Cambió el cupón de ${source.name}: ${previousCoupon} -> ${coupon.code}`,
          });
          if (created) summary.alertsCreated += 1;
        }

        for (const course of courses ?? []) {
          const result =
            (await verifyCourseFromSource({
              sourceUrl: source.source_url,
              course,
              couponCode: coupon.code,
            })) ?? (await verifyUdemyCoupon(course, coupon.code));
          summary.checkedCourses += 1;

          await storeVerificationResult({
            supabase,
            checkId: check.id,
            course,
            coupon,
            result,
          });

          if (result.status === "free") {
            const created = await createAlertOnce({
              supabase,
              alertType: "course_free",
              courseId: course.id,
              couponId: coupon.id,
              dedupeKey: `course_free:${course.id}:${coupon.id}`,
              message: `Curso gratis detectado\n\n${course.title}\nCupón: ${coupon.code}\n${result.checkedUrl}`,
            });
            if (created) summary.alertsCreated += 1;
          }
        }
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : "Error desconocido");
      }
    }

    const finalStatus = summary.errors.length > 0 ? "partial_error" : "success";
    await supabase
      .from("checks")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        error_message: summary.errors.join("\n") || null,
      })
      .eq("id", check.id);

    return summary;
  } catch (error) {
    await supabase
      .from("checks")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Error desconocido",
      })
      .eq("id", check.id);

    throw error;
  } finally {
    await releaseLock(supabase);
  }
}
