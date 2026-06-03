import { describe, it, expect } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS } from "./fixtures";

describe("users RLS (Stage 2 schema)", () => {
  it("owner видит всех пользователей (owner + shipper)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`
        SELECT id FROM users
        WHERE id IN (${FIXTURE_IDS.owner}::uuid, ${FIXTURE_IDS.shipper}::uuid)
      `;
    });
    expect(rows.length).toBe(2);
  });

  it("shipper видит только себя (self-policy)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        SELECT id FROM users
        WHERE id IN (${FIXTURE_IDS.owner}::uuid, ${FIXTURE_IDS.shipper}::uuid)
      `;
    });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(FIXTURE_IDS.shipper);
  });

  it("non-owner не может UPDATE чужого юзера (0 строк)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`UPDATE users SET name = 'hacked' WHERE id = ${FIXTURE_IDS.owner}`;
    });
    expect(result.count).toBe(0);
  });

  it("user может UPDATE сам себя (self policy)", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`UPDATE users SET name = 'Self Update OK' WHERE id = ${FIXTURE_IDS.shipper}`;
    });
    expect(result.count).toBe(1);
  });

  it("non-owner INSERT чужого юзера отклоняется RLS", async () => {
    await expect(
      withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
        return await sql`
          INSERT INTO users (role, telegram_id, name)
          VALUES ('owner', -9999, 'Injected Owner')
        `;
      })
    ).rejects.toThrow(/row-level security/);
  });

  it("CHECK на users.role запрещает вставку role='client' или 'seller'", async () => {
    // Stage 2.2 сузил CHECK до owner/shipper/admin.
    await expect(
      withSellerContext(FIXTURE_IDS.owner, async (sql) => {
        return await sql`
          INSERT INTO users (role, telegram_id, name)
          VALUES ('client', -9998, 'Should fail')
        `;
      })
    ).rejects.toThrow(/users_role_check/);
  });
});
