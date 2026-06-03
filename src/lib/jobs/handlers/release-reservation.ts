/**
 * Освобождение резерва размера.
 *
 * Primary trigger: BullMQ delayed job через 5 минут после резервирования
 * (`scheduleReleaseReservation`). Snimaetsya при оформлении заказа в
 * `create_order_atomic` (там DELETE из size_reservations) и при ручной
 * отмене wizard'а через `cancelReleaseReservation`.
 *
 * Safety net: periodic sweep по `expires_at < NOW()` (см. sweep-expired-orders.ts) —
 * подбирает резервы которые BullMQ-job почему-то пропустил (потеря Redis-job,
 * рестарт worker'а в момент истечения и т.п.).
 *
 * Идемпотентно по (product_size_id, session_id): если резерв уже удалён —
 * просто выходим, decrement не делаем.
 */

import { Job } from "bullmq";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ReleaseReservationJobData } from "../queues";

function getServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Чистая функция: удалить резерв и уменьшить reserved_quantity.
 * Вызывается из BullMQ-handler'а и из periodic sweep'а.
 *
 * Принимает либо (productSizeId, sessionId) — тогда находит резерв,
 * либо `reservationId` — для случая когда sweep уже знает id.
 */
export async function releaseReservationCore(
  params:
    | { productSizeId: string; sessionId: string }
    | { reservationId: string; productSizeId: string },
  client?: SupabaseClient
): Promise<{ released: boolean }> {
  const supabase = client ?? getServiceClient();

  let reservationId: string;
  let productSizeId: string;

  if ("reservationId" in params) {
    reservationId = params.reservationId;
    productSizeId = params.productSizeId;
  } else {
    const { data: reservation, error: findError } = await supabase
      .from("size_reservations")
      .select("id")
      .eq("product_size_id", params.productSizeId)
      .eq("session_id", params.sessionId)
      .maybeSingle();

    if (findError) {
      console.error(`[release-reservation] Lookup failed:`, findError);
      throw findError;
    }
    if (!reservation) {
      // Резерв уже снят (заказ оформлен / sweep / повторный вызов) — норм.
      return { released: false };
    }
    reservationId = reservation.id;
    productSizeId = params.productSizeId;
  }

  // Удаляем по id с условием — гарантия что не уроним чужой свежий резерв
  // если sessionId переиспользовался.
  const { error: deleteError, count } = await supabase
    .from("size_reservations")
    .delete({ count: "exact" })
    .eq("id", reservationId);

  if (deleteError) {
    console.error(`[release-reservation] Delete failed for ${reservationId}:`, deleteError);
    throw deleteError;
  }

  if (!count) {
    // Кто-то уже удалил — decrement не делаем, чтобы не уйти в минус.
    return { released: false };
  }

  const { error: updateError } = await supabase.rpc("decrement_reserved_quantity", {
    size_id: productSizeId,
    amount: 1,
  });

  if (updateError) {
    console.error(`[release-reservation] Decrement failed for size ${productSizeId}:`, updateError);
    // Не throw — резерв уже удалён, ретрай только удвоит decrement.
  }

  return { released: true };
}

export async function handleReleaseReservation(job: Job<ReleaseReservationJobData>): Promise<void> {
  const { productSizeId, sessionId } = job.data;
  console.log(`[release-reservation] Processing session ${sessionId}, size ${productSizeId}`);

  const result = await releaseReservationCore({ productSizeId, sessionId });
  if (result.released) {
    console.log(
      `[release-reservation] Released reservation for session ${sessionId}, size ${productSizeId}`
    );
  } else {
    console.log(
      `[release-reservation] Reservation already gone for session ${sessionId} (order placed / swept)`
    );
  }
}
