/**
 * Обработчик освобождения резерва размера
 *
 * Выполняется через 15 минут после резервирования,
 * если заказ не был оформлен
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { ReleaseReservationJobData } from "../queues";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

export async function handleReleaseReservation(job: Job<ReleaseReservationJobData>): Promise<void> {
  const { productSizeId, sessionId } = job.data;
  const supabase = getServiceClient();

  console.log(`[release-reservation] Processing session ${sessionId}, size ${productSizeId}`);

  // 1. Проверяем существование резерва
  const { data: reservation, error: findError } = await supabase
    .from("size_reservations")
    .select("id")
    .eq("product_size_id", productSizeId)
    .eq("session_id", sessionId)
    .single();

  if (findError || !reservation) {
    console.log(
      `[release-reservation] Reservation not found for session ${sessionId} (order placed?)`
    );
    return;
  }

  // 2. Удаляем резерв
  const { error: deleteError } = await supabase
    .from("size_reservations")
    .delete()
    .eq("id", reservation.id);

  if (deleteError) {
    console.error(`[release-reservation] Failed to delete reservation:`, deleteError);
    throw deleteError;
  }

  // 3. Уменьшаем reserved_quantity
  const { error: updateError } = await supabase.rpc("decrement_reserved_quantity", {
    size_id: productSizeId,
    amount: 1,
  });

  if (updateError) {
    console.error(`[release-reservation] Failed to decrement reserved_quantity:`, updateError);
    // Не критично — резерв уже удалён
  }

  console.log(
    `[release-reservation] Released reservation for session ${sessionId}, size ${productSizeId}`
  );
}
