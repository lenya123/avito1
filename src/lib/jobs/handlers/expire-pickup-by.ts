/**
 * Обработчик: pickup_by сгорел → возврат → trash.
 *
 * BUSINESS_LOGIC.md §6.5:
 *   1. Заказ → trash.
 *   2. Определяется fault_party + fault_reason (см. handlers/move-to-trash.ts).
 *   3. Деньги клиенту НЕ возвращаются авто.
 *   4. Уведомления клиенту/владельцу/отправщику.
 *
 * Триггер: запланирован при оформлении возврата на конец дня pickup_by (23:59:59 МСК).
 * Если статус уже return_done / cancelled — job ничего не делает.
 *
 * Делегирует UPDATE → trash в `move-to-trash` handler (общая логика fault).
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { handleMoveToTrash } from "./move-to-trash";
import { moscowEndOfDay } from "@/lib/utils/moscow-time";

export interface ExpirePickupByJobData {
  orderId: string;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function handleExpirePickupBy(job: Job<ExpirePickupByJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[expire-pickup-by] Processing order ${orderId}`);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, pickup_by")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error(`[expire-pickup-by] Order ${orderId} not found:`, error);
    return;
  }

  if (order.status !== "return") {
    console.log(`[expire-pickup-by] Order ${orderId} status="${order.status}" — skipping`);
    return;
  }

  // Защита от ранних запусков.
  if (order.pickup_by && Date.now() < moscowEndOfDay(order.pickup_by).getTime()) {
    console.log(`[expire-pickup-by] Order ${orderId} pickup_by not yet reached, skipping`);
    return;
  }

  // Делегируем общему handler'у move-to-trash — он считает fault и обновляет статус.
  await handleMoveToTrash(job as unknown as Job<{ orderId: string }>);
}
