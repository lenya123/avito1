import { db } from "./db";

// Stage 2 схема: роли owner / shipper / admin; клиенты — в отдельной таблице
// customers (якорь: tg_user_id). orders.client_id заменён на orders.customer_id.
// Минимальный набор фикстур: один владелец, один отправщик, один клиент,
// один товар с размером и один заказ на клиента.

export const FIXTURE_IDS = {
  owner: "11111111-1111-1111-1111-111111111111",
  shipper: "33333333-0000-0000-0000-000000000001",
  customer: "55555555-aaaa-0000-0000-000000000001",
  product: "55555555-0000-0000-0000-000000000001",
  productSize: "66666666-0000-0000-0000-000000000001",
  // Stage 3.8: партнёр (чужой оптовик) + партнёрский товар/размер.
  partner: "77777777-0000-0000-0000-000000000001",
  partnerProduct: "55555555-0000-0000-0000-000000000002",
  partnerProductSize: "66666666-0000-0000-0000-000000000002",
  // Произвольный UUID, не привязанный ни к users, ни к customers — используется
  // для проверок "anon/неавторизованный юзер не видит данные".
  rogue: "44444444-ffff-0000-0000-000000000001",
} as const;

const USER_IDS = [FIXTURE_IDS.owner, FIXTURE_IDS.shipper];
const CUSTOMER_IDS = [FIXTURE_IDS.customer];
const PRODUCT_IDS = [FIXTURE_IDS.product, FIXTURE_IDS.partnerProduct];
const PARTNER_IDS = [FIXTURE_IDS.partner];

export async function teardownFixtures() {
  // Обратный порядок FK. Под superuser (postgres) RLS обходится.
  await db`DELETE FROM shipper_ledger_entries WHERE shipper_id = ANY(${USER_IDS})`;
  await db`DELETE FROM shipper_payout_periods WHERE shipper_id = ANY(${USER_IDS})`;
  await db`DELETE FROM size_reservations WHERE user_id = ANY(${USER_IDS})`;
  await db`DELETE FROM orders WHERE customer_id = ANY(${CUSTOMER_IDS}) OR shipped_by = ANY(${USER_IDS}) OR partner_id = ANY(${PARTNER_IDS})`;
  await db`DELETE FROM product_sizes WHERE product_id = ANY(${PRODUCT_IDS})`;
  await db`DELETE FROM products WHERE id = ANY(${PRODUCT_IDS})`;
  await db`DELETE FROM customers WHERE id = ANY(${CUSTOMER_IDS})`;
  await db`DELETE FROM partners WHERE id = ANY(${PARTNER_IDS})`;
  await db`DELETE FROM users WHERE id = ANY(${USER_IDS})`;
}

export async function setupFixtures() {
  await teardownFixtures();

  // Users — owner / shipper.
  await db`
    INSERT INTO users (id, role, telegram_id, name)
    VALUES
      (${FIXTURE_IDS.owner},   'owner',   -1001, 'Test Owner'),
      (${FIXTURE_IDS.shipper}, 'shipper', -3001, 'Test Shipper')
  `;

  // Customer — клиент оптовика (дроппер).
  await db`
    INSERT INTO customers (id, tg_user_id, telegram_username, name)
    VALUES (${FIXTURE_IDS.customer}, 7000001, 'test_customer', 'Test Customer')
  `;

  // Products — seller_id убран в Stage 1.
  await db`
    INSERT INTO products (id, name, brand, category, purchase_price, drop_price, is_active, is_in_stock)
    VALUES (${FIXTURE_IDS.product}, 'Test Product', 'Nike', 'shoes', 100, 200, true, true)
  `;

  await db`
    INSERT INTO product_sizes (id, product_id, size, initial_quantity, current_quantity)
    VALUES (${FIXTURE_IDS.productSize}, ${FIXTURE_IDS.product}, 'One Size', 10, 10)
  `;

  // Один заказ на customer — нужен для shipper-ledger сценариев и проверки snapshot-триггера.
  await db`
    INSERT INTO orders (
      customer_id, product_id, product_size_id,
      purchase_price, client_price,
      delivery_service, delivery_deadline,
      shipped_by, shipper_rate_snapshot
    )
    VALUES (
      ${FIXTURE_IDS.customer}, ${FIXTURE_IDS.product}, ${FIXTURE_IDS.productSize},
      100, 200,
      'cdek', NOW() + INTERVAL '7 days',
      ${FIXTURE_IDS.shipper}, 50
    )
  `;

  // Stage 3.8: партнёр с привязанным tg_user_id + его товар/размер + один
  // партнёрский заказ в статусе pending_payment (партнёр ещё не подтвердил).
  await db`
    INSERT INTO partners (id, name, tg_username, tg_user_id, is_active)
    VALUES (${FIXTURE_IDS.partner}, 'Test Partner', 'test_partner', 9000001, true)
  `;

  await db`
    INSERT INTO products (
      id, name, brand, category, purchase_price, drop_price,
      is_active, is_in_stock, partner_id, partner_commission
    )
    VALUES (
      ${FIXTURE_IDS.partnerProduct}, 'Partner Product', 'Nike', 'shoes',
      0, 300, true, true, ${FIXTURE_IDS.partner}, 100
    )
  `;

  await db`
    INSERT INTO product_sizes (id, product_id, size, initial_quantity, current_quantity)
    VALUES (
      ${FIXTURE_IDS.partnerProductSize}, ${FIXTURE_IDS.partnerProduct},
      'One Size', 10, 10
    )
  `;

  await db`
    INSERT INTO orders (
      customer_id, product_id, product_size_id,
      purchase_price, client_price,
      delivery_service, delivery_deadline,
      status, partner_id, partner_commission_snapshot
    )
    VALUES (
      ${FIXTURE_IDS.customer}, ${FIXTURE_IDS.partnerProduct}, ${FIXTURE_IDS.partnerProductSize},
      0, 300,
      'cdek', NOW() + INTERVAL '7 days',
      'pending_payment', ${FIXTURE_IDS.partner}, 100
    )
  `;
}
