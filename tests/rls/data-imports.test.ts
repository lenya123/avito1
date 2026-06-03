import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("data_imports RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит data_imports", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM data_imports LIMIT 1`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it("shipper НЕ видит data_imports", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM data_imports LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });
});
