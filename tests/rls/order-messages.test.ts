import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("order_messages RLS (Stage 2)", () => {
  let orderId: string | null = null;
  let messageId: string | null = null;

  beforeAll(async () => {
    await setupFixtures();
    const orderRows = (await db`
      SELECT id FROM orders WHERE customer_id = ${FIXTURE_IDS.customer}::uuid LIMIT 1
    `) as Array<{ id: string }>;
    orderId = orderRows[0]?.id ?? null;

    // Активный статус, чтобы shipper SELECT policy срабатывала.
    if (orderId) {
      await db`UPDATE orders SET status = 'awaiting_shipment' WHERE id = ${orderId}::uuid`;
      const inserted = (await db`
        INSERT INTO order_messages (order_id, tg_chat_id, tg_message_id, kind, direction, body)
        VALUES (${orderId}::uuid, 5000001, 1001, 'summary', 'outbound', 'test')
        RETURNING id
      `) as Array<{ id: string }>;
      messageId = inserted[0]?.id ?? null;
    }
  });

  it("owner видит order_messages", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM order_messages WHERE id = ${messageId}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper видит order_messages для заказа в активном статусе", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM order_messages WHERE id = ${messageId}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper НЕ видит order_messages заказа в completed", async () => {
    if (!orderId) return;
    await db`UPDATE orders SET status = 'completed', completed_at = NOW() WHERE id = ${orderId}::uuid`;
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM order_messages WHERE id = ${messageId}::uuid`;
    });
    expect(rows.length).toBe(0);
    await db`UPDATE orders SET status = 'awaiting_shipment', completed_at = NULL WHERE id = ${orderId}::uuid`;
  });
});
