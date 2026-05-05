import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runMonitor } from "@/lib/monitor/run-monitor";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const env = getEnv();

  if (!env.MONITOR_SECRET) {
    return true;
  }

  const headerSecret = request.headers.get("x-monitor-secret");
  const urlSecret = new URL(request.url).searchParams.get("secret");
  return headerSecret === env.MONITOR_SECRET || urlSecret === env.MONITOR_SECRET;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const summary = await runMonitor({ trigger: "manual" });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
