/**
 * Обработчик деактивации реферального периода
 *
 * - deactivate-referral: Деактивация реферального периода через 60 дней
 *
 * Выплаты 500₽ и 7% происходят мгновенно при завершении заказа реферала
 * (см. processReferralBonus в /api/orders/[id]/route.ts)
 */

import { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { DeactivateReferralJobData } from "../queues";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, serviceKey);
}

/**
 * Деактивация реферального периода
 * Выполняется через 60 дней после регистрации реферала
 * После деактивации новые заказы реферала больше не приносят бонусы
 */
export async function handleDeactivateReferral(job: Job<DeactivateReferralJobData>): Promise<void> {
  const { bonusId } = job.data;
  const supabase = getServiceClient();

  console.log(`[deactivate-referral] Processing bonus ${bonusId}`);

  // 1. Получаем запись о бонусе
  const { data: bonus, error: findError } = await supabase
    .from("referral_bonuses")
    .select("id, is_active, referrer_id, referral_id, first_order_bonus_paid, percent_bonus")
    .eq("id", bonusId)
    .single();

  if (findError || !bonus) {
    console.error(`[deactivate-referral] Bonus record not found:`, findError);
    return;
  }

  // 2. Проверяем, активен ли ещё
  if (!bonus.is_active) {
    console.log(`[deactivate-referral] Bonus already deactivated`);
    return;
  }

  // 3. Деактивируем
  const { error: updateError } = await supabase
    .from("referral_bonuses")
    .update({ is_active: false })
    .eq("id", bonusId);

  if (updateError) {
    console.error(`[deactivate-referral] Failed to deactivate:`, updateError);
    throw updateError;
  }

  const percentBonus = Number(bonus.percent_bonus) || 0;
  const firstPaid = bonus.first_order_bonus_paid ? "yes" : "no";

  // TODO: Уведомить реферера в Telegram о завершении реферального периода

  console.log(
    `[deactivate-referral] Deactivated referral period for bonus ${bonusId}. First order bonus paid: ${firstPaid}, percent bonus earned: ${percentBonus}₽`
  );
}
