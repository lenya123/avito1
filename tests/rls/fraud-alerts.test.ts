import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("fraud_alerts RLS (Stage 2)", () => {
  let alertId: string | null = null;

  beforeAll(async () => {
    await setupFixtures();
    const inserted = (await db`
      INSERT INTO fraud_alerts (customer_id, alert_type, severity, status)
      VALUES (${FIXTURE_IDS.customer}::uuid, 'rapid_orders', 'high', 'open')
      RETURNING id
    `) as Array<{ id: string }>;
    alertId = inserted[0]?.id ?? null;
  });

  it("owner видит fraud_alerts", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM fraud_alerts WHERE id = ${alertId}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper НЕ видит fraud_alerts", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM fraud_alerts WHERE id = ${alertId}::uuid`;
    });
    expect(rows.length).toBe(0);
  });
});
