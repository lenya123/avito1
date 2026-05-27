/**
 * AI-реле: гоняет переписку «вперёд-назад до нейронки (GPT)» — текст, фото, гс.
 *
 * По ТЗ бизнес-логику диалога/отзывов ведёт владелец; здесь — только труба:
 *  • входящее фото  → vision (GPT) → текст-описание/ответ;
 *  • входящее гс    → Whisper → текст;
 *  • ответ          → текст и опционально озвучка (TTS).
 *
 * Без OPENAI_API_KEY всё деградирует в аккуратные заглушки (флоу не падает).
 */
import OpenAI from "openai";
import {
  features,
  OPENAI_TEXT_MODEL,
  OPENAI_VISION_MODEL,
  OPENAI_STT_MODEL,
  OPENAI_TTS_MODEL,
} from "@/lib/config/features";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
  return _openai;
}

/** Скачать бинарь по URL. */
async function fetchBuffer(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return {
      buf: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get("content-type") || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/** Голос → текст (Whisper). */
export async function transcribeVoice(voiceUrl: string): Promise<string> {
  if (!features.hasOpenAI) return "[голосовое сообщение]";
  const dl = await fetchBuffer(voiceUrl);
  if (!dl) return "[голосовое сообщение: не удалось скачать]";
  try {
    // Buffer → Uint8Array: устраняет несовместимость BlobPart в Node 22+
    const file = new File([new Uint8Array(dl.buf)], "voice.ogg", {
      type: dl.mime || "audio/ogg",
    });
    const r = await openai().audio.transcriptions.create({
      file,
      model: OPENAI_STT_MODEL,
    });
    return r.text?.trim() || "[пустое голосовое]";
  } catch (e) {
    console.error("[relay] transcribe failed:", e);
    return "[голосовое сообщение]";
  }
}

/** Фото → текст (vision): описание + извлечение сути вопроса покупателя. */
export async function describeImage(imageUrl: string, question?: string): Promise<string> {
  if (!features.hasOpenAI) return "[фото от покупателя]";
  try {
    const r = await openai().chat.completions.create({
      model: OPENAI_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                question ||
                "Опиши кратко, что на фото от покупателя в контексте товара на Avito (что спрашивает/показывает).",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });
    return r.choices[0]?.message?.content?.trim() || "[фото]";
  } catch (e) {
    console.error("[relay] describeImage failed:", e);
    return "[фото от покупателя]";
  }
}

/** Текст → голос (TTS). Возвращает mp3 Buffer или null (если нет ключа). */
export async function synthesizeVoice(text: string): Promise<Buffer | null> {
  if (!features.hasOpenAI || !text.trim()) return null;
  try {
    const r = await openai().audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: "alloy",
      input: text.slice(0, 4000),
    });
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("[relay] tts failed:", e);
    return null;
  }
}

export interface IncomingMedia {
  text?: string | null;
  imageUrl?: string | null;
  voiceUrl?: string | null;
}

/**
 * Свести входящее (текст/фото/гс) к единому тексту для нейронки.
 * Используется перед генерацией ответа агентом.
 */
export async function normalizeIncoming(m: IncomingMedia): Promise<string> {
  const parts: string[] = [];
  if (m.text && m.text.trim()) parts.push(m.text.trim());
  if (m.voiceUrl) parts.push(`(голосовое) ${await transcribeVoice(m.voiceUrl)}`);
  if (m.imageUrl) parts.push(`(фото) ${await describeImage(m.imageUrl)}`);
  return parts.join("\n").trim() || "[сообщение без текста]";
}

export interface RelayResult {
  text: string;
  voiceBase64?: string; // если запрошена озвучка ответа
}

/**
 * Универсальная труба: входящее (текст/фото/гс) + история → GPT → ответ
 * (+опц. озвучка). Системный промт/логику передаёт вызывающий —
 * здесь только транспорт до нейронки и обратно.
 */
export async function relayToGPT(input: {
  incoming: IncomingMedia;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  system?: string;
  wantVoice?: boolean;
}): Promise<RelayResult> {
  const userText = await normalizeIncoming(input.incoming);

  if (!features.hasOpenAI) {
    return { text: `[GPT недоступен — нет ключа] Принято: ${userText}` };
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  for (const h of input.history ?? []) messages.push(h);
  messages.push({ role: "user", content: userText });

  const r = await openai().chat.completions.create({
    model: OPENAI_TEXT_MODEL,
    temperature: 0.6,
    messages,
  });
  const text = r.choices[0]?.message?.content?.trim() || "";

  const out: RelayResult = { text };
  if (input.wantVoice && text) {
    const voice = await synthesizeVoice(text);
    if (voice) out.voiceBase64 = voice.toString("base64");
  }
  return out;
}
