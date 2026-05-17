/**
 * Обработчик перевода заказа в trash
 *
 * Выполняется через 14 дней после return_arrived,
 * если возврат не был забран
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { MoveToTrashJobData, scheduleDisposeTrash } from "../queues";
import { appendStatusHistory } from "@/lib/orders/status-history";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function handleMoveToTrash(job: Job<MoveToTrashJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[move-to-trash] Processing order ${orderId}`);

  // 1. Получаем заказ с данными клиента
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      id,
      status,
      status_history,
      client_id,
      client_price,
      order_number,
      client:users (
        id,
        is_vibe_plus,
        deposit
      )
    `
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[move-to-trash] Order ${orderId} not found:`, orderError);
    return;
  }

  // 2. Проверяем статус — только return_arrived переходит в trash
  if (order.status !== "return_arrived") {
    console.log(
      `[move-to-trash] Order ${orderId} is in status "${order.status}", skipping (already picked up?)`
    );
    return;
  }

  // 3. Рассчитываем дедлайн для trash (30 дней)
  const trashDeadline = new Date();
  trashDeadline.setDate(trashDeadline.getDate() + 30);

  // 4. Обновляем статус заказа
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "trash",
      trash_at: new Date().toISOString(),
      trash_deadline: trashDeadline.toISOString(),
      status_history: appendStatusHistory(order.status_history, "trash"),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error(`[move-to-trash] Failed to update order ${orderId}:`, updateError);
    throw updateError;
  }

  // 5. Уведомляем клиента
  // Примечание: дополнительный штраф не нужен — деньги уже были списаны при заказе,
  // просто не возвращаем их (возврат происходит только при return_completed)
  // TODO: Интеграция с Telegram ботом
  // await notifyClient(order.client_id, 'return_moved_to_trash', {
  //   orderNumber: order.order_number
  // });

  // 7. Планируем аннулирование через 30 дней
  await scheduleDisposeTrash(orderId);

  console.log(`[move-to-trash] Order ${orderId} moved to trash, disposal scheduled in 30 days`);
}
