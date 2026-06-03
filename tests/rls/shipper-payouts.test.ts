import { describe, it, expect, beforeAll } from "vitest";
import { db, withSellerContext } from "./db";
import { FIXTURE_IDS, setupFixtures } from "./fixtures";

describe("shipper_payout_periods RLS + RPC (Stage 1)", () => {
  let payoutId: string;

  beforeAll(async () => {
    await setupFixtures();

    // Completed-ордер → триггер создаёт credit.
    await db`
      UPDATE orders SET status = 'completed', completed_at = NOW()
      WHERE shipped_by = ${FIXTURE_IDS.shipper}
    `;

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const periodStart = weekAgo.toISOString().split("T")[0];
    const periodEnd = tomorrow.toISOString().split("T")[0];

    const result = await db`
      SELECT * FROM build_shipper_payouts_for_period(${periodStart}::date, ${periodEnd}::date)
    `;
    const row = result.find((r) => r.out_shipper_id === FIXTURE_IDS.shipper);
    if (row) payoutId = row.out_payout_id;
  });

  it("build_shipper_payouts_for_period создаёт одну выплату", async () => {
    const payouts = await db`
      SELECT * FROM shipper_payout_periods WHERE shipper_id = ${FIXTURE_IDS.shipper}
    `;
    expect(payouts.length).toBe(1);
    expect(Number(payouts[0].total_amount)).toBe(50);
    expect(payouts[0].status).toBe("pending");
  });

  it("RPC идемпотентна — повторный вызов не создаёт дубликат", async () => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const periodStart = weekAgo.toISOString().split("T")[0];
    const periodEnd = tomorrow.toISOString().split("T")[0];

    await db`SELECT * FROM build_shipper_payouts_for_period(${periodStart}::date, ${periodEnd}::date)`;

    const payouts = await db`
      SELECT * FROM shipper_payout_periods WHERE shipper_id = ${FIXTURE_IDS.shipper}
    `;
    expect(payouts.length).toBe(1);
  });

  it("ledger-credit получает ref_payout_id после build", async () => {
    const entries = await db`
      SELECT * FROM shipper_ledger_entries
      WHERE shipper_id = ${FIXTURE_IDS.shipper} AND kind = 'credit'
    `;
    expect(entries.length).toBe(1);
    expect(entries[0].ref_payout_id).toBeTruthy();
  });

  it("shipper видит только свои выплаты", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`SELECT shipper_id FROM shipper_payout_periods`;
    });
    const ids = Array.from(new Set(rows.map((r: any) => r.shipper_id)));
    expect(ids).toEqual([FIXTURE_IDS.shipper]);
  });

  it("owner видит все выплаты", async () => {
    const rows = await withSellerContext(FIXTURE_IDS.owner, async (sql) => {
      return await sql`SELECT * FROM shipper_payout_periods`;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("authenticated shipper не может INSERT напрямую", async () => {
    await expect(
      withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
        await sql`
          INSERT INTO shipper_payout_periods (shipper_id, period_start, period_end, total_amount, orders_count)
          VALUES (${FIXTURE_IDS.shipper}, '2026-01-01', '2026-01-07', 999, 1)
        `;
      })
    ).rejects.toThrow();
  });

  it("authenticated shipper UPDATE затрагивает 0 строк", async () => {
    const result = await withSellerContext(FIXTURE_IDS.shipper, async (sql) => {
      return await sql`
        UPDATE shipper_payout_periods SET status = 'paid'
        WHERE shipper_id = ${FIXTURE_IDS.shipper}
      `;
    });
    expect(result.count).toBe(0);
  });

  it("mark_shipper_payout_paid создаёт debit_payout и обнуляет задолженность", async () => {
    if (!payoutId) return;
    await db`SELECT mark_shipper_payout_paid(${payoutId}, ${FIXTURE_IDS.owner}, 'test payout')`;

    const period = await db`
      SELECT status, paid_by FROM shipper_payout_periods WHERE id = ${payoutId}
    `;
    expect(period[0].status).toBe("paid");
    expect(period[0].paid_by).toBe(FIXTURE_IDS.owner);

    const debits = await db`
      SELECT * FROM shipper_ledger_entries
      WHERE ref_payout_id = ${payoutId} AND kind = 'debit_payout'
    `;
    expect(debits.length).toBe(1);
    expect(Number(debits[0].amount)).toBe(50);
    expect(debits[0].order_id).toBeNull();
  });

  it("mark_shipper_payout_paid повторно → ошибка P0002 (не pending)", async () => {
    if (!payoutId) return;
    await expect(
      db`SELECT mark_shipper_payout_paid(${payoutId}, ${FIXTURE_IDS.owner}, 'replay')`
    ).rejects.toThrow();
  });
});
