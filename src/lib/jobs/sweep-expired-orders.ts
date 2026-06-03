/**
 * Periodic sweep — safety net для таймерных переходов.
 *
 * Primary trigger каждого таймера — BullMQ delayed job (release-reservation,
 * expire-unpaid-order и т.п.). Этот sweep запускается каждую минуту через
 * repeatable job (см. `scheduleSweep` в queues.ts) и подбирает всё что
 * BullMQ-job почему-то пропустил: потеря Redis-job, рестарт worker'а в
 * момент истечения, race condition.
 *
 * Условия фильтрации идут по реальным БД-полям (`expires_at`, `created_at`)
 * — это источник правды. BullMQ — лишь оптимизация для точного срабатывания.
 *
 * Ровно те же чистые функции (`releaseReservationCore`, `expireUnpaidOrderCore`)
 * вызываются и из BullMQ-handler'ов, и отсюда — поведение единое и идемпотентное.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "bullmq";
import { releaseReservationCore } from "./handlers/release-reservation";
import { expireUnpaidOrderCore } from "./handlers/expire-unpaid-order";
import { expirePendingOrderCore } from "./handlers/expire-pending-order";
import { directorPaymentExpireCore } from "./handlers/director-payment-expire";
import { expireSendByCore } from "./handlers/expire-send-by";
import { handleMoveToTrash } from "./handlers/move-to-trash";

function getServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn("[Sweep] Supabase credentials not configured, skipping");
    return null;
  }

  return createClient(supabaseUrl, serviceKey);
}

/**
 * Брони размеров с истёкшим TTL (`expires_at < NOW()`).
 * TTL ставится в `reserve_size_atomic` (по умолчанию 5 минут).
 */
async function sweepExpiredReservations(supabase: SupabaseClient): Promise<number> {
  const { data: reservations, error } = await supabase
    .from("size_reservations")
    .select("id, product_size_id, session_id, expires_at")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("[Sweep:reservations] Query error:", error.message);
    return 0;
  }
  if (!reservations?.length) return 0;

  let released = 0;
  for (const res of reservations) {
    try {
      const { released: didRelease } = await releaseReservationCore(
        { reservationId: res.id, productSizeId: res.product_size_id },
        supabase
      );
      if (didRelease) released++;
    } catch (err) {
      console.error(`[Sweep:reservations] ${res.id} failed:`, err);
    }
  }
  if (released) {
    console.log(`[Sweep:reservations] Released ${released}/${reservations.length} expired`);
  }
  return released;
}

/**
 * Заказы, которые висят `status='paid' AND is_paid=false` дольше 10 минут.
 * BUSINESS_LOGIC §4.5: таймер на оплату 10 мин (для не-+ВАЙБ).
 *
 * Фильтр +ВАЙБ — внутри `expireUnpaidOrderCore` через customers, не нужен здесь,
 * потому что для +ВАЙБ-заказов BullMQ-job вообще не ставится; sweep же может
 * случайно подхватить их если клиент стал +ВАЙБ после оформления. Чтобы не
 * cancel'нуть лишнее — sweep стартует с фильтром только тех заказов где
 * `expire-unpaid-order` job был бы запланирован: смотрим customers.vibe_enabled.
 */
async function sweepUnpaidOrders(supabase: SupabaseClient): Promise<number> {
  const threshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, customer:customers(vibe_enabled)")
    .eq("status", "paid")
    .eq("is_paid", false)
    .lt("created_at", threshold);

  if (error) {
    console.error("[Sweep:unpaid-orders] Query error:", error.message);
    return 0;
  }
  if (!orders?.length) return 0;

  let cancelled = 0;
  for (const row of orders) {
    // +ВАЙБ-клиенты: долг — норма, таймер на них не распространяется.
    const customer = row.customer as { vibe_enabled?: boolean | null } | null;
    if (customer?.vibe_enabled) continue;

    try {
      const { cancelled: didCancel } = await expireUnpaidOrderCore(row.id, supabase);
      if (didCancel) cancelled++;
    } catch (err) {
      console.error(`[Sweep:unpaid-orders] ${row.id} failed:`, err);
    }
  }
  if (cancelled) {
    console.log(`[Sweep:unpaid-orders] Cancelled ${cancelled}/${orders.length} expired`);
  }
  return cancelled;
}

/**
 * Pending-orders с истёкшим TTL (`expires_at < NOW()`). Это primary
 * mechanism для не-+ВАЙБ заказов после §4.1 → 🅐: pending живёт 10 мин,
 * если за это время чек не пришёл — снимаем.
 *
 * Чек-получен сценарий обработан внутри `expirePendingOrderCore` —
 * при наличии `receipt_received_at` запись не сносится (ждёт решения
 * Vision/партнёра/owner).
 */
async function sweepExpiredPendingOrders(supabase: SupabaseClient): Promise<number> {
  const { data: pendings, error } = await supabase
    .from("pending_orders")
    .select("id")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("[Sweep:pending-orders] Query error:", error.message);
    return 0;
  }
  if (!pendings?.length) return 0;

  let cancelled = 0;
  for (const row of pendings) {
    try {
      const { cancelled: didCancel } = await expirePendingOrderCore(row.id, supabase);
      if (didCancel) cancelled++;
    } catch (err) {
      console.error(`[Sweep:pending-orders] ${row.id} failed:`, err);
    }
  }
  if (cancelled) {
    console.log(`[Sweep:pending-orders] Cancelled ${cancelled}/${pendings.length} expired`);
  }
  return cancelled;
}

/**
 * Pending'и, застрявшие у директора. Backup для BullMQ-job
 * `director-payment-expire` — если он потерян (Redis-restart, рефакторинг,
 * misalignment job-id), pending зависает: `expires_at` уже в прошлом, но
 * `receipt_received_at NOT NULL`, поэтому `sweepExpiredPendingOrders` его
 * не трогает (правило для 10-мин TTL).
 *
 * Здесь подбираем такие pending'и старше 24 часов и прогоняем через
 * `directorPaymentExpireCore` (cancel + DM клиенту + escalation владельцу).
 *
 * Условия:
 *   - `receipt_received_at IS NOT NULL` (чек получен, ушёл на проверку)
 *   - `receipt_received_at < NOW() - 24 hours` (директор молчит сутки)
 *   - не partner-warehouse (у тех свой expire через partner-payment-expire)
 */
/**
 * +ВАЙБ-долговые партнёрские pending'и без ответа партнёра >24ч.
 * У них expires_at=NULL (нет 10-минутного TTL — клиент в долг идёт),
 * поэтому sweepExpiredPendingOrders их не подбирает. Нужен отдельный
 * timeout — иначе партнёр игнорирует и pending висит вечно.
 *
 * Условия:
 *   - is_vibe_debt=TRUE
 *   - expires_at IS NULL
 *   - source_warehouse='partner'
 *   - created_at < NOW() - 24 hours
 */
async function sweepStuckVibeDebtPartnerPendings(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendings, error } = await supabase
    .from("pending_orders")
    .select("id, order_number, customer_id, source_partner_id")
    .eq("is_vibe_debt", true)
    .eq("source_warehouse", "partner")
    .is("expires_at", null)
    .lt("created_at", cutoff);

  if (error) {
    console.error("[Sweep:vibe-debt-partner-stuck] Query error:", error.message);
    return 0;
  }
  if (!pendings?.length) return 0;

  let cancelled = 0;
  for (const row of pendings) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cancelErr } = await (supabase.rpc as any)("cancel_pending_order_atomic", {
        p_pending_order_id: row.id,
      });
      if (cancelErr) {
        console.error(`[Sweep:vibe-debt-partner-stuck] cancel failed for ${row.id}:`, cancelErr);
        continue;
      }
      cancelled++;

      // DM клиенту.
      if (row.customer_id) {
        const { notifyCustomerOrderCancelled, sendOwnerEscalation } =
          await import("@/lib/telegram/notifications");
        notifyCustomerOrderCancelled({
          customerId: row.customer_id,
          orderNumber: row.order_number,
          reason: "партнёр не подтвердил наличие за 24 часа",
        }).catch((e) =>
          console.error("notifyCustomerOrderCancelled (vibe-debt-partner) failed:", e)
        );

        sendOwnerEscalation({
          title: "Партнёр молчит по +ВАЙБ-заказу",
          message:
            `⚠️ Партнёр не подтвердил +ВАЙБ-заказ №${row.order_number} за 24 часа.\n` +
            `Заказ автоматически отменён, клиент уведомлён.`,
        }).catch((e) => console.error("sendOwnerEscalation (vibe-debt-partner-stuck) failed:", e));
      }
    } catch (err) {
      console.error(`[Sweep:vibe-debt-partner-stuck] ${row.id} failed:`, err);
    }
  }
  if (cancelled) {
    console.log(
      `[Sweep:vibe-debt-partner-stuck] Cancelled ${cancelled}/${pendings.length} silent-partner +ВАЙБ-pendings`
    );
  }
  return cancelled;
}

/**
 * Не-+ВАЙБ partner_warehouse pending'и: клиент отправил чек, партнёр
 * не ответил «N да/нет» за 24 часа. Pending зависает потому что:
 *   - 10-минутный TTL уже не действует (receipt_received_at стоит).
 *   - sweepStuckDirectorPendings явно пропускает source_warehouse='partner'.
 *   - handler partner-payment-expire существует, но scheduler его не зовёт.
 *
 * Через 24h от получения чека отменяем pending, уведомляем клиента
 * и партнёра (воспитательное), эскалируем владельцу.
 *
 * Условия:
 *   - is_vibe_debt = false
 *   - source_warehouse = 'partner'
 *   - receipt_received_at IS NOT NULL
 *   - receipt_received_at < NOW() - 24 hours
 */
async function sweepStuckPartnerWarehousePendings(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendings, error } = await supabase
    .from("pending_orders")
    .select("id, order_number, customer_id, source_partner_id")
    .eq("is_vibe_debt", false)
    .eq("source_warehouse", "partner")
    .not("receipt_received_at", "is", null)
    .lt("receipt_received_at", cutoff);

  if (error) {
    console.error("[Sweep:partner-warehouse-stuck] Query error:", error.message);
    return 0;
  }
  if (!pendings?.length) return 0;

  let cancelled = 0;
  for (const row of pendings) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cancelErr } = await (supabase.rpc as any)("cancel_pending_order_atomic", {
        p_pending_order_id: row.id,
      });
      if (cancelErr) {
        console.error(`[Sweep:partner-warehouse-stuck] cancel failed for ${row.id}:`, cancelErr);
        continue;
      }
      cancelled++;

      const { notifyCustomerOrderCancelled, sendOwnerEscalation, sendToPartner } =
        await import("@/lib/telegram/notifications");

      // DM клиенту.
      if (row.customer_id) {
        notifyCustomerOrderCancelled({
          customerId: row.customer_id,
          orderNumber: row.order_number,
          reason:
            "партнёр не подтвердил оплату за 24 часа. Если деньги действительно ушли — напиши директору, разберёмся.",
        }).catch((e) =>
          console.error("notifyCustomerOrderCancelled (partner-warehouse-stuck) failed:", e)
        );
      }

      // DM партнёру — он узнаёт что заказ закрыт без него (воспитательно).
      if (row.source_partner_id) {
        sendToPartner({
          partnerId: row.source_partner_id,
          text:
            `🤝 Заказ №${row.order_number} автоматически отменён — ты не подтвердил оплату за 24 часа.\n\n` +
            `В следующий раз отвечай быстрее: «${row.order_number} да» или «${row.order_number} нет».`,
        }).catch((e) => console.error("sendToPartner (partner-warehouse-stuck) failed:", e));
      }

      sendOwnerEscalation({
        title: "Партнёр молчит 24ч",
        message:
          `⚠️ Партнёр не подтвердил оплату по заказу №${row.order_number} за 24 часа.\n` +
          `Pending авто-отменён, клиент и партнёр уведомлены. ` +
          `Если оплата реально была — нужно разобраться вручную.`,
      }).catch((e) => console.error("sendOwnerEscalation (partner-warehouse-stuck) failed:", e));
    } catch (err) {
      console.error(`[Sweep:partner-warehouse-stuck] ${row.id} failed:`, err);
    }
  }
  if (cancelled) {
    console.log(
      `[Sweep:partner-warehouse-stuck] Cancelled ${cancelled}/${pendings.length} silent-partner pendings`
    );
  }
  return cancelled;
}

async function sweepStuckDirectorPendings(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendings, error } = await supabase
    .from("pending_orders")
    .select("id, source_warehouse")
    .not("receipt_received_at", "is", null)
    .lt("receipt_received_at", cutoff);

  if (error) {
    console.error("[Sweep:stuck-director] Query error:", error.message);
    return 0;
  }
  if (!pendings?.length) return 0;

  let cancelled = 0;
  for (const row of pendings) {
    if (row.source_warehouse === "partner") continue;
    try {
      const { cancelled: didCancel } = await directorPaymentExpireCore(row.id, supabase);
      if (didCancel) cancelled++;
    } catch (err) {
      console.error(`[Sweep:stuck-director] ${row.id} failed:`, err);
    }
  }
  if (cancelled) {
    console.log(`[Sweep:stuck-director] Cancelled ${cancelled}/${pendings.length} stuck >24h`);
  }
  return cancelled;
}

export async function sweepExpiredOrders(): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const reservations = await sweepExpiredReservations(supabase);
  const pendings = await sweepExpiredPendingOrders(supabase);
  const orders = await sweepUnpaidOrders(supabase);
  const stuckDirector = await sweepStuckDirectorPendings(supabase);
  const stuckVibePartner = await sweepStuckVibeDebtPartnerPendings(supabase);
  const stuckPartnerWarehouse = await sweepStuckPartnerWarehousePendings(supabase);

  if (
    reservations ||
    pendings ||
    orders ||
    stuckDirector ||
    stuckVibePartner ||
    stuckPartnerWarehouse
  ) {
    console.log(
      `[Sweep] Done — reservations: ${reservations}, pendings: ${pendings}, unpaid orders: ${orders}, stuck-director: ${stuckDirector}, stuck-vibe-partner: ${stuckVibePartner}, stuck-partner-warehouse: ${stuckPartnerWarehouse}`
    );
  }
}

/**
 * Daily sweep — страховка для send_by-переходов. Запускается раз в сутки
 * в начале нового дня МСК. Подбирает заказы у которых send_by < сегодня
 * (МСК) и статус ещё активный (paid/collecting/printed/problem) — это
 * случается если BullMQ-job `expire-send-by` потерялся.
 *
 * Лежит отдельно от minute-sweep'а потому что send_by — суточная
 * единица: проверять чаще раза в сутки бессмысленно.
 */
/**
 * Daily sweep — страховка для pickup_by-переходов. Запускается раз в
 * сутки в начале нового дня МСК (один cron с sweepStuckSendByDaily).
 * Подбирает заказы у которых pickup_by < сегодня (МСК) и статус ещё
 * `return` — это случается если BullMQ-job `expire-pickup-by`
 * потерялся.
 *
 * Канон §6.5: переход return → trash через handleMoveToTrash —
 * адаптивные пороги попыток / fault_party / fault_reason.
 *
 * Симметрично sweepStuckSendByDaily. С 2026-05-26 per-order
 * `expire-pickup-by` job больше не ставится при оформлении возврата
 * — единственный механизм сгорания pickup_by теперь этот sweep.
 */
export async function sweepStuckPickupByDaily(): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const today = nowMsk.toISOString().slice(0, 10);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, pickup_by, status")
    .eq("status", "return")
    .or(`pickup_by.is.null,pickup_by.lt.${today}`);

  if (error) {
    console.error("[Sweep:pickup-by-daily] Query error:", error.message);
    return;
  }
  if (!orders?.length) {
    console.log(`[Sweep:pickup-by-daily] No expired returns`);
    return;
  }

  let movedToTrash = 0;
  for (const row of orders) {
    try {
      // handleMoveToTrash принимает Job — собираем минимальный shape.
      const fakeJob = { data: { orderId: row.id } } as unknown as Job<{ orderId: string }>;
      await handleMoveToTrash(fakeJob);
      movedToTrash++;
    } catch (err) {
      console.error(`[Sweep:pickup-by-daily] ${row.id} failed:`, err);
    }
  }
  console.log(`[Sweep:pickup-by-daily] Moved to trash ${movedToTrash}/${orders.length}`);
}

export async function sweepStuckSendByDaily(): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const today = nowMsk.toISOString().slice(0, 10);

  // `send_by.is.null` — защита от исторического бага, когда заказы
  // создавались без даты и утекали мимо обхода (NULL < date = unknown).
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, send_by, status")
    .in("status", ["paid", "collecting", "problem"])
    .or(`send_by.is.null,send_by.lt.${today}`);

  if (error) {
    console.error("[Sweep:send-by-daily] Query error:", error.message);
    return;
  }
  if (!orders?.length) {
    console.log(`[Sweep:send-by-daily] No expired orders`);
    return;
  }

  let cancelled = 0;
  for (const row of orders) {
    try {
      const { cancelled: didCancel } = await expireSendByCore(row.id, supabase);
      if (didCancel) cancelled++;
    } catch (err) {
      console.error(`[Sweep:send-by-daily] ${row.id} failed:`, err);
    }
  }
  console.log(`[Sweep:send-by-daily] Cancelled ${cancelled}/${orders.length}`);
}
