import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/monitor/telegram";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await sendTelegramMessage(
      `Prueba de Telegram OK\nMonitor Udemy activo: ${new Date().toLocaleString("es-PE")}`,
    );

    if (!result.sent) {
      return NextResponse.json(
        { error: result.reason || "Telegram no configurado" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
