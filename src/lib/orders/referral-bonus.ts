import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Обработка реферальных бонусов при завершении заказа.
 * Вызывается из:
 * - PATCH /api/orders/[id] (ручное завершение кнопкой)
 * - tracking-polling (автоматическое завершение по трекингу)
 *
 * Идемпотентна: first_order_bonus_paid предотвращает двойную выплату.
 */
export async function processReferralBonus(
  supabase: SupabaseClient,
  clientId: string,
  orderPrice: number
): Promise<void> {
  // 1. Проверяем, есть ли активная реферальная запись для этого клиента
  const { data: bonus } = await supabase
    .from("referral_bonuses")
    .select("*")
    .eq("referral_id", clientId)
    .eq("is_active", true)
    .single();

  if (!bonus) return;

  // 2. Бонус 500₽ за первый успешный заказ — сразу на referral_deposit
  if (!bonus.first_order_bonus_paid) {
    const firstBonus = bonus.first_order_bonus || 500;

    const { error: depositError } = await supabase.rpc("increment_referral_deposit", {
      user_id: bonus.referrer_id,
      amount: firstBonus,
    });

    if (depositError) {
      console.error("[Referral] Failed to credit first order bonus:", depositError);
    } else {
      await supabase
        .from("referral_bonuses")
        .update({
          first_order_bonus_paid: true,
          first_order_bonus_unlocked_at: new Date().toISOString(),
        })
        .eq("id", bonus.id);

      console.log(
        `[Referral] Credited ${firstBonus}₽ first order bonus to referrer ${bonus.referrer_id}`
      );
    }
  }

  // 3. Процентный бонус 7% — сразу на referral_deposit (макс 7000₽ суммарно)
  const currentPercent = bonus.percent_bonus || 0;
  const cap = bonus.percent_bonus_cap || 7000;

  if (currentPercent < cap) {
    const { data: settings } = await supabase.from("settings").select("referral_percent").single();
    const percent = settings?.referral_percent ?? 7;
    const rawBonus = Math.round(orderPrice * (percent / 100));
    const bonusAmount = Math.min(rawBonus, cap - currentPercent);

    if (bonusAmount > 0) {
      // Сразу зачисляем на referral_deposit
      const { error: depositError } = await supabase.rpc("increment_referral_deposit", {
        user_id: bonus.referrer_id,
        amount: bonusAmount,
      });

      if (depositError) {
        console.error("[Referral] Failed to credit percent bonus:", depositError);
      } else {
        await supabase
          .from("referral_bonuses")
          .update({
            referral_orders_count: (bonus.referral_orders_count || 0) + 1,
            referral_orders_sum: (bonus.referral_orders_sum || 0) + orderPrice,
            percent_bonus: currentPercent + bonusAmount,
          })
          .eq("id", bonus.id);

        console.log(`[Referral] Credited ${bonusAmount}₽ (7%) to referrer ${bonus.referrer_id}`);
      }
    }
  }
}
