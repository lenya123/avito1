/**
 * BullMQ handler: sync-avito-balance
 *
 * Тянет через официальный Avito OAuth:
 *  • баланс/аванс (getBalance) → avito_browser_sessions.ad_balance/real/bonus
 *  • рейтинг (getRatingInfo)   → rating/rating_count
 *  • расход на продвижение (getOperationsHistory за ~8 дней) → агрегируем по
 *    дням в avito_promotion_daily (KPI «ср. расход/день за неделю»).
 *
 * Закрывает пробел: карточки «баланс/аванс» и «расход/день» получают данные.
 * Классификация «продвижение» — эвристика по названию операции (// STUB:
 * выверить таксономию услуг на боевых данных).
 */
import type { Job } from "bullmq";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { shuffle, humanDelay } from "@/lib/avito/human-timing";

// Ключевые слова платных услуг продвижения Avito
const PROMO_KEYWORDS = [
  "продвиж",
  "выделен",
  "поднят",
  "xl",
  "просмотр",
  "реклам",
  "vas",
  "пакет",
  "размещени",
  "услуг",
  "тариф",
  "буст",
  "турбо",
];

function isPromoOperation(name?: string, service?: string): boolean {
  const s = `${name ?? ""} ${service ?? ""}`.toLowerCase();
  return PROMO_KEYWORDS.some((k) => s.includes(k));
}

const mskDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

export async function handleSyncAvitoBalance(job: Job): Promise<void> {
  const userId = (job.data as { userId?: string })?.userId;
  const supabase = createServiceClient();
  const loose = createServiceClientLoose();

  let query = supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index")
    .eq("status", "active");
  if (userId) query = query.eq("user_id", userId);

  const { data: sessions, error } = await query;
  if (error || !sessions?.length) {
    console.log("[sync-avito-balance] no active sessions");
    return;
  }

  const now = new Date();
  const fromIso = new Date(now.getTime() - 8 * 86400_000).toISOString();
  const toIso = now.toISOString();

  for (const session of shuffle(sessions)) {
    await humanDelay(3000, 8000);
    try {
      const client = await createAvitoClientForSession(session.id);
      if (!client) {
        console.log(`[sync-avito-balance] no OAuth creds for session ${session.id}`);
        continue;
      }

      const patch: Record<string, unknown> = {
        balance_synced_at: new Date().toISOString(),
      };

      const balance = await client.getBalance();
      if (balance.success) {
        // Avito accounts/balance: real — кошелёк для размещения/услуг (= аванс),
        // bonus — бонусные рубли.
        patch.ad_balance = balance.data.real;
        patch.balance_real = balance.data.real;
        patch.balance_bonus = balance.data.bonus;
      }

      const rating = await client.getRatingInfo();
      if (rating.success) {
        patch.rating = rating.data.score;
        patch.rating_count = rating.data.total_reviews;
      }

      await loose
        .from("avito_browser_sessions")
        .update(patch)
        .eq("id", session.id);

      // Расход на продвижение по дням
      const ops = await client.getOperationsHistory(fromIso, toIso);
      if (ops.success) {
        const byDay = new Map<string, number>();
        for (const op of ops.data.result?.operations ?? []) {
          if (!isPromoOperation(op.operation_name, op.service_name)) continue;
          const day = mskDate(op.datetime);
          // amount_rub может быть отрицательным (списание) — берём модуль
          const spent = Math.abs(Number(op.amount_rub) || 0);
          if (spent > 0) byDay.set(day, (byDay.get(day) ?? 0) + spent);
        }
        for (const [date, amount] of byDay) {
          await loose.from("avito_promotion_daily").upsert(
            {
              user_id: session.user_id,
              session_id: session.id,
              date,
              amount: Math.round(amount * 100) / 100,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "session_id,date" }
          );
        }
        console.log(
          `[sync-avito-balance] session ${session.id}: balance+rating updated, ` +
            `${byDay.size} promo-day(s)`
        );
      }
    } catch (e) {
      console.error(`[sync-avito-balance] error for session ${session.id}:`, e);
    }
  }
}
