/**
 * Создаёт тестовый товар «Тест 13₽» с одним размером One Size, current_quantity=10.
 * Запуск: npx tsx scripts/create-test-product.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data: product, error: prodError } = await supabase
    .from("products")
    .insert({
      name: "Тест 13₽",
      drop_price: 13,
      purchase_price: 10,
      recommended_price: 13,
      is_active: true,
      is_in_stock: true,
      location_city: "Москва",
      photo_urls: [],
    })
    .select("id, name, drop_price")
    .single();

  if (prodError || !product) {
    console.error("Product insert failed:", prodError);
    process.exit(1);
  }

  console.log(`✅ Создан товар: ${product.name} (id=${product.id}, цена=${product.drop_price}₽)`);

  const { data: size, error: sizeError } = await supabase
    .from("product_sizes")
    .insert({
      product_id: product.id,
      size: "One Size",
      initial_quantity: 10,
      current_quantity: 10,
      reserved_quantity: 0,
    })
    .select("id, size, current_quantity")
    .single();

  if (sizeError || !size) {
    console.error("Size insert failed:", sizeError);
    process.exit(1);
  }

  console.log(`✅ Создан размер: ${size.size} (qty=${size.current_quantity})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
