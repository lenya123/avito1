import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("business_settings RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner читает business_settings", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id, business_name FROM business_settings`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper ТОЖЕ читает business_settings (нужен для шапки PWA)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM business_settings`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ может UPDATE business_settings", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE business_settings SET business_name = 'hacked'
      `;
    });
    expect(result.count).toBe(0);
  });

  it("owner может UPDATE business_settings", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        UPDATE business_settings SET business_name = 'Owner Updated'
      `;
    });
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});
