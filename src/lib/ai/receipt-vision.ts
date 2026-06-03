/**
 * Распознавание банковского чека через OpenAI Vision (gpt-4o).
 *
 * Multi-signal стратегия (Этап 4 walkthrough): извлекаем поля для жёсткой
 * сверки получателя (last4 / телефон / имя ИП) + сумму/дату/operation_id +
 * проверку, что это реально чек, а не скриншот приложения банка.
 *
 * Возвращает строгий JSON. Не интерпретирует — выдаёт null для невидимых полей.
 */

import OpenAI from "openai";
import { z } from "zod";

let _openaiClient: OpenAI | null = null;
function getOpenai(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openaiClient;
}

const VisionResponseSchema = z.object({
  is_proper_receipt: z.boolean().nullable().optional(),
  transferred_amount: z.number().nonnegative().nullable().optional(),
  transfer_datetime: z.string().nullable().optional(),
  operation_id: z.string().nullable().optional(),
  recipient_card_last4: z.string().nullable().optional(),
  recipient_phone: z.string().nullable().optional(),
  recipient_ip_name: z.string().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  recipient_bank: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
});

export type ReceiptVisionResult = {
  isProperReceipt: boolean | null;
  transferredAmount: number | null;
  transferDatetime: Date | null;
  operationId: string | null;
  recipientCardLast4: string | null;
  recipientPhone: string | null;
  recipientIpName: string | null;
  recipientName: string | null;
  recipientBank: string | null;
  rawText: string | null;
  rawResponse: unknown;
};

const SYSTEM_PROMPT = `Ты помощник, который анализирует фото банковских чеков и квитанций о переводе для российских банков (Тинькофф/Т-Банк, Сбер, Альфа, ВТБ, Газпромбанк, Озон-банк и др.).

Верни строго JSON со следующими полями. Если чего-то не видно — ставь null. НЕ ПРИДУМЫВАЙ значения, которых на изображении нет.

Поля:

1. is_proper_receipt (boolean): true если это БАНКОВСКИЙ ЧЕК / КВИТАНЦИЯ о переводе (есть слова «Чек по операции», «Квитанция», «Receipt», банковский штамп/печать, реквизиты банка отправителя). false если это просто скриншот ленты транзакций приложения банка («минус 3000 ₽», «Оплата покупок», список операций без полной информации) или вообще не банковский документ.

2. transferred_amount (number): главная сумма перевода в рублях (без копеек, целое или с дробной частью). Это та сумма, которая уходит получателю. НЕ путать с комиссией, балансом счёта или другими случайными числами на скрине.

3. transfer_datetime (string ISO 8601): дата и время операции. Если только дата — добавь время 00:00:00.

4. operation_id (string): любой длинный уникальный код операции. Может называться «RRN», «Номер операции в СБП», «Идентификатор операции», «Номер квитанции», «Код авторизации» и т.п. Бери самый длинный/уникальный из видимых.

5. recipient_card_last4 (string): последние 4 цифры карты ПОЛУЧАТЕЛЯ (не отправителя). Например «*3006», «••3465» — извлекай только 4 цифры. Видно для переводов по номеру карты. Для СБП-переводов и QR — обычно null.

6. recipient_phone (string): телефон ПОЛУЧАТЕЛЯ перевода. Любой формат: «+7 925 365-80-98», «79253658098». Видно для СБП-переводов по номеру телефона.

7. recipient_ip_name (string): полное наименование получателя-ИП как видно в чеке. Например: «ИП СОЛОВЬЕВ ЯРОСЛАВ АЛЕКСЕЕВИЧ». Видно для оплат по QR-коду.

8. recipient_name (string): ФИО или короткое имя получателя физлица. Например: «Дмитрий Александрович Ц.», «Ярослав С.». Только для контекста, не главное поле.

9. recipient_bank (string): название банка получателя как видно в чеке. Например: «Т-Банк», «Сбер», «Озон Банк».

10. raw_text (string): весь распознанный текст с изображения, как видишь, в одну строку через перенос \\n. Для аудита.

Важно: не интерпретируй контекст («это перевод нам» и т.п.) — просто извлеки данные как они есть.`;

export async function recognizeReceipt(imageUrl: string): Promise<ReceiptVisionResult> {
  const response = await getOpenai().chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Извлеки данные из этого банковского чека/квитанции в JSON." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 1500,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  let parsed: z.infer<typeof VisionResponseSchema>;
  try {
    const json = JSON.parse(raw);
    parsed = VisionResponseSchema.parse(json);
  } catch (error) {
    console.error("recognizeReceipt parse error:", error, raw);
    return emptyResult(response, raw);
  }

  return {
    isProperReceipt: parsed.is_proper_receipt ?? null,
    transferredAmount:
      typeof parsed.transferred_amount === "number" ? parsed.transferred_amount : null,
    transferDatetime: parsed.transfer_datetime ? safeParseDate(parsed.transfer_datetime) : null,
    operationId: parsed.operation_id?.trim() || null,
    recipientCardLast4: extractLast4(parsed.recipient_card_last4),
    recipientPhone: parsed.recipient_phone?.trim() || null,
    recipientIpName: parsed.recipient_ip_name?.trim() || null,
    recipientName: parsed.recipient_name?.trim() || null,
    recipientBank: parsed.recipient_bank?.trim() || null,
    rawText: parsed.raw_text ?? null,
    rawResponse: response,
  };
}

function emptyResult(response: unknown, raw: string): ReceiptVisionResult {
  return {
    isProperReceipt: null,
    transferredAmount: null,
    transferDatetime: null,
    operationId: null,
    recipientCardLast4: null,
    recipientPhone: null,
    recipientIpName: null,
    recipientName: null,
    recipientBank: null,
    rawText: raw,
    rawResponse: response,
  };
}

function safeParseDate(value: string): Date | null {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function extractLast4(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}
