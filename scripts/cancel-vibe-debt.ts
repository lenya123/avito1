/**
 * Одноразовая утилита: отменить все +ВАЙБ-долговые заказы клиента.
 * Используется для очистки тестовых долгов перед прогоном сценариев.
 *
 * Cancel = UPDATE status='cancelled'. Триггеры пересчитывают сток и
 * customer_vibe_debt; check_vibe_credit_freeze может разморозить клиента.
 *
 *   npx tsx scripts/cancel-vibe-debt.ts <telegram_username>
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const username = process.argv[2]?.replace(/^@/, "");
  if (!username) {
    console.error("Использование: npx tsx scripts/cancel-vibe-debt.ts <telegram_username>");
    process.exit(1);
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, telegram_username, customer_balance, vibe_enabled, is_frozen, frozen_reason")
    .eq("telegram_username", username)
    .maybeSingle();

  if (!customer) {
    console.error(`Клиент @${username} не найден.`);
    process.exit(1);
  }

  console.log(`\n👤 ${customer.name ?? "—"} (@${customer.telegram_username})`);
  console.log(
    `   balance=${customer.customer_balance}, vibe=${customer.vibe_enabled}, frozen=${customer.is_frozen}/${customer.frozen_reason ?? "—"}`
  );

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_price, status, is_paid, payment_method, source_kind, partner_id"
    )
    .eq("customer_id", customer.id)
    .eq("is_paid", false)
    .eq("payment_method", "deposit")
    .not("status", "in", "(cancelled,trash,return_done)");

  if (!orders || orders.length === 0) {
    console.log(`\n✅ Открытых +ВАЙБ-долгов нет.`);
    return;
  }

  console.log(`\n📋 Открытых +ВАЙБ-долговых заказов: ${orders.length}`);
  for (const o of orders) {
    console.log(
      `   №${o.order_number}  ${o.client_price}₽  status=${o.status}  source=${o.source_kind}${o.partner_id ? "/partner" : "/owner"}`
    );
  }

  console.log(`\n🗑  Отменяю все...`);
  for (const o of orders) {
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "test_cleanup",
      })
      .eq("id", o.id);
    if (error) {
      console.error(`   №${o.order_number}: ошибка —`, error.message);
    } else {
      console.log(`   №${o.order_number}: отменён ✅`);
    }
  }

  // Перечитываем клиента, чтобы увидеть состояние после триггеров.
  const { data: after } = await supabase
    .from("customers")
    .select("is_frozen, frozen_reason, required_payment_amount, frozen_debt_snapshot")
    .eq("id", customer.id)
    .single();
  console.log(`\n👤 После очистки:`);
  console.log(
    `   frozen=${after?.is_frozen}, reason=${after?.frozen_reason ?? "—"}, ` +
      `required=${after?.required_payment_amount ?? "—"}, snapshot=${after?.frozen_debt_snapshot ?? "—"}`
  );

  const { data: debt } = await supabase
    .from("customer_vibe_debt")
    .select("debt")
    .eq("customer_id", customer.id)
    .maybeSingle();
  console.log(`   долг = ${debt?.debt ?? 0} ₽`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
