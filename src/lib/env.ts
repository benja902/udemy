import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MONITOR_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  PLAYWRIGHT_HEADLESS: z.string().optional().default("true"),
  UDEMY_LOCALE: z.string().optional().default("es_ES"),
});

export function getEnv() {
  return envSchema.parse(process.env);
}
