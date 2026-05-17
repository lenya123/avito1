/**
 * Telegram бот для отправщиков (@avito_shipper_bot)
 *
 * Функции:
 * - Авторизация по логину/паролю
 * - Статистика за день/месяц
 * - Уведомления о новых заказах и срочных дедлайнах
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { KEYBOARDS } from "../utils/keyboards";
import { formatPrice } from "../utils/formatters";
import { findUserByTelegramId, getShipperStats } from "../db";
import type { Database } from "@/types/database.generated";

type User = Database["public"]["Tables"]["users"]["Row"];

// Сессия для хранения состояния
interface SessionData {
  step?: "awaiting_login" | "awaiting_password";
  tempLogin?: string;
}

type ShipperContext = Context & SessionFlavor<SessionData>;

// Создаём бота
export function createShipperBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_SHIPPER_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_SHIPPER_BOT_TOKEN is not set");
  }

  const bot = new Bot<ShipperContext>(botToken);

  // Добавляем сессию
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // Обработка ошибок — отвечаем пользователю и не даём 500 уйти в Telegram
  bot.catch(async (err) => {
    console.error("Shipper bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз.");
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

    // Ищем пользователя
    const user = await findUserByTelegramId(telegramId);

    if (user && user.role === "shipper") {
      // Авторизованный отправщик
      await sendMainMenu(ctx, user);
    } else {
      // Нужна авторизация
      await ctx.reply(
        "Привет! 👋\n\n" + "Это бот для отправщиков.\n\n" + "Для авторизации введите ваш логин:",
        { reply_markup: { remove_keyboard: true } }
      );
      ctx.session.step = "awaiting_login";
    }
  });

  // /help — справка
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📚 Справка\n\n" +
        "Доступные команды:\n" +
        "/start — Главное меню\n" +
        "/stats — Моя статистика\n" +
        "/help — Эта справка\n\n" +
        "💬 Вопросы: @admin"
    );
  });

  // /stats — статистика
  bot.command("stats", async (ctx) => {
    const user = await getUserOrAuth(ctx);
    if (!user) return;

    await showStats(ctx, user);
  });

  // ============================================
  // Обработка текстовых сообщений
  // ============================================

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Проверяем шаг авторизации
    if (ctx.session.step === "awaiting_login") {
      ctx.session.tempLogin = text.trim();
      ctx.session.step = "awaiting_password";
      await ctx.reply("Введите пароль:");
      return;
    }

    if (ctx.session.step === "awaiting_password") {
      // text содержит пароль, но пока авторизация по логину
      await handleAuth(ctx, ctx.session.tempLogin!);
      return;
    }

    // Обрабатываем кнопки клавиатуры
    const user = await getUserOrAuth(ctx);
    if (!user) return;

    switch (text) {
      case "📊 Моя статистика":
        await showStats(ctx, user);
        break;
      case "📱 Открыть приложение":
        await ctx.reply(
          "📱 Приложение отправщика\n\n" + `Откройте: ${process.env.NEXT_PUBLIC_APP_URL}/shipper`,
          { reply_markup: KEYBOARDS.shipper.main }
        );
        break;
      case "⚙️ Настройки":
        await ctx.reply("⚙️ Настройки\n\n" + "Настройки уведомлений находятся в приложении.", {
          reply_markup: KEYBOARDS.shipper.main,
        });
        break;
      default:
        await ctx.reply("Используйте кнопки меню", {
          reply_markup: KEYBOARDS.shipper.main,
        });
    }
  });

  // ============================================
  // Callback-кнопки
  // ============================================

  bot.callbackQuery("main_menu", async (ctx) => {
    const user = await findUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.answerCallbackQuery("Ошибка");
      return;
    }

    await ctx.deleteMessage();
    await sendMainMenu(ctx, user);
    await ctx.answerCallbackQuery();
  });

  return bot;
}

// ============================================
// Вспомогательные функции
// ============================================

async function getUserOrAuth(ctx: ShipperContext): Promise<User | null> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return null;

  const user = await findUserByTelegramId(telegramId);

  if (!user || user.role !== "shipper") {
    await ctx.reply("Вы не авторизованы как отправщик.\n" + "Используйте /start для авторизации.");
    return null;
  }

  return user;
}

async function handleAuth(ctx: ShipperContext, login: string) {
  // Здесь должна быть проверка логина/пароля
  // Для простоты используем bcrypt или другую библиотеку
  // Пока заглушка — TODO: добавить реальную авторизацию

  const { getBotDb } = await import("../db");
  const db = getBotDb();

  // Ищем отправщика по email
  const { data: shipper, error } = await db
    .from("users")
    .select("*")
    .eq("role", "shipper")
    .eq("email", login)
    .single();

  if (error || !shipper) {
    ctx.session.step = undefined;
    ctx.session.tempLogin = undefined;
    await ctx.reply(
      "❌ Неверный логин или пароль.\n\n" + "Используйте /start чтобы попробовать снова."
    );
    return;
  }

  // TODO: Проверить пароль через bcrypt
  // const isValid = await bcrypt.compare(password, shipper.password_hash);
  // if (!isValid) { ... }

  // Обновляем telegram_id у отправщика
  await db.from("users").update({ telegram_id: ctx.from!.id }).eq("id", shipper.id);

  ctx.session.step = undefined;
  ctx.session.tempLogin = undefined;

  await ctx.reply(`✅ Авторизация успешна!\n\nДобро пожаловать, ${shipper.name}!`);
  await sendMainMenu(ctx, shipper);
}

async function sendMainMenu(ctx: ShipperContext, user: User) {
  await ctx.reply(
    `Привет, ${user.name}! 👋\n\n` + "Вы авторизованы как отправщик.\n\n" + "Выберите действие:",
    { reply_markup: KEYBOARDS.shipper.main }
  );
}

async function showStats(ctx: ShipperContext, user: User) {
  const stats = await getShipperStats(user.id);

  let message = `📊 Ваша статистика:\n\n`;

  message += `Сегодня:\n`;
  message += `• Отправлено: ${stats.today.shipped} заказов\n`;
  message += `• Заработано: ${formatPrice(stats.today.earned)}\n\n`;

  message += `Этот месяц:\n`;
  message += `• Отправлено: ${stats.month.shipped} заказов\n`;
  message += `• Заработано: ${formatPrice(stats.month.earned)}`;

  await ctx.reply(message, { reply_markup: KEYBOARDS.shipper.main });
}

// Экспорт singleton
export let shipperBot: Bot<ShipperContext> | null = null;

export function getShipperBot() {
  if (!shipperBot) {
    shipperBot = createShipperBot();
  }
  return shipperBot;
}
