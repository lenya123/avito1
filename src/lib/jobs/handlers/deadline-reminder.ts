/**
 * Обработчик напоминания о дедлайне
 *
 * Отправляет уведомление клиенту за 1 день до дедлайна
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { DeadlineReminderJobData } from "../queues";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

// Статусы, при которых отправляем напоминание
const REMINDER_STATUSES = ["awaiting_shipment", "collecting", "problem"];

export async function handleDeadlineReminder(job: Job<DeadlineReminderJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[deadline-reminder] Processing order ${orderId}`);

  // 1. Получаем заказ с данными клиента и товара
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `
      id,
      status,
      client_id,
      order_number,
      delivery_deadline,
      product:products (
        id,
        name
      ),
      client:users (
        id,
        telegram_id,
        first_name
      )
    `
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[deadline-reminder] Order ${orderId} not found:`, orderError);
    return;
  }

  // 2. Проверяем статус — если уже отправлен/отменён, не напоминаем
  if (!REMINDER_STATUSES.includes(order.status)) {
    console.log(
      `[deadline-reminder] Order ${orderId} is in status "${order.status}", skipping reminder`
    );
    return;
  }

  // 3. Отправляем уведомление
  // TODO: Интеграция с Telegram ботом
  // await notifyClient(order.client_id, 'deadline_reminder', {
  //   orderNumber: order.order_number,
  //   productName: order.product?.name,
  //   deadline: order.delivery_deadline
  // });

  console.log(
    `[deadline-reminder] Reminder sent for order ${orderId} (deadline: ${order.delivery_deadline})`
  );

  // Пока логируем для отладки
  if (order.client && "telegram_id" in order.client) {
    console.log(`[deadline-reminder] Would notify Telegram user ${order.client.telegram_id}`);
  }
}
