import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS } from "./fixtures";

describe("settings RLS (Stage 1.5 schema)", () => {
  beforeAll(async () => {
    // settings — singleton-таблица. Если строки нет — создаём одну пустую.
    const existing = await db`SELECT id FROM settings LIMIT 1`;
    if (existing.length === 0) {
      await db`INSERT INTO settings DEFAULT VALUES`;
    }
  });

  it("любой authenticated может читать settings (policy settings_select_all)", async () => {
    const ownerRows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM settings`;
    });
    const shipperRows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM settings`;
    });
    const clientRows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM settings`;
    });
    expect(ownerRows.length).toBeGreaterThanOrEqual(1);
    expect(shipperRows.length).toBeGreaterThanOrEqual(1);
    expect(clientRows.length).toBeGreaterThanOrEqual(1);
  });

  it("owner может UPDATE settings (policy settings_modify_owner)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`UPDATE settings SET first_order_discount = 5`;
    });
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("shipper НЕ может UPDATE settings (0 строк)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`UPDATE settings SET first_order_discount = 999`;
    });
    expect(result.count).toBe(0);
  });

  it("user без роли НЕ может UPDATE settings (0 строк)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`UPDATE settings SET first_order_discount = 777`;
    });
    expect(result.count).toBe(0);
  });
});
