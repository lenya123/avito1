#!/usr/bin/env npx tsx
/**
 * Одноразовый скрипт для обработки просроченных заказов
 *
 * Запуск:
 *   npx tsx scripts/process-expired-orders.ts
 *
 * Что делает:
 *   1. Находит все заказы со статусом awaiting_shipment/collecting/problem
 *      у которых delivery_deadline < сегодня
 *   2. Отменяет их с причиной 'auto_expired'
 *   3. Возвращает товар в наличие и средства клиенту
 */

import { config } from "dotenv";
import { resolve } from "path";

// Загружаем .env.local
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function processExpiredOrders() {
  console.log("🔍 Searching for expired orders...\n");

  // Получаем все просроченные заказы
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const { data: expiredOrders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      delivery_deadline,
      client_id,
      client_price,
      is_paid,
      product_size_id
    `)
    .in("status", ["awaiting_shipment", "collecting", "problem"])
    .lt("delivery_deadline", today.toISOString())
    .order("delivery_deadline", { ascending: true });

  if (error) {
    console.error("❌ Failed to fetch orders:", error);
    process.exit(1);
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    console.log("✅ No expired orders found!");
    return;
  }

  console.log(`📋 Found ${expiredOrders.length} expired order(s):\n`);

  for (const order of expiredOrders) {
    const deadline = new Date(order.delivery_deadline);
    const daysOverdue = Math.floor((today.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`   #${order.order_number} | Status: ${order.status} | Deadline: ${deadline.toLocaleDateString("ru-RU")} (${daysOverdue} days overdue)`);
  }

  console.log("\n" + "=".repeat(60) + "\n");

  // Обрабатываем каждый заказ
  let processed = 0;
  let failed = 0;

  for (const order of expiredOrders) {
    process.stdout.write(`Processing #${order.order_number}... `);

    try {
      // Используем RPC функцию для атомарной отмены
      const { data: result, error: rpcError } = await supabase.rpc("cancel_order_auto", {
        order_id: order.id,
        reason: "auto_expired",
      });

      if (rpcError) {
        // Fallback: ручная отмена если RPC не работает
        console.log("(RPC unavailable, using manual cancellation)");

        // 1. Обновляем статус заказа
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "auto_expired",
          })
          .eq("id", order.id);

        if (updateError) throw updateError;

        // 2. Возвращаем количество товара
        if (order.product_size_id) {
          await supabase
            .from("product_sizes")
            .update({ current_quantity: supabase.rpc("increment_product_size_quantity", {
              size_id: order.product_size_id,
              amount: 1
            }) })
            .eq("id", order.product_size_id);

          // Альтернативный подход через raw SQL
          await supabase.rpc("increment_product_size_quantity", {
            size_id: order.product_size_id,
            amount: 1,
          });
        }

        // 3. Возвращаем средства если оплачено
        if (order.is_paid && order.client_price > 0) {
          await supabase.rpc("increment_user_deposit", {
            user_id: order.client_id,
            amount: order.client_price,
          });
        }

        console.log(`✅ Cancelled (manual), refunded ${order.is_paid ? order.client_price + "₽" : "nothing"}`);
      } else {
        const res = result?.[0];
        if (res?.success) {
          console.log(`✅ Cancelled, refunded ${res.refunded_amount || 0}₽`);
        } else {
          console.log(`⚠️ Skipped: ${res?.error_message || "unknown"}`);
        }
      }

      processed++;
    } catch (err) {
      console.log(`❌ Failed: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${expiredOrders.length}`);
}

// Запуск
processExpiredOrders()
  .then(() => {
    console.log("\n👋 Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n🔥 Fatal error:", err);
    process.exit(1);
  });
