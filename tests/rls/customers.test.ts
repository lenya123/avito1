import { describe, it, expect, beforeAll } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("customers RLS (Stage 2)", () => {
  beforeAll(async () => {
    await setupFixtures();
  });

  it("owner видит клиентов", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM customers WHERE id = ${FIXTURE_IDS.customer}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper НЕ видит клиентов (имя берётся из snapshot-полей на orders)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM customers WHERE id = ${FIXTURE_IDS.customer}::uuid`;
    });
    expect(rows.length).toBe(0);
  });

  it("rogue (неавторизован) НЕ видит клиентов", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM customers WHERE id = ${FIXTURE_IDS.customer}::uuid`;
    });
    expect(rows.length).toBe(0);
  });

  it("owner может PATCH клиента (vibe_enabled, blocked)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        UPDATE customers SET vibe_enabled = true WHERE id = ${FIXTURE_IDS.customer}::uuid
      `;
    });
    expect(result.count).toBe(1);
  });
});
