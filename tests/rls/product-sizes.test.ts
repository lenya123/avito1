import { describe, it, expect } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS } from "./fixtures";

describe("product_sizes RLS (Stage 1.5 schema)", () => {
  it("owner видит размер", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM product_sizes WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("shipper видит размер (A2 restored policy)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM product_sizes WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("user без роли НЕ видит размер", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM product_sizes WHERE product_id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(0);
  });

  it("shipper НЕ может UPDATE размер (модификация — только owner)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE product_sizes SET current_quantity = 0
        WHERE product_id = ${FIXTURE_IDS.product}
      `;
    });
    expect(result.count).toBe(0);
  });

  it("owner может UPDATE размер", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        UPDATE product_sizes SET current_quantity = 9
        WHERE product_id = ${FIXTURE_IDS.product}
      `;
    });
    expect(result.count).toBe(1);
  });
});
