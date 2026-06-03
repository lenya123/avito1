/**
 * Daily job: обновление ELO-score отправщиков
 *
 * Запускается каждый день в 01:00 МСК.
 * Для каждого отправщика за вчерашний день:
 * - Считает доступные заказы / кол-во отправщиков
 * - Считает completion rate (shipped / available)
 * - Обновляет score по ELO-формуле с асимметрией (падать × 2.5 легче)
 * - Пересчитывает earnings за день с новой ставкой
 */

import { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { MOSCOW_TZ } from "@/lib/utils/moscow-time";

function moscowDateStr(date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: MOSCOW_TZ });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleUpdateShipperScores(_job: Job): Promise<void> {
  const supabase = createServiceClient();

  // Вчерашняя дата по МСК
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = moscowDateStr(yesterday);

  console.log(`[ShipperScores] Updating scores for ${dateStr}`);

  const { data, error } = await supabase.rpc("update_shipper_scores", {
    p_date: dateStr,
  });

  if (error) {
    console.error("[ShipperScores] Error:", error);
    throw error;
  }

  const results = data as Array<{
    shipper_id: string;
    old_score: number;
    new_score: number;
    result: number;
    delta: number;
  }> | null;

  if (results && results.length > 0) {
    for (const r of results) {
      console.log(
        `[ShipperScores] ${r.shipper_id}: ${r.old_score} → ${r.new_score} (completion: ${Math.round(r.result * 100)}%, delta: ${r.delta > 0 ? "+" : ""}${r.delta.toFixed(2)})`
      );
    }
  } else {
    console.log("[ShipperScores] No shippers to update");
  }
}
