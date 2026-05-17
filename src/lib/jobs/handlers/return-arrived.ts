/**
 * Обработчик перехода возврата в return_arrived
 *
 * Выполняется в expected_return_date — дату,
 * которую клиент указал при создании возврата.
 *
 * Graceful: если tracking-polling уже перевёл заказ
 * в return_arrived — пропускаем (дубль).
 *
 * Таймер утиля: 14 дней для ВСЕХ служб.
 * Для API-заказов это страховка — если трекинг определит expired раньше,
 * он переведёт в trash. Таймер отработает по пустому (статус уже не return_arrived).
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { ReturnArrivedJobData, scheduleMoveToTrash } from "../queues";
import { appendStatusHistory } from "@/lib/orders/status-history";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function handleReturnArrived(job: Job<ReturnArrivedJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[return-arrived] Processing order ${orderId}`);

  // 1. Получаем заказ
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, status_history, client_id, order_number, delivery_service")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[return-arrived] Order ${orderId} not found:`, orderError);
    return;
  }

  // 2. Graceful dedup: если трекинг уже перевёл в return_arrived — пропускаем
  if (order.status === "return_arrived") {
    console.log(
      `[return-arrived] Order ${orderId} already in return_arrived (tracking got there first), skipping`
    );
    return;
  }

  // 3. Проверяем статус — только return_in_transit переходит в return_arrived
  if (order.status !== "return_in_transit") {
    console.log(`[return-arrived] Order ${orderId} is in status "${order.status}", skipping`);
    return;
  }

  // 4. Обновляем статус на return_arrived
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "return_arrived",
      return_arrived_at: new Date().toISOString(),
      status_history: appendStatusHistory(order.status_history, "return_arrived"),
    })
    .eq("id", orderId);

  if (updateError) {
    console.error(`[return-arrived] Failed to update order ${orderId}:`, updateError);
    throw updateError;
  }

  // 5. Таймер утиля — 14 дней для всех служб (страховка)
  const trashDelayDays = 14;
  await scheduleMoveToTrash(orderId, trashDelayDays);

  // Сохраняем дедлайн утиля в БД
  const trashDeadline = new Date();
  trashDeadline.setDate(trashDeadline.getDate() + trashDelayDays);
  await supabase
    .from("orders")
    .update({ trash_deadline: trashDeadline.toISOString() })
    .eq("id", orderId);

  console.log(
    `[return-arrived] Order ${orderId} moved to return_arrived, trash scheduled in ${trashDelayDays} days`
  );
}
