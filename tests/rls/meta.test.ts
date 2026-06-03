import { describe, it, expect } from "vitest";
import { withSellerContext } from "./db";
import { FIXTURE_IDS } from "./fixtures";

describe("meta RLS: helper functions", () => {
  it("is_owner() = TRUE under owner claims", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT public.is_owner() AS v`;
    });
    expect(rows[0].v).toBe(true);
  });

  it("is_owner() = FALSE under shipper claims", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT public.is_owner() AS v`;
    });
    expect(rows[0].v).toBe(false);
  });

  it("is_shipper() = TRUE under shipper claims", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT public.is_shipper() AS v`;
    });
    expect(rows[0].v).toBe(true);
  });

  it("is_shipper() = TRUE under owner claims (owner — супермножество)", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT public.is_shipper() AS v`;
    });
    expect(rows[0].v).toBe(true);
  });

  it("is_admin() = FALSE под owner/shipper claims (роль 'admin' ещё не выдана)", async () => {
    const ownerRow = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT public.is_admin() AS v`;
    });
    const shipperRow = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT public.is_admin() AS v`;
    });
    expect(ownerRow[0].v).toBe(false);
    expect(shipperRow[0].v).toBe(false);
  });

  it("is_seller() / is_client() больше не существуют (Stage 1 drop CASCADE)", async () => {
    // Негативный тест: функции должны быть удалены.
    await expect(
      withSellerContext(FIXTURE_IDS.owner, async (sql) => {
        return await sql`SELECT public.is_seller() AS v`;
      })
    ).rejects.toThrow();
    await expect(
      withSellerContext(FIXTURE_IDS.owner, async (sql) => {
        return await sql`SELECT public.is_client() AS v`;
      })
    ).rejects.toThrow();
  });
});
