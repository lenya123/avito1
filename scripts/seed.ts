import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log("🌱 Начинаю заполнение тестовыми данными...\n");

  // 1. Создаём тестового клиента
  const testSiteKey = "a".repeat(64); // 64 символа для простоты

  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("site_key", testSiteKey)
    .single();

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
    console.log("✓ Тестовый пользователь уже существует");
  } else {
    const { data: newUser, error: userError } = await supabase
      .from("users")
      .insert({
        role: "client",
        telegram_id: 123456789,
        telegram_username: "test_user",
        name: "Тестовый Клиент",
        site_key: testSiteKey,
        is_vibe_plus: false,
        deposit: 5000,
        referral_deposit: 500,
        subscription_tier: "premium",
        subscription_start: new Date().toISOString().split("T")[0],
        subscription_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        level: 1,
        total_completed_orders: 20,
        discount_percent: 3,
        referral_code: "TEST123",
        is_onboarding_completed: true,
      })
      .select("id")
      .single();

    if (userError) {
      console.error("❌ Ошибка создания пользователя:", userError);
      return;
    }
    userId = newUser!.id;
    console.log("✓ Создан тестовый пользователь");
  }

  // 2. Создаём товары (много для теста infinite scroll)
  const baseProducts = [
    {
      name: "Футболка Nike Dri-FIT",
      description: "Классическая футболка с технологией отвода влаги. Идеально подходит для тренировок и повседневной носки.",
      category: "Футболки",
      brand: "Nike",
      purchase_price: 800,
      drop_price: 1500,
      recommended_price: 2500,
      photo_urls: [
        "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500",
        "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
      measurements: {
        S: { chest: 48, length: 68 },
        M: { chest: 52, length: 70 },
        L: { chest: 56, length: 72 },
        XL: { chest: 60, length: 74 },
      },
    },
    {
      name: "Худи Adidas Originals",
      description: "Теплое худи с классическим логотипом. Мягкий флис внутри.",
      category: "Худи",
      brand: "Adidas",
      purchase_price: 1500,
      drop_price: 2800,
      recommended_price: 4500,
      photo_urls: [
        "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
      measurements: {
        M: { chest: 54, length: 66 },
        L: { chest: 58, length: 68 },
        XL: { chest: 62, length: 70 },
      },
    },
    {
      name: "Джинсы Levi's 501",
      description: "Легендарные джинсы классического прямого кроя.",
      category: "Джинсы",
      brand: "Levi's",
      purchase_price: 2000,
      drop_price: 3500,
      recommended_price: 5500,
      photo_urls: [
        "https://images.unsplash.com/photo-1542272604-787c3835535d?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
      measurements: {
        "30": { waist: 76, length: 102 },
        "32": { waist: 81, length: 102 },
        "34": { waist: 86, length: 102 },
      },
    },
    {
      name: "Кроссовки New Balance 574",
      description: "Культовые кроссовки с отличной амортизацией.",
      category: "Обувь",
      brand: "New Balance",
      purchase_price: 3000,
      drop_price: 5500,
      recommended_price: 8000,
      photo_urls: [
        "https://images.unsplash.com/photo-1539185441755-769473a23570?w=500",
      ],
      is_premium: true,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Куртка The North Face",
      description: "Водонепроницаемая куртка для активного отдыха.",
      category: "Куртки",
      brand: "The North Face",
      purchase_price: 5000,
      drop_price: 9000,
      recommended_price: 14000,
      photo_urls: [
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500",
      ],
      is_premium: true,
      is_active: true,
      is_in_stock: false,
      expected_arrival_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    {
      name: "Поло Ralph Lauren",
      description: "Классическое поло из 100% хлопка с вышитым логотипом.",
      category: "Поло",
      brand: "Ralph Lauren",
      purchase_price: 1200,
      drop_price: 2200,
      recommended_price: 3500,
      photo_urls: [
        "https://www.careofcarl.nl/bilder/artiklar/zoom/30336611r_1.jpg?m=1764329612",
        "https://www.careofcarl.de/bilder/artiklar/zoom/30336611r_2.jpg?m=1764329481",
        "https://www.careofcarl.de/bilder/artiklar/zoom/30336611r_3.jpg?m=1764329481",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
      measurements: {
        S: { chest: 50, length: 70, shoulders: 42 },
        M: { chest: 54, length: 72, shoulders: 44 },
        L: { chest: 58, length: 74, shoulders: 46 },
        XL: { chest: 62, length: 76, shoulders: 48 },
      },
    },
    {
      name: "Свитшот Champion",
      description: "Классический свитшот из плотного хлопка с вышивкой.",
      category: "Свитшоты",
      brand: "Champion",
      purchase_price: 1100,
      drop_price: 2100,
      recommended_price: 3200,
      photo_urls: [
        "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Футболка Puma Essentials",
      description: "Базовая футболка для спорта и отдыха.",
      category: "Футболки",
      brand: "Puma",
      purchase_price: 600,
      drop_price: 1200,
      recommended_price: 1800,
      photo_urls: [
        "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Шорты Nike Sportswear",
      description: "Удобные шорты для тренировок.",
      category: "Шорты",
      brand: "Nike",
      purchase_price: 900,
      drop_price: 1800,
      recommended_price: 2800,
      photo_urls: [
        "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Кроссовки Adidas Ultraboost",
      description: "Премиальные беговые кроссовки с технологией Boost.",
      category: "Обувь",
      brand: "Adidas",
      purchase_price: 4500,
      drop_price: 8000,
      recommended_price: 12000,
      photo_urls: [
        "https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?w=500",
      ],
      is_premium: true,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Ветровка Nike Windrunner",
      description: "Легкая ветровка с капюшоном.",
      category: "Куртки",
      brand: "Nike",
      purchase_price: 2200,
      drop_price: 4200,
      recommended_price: 6500,
      photo_urls: [
        "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
    },
    {
      name: "Джоггеры Adidas Tiro",
      description: "Спортивные штаны с классическими полосками.",
      category: "Штаны",
      brand: "Adidas",
      purchase_price: 1400,
      drop_price: 2600,
      recommended_price: 4000,
      photo_urls: [
        "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=500",
      ],
      is_premium: false,
      is_active: true,
      is_in_stock: true,
    },
  ];

  // Дублируем товары для теста infinite scroll (3 раза = 36 товаров)
  const products: typeof baseProducts = [];
  for (let i = 0; i < 3; i++) {
    for (const product of baseProducts) {
      products.push({
        ...product,
        name: i === 0 ? product.name : `${product.name} v${i + 1}`,
      });
    }
  }

  // Удаляем старые тестовые товары
  await supabase.from("product_sizes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  for (const product of products) {
    const { data: newProduct, error: productError } = await supabase
      .from("products")
      .insert(product)
      .select("id")
      .single();

    if (productError) {
      console.error(`❌ Ошибка создания товара ${product.name}:`, productError);
      continue;
    }

    // Добавляем размеры
    const sizes = product.category === "Обувь"
      ? ["40", "41", "42", "43", "44"]
      : product.category === "Джинсы"
      ? ["30", "32", "34"]
      : ["S", "M", "L", "XL"];

    for (const size of sizes) {
      const qty = Math.floor(Math.random() * 5) + 1;
      await supabase.from("product_sizes").insert({
        product_id: newProduct!.id,
        size,
        initial_quantity: qty,
        current_quantity: qty,
        reserved_quantity: 0,
      });
    }

    console.log(`✓ Создан товар: ${product.name}`);
  }

  console.log("\n✅ Тестовые данные созданы!");
  console.log("\n📝 Данные для входа:");
  console.log(`   Site Key: ${testSiteKey}`);
  console.log("\n🌐 Откройте http://localhost:3000/auth/login");
}

seed().catch(console.error);
