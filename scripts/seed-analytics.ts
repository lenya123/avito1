import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DELIVERY_SERVICES = ["avito", "yandex", "cdek", "pochta", "5post"] as const;
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedAnalytics() {
  console.log("📊 Создаю тестовые данные для аналитики...\n");

  // 1. Найти тестового пользователя
  const testSiteKey = "a".repeat(64);
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("site_key", testSiteKey)
    .single();

  if (!user) {
    console.error("❌ Тестовый пользователь не найден. Сначала запусти: npx tsx scripts/seed.ts");
    return;
  }

  console.log(`✓ Пользователь найден: ${user.id}`);

  // 2. Получить товары через product_sizes (гарантируем наличие размеров)
  const { data: allSizes } = await supabase
    .from("product_sizes")
    .select(
      "id, product_id, size, products(id, name, purchase_price, drop_price, recommended_price)"
    )
    .limit(200);

  if (!allSizes || allSizes.length === 0) {
    console.error("❌ Размеры не найдены. Сначала запусти: npx tsx scripts/seed.ts");
    return;
  }

  // Группируем размеры по товару и собираем уникальные товары
  const sizesByProduct = new Map<string, Array<{ id: string; size: string }>>();
  const productMap = new Map<
    string,
    {
      id: string;
      name: string;
      purchase_price: number;
      drop_price: number;
      recommended_price: number;
    }
  >();

  for (const s of allSizes) {
    const product = s.products as unknown as {
      id: string;
      name: string;
      purchase_price: number;
      drop_price: number;
      recommended_price: number;
    } | null;
    if (!product) continue;

    if (!sizesByProduct.has(product.id)) {
      sizesByProduct.set(product.id, []);
      productMap.set(product.id, product);
    }
    sizesByProduct.get(product.id)!.push({ id: s.id, size: s.size });
  }

  const productsWithSizes = Array.from(productMap.values()).slice(0, 10);

  if (productsWithSizes.length === 0) {
    console.error("❌ Нет товаров с размерами. Сначала запусти: npx tsx scripts/seed.ts");
    return;
  }

  console.log(`✓ Найдено ${productsWithSizes.length} товаров с размерами`);

  // 3. Удалить старые тестовые заказы
  const { count: deletedCount } = await supabase
    .from("orders")
    .delete({ count: "exact" })
    .eq("client_id", user.id);

  console.log(`✓ Удалено ${deletedCount || 0} старых заказов`);

  // 4. Создать заказы с разными статусами и параметрами

  const orders: Array<Record<string, unknown>> = [];
  let completedCount = 0;

  // --- Completed orders (25 шт) — основа для прибыли и метрик ---
  for (let i = 0; i < 25; i++) {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);
    const deliveryService = randomItem([...DELIVERY_SERVICES]);
    const createdDaysAgo = randomBetween(3, 60);
    const shippedDaysAgo = Math.max(1, createdDaysAgo - randomBetween(1, 3));
    const completedDaysAgo = Math.max(0, shippedDaysAgo - randomBetween(2, 8));

    // Цена клиента = drop_price с небольшой скидкой
    const clientPrice = Math.round((product.drop_price || 1500) * 0.97);
    // Цена продажи = recommended * 0.85-1.05 (иногда меньше, иногда больше)
    const salePrice = Math.round(
      (product.recommended_price || 3000) * (0.85 + Math.random() * 0.2)
    );

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: clientPrice,
      purchase_price: product.purchase_price,
      sale_price: salePrice,
      delivery_service: deliveryService,
      tracking_number: `TEST${String(i + 1).padStart(6, "0")}`,
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(completedDaysAgo - 3),
      status: "completed",
      is_paid: true,
      paid_at: daysAgo(createdDaysAgo),
      payment_method: "deposit",
      created_at: daysAgo(createdDaysAgo),
      shipped_at: daysAgo(shippedDaysAgo),
      completed_at: daysAgo(completedDaysAgo),
    });
    completedCount++;
  }

  // --- In-transit orders (5 шт) — активные ---
  for (let i = 0; i < 5; i++) {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);
    const deliveryService = randomItem([...DELIVERY_SERVICES]);
    const createdDaysAgo = randomBetween(1, 7);

    const clientPrice = Math.round((product.drop_price || 1500) * 0.97);

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: clientPrice,
      purchase_price: product.purchase_price,
      delivery_service: deliveryService,
      tracking_number: `TRANSIT${String(i + 1).padStart(4, "0")}`,
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(-randomBetween(3, 10)), // в будущем
      status: "in_transit",
      is_paid: true,
      paid_at: daysAgo(createdDaysAgo),
      payment_method: "deposit",
      created_at: daysAgo(createdDaysAgo),
      shipped_at: daysAgo(createdDaysAgo - 1),
    });
  }

  // --- Awaiting shipment (3 шт) ---
  for (let i = 0; i < 3; i++) {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);
    const deliveryService = randomItem([...DELIVERY_SERVICES]);

    const clientPrice = Math.round((product.drop_price || 1500) * 0.97);

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: clientPrice,
      purchase_price: product.purchase_price,
      delivery_service: deliveryService,
      tracking_number: `WAIT${String(i + 1).padStart(4, "0")}`,
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(-randomBetween(5, 14)),
      status: "awaiting_shipment",
      is_paid: true,
      paid_at: daysAgo(randomBetween(0, 2)),
      payment_method: "deposit",
      created_at: daysAgo(randomBetween(0, 2)),
    });
  }

  // --- Return completed (3 шт) — для метрик возвратов ---
  for (let i = 0; i < 3; i++) {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);
    const createdDaysAgo = randomBetween(10, 40);

    const clientPrice = Math.round((product.drop_price || 1500) * 0.97);

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: clientPrice,
      purchase_price: product.purchase_price,
      delivery_service: "pochta", // Почта для контраста
      tracking_number: `RET${String(i + 1).padStart(4, "0")}`,
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(createdDaysAgo - 5),
      status: "return_completed",
      is_paid: true,
      paid_at: daysAgo(createdDaysAgo),
      payment_method: "deposit",
      created_at: daysAgo(createdDaysAgo),
      shipped_at: daysAgo(createdDaysAgo - 2),
      completed_at: daysAgo(createdDaysAgo - 7),
    });
  }

  // --- Cancelled (4 шт) ---
  for (let i = 0; i < 4; i++) {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);
    const createdDaysAgo = randomBetween(5, 30);

    const clientPrice = Math.round((product.drop_price || 1500) * 0.97);

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: clientPrice,
      purchase_price: product.purchase_price,
      delivery_service: randomItem([...DELIVERY_SERVICES]),
      tracking_number: `CANC${String(i + 1).padStart(4, "0")}`,
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(createdDaysAgo - 5),
      status: "cancelled",
      is_paid: true,
      paid_at: daysAgo(createdDaysAgo),
      payment_method: "deposit",
      created_at: daysAgo(createdDaysAgo),
      cancelled_at: daysAgo(createdDaysAgo - 1),
    });
  }

  // --- Problem (1 шт) ---
  {
    const product = randomItem(productsWithSizes);
    const sizes = sizesByProduct.get(product.id)!;
    const size = randomItem(sizes);

    orders.push({
      client_id: user.id,
      product_id: product.id,
      product_size_id: size.id,
      size: size.size,
      client_price: Math.round((product.drop_price || 1500) * 0.97),
      purchase_price: product.purchase_price,
      delivery_service: "pochta",
      tracking_number: "PROB0001",
      barcode_image_url: "https://placehold.co/200x100?text=BARCODE",
      delivery_deadline: daysAgo(5), // просрочен!
      status: "problem",
      is_paid: true,
      paid_at: daysAgo(15),
      payment_method: "deposit",
      created_at: daysAgo(15),
      shipped_at: daysAgo(13),
      system_comment: "Посылка повреждена",
    });
  }

  // 5. Вставить все заказы
  const { error: insertError } = await supabase.from("orders").insert(orders);

  if (insertError) {
    console.error("❌ Ошибка создания заказов:", insertError);
    return;
  }

  console.log(`✓ Создано ${orders.length} заказов:`);
  console.log(`   - Завершённых: 25`);
  console.log(`   - В пути: 5`);
  console.log(`   - Ожидает отправки: 3`);
  console.log(`   - Возвратов: 3`);
  console.log(`   - Отменённых: 4`);
  console.log(`   - Проблемных: 1`);

  // 6. Обновить пользователя
  const { error: updateError } = await supabase
    .from("users")
    .update({
      total_completed_orders: completedCount,
      level: 1, // 15+ заказов
      discount_percent: 3,
      deposit: 12400,
      referral_deposit: 2800,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("❌ Ошибка обновления пользователя:", updateError);
  } else {
    console.log("\n✓ Обновлён пользователь:");
    console.log(`   - Завершённых заказов: ${completedCount}`);
    console.log(`   - Уровень: 1 (Продавец)`);
    console.log(`   - Депозит: 12 400 ₽`);
    console.log(`   - Реф. баланс: 2 800 ₽`);
  }

  console.log("\n✅ Данные для аналитики готовы!");
  console.log("\n📝 Войди на сайт:");
  console.log(`   Site Key: ${"a".repeat(64)}`);
  console.log("   URL: http://localhost:3000/auth/login");
  console.log("\n📊 Затем перейди:");
  console.log("   /stats → кнопка «Подробная аналитика» → /stats/analytics");
}

seedAnalytics().catch(console.error);
