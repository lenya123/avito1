/**
 * Telegram-бот отправщика (@avito_shipper_bot).
 *
 * Чистый push-канал: бот не дублирует PWA. Никаких меню/кнопок/команд —
 * всё в `/shipper/*`. Бот существует чтобы надёжно доставлять важные
 * уведомления (где web-push ненадёжен): срочный новый paid, дневной
 * дайджест после `send_by_today_cutoff`, выплаты, полночный откат.
 *
 * Регистрация:
 *  1. Владелец в `/owner/shippers` создаёт отправщика с `@telegram_username`.
 *     В БД появляется users-row с fake (negative) telegram_id и `site_key`.
 *  2. Владелец говорит отправщику: «напиши /start боту @avito_shipper_bot».
 *  3. Отправщик жмёт /start → бот по `ctx.from.username` находит запись,
 *     заменяет fake telegram_id на real → шлёт DM с приветствием, ключом
 *     и ссылкой на `/shipper/login`. Дальше уведомления приходят сами.
 *  4. Если /start повторный (telegram_id уже real) — короткий ответ
 *     «уже привязан, открой приложение».
 *  5. Если такого username нет в users — «попроси владельца тебя добавить».
 *
 * Bcrypt + JWT не используем: вход в PWA по 64-hex `site_key` — общий
 * паттерн проекта.
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { findUserByTelegramId, getBotDb } from "../db";

type ShipperContext = Context & SessionFlavor<Record<string, never>>;

function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return base ? base.replace(/\/$/, "") : "";
}

function loginUrl(): string {
  return `${appUrl()}/shipper/login`;
}

function welcomeFirstBind(name: string | null, siteKey: string): string {
  const greeting = name ? `Привет, ${name}!` : "Привет!";
  return (
    `${greeting} 👋\n\n` +
    `Тебя добавили как отправщика. Я буду присылать сюда важные уведомления:\n` +
    `• ⚠️ срочные новые заказы\n` +
    `• 📋 дневной дайджест по пулу\n` +
    `• 💰 выплаты\n\n` +
    `Твой ключ доступа:\n` +
    `<code>${siteKey}</code>\n\n` +
    `Войди в приложение: ${loginUrl()}`
  );
}

function welcomeAlreadyBound(name: string | null): string {
  const greeting = name ? `Привет, ${name}!` : "Привет!";
  return `${greeting} 👋\n\nБот уже привязан, важные уведомления буду слать сюда.\n\nОткрой приложение: ${loginUrl()}`;
}

const NOT_FOUND_TEXT =
  "❌ Не нашёл тебя в системе.\n\n" +
  "Попроси владельца добавить тебя как отправщика по этому Telegram-username, потом снова отправь /start.";

export function createShipperBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_SHIPPER_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_SHIPPER_BOT_TOKEN is not set");
  }

  const bot = new Bot<ShipperContext>(botToken);

  bot.use(session({ initial: () => ({}) }));

  bot.catch(async (err) => {
    console.error("Shipper bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз.");
    } catch {
      // Не удалось ответить — игнорируем.
    }
  });

  bot.command("start", async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return;

    // Уже привязан? telegram_id шиппера — наш real positive id.
    const existing = await findUserByTelegramId(tgId);
    if (existing && existing.role === "shipper") {
      await ctx.reply(welcomeAlreadyBound(existing.name), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Иначе ищем по telegram_username (его указывает владелец при создании).
    const username = ctx.from?.username?.replace(/^@/, "");
    if (!username) {
      await ctx.reply(
        "В твоём Telegram-аккаунте нет username. Поставь его в настройках Telegram, потом снова отправь /start."
      );
      return;
    }

    const db = getBotDb();
    const { data: shipper } = await db
      .from("users")
      .select("id, name, site_key")
      .eq("role", "shipper")
      .eq("telegram_username", username)
      .single();

    if (!shipper) {
      await ctx.reply(NOT_FOUND_TEXT);
      return;
    }

    await db.from("users").update({ telegram_id: tgId }).eq("id", shipper.id);

    const siteKey = (shipper.site_key as string | null) ?? "";
    if (!siteKey) {
      // Edge: site_key пустой — не должно быть, но не ломаемся.
      await ctx.reply(welcomeAlreadyBound(shipper.name), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    await ctx.reply(welcomeFirstBind(shipper.name, siteKey), {
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });
  });

  // Любой текст вне команды игнорируем — бот это канал уведомлений.
  bot.on("message:text", async () => {
    return;
  });

  return bot;
}

export let shipperBot: Bot<ShipperContext> | null = null;

export function getShipperBot() {
  if (!shipperBot) {
    shipperBot = createShipperBot();
  }
  return shipperBot;
}
