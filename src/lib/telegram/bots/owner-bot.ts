/**
 * Telegram бот для владельца.
 *
 * DM-only «секретный» бот владельца (канон §3). Базовая /start команда +
 * доставка уведомлений через `notifyOwner*` функции из notifications.ts.
 * Операционные callback-кнопки: подтверждение вывода с баланса клиента
 * (Phase F.3) и закрытие комиссионного долга партнёра (Phase G.4).
 */

import { Bot, Context, InlineKeyboard } from "grammy";
import { createClient } from "@supabase/supabase-js";
import { formatPrice } from "@/lib/telegram/utils/formatters";
import { scheduleAvitoGeneratePhoto } from "@/lib/jobs/queues";

// Читаем OWNER_TELEGRAM_ID лениво — на момент вызова, а не на импорте модуля.
// На импорте dotenv ещё не успел загрузить .env.local (TS hoisting импортов),
// так что module-level parseInt() возвращал бы 0.
function getOwnerTelegramId(): number {
  return parseInt(process.env.OWNER_TELEGRAM_ID || "0");
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials not configured");
  return createClient(url, key);
}

/**
 * Надёжный editMessageCaption. На флапающей/медленной сети одиночный вызов Telegram-API часто
 * не доходит, а `.catch(()=>{})` глотал ошибку без повтора → пользователь видел «0» реакции на
 * кнопку, хотя одобрение в БД уже прошло. Повторяем несколько раз с backoff; «message is not
 * modified» / «message to edit not found» считаем уже-применённым (success).
 */
async function editCaptionResilient(
  ctx: Context,
  caption: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replyMarkup: any
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    try {
      await ctx.editMessageCaption({ caption, parse_mode: "HTML", reply_markup: replyMarkup });
      return;
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const desc = String((e as any)?.description ?? e ?? "");
      if (desc.includes("not modified") || desc.includes("message to edit not found")) return;
      if (i < 3) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
}

export function createOwnerBot(token?: string) {
  const botToken = token || process.env.TELEGRAM_OWNER_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_OWNER_BOT_TOKEN is not set");
  }

  const bot = new Bot<Context>(botToken);

  // Лёгкий лог входящих апдейтов owner-bot. Если кнопка/команда «не сработала» — по этому
  // логу сразу видно, ДОШЁЛ ли апдейт до локального бота. Тишина при клике = апдейт забрал
  // другой поллер того же токена (второй dev:all / прод) ИЛИ бот был в рестарте `tsx watch`.
  // Подробно — .claude/handoff.md → «Telegram-боты: почему кнопки иногда не отвечают».
  // Текст обычных сообщений НЕ логируем (приватность) — только тип/команду/callback_data.
  bot.use(async (ctx, next) => {
    const t = ctx.message?.text ?? "";
    const kind = ctx.callbackQuery
      ? `callback:${ctx.callbackQuery.data}`
      : t.startsWith("/")
        ? `cmd:${t.split(" ")[0]}`
        : ctx.message
          ? "message"
          : Object.keys(ctx.update).filter((k) => k !== "update_id").join(",");
    console.log(`[owner-bot] ⇐ update ${ctx.update.update_id} from=${ctx.from?.id} ${kind}`);
    await next();
  });

  bot.use(async (ctx, next) => {
    // Публичные действия: получатель AI-обложек может быть НЕ владельцем (дизайнер/директор,
    // указанный в карточке товара). Ему доступны только подтверждение фото (aiphoto:*) и /myid.
    const cbData = ctx.callbackQuery?.data ?? "";
    const text = ctx.message?.text ?? "";
    if (cbData.startsWith("aiphoto:") || text === "/myid" || text.startsWith("/myid ")) {
      await next();
      return;
    }
    const telegramId = ctx.from?.id;
    const expected = getOwnerTelegramId();
    if (!telegramId || telegramId !== expected) {
      await ctx.reply("⛔ Доступ запрещён.\n\nЭтот бот только для владельца.");
      return;
    }
    await next();
  });

  // /myid — вернуть chat_id (чтобы вписать его в карточку товара для получения AI-обложек).
  bot.command("myid", async (ctx) => {
    const id = ctx.chat?.id ?? ctx.from?.id;
    await ctx.reply(
      `Ваш chat_id: \`${id}\`\n\nВпишите его в карточке товара (поле получателя AI-обложек), ` +
        `чтобы получать сюда сгенерированные обложки на «Четко/Переделай».`,
      { parse_mode: "Markdown" }
    );
  });

  bot.catch(async (err) => {
    console.error("Owner bot error:", err);
    try {
      await err.ctx.reply("Произошла ошибка. Попробуй ещё раз.");
    } catch {
      // Не удалось отправить — пропускаем.
    }
  });

  bot.command("start", async (ctx) => {
    const panelUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/owner`;
    // Telegram отвергает inline-URL-кнопки с localhost/не-https (dev). Кнопку
    // показываем только для публичного https-домена (прод).
    const showButton = /^https:\/\//.test(panelUrl) && !/localhost|127\.0\.0\.1/.test(panelUrl);
    const text =
      "👑 Бот владельца\n\n" +
      "Я буду слать сюда:\n" +
      "• 🧾 чеки на проверку (если директор не привязан)\n" +
      "• 💸 запросы на вывод\n" +
      "• 🤝 погашения долгов партнёрами\n" +
      "• ⚠️ проблемы со сборкой и алерты безопасности\n" +
      "• 📊 дневные сводки\n\n" +
      "Управление магазином — в панели.";
    await ctx.reply(
      text,
      showButton ? { reply_markup: new InlineKeyboard().url("🌐 Открыть панель", panelUrl) } : undefined
    );
  });

  // Walkthrough #5: владелец отвечает текстом «N да» / «N нет» на запрос
  // вывода (по аналогии с партнёрскими чеками). Защита от случайного
  // нажатия inline-кнопки на финансовую операцию.
  registerWithdrawalTextHandler(bot);

  registerPartnerDebtConfirmHandler(bot);

  // AI-фото (Четко/Переделай) ПЕРЕЕХАЛИ на отдельный @krossovodaiphotosbot —
  // registerAiPhotoHandlers теперь вызывается в aiphotos-bot.ts, не на owner-боте.

  return bot;
}

interface WithdrawalDecision {
  withdrawalNumber: number;
  decision: "yes" | "no";
}

/**
 * Парсит ответ владельца вида «42 да» / «42 нет». Регистр и лишние пробелы
 * игнорируются. Допустим обратный порядок «да 42» / «нет 42».
 */
function parseWithdrawalDecision(text: string): WithdrawalDecision | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  let match = normalized.match(/^(\d+)\s+(да|нет)$/);
  if (match) {
    return {
      withdrawalNumber: parseInt(match[1], 10),
      decision: match[2] === "да" ? "yes" : "no",
    };
  }
  match = normalized.match(/^(да|нет)\s+(\d+)$/);
  if (match) {
    return {
      withdrawalNumber: parseInt(match[2], 10),
      decision: match[1] === "да" ? "yes" : "no",
    };
  }
  return null;
}

/**
 * Текстовый handler для подтверждения/отказа в выводе. Регистрируется
 * на bot.on("message:text"). Распознаёт только формат «N да/нет», иначе
 * молчит — другие текстовые сообщения у владельца не используются (бот
 * DM-only, никаких команд кроме /start).
 */
function registerWithdrawalTextHandler(bot: Bot<Context>) {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    // Пропускаем команды (например /start) — обрабатываются отдельно.
    if (text.startsWith("/")) return;

    const parsed = parseWithdrawalDecision(text);
    if (!parsed) return;

    const supabase = getServiceClient();

    // Находим pending-запрос по номеру.
    const { data: req, error: findErr } = await supabase
      .from("withdrawal_requests")
      .select("id, customer_id, amount, withdrawal_number, status")
      .eq("withdrawal_number", parsed.withdrawalNumber)
      .maybeSingle();

    if (findErr) {
      console.error("[owner-bot] find withdrawal failed:", findErr);
      await ctx.reply("Не удалось найти запрос. Попробуй позже.");
      return;
    }

    if (!req) {
      await ctx.reply(`Запрос №${parsed.withdrawalNumber} не найден.`);
      return;
    }

    if (req.status !== "pending") {
      const statusLabel =
        req.status === "done"
          ? "уже закрыт"
          : req.status === "cancelled"
            ? "уже отменён"
            : "уже обработан";
      await ctx.reply(`Запрос №${parsed.withdrawalNumber} ${statusLabel}.`);
      return;
    }

    // Резолвим owner_user_id для processed_by.
    const { data: ownerUser } = await supabase
      .from("users")
      .select("id")
      .eq("role", "owner")
      .limit(1)
      .single();

    if (!ownerUser) {
      await ctx.reply("Не нашли owner-запись в users. Операция невозможна.");
      return;
    }

    if (parsed.decision === "yes") {
      await handleWithdrawalApprove(ctx, supabase, req.id as string, ownerUser.id as string);
    } else {
      await handleWithdrawalReject(ctx, supabase, req.id as string, ownerUser.id as string);
    }
  });
}

/**
 * «N да» — закрываем запрос (деньги переведены клиенту вне бота).
 * Баланс уже зарезервирован при создании запроса, RPC только помечает done.
 */
async function handleWithdrawalApprove(
  ctx: Context,
  supabase: ReturnType<typeof getServiceClient>,
  requestId: string,
  ownerUserId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("approve_withdrawal_request", {
    p_request_id: requestId,
    p_processed_by: ownerUserId,
  });

  if (error) {
    console.error("[owner-bot] approve_withdrawal_request failed:", error);
    const code = (error as { code?: string }).code;
    if (code === "P0002") {
      await ctx.reply("Этот запрос уже обработан.");
    } else {
      await ctx.reply("Не удалось закрыть запрос. Попробуй позже.");
    }
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const customerId = result?.out_customer_id as string | undefined;
  const number = Number(result?.out_number ?? 0);
  const amount = Number(result?.out_amount ?? 0);

  await ctx.reply(`✅ Запрос №${number} закрыт — ${formatPrice(amount)} списаны с резерва.`);

  if (customerId) {
    await sendCustomerDm(
      supabase,
      customerId,
      `💸 ${formatPrice(amount)} переведены — запрос на вывод №${number} закрыт.`
    );
  }
}

/**
 * «N нет» — отказ, деньги возвращаются на баланс клиента.
 */
async function handleWithdrawalReject(
  ctx: Context,
  supabase: ReturnType<typeof getServiceClient>,
  requestId: string,
  ownerUserId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("reject_withdrawal_atomic", {
    p_request_id: requestId,
    p_processed_by: ownerUserId,
  });

  if (error) {
    console.error("[owner-bot] reject_withdrawal_atomic failed:", error);
    const code = (error as { code?: string }).code;
    if (code === "P0002") {
      await ctx.reply("Этот запрос уже обработан.");
    } else {
      await ctx.reply("Не удалось отказать. Попробуй позже.");
    }
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const customerId = result?.out_customer_id as string | undefined;
  const number = Number(result?.out_number ?? 0);
  const amount = Number(result?.out_amount ?? 0);

  await ctx.reply(
    `↩️ Запрос №${number} отклонён — ${formatPrice(amount)} вернулись на баланс клиента.`
  );

  if (customerId) {
    await sendCustomerDm(
      supabase,
      customerId,
      `↩️ Владелец вернул ${formatPrice(amount)} на твой баланс по запросу №${number}.`
    );
  }
}

async function sendCustomerDm(
  supabase: ReturnType<typeof getServiceClient>,
  customerId: string,
  text: string
): Promise<void> {
  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("tg_user_id")
      .eq("id", customerId)
      .single();
    const tgId = customer?.tg_user_id as number | null | undefined;
    if (!tgId) return;
    const customerToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
    if (!customerToken) return;
    const customerBot = new Bot(customerToken);
    await customerBot.api.sendMessage(tgId, text);
  } catch (err) {
    console.error("[owner-bot] customer DM failed:", err);
  }
}

/**
 * Phase G.4: подтверждение получения комиссионного долга от партнёра.
 * Помечает все sent-заказы партнёра без partner_commission_paid_at как
 * получённые сейчас.
 */
export function registerPartnerDebtConfirmHandler(bot: Bot<Context>) {
  bot.callbackQuery(/^partner:debt:confirm:([0-9a-f-]+)$/, async (ctx) => {
    const partnerId = ctx.match[1];
    await ctx.answerCallbackQuery();

    const supabase = getServiceClient();
    const now = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from("orders")
      .update({ partner_commission_paid_at: now })
      .eq("partner_id", partnerId)
      .eq("status", "sent")
      .is("partner_commission_paid_at", null)
      .select("id, partner_commission_snapshot");

    if (error) {
      console.error("[owner-bot] confirm partner debt failed:", error);
      await ctx.reply("Не удалось закрыть долг — попробуй позже.");
      return;
    }

    const ordersCount = updated?.length ?? 0;
    const total = updated?.reduce((s, o) => s + Number(o.partner_commission_snapshot ?? 0), 0) ?? 0;

    try {
      const oldCaption = ctx.callbackQuery.message?.caption ?? "";
      await ctx.editMessageCaption({
        caption:
          `${oldCaption}\n\n✅ <b>Комиссии закрыты:</b> ${ordersCount} заказов, ` +
          `${formatPrice(total)}.`,
        parse_mode: "HTML",
      });
    } catch {
      /* ignore */
    }

    // Уведомляем партнёра.
    try {
      const { data: partner } = await supabase
        .from("partners")
        .select("tg_user_id")
        .eq("id", partnerId)
        .single();
      const partnerTgId = partner?.tg_user_id as number | null | undefined;
      if (partnerTgId) {
        const partnerToken = process.env.TELEGRAM_PARTNER_BOT_TOKEN;
        if (partnerToken) {
          const partnerBot = new Bot(partnerToken);
          await partnerBot.api.sendMessage(
            partnerTgId,
            `✅ Долг по комиссиям закрыт. Заказов: ${ordersCount}, сумма: ${formatPrice(total)}.`
          );
        }
      }
    } catch (err) {
      console.error("[owner-bot] notify partner about debt closed failed:", err);
    }
  });
}

/**
 * Подтверждение AI-сгенерированного фото объявления.
 *  • «Четко» (aiphoto:ok)   → строка avito_media_presets kind='ai-preview'
 *    (фото входит в лестницу ротации как кандидат обложки), генерация approved;
 *  • «Переделай» (aiphoto:redo) → новая генерация (regenerateOf), БЕЗ списания
 *    дневного слота. Состояние — в avito_ai_generations (без grammY-сессии).
 */
export function registerAiPhotoHandlers(bot: Bot<Context>) {
  bot.callbackQuery(/^aiphoto:ok:([0-9a-f-]+)$/, async (ctx) => {
    const genId = ctx.match[1];
    const oldCaption = ctx.callbackQuery.message?.caption ?? "";
    // Мгновенный ack БЕЗ await: grammY обрабатывает апдейты ПОСЛЕДОВАТЕЛЬНО, и любой await
    // сетевого вызова в теле хендлера на медленной сети копит лаг — клики «отвисают» пачкой.
    // Всю работу (поиск + БД + правка подписи) уносим в фон, очередь не блокируется.
    ctx.answerCallbackQuery({ text: "Готово ✅" }).catch(() => {});

    void (async () => {
      const supabase = getServiceClient();
      try {
        const { data: gen } = await supabase
          .from("avito_ai_generations")
          .select("id, user_id, product_id, status, storage_path, public_url, category")
          .eq("id", genId)
          .maybeSingle();
        if (!gen || gen.status !== "pending") return; // нет / уже обработано — молча

        // Фото входит в лестницу как ai-preview (кандидат обложки).
        const { data: preset, error: insErr } = await supabase
          .from("avito_media_presets")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            user_id: gen.user_id,
            kind: "ai-preview",
            storage_path: gen.storage_path,
            public_url: gen.public_url,
            source: "generated",
            product_id: gen.product_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            gen_category: (gen as any).category ?? null,
            is_active: true,
            sort_order: 0,
            usage_count: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)
          .select("id")
          .single();

        if (insErr || !preset) {
          console.error("[owner-bot] ai-preview insert failed:", insErr);
          await editCaptionResilient(
            ctx,
            `${oldCaption}\n\n⚠️ Не удалось добавить в ротацию — нажми ещё раз.`,
            {
              inline_keyboard: [
                [
                  { text: "✅ Четко", callback_data: `aiphoto:ok:${genId}` },
                  { text: "🔄 Переделай", callback_data: `aiphoto:redo:${genId}` },
                ],
              ],
            }
          );
          return;
        }

        await supabase
          .from("avito_ai_generations")
          .update({ status: "approved", approved_preset_id: preset.id })
          .eq("id", genId);

        // Подпись «Одобрено» + снятие кнопок — после успешной записи (надёжно, не блокирует очередь).
        await editCaptionResilient(ctx, `${oldCaption}\n\n✅ Одобрено — в ротации.`, {
          inline_keyboard: [],
        });
      } catch (e) {
        console.error("[owner-bot] aiphoto:ok failed:", e);
      }
    })();
  });

  bot.callbackQuery(/^aiphoto:redo:([0-9a-f-]+)$/, async (ctx) => {
    const genId = ctx.match[1];
    const oldCaption = ctx.callbackQuery.message?.caption ?? "";
    // Мгновенный ack БЕЗ await + вся работа в фоне — не блокируем последовательную очередь grammY.
    ctx.answerCallbackQuery({ text: "Переделываю ♻️" }).catch(() => {});

    void (async () => {
      const supabase = getServiceClient();
      try {
        const { data: gen } = await supabase
          .from("avito_ai_generations")
          .select("id, user_id, product_id, category, status, reference_preset_id")
          .eq("id", genId)
          .maybeSingle();
        if (!gen || gen.status !== "pending") return; // нет / уже обработано — молча

        await supabase.from("avito_ai_generations").update({ status: "regenerating" }).eq("id", genId);
        // «Переделай» НЕ тратит дневной слот (regenerateOf задан).
        await scheduleAvitoGeneratePhoto({
          userId: gen.user_id as string,
          productId: gen.product_id as string,
          category: gen.category as "normal" | "photozone" | "personality",
          referencePresetId: (gen.reference_preset_id as string | null) ?? null,
          regenerateOf: genId,
        });
        await editCaptionResilient(ctx, `${oldCaption}\n\n♻️ Переделываю… (придёт новое фото с кнопками)`, {
          inline_keyboard: [],
        });
      } catch (e) {
        console.error("[owner-bot] aiphoto:redo failed:", e);
        // Вернуть в pending и ВОССТАНОВИТЬ кнопки — чтобы можно было нажать снова.
        await supabase
          .from("avito_ai_generations")
          .update({ status: "pending" })
          .eq("id", genId)
          .then(() => {}, () => {});
        await editCaptionResilient(
          ctx,
          `${oldCaption}\n\n⚠️ Не удалось переделать — нажми ещё раз.`,
          {
            inline_keyboard: [
              [
                { text: "✅ Четко", callback_data: `aiphoto:ok:${genId}` },
                { text: "🔄 Переделай", callback_data: `aiphoto:redo:${genId}` },
              ],
            ],
          }
        );
      }
    })();
  });
}

export let ownerBot: Bot<Context> | null = null;

export function getOwnerBot(): Bot<Context> {
  if (!ownerBot) {
    ownerBot = createOwnerBot();
  }
  return ownerBot;
}
