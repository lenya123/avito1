import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("orders RLS (Stage 1.5 schema)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит все заказы", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id, status FROM orders WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper видит заказ в статусе awaiting_shipment", async () => {
    await db`UPDATE orders SET status = 'awaiting_shipment' WHERE product_id = ${FIXTURE_IDS.product}`;

    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id, status FROM orders WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ видит заказ в статусе pending_payment (не в списке допустимых)", async () => {
    await db`UPDATE orders SET status = 'pending_payment' WHERE product_id = ${FIXTURE_IDS.product}`;

    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id, status FROM orders WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(0);

    // Вернуть для следующих тестов
    await db`UPDATE orders SET status = 'awaiting_shipment' WHERE product_id = ${FIXTURE_IDS.product}`;
  });

  it("user без is_shipper-роли (legacy client) НЕ видит заказы", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM orders WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(0);
  });

  it("shipper может UPDATE заказ в статусе collecting (orders_update_shipper)", async () => {
    await db`UPDATE orders SET status = 'collecting' WHERE product_id = ${FIXTURE_IDS.product}`;

    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE orders SET tracking_number = 'SHIPPER-EDIT'
        WHERE product_id = ${FIXTURE_IDS.product}
      `;
    });
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ может UPDATE заказ в запрещённом статусе (completed)", async () => {
    await db`UPDATE orders SET status = 'completed', completed_at = NOW() WHERE product_id = ${FIXTURE_IDS.product}`;

    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE orders SET tracking_number = 'BLOCKED'
        WHERE product_id = ${FIXTURE_IDS.product}
      `;
    });
    expect(result.count).toBe(0);
  });
});
