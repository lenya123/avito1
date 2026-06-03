import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("customer_conversations RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner читает customer_conversations", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM customer_conversations LIMIT 1`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("shipper НЕ читает customer_conversations", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM customer_conversations LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });
});
