/**
 * Director-bot — операционная роль (получает чеки на проверку, когда
 * Vision auto-confirm не справился).
 *
 * Flow подтверждения:
 *   1. «<номер> да» → confirm_pending_order_atomic, заказ в работу.
 *   2. «<номер> нет» → inline-клавиатура [💸 Деньги не пришли] [🟡 Сумма не совпала]:
 *      - «Деньги не пришли» → cancel_pending_atomic, причина клиенту.
 *      - «Сумма не совпала» → ввод фактической суммы X текстом → подтверждение
 *        [✅ Да] [✏️ Изменить]:
 *          • X ≥ ожидалось → confirm + (X − ожидалось) на баланс/долг (через
 *            apply_overpayment_atomic).
 *          • X < ожидалось → cancel + X на баланс/долг.
 *
 * Привязка: владелец генерирует invite-токен в /owner/settings, шлёт
 * ссылку директору, тот делает /start <token> в этом боте.
 */

import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { getBotDb } from "../db";
import { formatPrice } from "@/lib/telegram/utils/formatters";

interface DirectorSessionData {
  awaitingMismatchAmountForPendingId?: string;
  // Подтверждение действия (после ввода X, перед confirm/cancel).
  pendingMismatchConfirmation?: { pendingId: string; actualAmount: number };
}

type DirectorContext = Context & SessionFlavor<DirectorSessionData>;

const MAX_AMOUNT_INPUT = 10_000_000; // ₽

export function createDirectorBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_DIRECTOR_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_DIRECTOR_BOT_TOKEN is not set");
  }

  const bot = new Bot<DirectorContext>(botToken);

  bot.use(session({ initial: (): DirectorSessionData => ({}) }));

  bot.catch(async (err) => {
    console.error("Director bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз или /start.");
    } catch {
      // ignore
    }
  });

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const db = getBotDb();
    const { data: settings } = await db
      .from("business_settings")
      .select("director_invite_token, director_tg_user_id, business_name")
      .limit(1)
      .maybeSingle();

    if (!settings) {
      await ctx.reply("Настройки бизнеса не загружены. Свяжись с владельцем.");
      return;
    }

    if (settings.director_tg_user_id === from.id) {
      await ctx.reply(
        `👋 Привет, директор «${settings.business_name ?? "магазина"}»!\n\n` +
          `Я шлю сюда чеки на проверку. По каждому чеку отвечай текстом:\n` +
          `• «<номер> да» — оплата получена\n` +
          `• «<номер> нет» — выбери причину кнопками`
      );
      return;
    }

    if (settings.director_tg_user_id) {
      await ctx.reply(
        "Директор уже привязан к другому аккаунту. Свяжись с владельцем — он перевыпустит ссылку."
      );
      return;
    }

    const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!payload) {
      await ctx.reply(
        "Это бот для директора магазина. Чтобы подключиться, перейди по ссылке-приглашению от владельца."
      );
      return;
    }

    if (payload !== settings.director_invite_token) {
      await ctx.reply("Приглашение недействительно — попроси владельца перевыпустить ссылку.");
      return;
    }

    const { error } = await db
      .from("business_settings")
      .update({
        director_tg_user_id: from.id,
        director_tg_username: from.username ?? null,
        director_linked_at: new Date().toISOString(),
      })
      .eq("id", (settings as { id?: string }).id ?? "");
    if (error) {
      const { error: e2 } = await db
        .from("business_settings")
        .update({
          director_tg_user_id: from.id,
          director_tg_username: from.username ?? null,
          director_linked_at: new Date().toISOString(),
        })
        .not("id", "is", null);
      if (e2) {
        console.error("[director-bot] link failed:", e2);
        await ctx.reply("Не удалось привязать аккаунт. Попробуй позже.");
        return;
      }
    }

    await ctx.reply(
      `✅ Привязан как директор «${settings.business_name ?? "магазина"}». Добро пожаловать!\n\n` +
        `Когда придёт чек на проверку — подтверждай его текстом:\n` +
        `• «<номер> да» — оплата получена, заказ в работу.\n` +
        `• «<номер> нет» — выберешь причину кнопками (деньги не пришли / сумма не совпала).`
    );
  });

  // Inline-кнопки после «<номер> нет».
  bot.callbackQuery(/^pending:no-money:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await assertDirector(ctx))) return;
    const pendingId = ctx.match[1];
    await rejectPendingNoMoney(ctx, pendingId);
  });

  bot.callbackQuery(/^pending:mismatch:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await assertDirector(ctx))) return;
    const pendingId = ctx.match[1];
    ctx.session.awaitingMismatchAmountForPendingId = pendingId;
    ctx.session.pendingMismatchConfirmation = undefined;
    const expected = await fetchPendingExpected(pendingId);
    const expectedNote =
      expected && expected.remaining !== expected.client_price
        ? ` (полная цена ${formatPrice(expected.client_price)} − ${formatPrice(expected.client_price - expected.remaining)} списано с баланса)`
        : "";
    await ctx.reply(
      `Сколько фактически пришло на счёт по заказу №${expected?.order_number ?? "?"}?\n\n` +
        `Ожидалось: ${expected ? formatPrice(expected.remaining) : "?"}${expectedNote}.\n` +
        `Напиши число рублей одним сообщением (например: 850).`
    );
  });

  bot.callbackQuery(/^pending:mismatch:confirm:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await assertDirector(ctx))) return;
    const pendingId = ctx.match[1];
    const conf = ctx.session.pendingMismatchConfirmation;
    if (!conf || conf.pendingId !== pendingId) {
      await ctx.reply("Подтверждение устарело. Начни заново через «<номер> нет».");
      return;
    }
    ctx.session.pendingMismatchConfirmation = undefined;
    ctx.session.awaitingMismatchAmountForPendingId = undefined;
    await applyMismatchDecision(ctx, pendingId, conf.actualAmount);
  });

  bot.callbackQuery(/^pending:mismatch:redo:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await assertDirector(ctx))) return;
    const pendingId = ctx.match[1];
    ctx.session.pendingMismatchConfirmation = undefined;
    ctx.session.awaitingMismatchAmountForPendingId = pendingId;
    await ctx.reply("Окей, введи фактическую сумму ещё раз (число рублей).");
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();

    if (!(await assertDirector(ctx))) return;

    if (ctx.session.awaitingMismatchAmountForPendingId) {
      await handleMismatchAmountInput(ctx, ctx.session.awaitingMismatchAmountForPendingId, text);
      return;
    }

    const decision = parsePaymentConfirmation(text);
    if (decision) {
      await handlePendingDecision(ctx, decision);
      return;
    }

    await ctx.reply(
      "Не понял. Чтобы подтвердить чек: «<номер> да». Чтобы отклонить: «<номер> нет»."
    );
  });

  return bot;
}

interface PaymentDecisionInput {
  orderNumber: number;
  decision: "yes" | "no";
}

function parsePaymentConfirmation(text: string): PaymentDecisionInput | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  let match = normalized.match(/^(\d+)\s+(да|нет)$/);
  if (match) {
    return {
      orderNumber: parseInt(match[1], 10),
      decision: (match[2] as "да" | "нет") === "да" ? "yes" : "no",
    };
  }
  match = normalized.match(/^(да|нет)\s+(\d+)$/);
  if (match) {
    return {
      orderNumber: parseInt(match[2], 10),
      decision: (match[1] as "да" | "нет") === "да" ? "yes" : "no",
    };
  }
  return null;
}

async function assertDirector(ctx: DirectorContext): Promise<boolean> {
  const directorId = await getLinkedDirectorId();
  if (!directorId || ctx.from?.id !== directorId) {
    await ctx.reply(
      "⛔ Доступ запрещён.\n\nЭтот бот только для директора. Получи ссылку-приглашение у владельца."
    );
    return false;
  }
  return true;
}

async function getLinkedDirectorId(): Promise<number | null> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("director_tg_user_id")
    .limit(1)
    .maybeSingle();
  return (data?.director_tg_user_id as number | null) ?? null;
}

async function fetchPendingExpected(
  pendingId: string
): Promise<{ order_number: number; client_price: number; remaining: number } | null> {
  const db = getBotDb();
  const { data } = await db
    .from("pending_orders")
    .select("order_number, client_price, applied_balance")
    .eq("id", pendingId)
    .maybeSingle();
  if (!data) return null;
  const clientPrice = Number(data.client_price);
  const appliedBalance = Number(data.applied_balance ?? 0);
  return {
    order_number: Number(data.order_number),
    client_price: clientPrice,
    remaining: Math.max(0, clientPrice - appliedBalance),
  };
}

async function handlePendingDecision(
  ctx: DirectorContext,
  input: PaymentDecisionInput
): Promise<void> {
  const db = getBotDb();
  const { data: pending } = await db
    .from("pending_orders")
    .select("id, customer_id, order_number, partner_id, client_price")
    .eq("order_number", input.orderNumber)
    .maybeSingle();

  if (!pending) {
    await ctx.reply(`По заказу №${input.orderNumber} нет ожидающих чеков.`);
    return;
  }

  // Любой партнёрский заказ — деньги идут партнёру, он же решает по чеку
  // в своём боте (независимо от того, на чьём складе товар). Склад влияет
  // только на отправку (мой shipper или партнёр сам). Директор тут не у дел.
  if (pending.partner_id) {
    await ctx.reply(
      `Заказ №${input.orderNumber} партнёрский — его подтверждает партнёр в своём боте.`
    );
    return;
  }

  if (input.decision === "yes") {
    await confirmPendingByDirector(ctx, pending.id, 0);
    return;
  }

  // «N нет» → две кнопки выбора причины.
  const kb = new InlineKeyboard()
    .text("💸 Деньги не пришли", `pending:no-money:${pending.id}`)
    .row()
    .text("🟡 Сумма не совпала", `pending:mismatch:${pending.id}`);
  await ctx.reply(`Что не так с заказом №${pending.order_number}?`, { reply_markup: kb });
}

async function confirmPendingByDirector(
  ctx: DirectorContext,
  pendingId: string,
  overpayment: number
): Promise<void> {
  const db = getBotDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orderIdRaw, error } = await (db.rpc as any)("confirm_pending_order_atomic", {
    p_pending_order_id: pendingId,
    p_payment_method: "card",
    p_confirmed_by: "director",
  }).single();

  if (error || !orderIdRaw) {
    console.error("[director-bot] confirm_pending_order_atomic failed:", error);
    await ctx.reply("Не удалось подтвердить. Попробуй ещё раз.");
    return;
  }
  const orderId = orderIdRaw as string;

  const { cancelExpirePendingOrder, cancelDirectorPaymentExpire } =
    await import("@/lib/jobs/queues");
  cancelExpirePendingOrder(pendingId).catch((e) =>
    console.error("cancelExpirePendingOrder failed:", e)
  );
  cancelDirectorPaymentExpire(pendingId).catch((e) =>
    console.error("cancelDirectorPaymentExpire failed:", e)
  );

  let overpayResult: { debt_paid: number; credit_to_balance: number; new_balance: number } | null =
    null;
  if (overpayment > 0) {
    const { data: customerRow } = await db
      .from("orders")
      .select("customer_id")
      .eq("id", orderId)
      .maybeSingle();
    if (customerRow?.customer_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: applied } = await (db.rpc as any)("apply_overpayment_atomic", {
        p_customer_id: customerRow.customer_id,
        p_amount: overpayment,
        p_order_id: orderId,
      }).single();
      if (applied) {
        overpayResult = {
          debt_paid: Number(applied.debt_paid ?? 0),
          credit_to_balance: Number(applied.credit_to_balance ?? 0),
          new_balance: Number(applied.new_balance ?? 0),
        };
      }
    }
  }

  // Notify customer & post group summary.
  const { data: order } = await db
    .from("orders")
    .select("customer_id, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (order?.customer_id) {
    const { notifyCustomerOrderApproved } = await import("../notifications");
    notifyCustomerOrderApproved({
      customerId: order.customer_id,
      orderId,
      orderNumber: order.order_number,
    }).catch((e) => console.error("notifyCustomerOrderApproved failed:", e));
  }

  const { upsertOrderSummary, buildSummaryFromOrderId } = await import("../orders-group");
  buildSummaryFromOrderId(orderId)
    .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
    .catch((e) => console.error("upsertOrderSummary (director-confirm) failed:", e));

  const tail = overpayResult
    ? `\nПереплата ${formatPrice(overpayment)}: ` +
      (overpayResult.debt_paid > 0
        ? `${formatPrice(overpayResult.debt_paid)} → погашение долга, `
        : "") +
      (overpayResult.credit_to_balance > 0
        ? `${formatPrice(overpayResult.credit_to_balance)} → на баланс клиента (итого ${formatPrice(overpayResult.new_balance)}).`
        : "всё ушло в долг.")
    : "";

  await ctx.reply(`✅ Подтвердил. Заказ №${order?.order_number ?? ""} в работе.${tail}`);
}

async function rejectPendingNoMoney(ctx: DirectorContext, pendingId: string): Promise<void> {
  const db = getBotDb();
  const { data: pending } = await db
    .from("pending_orders")
    .select("id, customer_id, order_number")
    .eq("id", pendingId)
    .maybeSingle();

  if (!pending) {
    await ctx.reply("Pending уже снят.");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.rpc as any)("cancel_pending_order_atomic", {
    p_pending_order_id: pendingId,
  }).single();

  if (error) {
    console.error("[director-bot] cancel_pending_order_atomic failed:", error);
    await ctx.reply("Не удалось отклонить. Попробуй ещё раз.");
    return;
  }

  const { cancelExpirePendingOrder, cancelDirectorPaymentExpire } =
    await import("@/lib/jobs/queues");
  cancelExpirePendingOrder(pendingId).catch((e) =>
    console.error("cancelExpirePendingOrder failed:", e)
  );
  cancelDirectorPaymentExpire(pendingId).catch((e) =>
    console.error("cancelDirectorPaymentExpire failed:", e)
  );

  if (pending.customer_id) {
    const { notifyCustomerOrderCancelled } = await import("../notifications");
    const supportLine = await buildSupportLine();
    notifyCustomerOrderCancelled({
      customerId: pending.customer_id,
      orderId: pendingId,
      orderNumber: pending.order_number,
      reason: `деньги по чеку не пришли на наш счёт. Если перевод сделан — пиши ${supportLine}, разберёмся.`,
    }).catch((e) => console.error("notifyCustomerOrderCancelled failed:", e));
  }

  await ctx.reply(
    `Принял. Заказ №${pending.order_number} отменён, клиенту ушло «деньги не пришли».`
  );
}

async function handleMismatchAmountInput(
  ctx: DirectorContext,
  pendingId: string,
  text: string
): Promise<void> {
  const cleaned = text.replace(/\s|₽|руб\.?/gi, "").replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT_INPUT) {
    await ctx.reply(
      `Не понял сумму. Напиши число рублей от 1 до ${MAX_AMOUNT_INPUT.toLocaleString("ru-RU")} (например: 850).`
    );
    return;
  }

  const expected = await fetchPendingExpected(pendingId);
  if (!expected) {
    ctx.session.awaitingMismatchAmountForPendingId = undefined;
    ctx.session.pendingMismatchConfirmation = undefined;
    await ctx.reply("Pending уже снят. Действие невозможно.");
    return;
  }

  const actual = Math.round(value * 100) / 100;
  ctx.session.pendingMismatchConfirmation = { pendingId, actualAmount: actual };

  const diff = actual - expected.remaining;
  const action =
    diff >= 0
      ? `✅ Заказ будет подтверждён, переплата ${formatPrice(diff)} — на долг/баланс клиента.`
      : `❌ Заказ будет отменён, ${formatPrice(actual)} — на баланс клиента (на следующий заказ).`;

  const kb = new InlineKeyboard()
    .text("✅ Да, применить", `pending:mismatch:confirm:${pendingId}`)
    .row()
    .text("✏️ Изменить сумму", `pending:mismatch:redo:${pendingId}`);

  await ctx.reply(
    `Принял: <b>${formatPrice(actual)}</b> (ожидалось к доплате ${formatPrice(expected.remaining)}).\n\n` +
      `${action}`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function applyMismatchDecision(
  ctx: DirectorContext,
  pendingId: string,
  actualAmount: number
): Promise<void> {
  const db = getBotDb();
  const { data: pending } = await db
    .from("pending_orders")
    .select("id, customer_id, order_number, client_price, applied_balance")
    .eq("id", pendingId)
    .maybeSingle();

  if (!pending) {
    await ctx.reply("Pending уже снят.");
    return;
  }

  const remaining = Math.max(
    0,
    Number(pending.client_price) - Number(pending.applied_balance ?? 0)
  );

  if (actualAmount >= remaining) {
    const overpayment = actualAmount - remaining;
    await confirmPendingByDirector(ctx, pendingId, overpayment);
    return;
  }

  // X < expected → cancel + apply X на баланс.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: cancelErr } = await (db.rpc as any)("cancel_pending_order_atomic", {
    p_pending_order_id: pendingId,
  }).single();
  if (cancelErr) {
    console.error("[director-bot] cancel_pending_order_atomic failed:", cancelErr);
    await ctx.reply("Не удалось отменить. Попробуй ещё раз.");
    return;
  }

  const { cancelExpirePendingOrder, cancelDirectorPaymentExpire } =
    await import("@/lib/jobs/queues");
  cancelExpirePendingOrder(pendingId).catch((e) =>
    console.error("cancelExpirePendingOrder failed:", e)
  );
  cancelDirectorPaymentExpire(pendingId).catch((e) =>
    console.error("cancelDirectorPaymentExpire failed:", e)
  );

  let result: { debt_paid: number; credit_to_balance: number; new_balance: number } | null = null;
  if (pending.customer_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: applied } = await (db.rpc as any)("apply_overpayment_atomic", {
      p_customer_id: pending.customer_id,
      p_amount: actualAmount,
      p_order_id: null,
    }).single();
    if (applied) {
      result = {
        debt_paid: Number(applied.debt_paid ?? 0),
        credit_to_balance: Number(applied.credit_to_balance ?? 0),
        new_balance: Number(applied.new_balance ?? 0),
      };
    }
  }

  if (pending.customer_id) {
    const { notifyCustomerOrderCancelled } = await import("../notifications");
    const reasonParts: string[] = [
      `сумма ${formatPrice(actualAmount)} меньше нужной ${formatPrice(remaining)}.`,
    ];
    if (result?.credit_to_balance && result.credit_to_balance > 0) {
      reasonParts.push(
        `Зачислено ${formatPrice(result.credit_to_balance)} на баланс — используй при следующем заказе. Текущий баланс: ${formatPrice(result.new_balance)}.`
      );
    }
    if (result?.debt_paid && result.debt_paid > 0) {
      reasonParts.push(`Из них ${formatPrice(result.debt_paid)} ушли на погашение долга.`);
    }
    notifyCustomerOrderCancelled({
      customerId: pending.customer_id,
      orderId: pendingId,
      orderNumber: Number(pending.order_number),
      reason: reasonParts.join(" "),
    }).catch((e) => console.error("notifyCustomerOrderCancelled failed:", e));
  }

  const tail = result
    ? `\n${formatPrice(actualAmount)}: ` +
      (result.debt_paid > 0 ? `${formatPrice(result.debt_paid)} → долг, ` : "") +
      (result.credit_to_balance > 0
        ? `${formatPrice(result.credit_to_balance)} → баланс (итого ${formatPrice(result.new_balance)}).`
        : "всё ушло в долг.")
    : "";
  await ctx.reply(
    `Принял. Заказ №${pending.order_number} отменён, клиенту ушло объяснение.${tail}`
  );
}

async function buildSupportLine(): Promise<string> {
  const db = getBotDb();
  const { data: settings } = await db
    .from("business_settings")
    .select("director_tg_username, support_telegram_username")
    .maybeSingle();
  const raw =
    (settings?.director_tg_username as string | null) ||
    (settings?.support_telegram_username as string | null) ||
    null;
  if (!raw) return "поддержку";
  return `@${raw.replace(/^@/, "")}`;
}
