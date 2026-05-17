/**
 * Обработчик автоотмены заказа по дедлайну
 *
 * Использует атомарный RPC cancel_order_auto, который:
 * 1. Блокирует заказ (FOR UPDATE)
 * 2. Проверяет статус (только awaiting_shipment, collecting, problem)
 * 3. Обновляет статус → cancelled + status_history
 * 4. Восстанавливает количество (sizes или products)
 * 5. Возвращает депозит если оплачен
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { ExpireOrderJobData } from "../queues";

// Создаём Supabase client с service role для обхода RLS
function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function handleExpireOrder(job: Job<ExpireOrderJobData>): Promise<void> {
  const { orderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[expire-order] Processing order ${orderId}`);

  // Используем атомарный RPC — он делает FOR UPDATE lock и все операции в одной транзакции
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("cancel_order_auto", {
    order_id: orderId,
    reason: "auto_expired",
  });

  if (error) {
    console.error(`[expire-order] RPC error for order ${orderId}:`, error);
    throw error; // Повторить попытку через BullMQ
  }

  const result = data?.[0];

  if (!result) {
    console.error(`[expire-order] No result from RPC for order ${orderId}`);
    return;
  }

  if (!result.success) {
    // Заказ в неподходящем статусе — не ошибка, просто скипаем
    console.log(`[expire-order] Skipped order ${orderId}: ${result.error_message}`);
    return;
  }

  console.log(`[expire-order] Order ${orderId} cancelled. Refunded: ${result.refunded_amount}₽`);
}
