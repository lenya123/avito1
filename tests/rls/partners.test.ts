import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("partners RLS (Stage 3.8)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит партнёров", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id, name FROM partners WHERE id = ${FIXTURE_IDS.partner}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper НЕ видит партнёров (таблица только для owner)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM partners WHERE id = ${FIXTURE_IDS.partner}::uuid`;
    });
    expect(rows.length).toBe(0);
  });

  it("rogue НЕ видит партнёров", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM partners WHERE id = ${FIXTURE_IDS.partner}::uuid`;
    });
    expect(rows.length).toBe(0);
  });

  it("owner может обновить партнёра (is_active, notes)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        UPDATE partners
          SET notes = 'updated', is_active = true
          WHERE id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(result.count).toBe(1);
  });

  it("shipper НЕ может обновить партнёра", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE partners
          SET notes = 'hacked'
          WHERE id = ${FIXTURE_IDS.partner}::uuid
      `;
    });
    expect(result.count).toBe(0);
  });
});
