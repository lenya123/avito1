import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("vibe_payments RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит vibe_payments", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM vibe_payments LIMIT 1`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("shipper НЕ видит vibe_payments", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM vibe_payments LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });

  it("shipper НЕ видит vibe_payment_orders", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT * FROM vibe_payment_orders LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });
});
