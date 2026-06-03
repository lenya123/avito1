/**
 * Stage 2.6 — Суточный прогон fraud-детекторов.
 *
 * Вызывает RPC run_fraud_detectors(), которая по одному проходу крутит
 * все четыре детектора (return_abuse, frequent_cancellation, rapid_orders,
 * high_debt). Идемпотентна — не создаёт дубли открытых алертов.
 *
 * Расписание: 04:00 МСК ежедневно (queues.ts → scheduleFraudDetectorsDaily).
 * Также доступно ручной запуск из /owner/security → POST /api/owner/security/run-detectors.
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleRunFraudDetectors(_job: Job): Promise<void> {
  const supabase = getServiceClient();

  console.log("[run-fraud-detectors] Starting...");

  const { data, error } = await supabase.rpc("run_fraud_detectors");

  if (error) {
    console.error("[run-fraud-detectors] RPC error:", error);
    throw error;
  }

  const inserted = (data as number | null) ?? 0;
  console.log(`[run-fraud-detectors] Done. Inserted ${inserted} new alerts.`);
}
