/**
 * Хендлер действий над объявлением (вкл/выкл/удаление) через браузер.
 * Запускается из API /api/avito/items/[itemId]/status и DELETE .../[itemId].
 */
import type { Job } from "bullmq";
import { createServiceClient } from "@/lib/supabase/server";
import { setAvitoItemActive, deleteAvitoItem } from "@/lib/avito/item-actions";
import type { AvitoItemActionJobData } from "../queues";

export async function handleAvitoItemAction(
  job: Job<AvitoItemActionJobData>
): Promise<void> {
  const { sessionId, avitoItemId, avitoItemUrl, action } = job.data;
  const supabase = createServiceClient();

  let result: { ok: boolean; message: string };
  if (action === "delete") {
    result = await deleteAvitoItem(sessionId, avitoItemUrl);
  } else {
    result = await setAvitoItemActive(sessionId, avitoItemUrl, action === "activate");
  }

  if (!result.ok) {
    // Откатываем оптимистичный статус кеша
    throw new Error(`avito-item-action ${action} failed: ${result.message}`);
  }

  if (action === "delete") {
    await supabase
      .from("avito_items")
      .delete()
      .eq("session_id", sessionId)
      .eq("avito_item_id", Number(avitoItemId));
  } else {
    await supabase
      .from("avito_items")
      .update({
        status: action === "activate" ? "active" : "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId)
      .eq("avito_item_id", Number(avitoItemId));
  }

  console.log(`[avito-item-action] ${action} OK for item ${avitoItemId}`);
}
