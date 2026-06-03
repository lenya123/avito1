import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("shipper_ledger_entries RLS (Stage 1 schema: no seller_id)", () => {
  beforeAll(async () => {
    await setupFixtures();

    // Триггерим credit-запись для shipper: completed + shipped_by + shipper_rate_snapshot
    await db`
      UPDATE orders SET status = 'completed', completed_at = NOW()
      WHERE shipped_by = ${FIXTURE_IDS.shipper}
    `;
  });

  it("trigger creates one credit entry per completed order", async () => {
    const entries = await db`
      SELECT * FROM shipper_ledger_entries
      WHERE shipper_id = ${FIXTURE_IDS.shipper} AND kind = 'credit'
    `;
    expect(entries.length).toBe(1);
    expect(Number(entries[0].amount)).toBe(50);
  });

  it("trigger is idempotent — re-completing не дублирует credit", async () => {
    const orderId = (
      await db`SELECT id FROM orders WHERE shipped_by = ${FIXTURE_IDS.shipper} LIMIT 1`
    )[0].id;
    await db`UPDATE orders SET status = 'in_transit' WHERE id = ${orderId}`;
    await db`UPDATE orders SET status = 'completed' WHERE id = ${orderId}`;

    const entries = await db`
      SELECT * FROM shipper_ledger_entries
      WHERE shipper_id = ${FIXTURE_IDS.shipper} AND kind = 'credit'
    `;
    expect(entries.length).toBe(1);
  });

  it("shipper sees own ledger entries", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT shipper_id FROM shipper_ledger_entries`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const ids = Array.from(new Set(rows.map((r: any) => r.shipper_id)));
    expect(ids).toEqual([FIXTURE_IDS.shipper]);
  });

  it("owner sees all ledger entries", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT * FROM shipper_ledger_entries`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("authenticated shipper cannot INSERT ledger entry directly", async () => {
    await expect(
      withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
        await sql`
          INSERT INTO shipper_ledger_entries (shipper_id, order_id, kind, amount)
          VALUES (${FIXTURE_IDS.shipper}, gen_random_uuid(), 'credit', 999)
        `;
      })
    ).rejects.toThrow();
  });

  it("authenticated shipper UPDATE затрагивает 0 строк (нет UPDATE policy)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE shipper_ledger_entries SET amount = 0
        WHERE shipper_id = ${FIXTURE_IDS.shipper}
      `;
    });
    expect(result.count).toBe(0);
  });

  it("authenticated shipper DELETE затрагивает 0 строк (нет DELETE policy)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        DELETE FROM shipper_ledger_entries
        WHERE shipper_id = ${FIXTURE_IDS.shipper}
      `;
    });
    expect(result.count).toBe(0);
  });
});
