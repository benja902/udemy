import { getEnv } from "@/lib/env";

export async function sendTelegramMessage(message: string) {
  const env = getEnv();

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return {
      sent: false,
      reason: "Telegram no configurado",
    };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram respondió ${response.status}: ${await response.text()}`);
  }

  return {
    sent: true,
    reason: null,
  };
}
