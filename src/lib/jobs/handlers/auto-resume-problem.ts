/**
 * Обработчик: auto-resume-problem.
 *
 * BUSINESS_LOGIC.md §11.3:
 *   Заказы в `problem` на конкретный SKU+размер автоматически возобновляются
 *   в `collecting` (FIFO по send_by) когда товар снова появляется:
 *     - приходит возврат другого заказа на этот SKU+размер (status=return_done)
 *     - владелец вручную пополняет остаток
 *
 * Job вызывается с productSizeId. По одной единице на job — каждый запуск
 * восстанавливает 1 заказ (тот, у кого минимальный send_by; FIFO).
 *
 * Если problem-заказов нет, или их send_by уже сгорел — ничего не делает.
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { appendStatusHistory } from "@/lib/orders/status-history";
import { notifyShipperOrderResumed } from "@/lib/telegram/notifications";

export interface AutoResumeProblemJobData {
  productSizeId: string;
  /** id восстановленного возврата — если auto-resume триггерится из executeCompleteReturn,
   * передаём чтобы переписать system_comment подсказкой «возврат №N уже на складе». */
  resumedFromReturnOrderId?: string | null;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

export async function handleAutoResumeProblem(job: Job<AutoResumeProblemJobData>): Promise<void> {
  const { productSizeId, resumedFromReturnOrderId } = job.data;
  const supabase = getServiceClient();

  console.log(`[auto-resume-problem] Checking problem-orders for size ${productSizeId}`);

  // FIFO: берём один out_of_stock-заказ в problem с самым ранним send_by.
  // bad_barcode НЕ возобновляем — там ждём новый трек от клиента, отправщик
  // вернёт сам через `undo_problem`.
  const { data: candidate, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, status_history, send_by, product_size_id, claimed_by, linked_return_order_id"
    )
    .eq("product_size_id", productSizeId)
    .eq("status", "problem")
    .eq("problem_type", "out_of_stock")
    .order("send_by", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[auto-resume-problem] Query error:`, error.message);
    return;
  }

  if (!candidate) {
    console.log(`[auto-resume-problem] No problem-orders for size ${productSizeId}`);
    return;
  }

  // Подсказка отправщику в карточке: какой возврат закрыл проблему. После
  // auto-resume оставляем system_comment (но переписываем), чтобы при сборке
  // отправщик видел откуда брать товар. problem_type очищаем — статус уже не
  // problem.
  const sourceReturnId = resumedFromReturnOrderId ?? candidate.linked_return_order_id ?? null;
  let resumeComment = "Размер появился — заказ снова в работе";
  if (sourceReturnId) {
    const { data: sourceReturn } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", sourceReturnId)
      .maybeSingle();
    if (sourceReturn) {
      resumeComment = `Размер взят с возврата заказа №${sourceReturn.order_number}`;
    }
  }

  // Канон §11.1 (2026-05-26, техдолг #3 закрыт): auto-resume возвращает
  // заказ в ОБЩИЙ ПУЛ — статус `paid`, claimed_by/claimed_at сброшены.
  // Любой свободный отправщик увидит в табе «Собрать» и возьмёт через
  // executeStartCollecting. Это устойчивее к недоступности прежнего
  // отправщика (offline / выходной) — заказ не блокируется до сгорания
  // send_by.
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      claimed_by: null,
      claimed_at: null,
      problem_type: null,
      linked_return_order_id: null,
      system_comment: resumeComment,
      status_history: appendStatusHistory(candidate.status_history, "paid", {
        from: "problem",
        reason: "stock_restored",
      }),
    })
    .eq("id", candidate.id)
    .eq("status", "problem");

  if (updateError) {
    console.error(`[auto-resume-problem] Update failed for ${candidate.id}:`, updateError.message);
    throw updateError;
  }

  console.log(
    `[auto-resume-problem] Order #${candidate.order_number} (${candidate.id}) problem → paid (общий пул)`
  );

  // DM прежнему отправщику — информация что его заказ ожил и снова в
  // общем пуле. Если он быстро увидит — возьмёт обратно через
  // executeStartCollecting; иначе кто-то другой возьмёт.
  if (candidate.claimed_by) {
    notifyShipperOrderResumed({
      shipperId: candidate.claimed_by,
      orderNumber: candidate.order_number,
      hint: `${resumeComment} (заказ в общем пуле — успей взять до сгорания срока)`,
    }).catch((e) => console.error(`[auto-resume-problem] notifyShipperOrderResumed failed:`, e));
  }
}
