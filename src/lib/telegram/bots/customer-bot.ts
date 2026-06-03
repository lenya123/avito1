/**
 * Telegram бот для клиентов оптовика (@..._customer_bot).
 *
 * Phase 3.0: skeleton — только /start, создание записи в customers, главное меню.
 * Каталог (3.1), чекаут (3.2), платежи (3.3-3.5) и статусные уведомления (3.6-3.7)
 * добавляются последовательно в рамках Stage 3.
 */

import { Bot, Context, InlineKeyboard, InputFile, session, SessionFlavor } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { customerMainMenu } from "../utils/customer-keyboards";
import { formatPrice } from "../utils/formatters";
import { findCustomerByTelegramId, createCustomer, getBotDb } from "../db";
import { notifyOwnerReceiptReceived, sendToPartner } from "../notifications";
import { renderRequisites } from "../utils/render-requisites";
import { postReceiptToGroup } from "../orders-group";
import { buildCalendar, parseCalendarCallback } from "../utils/inline-calendar";
import {
  fetchProductWithSizes,
  fetchAvailableSizesByProductIds,
  mainPhotoUrl,
  searchProducts,
  type CatalogProduct,
} from "../catalog";
import type { Database } from "@/types/database.generated";

// Phase D: Мои заказы / wizard возврата / edit-actions карточки.
import { openMyOrders, openOrderCard, type OrderFilter } from "../customer-bot/my-orders";
import {
  startReturnWizard,
  startReopenWizard,
  handleReturnTrackingInput,
  handleReturnCodeInput,
  handleReturnCalendarCallback,
  startEditReturnCode,
  startEditReturnTrack,
  handleEditReturnCodeInput,
  handleEditReturnTrackInput,
  cancelReturn,
} from "../customer-bot/return-wizard";
import {
  startEditSendBy,
  startEditPickupBy,
  handleCardCalendarCallback,
  cancelOrder,
  startFixTrack,
  handleFixTrackInput,
} from "../customer-bot/card-actions";
import { openProfile, requestWithdrawal, cancelWithdrawal } from "../customer-bot/profile";
import { moscowTimeNow, moscowToday, parseFlexibleDate } from "@/lib/utils/moscow-time";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

export type DeliveryService = "yandex" | "cdek" | "pochta" | "avito" | "5post";

export interface CheckoutDraft {
  productId: string;
  sizeId: string;
  productName: string;
  size: string;
  clientPrice: number;
  locationCity: string | null;
  deliveryService?: DeliveryService;
  trackingNumber?: string;
  /** ISO date YYYY-MM-DD — клиент выбирает из inline-календаря после ввода трека. */
  sendBy?: string;
  /** Год/месяц текущего показанного календаря (для перерисовки на навигации). */
  sendByCalendarMonth?: { year: number; month: number };
}

export interface VibeReceiptDraft {
  amount: number;
  paymentMethodId: string | null;
  orderIds: string[];
  expectedSinceIso: string; // дата >= которой допустим datetime чека
  // 'owner' — Vision auto-confirm + alert владельцу.
  // 'partner' — пересылаем чек партнёру, он подтверждает вручную.
  route: "owner" | "partner";
  partnerId?: string | null;
}

export interface VibePayGroupSession {
  kind: "owner" | "partner";
  partnerId: string | null;
  label: string;
  orderIds: string[];
  orderNumbers: number[];
  prices: number[];
  total: number;
}

export interface CustomerSessionData {
  step?:
    | "awaiting_delivery_service"
    | "awaiting_tracking"
    | "awaiting_send_by"
    | "awaiting_receipt"
    | "confirmation"
    // Phase D: wizard оформления возврата.
    | "return_awaiting_tracking"
    | "return_awaiting_code"
    | "return_awaiting_pickup_by"
    // Phase D: edit-actions на карточке заказа.
    | "awaiting_return_code_update"
    | "awaiting_return_track_update"
    // bad_barcode-fix: клиент шлёт новый трек для заказа в problem.
    | "awaiting_fix_track_input";
  // Черновик оформляемого заказа (заполняется в Phase 3.2).
  checkoutDraft?: CheckoutDraft;
  // ID заказа, для которого ждём фото чека (Phase 3.3). Используется для
  // +ВАЙБ-партнёрских (orders.is_paid=false ждёт «N да») и для апгрейда
  // pending_order'а — после §4.1 → 🅐 это редкий случай.
  awaitingReceiptForOrderId?: string;
  // ID pending_orders для не-+ВАЙБ заказов (§4.1 → 🅐): чек получаем
  // ДО создания записи в `orders`. После подтверждения оплаты pending
  // заменяется на orders row (confirm_pending_order_atomic).
  awaitingReceiptForPendingOrderId?: string;
  // Ожидание фото чека для +ВАЙБ-оплаты долга (Phase 3.5).
  awaitingVibeReceipt?: VibeReceiptDraft;
  // Группы заказов для UI «Оплатить долг» (Stage 3 post-fix).
  vibePayGroups?: VibePayGroupSession[];
  // Multi-select для партнёрской группы: индексы выбранных заказов внутри
  // group.orderIds. Ключ — groupIndex (одна группа за раз в сессии).
  vibePaySelected?: { groupIndex: number; selected: number[] };
  // Phase D: черновик wizard'а оформления возврата.
  returnDraft?: ReturnDraft;
  // Phase D: ID заказа, для которого ждём ввод нового кода/трека возврата.
  editReturnFieldOrderId?: string;
  // bad_barcode-fix: ID заказа, для которого ждём новый трек отправки.
  fixTrackOrderId?: string;
  // +ВАЙБ-предупреждение: клиент тапнул размер у партнёра-без-долга.
  // Если он подтверждает «оформить обычной оплатой» — продолжаем wizard
  // с force isVibeDebt=false, используя сохранённый источник.
  vibeWarnDraft?: {
    sizeId: string;
    sourceKind: "owner" | "partner";
    sourceBindingId: string | null;
    sourcePartnerId: string | null;
    sourceWarehouse: "owner" | "partner";
  };
}

export interface ReturnDraft {
  /** ID заказа, по которому оформляется возврат. */
  orderId: string;
  /** Это переоткрытие из trash? */
  isReopen: boolean;
  /** Это партнёрский заказ? */
  isPartner: boolean;
  /** ISO timestamp начала wizard'а — для 24ч-тайм-аута. */
  startedAt: string;
  /** Введённый клиентом трек возврата. */
  trackingNumber?: string;
  /** Введённый клиентом код возврата. */
  returnCode?: string;
  /** Текущий показанный месяц календаря (для перерисовки). */
  calendarMonth?: { year: number; month: number };
}

const RETURN_WIZARD_TTL_MS = 24 * 60 * 60 * 1000;

export function isReturnDraftStale(draft: ReturnDraft): boolean {
  const startedAt = Date.parse(draft.startedAt);
  if (Number.isNaN(startedAt)) return false;
  return Date.now() - startedAt > RETURN_WIZARD_TTL_MS;
}

export type CustomerContext = Context & SessionFlavor<CustomerSessionData>;

export function createCustomerBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_CUSTOMER_BOT_TOKEN is not set");
  }

  const bot = new Bot<CustomerContext>(botToken);

  bot.use(
    session({
      initial: (): CustomerSessionData => ({}),
    })
  );

  bot.catch(async (err) => {
    console.error("Customer bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз или начни заново: /start");
    } catch {
      // Не удалось отправить — ничего страшного.
    }
  });

  // /start — точка входа, регистрирует клиента при первом заходе.
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const existing = await findCustomerByTelegramId(from.id);
    const isNewCustomer = !existing;

    const customer = await ensureCustomer(ctx);
    if (!customer) return;

    const greeting = isNewCustomer
      ? await buildWelcomeForNew()
      : `С возвращением, ${customer.name || "друг"}! 👋`;

    await sendMainMenu(ctx, customer, greeting);
  });

  // Обработка главного меню (reply keyboard — это текстовые сообщения).
  bot.on("message:text", async (ctx) => {
    // Игнорируем эхо нашего же inline-mode: при выборе результата в inline-
    // панели Telegram отправляет в чат `input_message_content` от имени
    // клиента с пометкой `via_bot`. Развёрнутая карточка приходит
    // отдельно через `chosen_inline_result` handler.
    if (ctx.message.via_bot?.id === ctx.me.id) {
      return;
    }

    const text = ctx.message.text;

    // Тап нижнего меню в середине wizard'а / pending'а — клиент вышел из
    // потока оформления. Откатываем заказ (pending или soft-резерв) и
    // даём провалиться в обычный switch ниже, чтобы выполнить запрошенный
    // пункт меню. Источник правды — БД (см. abortActiveCheckout): session-
    // флаги ненадёжны в retry-окне (Vision не разобрал чек, ждём повторной
    // отправки — flag уже снят, но pending в БД жив).
    const MENU_BUTTONS = new Set([
      "📋 Каталог",
      "📦 Мои заказы",
      "👤 Профиль",
      "💳 Оплатить долг",
      "🫂 Ассистент",
    ]);
    if (MENU_BUTTONS.has(text)) {
      const customer = await ensureCustomer(ctx);
      if (customer) {
        await abortActiveCheckout(ctx, customer);
      }
      // Дальше провалится в switch и откроется выбранный пункт.
    }

    // Шаги wizard'а обрабатываются отдельно.
    if (ctx.session.step === "awaiting_tracking") {
      await handleTrackingInput(ctx, text);
      return;
    }
    if (
      ctx.session.step === "return_awaiting_tracking" ||
      ctx.session.step === "return_awaiting_code"
    ) {
      // 24ч-тайм-аут wizard'а возврата — если бросили на середине, сбрасываем.
      const draft = ctx.session.returnDraft;
      if (draft && isReturnDraftStale(draft)) {
        ctx.session.returnDraft = undefined;
        ctx.session.step = undefined;
        await ctx.reply(
          "Оформление возврата истекло (прошло больше 24 часов). Открой «📦 Мои заказы» и начни заново."
        );
        return;
      }
      if (ctx.session.step === "return_awaiting_tracking") {
        await handleReturnTrackingInput(ctx, text);
      } else {
        await handleReturnCodeInput(ctx, text);
      }
      return;
    }
    if (ctx.session.step === "awaiting_return_code_update") {
      const customer = await ensureCustomer(ctx);
      if (!customer) return;
      await handleEditReturnCodeInput(ctx, customer, text);
      return;
    }
    if (ctx.session.step === "awaiting_return_track_update") {
      const customer = await ensureCustomer(ctx);
      if (!customer) return;
      await handleEditReturnTrackInput(ctx, customer, text);
      return;
    }
    if (ctx.session.step === "awaiting_fix_track_input") {
      const customer = await ensureCustomer(ctx);
      if (!customer) return;
      await handleFixTrackInput(ctx, customer, text);
      return;
    }
    if (ctx.session.step) {
      // Неизвестный активный шаг — не мешаем, игнор.
      return;
    }

    const customer = await ensureCustomer(ctx);
    if (!customer) return;

    switch (text) {
      case "📋 Каталог":
        await openSearchPrompt(ctx);
        break;
      case "📦 Мои заказы":
        await openMyOrders(ctx, customer);
        break;
      case "👤 Профиль":
        await openProfile(ctx, customer);
        break;
      case "💳 Оплатить долг":
        await openDebtPay(ctx, customer);
        break;
      case "🫂 Ассистент": {
        const supportLine = await buildSupportLine();
        await ctx.reply(`Наш ассистент ответит на любой вопрос — ${supportLine}`, {
          reply_markup: customerMainMenu(shouldShowDebtButton(customer)),
        });
        break;
      }
      default: {
        const supportLine = await buildSupportLine();
        await ctx.reply(
          `Не понял команду 🤔 Используй кнопки меню снизу — или напиши в поддержку: ${supportLine}`,
          { reply_markup: customerMainMenu(shouldShowDebtButton(customer)) }
        );
      }
    }
  });

  // Callback «↩️ В главное меню».
  bot.callbackQuery("customer:main", async (ctx) => {
    const customer = await ensureCustomer(ctx);
    if (!customer) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch {
      // сообщение могло быть photo — editMessageText не работает, просто шлём новое
    }
    await sendMainMenu(ctx, customer);
  });

  // ============================================
  // Каталог (Phase 3.1)
  // ============================================

  // Пустой callback (номер страницы и т.п.) — просто игнорируем.
  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // «↩️ К поиску» — возврат к промежуточному сообщению с inline-кнопкой поиска.
  bot.callbackQuery("customer:catalog", async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore (могло быть фото — editMessageText не сработает)
    }
    await openSearchPrompt(ctx);
  });

  // Карточка товара (prod:show:{uuid}) — открывается после выбора в inline-режиме.
  bot.callbackQuery(/^prod:show:([0-9a-f-]+)$/, async (ctx) => {
    const productId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await openProduct(ctx, productId);
  });

  // Выбор размера (size:sel:{uuid}) — запускает wizard оформления.
  bot.callbackQuery(/^size:sel:([0-9a-f-]+)$/, async (ctx) => {
    const sizeId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startCheckout(ctx, customer, sizeId);
  });

  // ============================================
  // Wizard оформления заказа (Phase 3.2)
  // ============================================

  // Выбор службы доставки.
  bot.callbackQuery(/^delivery:(yandex|cdek|pochta|avito|5post)$/, async (ctx) => {
    const service = ctx.match[1] as DeliveryService;
    await ctx.answerCallbackQuery();
    if (!ctx.session.checkoutDraft) {
      await replyStaleCheckoutSession(ctx);
      return;
    }
    ctx.session.checkoutDraft.deliveryService = service;
    ctx.session.step = "awaiting_tracking";
    await ctx.reply("🚚 Пришли трек-номер заказа.\n\nСкопируй его с Авито на странице заказа.", {
      reply_markup: buildCheckoutCancelKeyboard(),
    });
  });

  bot.callbackQuery("checkout:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    const draft = ctx.session.checkoutDraft;

    // Сразу снимаем soft-резерв (не ждём 10 мин TTL release-reservation job).
    if (customer && draft?.sizeId) {
      const db = getBotDb();
      await db
        .rpc("release_size_reservation_atomic", {
          p_product_size_id: draft.sizeId,
          p_session_id: customer.id,
        })
        .then(({ error }) => {
          if (error) console.error("release_size_reservation_atomic failed:", error);
        });

      const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
      cancelReleaseReservation(draft.sizeId, customer.id).catch((err) => {
        console.error("cancelReleaseReservation failed:", err);
      });
    }

    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    await ctx.reply("❌ Оформление отменено.");
    if (customer) await sendMainMenu(ctx, customer);
  });

  bot.callbackQuery("checkout:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await finalizeCheckout(ctx, customer);
  });

  // +ВАЙБ-предупреждение «партнёр не работает в долг» — выбор клиента.
  bot.callbackQuery("vibe-warn:continue", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await continueAfterVibeWarn(ctx, customer);
  });
  bot.callbackQuery("vibe-warn:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await cancelAfterVibeWarn(ctx, customer);
  });

  // Клиент отменил pending_orders запись до оплаты (новый flow §4.1 → 🅐).
  bot.callbackQuery(/^pending:cancel:([0-9a-f-]+)$/, async (ctx) => {
    const pendingId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await cancelPendingOrderById(ctx, customer, pendingId);
  });

  // Vision определил «не чек» → клиент жмёт «📤 Прислать чек заново»,
  // восстанавливаем session и ждём новый файл (фото или PDF).
  bot.callbackQuery(/^pending:retry-receipt:([0-9a-f-]+)$/, async (ctx) => {
    const pendingId = ctx.match[1];
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    const db = getBotDb();
    const { data: pending } = await db
      .from("pending_orders")
      .select("id, customer_id")
      .eq("id", pendingId)
      .maybeSingle();
    if (!pending || pending.customer_id !== customer.id) {
      await ctx.reply("Заказ уже не активен. Оформи новый через каталог.");
      return;
    }
    ctx.session.awaitingReceiptForPendingOrderId = pendingId;
    await ctx.reply("Жду банковский чек или PDF-квитанцию одним сообщением.");
  });

  // ============================================
  // +ВАЙБ-оплата долга (Phase 3.5)
  // ============================================

  bot.callbackQuery("vibe:pay:open", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await openDebtPay(ctx, customer);
  });

  bot.callbackQuery(/^vibe:group:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await openVibeGroup(ctx, customer, parseInt(ctx.match[1], 10));
  });

  bot.callbackQuery(/^vibe:owner:toggle:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await togglePayOrderSelection(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
  });

  bot.callbackQuery(/^vibe:owner:start:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startVibeOwnerPayment(ctx, customer, parseInt(ctx.match[1], 10));
  });

  bot.callbackQuery(/^vibe:partner:toggle:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await togglePayOrderSelection(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
  });

  bot.callbackQuery(/^vibe:partner:start:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startVibePartnerPayment(ctx, customer, parseInt(ctx.match[1], 10));
  });

  bot.callbackQuery("vibe:pay:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    ctx.session.awaitingVibeReceipt = undefined;
    ctx.session.vibePayGroups = undefined;
    await ctx.reply("Оплата долга отменена.");
    if (customer) await sendMainMenu(ctx, customer);
  });

  // Приём фото чека (Phase 3.3 для обычной оплаты, Phase 3.5 для +ВАЙБ).
  bot.on("message:photo", async (ctx) => {
    const customer = await ensureCustomer(ctx);
    if (!customer) return;

    if (ctx.session.awaitingVibeReceipt) {
      const handled = await handleVibeReceiptPhoto(ctx, customer);
      if (handled) return;
    }

    const handled = await handleReceiptPhoto(ctx, customer);
    if (!handled) {
      await ctx.reply(await buildUnexpectedReceiptMessage(), { parse_mode: "HTML" });
    }
  });

  // Приём документов (PDF-чек или картинка отправленная как файл).
  // Поддерживается только для pending-flow (не-+ВАЙБ заказа). +ВАЙБ-погашение
  // долга и старый orders.is_paid=false flow пока требуют именно photo.
  bot.on("message:document", async (ctx) => {
    const customer = await ensureCustomer(ctx);
    if (!customer) return;

    const doc = ctx.message?.document;
    const mime = doc?.mime_type ?? "";
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf";

    if (!isImage && !isPdf) {
      await ctx.reply(
        "Принимаю только фото чека или PDF-квитанцию. Пришли документ в одном из этих форматов."
      );
      return;
    }

    if (!ctx.session.awaitingReceiptForPendingOrderId) {
      await ctx.reply(await buildUnexpectedReceiptMessage(), { parse_mode: "HTML" });
      return;
    }

    await handlePendingReceiptPhoto(ctx, customer);
  });

  // ============================================
  // Phase D: «Мои заказы», карточка заказа, wizard возврата
  // ============================================

  // Список заказов: переключение фильтра.
  bot.callbackQuery(
    /^myorders:f:(all|active|shipped|returns_open|returns_closed|cancelled)$/,
    async (ctx) => {
      await ctx.answerCallbackQuery();
      const customer = await ensureCustomer(ctx);
      if (!customer) return;
      const filter = ctx.match[1] as OrderFilter;
      await openMyOrders(ctx, customer, filter, 0, { editExisting: true });
    }
  );

  // Список заказов: пагинация.
  bot.callbackQuery(
    /^myorders:p:(all|active|shipped|returns_open|returns_closed|cancelled):(\d+)$/,
    async (ctx) => {
      await ctx.answerCallbackQuery();
      const customer = await ensureCustomer(ctx);
      if (!customer) return;
      const filter = ctx.match[1] as OrderFilter;
      const page = parseInt(ctx.match[2], 10);
      await openMyOrders(ctx, customer, filter, page, { editExisting: true });
    }
  );

  // Открыть карточку заказа.
  bot.callbackQuery(/^myorders:card:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await openOrderCard(ctx, customer, ctx.match[1], { editExisting: true });
  });

  // Назад к списку (по умолчанию — «Активные»).
  bot.callbackQuery("myorders:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await openMyOrders(ctx, customer, "active", 0, { editExisting: true });
  });

  // Кнопки на карточке заказа: оформить возврат / переоткрыть.
  bot.callbackQuery(/^return:start:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startReturnWizard(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^return:reopen:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startReopenWizard(ctx, customer, ctx.match[1]);
  });

  // Edit-actions на карточке возврата.
  bot.callbackQuery(/^return:editcode:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startEditReturnCode(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^return:edittrack:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startEditReturnTrack(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^return:cancel:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await cancelReturn(ctx, customer, ctx.match[1]);
  });

  // Отмена wizard'а оформления возврата.
  bot.callbackQuery("return:wizard:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.returnDraft = undefined;
    ctx.session.step = undefined;
    await ctx.reply("Оформление возврата отменено.");
  });

  // Inline-календарь wizard'а возврата.
  bot.callbackQuery(/^cal:rp-/, async (ctx) => {
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    // 24ч-тайм-аут wizard'а — на финальном шаге тоже проверяем.
    const draft = ctx.session.returnDraft;
    if (draft && isReturnDraftStale(draft)) {
      ctx.session.returnDraft = undefined;
      ctx.session.step = undefined;
      await ctx.answerCallbackQuery();
      await ctx.reply(
        "Оформление возврата истекло (прошло больше 24 часов). Открой «📦 Мои заказы» и начни заново."
      );
      return;
    }
    await handleReturnCalendarCallback(ctx, customer);
  });

  // Кнопки на активном заказе: отменить, изменить срок отправки.
  bot.callbackQuery(/^order:cancel:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await cancelOrder(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^order:editsendby:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startEditSendBy(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^order:editpickupby:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startEditPickupBy(ctx, customer, ctx.match[1]);
  });

  bot.callbackQuery(/^order:fixtrack:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await startFixTrack(ctx, customer, ctx.match[1]);
  });

  // Inline-календарь edit-actions (send_by / pickup_by). es-/ep- — короткие
  // префиксы (callback_data ограничен 64 байтами; см. utils/inline-calendar.ts).
  bot.callbackQuery(/^cal:(es|ep)-/, async (ctx) => {
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await handleCardCalendarCallback(ctx, customer);
  });

  // Inline-календарь шага «когда отправляешь» в wizard'е оформления.
  bot.callbackQuery(/^cal:wizard_sendby:/, async (ctx) => {
    await handleWizardSendByCalendarCallback(ctx);
  });

  // Phase F: профиль клиента — запрос на вывод баланса.
  bot.callbackQuery("profile:withdraw", async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await requestWithdrawal(ctx, customer);
  });

  // Walkthrough #5: клиент отменяет свой pending-запрос вывода.
  bot.callbackQuery(/^withdraw:cancel:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const customer = await ensureCustomer(ctx);
    if (!customer) return;
    await cancelWithdrawal(ctx, customer, ctx.match[1]);
  });

  // Кнопка «Написать владельцу» — orderId-aware маршрутизация:
  // 1. Партнёрский заказ → deep-link на partners.tg_username.
  // 2. Иначе через notification_routes.customer_contact (owner / director):
  //    - 'director' + есть director_tg_username → директор;
  //    - 'owner' (или fallback) → support_telegram_username.
  bot.callbackQuery(/^order:contact_owner:([0-9a-f-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderId = ctx.match[1];
    const db = getBotDb();

    const [orderRes, settingsRes] = await Promise.all([
      db
        .from("orders")
        .select("partner_id, order_number, partner:partners!partner_id(tg_username, name)")
        .eq("id", orderId)
        .maybeSingle(),
      db
        .from("business_settings")
        .select(
          "notification_routes, support_telegram_username, director_tg_username, director_tg_user_id"
        )
        .limit(1)
        .maybeSingle(),
    ]);

    const order = orderRes.data;
    const settings = settingsRes.data;

    type Resolved = { username: string; recipient: "partner" | "director" | "owner" };

    let resolved: Resolved | null = null;

    if (order?.partner_id) {
      const partner = order.partner as { tg_username: string | null; name: string | null } | null;
      if (partner?.tg_username) {
        resolved = { username: partner.tg_username, recipient: "partner" };
      }
    }

    if (!resolved) {
      const routes = (settings?.notification_routes ?? {}) as Record<string, string>;
      const desired = routes.customer_contact === "owner" ? "owner" : "director";
      const directorUsername = (settings?.director_tg_username as string | null) || null;
      const directorBound = !!settings?.director_tg_user_id;
      if (desired === "director" && directorUsername && directorBound) {
        resolved = { username: directorUsername, recipient: "director" };
      }
    }

    if (!resolved) {
      const supportUsername = (settings?.support_telegram_username as string | null) || null;
      if (supportUsername) {
        resolved = { username: supportUsername, recipient: "owner" };
      }
    }

    if (!resolved) {
      await ctx.reply("Контакт поддержки ещё не настроен. Попробуй позже.");
      return;
    }

    const clean = resolved.username.replace(/^@/, "");
    const recipientLabel =
      resolved.recipient === "partner"
        ? "партнёру"
        : resolved.recipient === "director"
          ? "директору"
          : "в поддержку";
    const orderHint = order?.order_number ? ` (по заказу №${order.order_number})` : "";
    await ctx.reply(`✉️ Написать ${recipientLabel}${orderHint}: t.me/${clean}`);
  });

  // ============================================
  // Inline-режим — поиск товара
  // ============================================
  // Включается через @BotFather → /setinline. Кнопка `🔍 Начать поиск`
  // под промежуточным сообщением открывает у клиента поле ввода с
  // префиксом @<bot>; каждое нажатие летит сюда как inline_query.
  bot.on("inline_query", async (ctx) => {
    const offset = parseInt(ctx.inlineQuery.offset || "0", 10) || 0;
    const limit = INLINE_PAGE_SIZE;

    const { products, hasMore } = await searchProducts({
      query: ctx.inlineQuery.query ?? "",
      offset,
      limit,
    });

    const sizesByProduct = await fetchAvailableSizesByProductIds(products.map((p) => p.id));

    const results = products.map((product) => buildInlineResult(product, sizesByProduct));

    await ctx.answerInlineQuery(results, {
      cache_time: 30,
      is_personal: false,
      next_offset: hasMore ? String(offset + limit) : "",
    });
  });

  // После выбора результата — отправляем клиенту полную карточку товара с
  // фото и размерами. Telegram также отправит в чат от имени клиента
  // короткое сообщение из input_message_content («📋 {название}») —
  // оно остаётся в истории, ниже идёт развёрнутая карточка от бота.
  bot.on("chosen_inline_result", async (ctx) => {
    const productId = ctx.chosenInlineResult.result_id;
    if (!productId) return;
    const userId = ctx.from?.id;
    if (!userId) return;
    try {
      await sendProductCard(ctx, userId, productId);
    } catch (error) {
      console.error("chosen_inline_result: sendProductCard failed", error);
    }
  });

  return bot;
}

const INLINE_PAGE_SIZE = 30;

// ============================================
// Вспомогательные функции
// ============================================

/**
 * Возвращает запись `customers` по Telegram-ID клиента; если нет — создаёт.
 * Новых клиентов владелец видит на странице /owner/clients (без DM-спама).
 */
async function ensureCustomer(ctx: CustomerContext): Promise<Customer | null> {
  const from = ctx.from;
  if (!from) return null;

  let customer = await findCustomerByTelegramId(from.id);

  if (!customer) {
    try {
      customer = await createCustomer({
        tgUserId: from.id,
        telegramUsername: from.username,
        name: from.first_name,
      });
    } catch (error) {
      console.error("Failed to create customer:", error);
      const supportLine = await buildSupportLine();
      await ctx.reply(
        `Что-то пошло не так при регистрации. Попробуй ещё раз через /start — или напиши в поддержку: ${supportLine}.`
      );
      return null;
    }
  }

  if (customer.is_blocked) {
    const supportLine = await buildSupportLine();
    await ctx.reply(
      `Доступ к магазину ограничен. Напиши в поддержку, чтобы разобраться: ${supportLine}.`
    );
    return null;
  }

  return customer;
}

async function getBusinessContext(): Promise<{
  businessName: string | null;
  supportUsername: string | null;
}> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("business_name, support_telegram_username")
    .limit(1)
    .maybeSingle();
  return {
    businessName: (data?.business_name as string | null) || null,
    supportUsername: (data?.support_telegram_username as string | null) || null,
  };
}

async function buildSupportLine(): Promise<string> {
  const { supportUsername } = await getBusinessContext();
  if (!supportUsername) return "контакт уточняется";
  return `@${supportUsername.replace(/^@/, "")}`;
}

async function buildWelcomeForNew(): Promise<string> {
  const { businessName } = await getBusinessContext();
  const shopLabel = businessName ? `«${businessName}»` : "магазина";
  return (
    `Добро пожаловать в клиентскую панель ${shopLabel} 👋\n\n` +
    `Здесь ты можешь:\n` +
    `• 📋 оформить заказы из каталога\n` +
    `• 📦 контролировать доставку\n` +
    `• 📈 следить за своей статистикой\n` +
    `• 🫂 обратиться к личному ассистенту с любым вопросом\n\n` +
    `Выбирай раздел снизу — поехали.`
  );
}

async function sendMainMenu(
  ctx: CustomerContext,
  customer: Customer,
  greeting = "Выбирай действие:"
) {
  await ctx.reply(greeting, {
    reply_markup: customerMainMenu(shouldShowDebtButton(customer)),
  });
}

/**
 * Кнопка «💳 Оплатить долг» показывается всем +ВАЙБ-клиентам — клиент сам
 * может инициировать оплату долга в любой момент (Stage 3.5). Если долга
 * нет, при нажатии бот сообщит об этом.
 */
function shouldShowDebtButton(customer: Customer): boolean {
  return customer.vibe_enabled;
}

// ============================================
// Каталог — inline-режим (фаза 1, экран 3)
// ============================================
// Reply-кнопка `📋 Каталог` шлёт сюда промежуточное сообщение «Выбор
// товара тут 👇» с inline-кнопкой `🔍 Начать поиск`. Кнопка имеет тип
// `switch_inline_query_current_chat` — при тапе Telegram сам открывает
// inline-режим у клиента (поле ввода `@<bot> ...`). Поиск стримится
// через `bot.on('inline_query')`. После выбора результата вызывается
// `bot.on('chosen_inline_result')` → `sendProductCard()`.

async function openSearchPrompt(ctx: CustomerContext) {
  const keyboard = new InlineKeyboard()
    .switchInlineCurrent("🔍 Начать поиск", "")
    .row()
    .text("↩️ В главное меню", "customer:main");
  await ctx.reply("Выбор товара тут 👇", { reply_markup: keyboard });
}

function buildInlineResult(
  product: CatalogProduct,
  sizesByProduct: Map<string, string[]>
): InlineQueryResult {
  // Премиум-маркер выведен в title (💎) — иначе description обрезается
  // на узких экранах. В description компактный формат с разделителем «·».
  const title = product.is_premium ? `💎 ${product.name}` : product.name;

  const priceParts: string[] = [`Дроп ${formatPrice(product.drop_price)}`];
  if (product.recommended_price) {
    priceParts.push(`Авито ${formatPrice(product.recommended_price)}`);
  }
  const priceLine = priceParts.join(" · ");

  const sizes = sizesByProduct.get(product.id) ?? [];
  const sizesPart = sizes.length > 0 ? sizes.join(", ") : "нет в наличии";
  const detailsLine = `${sizesPart} · ${product.location_city}`;

  const description = `${priceLine}\n${detailsLine}`;

  const photo = mainPhotoUrl(product);

  const result: InlineQueryResult = {
    type: "article",
    id: product.id,
    title,
    description,
    input_message_content: {
      message_text: `📋 ${product.name}`,
    },
  };
  if (photo) {
    result.thumbnail_url = photo;
  }
  return result;
}

async function sendProductCard(
  ctx: CustomerContext,
  chatId: number,
  productId: string
): Promise<void> {
  const data = await fetchProductWithSizes(productId);
  if (!data) {
    await ctx.api.sendMessage(chatId, "Товар не найден.");
    return;
  }

  const { product, sizes } = data;
  const caption = buildProductCaption(product);
  const photo = mainPhotoUrl(product);

  const keyboard = new InlineKeyboard();
  if (sizes.length === 0) {
    keyboard.text("Нет доступных размеров", "noop").row();
  } else {
    sizes.forEach((s) => {
      keyboard.text(`${s.size} · ${s.freeTotal} шт`, `size:sel:${s.id}`).row();
    });
  }
  keyboard.text("↩️ К поиску", "customer:catalog");

  if (photo) {
    await ctx.api.sendPhoto(chatId, photo, {
      caption,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.api.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

async function openProduct(ctx: CustomerContext, productId: string) {
  const data = await fetchProductWithSizes(productId);
  if (!data) {
    await ctx.reply("Товар не найден.");
    return;
  }

  const { product, sizes } = data;
  const caption = buildProductCaption(product);
  const photo = mainPhotoUrl(product);

  const keyboard = new InlineKeyboard();
  if (sizes.length === 0) {
    keyboard.text("Нет доступных размеров", "noop").row();
  } else {
    sizes.forEach((s) => {
      keyboard.text(`${s.size} · ${s.freeTotal} шт`, `size:sel:${s.id}`).row();
    });
  }
  keyboard.text("↩️ К поиску", "customer:catalog");

  if (photo) {
    await ctx.replyWithPhoto(photo, {
      caption,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

// ============================================
// Wizard оформления (Phase 3.2)
// ============================================

// Краткие названия для сообщений в боте — «Доставка: Яндекс Доставка» выглядит
// тавтологично, поэтому в DM-карточках и партнёрских уведомлениях используем
// сокращения. Для печатных стикеров и отчётов остаются полные имена в своих
// местах (label-generator, orders/export, order-status constants).
const DELIVERY_LABELS: Record<DeliveryService, string> = {
  yandex: "Яндекс",
  cdek: "СДЭК",
  pochta: "Почта",
  avito: "Авито",
  "5post": "5Post",
};

async function startCheckout(ctx: CustomerContext, customer: Customer, sizeId: string) {
  if (customer.is_blocked) {
    await ctx.reply("Доступ к оформлению заказов ограничен.");
    return;
  }
  if (customer.is_frozen) {
    const required =
      customer.required_payment_amount != null ? Number(customer.required_payment_amount) : null;
    const snapshot =
      customer.frozen_debt_snapshot != null ? Number(customer.frozen_debt_snapshot) : null;

    const db0 = getBotDb();
    const { data: debtRow } = await db0
      .from("customer_vibe_debt")
      .select("debt")
      .eq("customer_id", customer.id)
      .maybeSingle();
    const currentDebt = Number(debtRow?.debt ?? 0);

    let body: string;
    if (required != null && required > 0 && snapshot != null) {
      const paid = Math.max(0, snapshot - currentDebt);
      const left = Math.max(0, required - paid);
      body =
        `Нужно оплатить больше чем <b>${formatPrice(required)}</b>.\n` +
        `Уже оплачено: <b>${formatPrice(paid)}</b>.\n` +
        `Осталось до разморозки: <b>${formatPrice(left)}</b>.`;
    } else {
      body = `Нужно оплатить весь текущий долг: <b>${formatPrice(currentDebt)}</b>.`;
    }

    await ctx.reply(`🚫 Твой аккаунт временно заморожен.\n\n${body}`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("💳 Оплатить долг", "vibe:pay:open"),
    });
    return;
  }

  const db = getBotDb();
  const { data: size } = await db
    .from("product_sizes")
    .select("id, size, product_id")
    .eq("id", sizeId)
    .single();

  if (!size || !size.product_id) {
    await ctx.reply("Размер недоступен.");
    return;
  }

  const { data: product } = await db
    .from("products")
    .select("id, name, drop_price, location_city, is_active, is_in_stock")
    .eq("id", size.product_id)
    .single();

  if (!product || !product.is_active || !product.is_in_stock) {
    await ctx.reply("Товар сейчас недоступен.");
    return;
  }

  // Резолвим источник по лестнице: владелец → партнёр1 → партнёр2 → ...
  // Кнопка размера в карточке ссылается на product_sizes.id (owner-size),
  // но реальный сток может быть только у партнёра. Без этого шага
  // reserve_size_atomic дефолтом пытался бы резервировать owner-сток
  // и падал бы OUT_OF_STOCK для партнёрских размеров.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sourceRows, error: sourceError } = await (db.rpc as any)("select_size_source", {
    p_product_id: size.product_id,
    p_size: size.size,
  });
  if (sourceError) {
    console.error("select_size_source failed:", sourceError);
    await ctx.reply("Не удалось определить источник товара. Попробуй ещё раз.");
    return;
  }
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : null) as {
    source_kind: "owner" | "partner";
    source_binding_id: string | null;
    source_warehouse: "owner" | "partner";
    available: number;
  } | null;
  if (!source || source.available <= 0) {
    await ctx.reply("Этот размер только что закончился. Вернитесь в каталог.");
    return;
  }

  // Город отправки: для partner_warehouse — из partners.warehouse_city,
  // иначе — products.location_city (склад владельца).
  let dispatchCity: string | null = product.location_city;
  if (source.source_warehouse === "partner" && source.source_binding_id) {
    const { data: binding } = await db
      .from("product_partner_bindings")
      .select("partners(warehouse_city)")
      .eq("id", source.source_binding_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wh = (binding as any)?.partners?.warehouse_city;
    if (wh) dispatchCity = wh as string;
  }

  // Atomic soft-резерв на 5 минут: row-level lock + INSERT в
  // size_reservations + INCR reserved_quantity. Идемпотентно для одной
  // сессии — повторный тап на тот же размер просто продлевает TTL.
  const reserveArgs: {
    p_product_size_id: string;
    p_session_id: string;
    p_ttl_minutes: number;
    p_source_kind: string;
    p_source_binding_id?: string;
    p_size?: string;
  } = {
    p_product_size_id: size.id,
    p_session_id: customer.id,
    p_ttl_minutes: 5,
    p_source_kind: source.source_kind,
  };
  if (source.source_kind === "partner" && source.source_binding_id) {
    reserveArgs.p_source_binding_id = source.source_binding_id;
    reserveArgs.p_size = size.size;
  }
  const { error: reserveError } = await db.rpc("reserve_size_atomic", reserveArgs);

  if (reserveError) {
    if (reserveError.message.includes("OUT_OF_STOCK")) {
      await ctx.reply("Этот размер только что закончился. Вернитесь в каталог.");
      return;
    }
    console.error("reserve_size_atomic failed:", reserveError);
    await ctx.reply("Не удалось начать оформление. Попробуй ещё раз.");
    return;
  }

  // Auto-release резерва через 5 минут — на случай если клиент
  // не дойдёт до подтверждения и не нажмёт «❌ Отмена».
  const { scheduleReleaseReservation } = await import("@/lib/jobs/queues");
  scheduleReleaseReservation(size.id, customer.id).catch((err) => {
    console.error("scheduleReleaseReservation failed:", err);
  });

  ctx.session.checkoutDraft = {
    productId: product.id,
    sizeId: size.id,
    productName: product.name,
    size: size.size,
    clientPrice: Number(product.drop_price),
    locationCity: dispatchCity,
  };
  ctx.session.step = "awaiting_delivery_service";

  const kb = new InlineKeyboard()
    .text("Яндекс", "delivery:yandex")
    .row()
    .text("СДЭК", "delivery:cdek")
    .row()
    .text("Почта", "delivery:pochta")
    .row()
    .text("Авито", "delivery:avito")
    .row()
    .text("5Post", "delivery:5post")
    .row()
    .text("❌ Отмена", "checkout:cancel");

  const dispatchLine = dispatchCity ? `🏙️ Город: <b>${escapeHtml(dispatchCity)}</b>\n` : "";

  await ctx.reply(
    `📋 <b>${escapeHtml(product.name)}</b>\n` +
      `Размер: ${escapeHtml(size.size)} · Цена: <b>${formatPrice(Number(product.drop_price))}</b>\n` +
      dispatchLine +
      `\n⏱ <i>Бронь: 5 мин</i>\n\n` +
      `Выбери службу доставки:`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function handleTrackingInput(ctx: CustomerContext, text: string) {
  if (!ctx.session.checkoutDraft) {
    await replyStaleCheckoutSession(ctx);
    return;
  }
  const value = text.trim();
  if (value.length < 6 || value.length > 60) {
    await ctx.reply("Трек-номер должен быть от 6 до 60 символов. Пришли ещё раз.");
    return;
  }
  ctx.session.checkoutDraft.trackingNumber = value;
  await showSendByCalendar(ctx);
}

async function showSendByCalendar(ctx: CustomerContext) {
  const settings = await fetchDeadlineSettings();
  const minDate = computeSendByMinDate(settings.sendByTodayCutoff);
  const maxDate = addDaysIso(moscowToday(), settings.sendByMaxDays);

  // Канон §4.5: дефолт открытия календаря — +2-3 дня от сегодня
  // (но не раньше minDate).
  const defaultOpenIso = (() => {
    const candidate = addDaysIso(moscowToday(), 2);
    return candidate < minDate ? minDate : candidate;
  })();
  const [yy, mm] = defaultOpenIso.split("-");

  ctx.session.step = "awaiting_send_by";
  if (ctx.session.checkoutDraft) {
    ctx.session.checkoutDraft.sendByCalendarMonth = {
      year: parseInt(yy, 10),
      month: parseInt(mm, 10) - 1,
    };
  }

  const kb = buildCalendar({
    prefix: "wizard_sendby",
    year: parseInt(yy, 10),
    month: parseInt(mm, 10) - 1,
    minDate,
    maxDate,
  });

  await ctx.reply(
    `📅 Когда отправляешь? Выбери дату.\n\n` +
      `Окно: с ${formatDateRu(minDate)} по ${formatDateRu(maxDate)}.`,
    { reply_markup: kb }
  );
}

async function handleWizardSendByCalendarCallback(ctx: CustomerContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    await ctx.answerCallbackQuery();
    return;
  }

  const parsed = parseCalendarCallback(data);
  if (!parsed || parsed.prefix !== "wizard_sendby") {
    await ctx.answerCallbackQuery();
    return;
  }

  if (ctx.session.step !== "awaiting_send_by" || !ctx.session.checkoutDraft) {
    await ctx.answerCallbackQuery();
    await replyStaleCheckoutSession(ctx);
    return;
  }

  if (parsed.action === "cancel") {
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch {}
    // Делегируем стандартному cancel-flow (он же снимает soft-резерв).
    const customer = await ensureCustomer(ctx);
    const draft = ctx.session.checkoutDraft;
    if (customer && draft?.sizeId) {
      const db = getBotDb();
      await db.rpc("release_size_reservation_atomic", {
        p_product_size_id: draft.sizeId,
        p_session_id: customer.id,
      });
      const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
      cancelReleaseReservation(draft.sizeId, customer.id).catch(() => {});
    }
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    await ctx.reply("❌ Оформление отменено.");
    if (customer) await sendMainMenu(ctx, customer);
    return;
  }

  if (parsed.action === "nav") {
    const [yStr, mStr] = parsed.arg.split("-");
    const showYear = parseInt(yStr, 10);
    const showMonth = parseInt(mStr, 10) - 1;

    const settings = await fetchDeadlineSettings();
    const minDate = computeSendByMinDate(settings.sendByTodayCutoff);
    const maxDate = addDaysIso(moscowToday(), settings.sendByMaxDays);

    ctx.session.checkoutDraft.sendByCalendarMonth = { year: showYear, month: showMonth };

    const kb = buildCalendar({
      prefix: "wizard_sendby",
      year: showYear,
      month: showMonth,
      minDate,
      maxDate,
      selectedDate: ctx.session.checkoutDraft.sendBy,
    });

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    } catch {}
    await ctx.answerCallbackQuery();
    return;
  }

  if (parsed.action === "pick") {
    const settings = await fetchDeadlineSettings();
    const minDate = computeSendByMinDate(settings.sendByTodayCutoff);
    const maxDate = addDaysIso(moscowToday(), settings.sendByMaxDays);
    if (parsed.arg < minDate || parsed.arg > maxDate) {
      await ctx.answerCallbackQuery({ text: "Эта дата вне допустимого окна.", show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    ctx.session.checkoutDraft.sendBy = parsed.arg;
    try {
      await ctx.deleteMessage();
    } catch {}
    await showCheckoutConfirmation(ctx);
  }
}

async function showCheckoutConfirmation(ctx: CustomerContext) {
  const d = ctx.session.checkoutDraft;
  if (!d || !d.deliveryService || !d.trackingNumber || !d.sendBy) {
    await ctx.reply("Данные заказа неполные. Начни заново.");
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    return;
  }

  ctx.session.step = "confirmation";

  const kb = new InlineKeyboard()
    .text("✅ Оформить", "checkout:confirm")
    .text("❌ Отмена", "checkout:cancel");

  const dispatchLine = d.locationCity ? `🏙️ Город: <b>${escapeHtml(d.locationCity)}</b>\n` : "";

  await ctx.reply(
    `Проверь заказ:\n\n` +
      `📋 <b>${escapeHtml(d.productName)}</b>\n` +
      `Размер: ${escapeHtml(d.size)}\n` +
      `Цена: <b>${formatPrice(d.clientPrice)}</b>\n` +
      dispatchLine +
      `📦 Доставка: ${DELIVERY_LABELS[d.deliveryService]}\n` +
      `🚚 Трек: <code>${escapeHtml(d.trackingNumber)}</code>\n` +
      `📅 Срок отправки: <b>${formatDateRu(d.sendBy)}</b>`,
    { parse_mode: "HTML", reply_markup: kb }
  );
}

async function finalizeCheckout(ctx: CustomerContext, customer: Customer) {
  const draft = ctx.session.checkoutDraft;
  if (!draft || !draft.deliveryService || !draft.trackingNumber || !draft.sendBy) {
    await ctx.reply("Данные заказа неполные. Начни заново.");
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    return;
  }

  // Повторная проверка блокировок и заморозки — клиент мог измениться
  // между началом wizard'а и подтверждением.
  if (customer.is_blocked || customer.is_frozen) {
    await ctx.reply("Оформление недоступно: твой аккаунт заблокирован или заморожен.");
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    return;
  }

  const db = getBotDb();

  const { data: product } = await db
    .from("products")
    .select("purchase_price, location_city")
    .eq("id", draft.productId)
    .single();

  if (!product) {
    await ctx.reply("Товар не найден.");
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    return;
  }

  // Резолвим источник по лестнице: владелец → партнёр1 → партнёр2 → ...
  // RPC select_size_source возвращает первый источник с положительным остатком,
  // отфильтровывая партнёров-без-реквизитов и деактивированных.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sourceRows, error: sourceError } = await (db.rpc as any)("select_size_source", {
    p_product_id: draft.productId,
    p_size: draft.size,
  });
  if (sourceError) {
    console.error("select_size_source failed:", sourceError);
    await ctx.reply("Не удалось определить источник товара. Попробуй ещё раз.");
    return;
  }
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : null) as {
    source_kind: "owner" | "partner";
    source_binding_id: string | null;
    source_partner_id: string | null;
    source_warehouse: "owner" | "partner";
    available: number;
  } | null;
  if (!source) {
    await ctx.reply("К сожалению, размер закончился пока ты оформлял заказ.");
    ctx.session.step = undefined;
    ctx.session.checkoutDraft = undefined;
    return;
  }

  // Партнёр участвует в payment-flow (статичные реквизиты + «N да/нет»)
  // Любой партнёрский источник — деньги идут партнёру, чек к нему, он же
  // подтверждает «N да/нет». Склад влияет только на отправку (мой shipper
  // или партнёр сам), но НЕ на платёжный flow. Долг «партнёр должен мне»
  // (комиссия с заказа) пишется в confirm_pending_order_atomic для всех
  // партнёрских confirm'ов.
  const partnerHandlesPayment = source.source_kind === "partner";
  // +ВАЙБ-flow ветвится по складу: если склад партнёра — он же подтверждает
  // наличие («я отправлю в долг»); если склад мой — товар у меня, отгружаю
  // сам, partner.accepts_vibe_debt не важен (это всегда мой долг перед клиентом).
  const partnerHandlesVibe = partnerHandlesPayment && source.source_warehouse === "partner";

  // Пересчёт city отправки на актуальный source — за время wizard'а
  // источник мог переключиться на другого партнёра (или вернуться ко мне).
  // RPC create_pending_order_atomic v8 сама пересчитает при insert, но UI
  // summary показывает то что в session — обновляем для синхронности.
  if (source.source_warehouse === "partner" && source.source_binding_id) {
    const { data: binding } = await db
      .from("product_partner_bindings")
      .select("partners(warehouse_city)")
      .eq("id", source.source_binding_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wh = (binding as any)?.partners?.warehouse_city;
    if (wh) draft.locationCity = wh as string;
  } else {
    draft.locationCity = product.location_city;
  }

  let partner: {
    id: string;
    tg_user_id: number | null;
    name: string;
    accepts_vibe_debt: boolean;
    payment_requisites: PartnerRequisitesValue | null;
  } | null = null;
  if (source.source_kind === "partner" && source.source_partner_id) {
    const { data } = await db
      .from("partners")
      .select("id, tg_user_id, name, is_active, accepts_vibe_debt, payment_requisites")
      .eq("id", source.source_partner_id)
      .maybeSingle();
    if (!data || !data.is_active) {
      await ctx.reply("Товар временно недоступен — партнёр на паузе. Мы уведомили владельца.");
      ctx.session.step = undefined;
      ctx.session.checkoutDraft = undefined;
      return;
    }
    if (partnerHandlesPayment && !data.payment_requisites) {
      await ctx.reply("Товар временно недоступен — у партнёра нет реквизитов.");
      ctx.session.step = undefined;
      ctx.session.checkoutDraft = undefined;
      return;
    }
    partner = {
      id: data.id,
      tg_user_id: data.tg_user_id,
      name: data.name,
      accepts_vibe_debt: data.accepts_vibe_debt ?? true,
      payment_requisites: data.payment_requisites
        ? parsePartnerRequisites(data.payment_requisites)
        : null,
    };
  }

  const isVibe = customer.vibe_enabled;

  // +ВАЙБ-предупреждение: клиент с +ВАЙБ берёт partner_warehouse-размер у партнёра,
  // который НЕ работает в долг → показываем выбор «обычная оплата vs отмена».
  // Для owner_warehouse (склад мой) accepts_vibe_debt не важен: товар у меня,
  // отгружаю сам, в долг — по моим правилам.
  if (isVibe && partnerHandlesVibe && partner && !partner.accepts_vibe_debt) {
    const { InlineKeyboard } = await import("grammy");
    ctx.session.vibeWarnDraft = {
      sizeId: draft.sizeId,
      sourceKind: source.source_kind,
      sourceBindingId: source.source_binding_id,
      sourcePartnerId: source.source_partner_id,
      sourceWarehouse: source.source_warehouse,
    };
    await ctx.reply(
      `⚠️ Размер ${draft.size} «${draft.productName}» сейчас идёт от партнёра «${partner.name}» — он не работает в долг.\n\nМожно оформить только обычной оплатой (не «+ВАЙБ»).`,
      {
        reply_markup: new InlineKeyboard()
          .text("✅ Оформить обычной оплатой", `vibe-warn:continue`)
          .row()
          .text("❌ Отмена", `vibe-warn:cancel`),
      }
    );
    return;
  }

  ctx.session.step = undefined;
  ctx.session.checkoutDraft = undefined;

  const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
  cancelReleaseReservation(draft.sizeId, customer.id).catch((err) => {
    console.error("cancelReleaseReservation failed:", err);
  });

  // ====== Унифицированный pending-flow ======
  //
  // Все заказы теперь идут через pending_orders + confirm_pending_order_atomic.
  // +ВАЙБ-долговый flag — это is_vibe_debt=true в pending. RPC v10 при confirm
  // создаст orders с is_paid=false, payment_method='deposit'. Карточка в группу
  // клиентов постится при confirm (для +ВАЙБ — сразу, потому что партнёрский
  // долговый pending не имеет TTL и всё равно завершается через partner-bot).

  // is_vibe_debt активен если клиент +ВАЙБ И источник принимает долг:
  //   - owner / owner_warehouse (включая партнёрский на моём складе) —
  //     всегда принимает (долг перед владельцем; партнёрский комиссионный
  //     долг писан в confirm_pending_order_atomic v12).
  //   - partner_warehouse + partner.accepts_vibe_debt=true — партнёр согласен.
  let isVibeDebt =
    isVibe && (!partnerHandlesVibe || (partner !== null && partner.accepts_vibe_debt));

  // Lim-check: если новый заказ перевалит за +ВАЙБ-лимит — переключаем
  // на обычную оплату с чеком. Заказ всё равно проходит, клиент не
  // замораживается, +ВАЙБ остаётся активным. Без этого fallback'а заказ
  // ушёл бы в долг, триггер бы заморозил клиента постфактум.
  if (isVibeDebt) {
    const { data: debtRow } = await db
      .from("customer_vibe_debt")
      .select("debt")
      .eq("customer_id", customer.id)
      .maybeSingle();
    const currentDebt = Number(debtRow?.debt ?? 0);

    let limit =
      customer.vibe_credit_limit_override != null
        ? Number(customer.vibe_credit_limit_override)
        : null;
    if (limit === null) {
      const { data: settings } = await db
        .from("business_settings")
        .select("vibe_credit_default_limit")
        .limit(1)
        .maybeSingle();
      limit = Number(settings?.vibe_credit_default_limit ?? 0);
    }

    if (currentDebt + draft.clientPrice > limit) {
      isVibeDebt = false;
      await ctx.reply(
        `⚠️ Заказ не влезает в лимит «+ВАЙБ» (твой лимит: ${formatPrice(limit)}, ` +
          `текущий долг: ${formatPrice(currentDebt)}, заказ: ${formatPrice(draft.clientPrice)}).\n\n` +
          `Оформляем обычной оплатой — пришли чек по реквизитам ниже.`
      );
    }
  }

  await finalizePendingOrder(ctx, customer, draft, product, source, partner, isVibeDebt);
}

/**
 * Клиент после +ВАЙБ-предупреждения нажал «✅ Оформить обычной оплатой».
 * Заказ оформляется как обычный pending (force isVibeDebt=false).
 *
 * Источник перерезолвится на актуальный — между показом warning'а и
 * нажатием кнопки прошло время, размер мог быть занят другим клиентом
 * (тогда select_size_source отдаст другой источник или ничего).
 */
async function continueAfterVibeWarn(ctx: CustomerContext, customer: Customer) {
  const draft = ctx.session.checkoutDraft;
  ctx.session.vibeWarnDraft = undefined;
  if (!draft) {
    await ctx.reply("Сессия оформления потерялась. Начни заново через каталог.");
    return;
  }
  ctx.session.step = undefined;
  ctx.session.checkoutDraft = undefined;

  const db = getBotDb();
  const { data: product } = await db
    .from("products")
    .select("purchase_price, location_city")
    .eq("id", draft.productId)
    .single();
  if (!product) {
    await ctx.reply("Товар не найден.");
    return;
  }

  // Перерезолв источника — актуально на текущий момент, snapshot из vibeWarnDraft
  // мог устареть пока клиент жал кнопку.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sourceRows } = await (db.rpc as any)("select_size_source", {
    p_product_id: draft.productId,
    p_size: draft.size,
  });
  const source = (Array.isArray(sourceRows) ? sourceRows[0] : null) as {
    source_kind: "owner" | "partner";
    source_binding_id: string | null;
    source_partner_id: string | null;
    source_warehouse: "owner" | "partner";
    available: number;
  } | null;
  if (!source) {
    await ctx.reply("К сожалению, размер закончился пока ты выбирал оплату. Попробуй другой.");
    return;
  }

  // Пересчёт city отправки на актуальный source.
  if (source.source_warehouse === "partner" && source.source_binding_id) {
    const { data: binding } = await db
      .from("product_partner_bindings")
      .select("partners(warehouse_city)")
      .eq("id", source.source_binding_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wh = (binding as any)?.partners?.warehouse_city;
    if (wh) draft.locationCity = wh as string;
  } else {
    draft.locationCity = product.location_city;
  }

  // Достаём partner-info заново для актуального источника.
  let partner: {
    id: string;
    tg_user_id: number | null;
    name: string;
    accepts_vibe_debt: boolean;
    payment_requisites: PartnerRequisitesValue | null;
  } | null = null;
  if (source.source_kind === "partner" && source.source_partner_id) {
    const { data } = await db
      .from("partners")
      .select("id, tg_user_id, name, is_active, accepts_vibe_debt, payment_requisites")
      .eq("id", source.source_partner_id)
      .maybeSingle();
    if (!data || !data.is_active) {
      await ctx.reply("Товар временно недоступен — партнёр на паузе.");
      return;
    }
    if (source.source_warehouse === "partner" && !data.payment_requisites) {
      await ctx.reply("Товар временно недоступен — у партнёра нет реквизитов.");
      return;
    }
    partner = {
      id: data.id,
      tg_user_id: data.tg_user_id,
      name: data.name,
      accepts_vibe_debt: data.accepts_vibe_debt ?? true,
      payment_requisites: data.payment_requisites
        ? parsePartnerRequisites(data.payment_requisites)
        : null,
    };
  }

  const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
  cancelReleaseReservation(draft.sizeId, customer.id).catch((err) => {
    console.error("cancelReleaseReservation failed:", err);
  });

  // Force isVibeDebt=false — клиент согласился на обычную оплату, даже если
  // актуальный источник теперь admit'ит долг.
  await finalizePendingOrder(ctx, customer, draft, product, source, partner, false);
}

async function cancelAfterVibeWarn(ctx: CustomerContext, customer: Customer) {
  const draft = ctx.session.checkoutDraft;
  ctx.session.vibeWarnDraft = undefined;
  ctx.session.step = undefined;
  ctx.session.checkoutDraft = undefined;
  if (draft) {
    const db = getBotDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.rpc as any)("release_size_reservation_atomic", {
      p_product_size_id: draft.sizeId,
      p_session_id: customer.id,
    });
    const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
    cancelReleaseReservation(draft.sizeId, customer.id).catch(() => {});
  }
  await ctx.reply("❌ Оформление отменено.");
  await sendMainMenu(ctx, customer);
}

/**
 * Унифицированный wizard-confirm: pending_orders + опциональный TTL + реквизиты.
 * Запись в `orders` появится только после confirm_pending_order_atomic
 * (Vision auto-confirm / партнёр «N да» / директор / instant balance / +ВАЙБ автоподтверждение).
 *
 * isVibeDebt=true → pending без TTL, без чека:
 *   - owner-source → сразу confirm (orders.is_paid=false), карточка в группу.
 *   - partner-source partner-warehouse → ждём «N да» от партнёра (без TTL).
 */
type SourceInfo = {
  source_kind: "owner" | "partner";
  source_binding_id: string | null;
  source_partner_id: string | null;
  source_warehouse: "owner" | "partner";
};

async function finalizePendingOrder(
  ctx: CustomerContext,
  customer: Customer,
  draft: NonNullable<CustomerSessionData["checkoutDraft"]>,
  product: { purchase_price: number | null },
  source: SourceInfo,
  partner: {
    id: string;
    tg_user_id: number | null;
    name: string;
    accepts_vibe_debt: boolean;
    payment_requisites: PartnerRequisitesValue | null;
  } | null,
  isVibeDebt: boolean
) {
  void product; // purchase_price копируется RPC v10 из products при confirm.
  const db = getBotDb();

  // Любой партнёрский источник = деньги партнёру → партнёр решает оплату
  // (для не-+ВАЙБ flow). Склад влияет только на отправку.
  const partnerHandlesPayment = source.source_kind === "partner";
  // +ВАЙБ-flow: подтверждение наличия от партнёра нужно ТОЛЬКО для
  // partner_warehouse (он сам отгружает). Для owner_warehouse товар у меня —
  // отгружаю сам, instant confirm, partner.accepts_vibe_debt не важен.
  const partnerHandlesVibe = partnerHandlesPayment && source.source_warehouse === "partner";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingRow, error: pendingError } = await (db.rpc as any)(
    "create_pending_order_atomic",
    {
      p_customer_id: customer.id,
      p_product_id: draft.productId,
      p_product_size_id: draft.sizeId,
      p_client_price: draft.clientPrice,
      p_delivery_service: draft.deliveryService!,
      p_tracking_number: draft.trackingNumber!,
      p_send_by: draft.sendBy!,
      p_source_kind: source.source_kind,
      p_source_binding_id: source.source_binding_id ?? undefined,
      p_size: draft.size,
      p_is_vibe_debt: isVibeDebt,
      p_ttl_minutes: 10,
    }
  ).single();

  if (pendingError) {
    if (pendingError.message?.includes("OUT_OF_STOCK")) {
      await ctx.reply("К сожалению, товар закончился пока ты оформлял заказ.");
    } else {
      console.error("create_pending_order_atomic failed:", pendingError);
      await ctx.reply("Не удалось оформить заказ. Попробуй ещё раз или напиши в поддержку.");
    }
    return;
  }

  const row = pendingRow as {
    pending_id: string;
    applied_balance: number;
    fully_paid_by_balance: boolean;
  } | null;
  if (!row?.pending_id) {
    console.error("create_pending_order_atomic returned no row");
    await ctx.reply("Не удалось оформить заказ. Попробуй ещё раз.");
    return;
  }

  const pendingId = row.pending_id;
  const appliedBalance = Number(row.applied_balance ?? 0);
  const fullyPaid = !!row.fully_paid_by_balance;
  const remaining = Math.max(0, draft.clientPrice - appliedBalance);

  const { data: pendingMeta } = await db
    .from("pending_orders")
    .select("order_number")
    .eq("id", pendingId)
    .maybeSingle();
  const orderNumber = Number(pendingMeta?.order_number ?? 0);

  // ===== Ветка 1: +ВАЙБ-долг + склад мой (owner или партнёрский на моём складе) → instant confirm (без чека, без TTL) =====
  if (isVibeDebt && !partnerHandlesVibe) {
    const wasFrozen = !!customer.is_frozen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderIdRaw, error: confirmErr } = await (db.rpc as any)(
      "confirm_pending_order_atomic",
      {
        p_pending_order_id: pendingId,
        p_payment_method: "deposit",
        p_confirmed_by: "balance",
      }
    ).single();
    if (confirmErr || !orderIdRaw) {
      console.error("vibe-debt instant confirm failed:", confirmErr);
      await ctx.reply("Не удалось оформить +ВАЙБ-заказ. Свяжись с поддержкой.");
      return;
    }
    const orderId = orderIdRaw as string;

    const { upsertOrderSummary, buildSummaryFromOrderId } = await import("../orders-group");
    buildSummaryFromOrderId(orderId)
      .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
      .catch((e) => console.error("upsertOrderSummary (vibe-debt owner) failed:", e));

    // Триггер check_vibe_credit_freeze мог переключить is_frozen — DM клиенту.
    const { maybeNotifyFrozenChange } = await import("../notifications");
    maybeNotifyFrozenChange(customer.id, wasFrozen).catch((e) =>
      console.error("maybeNotifyFrozenChange (vibe-debt owner) failed:", e)
    );

    let replyText: string;
    if (fullyPaid) {
      replyText =
        `✅ Заказ №${orderNumber} оплачен полностью с баланса (${formatPrice(appliedBalance)}).\n\n` +
        `Собираем — пришлём уведомление, как только отправим.`;
    } else if (appliedBalance > 0) {
      replyText =
        `✅ Заказ №${orderNumber} принят.\n` +
        `💼 С баланса списано ${formatPrice(appliedBalance)}, в долг ушло ${formatPrice(remaining)}.\n\n` +
        `Собираем — пришлём уведомление, как только отправим.`;
    } else {
      replyText =
        `✅ Заказ №${orderNumber} принят в долг.\n\n` +
        `Собираем — пришлём уведомление, как только отправим.`;
    }
    await ctx.reply(replyText);
    await sendMainMenu(ctx, customer);
    return;
  }

  // ===== Ветка 2: +ВАЙБ-долг + partner_warehouse → ждём «N да» от партнёра (без TTL, без чека) =====
  if (isVibeDebt && partnerHandlesVibe && partner) {
    // Шлём партнёру запрос на подтверждение наличия (без чека).
    const { sendVibeDebtRequestToPartner } = await import("../notifications");
    sendVibeDebtRequestToPartner({
      partnerId: partner.id,
      pendingId,
      orderNumber,
      clientPrice: draft.clientPrice,
      productName: draft.productName,
      size: draft.size,
      deliveryService: DELIVERY_LABELS[draft.deliveryService!] ?? draft.deliveryService!,
      trackingNumber: draft.trackingNumber!,
      customerUsername: customer.telegram_username ?? null,
    }).catch((e) => console.error("sendVibeDebtRequestToPartner failed:", e));

    await ctx.reply(
      `✅ Заказ №${orderNumber} — отправили партнёру на подтверждение наличия.\n\n` +
        `Обычно отвечают в течение нескольких часов; крайний срок — 24 часа.`
    );
    await sendMainMenu(ctx, customer);
    return;
  }

  // ===== Ветка 3: не-+ВАЙБ + полная оплата с баланса → instant confirm =====
  if (!partnerHandlesPayment && fullyPaid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderIdRaw, error: confirmErr } = await (db.rpc as any)(
      "confirm_pending_order_atomic",
      {
        p_pending_order_id: pendingId,
        p_payment_method: "balance",
        p_confirmed_by: "balance",
      }
    ).single();

    if (confirmErr || !orderIdRaw) {
      console.error("instant balance confirm failed:", confirmErr);
      await ctx.reply("Не удалось завершить оформление с баланса. Свяжись с поддержкой.");
      return;
    }
    const orderId = orderIdRaw as string;

    const { upsertOrderSummary, buildSummaryFromOrderId } = await import("../orders-group");
    buildSummaryFromOrderId(orderId)
      .then((summary) => (summary ? upsertOrderSummary(summary) : undefined))
      .catch((e) => console.error("upsertOrderSummary (full-balance) failed:", e));

    await ctx.reply(
      `✅ Заказ №${orderNumber} оплачен полностью с баланса (${formatPrice(appliedBalance)}). Заказ в работе.`
    );
    await sendMainMenu(ctx, customer);
    return;
  }

  // ===== Ветка 4: не-+ВАЙБ → ждём чек =====
  // Ставим таймер на 10 мин и просим чек на остаток.
  const { scheduleExpirePendingOrder } = await import("@/lib/jobs/queues");
  scheduleExpirePendingOrder(pendingId, 10).catch((err) =>
    console.error("scheduleExpirePendingOrder failed:", err)
  );

  ctx.session.awaitingReceiptForPendingOrderId = pendingId;

  if (appliedBalance > 0) {
    await ctx.reply(
      `💼 С баланса списано ${formatPrice(appliedBalance)}.\n` +
        `⏳ Заказ №${orderNumber} — к оплате осталось ${formatPrice(remaining)}, у тебя 10 минут на чек по реквизитам ниже.`
    );
  } else {
    await ctx.reply(
      `⏳ Заказ №${orderNumber} ожидает оплаты (${formatPrice(remaining)}) — у тебя 10 минут на чек по реквизитам ниже.`
    );
  }

  if (partnerHandlesPayment && partner) {
    await sendPartnerStaticRequisites(
      ctx,
      partner.payment_requisites,
      pendingId,
      remaining,
      "pending"
    );
  } else {
    await sendOrderRequisites(ctx, pendingId, remaining);
  }
  // Главное меню тут НЕ показываем — клиент ждёт отправки чека по
  // реквизитам выше; «Выберите действие» в этот момент сбивает фокус.
  // Меню вернётся после confirm/cancel/timeout-уведомления.
}

// ============================================
// Реквизиты + приём чека (Phase 3.3)
// ============================================

/**
 * Реквизиты владельца через ферму ротации (next_payment_method RPC).
 * Поддерживаемые типы: card / sbp / ip_qr (фото QR из Storage).
 *
 * Используется только для не-+ВАЙБ заказов через pending_orders flow.
 * `pendingOrderId` подставляется в callback кнопки «❌ Отменить» —
 * `pending:cancel:${pendingOrderId}`.
 */
/**
 * Текст ответа на «прислал чек, когда никто его не ждёт».
 * Объясняет ситуацию и даёт два пути: вернуться в меню или связаться с
 * директором (если деньги уже переведены, а pending не нашёлся).
 */
async function buildUnexpectedReceiptMessage(): Promise<string> {
  const { getDirectorPersonalHandle } = await import("../notifications");
  const handle = await getDirectorPersonalHandle();
  const lines = ["🤔 Сейчас мы не ждём чек ни по одному из твоих заказов."];
  if (handle) {
    lines.push("");
    lines.push(
      `Если ты перевёл деньги по оформленному заказу, но он куда-то исчез — напиши ${handle}, разберёмся со суммой.`
    );
  }
  return lines.join("\n");
}

async function getSupportContactHandle(): Promise<string | null> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("director_tg_username, support_telegram_username")
    .maybeSingle();
  const raw =
    (data?.director_tg_username as string | null) ||
    (data?.support_telegram_username as string | null) ||
    null;
  if (!raw) return null;
  return `@${raw.replace(/^@/, "")}`;
}

async function sendOrderRequisites(
  ctx: CustomerContext,
  pendingOrderId: string,
  clientPrice: number
) {
  const db = getBotDb();

  const { data: method, error: methodError } = await db
    .rpc("next_payment_method", { p_amount: clientPrice })
    .maybeSingle();

  if (methodError || !method) {
    console.error("next_payment_method failed:", methodError);
    const handle = await getSupportContactHandle();
    const suffix = handle ? `\n${handle}` : "";
    await ctx.reply(
      `Не удалось подобрать реквизиты автоматически. Свяжись с поддержкой — заказ ожидает оплаты.${suffix}`
    );
    return;
  }

  // Запоминаем метод на pending'е — при confirm_pending_order_atomic v8
  // он скопируется в orders + забампит payment_method_month_stats.
  await db
    .from("pending_orders")
    .update({ payment_method_id: method.id })
    .eq("id", pendingOrderId)
    .then(({ error }) => {
      if (error) console.error("[sendOrderRequisites] save payment_method_id failed:", error);
    });

  const cancelKb = new InlineKeyboard().text(
    "❌ Отменить заказ",
    `pending:cancel:${pendingOrderId}`
  );
  const sumLine = `Сумма: <b>${formatPrice(clientPrice)}</b>`;
  const timerLine =
    "⏱️ <i>Оплата: 10 минут — иначе заказ обнулится.</i>\n\n" +
    "📌 <i>После оплаты пришли именно банковский чек или PDF-квитанцию из приложения банка («Поделиться чеком»), не скриншот ленты транзакций.</i>";

  if (method.kind === "ip_qr") {
    if (!method.qr_storage_path) {
      console.error(
        `[sendOrderRequisites] payment_method ${method.id} kind=ip_qr without qr_storage_path`
      );
      const handle = await getSupportContactHandle();
      const suffix = handle ? `\n${handle}` : "";
      await ctx.reply(
        `У владельца не загружено фото QR-кода. Свяжись с поддержкой — заказ ожидает оплаты.${suffix}`
      );
      return;
    }
    try {
      const buffer = await downloadOwnerQr(method.qr_storage_path);
      const caption = `🧾 <b>Реквизиты для оплаты — QR-код выше.</b>\n\n${sumLine}\n\n${QR_TIP}\n\n${timerLine}`;
      await ctx.replyWithPhoto(new InputFile(buffer, "qr.jpg"), {
        caption,
        parse_mode: "HTML",
        reply_markup: cancelKb,
      });
    } catch (error) {
      console.error("[sendOrderRequisites] failed to relay owner QR:", error);
      const handle = await getSupportContactHandle();
      const suffix = handle ? `\n${handle}` : "";
      await ctx.reply(
        `Не удалось получить QR-реквизиты. Свяжись с поддержкой — заказ ожидает оплаты.${suffix}`
      );
    }
    return;
  }

  // card / sbp — текстовый рендер с заголовком типа.
  const lines: string[] = [];
  if (method.kind === "card") {
    lines.push("💳 <b>Реквизиты для оплаты — карта:</b>");
    lines.push("");
    if (method.card_number_full) lines.push(`<code>${escapeHtml(method.card_number_full)}</code>`);
    if (method.bank_name) lines.push(escapeHtml(method.bank_name));
    if (method.holder_name) lines.push(escapeHtml(method.holder_name));
  } else {
    // sbp
    lines.push("📱 <b>Реквизиты для оплаты — СБП:</b>");
    lines.push("");
    if (method.sbp_phone) lines.push(`<code>${escapeHtml(method.sbp_phone)}</code>`);
    if (method.bank_name) lines.push(escapeHtml(method.bank_name));
    if (method.holder_name) lines.push(escapeHtml(method.holder_name));
  }

  const body = `${lines.join("\n")}\n\n${sumLine}\n\n${timerLine}`;
  await ctx.reply(body, { parse_mode: "HTML", reply_markup: cancelKb });
}

async function downloadOwnerQr(storagePath: string): Promise<Buffer> {
  const db = getBotDb();
  const { data, error } = await db.storage.from("payment-requisites").download(storagePath);
  if (error || !data) {
    throw error ?? new Error("Storage download returned empty");
  }
  return Buffer.from(await data.arrayBuffer());
}

// ============================================
// Реквизиты партнёра — статичные (G.2 v2, экран 4 (в))
// ============================================

export type PartnerRequisitesValue =
  | { type: "card"; value: string }
  | { type: "sbp"; value: string }
  | { type: "ip_qr"; file_id: string };

const PARTNER_REQUISITES_HEADERS: Record<PartnerRequisitesValue["type"], string> = {
  card: "💳 Реквизиты для оплаты — карта:",
  sbp: "📱 Реквизиты для оплаты — СБП:",
  ip_qr: "🧾 Реквизиты для оплаты — QR-код выше.",
};

function parsePartnerRequisites(raw: unknown): PartnerRequisitesValue | null {
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

const QR_TIP =
  "💡 Если ты с телефона и не можешь отсканировать QR с этого же экрана — добавь фото в Галерею (на iPhone распознаётся прямо там) или открой code-qr.ru/decoder и загрузи фото туда.";

async function sendPartnerStaticRequisites(
  ctx: CustomerContext,
  requisites: PartnerRequisitesValue | null,
  targetId: string | null,
  amount: number,
  entity: "order" | "pending" | "vibe-debt" = "order"
): Promise<void> {
  if (!requisites) {
    await ctx.reply("Реквизиты партнёра не настроены — свяжись с поддержкой.");
    return;
  }

  const isVibeDebt = entity === "vibe-debt";
  let cancelKb: InlineKeyboard | undefined;
  if (!isVibeDebt && targetId) {
    const cancelCallback =
      entity === "pending" ? `pending:cancel:${targetId}` : `order:cancel:${targetId}`;
    cancelKb = new InlineKeyboard().text("❌ Отменить заказ", cancelCallback);
  }

  const sumLine = `Сумма: <b>${formatPrice(amount)}</b>`;
  const timerLine = isVibeDebt
    ? "📌 <i>После оплаты пришли именно банковский чек или PDF-квитанцию из приложения банка («Поделиться чеком»), не скриншот ленты транзакций.</i>"
    : "⏱️ <i>Оплата: 10 минут — иначе заказ обнулится.</i>\n\n" +
      "📌 <i>После оплаты пришли именно банковский чек или PDF-квитанцию из приложения банка («Поделиться чеком»), не скриншот ленты транзакций.</i>";
  const header = PARTNER_REQUISITES_HEADERS[requisites.type];

  if (requisites.type === "ip_qr") {
    // file_id принадлежит partner-bot — Telegram запрещает переиспользовать его
    // в другом боте. Скачиваем фото через partner-bot токен и шлём буфером.
    try {
      const buffer = await downloadPhotoFromPartnerBot(requisites.file_id);
      await ctx.replyWithPhoto(new InputFile(buffer, "qr.jpg"), {
        caption: `${header}\n\n${sumLine}\n\n${QR_TIP}\n\n${timerLine}`,
        parse_mode: "HTML",
        ...(cancelKb ? { reply_markup: cancelKb } : {}),
      });
    } catch (error) {
      console.error("[sendPartnerStaticRequisites] failed to relay QR:", error);
      await ctx.reply("Не удалось получить QR-реквизиты партнёра. Свяжись с поддержкой.");
    }
    return;
  }

  await ctx.reply(
    `${header}\n\n<code>${escapeHtml(requisites.value)}</code>\n\n${sumLine}\n\n${timerLine}`,
    {
      parse_mode: "HTML",
      ...(cancelKb ? { reply_markup: cancelKb } : {}),
    }
  );
}

async function downloadPhotoFromPartnerBot(fileId: string): Promise<Buffer> {
  const token = process.env.TELEGRAM_PARTNER_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_PARTNER_BOT_TOKEN is not set");

  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!fileRes.ok) throw new Error(`getFile HTTP ${fileRes.status}`);
  const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;
  if (!filePath) throw new Error("partner-bot getFile returned no file_path");

  const photoRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!photoRes.ok) throw new Error(`download HTTP ${photoRes.status}`);
  return Buffer.from(await photoRes.arrayBuffer());
}

async function handleReceiptPhoto(ctx: CustomerContext, customer: Customer) {
  // Не-+ВАЙБ flow (§4.1 → 🅐): чек ждёт pending_orders, orders row ещё нет.
  if (ctx.session.awaitingReceiptForPendingOrderId) {
    return handlePendingReceiptPhoto(ctx, customer);
  }

  const orderId = ctx.session.awaitingReceiptForOrderId;
  if (!orderId) return false;

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return false;

  const best = photos[photos.length - 1];
  const db = getBotDb();

  try {
    const file = await ctx.api.getFile(best.file_id);
    if (!file.file_path) throw new Error("No file_path from Telegram");

    const telegramUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_CUSTOMER_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(telegramUrl);
    if (!response.ok) throw new Error(`Telegram download failed: ${response.status}`);
    const buffer = await response.arrayBuffer();

    const ext = file.file_path.split(".").pop() || "jpg";
    const storagePath = `${orderId}/${best.file_unique_id}.${ext}`;

    const { error: uploadError } = await db.storage.from("receipts").upload(storagePath, buffer, {
      contentType: response.headers.get("content-type") ?? "image/jpeg",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: order } = await db
      .from("orders")
      .select(
        "order_number, client_price, partner_id, product_size_id, delivery_service, tracking_number"
      )
      .eq("id", orderId)
      .single();

    await db.from("order_messages").insert({
      order_id: orderId,
      tg_chat_id: ctx.chat?.id ?? 0,
      tg_message_id: ctx.message?.message_id ?? 0,
      kind: "receipt",
      direction: "inbound",
      body: null,
      metadata: {
        file_path: storagePath,
        file_id: best.file_id,
        file_unique_id: best.file_unique_id,
      },
    });

    ctx.session.awaitingReceiptForOrderId = undefined;

    // BUSINESS_LOGIC §4.5: клиент свою часть выполнил (прислал чек) —
    // снимаем 10-мин таймер на отмену неоплаченных. Дальше судьбу заказа
    // решают Vision auto-confirm / партнёр / владелец.
    const { cancelExpireUnpaidOrder } = await import("@/lib/jobs/queues");
    cancelExpireUnpaidOrder(orderId).catch((e) =>
      console.error("cancelExpireUnpaidOrder failed:", e)
    );

    const isPartnerOrder = !!order?.partner_id;

    await ctx.reply(
      isPartnerOrder
        ? "🧾 Чек получен — пересылаем партнёру на подтверждение.\n\nОбычно подтверждают в течение нескольких часов; крайний срок — 24 часа."
        : "🧾 Чек получен — передаём владельцу на проверку. Мы напишем, как только оплата будет подтверждена."
    );

    if (order) {
      // Уведомление directorу шлём только для своих заказов. Партнёрские
      // заказы партнёр сам получает чек на подтверждение (см. forward ниже),
      // дублировать в DM директору не нужно.
      if (!order.partner_id) {
        notifyOwnerReceiptReceived({
          orderNumber: order.order_number,
          clientPrice: Number(order.client_price),
          customerName: customer.name,
          customerUsername: customer.telegram_username,
        }).catch((e) => console.error("notifyOwnerReceiptReceived failed:", e));
      }

      postReceiptToGroup({
        orderId,
        photoFileId: best.file_id,
        caption:
          `🧾 Чек · заказ <b>№${order.order_number}</b>\n` +
          `Сумма: <b>${formatPrice(Number(order.client_price))}</b>\n` +
          `Клиент: ${
            customer.telegram_username ? `@${customer.telegram_username}` : customer.name || "—"
          }`,
      }).catch((e) => console.error("postReceiptToGroup failed:", e));

      // G.2 v2: для партнёрских заказов форвардим фото партнёру с просьбой
      // подтвердить «N да» / «N нет». Параллельно ставим таймеры эскалации
      // (см. §10.2 канона + экран 4 (г)).
      if (order.partner_id && order.product_size_id) {
        const { sendReceiptPhotoToPartner } = await import("../notifications");

        // Подтянем название и размер для информативного уведомления партнёру.
        const { data: sizeRow } = await db
          .from("product_sizes")
          .select("size, products(name)")
          .eq("id", order.product_size_id)
          .maybeSingle();
        const sizeName = (sizeRow?.size as string | null) ?? null;
        const productName = ((sizeRow?.products as { name?: string } | null)?.name ?? null) as
          | string
          | null;

        const deliveryLabel = order.delivery_service
          ? (DELIVERY_LABELS[order.delivery_service as DeliveryService] ?? order.delivery_service)
          : null;

        sendReceiptPhotoToPartner({
          partnerId: order.partner_id,
          orderId,
          orderNumber: order.order_number,
          amount: Number(order.client_price),
          photoFileId: best.file_id,
          productName,
          size: sizeName,
          deliveryService: deliveryLabel,
          trackingNumber: order.tracking_number ?? null,
          customerUsername: customer.telegram_username,
        }).catch((e) => console.error("sendReceiptPhotoToPartner failed:", e));

        const { schedulePartnerPaymentTimers } = await import("@/lib/jobs/queues");
        schedulePartnerPaymentTimers(orderId).catch((e) =>
          console.error("schedulePartnerPaymentTimers failed:", e)
        );
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to save receipt:", error);
    await ctx.reply("Не удалось сохранить чек. Попробуй отправить ещё раз.");
    return true;
  }
}

/**
 * Извлекает входящий чек как буфер. Поддерживает:
 *   - photo (Telegram сжимает — берём наибольшее разрешение)
 *   - document image/* (jpg/png и т.п.)
 *   - document application/pdf — конвертируем первую страницу в PNG
 *
 * Возвращает {buffer, ext, contentType, uniqueKey, relayFileId, isPdf}.
 * relayFileId сохраняем для пересылки партнёру: для photo — file_id фото,
 * для document-картинки — file_id документа (партнёр получит как фото
 * через download → InputFile, file_id используется только как ключ хранения).
 */
type IncomingReceipt = {
  buffer: Buffer;
  ext: string;
  contentType: string;
  uniqueKey: string;
  relayFileId: string;
  isPdf: boolean;
};

async function extractIncomingReceiptFile(ctx: CustomerContext): Promise<IncomingReceipt | null> {
  const photo = ctx.message?.photo?.[ctx.message.photo.length - 1];
  const doc = ctx.message?.document;

  if (!photo && !doc) return null;

  const fileId = photo?.file_id ?? doc?.file_id;
  const uniqueKey = photo?.file_unique_id ?? doc?.file_unique_id ?? `f${Date.now()}`;
  if (!fileId) return null;

  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("No file_path from Telegram");

  const telegramUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_CUSTOMER_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(telegramUrl);
  if (!response.ok) throw new Error(`Telegram download failed: ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());

  const tgContentType = response.headers.get("content-type") ?? "";
  const docMime = doc?.mime_type ?? tgContentType;
  const isPdf = docMime === "application/pdf" || file.file_path.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const { pdfBufferToFirstPagePng } = await import("@/lib/ai/pdf-to-image");
    const png = await pdfBufferToFirstPagePng(original);
    return {
      buffer: png,
      ext: "png",
      contentType: "image/png",
      uniqueKey,
      relayFileId: fileId,
      isPdf: true,
    };
  }

  const ext = (file.file_path.split(".").pop() || "jpg").toLowerCase();
  return {
    buffer: original,
    ext,
    contentType: tgContentType || (photo ? "image/jpeg" : "application/octet-stream"),
    uniqueKey,
    relayFileId: fileId,
    isPdf: false,
  };
}

/**
 * Чек на pending_orders (не-+ВАЙБ заказ до подтверждения оплаты).
 * Обновляет pending.receipt_received_at; снимает 10-мин expire-pending-order.
 * Партнёрский → форвардит партнёру с order_number для текстового «N да/нет».
 * Свой → ждёт ручного подтверждения владельца (Vision auto-confirm пока не
 * реализован для одиночных заказов).
 */
async function handlePendingReceiptPhoto(
  ctx: CustomerContext,
  customer: Customer
): Promise<boolean> {
  const pendingId = ctx.session.awaitingReceiptForPendingOrderId;
  if (!pendingId) return false;

  const incoming = await extractIncomingReceiptFile(ctx);
  if (!incoming) return false;

  const db = getBotDb();

  try {
    const storagePath = `pending/${pendingId}/${incoming.uniqueKey}.${incoming.ext}`;

    const { error: uploadError } = await db.storage
      .from("receipts")
      .upload(storagePath, incoming.buffer, {
        contentType: incoming.contentType,
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const best = { file_id: incoming.relayFileId, file_unique_id: incoming.uniqueKey };

    const { data: pending, error: fetchError } = await db
      .from("pending_orders")
      .select(
        "id, order_number, customer_id, source_kind, source_warehouse, source_partner_id, product_id, product_size_id, client_price, applied_balance, delivery_service, tracking_number, receipt_received_at"
      )
      .eq("id", pendingId)
      .maybeSingle();

    if (fetchError || !pending) {
      // Pending уже удалён (sweep / expire) — клиент опоздал.
      ctx.session.awaitingReceiptForPendingOrderId = undefined;
      await ctx.reply("К сожалению, заказ уже отменён по таймауту. Оформи заново через каталог.");
      return true;
    }

    // Guard: чек уже получен и сейчас на проверке у Vision/директора.
    // Клиент мог нажать «отправить» дважды или прислать второй файл следом.
    // Не запускаем второй Vision-job (jobId уникальный per попытку — будет
    // дубликат в очереди), просто говорим «ждём ответа». Worker при retry
    // сам сбрасывает receipt_received_at = null — тогда новые чеки принимаются.
    if (pending.receipt_received_at) {
      await ctx.reply("🧾 Чек уже на проверке. Подожди — напишем как только подтвердим оплату.");
      return true;
    }

    const { error: updateError } = await db
      .from("pending_orders")
      .update({
        receipt_storage_path: storagePath,
        receipt_file_id: best.file_id,
        receipt_received_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
    if (updateError) throw updateError;

    // session.awaitingReceiptForPendingOrderId НЕ сбрасываем — пусть живёт пока
    // pending активен. При retry worker сбрасывает receipt_received_at, клиент
    // присылает новый чек тем же сообщением (фото/PDF), сюда снова попадаем.
    // Сброс происходит только при confirm/cancel/expire (см. соответствующие
    // notify-функции и abortActiveCheckout).

    // Чек получен → снимаем 10-мин expire-pending-order таймер.
    const { cancelExpirePendingOrder } = await import("@/lib/jobs/queues");
    cancelExpirePendingOrder(pending.id).catch((e) =>
      console.error("cancelExpirePendingOrder failed:", e)
    );

    // Любой партнёрский заказ — чек идёт партнёру (деньги ему, он и решает).
    // Склад влияет только на отправку (см. shipper-API), на платёжный flow — нет.
    const partnerHandlesPayment = pending.source_kind === "partner";

    await ctx.reply(
      partnerHandlesPayment
        ? "🧾 Чек получен — пересылаем партнёру на подтверждение.\n\nОбычно подтверждают в течение нескольких часов; крайний срок — 24 часа."
        : "🧾 Чек получен — проверяем оплату. Напишем, как только подтвердим."
    );

    // notifyOwnerReceiptReceived здесь НЕ шлём — для pending-flow Vision
    // сам решит auto-confirm / retry / к директору.

    // Vision auto-confirm запускается, если оплата идёт владельцу. При confirm
    // RPC v10 копирует source_* в orders, отправщик получит заказ через shipper
    // API (фильтр eq("source_warehouse", "owner")).
    if (!partnerHandlesPayment) {
      const remaining = Number(pending.client_price) - Number(pending.applied_balance ?? 0);
      const { scheduleRecognizePendingReceipt } = await import("@/lib/jobs/queues");
      scheduleRecognizePendingReceipt({
        pendingOrderId: pending.id,
        filePath: storagePath,
        expectedAmount: Math.max(0, remaining),
        expectedSinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }).catch((e) => console.error("scheduleRecognizePendingReceipt failed:", e));
    }

    if (partnerHandlesPayment && pending.source_partner_id && pending.product_size_id) {
      const { sendReceiptPhotoToPartner } = await import("../notifications");

      const { data: sizeRow } = await db
        .from("product_sizes")
        .select("size, products(name)")
        .eq("id", pending.product_size_id)
        .maybeSingle();
      const sizeName = (sizeRow?.size as string | null) ?? null;
      const productName = ((sizeRow?.products as { name?: string } | null)?.name ?? null) as
        | string
        | null;

      // Партнёр пишет «<order_number> да/нет» — partner-bot ищет pending_orders
      // по этому номеру (не orders.order_number).
      const deliveryLabel = pending.delivery_service
        ? (DELIVERY_LABELS[pending.delivery_service as DeliveryService] ?? pending.delivery_service)
        : null;

      sendReceiptPhotoToPartner({
        partnerId: pending.source_partner_id,
        orderId: pending.id,
        orderNumber: Number(pending.order_number),
        amount: Number(pending.client_price),
        photoBuffer: incoming.buffer,
        photoFilename: `receipt.${incoming.ext}`,
        productName,
        size: sizeName,
        deliveryService: deliveryLabel,
        trackingNumber: pending.tracking_number ?? null,
        customerUsername: customer.telegram_username,
      }).catch((e) => console.error("sendReceiptPhotoToPartner failed:", e));
    }

    return true;
  } catch (error) {
    console.error("handlePendingReceiptPhoto failed:", error);
    await ctx.reply("Не удалось сохранить чек. Попробуй отправить ещё раз.");
    return true;
  }
}

function buildCheckoutCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Отмена", "checkout:cancel");
}

/**
 * Реакция на «потерянную» сессию wizard'а — после рестарта бота
 * (MemorySessionStorage — сессия живёт только в RAM процесса) клиент
 * мог тапнуть кнопку из старого сообщения, для которого draft уже
 * отсутствует. Сбрасываем состояние и предлагаем начать заново.
 */
async function replyStaleCheckoutSession(ctx: CustomerContext): Promise<void> {
  ctx.session.step = undefined;
  ctx.session.checkoutDraft = undefined;
  await ctx.reply("Упс, заказ потерялся — давай начнём заново 👇", {
    reply_markup: new InlineKeyboard().switchInlineCurrent("🔍 Начать поиск", ""),
  });
}

// ============================================
// Helpers для шага «выбор send_by» в wizard'е (BUSINESS_LOGIC §4.5)
// ============================================

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateRu(iso: string): string {
  return parseFlexibleDate(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function fetchDeadlineSettings(): Promise<{
  sendByTodayCutoff: string;
  sendByMaxDays: number;
}> {
  const db = getBotDb();
  const { data } = await db
    .from("business_settings")
    .select("send_by_today_cutoff, send_by_max_days")
    .limit(1)
    .single();
  return {
    sendByTodayCutoff: (data?.send_by_today_cutoff as string) ?? "16:00:00",
    sendByMaxDays: Number(data?.send_by_max_days ?? 7),
  };
}

/**
 * Минимальная допустимая дата send_by (BUSINESS_LOGIC §4.5):
 * сегодня — если ещё не прошёл cutoff в `business_settings.send_by_today_cutoff`,
 * иначе — завтра.
 */
function computeSendByMinDate(cutoff: string): string {
  const today = moscowToday();
  return moscowTimeNow() < cutoff ? today : addDaysIso(today, 1);
}

/**
 * Клиент отменил pending_orders запись до оплаты (§4.1 → 🅐).
 * Удаляем pending + декрементим reserved_quantity через RPC.
 */
/**
 * Тапнул нижнее меню в середине wizard'а или на этапе ожидания чека —
 * отменяем заказ (pending или soft-резерв размера) и чистим сессию.
 * Возвращает true если что-то реально откатывали.
 */
async function abortActiveCheckout(ctx: CustomerContext, customer: Customer): Promise<boolean> {
  const db = getBotDb();

  // Источник правды — БД, не session-флаги. Нужно потому что в retry-окне
  // (Vision не разобрал чек, ждём повторной отправки) session.awaitingReceipt
  // снят, но pending в БД жив с receipt_received_at=NULL.
  // А когда чек уже на рассмотрении (Vision/партнёр/директор) —
  // receipt_received_at стоит, такие pending'и НЕ отменяем: клиент идёт
  // оформлять параллельно, ждать одобрения.
  // Для +ВАЙБ-долгового pending'а (partner_warehouse) клиент не должен
  // присылать чек — отменять при тапе меню тоже не надо: заказ уже принят,
  // ждём только «N да» от партнёра.
  const { data: pendings } = await db
    .from("pending_orders")
    .select(
      "id, order_number, source_partner_id, source_warehouse, receipt_received_at, is_vibe_debt"
    )
    .eq("customer_id", customer.id)
    .is("receipt_received_at", null)
    .eq("is_vibe_debt", false);

  if (pendings && pendings.length > 0) {
    const { cancelExpirePendingOrder, cancelDirectorPaymentExpire } =
      await import("@/lib/jobs/queues");

    for (const p of pendings) {
      const { error } = await db
        .rpc("cancel_pending_order_atomic", { p_pending_order_id: p.id })
        .single();
      if (error) console.error("[abortActiveCheckout] cancel_pending failed:", error);

      cancelExpirePendingOrder(p.id).catch(() => {});
      cancelDirectorPaymentExpire(p.id).catch(() => {});

      // Уведомление партнёру шлём ТОЛЬКО если он реально был в оплате —
      // partner-warehouse источник. Для owner-warehouse-партнёрского
      // партнёр в оплате не участвует (платит владелец), его уведомлять
      // об cancel'е незачем.
      if (p.source_partner_id && p.source_warehouse === "partner") {
        void sendToPartner({
          partnerId: p.source_partner_id,
          text: `🤝 Заказ №${p.order_number} отменён клиентом.`,
        }).catch((e) => console.error("[abortActiveCheckout] sendToPartner failed:", e));
      }

      await ctx.reply(`❌ Заказ №${p.order_number} отменён — ты вышел из оформления через меню.`);
    }

    ctx.session.awaitingReceiptForPendingOrderId = undefined;
    ctx.session.checkoutDraft = undefined;
    ctx.session.step = undefined;
    return true;
  }

  const draft = ctx.session.checkoutDraft;
  if (draft) {
    if (draft.sizeId) {
      await db
        .rpc("release_size_reservation_atomic", {
          p_product_size_id: draft.sizeId,
          p_session_id: customer.id,
        })
        .then(({ error }) => {
          if (error) console.error("[abortActiveCheckout] release_size_reservation failed:", error);
        });

      const { cancelReleaseReservation } = await import("@/lib/jobs/queues");
      cancelReleaseReservation(draft.sizeId, customer.id).catch(() => {});
    }

    ctx.session.checkoutDraft = undefined;
    ctx.session.step = undefined;
    await ctx.reply("❌ Оформление отменено — ты вышел из него через меню.");
    return true;
  }

  // Pending'и есть, но все на рассмотрении (receipt_received_at стоит) —
  // ничего не отменяем, пусть клиент спокойно идёт в меню.
  return false;
}

async function cancelPendingOrderById(ctx: CustomerContext, customer: Customer, pendingId: string) {
  const db = getBotDb();
  const { data: pending } = await db
    .from("pending_orders")
    .select("id, order_number, customer_id, partner_id")
    .eq("id", pendingId)
    .maybeSingle();

  if (!pending || pending.customer_id !== customer.id) {
    await ctx.reply("Заказ не найден.");
    return;
  }

  const { error } = await db
    .rpc("cancel_pending_order_atomic", { p_pending_order_id: pendingId })
    .single();

  if (error) {
    console.error("cancel_pending_order_atomic failed:", error);
    await ctx.reply("Не удалось отменить. Свяжись с поддержкой.");
    return;
  }

  if (ctx.session.awaitingReceiptForPendingOrderId === pendingId) {
    ctx.session.awaitingReceiptForPendingOrderId = undefined;
  }

  const { cancelExpirePendingOrder, cancelDirectorPaymentExpire } =
    await import("@/lib/jobs/queues");
  cancelExpirePendingOrder(pendingId).catch((e) =>
    console.error("cancelExpirePendingOrder failed:", e)
  );
  cancelDirectorPaymentExpire(pendingId).catch((e) =>
    console.error("cancelDirectorPaymentExpire failed:", e)
  );

  if (pending.partner_id) {
    void sendToPartner({
      partnerId: pending.partner_id,
      text: `🤝 Заказ №${pending.order_number} отменён клиентом.`,
    }).catch((e) => console.error("[cancelPendingOrderById] sendToPartner failed:", e));
  }

  await ctx.reply(`Заказ отменён.`);
  await sendMainMenu(ctx, customer);
}

function buildProductCaption(product: CatalogProduct): string {
  const titleLine = product.is_premium
    ? `💎 <b>${escapeHtml(product.name)}</b>`
    : `<b>${escapeHtml(product.name)}</b>`;
  const lines: string[] = [titleLine];
  lines.push(`Дроп: <b>${formatPrice(product.drop_price)}</b>`);
  if (product.recommended_price) {
    lines.push(`Авито: <b>${formatPrice(product.recommended_price)}</b>`);
  }
  lines.push(`🏙️ Город: ${escapeHtml(product.location_city)}`);
  if (product.description) {
    lines.push("");
    lines.push(escapeHtml(product.description));
  }
  const caption = lines.join("\n");
  // Telegram ограничивает caption ≈ 1024 символа.
  return caption.length > 1000 ? caption.slice(0, 1000) + "…" : caption;
}

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ============================================
// +ВАЙБ-оплата долга (Phase 3.5)
// ============================================

async function fetchOpenVibeOrders(customerId: string) {
  const db = getBotDb();
  const { data } = await db
    .from("orders")
    .select("id, order_number, client_price, applied_balance, created_at, partner_id")
    .eq("customer_id", customerId)
    .eq("is_paid", false)
    .eq("payment_method", "deposit")
    .not("status", "in", "(cancelled,trash,return_done)")
    .order("created_at", { ascending: true });
  // Возвращаем фактический остаток к оплате (за вычетом применённого
  // баланса при оформлении). client_price оставляем для аудита.
  return (data ?? []).map((o) => ({
    ...o,
    debt_remaining: Number(o.client_price) - Number(o.applied_balance ?? 0),
  }));
}

/**
 * Группирует открытые vibe-заказы по адресату платежа.
 * - Группа `owner` собирает заказы без partner_id.
 * - Каждый partner_id — отдельная группа (имя берём из partners).
 */
async function fetchVibePaymentGroups(customerId: string, ownerLabel: string) {
  const db = getBotDb();
  const orders = await fetchOpenVibeOrders(customerId);
  if (orders.length === 0) return { groups: [], total: 0 };

  const partnerIds = Array.from(
    new Set(orders.map((o) => o.partner_id).filter((id): id is string => !!id))
  );

  let partnersMap = new Map<string, { name: string; tgUsername: string | null }>();
  if (partnerIds.length > 0) {
    const { data: partners } = await db
      .from("partners")
      .select("id, name, tg_username")
      .in("id", partnerIds);
    partnersMap = new Map(
      (partners ?? []).map((p) => [p.id, { name: p.name, tgUsername: p.tg_username }])
    );
  }

  type Group = {
    kind: "owner" | "partner";
    partnerId: string | null;
    label: string;
    orders: typeof orders;
    total: number;
  };

  const ownerOrders = orders.filter((o) => !o.partner_id);
  const groups: Group[] = [];
  if (ownerOrders.length > 0) {
    groups.push({
      kind: "owner",
      partnerId: null,
      label: ownerLabel,
      orders: ownerOrders,
      total: ownerOrders.reduce((s, o) => s + o.debt_remaining, 0),
    });
  }

  for (const pid of partnerIds) {
    const partnerOrders = orders.filter((o) => o.partner_id === pid);
    const info = partnersMap.get(pid);
    const label = info?.tgUsername
      ? `🤝 @${info.tgUsername}`
      : info?.name
        ? `🤝 ${info.name}`
        : "🤝 Партнёр";
    groups.push({
      kind: "partner",
      partnerId: pid,
      label,
      orders: partnerOrders,
      total: partnerOrders.reduce((s, o) => s + o.debt_remaining, 0),
    });
  }

  return {
    groups,
    total: orders.reduce((s, o) => s + o.debt_remaining, 0),
  };
}

async function openDebtPay(ctx: CustomerContext, customer: Customer) {
  if (!customer.vibe_enabled) {
    await ctx.reply("Эта функция доступна только +ВАЙБ-клиентам.");
    return;
  }

  const { businessName } = await getBusinessContext();
  const ownerLabel = businessName ? `🏠 ${businessName}` : "🏠 Магазин";

  const { groups, total } = await fetchVibePaymentGroups(customer.id, ownerLabel);

  if (total <= 0) {
    await ctx.reply("✅ У тебя нет открытого долга — можно оформлять новые заказы.");
    return;
  }

  const required =
    customer.required_payment_amount != null ? Number(customer.required_payment_amount) : null;
  const snapshot =
    customer.frozen_debt_snapshot != null ? Number(customer.frozen_debt_snapshot) : null;

  const lines: string[] = [`💳 <b>Оплата долга</b>`, `Общий долг: <b>${formatPrice(total)}</b>`];
  if (customer.is_frozen && required != null && required > 0 && snapshot != null) {
    const paid = Math.max(0, snapshot - total);
    const left = Math.max(0, required - paid);
    lines.push(
      `К разморозке: оплатить больше <b>${formatPrice(required)}</b> ` +
        `(уже ${formatPrice(paid)}, осталось ${formatPrice(left)}).`
    );
  }
  if (groups.length > 1) {
    lines.push("");
    lines.push("Долг разбит по адресатам — нельзя смешать в один чек. Выбери, кому платишь:");
  }

  const kb = new InlineKeyboard();
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    kb.text(`${g.label} · ${formatPrice(g.total)} (${g.orders.length})`, `vibe:group:${i}`).row();
  }
  kb.text("❌ Отмена", "vibe:pay:cancel");

  // Сохраняем список заказов в session для callback'ов.
  ctx.session.vibePayGroups = groups.map((g) => ({
    kind: g.kind,
    partnerId: g.partnerId,
    label: g.label,
    orderIds: g.orders.map((o) => o.id),
    orderNumbers: g.orders.map((o) => o.order_number),
    prices: g.orders.map((o) => o.debt_remaining),
    total: g.total,
  }));

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function openVibeGroup(ctx: CustomerContext, customer: Customer, groupIndex: number) {
  void customer;
  const group = ctx.session.vibePayGroups?.[groupIndex];
  if (!group) {
    await ctx.reply("Сессия устарела — открой меню заново.");
    return;
  }
  // Сбрасываем предыдущий выбор при входе в новую группу.
  ctx.session.vibePaySelected = undefined;

  // Multi-select для обеих групп (owner / partner). Клиент тапает заказы
  // (toggle), потом «✅ Оплатить выбранные» → один чек на выбранные:
  //   - owner-группа → recognize-receipt route='owner' (Vision auto-confirm).
  //   - partner-группа → route='partner' (партнёр подтверждает).
  const togglePrefix = group.kind === "owner" ? "vibe:owner:toggle" : "vibe:partner:toggle";
  const lines = [
    `${group.label}`,
    `Заказов всего: ${group.orderIds.length} · ${formatPrice(group.total)}`,
    "",
    `Тапни заказы которые хочешь закрыть — оплатишь одним чеком.`,
  ];
  const kb = new InlineKeyboard();
  for (let i = 0; i < group.orderIds.length; i++) {
    kb.text(
      `☐ №${group.orderNumbers[i]} · ${formatPrice(group.prices[i])}`,
      `${togglePrefix}:${groupIndex}:${i}`
    ).row();
  }
  kb.text("↩️ Назад", "vibe:pay:open");

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function startVibeOwnerPayment(ctx: CustomerContext, customer: Customer, groupIndex: number) {
  // Idempotency — не запускаем повторно если уже ждём чек.
  if (ctx.session.awaitingVibeReceipt) {
    await ctx.reply("Уже ждём чек по предыдущей оплате. Пришли его сюда фото.");
    return;
  }

  const group = ctx.session.vibePayGroups?.[groupIndex];
  if (!group || group.kind !== "owner") {
    await ctx.reply("Сессия устарела — открой меню заново.");
    return;
  }

  const sel = ctx.session.vibePaySelected;
  if (!sel || sel.groupIndex !== groupIndex || sel.selected.length === 0) {
    await ctx.reply("Не выбрано ни одного заказа.");
    return;
  }

  const indexes = sel.selected;
  const selected = indexes.map((i) => ({
    id: group.orderIds[i],
    orderNumber: group.orderNumbers[i],
    clientPrice: group.prices[i],
  }));
  const actualAmount = selected.reduce((acc, s) => acc + s.clientPrice, 0);

  const db = getBotDb();
  const { data: method, error: methodError } = await db
    .rpc("next_payment_method", { p_amount: actualAmount })
    .maybeSingle();

  if (methodError || !method) {
    console.error("next_payment_method failed:", methodError);
    await ctx.reply("Не удалось подобрать реквизиты. Свяжись с владельцем.");
    return;
  }

  const { data: settings } = await db
    .from("business_settings")
    .select("payment_requisites_message")
    .maybeSingle();

  const rendered = renderRequisites(settings?.payment_requisites_message, {
    amount: actualAmount,
    orderNumbers: selected.map((s) => s.orderNumber),
    cardLabel: method.label,
    cardNumber: method.card_number_full,
    bank: method.bank_name,
    holder: method.holder_name,
    sbpPhone: method.sbp_phone,
  });

  ctx.session.awaitingVibeReceipt = {
    amount: actualAmount,
    paymentMethodId: method.id,
    orderIds: selected.map((s) => s.id),
    expectedSinceIso: customer.frozen_at ?? new Date().toISOString(),
    route: "owner",
  };
  ctx.session.vibePaySelected = undefined;

  await ctx.reply(rendered, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("❌ Отмена", "vibe:pay:cancel"),
  });
}

/**
 * Toggle выбранного партнёрского заказа в multi-select. Обновляет состояние
 * в session и редактирует сообщение через editMessageText (без спама новыми
 * сообщениями).
 */
/**
 * Multi-select для группы заказов в wizard'е оплаты долга.
 * Работает одинаково для owner- и partner-групп: чекбокс на заказ,
 * сумма выбранных, кнопка «Оплатить выбранные».
 */
async function togglePayOrderSelection(
  ctx: CustomerContext,
  groupIndex: number,
  orderIndex: number
) {
  const group = ctx.session.vibePayGroups?.[groupIndex];
  if (!group) return;

  const cur = ctx.session.vibePaySelected;
  let selected: number[];
  if (cur && cur.groupIndex === groupIndex) {
    selected = cur.selected.includes(orderIndex)
      ? cur.selected.filter((i) => i !== orderIndex)
      : [...cur.selected, orderIndex];
  } else {
    selected = [orderIndex];
  }
  ctx.session.vibePaySelected = { groupIndex, selected };

  const sel = new Set(selected);
  const selectedTotal = selected.reduce((s, i) => s + (group.prices[i] ?? 0), 0);
  const lines = [
    `${group.label}`,
    `Заказов всего: ${group.orderIds.length} · ${formatPrice(group.total)}`,
    "",
    sel.size > 0
      ? `Выбрано: ${sel.size} · <b>${formatPrice(selectedTotal)}</b>`
      : `Тапни заказы которые хочешь закрыть — оплатишь одним чеком.`,
  ];
  const togglePrefix = group.kind === "owner" ? "vibe:owner:toggle" : "vibe:partner:toggle";
  const startPrefix = group.kind === "owner" ? "vibe:owner:start" : "vibe:partner:start";

  const kb = new InlineKeyboard();
  for (let i = 0; i < group.orderIds.length; i++) {
    const mark = sel.has(i) ? "☑" : "☐";
    kb.text(
      `${mark} №${group.orderNumbers[i]} · ${formatPrice(group.prices[i])}`,
      `${togglePrefix}:${groupIndex}:${i}`
    ).row();
  }
  if (sel.size > 0) {
    kb.text(
      `✅ Оплатить выбранные (${formatPrice(selectedTotal)})`,
      `${startPrefix}:${groupIndex}`
    ).row();
  }
  kb.text("↩️ Назад", "vibe:pay:open");

  try {
    await ctx.editMessageText(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  } catch (e) {
    console.error("togglePayOrderSelection editMessageText failed:", e);
  }
}

async function startVibePartnerPayment(
  ctx: CustomerContext,
  customer: Customer,
  groupIndex: number
) {
  // Idempotency: если уже ждём чек по другому платежу — игнорируем
  // повторный тап «Оплатить выбранные».
  if (ctx.session.awaitingVibeReceipt) {
    await ctx.reply("Уже ждём чек по предыдущей оплате. Пришли его сюда фото.");
    return;
  }

  const group = ctx.session.vibePayGroups?.[groupIndex];
  if (!group || group.kind !== "partner" || !group.partnerId) {
    await ctx.reply("Сессия устарела — открой меню заново.");
    return;
  }

  const sel = ctx.session.vibePaySelected;
  if (!sel || sel.groupIndex !== groupIndex || sel.selected.length === 0) {
    await ctx.reply("Не выбрано ни одного заказа.");
    return;
  }

  const indexes = sel.selected;
  const orderIds = indexes.map((i) => group.orderIds[i]);
  const orderNumbers = indexes.map((i) => group.orderNumbers[i]);
  const prices = indexes.map((i) => group.prices[i]);
  const totalAmount = prices.reduce((s, p) => s + p, 0);

  // Берём сохранённые статичные реквизиты партнёра — никаких real-time
  // запросов «Ответьте реквизитами» (это устаревший flow до G.2 v2).
  const db = getBotDb();
  const { data: partner } = await db
    .from("partners")
    .select("id, name, payment_requisites")
    .eq("id", group.partnerId)
    .maybeSingle();

  if (!partner?.payment_requisites) {
    await ctx.reply(`У партнёра «${group.label}» не указаны реквизиты — обратись в поддержку.`);
    return;
  }

  ctx.session.awaitingVibeReceipt = {
    amount: totalAmount,
    paymentMethodId: null,
    orderIds,
    expectedSinceIso: new Date().toISOString(),
    route: "partner",
    partnerId: group.partnerId,
  };
  // Чистим состояние выбора — после успешной оплаты сессия уже не нужна.
  ctx.session.vibePaySelected = undefined;
  void customer;

  const orderList = orderNumbers.map((n, i) => `№${n} — ${formatPrice(prices[i])}`).join("\n");

  await ctx.reply(
    `💳 <b>Оплата ${group.label}</b>\n\n` +
      `Заказы:\n${orderList}\n\n` +
      `<b>К оплате: ${formatPrice(totalAmount)}</b>\n\n` +
      `Переведи сумму по реквизитам ниже и пришли фото чека сюда — мы перешлём его партнёру на подтверждение.`,
    { parse_mode: "HTML" }
  );

  // Реквизиты партнёра отдельным сообщением (могут быть text или photo).
  await sendPartnerStaticRequisites(
    ctx,
    parsePartnerRequisites(partner.payment_requisites),
    null,
    totalAmount,
    "vibe-debt"
  );
}

// startVibePayment заменён на startVibeOwnerPayment + startVibePartnerPayment
// в Stage 3 пост-фиксе (группировка по адресатам).

async function handleVibeReceiptPhoto(ctx: CustomerContext, customer: Customer): Promise<boolean> {
  const draft = ctx.session.awaitingVibeReceipt;
  if (!draft) return false;

  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return false;

  const best = photos[photos.length - 1];

  try {
    const file = await ctx.api.getFile(best.file_id);
    if (!file.file_path) throw new Error("No file_path from Telegram");

    const telegramUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_CUSTOMER_BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(telegramUrl);
    if (!response.ok) throw new Error(`Telegram download failed: ${response.status}`);
    const buffer = await response.arrayBuffer();

    const ext = file.file_path.split(".").pop() || "jpg";
    const storagePath = `vibe/${customer.id}/${best.file_unique_id}.${ext}`;

    const db = getBotDb();
    const { error: uploadError } = await db.storage.from("receipts").upload(storagePath, buffer, {
      contentType: response.headers.get("content-type") ?? "image/jpeg",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { getAutomationQueue } = await import("@/lib/jobs/queues");
    const queue = getAutomationQueue();
    await queue.add("recognize-receipt", {
      customerId: customer.id,
      orderIds: draft.orderIds,
      amountExpected: draft.amount,
      paymentMethodId: draft.paymentMethodId,
      filePath: storagePath,
      expectedSinceIso: draft.expectedSinceIso,
      route: draft.route,
      partnerId: draft.partnerId ?? null,
      isVibe: true,
    });

    ctx.session.awaitingVibeReceipt = undefined;
    if (draft.route === "partner") {
      await ctx.reply(
        "🧾 Чек получен — пересылаем партнёру на подтверждение.\n\n" +
          "Обычно подтверждают в течение нескольких часов; крайний срок — 24 часа."
      );
    } else {
      await ctx.reply("🧾 Чек получен — проверяем сумму, ответим через минуту.");
    }
    return true;
  } catch (error) {
    console.error("handleVibeReceiptPhoto failed:", error);
    await ctx.reply("Не удалось обработать чек. Попробуй ещё раз.");
    return true;
  }
}

// ============================================
// Singleton для переиспользования (webhook + уведомления)
// ============================================

export let customerBot: Bot<CustomerContext> | null = null;

export function getCustomerBot() {
  if (!customerBot) {
    customerBot = createCustomerBot();
  }
  return customerBot;
}
