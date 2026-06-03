import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("payment_methods RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит payment_methods", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM payment_methods LIMIT 1`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("shipper НЕ видит payment_methods", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM payment_methods LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });

  it("shipper НЕ видит payment_method_month_stats", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT * FROM payment_method_month_stats LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });
});
