/**
 * Partner-bot — связь с партнёрами (поставщиками чужих товаров).
 *
 * Phase 3.8: skeleton — `/start <invite_token>` привязывает tg_user_id
 * к записи partners. Phase 3.9 добавит обмен реквизитами и подтверждение
 * получения оплаты, Phase 3.10 — отправку треков.
 */

import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { getBotDb } from "../db";
import { formatPrice } from "../utils/formatters";
import { notifyCustomerOrderCancelled } from "../notifications";
import { editOrderSummary, buildSummaryFromOrderId } from "../orders-group";
import { moscowLocalToDate, moscowToday, parseFlexibleDate } from "@/lib/utils/moscow-time";
import { scheduleTrumpetNotifications } from "@/lib/jobs/queues";
import {
  executePartnerMarkSent,
  executePartnerMarkReturnPicked,
  executePartnerCancelNoStock,
  type PartnerOrderForAction,
} from "@/lib/orders/partner-actions";
import type { Database } from "@/types/database.generated";

type Partner = Database["public"]["Tables"]["partners"]["Row"];

export interface PartnerSessionData {
  // Phase G.4: партнёр готовится прислать чек погашения комиссионного долга.
  awaitingCommissionDebtReceipt?: {
    debtAmount: number;
    orderIds: string[];
  };
  // Экран 4 (в): партнёр настраивает статичные реквизиты выбранного типа —
  // ждём текст (card/sbp) или фото (ip_qr).
  awaitingNewRequisitesType?: RequisitesType;
  // Заполненный черновик реквизитов, ждёт подтверждения сохранения.
  pendingRequisites?: PartnerRequisites;
}

export type RequisitesType = "card" | "sbp" | "ip_qr";

export type PartnerRequisites =
  | { type: "card"; value: string }
  | { type: "sbp"; value: string }
  | { type: "ip_qr"; file_id: string };

const REQUISITES_TYPE_LABELS: Record<RequisitesType, string> = {
  card: "💳 Карта",
  sbp: "📱 СБП",
  ip_qr: "🧾 ИП — оплата по QR",
};

const REQUISITES_TYPE_PROMPTS: Record<RequisitesType, string> = {
  card:
    "Пришли реквизиты карты одним сообщением. Пример:\n\n" +
    "<code>2202202011112222\nСбер\nИван И.</code>",
  sbp:
    "Пришли реквизиты СБП одним сообщением. Пример:\n\n" +
    "<code>+79991234567\nСбер\nИван И.</code>",
  ip_qr: "Пришли фото с QR-кодом для оплаты по реквизитам ИП.",
};

export type PartnerContext = Context & SessionFlavor<PartnerSessionData>;

const HELP_TEXT =
  "❓ Это бот для партнёров.\n\n" +
  "Что я шлю:\n" +
  "• 🧾 чек по заказу на твой товар — отвечай текстом «<номер> да» / «<номер> нет»\n" +
  "• 💳 чек на погашение долга +ВАЙБ-клиента:\n" +
  "   — один заказ в чеке → текстом «<номер> да/нет»\n" +
  "   — несколько заказов → кнопками ✅/❌ под фото\n" +
  "• 📋 каждые 3 часа — дайджест чеков на твоей проверке\n" +
  "• ↩️ когда клиент вернул или отменил заказ — пришлю инструкцию вернуть деньги\n\n" +
  "Меню снизу:\n" +
  "• ⚙️ Мои реквизиты — пока их нет, твои товары не появятся в каталоге у клиентов\n" +
  "• 📦 Мои заказы — список текущих\n" +
  "• 💰 Должники — клиенты с долгами по +ВАЙБ\n" +
  "• 💳 Долг по комиссиям — твой долг владельцу за комиссии";

export function createPartnerBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_PARTNER_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_PARTNER_BOT_TOKEN is not set");
  }

  const bot = new Bot<PartnerContext>(botToken);

  bot.use(
    session({
      initial: (): PartnerSessionData => ({}),
    })
  );

  bot.catch(async (err) => {
    console.error("Partner bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз или /start.");
    } catch {
      // ignore
    }
  });

  // /start <invite_token> — привязка партнёра.
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Если уже привязан — главное меню.
    const existing = await findPartnerByTelegramId(from.id);
    if (existing) {
      await sendPartnerMenu(ctx, existing);
      return;
    }

    // Берём invite_token из startPayload (после /start).
    const payload = ctx.match;
    const token = typeof payload === "string" ? payload.trim() : "";

    if (!token) {
      await ctx.reply(
        "Это бот для партнёров. Чтобы подключиться, перейди по ссылке-приглашению от владельца магазина."
      );
      return;
    }

    const partner = await findPartnerByInviteToken(token);
    if (!partner) {
      await ctx.reply("Приглашение недействительно — попроси владельца перевыпустить ссылку.");
      return;
    }
    // is_active=false штатно для нового партнёра — он становится active
    // только после настройки реквизитов через ⚙️ Мои реквизиты. Если же
    // партнёр уже когда-то был привязан и потом деактивирован — это
    // другая ситуация, тогда проверяем.
    if (!partner.is_active && partner.tg_user_id) {
      await ctx.reply("Партнёр деактивирован — свяжись с владельцем.");
      return;
    }

    if (partner.tg_user_id && partner.tg_user_id !== from.id) {
      await ctx.reply(
        "Это приглашение уже привязано к другому Telegram-аккаунту. Свяжись с владельцем — он перевыпустит ссылку."
      );
      return;
    }

    const linked = await linkPartnerTelegramId(partner.id, from.id, from.username);
    if (!linked) {
      await ctx.reply("Не удалось привязать аккаунт. Попробуй ещё раз через /start.");
      return;
    }
    await ctx.reply(
      `✅ Привязан к партнёру «${linked.name}». Добро пожаловать! 👋\n\n` +
        `Я буду писать сюда:\n` +
        `• ✅ когда клиент пришлёт чек по партнёрскому заказу — попрошу подтвердить получение денег\n` +
        `• 📋 каждые 3 часа — дайджест чеков на твоей проверке\n\n` +
        `Меню снизу — для управления реквизитами и просмотра активных заказов.`
    );
    await sendPartnerMenu(ctx, linked);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });

  bot.on("message:text", async (ctx) => {
    const partner = await findPartnerByTelegramId(ctx.from?.id ?? 0);
    if (!partner) {
      await ctx.reply("Ты пока не привязан. Перейди по ссылке-приглашению от владельца.");
      return;
    }

    // Партнёр настраивает свои статичные реквизиты — ждём текст для card/sbp.
    if (ctx.session.awaitingNewRequisitesType) {
      await handleNewRequisitesText(
        ctx,
        ctx.session.awaitingNewRequisitesType,
        ctx.message.text.trim()
      );
      return;
    }

    // Парсинг подтверждения оплаты партнёром: «N да» или «N нет»
    // (см. экран 4 (г) канона §10.2). Регистр любой, пробелы любые.
    const confirmation = parsePaymentConfirmation(ctx.message.text);
    if (confirmation) {
      await handlePaymentConfirmation(ctx, partner, confirmation);
      return;
    }

    // Главное меню по тексту.
    if (ctx.message.text === "⚙️ Мои реквизиты") {
      await sendRequisitesView(ctx, partner);
      return;
    }
    if (
      ctx.message.text === "📦 Мои заказы" ||
      ctx.message.text === "📦 Мои активные заказы" // legacy reply_keyboard до G.5
    ) {
      await openPartnerOrders(ctx, partner);
      return;
    }
    if (ctx.message.text === "💳 Долг по комиссиям") {
      await sendCommissionDebt(ctx, partner);
      return;
    }
    if (ctx.message.text === "💰 Должники") {
      await sendDebtors(ctx, partner);
      return;
    }
    if (ctx.message.text === "❓ Помощь") {
      await ctx.reply(HELP_TEXT);
      return;
    }

    await ctx.reply("Используй кнопки меню или /start.");
  });

  // Phase G.4: «💳 Оплатить долг по комиссиям» — старт wizard'а погашения.
  bot.callbackQuery("partner:debt:pay", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await startCommissionDebtPayment(ctx, partner);
  });

  // «📢 Протрубить возвраты» — партнёр шлёт серию DM-напоминаний клиентам
  // про код возврата по своим заказам. Один раз в день.
  bot.callbackQuery("partner:trumpet", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await startPartnerTrumpet(ctx, partner);
  });

  // Партнёр шлёт фото — может быть QR-реквизитами или чеком долга.
  bot.on("message:photo", async (ctx) => {
    const partner = await findPartnerByTelegramId(ctx.from?.id ?? 0);
    if (!partner) return;
    // Настройка реквизитов имеет приоритет — партнёр явно начал её первым.
    if (ctx.session.awaitingNewRequisitesType) {
      await handleNewRequisitesPhoto(ctx, ctx.session.awaitingNewRequisitesType);
      return;
    }
    if (ctx.session.awaitingCommissionDebtReceipt) {
      await handleCommissionDebtReceiptPhoto(ctx, partner);
    }
  });

  // Экран 4 (в): UI «⚙️ Мои реквизиты». «Изменить» из просмотра ведёт
  // на picker типа (с подсветкой текущего).
  bot.callbackQuery("partner:requisites:edit", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    const current = parseRequisites(partner.payment_requisites);
    await sendRequisitesTypePicker(ctx, current?.type ?? null);
  });

  bot.callbackQuery(/^partner:requisites:type:(card|sbp|ip_qr)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const type = ctx.match[1] as RequisitesType;
    ctx.session.awaitingNewRequisitesType = type;
    ctx.session.pendingRequisites = undefined;
    await sendRequisitesPrompt(ctx, type);
  });

  bot.callbackQuery("partner:requisites:back-to-types", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    ctx.session.awaitingNewRequisitesType = undefined;
    ctx.session.pendingRequisites = undefined;
    const current = parseRequisites(partner.payment_requisites);
    await sendRequisitesTypePicker(ctx, current?.type ?? null);
  });

  bot.callbackQuery("partner:requisites:save", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await saveRequisites(ctx, partner);
  });

  bot.callbackQuery("partner:requisites:rewrite", async (ctx) => {
    await ctx.answerCallbackQuery();
    const draft = ctx.session.pendingRequisites;
    const type = draft?.type ?? ctx.session.awaitingNewRequisitesType;
    if (!type) {
      // Сессия потерялась — отправляем на picker.
      const partner = await findPartnerByTelegramId(ctx.from.id);
      if (!partner) return;
      const current = parseRequisites(partner.payment_requisites);
      await sendRequisitesTypePicker(ctx, current?.type ?? null);
      return;
    }
    ctx.session.pendingRequisites = undefined;
    ctx.session.awaitingNewRequisitesType = type;
    await sendRequisitesPrompt(ctx, type);
  });

  // Кнопка «❌ Нет в наличии» под сообщением заказа.
  bot.callbackQuery(/^partner:cancel:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handlePartnerCancel(ctx, partner, orderId);
  });

  // +ВАЙБ-долг: партнёр подтверждает чек на группу заказов.
  bot.callbackQuery(/^vibe-pay:confirm:([0-9a-f-]+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handleVibePaymentConfirm(ctx, partner, paymentId);
  });

  // +ВАЙБ-долг: партнёр отказывается («деньги не пришли»).
  bot.callbackQuery(/^vibe-pay:reject:([0-9a-f-]+)$/, async (ctx) => {
    const paymentId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handleVibePaymentReject(ctx, partner, paymentId);
  });

  // «📦 Мои заказы» — переключение фильтра.
  bot.callbackQuery(/^partnerorders:f:(active|shipped|cancelled|all)$/, async (ctx) => {
    const filter = ctx.match[1] as PartnerOrderFilter;
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await openPartnerOrders(ctx, partner, filter, 0, { editExisting: true });
  });

  // «📦 Мои заказы» — пагинация.
  bot.callbackQuery(/^partnerorders:p:(active|shipped|cancelled|all):(\d+)$/, async (ctx) => {
    const filter = ctx.match[1] as PartnerOrderFilter;
    const page = parseInt(ctx.match[2], 10);
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await openPartnerOrders(ctx, partner, filter, page, { editExisting: true });
  });

  // «📦 Мои заказы» — открыть карточку.
  bot.callbackQuery(/^partnerorders:card:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await openPartnerOrderCard(ctx, partner, orderId, { editExisting: true });
  });

  // «📦 Мои заказы» — назад к списку.
  bot.callbackQuery("partnerorders:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await openPartnerOrders(ctx, partner, "active", 0, { editExisting: true });
  });

  // Карточка → «✅ Отправил» (paid → sent, source_warehouse='partner').
  bot.callbackQuery(/^partner-order:ship:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handlePartnerOrderShip(ctx, partner, orderId);
  });

  // Карточка → «❌ Нет размера» (paid → cancelled, source_warehouse='partner').
  bot.callbackQuery(/^partner-order:no-size:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handlePartnerOrderNoStock(ctx, partner, orderId, "size");
  });

  // Карточка → «❌ Нет товара» (paid → cancelled, source_warehouse='partner').
  bot.callbackQuery(/^partner-order:no-product:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handlePartnerOrderNoStock(ctx, partner, orderId, "product");
  });

  // Карточка → «✅ Забрал» (return → return_done, source_warehouse='partner').
  bot.callbackQuery(/^partner-order:return-picked:([0-9a-f-]+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const partner = await findPartnerByTelegramId(ctx.from.id);
    if (!partner) return;
    await handlePartnerOrderReturnPicked(ctx, partner, orderId);
  });

  return bot;
}

// ============================================
// DB helpers
// ============================================

async function findPartnerByTelegramId(telegramId: number): Promise<Partner | null> {
  if (!telegramId) return null;
  const db = getBotDb();
  const { data } = await db.from("partners").select("*").eq("tg_user_id", telegramId).maybeSingle();
  return data;
}

async function findPartnerByInviteToken(token: string): Promise<Partner | null> {
  const db = getBotDb();
  const { data } = await db.from("partners").select("*").eq("invite_token", token).maybeSingle();
  return data;
}

async function linkPartnerTelegramId(
  partnerId: string,
  telegramId: number,
  username: string | undefined
): Promise<Partner | null> {
  const db = getBotDb();
  const { data } = await db
    .from("partners")
    .update({
      tg_user_id: telegramId,
      tg_username: username ?? null,
    })
    .eq("id", partnerId)
    .select("*")
    .single();
  return data;
}

// ============================================
// Реквизиты партнёра — настройка и просмотр (G.2 v2, экран 4 (в))
// ============================================

async function sendRequisitesView(ctx: PartnerContext, partner: Partner): Promise<void> {
  const req = parseRequisites(partner.payment_requisites);

  if (!req) {
    await sendRequisitesTypePicker(ctx, null);
    return;
  }

  const editKb = new InlineKeyboard().text("✏️ Изменить", "partner:requisites:edit");
  const header = `<b>${REQUISITES_TYPE_LABELS[req.type]}</b>`;

  if (req.type === "ip_qr") {
    await ctx.replyWithPhoto(req.file_id, {
      caption: header,
      parse_mode: "HTML",
      reply_markup: editKb,
    });
    return;
  }

  await ctx.reply(`${header}\n\n<code>${escapeHtml(req.value)}</code>`, {
    parse_mode: "HTML",
    reply_markup: editKb,
  });
}

async function sendRequisitesTypePicker(
  ctx: PartnerContext,
  currentType: RequisitesType | null
): Promise<void> {
  const labelFor = (t: RequisitesType): string => {
    const base = REQUISITES_TYPE_LABELS[t];
    return currentType === t ? `${base} ✓` : base;
  };
  const kb = new InlineKeyboard()
    .text(labelFor("card"), "partner:requisites:type:card")
    .text(labelFor("sbp"), "partner:requisites:type:sbp")
    .row()
    .text(labelFor("ip_qr"), "partner:requisites:type:ip_qr");

  const intro = currentType
    ? "Выбери тип реквизитов — можно переключиться на другой:"
    : "У тебя ещё нет реквизитов для оплаты.\nВыбери тип, чтобы настроить:";

  await ctx.reply(intro, { reply_markup: kb });
}

async function sendRequisitesPrompt(ctx: PartnerContext, type: RequisitesType): Promise<void> {
  const kb = new InlineKeyboard().text("⬅️ Назад", "partner:requisites:back-to-types");
  await ctx.reply(REQUISITES_TYPE_PROMPTS[type], {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

async function handleNewRequisitesText(
  ctx: PartnerContext,
  type: RequisitesType,
  text: string
): Promise<void> {
  if (type === "ip_qr") {
    await ctx.reply(
      "Тут нужен QR-код картинкой. Пришли фото или вернись назад чтобы выбрать другой тип.",
      {
        reply_markup: new InlineKeyboard().text("⬅️ Назад", "partner:requisites:back-to-types"),
      }
    );
    return;
  }
  if (text.length < 5 || text.length > 1000) {
    await ctx.reply("Реквизиты должны быть от 5 до 1000 символов. Пришли ещё раз.");
    return;
  }
  const draft: PartnerRequisites = { type, value: text };
  ctx.session.pendingRequisites = draft;
  ctx.session.awaitingNewRequisitesType = undefined;
  await sendRequisitesPreview(ctx, draft);
}

async function handleNewRequisitesPhoto(ctx: PartnerContext, type: RequisitesType): Promise<void> {
  if (type !== "ip_qr") {
    await ctx.reply(
      `Для типа «${REQUISITES_TYPE_LABELS[type]}» нужны реквизиты текстом, не фото. ` +
        "Пришли текст или вернись назад чтобы выбрать другой тип.",
      {
        reply_markup: new InlineKeyboard().text("⬅️ Назад", "partner:requisites:back-to-types"),
      }
    );
    return;
  }
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;
  const best = photos[photos.length - 1];

  const draft: PartnerRequisites = { type: "ip_qr", file_id: best.file_id };
  ctx.session.pendingRequisites = draft;
  ctx.session.awaitingNewRequisitesType = undefined;
  await sendRequisitesPreview(ctx, draft);
}

async function sendRequisitesPreview(ctx: PartnerContext, draft: PartnerRequisites): Promise<void> {
  const kb = new InlineKeyboard()
    .text("✅ Сохранить", "partner:requisites:save")
    .text("✏️ Переписать", "partner:requisites:rewrite")
    .row()
    .text("⬅️ Сменить тип", "partner:requisites:back-to-types");

  const header = `Проверь — так и отправлять клиентам?\n\nТип: <b>${REQUISITES_TYPE_LABELS[draft.type]}</b>`;

  if (draft.type === "ip_qr") {
    await ctx.replyWithPhoto(draft.file_id, {
      caption: header,
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return;
  }

  await ctx.reply(`${header}\n\n<code>${escapeHtml(draft.value)}</code>`, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

async function saveRequisites(ctx: PartnerContext, partner: Partner): Promise<void> {
  const draft = ctx.session.pendingRequisites;
  if (!draft) {
    await ctx.reply("Нечего сохранять — начни заново через ⚙️ Мои реквизиты.");
    return;
  }

  const db = getBotDb();
  const wasInactive = !partner.is_active;
  const updatePayload: { payment_requisites: PartnerRequisites; is_active?: boolean } = {
    payment_requisites: draft,
  };
  // При первой настройке сразу активируем партнёра, чтобы товары появились в каталоге.
  if (wasInactive) {
    updatePayload.is_active = true;
  }

  const { error } = await db.from("partners").update(updatePayload).eq("id", partner.id);
  if (error) {
    console.error("[partner-bot] save requisites failed:", error);
    await ctx.reply("Не удалось сохранить. Попробуй ещё раз.");
    return;
  }

  ctx.session.pendingRequisites = undefined;
  ctx.session.awaitingNewRequisitesType = undefined;

  const tail = wasInactive
    ? "\n\nТвои товары теперь видны клиентам в каталоге."
    : "\n\nКлиенты увидят их при оплате твоих товаров.";

  await ctx.reply(`✅ Реквизиты сохранены.${tail}`);
}

function parseRequisites(raw: unknown): PartnerRequisites | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type === "card" && typeof obj.value === "string") {
    return { type: "card", value: obj.value };
  }
  if (obj.type === "sbp" && typeof obj.value === "string") {
    return { type: "sbp", value: obj.value };
  }
  if (obj.type === "ip_qr" && typeof obj.file_id === "string") {
    return { type: "ip_qr", file_id: obj.file_id };
  }
  // Legacy (G.2 v2 первой итерации, до разделения на 3 типа): мапим в card/ip_qr.
  if (obj.type === "text" && typeof obj.value === "string") {
    return { type: "card", value: obj.value };
  }
  if (obj.type === "photo" && typeof obj.file_id === "string") {
    return { type: "ip_qr", file_id: obj.file_id };
  }
  return null;
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================
// Подтверждение оплаты партнёром (G.2 v2, экран 4 (г))
// ============================================

interface PaymentConfirmationInput {
  orderNumber: number;
  decision: "yes" | "no";
}

/**
 * Парсит ответ партнёра вида «42 да» или «42 нет».
 * Возвращает null если формат не подходит. Регистр и лишние пробелы
 * игнорируются. Допустим обратный порядок «да 42» / «нет 42» — на
 * случай если партнёру так удобнее.
 */
function parsePaymentConfirmation(text: string): PaymentConfirmationInput | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  let match = normalized.match(/^(\d+)\s+(да|нет)$/);
  if (!match) {
    match = normalized.match(/^(да|нет)\s+(\d+)$/);
    if (match) {
      const decision = match[1] as "да" | "нет";
      const orderNumber = parseInt(match[2], 10);
      return { orderNumber, decision: decision === "да" ? "yes" : "no" };
    }
    return null;
  }
  const orderNumber = parseInt(match[1], 10);
  const decisionWord = match[2] as "да" | "нет";
  return { orderNumber, decision: decisionWord === "да" ? "yes" : "no" };
}

async function handlePaymentConfirmation(
  ctx: PartnerContext,
  partner: Partner,
  input: PaymentConfirmationInput
): Promise<void> {
  const db = getBotDb();

  // §4.1 → 🅐: партнёрский заказ до оплаты живёт в pending_orders.
  // Партнёр пишет «<order_number> да/нет» — ищем по order_number.
  const { data: pending } = await db
    .from("pending_orders")
    .select(
      "id, order_number, customer_id, partner_id, product_id, product_size_id, receipt_received_at, is_vibe_debt, client_price, applied_balance"
    )
    .eq("order_number", input.orderNumber)
    .eq("partner_id", partner.id)
    .maybeSingle();

  if (pending) {
    await handlePartnerConfirmationOnPending(ctx, partner, pending, input);
    return;
  }

  // Fallback: orders row (для +ВАЙБ-партнёрских заказов, которые работают
  // в долг и попадают в orders сразу).
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, status, is_paid, partner_id, customer_id, product_id, product_size_id, delivery_service, tracking_number"
    )
    .eq("order_number", input.orderNumber)
    .eq("partner_id", partner.id)
    .maybeSingle();

  if (!order) {
    await ctx.reply(`По заказу №${input.orderNumber} у тебя нет ожидающих чеков.`);
    return;
  }

  // Single-order vibe-pay: после оплаты клиентом vibe_payments + linkage
  // создаются в recognize-receipt; партнёру шлётся чек БЕЗ кнопок (см.
  // sendVibeDebtReceiptToPartner({useTextFlow: true})), он подтверждает
  // текстом «<N> да/нет». Ищем pending vibe_payment с linkage ровно на
  // этот один заказ — если есть, проксируем в handleVibePayment*.
  // Группа из нескольких заказов — отдельный путь (кнопки), сюда не
  // попадает.
  const { data: linkages } = await db
    .from("vibe_payment_orders")
    .select("vibe_payment_id, vibe_payments!inner(id, confirmed_at, rejected_at)")
    .eq("order_id", order.id);

  const hasAnyVibePaymentLinkage = (linkages ?? []).length > 0;

  for (const linkage of linkages ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = linkage.vibe_payments as any;
    if (vp.confirmed_at || vp.rejected_at) continue;
    const { count } = await db
      .from("vibe_payment_orders")
      .select("*", { count: "exact", head: true })
      .eq("vibe_payment_id", vp.id);
    if (count === 1) {
      if (input.decision === "yes") {
        await handleVibePaymentConfirm(ctx, partner, vp.id);
      } else {
        await handleVibePaymentReject(ctx, partner, vp.id);
      }
      return;
    }
  }

  // Защита от дублирования платежа: если у заказа есть vibe_payment_orders
  // linkages (любого статуса — confirmed/rejected/в группе>1), значит это
  // +ВАЙБ-долговый заказ. Запрещаем legacy-путь `orders.is_paid=true` —
  // он не пересчитает customer_vibe_debt. Партнёр должен подтверждать
  // через vibe-pay flow (новый чек от клиента создаст новый vibe_payment).
  if (hasAnyVibePaymentLinkage) {
    await ctx.reply(
      `По заказу №${input.orderNumber} оплата идёт через +ВАЙБ-долг. ` +
        `Если предыдущий чек был отклонён — клиент пришлёт новый, тогда я ` +
        `переброшу его сюда на подтверждение. Если деньги уже пришли вне чека — ` +
        `свяжись с владельцем.`
    );
    return;
  }

  if (order.is_paid || order.status !== "paid") {
    await ctx.reply(`По заказу №${input.orderNumber} ты уже подтвердил оплату или он закрыт.`);
    return;
  }

  if (input.decision === "yes") {
    await db
      .from("orders")
      .update({
        is_paid: true,
        partner_payment_received_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    const { cancelPartnerPaymentTimers } = await import("@/lib/jobs/queues");
    cancelPartnerPaymentTimers(order.id).catch((e) =>
      console.error("cancelPartnerPaymentTimers failed:", e)
    );

    if (order.customer_id) {
      const { notifyCustomerOrderApproved } = await import("../notifications");
      notifyCustomerOrderApproved({
        customerId: order.customer_id,
        orderId: order.id,
        orderNumber: order.order_number,
      }).catch((e) => console.error("notifyCustomerOrderApproved failed:", e));
    }

    const { upsertOrderSummary, buildSummaryFromOrderId } = await import("../orders-group");
    buildSummaryFromOrderId(order.id)
      .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
      .catch((e) => console.error("upsertOrderSummary (partner-confirm) failed:", e));

    await ctx.reply(`Подтвердил. Заказ №${order.order_number} в работе.`);
    return;
  }

  // decision === "no" — оплата не пришла. Канон 2026-05-26: при подтверждении
  // чека только бинарка (да/нет), причины «размер/товар закончился»
  // переехали в карточку 🚚 «На отправку» (после confirm-чека). Здесь —
  // простая отмена заказа без переспросов.
  await db
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "partner_rejected_payment",
    })
    .eq("id", order.id);

  if (order.product_size_id) {
    await db
      .rpc("decrement_reserved_quantity", {
        size_id: order.product_size_id,
        amount: 1,
      })
      .then((r) => {
        if (r.error) console.error("[partner-bot] decrement_reserved_quantity failed:", r.error);
      });
  }

  const { cancelPartnerPaymentTimers } = await import("@/lib/jobs/queues");
  cancelPartnerPaymentTimers(order.id).catch((e) =>
    console.error("cancelPartnerPaymentTimers failed:", e)
  );

  if (order.customer_id) {
    await notifyCustomerOfPartnerPaymentReject(
      db,
      partner,
      order.customer_id,
      order.id,
      order.order_number
    );
  }

  await ctx.reply(`Принял. Заказ №${order.order_number} отменён.`);
}

/**
 * Партнёр подтверждает оплату на pending_orders записи (§4.1 → 🅐).
 * На «N да» → confirm_pending_order_atomic создаёт orders row, удаляет pending,
 * post в группу клиентов. На «N нет» — переход в handleRejectionReason.
 */
async function handlePartnerConfirmationOnPending(
  ctx: PartnerContext,
  partner: Partner,
  pending: {
    id: string;
    order_number: number;
    customer_id: string | null;
    partner_id: string | null;
    product_id: string;
    product_size_id: string;
    receipt_received_at: string | null;
    is_vibe_debt: boolean | null;
    client_price: number;
    applied_balance: number | null;
  },
  input: PaymentConfirmationInput
): Promise<void> {
  // Для +ВАЙБ-долгового pending'а чек не нужен — партнёр подтверждает
  // только наличие («отправлю в долг»). Деньги придут позже через
  // wizard «💳 Оплатить долг».
  if (!pending.is_vibe_debt && !pending.receipt_received_at) {
    await ctx.reply(`По заказу №${pending.order_number} клиент ещё не прислал чек. Дождись чека.`);
    return;
  }

  const db = getBotDb();

  if (input.decision === "yes") {
    // Дыра-стопер: если за время ожидания клиент насоздавал других
    // +ВАЙБ-заказов и debt+price теперь перевалит за лимит — отказываем
    // от подтверждения, чтобы не загнать клиента в auto-freeze. Партнёр
    // увидит понятный текст; клиент потом перерезолвит.
    if (pending.is_vibe_debt && pending.customer_id) {
      const { data: cust } = await db
        .from("customers")
        .select("vibe_credit_limit_override, is_frozen")
        .eq("id", pending.customer_id)
        .maybeSingle();
      if (cust && !cust.is_frozen) {
        const { data: debtRow } = await db
          .from("customer_vibe_debt")
          .select("debt")
          .eq("customer_id", pending.customer_id)
          .maybeSingle();
        const currentDebt = Number(debtRow?.debt ?? 0);
        let limit =
          cust.vibe_credit_limit_override != null ? Number(cust.vibe_credit_limit_override) : null;
        if (limit === null) {
          const { data: settings } = await db
            .from("business_settings")
            .select("vibe_credit_default_limit")
            .limit(1)
            .maybeSingle();
          limit = Number(settings?.vibe_credit_default_limit ?? 0);
        }
        const remaining = Number(pending.client_price) - Number(pending.applied_balance ?? 0);
        if (currentDebt + remaining > limit) {
          await ctx.reply(
            `⚠️ У клиента не хватает лимита «+ВАЙБ» (${formatPriceLocal(currentDebt)} + ${formatPriceLocal(remaining)} > ${formatPriceLocal(limit)}).\n\n` +
              `Заказ №${pending.order_number} в работу не возьму — клиент сам перерезолвит обычной оплатой.`
          );
          return;
        }
      }
    }

    // Снимок is_frozen ДО confirm — для DM при заморозке/разморозке.
    let wasFrozen: boolean | null = null;
    if (pending.customer_id) {
      const { data: cust } = await db
        .from("customers")
        .select("is_frozen")
        .eq("id", pending.customer_id)
        .maybeSingle();
      wasFrozen = !!cust?.is_frozen;
    }

    const { data: orderIdRaw, error: confirmError } = await db
      .rpc("confirm_pending_order_atomic", {
        p_pending_order_id: pending.id,
        p_payment_method: "card",
        p_confirmed_by: "partner",
      })
      .single();

    if (confirmError || !orderIdRaw) {
      console.error("[partner-bot] confirm_pending_order_atomic failed:", confirmError);
      await ctx.reply("Не удалось подтвердить заказ. Попробуй ещё раз.");
      return;
    }

    const orderId = orderIdRaw as unknown as string;

    if (pending.customer_id) {
      const { data: orderRow } = await db
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .single();

      const { notifyCustomerOrderApproved, maybeNotifyFrozenChange } =
        await import("../notifications");
      notifyCustomerOrderApproved({
        customerId: pending.customer_id,
        orderId,
        orderNumber: orderRow?.order_number ?? Number(pending.order_number),
        isVibeDebt: !!pending.is_vibe_debt,
      }).catch((e) => console.error("notifyCustomerOrderApproved failed:", e));

      maybeNotifyFrozenChange(pending.customer_id, wasFrozen).catch((e) =>
        console.error("maybeNotifyFrozenChange (partner-confirm) failed:", e)
      );
    }

    // Карточка появляется в группе клиентов.
    const { upsertOrderSummary, buildSummaryFromOrderId } = await import("../orders-group");
    buildSummaryFromOrderId(orderId)
      .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
      .catch((e) => console.error("upsertOrderSummary (partner-confirm-pending) failed:", e));

    await ctx.reply(`Подтвердил. Заказ №${pending.order_number} в работе.`);
    return;
  }

  // decision === "no" — оплата не пришла. Канон 2026-05-26: бинарка
  // (да/нет) при подтверждении чека; «нет размера/товара» переехали в
  // карточку 🚚 «На отправку» (доступна после confirm-чека).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: cancelError } = await (db.rpc as any)("cancel_pending_order_atomic", {
    p_pending_order_id: pending.id,
  });
  if (cancelError) {
    console.error("[partner-bot] cancel_pending_order_atomic failed:", cancelError);
    await ctx.reply("Не удалось отменить заказ. Попробуй ещё раз.");
    return;
  }

  if (pending.customer_id) {
    await notifyCustomerOfPartnerPaymentReject(
      db,
      partner,
      pending.customer_id,
      pending.id,
      Number(pending.order_number)
    );
  }

  await ctx.reply(`Принял. Заказ №${pending.order_number} отменён.`);
}

function formatPriceLocal(rub: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(rub))} ₽`;
}

/**
 * DM клиенту когда партнёр сказал «N нет» — оплата не пришла. Канон
 * 2026-05-26: при подтверждении чека бинарка (да/нет), причины
 * «размер/товар закончился» переехали в карточку 🚚 «На отправку».
 */
async function notifyCustomerOfPartnerPaymentReject(
  db: ReturnType<typeof getBotDb>,
  partner: Partner,
  customerId: string,
  orderOrPendingId: string,
  visibleNumber: number
): Promise<void> {
  const { data: settings } = await db
    .from("business_settings")
    .select("support_telegram_username, director_tg_username")
    .limit(1)
    .maybeSingle();
  const directorOrSupport = settings?.director_tg_username
    ? `@${String(settings.director_tg_username).replace(/^@/, "")}`
    : settings?.support_telegram_username
      ? `@${String(settings.support_telegram_username).replace(/^@/, "")}`
      : "нашу поддержку";
  const partnerLine = partner.tg_username ? `@${partner.tg_username}` : "—";

  const text =
    `партнёр сообщил, что оплата не пришла. Если ты всё-таки перевёл — ` +
    `пиши ${directorOrSupport}, разбираться будем втроём. Контакт партнёра: ${partnerLine}.`;

  const { notifyCustomerOrderCancelled } = await import("../notifications");
  notifyCustomerOrderCancelled({
    customerId,
    orderId: orderOrPendingId,
    orderNumber: visibleNumber,
    reason: text,
  }).catch((e) => console.error("notifyCustomerOrderCancelled failed:", e));
}

// ============================================
// UI helpers
// ============================================

async function sendPartnerMenu(ctx: PartnerContext, partner: Partner) {
  const hasRequisites = !!partner.payment_requisites;
  const intro = hasRequisites
    ? `Привет, ${partner.name}! 👋`
    : `Привет, ${partner.name}!\n\n⚠️ Сначала настрой реквизиты через ⚙️ Мои реквизиты — пока их нет, твои товары не появятся в каталоге у клиентов.`;

  await ctx.reply(intro, {
    reply_markup: {
      keyboard: [
        [{ text: "⚙️ Мои реквизиты" }, { text: "📦 Мои заказы" }],
        [{ text: "💰 Должники" }, { text: "💳 Долг по комиссиям" }],
        [{ text: "❓ Помощь" }],
      ],
      resize_keyboard: true,
    },
  });
}

// =====================================================================
// «📦 Мои заказы» — интерактивный список с фильтрами + карточка
// заказа с контекстными кнопками действий. Канон 2026-05-26 §10.2.1.
// =====================================================================

type PartnerOrderFilter = "active" | "shipped" | "cancelled" | "all";

const PARTNER_FILTER_LABELS: Record<PartnerOrderFilter, string> = {
  active: "Активные",
  shipped: "Завершённые",
  cancelled: "Отменённые",
  all: "Все",
};

const PARTNER_FILTER_STATUSES: Record<PartnerOrderFilter, string[] | null> = {
  active: ["paid", "collecting", "problem", "return"],
  shipped: ["sent", "return_done"],
  cancelled: ["cancelled", "trash"],
  all: null,
};

const PARTNER_ORDERS_PAGE_SIZE = 10;

interface PartnerOrderListRow {
  id: string;
  order_number: number;
  status: string;
  client_price: number;
  is_paid: boolean;
  source_warehouse: string | null;
  send_by: string | null;
  pickup_by: string | null;
  tracking_number: string | null;
  delivery_service: string | null;
  customer_id: string | null;
  size: string | null;
  product?: { name: string | null } | null;
}

interface PartnerOrderCardRow extends PartnerOrderListRow {
  return_tracking_number: string | null;
  return_code: string | null;
  problem_type: string | null;
  cancel_reason: string | null;
  fault_party: string | null;
  shipped_at: string | null;
  return_completed_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

/**
 * Индикатор статуса с точки зрения партнёра — учитывает склад отгрузки.
 * source_warehouse='partner': партнёр должен действовать; source_warehouse='owner': info-only.
 */
function partnerOrderEmoji(status: string, sourceWarehouse: string | null): string {
  const isPartnerStock = sourceWarehouse === "partner";
  if (status === "paid" || status === "collecting" || status === "problem") {
    return isPartnerStock ? "🚚" : "📦";
  }
  if (status === "return") return isPartnerStock ? "⚠️" : "📦";
  if (status === "sent" || status === "return_done") return "✅";
  if (status === "cancelled" || status === "trash") return "❌";
  return "📋";
}

function partnerOrderLabel(status: string, sourceWarehouse: string | null): string {
  const isPartnerStock = sourceWarehouse === "partner";
  switch (status) {
    case "paid":
      return isPartnerStock ? "На отправку" : "У владельца";
    case "collecting":
      return isPartnerStock ? "Готовится" : "У владельца";
    case "problem":
      return "Проблема";
    case "return":
      return isPartnerStock ? "Забрать возврат" : "Возврат у владельца";
    case "sent":
      return "Отправлен";
    case "return_done":
      return "Возврат принят";
    case "cancelled":
      return "Отменён";
    case "trash":
      return "Сгорел";
    default:
      return status;
  }
}

async function openPartnerOrders(
  ctx: PartnerContext,
  partner: Partner,
  filter: PartnerOrderFilter = "active",
  page: number = 0,
  options: { editExisting?: boolean } = {}
): Promise<void> {
  const db = getBotDb();
  const statuses = PARTNER_FILTER_STATUSES[filter];

  let query = db
    .from("orders")
    .select(
      "id, order_number, status, client_price, is_paid, source_warehouse, send_by, pickup_by, tracking_number, delivery_service, customer_id, size, product:products(name)",
      { count: "exact" }
    )
    .eq("partner_id", partner.id)
    .order("created_at", { ascending: false })
    .range(
      page * PARTNER_ORDERS_PAGE_SIZE,
      page * PARTNER_ORDERS_PAGE_SIZE + PARTNER_ORDERS_PAGE_SIZE - 1
    );

  if (statuses) {
    query = query.in("status", statuses);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("[partner-bot] openPartnerOrders query failed:", error.message);
    await ctx.reply("Не удалось загрузить заказы. Попробуй позже.");
    return;
  }

  const orders = (data ?? []) as unknown as PartnerOrderListRow[];
  const total = count ?? orders.length;
  const text = formatPartnerOrdersList(filter, orders, total);
  const kb = buildPartnerOrdersListKeyboard(filter, orders, page, total);

  if (options.editExisting && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fallthrough */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

function formatPartnerOrdersList(
  filter: PartnerOrderFilter,
  orders: PartnerOrderListRow[],
  total: number
): string {
  const header = `📦 <b>Мои заказы</b> · ${PARTNER_FILTER_LABELS[filter]}`;
  if (orders.length === 0) return `${header}\n\nЗдесь пока пусто.`;

  const lines = [header, `<i>Всего: ${total}</i>`];
  for (const o of orders) {
    const emoji = partnerOrderEmoji(o.status, o.source_warehouse);
    const label = partnerOrderLabel(o.status, o.source_warehouse);
    const productName = o.product?.name ?? "—";
    const size = o.size ? ` · ${o.size}` : "";
    const price = ` · ${formatPrice(Number(o.client_price))}`;
    lines.push("");
    lines.push(
      `<b>№${o.order_number}</b> · ${emoji} ${label}${price}\n${escapeHtml(productName)}${size}`
    );
  }
  return lines.join("\n");
}

function buildPartnerOrdersListKeyboard(
  filter: PartnerOrderFilter,
  orders: PartnerOrderListRow[],
  page: number,
  total: number
): InlineKeyboard {
  const kb = new InlineKeyboard();

  const cell = (f: PartnerOrderFilter): string =>
    f === filter ? `· ${PARTNER_FILTER_LABELS[f]} ·` : PARTNER_FILTER_LABELS[f];

  kb.text(cell("active"), `partnerorders:f:active`)
    .text(cell("shipped"), `partnerorders:f:shipped`)
    .row()
    .text(cell("cancelled"), `partnerorders:f:cancelled`)
    .text(cell("all"), `partnerorders:f:all`)
    .row();

  for (const o of orders) {
    const emoji = partnerOrderEmoji(o.status, o.source_warehouse);
    kb.text(`${emoji} №${o.order_number}`, `partnerorders:card:${o.id}`).row();
  }

  const totalPages = Math.ceil(total / PARTNER_ORDERS_PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) {
      kb.text(`« ${page} из ${totalPages}`, `partnerorders:p:${filter}:${page - 1}`);
    }
    if (page < totalPages - 1) {
      kb.text(`${page + 2} из ${totalPages} »`, `partnerorders:p:${filter}:${page + 1}`);
    }
    kb.row();
  }
  return kb;
}

async function openPartnerOrderCard(
  ctx: PartnerContext,
  partner: Partner,
  orderId: string,
  options: { editExisting?: boolean } = {}
): Promise<void> {
  const db = getBotDb();
  const { data, error } = await db
    .from("orders")
    .select(
      `id, order_number, status, client_price, is_paid, source_warehouse, send_by, pickup_by,
       tracking_number, return_tracking_number, return_code, delivery_service, size,
       customer_id, problem_type, cancel_reason, fault_party,
       shipped_at, return_completed_at, cancelled_at, created_at,
       product:products(name)`
    )
    .eq("id", orderId)
    .eq("partner_id", partner.id)
    .single();

  if (error || !data) {
    await ctx.reply("Заказ не найден.");
    return;
  }
  const order = data as unknown as PartnerOrderCardRow;

  let customerLabel = "—";
  if (order.customer_id) {
    const { data: customer } = await db
      .from("customers")
      .select("telegram_username, name")
      .eq("id", order.customer_id)
      .maybeSingle();
    customerLabel = customer?.telegram_username
      ? `@${customer.telegram_username}`
      : (customer?.name ?? "—");
  }

  const text = formatPartnerOrderCard(order, customerLabel);
  const kb = buildPartnerOrderCardKeyboard(order);

  if (options.editExisting && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fallthrough */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

function formatPartnerOrderCard(order: PartnerOrderCardRow, customerLabel: string): string {
  const emoji = partnerOrderEmoji(order.status, order.source_warehouse);
  const label = partnerOrderLabel(order.status, order.source_warehouse);
  const product = order.product?.name ?? "—";
  const isPartnerStock = order.source_warehouse === "partner";

  const lines: string[] = [
    `${emoji} <b>Заказ №${order.order_number}</b>`,
    `Статус: ${label}`,
    "",
    `<b>${escapeHtml(product)}</b>`,
  ];
  if (order.size) lines.push(`Размер: <b>${escapeHtml(order.size)}</b>`);
  lines.push(
    `Цена: <b>${formatPrice(Number(order.client_price))}</b>${order.is_paid ? "" : " · <b>в долг</b>"}`
  );
  lines.push(`Заказчик: ${customerLabel}`);
  if (order.delivery_service) lines.push(`Служба: ${order.delivery_service}`);
  if (order.tracking_number) {
    lines.push(`Трек: <code>${escapeHtml(order.tracking_number)}</code>`);
  }

  if ((order.status === "paid" || order.status === "collecting") && order.send_by) {
    lines.push(`Отправить до: <b>${formatShortDate(order.send_by)}</b>`);
  }
  if (order.status === "sent" && order.shipped_at) {
    lines.push(`Отправлен: <b>${formatShortDate(order.shipped_at)}</b>`);
  }

  if (order.status === "return") {
    if (order.return_tracking_number) {
      lines.push(`Трек возврата: <code>${escapeHtml(order.return_tracking_number)}</code>`);
    }
    if (order.return_code) {
      lines.push(`Код возврата: <code>${escapeHtml(order.return_code)}</code>`);
    }
    if (order.pickup_by) {
      lines.push(`Забрать до: <b>${formatShortDate(order.pickup_by)}</b>`);
    }
  }
  if (order.status === "return_done" && order.return_completed_at) {
    lines.push(`Возврат принят: <b>${formatShortDate(order.return_completed_at)}</b>`);
  }
  if (order.status === "cancelled" && order.cancelled_at) {
    lines.push(`Отменён: <b>${formatShortDate(order.cancelled_at)}</b>`);
  }

  if (order.status === "paid" && isPartnerStock) {
    lines.push("");
    lines.push("Отправь товар на ПВЗ — трек клиент уже знает.");
  } else if (order.status === "paid" && !isPartnerStock) {
    lines.push("");
    lines.push("<i>Товар на складе владельца — отправляет он сам.</i>");
  } else if (order.status === "return" && isPartnerStock) {
    lines.push("");
    lines.push("Жми «✅ Забрал» когда придёшь с ПВЗ.");
  } else if (order.status === "return" && !isPartnerStock) {
    lines.push("");
    lines.push("<i>Возврат заберёт отправщик владельца.</i>");
  }

  return lines.join("\n");
}

function buildPartnerOrderCardKeyboard(order: PartnerOrderCardRow): InlineKeyboard {
  const kb = new InlineKeyboard();
  const id = order.id;
  const isPartnerStock = order.source_warehouse === "partner";

  if (order.status === "paid" && isPartnerStock) {
    kb.text("✅ Отправил", `partner-order:ship:${id}`)
      .row()
      .text("❌ Нет размера", `partner-order:no-size:${id}`)
      .row()
      .text("❌ Нет товара", `partner-order:no-product:${id}`)
      .row();
  } else if (order.status === "return" && isPartnerStock) {
    kb.text("✅ Забрал", `partner-order:return-picked:${id}`).row();
  }

  kb.text("« К списку", "partnerorders:back");
  return kb;
}

function formatShortDate(iso: string): string {
  return parseFlexibleDate(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * «💰 Должники» — список клиентов с активными +ВАЙБ-долгами по заказам этого
 * партнёра. Партнёр получит деньги напрямую от клиентов через wizard «Оплатить
 * долг» (на стороне клиента). Здесь только просмотр — без действий.
 */
async function sendDebtors(ctx: PartnerContext, partner: Partner): Promise<void> {
  const db = getBotDb();
  const { data: rows } = await db
    .from("orders")
    .select(
      "customer_id, client_price, applied_balance, customer:customers(telegram_username, name)"
    )
    .eq("partner_id", partner.id)
    .eq("is_paid", false)
    .eq("payment_method", "deposit")
    .not("status", "in", "(cancelled,trash,return_done)");

  if (!rows || rows.length === 0) {
    await ctx.reply("✨ Должников нет — все клиенты в плюсе.");
    return;
  }

  // Группируем по customer_id, считаем сумму и количество.
  const byCustomer = new Map<string, { label: string; totalDebt: number; count: number }>();
  for (const r of rows) {
    if (!r.customer_id) continue;
    const c = r.customer as { telegram_username: string | null; name: string | null } | null;
    const label = c?.telegram_username ? `@${c.telegram_username}` : (c?.name ?? "—");
    const debtRow = Number(r.client_price) - Number(r.applied_balance ?? 0);
    if (debtRow <= 0) continue;
    const existing = byCustomer.get(r.customer_id);
    if (existing) {
      existing.totalDebt += debtRow;
      existing.count += 1;
    } else {
      byCustomer.set(r.customer_id, { label, totalDebt: debtRow, count: 1 });
    }
  }

  if (byCustomer.size === 0) {
    await ctx.reply("✨ Должников нет — все клиенты в плюсе.");
    return;
  }

  const sorted = Array.from(byCustomer.values()).sort((a, b) => b.totalDebt - a.totalDebt);
  const totalAll = sorted.reduce((s, c) => s + c.totalDebt, 0);

  const lines: string[] = [
    `💰 <b>Должники (${sorted.length} ${pluralizeClients(sorted.length)}, итого ${formatPrice(totalAll)})</b>`,
    "",
  ];
  for (const c of sorted) {
    lines.push(
      `${escapeHtml(c.label)} — ${formatPrice(c.totalDebt)} (${c.count} ${pluralizeOrders(c.count)})`
    );
  }
  lines.push("");
  lines.push(
    "<i>Клиенты сами оплачивают свои долги. Когда переведут — пришлю чек со списком заказов на твою проверку.</i>"
  );

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

function pluralizeClients(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "клиент";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "клиента";
  return "клиентов";
}

function pluralizeOrders(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "заказ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заказа";
  return "заказов";
}

/**
 * «📢 Протрубить возвраты» — партнёр запускает серию DM-напоминаний клиентам
 * с активными возвратами по своим заказам. Один раз в день на партнёра.
 * Серия идёт по тому же расписанию что у владельца — handleTrumpetNotify
 * сам ветвит текст по `trumpet_sessions.partner_id`.
 */
async function startPartnerTrumpet(ctx: PartnerContext, partner: Partner): Promise<void> {
  const db = getBotDb();
  const today = moscowToday();

  // 1. Проверяем нет ли активной partner-trumpet сессии сегодня.
  const { data: existing } = await db
    .from("trumpet_sessions")
    .select("id, triggered_at")
    .eq("trumpet_date", today)
    .eq("partner_id", partner.id)
    .is("cancelled_at", null)
    .maybeSingle();

  if (existing) {
    await ctx.reply("Сегодня ты уже протрубил — серия напоминаний идёт. Завтра можно будет снова.");
    return;
  }

  // 2. Берём заказы партнёра в return.
  const { data: orders } = await db
    .from("orders")
    .select("id, customer_id")
    .eq("partner_id", partner.id)
    .eq("status", "return");

  const ownReturns = (orders ?? []).filter((o) => o.customer_id);
  if (ownReturns.length === 0) {
    await ctx.reply("У тебя нет активных возвратов — трубить не по ком.");
    return;
  }

  // 3. Создаём сессию.
  const { data: createdSession, error: insertError } = await db
    .from("trumpet_sessions")
    .insert({
      trumpet_date: today,
      partner_id: partner.id,
      triggered_by: null,
    })
    .select("id")
    .single();

  if (insertError || !createdSession) {
    console.error("[partner-trumpet] insert session failed:", insertError);
    await ctx.reply("Не удалось создать сессию. Попробуй позже.");
    return;
  }

  // 4. Планируем серию DM каждому уникальному клиенту.
  const uniqueCustomers = Array.from(new Set(ownReturns.map((o) => o.customer_id as string)));
  for (const customerId of uniqueCustomers) {
    scheduleTrumpetNotifications(createdSession.id as string, customerId).catch((e) =>
      console.error(`[partner-trumpet] schedule failed for ${customerId}:`, e)
    );
  }

  await ctx.reply(
    `📢 Запустил напоминания клиентам про коды возврата.\n\n` +
      `Возвратов: ${ownReturns.length}\n` +
      `Клиентов: ${uniqueCustomers.length}\n\n` +
      `Серия идёт сегодня в окне 10:00–21:00 МСК. Кто обновит код — следующие напоминания не получит.`
  );
}

async function handlePartnerCancel(
  ctx: PartnerContext,
  partner: Partner,
  orderId: string
): Promise<void> {
  const db = getBotDb();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, partner_id, customer_id, status, status_history")
    .eq("id", orderId)
    .single();

  if (!order || order.partner_id !== partner.id) {
    await ctx.reply("Заказ не найден.");
    return;
  }
  if (order.status === "cancelled") {
    await ctx.reply("Заказ уже отменён.");
    return;
  }

  await db
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", orderId);

  if (order.customer_id) {
    notifyCustomerOrderCancelled({
      customerId: order.customer_id,
      orderId,
      orderNumber: order.order_number,
      reason: "Партнёр отказался — нет в наличии.",
    }).catch((e) => console.error("notifyCustomerOrderCancelled (partner) failed:", e));
  }

  buildSummaryFromOrderId(orderId)
    .then((summary) => (summary ? editOrderSummary(summary) : undefined))
    .catch((e) => console.error("editOrderSummary (partner-cancel) failed:", e));

  await ctx.reply(`❌ Заказ №${order.order_number} отменён, клиенту отправлено уведомление.`);
}

// =====================================================================
// «📦 Мои заказы» — действия с карточки заказа (Phase G.5, 2026-05-26).
// Только source_warehouse='partner': paid → sent / paid → cancelled / return → return_done.
// =====================================================================

const PARTNER_ORDER_ACTION_SELECT =
  "id, status, status_history, order_number, partner_id, customer_id, " +
  "product_id, product_size_id, source_warehouse, client_price, is_paid, " +
  "tracking_number, delivery_service";

async function fetchPartnerOrderForAction(
  orderId: string,
  partnerId: string
): Promise<PartnerOrderForAction | null> {
  const db = getBotDb();
  const { data } = await db
    .from("orders")
    .select(PARTNER_ORDER_ACTION_SELECT)
    .eq("id", orderId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  return (data as unknown as PartnerOrderForAction | null) ?? null;
}

async function handlePartnerOrderShip(
  ctx: PartnerContext,
  partner: Partner,
  orderId: string
): Promise<void> {
  const order = await fetchPartnerOrderForAction(orderId, partner.id);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }
  const db = getBotDb();
  const result = await executePartnerMarkSent(db, order, partner.id);
  if (!result.success) {
    await ctx.reply(result.error);
    return;
  }
  await openPartnerOrderCard(ctx, partner, orderId, { editExisting: true });
}

async function handlePartnerOrderNoStock(
  ctx: PartnerContext,
  partner: Partner,
  orderId: string,
  kind: "size" | "product"
): Promise<void> {
  const order = await fetchPartnerOrderForAction(orderId, partner.id);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }
  const db = getBotDb();
  const result = await executePartnerCancelNoStock(db, order, partner.id, kind);
  if (!result.success) {
    await ctx.reply(result.error);
    return;
  }
  await openPartnerOrderCard(ctx, partner, orderId, { editExisting: true });
}

async function handlePartnerOrderReturnPicked(
  ctx: PartnerContext,
  partner: Partner,
  orderId: string
): Promise<void> {
  const order = await fetchPartnerOrderForAction(orderId, partner.id);
  if (!order) {
    await ctx.reply("Заказ не найден.");
    return;
  }
  const db = getBotDb();
  const result = await executePartnerMarkReturnPicked(db, order, partner.id);
  if (!result.success) {
    await ctx.reply(result.error);
    return;
  }
  await openPartnerOrderCard(ctx, partner, orderId, { editExisting: true });
}

// ============================================
// Phase G.4: партнёрский долг по комиссиям
// ============================================

/**
 * Показать партнёру его текущий долг по комиссиям + кнопку «Оплатить».
 */
async function sendCommissionDebt(ctx: PartnerContext, partner: Partner): Promise<void> {
  const db = getBotDb();
  const { data: orders } = await db
    .from("orders")
    .select("order_number, partner_commission_snapshot, product:products(name)")
    .eq("partner_id", partner.id)
    .eq("status", "sent")
    .is("partner_commission_paid_at", null)
    .not("partner_commission_snapshot", "is", null)
    .order("order_number", { ascending: true });

  const rows = (orders ?? []).filter((o) => Number(o.partner_commission_snapshot ?? 0) > 0);
  const debt = rows.reduce((s, o) => s + Number(o.partner_commission_snapshot ?? 0), 0);

  if (debt <= 0 || rows.length === 0) {
    await ctx.reply("✅ Долгов по комиссиям нет.");
    return;
  }

  const lines: string[] = [`💳 <b>Долг по комиссиям — ${formatPrice(debt)}</b>`, ""];
  for (const o of rows) {
    const productName = (o.product as { name: string | null } | null)?.name ?? "—";
    const commission = Number(o.partner_commission_snapshot ?? 0);
    lines.push(`• №${o.order_number} — ${escapeHtml(productName)} — ${formatPrice(commission)}`);
  }
  lines.push("");
  lines.push("Когда переведёшь — пришли фото чека сюда. Владелец подтвердит получение.");

  const kb = new InlineKeyboard().text(`💳 Оплатить ${formatPrice(debt)}`, "partner:debt:pay");
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function startCommissionDebtPayment(ctx: PartnerContext, partner: Partner): Promise<void> {
  const db = getBotDb();
  const { data: debtRow } = await db
    .from("partner_commission_debt")
    .select("debt")
    .eq("partner_id", partner.id)
    .maybeSingle();
  const debt = Number(debtRow?.debt ?? 0);
  if (debt <= 0) {
    await ctx.reply("Долгов больше нет.");
    return;
  }

  // Список заказов с непогашенной комиссией.
  const { data: orders } = await db
    .from("orders")
    .select("id, order_number, partner_commission_snapshot")
    .eq("partner_id", partner.id)
    .eq("status", "sent")
    .is("partner_commission_paid_at", null)
    .not("partner_commission_snapshot", "is", null);

  const orderIds = (orders ?? []).map((o) => o.id);

  // Реквизиты владельца.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: method, error } = await (db.rpc as any)("next_payment_method", {
    p_amount: debt,
  }).maybeSingle();

  if (error || !method) {
    console.error("[partner-bot] next_payment_method failed:", error);
    await ctx.reply("Не удалось подобрать реквизиты владельца. Свяжись напрямую.");
    return;
  }

  ctx.session.awaitingCommissionDebtReceipt = {
    debtAmount: debt,
    orderIds,
  };

  const lines = [`💳 <b>Реквизиты для оплаты долга</b>`, "", `Сумма: <b>${formatPrice(debt)}</b>`];
  if (method.label) lines.push(`Карта: ${method.label}`);
  if (method.card_number_full) lines.push(`Номер: <code>${method.card_number_full}</code>`);
  if (method.bank_name) lines.push(`Банк: ${method.bank_name}`);
  if (method.holder_name) lines.push(`Получатель: ${method.holder_name}`);
  if (method.sbp_phone) lines.push(`СБП: <code>${method.sbp_phone}</code>`);
  lines.push("", "После перевода пришли фото чека сюда одним сообщением.");

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleCommissionDebtReceiptPhoto(
  ctx: PartnerContext,
  partner: Partner
): Promise<void> {
  const draft = ctx.session.awaitingCommissionDebtReceipt;
  if (!draft) return;

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;
  const best = photos[photos.length - 1];

  ctx.session.awaitingCommissionDebtReceipt = undefined;

  await ctx.reply("🧾 Чек получен. Передаём на подтверждение и закрытие долга по комиссиям.");

  // Шлём чек по routing-настройке `partner_debt_received` (по дефолту — владельцу).
  try {
    const { notifyPartnerDebtReceipt } = await import("../notifications");
    await notifyPartnerDebtReceipt({
      partnerId: partner.id,
      partnerName: partner.name,
      debtAmount: draft.debtAmount,
      ordersCount: draft.orderIds.length,
      receiptFileId: best.file_id,
    });
  } catch (err) {
    console.error("[partner-bot] forward debt receipt failed:", err);
  }
}

/**
 * Партнёр подтвердил получение чека +ВАЙБ-долга. Помечаем vibe_payment
 * confirmed_at + все привязанные orders.is_paid=TRUE. Commission-долг
 * партнёра считается derived из orders (§10.4) — отдельной записи не
 * пишем (триггер trg_partner_debt_on_vibe_payment удалён 2026-05-26
 * вместе с дуал-реестром). Триггер check_vibe_credit_freeze разморозит
 * клиента если порог достигнут.
 */
async function handleVibePaymentConfirm(
  ctx: PartnerContext,
  partner: Partner,
  paymentId: string
): Promise<void> {
  const db = getBotDb();

  const { data: payment } = await db
    .from("vibe_payments")
    .select("id, customer_id, amount, confirmed_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    await ctx.reply("Не нашёл этот платёж.");
    return;
  }
  if (payment.confirmed_at) {
    await ctx.reply("Этот платёж уже подтверждён.");
    return;
  }

  const { data: links } = await db
    .from("vibe_payment_orders")
    .select("order_id")
    .eq("vibe_payment_id", paymentId);
  const orderIds = (links ?? []).map((l) => l.order_id);

  // Защита от технического сбоя при создании платежа: vibe_payments
  // существует, но vibe_payment_orders linkage не записался. Раньше
  // юзер видел «Эти заказы не относятся к тебе» — некорректно. Теперь
  // явное сообщение + escalation владельцу.
  if (orderIds.length === 0) {
    await ctx.reply(
      "Тех. сбой по этому платежу — нет привязанных заказов. Я уведомил владельца, разбираемся."
    );
    const { sendOwnerEscalation } = await import("../notifications");
    sendOwnerEscalation({
      title: "vibe_payment без linkage",
      message:
        `⚠️ vibe_payment_id <code>${paymentId}</code> не связан ни с одним заказом ` +
        `(vibe_payment_orders пусто). Партнёр пытался подтвердить — отклонено. Проверь руками.`,
    }).catch((e) => console.error("escalation send failed:", e));
    return;
  }

  // Проверяем что заказы реально партнёрские этого партнёра.
  const { data: orders } = await db
    .from("orders")
    .select("id, order_number, source_partner_id, is_paid")
    .in("id", orderIds);
  const valid = (orders ?? []).filter((o) => o.source_partner_id === partner.id);
  if (valid.length === 0) {
    await ctx.reply("Эти заказы не относятся к тебе — подтвердить не могу.");
    return;
  }

  // Снимок is_frozen ДО изменений.
  let wasFrozen: boolean | null = null;
  if (payment.customer_id) {
    const { data: cust } = await db
      .from("customers")
      .select("is_frozen")
      .eq("id", payment.customer_id)
      .maybeSingle();
    wasFrozen = !!cust?.is_frozen;
  }

  await db
    .from("vibe_payments")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", paymentId);

  await db
    .from("orders")
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
    })
    .in(
      "id",
      valid.map((o) => o.id)
    );

  try {
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  } catch {
    /* noop */
  }

  const numbers = valid.map((o) => `№${o.order_number}`).join(", ");
  await ctx.reply(`✅ Подтверждено. Закрыты заказы: ${numbers}.`);

  if (payment.customer_id) {
    const { notifyCustomerVibePaymentConfirmed, maybeNotifyFrozenChange } =
      await import("../notifications");
    notifyCustomerVibePaymentConfirmed({
      customerId: payment.customer_id,
      amount: Number(payment.amount),
    }).catch((e) => console.error("notifyCustomerVibePaymentConfirmed failed:", e));
    maybeNotifyFrozenChange(payment.customer_id, wasFrozen).catch((e) =>
      console.error("maybeNotifyFrozenChange (vibe-pay-partner-confirm) failed:", e)
    );
  }
}

/**
 * Партнёр сказал «❌ Не пришли» по +ВАЙБ-чеку. Помечаем vibe_payment
 * как rejected (через rejected_at). Заказы остаются в долге, клиент шлёт
 * новый чек.
 */
async function handleVibePaymentReject(
  ctx: PartnerContext,
  partner: Partner,
  paymentId: string
): Promise<void> {
  void partner;
  const db = getBotDb();
  const { data: payment } = await db
    .from("vibe_payments")
    .select("id, customer_id, confirmed_at, rejected_at")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) {
    await ctx.reply("Не нашёл этот платёж.");
    return;
  }
  if (payment.confirmed_at) {
    await ctx.reply("Этот чек уже подтверждён.");
    return;
  }
  if (payment.rejected_at) {
    await ctx.reply("Этот чек уже отмечен как непришедший.");
    return;
  }

  // Проставляем rejected_at для аудита (можно отличить «висит на проверке»
  // от «партнёр отказал»).
  await db
    .from("vibe_payments")
    .update({ rejected_at: new Date().toISOString() })
    .eq("id", paymentId);

  try {
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  } catch {
    /* noop */
  }

  await ctx.reply(
    "Ок, отметил. Деньги клиенту не пришли — попроси его перепроверить и прислать новый чек."
  );

  if (payment.customer_id) {
    const { notifyCustomerVibePaymentNeedsReview } = await import("../notifications");
    notifyCustomerVibePaymentNeedsReview({ customerId: payment.customer_id }).catch((e) =>
      console.error("notifyCustomerVibePaymentNeedsReview failed:", e)
    );
  }
}

// ============================================
// Singleton
// ============================================

export let partnerBot: Bot<PartnerContext> | null = null;

export function getPartnerBot() {
  if (!partnerBot) {
    partnerBot = createPartnerBot();
  }
  return partnerBot;
}
