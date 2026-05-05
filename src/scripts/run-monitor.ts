import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const { runMonitor } = await import("@/lib/monitor/run-monitor");

runMonitor({ trigger: "cron" })
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
