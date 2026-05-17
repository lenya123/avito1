import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Маппинг уровня на количество заказов (для демо прогресса)
const LEVEL_ORDERS = {
  0: 5,   // ~33% до уровня 1
  1: 22,  // ~47% до уровня 2
  2: 40,  // ~50% до уровня 3
  3: 55,  // максимум
};

async function updateTestOrders() {
  console.log("🔄 Обновляем total_completed_orders для тестовых пользователей...\n");

  for (const [level, orders] of Object.entries(LEVEL_ORDERS)) {
    const { data, error } = await supabase
      .from("users")
      .update({ total_completed_orders: orders })
      .eq("level", parseInt(level))
      .eq("role", "client")
      .select("name, level, total_completed_orders");

    if (error) {
      console.error(`❌ Ошибка для уровня ${level}:`, error.message);
    } else if (data && data.length > 0) {
      data.forEach(user => {
        console.log(`✓ ${user.name}: level=${user.level}, orders=${user.total_completed_orders}`);
      });
    } else {
      console.log(`⚠️ Нет пользователей с уровнем ${level}`);
    }
  }

  console.log("\n✅ Готово!");
}

updateTestOrders().catch(console.error);
