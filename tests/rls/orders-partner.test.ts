import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

/**
 * Stage 3.9: партнёрские заказы (`orders.partner_id IS NOT NULL`) видны
 * только owner. Shipper-PWA их не показывает — фильтр `partner_id IS NULL`
 * стоит на уровне API-роута /api/shipper/orders, плюс RLS shipper-доступ
 * к статусам pending_payment не распространяется.
 */
describe("orders with partner_id RLS (Stage 3.9)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит партнёрский заказ", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        SELECT id, partner_id FROM orders
          WHERE partner_id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ видит партнёрский заказ в pending_payment", async () => {
    await db`
      UPDATE orders SET status = 'pending_payment'
        WHERE partner_id = ${FIXTURE_IDS.partner}
    `;
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        SELECT id FROM orders WHERE partner_id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(rows.length).toBe(0);
  });

  it("rogue НЕ видит партнёрский заказ", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`
        SELECT id FROM orders WHERE partner_id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(rows.length).toBe(0);
  });

  it("owner может проставить partner_payment_received_at", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        UPDATE orders
          SET partner_payment_received_at = NOW(),
              is_paid = true,
              paid_at = NOW(),
              status = 'awaiting_shipment'
          WHERE partner_id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ может редактировать партнёрский заказ", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE orders
          SET tracking_number = 'STOLEN'
          WHERE partner_id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(result.count).toBe(0);
  });
});
