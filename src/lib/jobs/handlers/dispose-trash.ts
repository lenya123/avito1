/**
 * Обработчик аннулирования заказа из trash
 *
 * Выполняется через 30 дней после перехода в trash,
 * если заказ не был восстановлен
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { DisposeTrashJobData } from "../queues";
import { appendStatusHistory } from "@/lib/orders/status-history";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function handleDisposeTrash(job: Job<DisposeTrashJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[dispose-trash] Processing order ${orderId}`);

  // 1. Получаем заказ
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, status_history, client_id, order_number")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[dispose-trash] Order ${orderId} not found:`, orderError);
    return;
  }

  // 2. Проверяем статус — только trash аннулируется
  if (order.status !== "trash") {
    console.log(
      `[dispose-trash] Order ${orderId} is in status "${order.status}", skipping (restored?)`
    );
    return;
  }

  // 3. Обновляем статус на disposed
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "disposed",
      disposed_at: new Date().toISOString(),
      status_history: appendStatusHistory(order.status_history, "disposed"),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error(`[dispose-trash] Failed to dispose order ${orderId}:`, updateError);
    throw updateError;
  }

  // 4. Уведомляем клиента
  // TODO: Интеграция с Telegram ботом
  // await notifyClient(order.client_id, 'return_disposed', {
  //   orderNumber: order.order_number
  // });

  console.log(`[dispose-trash] Order ${orderId} disposed`);
}
