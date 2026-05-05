import { DashboardActions } from "@/components/dashboard-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { createSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DashboardData = {
  configured: boolean;
  error?: string;
  sources: Array<{
    id: string;
    name: string;
    source_url: string;
    last_seen_coupon: string | null;
    last_checked_at: string | null;
  }>;
  courses: Array<{
    id: string;
    title: string;
    udemy_url: string;
    instructor_name: string | null;
  }>;
  results: Array<{
    id: string;
    course_id: string;
    coupon_code: string | null;
    status: string;
    final_price: number | null;
    currency: string | null;
    checked_at: string;
    udemy_checked_url: string | null;
  }>;
  alerts: Array<{
    id: string;
    alert_type: string;
    message: string;
    sent_at: string;
  }>;
  checks: Array<{
    id: string;
    trigger: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    error_message: string | null;
  }>;
};

async function loadDashboardData(): Promise<DashboardData> {
  try {
    const supabase = createSupabaseAdmin();
    const [sources, courses, results, alerts, checks] = await Promise.all([
      supabase
        .from("coupon_sources")
        .select("id,name,source_url,last_seen_coupon,last_checked_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("courses")
        .select("id,title,udemy_url,instructor_name")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("course_check_results")
        .select("id,course_id,coupon_code,status,final_price,currency,checked_at,udemy_checked_url")
        .order("checked_at", { ascending: false })
        .limit(100),
      supabase
        .from("alerts")
        .select("id,alert_type,message,sent_at")
        .order("sent_at", { ascending: false })
        .limit(20),
      supabase
        .from("checks")
        .select("id,trigger,status,started_at,finished_at,error_message")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    const firstError =
      sources.error || courses.error || results.error || alerts.error || checks.error;

    if (firstError) {
      throw firstError;
    }

    return {
      configured: true,
      sources: sources.data ?? [],
      courses: courses.data ?? [],
      results: results.data ?? [],
      alerts: alerts.data ?? [],
      checks: checks.data ?? [],
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : "Error desconocido",
      sources: [],
      courses: [],
      results: [],
      alerts: [],
      checks: [],
    };
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin datos";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "free") return "bg-emerald-100 text-emerald-800";
  if (status === "discount") return "bg-sky-100 text-sky-800";
  if (status === "expired_coupon") return "bg-amber-100 text-amber-800";
  if (status === "error") return "bg-red-100 text-red-800";
  return "bg-zinc-100 text-zinc-700";
}

export default async function Home() {
  const data = await loadDashboardData();
  const latestResultByCourse = new Map<string, DashboardData["results"][number]>();

  for (const result of data.results) {
    if (!latestResultByCourse.has(result.course_id)) {
      latestResultByCourse.set(result.course_id, result);
    }
  }

  const currentCoupon = data.sources.find((source) => source.last_seen_coupon)?.last_seen_coupon;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <AutoRefresh />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">Monitor automático</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Cupones Udemy de cursos vigilados
            </h1>
          </div>
          <div className="grid gap-1 text-sm text-zinc-600 md:text-right">
            <span>Cupón actual</span>
            <strong className="text-xl text-zinc-950">{currentCoupon ?? "Sin detectar"}</strong>
          </div>
        </header>

        {!data.configured ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Configura Supabase con `.env.local` y ejecuta `supabase/schema.sql`.
            <span className="mt-2 block font-mono text-xs">{data.error}</span>
          </section>
        ) : null}

        <DashboardActions />

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 p-4">
            <h2 className="text-sm font-semibold">Cursos vigilados</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Curso</th>
                  <th className="px-4 py-3">Profesor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Cupón</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Última revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.courses.map((course) => {
                  const result = latestResultByCourse.get(course.id);

                  return (
                    <tr key={course.id}>
                      <td className="px-4 py-3">
                        <a
                          href={course.udemy_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-zinc-950 underline-offset-2 hover:underline"
                        >
                          {course.title}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {course.instructor_name ?? "Sin profesor"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                            result?.status ?? "pending",
                          )}`}
                        >
                          {result?.status ?? "pendiente"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {result?.coupon_code ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {result?.final_price != null
                          ? `${result.currency ?? ""} ${result.final_price}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDate(result?.checked_at ?? null)}
                      </td>
                    </tr>
                  );
                })}
                {data.courses.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={6}>
                      Aún no hay cursos registrados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Fuentes</h2>
            <div className="mt-3 grid gap-3">
              {data.sources.map((source) => (
                <div key={source.id} className="rounded-md border border-zinc-100 p-3">
                  <p className="font-medium">{source.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{source.source_url}</p>
                  <p className="mt-2 text-xs text-zinc-600">
                    Cupón: <span className="font-mono">{source.last_seen_coupon ?? "-"}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    Revisado: {formatDate(source.last_checked_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Últimas revisiones</h2>
            <div className="mt-3 grid gap-3">
              {data.checks.map((check) => (
                <div key={check.id} className="rounded-md border border-zinc-100 p-3">
                  <p className="text-sm font-medium">{check.status}</p>
                  <p className="text-xs text-zinc-500">
                    {check.trigger} · {formatDate(check.started_at)}
                  </p>
                  {check.error_message ? (
                    <p className="mt-1 line-clamp-2 text-xs text-red-700">
                      {check.error_message}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold">Alertas</h2>
            <div className="mt-3 grid gap-3">
              {data.alerts.map((alert) => (
                <div key={alert.id} className="rounded-md border border-zinc-100 p-3">
                  <p className="text-xs font-medium uppercase text-zinc-500">
                    {alert.alert_type}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm">{alert.message}</p>
                  <p className="mt-2 text-xs text-zinc-500">{formatDate(alert.sent_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
