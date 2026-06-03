/**
 * Одноразовая утилита: показать все живые pending_orders + по запросу
 * отменить через cancel_pending_order_atomic. Используется когда после
 * рефакторинга остались висячие pending'и от старой модели.
 *
 * Использование:
 *   npx tsx scripts/cancel-stuck-pending.ts            — показать список
 *   npx tsx scripts/cancel-stuck-pending.ts <N> ...    — отменить заказы №N
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const argNumbers = process.argv
    .slice(2)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  const { data: pendings, error } = await supabase
    .from("pending_orders")
    .select(
      "id, order_number, customer_id, partner_id, source_kind, source_warehouse, client_price, applied_balance, receipt_received_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load pending_orders:", error);
    process.exit(1);
  }

  console.log(`\n📋 Живых pending'ов: ${pendings?.length ?? 0}\n`);
  for (const p of pendings ?? []) {
    const ageMin = Math.round((Date.now() - new Date(p.created_at).getTime()) / 60000);
    const stage = p.receipt_received_at ? "чек на проверке" : "ждём чек";
    console.log(
      `№${p.order_number}  ${p.client_price}₽  source=${p.source_kind}/${p.source_warehouse}  ${stage}  ${ageMin}мин назад  id=${p.id}`
    );
  }

  if (argNumbers.length === 0) {
    console.log(
      `\nЧтобы отменить — добавь номера через пробел: npx tsx scripts/cancel-stuck-pending.ts 262 263`
    );
    return;
  }

  console.log(`\n🗑  Отменяю заказы: ${argNumbers.join(", ")}`);
  for (const orderNumber of argNumbers) {
    const target = pendings?.find((p) => p.order_number === orderNumber);
    if (!target) {
      console.log(`  №${orderNumber}: не найден среди живых pending'ов — пропуск`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: cancelErr } = await (supabase.rpc as any)("cancel_pending_order_atomic", {
      p_pending_order_id: target.id,
    });
    if (cancelErr) {
      console.error(`  №${orderNumber}: ошибка cancel —`, cancelErr.message);
    } else {
      console.log(`  №${orderNumber}: отменён ✅`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
