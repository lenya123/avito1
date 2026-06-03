import { describe, it, expect } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS } from "./fixtures";

describe("products RLS (Stage 1.5 schema)", () => {
  it("owner видит продукт", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM products WHERE id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper видит продукт (A2 policy через is_shipper)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM products WHERE id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(1);
  });

  it("user без роли (legacy client) НЕ видит продукт", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM products WHERE id = ${FIXTURE_IDS.product}`;
    });
    expect(rows.length).toBe(0);
  });

  it("shipper НЕ может UPDATE продукт (только SELECT разрешён)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`UPDATE products SET name = 'SHIPPER HACK' WHERE id = ${FIXTURE_IDS.product}`;
    });
    expect(result.count).toBe(0);
  });

  it("owner может UPDATE продукт (products_modify_owner)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`UPDATE products SET brand = 'Owner Update' WHERE id = ${FIXTURE_IDS.product}`;
    });
    expect(result.count).toBe(1);
  });

  it("owner может INSERT новый продукт", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        INSERT INTO products (name, brand, category, purchase_price, drop_price, is_active, is_in_stock)
        VALUES ('Inserted by owner', 'Nike', 'shoes', 50, 100, true, true)
        RETURNING id
      `;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper НЕ может INSERT продукт", async () => {
    await expect(
      withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
        return await sql`
          INSERT INTO products (name, brand, category, purchase_price, drop_price, is_active, is_in_stock)
          VALUES ('Shipper hack', 'X', 'shoes', 50, 100, true, true)
        `;
      })
    ).rejects.toThrow(/row-level security/);
  });
});
