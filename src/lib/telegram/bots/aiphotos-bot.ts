/**
 * Telegram-бот AI-фото объявлений (@krossovodaiphotosbot).
 *
 * Выделенный бот для Авито-фотогенерации: сюда приходят сгенерированные
 * обложки/фото на подтверждение «Четко» / «Переделай» (раньше это слал
 * owner-bot). Обработчики кнопок — общая registerAiPhotoHandlers (определена
 * в owner-bot, переиспользуется). Получатель каждого фото — chat_id из
 * карточки товара (products.cover_tg_chat_id), задаётся владельцем.
 *
 * /myid — узнать свой chat_id (вписать в карточку товара).
 */
import { Bot, Context } from "grammy";
import { registerAiPhotoHandlers } from "./owner-bot";

export function createAiPhotosBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_AIPHOTOS_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_AIPHOTOS_BOT_TOKEN is not set");
  }

  const bot = new Bot<Context>(botToken);

  // Лёгкий лог входящих апдейтов (диагностика «кнопка не сработала» — видно, дошёл ли клик).
  bot.use(async (ctx, next) => {
    const t = ctx.message?.text ?? "";
    const kind = ctx.callbackQuery
      ? `callback:${ctx.callbackQuery.data}`
      : t.startsWith("/")
        ? `cmd:${t.split(" ")[0]}`
        : ctx.message
          ? "message"
          : Object.keys(ctx.update).filter((k) => k !== "update_id").join(",");
    console.log(`[aiphotos-bot] ⇐ update ${ctx.update.update_id} from=${ctx.from?.id} ${kind}`);
    await next();
  });

  bot.catch(async (err) => {
    console.error("AI-photos bot error:", err);
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🖼 Бот AI-фото объявлений\n\n" +
        "Сюда приходят сгенерированные фото/обложки на подтверждение «Четко» / «Переделай».\n\n" +
        "Команда /myid — узнать свой chat_id. Впиши его в карточке товара (поле получателя " +
        "AI-обложек), чтобы фото приходили сюда."
    );
  });

  // /myid — вернуть chat_id (для поля получателя AI-обложек в карточке товара).
  bot.command("myid", async (ctx) => {
    const id = ctx.chat?.id ?? ctx.from?.id;
    await ctx.reply(
      `Ваш chat_id: \`${id}\`\n\nВпишите его в карточке товара (поле получателя AI-обложек), ` +
        `чтобы получать сюда сгенерированные обложки на «Четко/Переделай».`,
      { parse_mode: "Markdown" }
    );
  });

  // Кнопки «Четко»/«Переделай» — общий обработчик (вынесен в owner-bot, переиспользуем здесь).
  registerAiPhotoHandlers(bot);

  return bot;
}
