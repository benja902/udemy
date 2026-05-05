import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { runMonitor } = await import("@/lib/monitor/run-monitor");
  const summary = await runMonitor({ trigger: "cron" });
  return summary;
}

main()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
