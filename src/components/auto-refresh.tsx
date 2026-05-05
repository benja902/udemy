"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export function AutoRefresh() {
  const router = useRouter();
  const realtimeConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [status, setStatus] = useState<"idle" | "connected" | "error">(
    realtimeConfigured ? "idle" : "error",
  );

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    let refreshTimer: number | undefined;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        router.refresh();
      }, 300);
    };

    const channel = supabase
      .channel("dashboard-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checks" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_check_results" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coupon_sources" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courses" },
        scheduleRefresh,
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("connected");
        }

        if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("error");
        }
      });

    return () => {
      window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="fixed bottom-3 right-3 z-50 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm">
      Realtime:{" "}
      <span className={status === "connected" ? "text-emerald-700" : "text-amber-700"}>
        {status === "connected" ? "conectado" : status === "error" ? "revisar" : "conectando"}
      </span>
    </div>
  );
}
