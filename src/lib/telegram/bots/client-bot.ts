/**
 * Telegram бот для клиентов (@avitofamclientsbot)
 *
 * Функции:
 * - Регистрация с реферальным кодом
 * - Генерация site_key для входа на сайт
 * - Просмотр заказов и статистики
 * - Настройки уведомлений
 * - Оплата подписки
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { KEYBOARDS, createNotificationSettingsKeyboard } from "../utils/keyboards";
import {
  formatPrice,
  formatDate,
  formatOrderStatus,
  formatDeliveryService,
  formatLevel,
  getLevelDiscount,
  SUBSCRIPTION_LABELS,
} from "../utils/formatters";

import {
  findUserByTelegramId,
  createClientUser,
  regenerateSiteKey,
  updateNotificationSettings,
  getClientActiveOrders,
  getClientStats,
  getBotDb,
} from "../db";
import type { Database } from "@/types/database.generated";

type User = Database["public"]["Tables"]["users"]["Row"];

// Скачивает аватарку из Telegram профиля и загружает в Supabase Storage
async function fetchTelegramAvatar(
  api: ClientContext["api"],
  telegramId: number
): Promise<string | null> {
  try {
    const photos = await api.getUserProfilePhotos(telegramId, { limit: 1 });
    if (photos.total_count === 0) return null;

    const sizes = photos.photos[0];
    const largest = sizes[sizes.length - 1];
    const file = await api.getFile(largest.file_id);
    if (!file.file_path) return null;

    const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN!;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(downloadUrl);
    const buffer = Buffer.from(await res.arrayBuffer());

    const db = getBotDb();
    const fileName = `${telegramId}.jpg`;
    await db.storage.from("avatars").upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
    return db.storage.from("avatars").getPublicUrl(fileName).data.publicUrl;
  } catch (err) {
    console.error("[Avatar] Failed to fetch:", err);
    return null;
  }
}

// Синхронизирует данные Telegram-профиля с БД при каждом /start
async function syncTelegramProfile(ctx: ClientContext, user: User): Promise<void> {
  const telegramId = ctx.from!.id;
  const currentUsername = ctx.from?.username || null;
  const currentName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || null;

  const updates: Record<string, unknown> = {};

  // Синхронизируем username
  if (user.telegram_username !== currentUsername) {
    updates.telegram_username = currentUsername;
  }

  // Синхронизируем имя (только если user.name было из TG, а не кастомное)
  if (currentName && user.name !== currentName) {
    updates.name = currentName;
  }

  // Синхронизируем аватарку
  const avatarUrl = await fetchTelegramAvatar(ctx.api, telegramId);
  if (avatarUrl && avatarUrl !== user.avatar_url) {
    updates.avatar_url = avatarUrl;
  }

  if (Object.keys(updates).length > 0) {
    const db = getBotDb();
    await db.from("users").update(updates).eq("telegram_id", telegramId);
    console.log(`[Sync] Updated profile for ${telegramId}:`, Object.keys(updates));
  }
}

// Сессия для хранения состояния
interface SessionData {
  referralCode?: string;
  notificationSettings?: {
    orderStatus: boolean;
    newProducts: boolean;
    promotions: boolean;
  };
}

type ClientContext = Context & SessionFlavor<SessionData>;

// Создаём бота
export function createClientBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_CLIENT_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_CLIENT_BOT_TOKEN is not set");
  }

  const bot = new Bot<ClientContext>(botToken);

  // Добавляем сессию
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // Обработка ошибок — отвечаем пользователю и не даём 500 уйти в Telegram
  bot.catch(async (err) => {
    console.error("Client bot error:", err);
    try {
      await err.ctx.reply("😔 Что-то пошло не так. Попробуй ещё раз или нажми /menu");
    } catch {
      // Не удалось отправить — ничего страшного
    }
  });

  // ============================================
  // Команды
  // ============================================

  // /start — начало работы
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Проверяем реферальный код в параметре
    const startParam = ctx.match;
    if (startParam) {
      ctx.session.referralCode = startParam;
    }

    // Ищем пользователя
    const user = await findUserByTelegramId(telegramId);

    if (user) {
      // Существующий пользователь — синхронизируем профиль из Telegram
      syncTelegramProfile(ctx, user).catch((err) => {
        console.error("[Sync] Profile sync error:", err);
      });
      await sendMainMenu(ctx, user);
    } else {
      // Новый пользователь — приветствие с кнопкой регистрации
      await ctx.reply(
        "Привет! 👋\n\n" +
          "Добро пожаловать в AVITO FAM — систему дропшиппинга одежды.\n\n" +
          "Это не просто каталог с товарами.\n" +
          "Это платформа, которой в дропшиппинге ещё не было:\n\n" +
          "⚡ Ноль вложений в товар — заказал, мы отправили, ты заработал\n" +
          "🤖 AI-агент продаёт за тебя на Avito 24/7\n" +
          "📊 Личный кабинет с аналитикой — прибыль, ROI, выручка в реальном времени\n" +
          "🏆 Еженедельная гонка продаж с призами\n" +
          "💎 Система +ВАЙБ — работай без предоплаты\n" +
          "🔗 Реферальная программа — зарабатывай с продаж друзей\n\n" +
          "Жми кнопку 👇",
        {
          reply_markup: {
            inline_keyboard: [[{ text: "🚀 Создать аккаунт", callback_data: "create_account" }]],
          },
        }
      );
    }
  });

  // /help — справка
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📚 Справка\n\n" +
        "Команды:\n" +
        "/menu — Главное меню\n" +
        "/orders — Твои заказы\n" +
        "/stats — Статистика\n" +
        "/key — Ключ от сайта\n" +
        "/settings — Настройки\n" +
        "/help — Эта справка\n\n" +
        "───────────────\n" +
        "💬 Поддержка: @avitofammanager"
    );
  });

  // /menu — главное меню из любого места
  bot.command("menu", async (ctx) => {
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    await sendMainMenu(ctx, user);
  });

  // /orders — заказы
  bot.command("orders", async (ctx) => {
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    await showActiveOrders(ctx, user);
  });

  // /stats — статистика
  bot.command("stats", async (ctx) => {
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    await showStats(ctx, user);
  });

  // /key — ключ для сайта
  bot.command("key", async (ctx) => {
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    await showSiteKey(ctx, user);
  });

  // /settings — настройки
  bot.command("settings", async (ctx) => {
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    await showSettings(ctx);
  });

  // ============================================
  // Обработка текстовых сообщений
  // ============================================

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Обрабатываем кнопки клавиатуры
    const user = await getUserOrRegister(ctx);
    if (!user) return;

    switch (text) {
      case "📦 Мои заказы":
        await showActiveOrders(ctx, user);
        break;
      case "📊 Моя статистика":
        await showStats(ctx, user);
        break;
      case "💳 Подписка":
        await showSubscriptionOptions(ctx, user);
        break;
      case "🔑 Ключ от сайта":
        await showSiteKey(ctx, user);
        break;
      case "⚙️ Настройки":
        await showSettings(ctx);
        break;
      case "💬 Поддержка":
        await ctx.reply(
          "💬 Поддержка\n\n" +
            "Если есть вопросы — напиши менеджеру.\n" +
            "Обычно отвечаем в течение часа.",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✍️ Написать менеджеру", url: "https://t.me/avitofammanager" }],
                [{ text: "↩️ Назад", callback_data: "main_menu" }],
              ],
            },
          }
        );
        break;
      case "🔔 Уведомления":
        await showNotificationSettings(ctx, user);
        break;
      case "👤 Профиль":
        await showProfile(ctx, user);
        break;
      case "↩️ Главное меню":
        await sendMainMenu(ctx, user);
        break;
      default:
        await ctx.reply("🤔 Не понял. Используй кнопки ниже 👇", {
          reply_markup: KEYBOARDS.client.main,
        });
    }
  });

  // ============================================
  // Обработка callback-кнопок
  // ============================================

  // Регистрация по кнопке
  bot.callbackQuery("create_account", async (ctx) => {
    await ctx.answerCallbackQuery();

    const telegramId = ctx.from.id;

    // Проверяем, не зарегистрирован ли уже
    const existingUser = await findUserByTelegramId(telegramId);
    if (existingUser) {
      try {
        await ctx.deleteMessage();
      } catch {
        /* уже удалено */
      }
      await sendMainMenu(ctx, existingUser);
      return;
    }

    // Берём имя из Telegram профиля
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name;
    const name = lastName ? `${firstName} ${lastName}` : firstName;

    await handleRegistration(ctx, name);

    // Удаляем сообщение с кнопкой
    try {
      await ctx.deleteMessage();
    } catch {
      /* уже удалено */
    }
  });

  // Переключение уведомлений
  bot.callbackQuery(/^toggle:(.+)$/, async (ctx) => {
    // СРАЗУ отвечаем Telegram (toggle должен быть мгновенным)
    await ctx.answerCallbackQuery();

    const setting = ctx.match[1];

    if (!ctx.session.notificationSettings) {
      const user = await findUserByTelegramId(ctx.from.id);
      if (!user) return;
      ctx.session.notificationSettings = {
        orderStatus: user.notification_order_status ?? true,
        newProducts: user.notification_new_products ?? true,
        promotions: user.notification_promotions ?? false,
      };
    }

    // Переключаем настройку
    switch (setting) {
      case "order_status":
        ctx.session.notificationSettings.orderStatus =
          !ctx.session.notificationSettings.orderStatus;
        break;
      case "new_products":
        ctx.session.notificationSettings.newProducts =
          !ctx.session.notificationSettings.newProducts;
        break;
      case "promotions":
        ctx.session.notificationSettings.promotions = !ctx.session.notificationSettings.promotions;
        break;
    }

    await ctx.editMessageReplyMarkup({
      reply_markup: createNotificationSettingsKeyboard(ctx.session.notificationSettings),
    });
  });

  // Сохранение настроек уведомлений
  bot.callbackQuery("save_settings", async (ctx) => {
    // Показываем уведомление сразу (пользователь видит что нажатие сработало)
    await ctx.answerCallbackQuery("✅ Сохраняю...");

    const user = await findUserByTelegramId(ctx.from.id);
    if (!user || !ctx.session.notificationSettings) return;

    await updateNotificationSettings(user.id, {
      notification_order_status: ctx.session.notificationSettings.orderStatus,
      notification_new_products: ctx.session.notificationSettings.newProducts,
      notification_promotions: ctx.session.notificationSettings.promotions,
    });

    await ctx.editMessageText("✅ Настройки сохранены!", {
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ В главное меню", callback_data: "main_menu" }]],
      },
    });
  });

  // Перегенерация ключа
  bot.callbackQuery("regenerate_key", async (ctx) => {
    const user = await findUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.answerCallbackQuery("Пользователь не найден");
      return;
    }

    await ctx.answerCallbackQuery("🔄 Генерирую...");

    const newKey = await regenerateSiteKey(user.id);

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
    await ctx.editMessageText(
      `🔑 Новый ключ для входа:\n\n` +
        `<code>${newKey}</code>\n\n` +
        `⚠️ Старый ключ больше не работает.` +
        (siteUrl ? `\n\nСайт: ${siteUrl}` : ``),
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "↩️ В главное меню", callback_data: "main_menu" }]],
        },
      }
    );
  });

  // Главное меню
  bot.callbackQuery("main_menu", async (ctx) => {
    // СРАЗУ отвечаем Telegram что callback получен (предотвращает повторные запросы)
    await ctx.answerCallbackQuery();

    const user = await findUserByTelegramId(ctx.from.id);
    if (!user) return;

    // Удаляем inline-сообщение и отправляем меню с Reply Keyboard
    try {
      await ctx.deleteMessage();
    } catch {
      // Сообщение могло быть уже удалено
    }
    await sendMainMenu(ctx, user);
  });

  // Назад (из inline-клавиатуры в настройки с Reply Keyboard)
  bot.callbackQuery("back", async (ctx) => {
    // СРАЗУ отвечаем Telegram что callback получен (предотвращает повторные запросы)
    await ctx.answerCallbackQuery();

    const user = await findUserByTelegramId(ctx.from.id);
    if (!user) return;

    // Удаляем inline-сообщение и отправляем настройки с Reply Keyboard
    try {
      await ctx.deleteMessage();
    } catch {
      // Сообщение могло быть уже удалено
    }
    await showSettings(ctx);
  });

  return bot;
}

// ============================================
// Вспомогательные функции
// ============================================

async function getUserOrRegister(ctx: ClientContext): Promise<User | null> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;

  const user = await findUserByTelegramId(telegramId);

  if (!user) {
    await ctx.reply("Ты ещё не зарегистрирован 🙂\nНажми /start чтобы создать аккаунт.");
    return null;
  }

  return user;
}

async function handleRegistration(ctx: ClientContext, name: string) {
  const telegramId = ctx.from?.id;
  const username = ctx.from?.username;

  if (!telegramId) return;

  try {
    const avatarUrl = await fetchTelegramAvatar(ctx.api, telegramId);

    const user = await createClientUser({
      telegramId,
      telegramUsername: username,
      name: name.trim(),
      referralCode: ctx.session.referralCode,
      avatarUrl,
    });

    ctx.session.referralCode = undefined;

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
    await ctx.reply(
      `🎉 Добро пожаловать, ${user.name}!\n\n` +
        `Твой ключ для входа на сайт:\n` +
        `<code>${user.site_key}</code>\n\n` +
        `Нажми на ключ чтобы скопировать` +
        (siteUrl ? `, затем открой сайт:\n${siteUrl}` : `.`),
      { parse_mode: "HTML" }
    );

    await sendMainMenu(ctx, user);
  } catch (error) {
    console.error("Registration error:", error);
    await ctx.reply(
      "😔 Что-то пошло не так при регистрации.\nПопробуй ещё раз через /start или напиши @avitofammanager"
    );
  }
}

async function sendMainMenu(ctx: ClientContext, user: User) {
  const level = user.is_vibe_plus ? 3 : user.level || 0;
  const discount = getLevelDiscount(level);

  let message = `${user.name}, привет! 👋\n\n`;

  // Уровень и подписка
  if (user.is_vibe_plus) {
    message += `Уровень: +ВАЙБ · скидка ${discount}%\n`;
  } else {
    message += `${formatLevel(level)}`;
    if (discount > 0) message += ` · скидка ${discount}%`;
    message += `\n`;
  }

  if (user.subscription_tier && user.subscription_tier !== "none") {
    message += `📋 ${SUBSCRIPTION_LABELS[user.subscription_tier]}`;
    if (user.subscription_end) {
      message += ` до ${formatDate(user.subscription_end)}`;
    }
    message += `\n`;
  } else {
    message += `📋 Подписка не активна\n`;
  }

  // Депозит
  message += `\n───────────────\n`;
  message += `💰 Депозит: ${formatPrice(user.deposit || 0)}`;
  if ((user.referral_deposit || 0) > 0) {
    message += ` + ${formatPrice(user.referral_deposit || 0)} бонус`;
  }
  message += `\n`;

  await ctx.reply(message, { reply_markup: KEYBOARDS.client.main });
}

async function showActiveOrders(ctx: ClientContext, user: User) {
  const orders = await getClientActiveOrders(user.id);

  if (orders.length === 0) {
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
    await ctx.reply(
      "📦 Нет активных заказов\n\n" +
        (siteUrl
          ? `Загляни в каталог на сайте:\n${siteUrl}/catalog`
          : "Загляни в каталог на сайте."),
      {
        reply_markup: {
          inline_keyboard: [[{ text: "↩️ Назад", callback_data: "main_menu" }]],
        },
      }
    );
    return;
  }

  let message = `📦 Активные заказы (${orders.length})\n\n`;

  for (const order of orders) {
    const product = order.product as { name: string; brand: string } | null;
    const productName = product ? `${product.brand} ${product.name}` : "Товар";

    message += `${formatOrderStatus(order.status || "awaiting_shipment")} <b>#${order.order_number}</b>\n`;
    message += `${productName}, ${order.size} · ${formatPrice(order.client_price || 0)}\n`;

    if (order.delivery_service) {
      message += `${formatDeliveryService(order.delivery_service)}`;
      if (order.tracking_number) {
        message += ` · <code>${order.tracking_number}</code>`;
      }
      message += `\n`;
    }

    if (order.status === "return_arrived") {
      message += `⚠️ Укажи код возврата\n`;
    }

    message += `\n`;
  }

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: KEYBOARDS.client.main,
  });
}

async function showStats(ctx: ClientContext, user: User) {
  const stats = await getClientStats(user.id);
  const currentLevel = user.is_vibe_plus ? 3 : user.level || 0;
  const discount = getLevelDiscount(currentLevel);

  // Прогресс до следующего уровня
  const levelThresholds = [0, 15, 30, 50];
  const completed = user.total_completed_orders || 0;

  let message = `📊 Твоя статистика\n\n`;

  // Уровень
  if (user.is_vibe_plus) {
    message += `Уровень: +ВАЙБ · скидка ${discount}%\n`;
  } else {
    message += `${formatLevel(currentLevel)}`;
    if (discount > 0) message += ` · скидка ${discount}%`;
    message += `\n`;
  }

  if (!user.is_vibe_plus && currentLevel < 3) {
    const nextOrders = levelThresholds[currentLevel + 1] || 50;
    message += `До следующего: ${completed}/${nextOrders} заказов\n`;
  }

  if (user.subscription_tier === "premium" || user.subscription_tier === "top_floor_boss") {
    message += `\n───────────────\n`;
    message += `📅 За 30 дней\n\n`;
    message += `Заказов: ${stats.month.orders}\n`;
    message += `Вложено: ${formatPrice(stats.month.invested)}`;
    if (stats.month.investedCount > 0) {
      message += ` (${stats.month.investedCount} заказов)`;
    }
    message += `\n`;
    message += `Выручка: ${formatPrice(stats.month.revenue)}\n`;
    const roi =
      stats.month.invested > 0 ? Math.round((stats.month.profit / stats.month.invested) * 100) : 0;
    message += `Прибыль (ROI): ${roi > 0 ? "+" : ""}${roi}% · ${formatPrice(stats.month.profit)}\n`;
  }

  message += `\n───────────────\n`;
  message += `📈 За всё время\n\n`;
  message += `Заказов: ${stats.total.orders}\n`;
  message += `В пути: ${stats.total.inTransit}\n`;
  message += `Завершённых: ${stats.total.completed}\n`;
  message += `Возвратов: ${stats.total.returns} (${stats.total.returnRate}%)\n`;

  message += `\n───────────────\n`;
  message += `💰 Депозит: ${formatPrice(user.deposit || 0)}`;
  if ((user.referral_deposit || 0) > 0) {
    message += ` + ${formatPrice(user.referral_deposit || 0)} бонус`;
  }
  message += `\n`;

  await ctx.reply(message, { reply_markup: KEYBOARDS.client.main });
}

async function showSiteKey(ctx: ClientContext, user: User) {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  await ctx.reply(
    `🔑 Твой ключ для входа:\n\n` +
      `<code>${user.site_key}</code>\n\n` +
      (siteUrl ? `Сайт: ${siteUrl}` : `Нажми на ключ чтобы скопировать 👆`),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Новый ключ", callback_data: "regenerate_key" }],
          [{ text: "↩️ В главное меню", callback_data: "main_menu" }],
        ],
      },
    }
  );
}

async function showSettings(ctx: ClientContext) {
  await ctx.reply("⚙️ Настройки", {
    reply_markup: KEYBOARDS.client.settings,
  });
}

async function showNotificationSettings(ctx: ClientContext, user: User) {
  ctx.session.notificationSettings = {
    orderStatus: user.notification_order_status ?? true,
    newProducts: user.notification_new_products ?? true,
    promotions: user.notification_promotions ?? false,
  };

  await ctx.reply(
    "🔔 Уведомления\n\n" + "ℹ️ Коды возврата и повышение уровня — присылаются всегда",
    {
      reply_markup: createNotificationSettingsKeyboard(ctx.session.notificationSettings),
    }
  );
}

async function showProfile(ctx: ClientContext, user: User) {
  const level = user.is_vibe_plus ? 3 : user.level || 0;
  const discount = getLevelDiscount(level);

  let message = `👤 Профиль\n\n`;
  message += `${user.name}`;
  if (user.telegram_username) {
    message += ` · @${user.telegram_username}`;
  }
  message += `\n`;

  if (user.is_vibe_plus) {
    message += `Уровень: +ВАЙБ · скидка ${discount}%\n`;
    message += `Лимит: ${formatPrice(Math.abs(user.deposit_limit || 100000))}\n`;
  } else {
    message += `${formatLevel(level)}`;
    if (discount > 0) message += ` · скидка ${discount}%`;
    message += `\n`;
  }

  message += `Заказов: ${user.total_completed_orders || 0}\n`;

  message += `\n───────────────\n`;
  message += `💰 Депозит: ${formatPrice(user.deposit || 0)}`;
  if ((user.referral_deposit || 0) > 0) {
    message += ` + ${formatPrice(user.referral_deposit || 0)} бонус`;
  }
  message += `\n`;

  message += `\n───────────────\n`;
  message += `🔗 Реферальный код: <code>${user.referral_code}</code>`;

  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: KEYBOARDS.client.settings,
  });
}

async function showSubscriptionOptions(ctx: ClientContext, user: User) {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;

  let message = "💳 Подписка\n\n";

  if (user.subscription_tier && user.subscription_tier !== "none") {
    message += `Тариф: ${SUBSCRIPTION_LABELS[user.subscription_tier]}\n`;
    if (user.subscription_end) {
      message += `До: ${formatDate(user.subscription_end)}\n`;
    }
    message += "\n───────────────\n";
  }

  message += siteUrl
    ? `Тарифы и оплата — на сайте:\n${siteUrl}/profile/subscription`
    : "Тарифы и оплата — на сайте.";

  await ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ В главное меню", callback_data: "main_menu" }]],
    },
  });
}

// Экспорт singleton для использования в API
export let clientBot: Bot<ClientContext> | null = null;

export function getClientBot() {
  if (!clientBot) {
    clientBot = createClientBot();
  }
  return clientBot;
}
