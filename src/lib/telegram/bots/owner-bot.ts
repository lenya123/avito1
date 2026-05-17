/**
 * Telegram бот для владельца (@avito_owner_bot)
 *
 * Концепция: Персональный бизнес-ассистент "Джарвис"
 *
 * Функции:
 * - Dashboard со статистикой
 * - Управление клиентами (+ВАЙБ, блокировки)
 * - Аналитика по товарам
 * - Уведомления о важных событиях
 * - Вечерние сводки
 */

import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { KEYBOARDS, createConfirmKeyboard } from "../utils/keyboards";
import {
  formatPrice,
  formatDate,
  formatDateTime,
  formatLevel,
  SUBSCRIPTION_LABELS,
} from "../utils/formatters";
import { getOwnerDailyStats, findClientByUsername, toggleVibePlus, getBotDb } from "../db";

// ID владельца для проверки доступа
const OWNER_TELEGRAM_ID = parseInt(process.env.OWNER_TELEGRAM_ID || "0");

// Сессия для хранения состояния
interface SessionData {
  step?: string;
  pendingAction?: {
    type: "vibe_plus" | "block";
    userId: string;
    username: string;
    enable: boolean;
  };
}

type OwnerContext = Context & SessionFlavor<SessionData>;

// Создаём бота
export function createOwnerBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_OWNER_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_OWNER_BOT_TOKEN is not set");
  }

  const bot = new Bot<OwnerContext>(botToken);

  // Добавляем сессию
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // Проверка доступа — только владелец
  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;

    if (!telegramId || telegramId !== OWNER_TELEGRAM_ID) {
      await ctx.reply("⛔ Доступ запрещён.\n\nЭтот бот только для владельца.");
      return;
    }

    await next();
  });

  // Обработка ошибок — отвечаем пользователю и не даём 500 уйти в Telegram
  bot.catch(async (err) => {
    console.error("Owner bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз.");
    } catch {
      // Не удалось отправить — ничего страшного
    }
  });

  // ============================================
  // Команды
  // ============================================

  // /start — главное меню
  bot.command("start", async (ctx) => {
    await sendMainMenu(ctx);
  });

  // /stats — статистика дня
  bot.command("stats", async (ctx) => {
    await showDailyStats(ctx);
  });

  // /vibe — управление +ВАЙБ
  bot.command("vibe", async (ctx) => {
    const username = ctx.match;

    if (!username) {
      await ctx.reply(
        "Использование: /vibe @username\n\n" +
          "Примеры:\n" +
          "/vibe @client_name — добавить в +ВАЙБ\n" +
          "/vibe @client_name off — убрать из +ВАЙБ"
      );
      return;
    }

    await handleVibeCommand(ctx, username);
  });

  // /block — блокировка клиента
  bot.command("block", async (ctx) => {
    const args = ctx.match;

    if (!args) {
      await ctx.reply(
        "Использование: /block @username [причина]\n\n" +
          "Пример: /block @client_name Нарушение правил"
      );
      return;
    }

    await handleBlockCommand(ctx, args);
  });

  // /client — информация о клиенте
  bot.command("client", async (ctx) => {
    const username = ctx.match;

    if (!username) {
      await ctx.reply("Использование: /client @username");
      return;
    }

    await showClientInfo(ctx, username);
  });

  // /help — справка
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📚 Команды бота\n\n" +
        "/start — Главное меню\n" +
        "/stats — Статистика дня\n" +
        "/client @username — Инфо о клиенте\n" +
        "/vibe @username — Добавить в +ВАЙБ\n" +
        "/vibe @username off — Убрать из +ВАЙБ\n" +
        "/block @username [причина] — Заблокировать\n\n" +
        "💬 Также можно писать текстом:\n" +
        "• 'Сколько продаж за сегодня?'\n" +
        "• 'Покажи топ клиентов'\n" +
        "• 'Добавь @client в +ВАЙБ'"
    );
  });

  // ============================================
  // Обработка текстовых сообщений
  // ============================================

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.toLowerCase();

    // Кнопки клавиатуры
    if (ctx.message.text === "📊 Статистика дня") {
      await showDailyStats(ctx);
      return;
    }

    if (ctx.message.text === "📦 Активные заказы") {
      await showActiveOrders(ctx);
      return;
    }

    if (ctx.message.text === "👥 Клиенты") {
      await showClientsMenu(ctx);
      return;
    }

    if (ctx.message.text === "📈 Аналитика") {
      await showAnalytics(ctx);
      return;
    }

    if (ctx.message.text === "⚙️ Настройки") {
      await showSettings(ctx);
      return;
    }

    // Естественный язык
    if (text.includes("продаж") || text.includes("статистик") || text.includes("сегодня")) {
      await showDailyStats(ctx);
      return;
    }

    if (text.includes("топ") && text.includes("клиент")) {
      await showTopClients(ctx);
      return;
    }

    if (text.includes("+вайб") || text.includes("вайб")) {
      const usernameMatch = text.match(/@(\w+)/);
      if (usernameMatch) {
        await handleVibeCommand(ctx, usernameMatch[0]);
        return;
      }
    }

    // Если не распознано
    await ctx.reply("Не понял запрос. Используйте /help для списка команд.", {
      reply_markup: KEYBOARDS.owner.main,
    });
  });

  // ============================================
  // Callback-кнопки
  // ============================================

  // Подтверждение +ВАЙБ
  bot.callbackQuery(/^confirm_vibe:(.+)$/, async (ctx) => {
    if (!ctx.session.pendingAction) {
      await ctx.answerCallbackQuery("Действие устарело");
      return;
    }

    const { userId, username, enable } = ctx.session.pendingAction;

    try {
      await toggleVibePlus(userId, ctx.from.id.toString(), enable);

      await ctx.editMessageText(
        enable
          ? `✅ @${username} теперь в +ВАЙБ\n\n• Лимит: -100,000 ₽\n• Заказы без оплаты: включено`
          : `✅ @${username} убран из +ВАЙБ`
      );

      ctx.session.pendingAction = undefined;
    } catch (error) {
      console.error("Error toggling vibe:", error);
      await ctx.answerCallbackQuery("Ошибка");
    }
  });

  // Отмена действия
  bot.callbackQuery("cancel", async (ctx) => {
    ctx.session.pendingAction = undefined;
    await ctx.editMessageText("❌ Действие отменено");
    await ctx.answerCallbackQuery();
  });

  // Главное меню
  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.deleteMessage();
    await sendMainMenu(ctx);
    await ctx.answerCallbackQuery();
  });

  return bot;
}

// ============================================
// Вспомогательные функции
// ============================================

async function sendMainMenu(ctx: OwnerContext) {
  // Быстрая статистика
  const stats = await getOwnerDailyStats();

  await ctx.reply(
    `👑 Панель управления\n\n` +
      `Сегодня:\n` +
      `• Заказов: ${stats.orders}\n` +
      `• Выручка: ${formatPrice(stats.revenue)}\n` +
      `• Прибыль: ${formatPrice(stats.profit)}\n` +
      `• Новых клиентов: ${stats.newClients}\n\n` +
      `Выберите действие:`,
    { reply_markup: KEYBOARDS.owner.main }
  );
}

async function showDailyStats(ctx: OwnerContext) {
  const stats = await getOwnerDailyStats();
  const today = formatDate(new Date());

  // Получаем топ товар
  const db = getBotDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: topProduct } = await db
    .from("orders")
    .select("product:products(name, brand)")
    .gte("created_at", todayStart.toISOString())
    .limit(1);

  const topProductName = topProduct?.[0]?.product
    ? `${(topProduct[0].product as { brand: string; name: string }).brand} ${(topProduct[0].product as { brand: string; name: string }).name}`
    : "—";

  await ctx.reply(
    `📊 Статистика за ${today}:\n\n` +
      `Заказов: ${stats.orders}\n` +
      `Выручка: ${formatPrice(stats.revenue)}\n` +
      `Прибыль: ${formatPrice(stats.profit)}\n` +
      `Новых клиентов: ${stats.newClients}\n\n` +
      `Топ товар: ${topProductName}`,
    { reply_markup: KEYBOARDS.owner.main }
  );
}

async function showActiveOrders(ctx: OwnerContext) {
  const db = getBotDb();

  const { data: orders } = await db
    .from("orders")
    .select(
      `
      order_number,
      size,
      delivery_deadline,
      product:products(name, brand),
      client:users!orders_client_id_fkey(telegram_username)
    `
    )
    .in("status", ["awaiting_shipment", "collecting"])
    .order("delivery_deadline", { ascending: true })
    .limit(10);

  if (!orders || orders.length === 0) {
    await ctx.reply("📦 Нет активных заказов на отправку", {
      reply_markup: KEYBOARDS.owner.main,
    });
    return;
  }

  let message = "📦 Активные заказы:\n\n";

  for (const order of orders) {
    const product = order.product as { name: string; brand: string } | null;
    const client = order.client as { telegram_username: string } | null;
    const deadline = formatDate(order.delivery_deadline);

    message += `#${order.order_number} — ${product?.brand || ""} ${product?.name || "Товар"}, ${order.size}\n`;
    message += `   @${client?.telegram_username || "unknown"} │ До ${deadline}\n\n`;
  }

  await ctx.reply(message, { reply_markup: KEYBOARDS.owner.main });
}

async function showClientsMenu(ctx: OwnerContext) {
  const db = getBotDb();

  // Статистика по клиентам
  const { count: totalClients } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "client");

  const { count: vibeClients } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "client")
    .eq("is_vibe_plus", true);

  const { count: premiumClients } = await db
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "client")
    .eq("subscription_tier", "premium");

  await ctx.reply(
    `👥 Клиенты\n\n` +
      `Всего: ${totalClients}\n` +
      `+ВАЙБ: ${vibeClients}\n` +
      `Premium: ${premiumClients}\n\n` +
      `Команды:\n` +
      `/client @username — Инфо о клиенте\n` +
      `/vibe @username — Добавить в +ВАЙБ\n` +
      `/block @username — Заблокировать`,
    {
      reply_markup: new InlineKeyboard()
        .text("🏆 Топ клиентов", "top_clients")
        .row()
        .text("⚠️ Должники +ВАЙБ", "vibe_debtors")
        .row()
        .text("↩️ Назад", "main_menu"),
    }
  );
}

async function showTopClients(ctx: OwnerContext) {
  const db = getBotDb();

  const { data: clients } = await db
    .from("users")
    .select("telegram_username, total_completed_orders, level")
    .eq("role", "client")
    .order("total_completed_orders", { ascending: false })
    .limit(10);

  if (!clients || clients.length === 0) {
    await ctx.reply("Нет данных о клиентах", {
      reply_markup: KEYBOARDS.owner.main,
    });
    return;
  }

  let message = "🏆 Топ-10 клиентов:\n\n";

  clients.forEach((client, index) => {
    const medal = index < 3 ? ["🥇", "🥈", "🥉"][index] : `${index + 1}.`;
    message += `${medal} @${client.telegram_username || "unknown"} — ${client.total_completed_orders || 0} заказов\n`;
  });

  await ctx.reply(message, { reply_markup: KEYBOARDS.owner.main });
}

async function showAnalytics(ctx: OwnerContext) {
  const db = getBotDb();

  // Статистика за месяц
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthOrders } = await db
    .from("orders")
    .select("client_price, purchase_price, status")
    .gte("created_at", startOfMonth.toISOString());

  const orders = monthOrders || [];
  const completed = orders.filter((o) => o.status === "completed");

  const revenue = orders.reduce((sum, o) => sum + o.client_price, 0);
  const profit = orders.reduce((sum, o) => sum + (o.client_price - o.purchase_price), 0);
  const avgCheck = orders.length > 0 ? revenue / orders.length : 0;
  const conversionRate =
    orders.length > 0 ? Math.round((completed.length / orders.length) * 100) : 0;

  await ctx.reply(
    `📈 Аналитика за месяц:\n\n` +
      `Заказов: ${orders.length}\n` +
      `Завершённых: ${completed.length}\n` +
      `Конверсия: ${conversionRate}%\n\n` +
      `Выручка: ${formatPrice(revenue)}\n` +
      `Прибыль: ${formatPrice(profit)}\n` +
      `Средний чек: ${formatPrice(avgCheck)}`,
    { reply_markup: KEYBOARDS.owner.main }
  );
}

async function showSettings(ctx: OwnerContext) {
  await ctx.reply(
    "⚙️ Настройки\n\n" +
      "Настройки доступны в панели владельца на сайте:\n" +
      `${process.env.NEXT_PUBLIC_APP_URL}/owner/settings`,
    { reply_markup: KEYBOARDS.owner.main }
  );
}

async function handleVibeCommand(ctx: OwnerContext, args: string) {
  const parts = args.split(" ");
  const username = parts[0].replace("@", "");
  const disable = parts[1]?.toLowerCase() === "off";

  const client = await findClientByUsername(username);

  if (!client) {
    await ctx.reply(`❌ Клиент @${username} не найден`);
    return;
  }

  // Показываем информацию и запрашиваем подтверждение
  const message = disable
    ? `Убрать @${username} из +ВАЙБ?\n\n` +
      `Текущий долг: ${formatPrice(Math.abs(client.deposit || 0))}`
    : `Добавить @${username} в +ВАЙБ?\n\n` +
      `• Заказов: ${client.total_completed_orders || 0}\n` +
      `• Уровень: ${client.level || 0}\n` +
      `• Текущий баланс: ${formatPrice(client.deposit || 0)}`;

  ctx.session.pendingAction = {
    type: "vibe_plus",
    userId: client.id,
    username: client.telegram_username || username,
    enable: !disable,
  };

  await ctx.reply(message, {
    reply_markup: createConfirmKeyboard(`confirm_vibe:${client.id}`),
  });
}

async function handleBlockCommand(ctx: OwnerContext, args: string) {
  const [username, ...reasonParts] = args.split(" ");
  const cleanUsername = username.replace("@", "");
  const reason = reasonParts.join(" ") || "Не указана";

  const client = await findClientByUsername(cleanUsername);

  if (!client) {
    await ctx.reply(`❌ Клиент @${cleanUsername} не найден`);
    return;
  }

  const db = getBotDb();

  await db
    .from("users")
    .update({
      is_blocked: true,
      blocked_reason: reason,
    })
    .eq("id", client.id);

  await ctx.reply(`🚫 @${cleanUsername} заблокирован\n\n` + `Причина: ${reason}`, {
    reply_markup: KEYBOARDS.owner.main,
  });
}

async function showClientInfo(ctx: OwnerContext, username: string) {
  const cleanUsername = username.replace("@", "");
  const client = await findClientByUsername(cleanUsername);

  if (!client) {
    await ctx.reply(`❌ Клиент @${cleanUsername} не найден`);
    return;
  }

  let message = `👤 Клиент @${client.telegram_username}\n\n`;
  message += `Имя: ${client.name}\n`;
  message += `${formatLevel(client.level || 0)}\n`;
  message += `Заказов: ${client.total_completed_orders || 0}\n\n`;

  message += `Подписка: ${SUBSCRIPTION_LABELS[client.subscription_tier || "none"]}\n`;
  if (client.subscription_end) {
    message += `До: ${formatDate(client.subscription_end)}\n`;
  }

  message += `\nБаланс: ${formatPrice(client.deposit || 0)}\n`;

  if ((client.referral_deposit || 0) > 0) {
    message += `Бонусный: ${formatPrice(client.referral_deposit || 0)}\n`;
  }

  if (client.is_vibe_plus) {
    message += `\n✨ +ВАЙБ активен\n`;
    message += `Лимит: ${formatPrice(Math.abs(client.deposit_limit || 100000))}\n`;
  }

  if (client.is_blocked) {
    message += `\n🚫 ЗАБЛОКИРОВАН\n`;
    message += `Причина: ${client.blocked_reason || "Не указана"}`;
  }

  message += `\nРегистрация: ${formatDateTime(client.created_at || "")}`;

  const keyboard = new InlineKeyboard();

  if (client.is_vibe_plus) {
    keyboard.text("➖ Убрать +ВАЙБ", `vibe_off:${client.id}`);
  } else {
    keyboard.text("➕ Добавить +ВАЙБ", `vibe_on:${client.id}`);
  }

  keyboard.row();

  if (client.is_blocked) {
    keyboard.text("✅ Разблокировать", `unblock:${client.id}`);
  } else {
    keyboard.text("🚫 Заблокировать", `block:${client.id}`);
  }

  keyboard.row().text("↩️ Назад", "main_menu");

  await ctx.reply(message, { reply_markup: keyboard });
}

// Экспорт singleton
export let ownerBot: Bot<OwnerContext> | null = null;

export function getOwnerBot() {
  if (!ownerBot) {
    ownerBot = createOwnerBot();
  }
  return ownerBot;
}
