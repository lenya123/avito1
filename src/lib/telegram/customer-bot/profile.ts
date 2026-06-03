/**
 * Профиль клиента в customer-bot (BUSINESS_LOGIC §12.6):
 *   - Имя/телефон.
 *   - Деньги: баланс, pending-запрос на вывод, +ВАЙБ-долг.
 *   - Статистика: счётчики заказов по статусам + сумма покупок.
 */

import { InlineKeyboard } from "grammy";
import { getBotDb } from "../db";
import type { Customer, CustomerContext } from "../bots/customer-bot";

interface OrderStats {
  total: number;
  inProgress: number; // paid + collecting + sent + return
  successful: number; // sent
  returned: number; // return_done
  cancelled: number;
  trashed: number;
  purchasedSum: number; // сумма sent (фактическая сумма покупок)
}

async function fetchOrderStats(customerId: string): Promise<OrderStats> {
  const db = getBotDb();
  const { data } = await db
    .from("orders")
    .select("status, client_price")
    .eq("customer_id", customerId);

  const stats: OrderStats = {
    total: 0,
    inProgress: 0,
    successful: 0,
    returned: 0,
    cancelled: 0,
    trashed: 0,
    purchasedSum: 0,
  };
  const inProgressStatuses = new Set(["paid", "collecting", "sent", "return"]);

  for (const o of data ?? []) {
    const status = (o.status as string) ?? "";
    const price = Number(o.client_price ?? 0);
    stats.total += 1;
    if (inProgressStatuses.has(status)) stats.inProgress += 1;
    if (status === "sent") {
      stats.successful += 1;
      stats.purchasedSum += price;
    } else if (status === "return_done") {
      stats.returned += 1;
    } else if (status === "cancelled") {
      stats.cancelled += 1;
    } else if (status === "trash") {
      stats.trashed += 1;
    }
  }
  return stats;
}

export async function openProfile(
  ctx: CustomerContext,
  customer: Customer,
  options: { editExisting?: boolean } = {}
): Promise<void> {
  const db = getBotDb();

  // 1. Текущий баланс из таблицы.
  const { data: row } = await db
    .from("customers")
    .select("customer_balance, vibe_enabled, is_frozen")
    .eq("id", customer.id)
    .single();

  const balance = Number(row?.customer_balance ?? 0);
  const vibeEnabled = !!row?.vibe_enabled;
  const isFrozen = !!row?.is_frozen;

  // 2. Pending-запрос на вывод (если есть).
  const { data: pendingWithdrawal } = await db
    .from("withdrawal_requests")
    .select("id, amount, withdrawal_number, created_at")
    .eq("customer_id", customer.id)
    .eq("status", "pending")
    .maybeSingle();

  // 3. Текущий +ВАЙБ-долг (если включён).
  let debt = 0;
  if (vibeEnabled) {
    const { data: debtRow } = await db
      .from("customer_vibe_debt")
      .select("debt")
      .eq("customer_id", customer.id)
      .maybeSingle();
    debt = Number(debtRow?.debt ?? 0);
  }

  // 4. Статистика заказов.
  const stats = await fetchOrderStats(customer.id);

  // 5. Собираем текст.
  const lines: string[] = ["👤 <b>Твой профиль</b>", ""];
  lines.push(`Имя: ${escapeHtml(customer.name ?? customer.telegram_username ?? "—")}`);
  if (customer.phone) lines.push(`Телефон: ${escapeHtml(customer.phone)}`);

  // Блок «Деньги».
  lines.push("");
  lines.push(`💰 Баланс: <b>${formatPrice(balance)}</b>`);
  if (pendingWithdrawal) {
    const num = pendingWithdrawal.withdrawal_number as number | null;
    const numLabel = num ? ` #${num}` : "";
    lines.push(
      `🟡 Запрошено к выводу${numLabel}: ${formatPrice(Number(pendingWithdrawal.amount))} — в обработке`
    );
  }
  if (vibeEnabled) {
    lines.push(`${isFrozen ? "🔒" : "🟢"} +ВАЙБ-долг: <b>${formatPrice(debt)}</b>`);
  }

  // Блок «Статистика».
  lines.push("");
  lines.push("📊 <b>Статистика</b>");
  lines.push("");
  lines.push(`📦 Всего заказов: <b>${stats.total}</b>`);
  if (stats.inProgress > 0) lines.push(`🟢 В работе сейчас: <b>${stats.inProgress}</b>`);
  lines.push(`✅ Успешных: <b>${stats.successful}</b>`);
  lines.push(`↩️ Возвратов: <b>${stats.returned}</b>`);
  lines.push(`❌ Отменённых: <b>${stats.cancelled}</b>`);
  lines.push(`🗑 В утиле: <b>${stats.trashed}</b>`);
  lines.push(`💵 Куплено товаров на сумму: <b>${formatPrice(stats.purchasedSum)}</b>`);

  const kb = buildProfileKeyboard({
    balance,
    pendingWithdrawalId: (pendingWithdrawal?.id as string | undefined) ?? null,
    vibeEnabled,
    isFrozen,
  });

  if (options.editExisting && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fallback */
    }
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

function buildProfileKeyboard(opts: {
  balance: number;
  pendingWithdrawalId: string | null;
  vibeEnabled: boolean;
  isFrozen: boolean;
}): InlineKeyboard {
  const kb = new InlineKeyboard();

  if (opts.pendingWithdrawalId) {
    kb.text("❌ Отменить запрос вывода", `withdraw:cancel:${opts.pendingWithdrawalId}`).row();
  } else if (opts.balance > 0) {
    kb.text("💸 Запросить вывод баланса", "profile:withdraw").row();
  }

  if (opts.vibeEnabled && opts.isFrozen) {
    kb.text("💳 Оплатить долг", "vibe:pay:open").row();
  }

  kb.text("↩️ В главное меню", "customer:main");
  return kb;
}

/**
 * Запрос на вывод. Атомарно: резервирует баланс (DEC + history с reason
 * `withdrawal_request`) и создаёт `withdrawal_requests` row. Approval
 * владельцем уже не двигает баланс — только помечает done.
 */
export async function requestWithdrawal(ctx: CustomerContext, customer: Customer): Promise<void> {
  const db = getBotDb();

  const { data, error } = await db.rpc("request_withdrawal_atomic", {
    p_customer_id: customer.id,
  });

  if (error) {
    if (error.code === "23505") {
      await ctx.reply("У тебя уже есть активный запрос на вывод. Дождись обработки.");
    } else if (error.code === "22023") {
      await ctx.reply("На балансе нет средств для вывода.");
    } else {
      console.error("[profile] request_withdrawal_atomic failed:", error);
      await ctx.reply("Не удалось создать запрос. Попробуй позже.");
    }
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const requestId = row?.out_request_id as string | undefined;
  const withdrawalNumber = Number(row?.out_number ?? 0);
  const amount = Number(row?.out_amount ?? 0);
  if (!requestId || !withdrawalNumber) {
    await ctx.reply("Не удалось создать запрос. Попробуй позже.");
    return;
  }

  await ctx.reply(
    `✅ Запрос на вывод <b>№${withdrawalNumber}</b> на <b>${formatPrice(amount)}</b> создан.\n\n` +
      `Сумма зарезервирована — баланс уменьшился сразу. Владелец переведёт деньги вне бота, после этого запрос закроется. Если передумаешь — отмени из профиля, баланс вернётся.`,
    { parse_mode: "HTML" }
  );

  try {
    const customerLabel =
      (customer.name ?? customer.telegram_username)
        ? `@${customer.telegram_username}`
        : `id=${customer.tg_user_id}`;
    const { notifyWithdrawalRequest } = await import("../notifications");
    await notifyWithdrawalRequest({
      withdrawalNumber,
      amount,
      customerLabel,
    });
  } catch (err) {
    console.error("[profile] withdrawal notify failed:", err);
  }
}

/**
 * Клиент отменяет свой pending-запрос. RPC возвращает amount на баланс +
 * пишет history `withdrawal_cancel`. DM владельцу — информационный.
 */
export async function cancelWithdrawal(
  ctx: CustomerContext,
  customer: Customer,
  requestId: string
): Promise<void> {
  const db = getBotDb();

  const { data, error } = await db.rpc("cancel_withdrawal_atomic", {
    p_request_id: requestId,
    p_customer_id: customer.id,
  });

  if (error) {
    if (error.code === "P0002") {
      await ctx.reply("Этот запрос уже обработан или не найден.");
    } else {
      console.error("[profile] cancel_withdrawal_atomic failed:", error);
      await ctx.reply("Не удалось отменить запрос. Попробуй позже.");
    }
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  const withdrawalNumber = Number(row?.out_number ?? 0);
  const amount = Number(row?.out_amount ?? 0);

  await ctx.reply(
    `✅ Запрос на вывод <b>№${withdrawalNumber}</b> отменён. <b>${formatPrice(amount)}</b> вернулись на баланс.`,
    { parse_mode: "HTML" }
  );

  try {
    const customerLabel =
      (customer.name ?? customer.telegram_username)
        ? `@${customer.telegram_username}`
        : `id=${customer.tg_user_id}`;
    const { notifyWithdrawalCancelled } = await import("../notifications");
    await notifyWithdrawalCancelled({
      withdrawalNumber,
      amount,
      customerLabel,
    });
  } catch (err) {
    console.error("[profile] withdrawal cancel notify failed:", err);
  }
}

function formatPrice(p: number): string {
  return `${Number(p).toLocaleString("ru-RU")} ₽`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
