import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("shipper_pickup_points RLS (Stage 2)", () => {
  let pointId: string | null = null;

  beforeAll(async () => {
    await setupFixtures();
    const inserted = (await db`
      INSERT INTO shipper_pickup_points (shipper_id, delivery_service, label, address_text)
      VALUES (${FIXTURE_IDS.shipper}::uuid, 'cdek', 'Тестовый ПВЗ', 'Москва, ул. Ленина 1')
      RETURNING id
    `) as Array<{ id: string }>;
    pointId = inserted[0]?.id ?? null;
  });

  it("owner видит все ПВЗ", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT id FROM shipper_pickup_points WHERE id = ${pointId}::uuid`;
    });
    expect(rows.length).toBe(1);
  });

  it("shipper видит свои ПВЗ", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT id FROM shipper_pickup_points WHERE shipper_id = ${FIXTURE_IDS.shipper}::uuid`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("rogue (не-shipper) НЕ видит ПВЗ", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.rogue, async (sql) => {
      return await sql`SELECT id FROM shipper_pickup_points LIMIT 1`;
    });
    expect(rows.length).toBe(0);
  });
});
