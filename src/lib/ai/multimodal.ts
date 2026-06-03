/**
 * Multimodal AI utilities — фото и голос для AI-агента Avito.
 *
 * - describeImage: GPT-4o-mini Vision → текстовое описание содержимого фото
 * - transcribeAudio: Whisper-1 → транскрипт голосового сообщения
 *
 * Используется в generate-sales-draft handler чтобы обогащать контекст
 * (sales-agent работает с текстом, ему передаётся текст-эквивалент фото/гс).
 */

import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const DESCRIBE_IMAGE_PROMPT = `Опиши коротко (1-2 предложения) что на этом фото в контексте продаж на Avito.
Если это товар — назови что именно (тип одежды, обуви, аксессуара, бренд если видно).
Если это скриншот — опиши главное (например "скриншот заказа", "скриншот переписки").
Если это что-то ещё — опиши общую суть.
Не описывай мелкие детали. Только суть на русском.`;

export async function describeImage(imageUrl: string): Promise<string | null> {
  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DESCRIBE_IMAGE_PROMPT },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 150,
    });
    return response.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[multimodal] describeImage error:", err);
    return null;
  }
}

/**
 * Транскрибирует голосовое сообщение в текст через Whisper.
 * Принимает Buffer или URL к аудио файлу.
 */
export async function transcribeAudio(
  audio: Buffer | string,
  mimeType: string = "audio/ogg"
): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (typeof audio === "string") {
      // URL — скачиваем
      const response = await fetch(audio);
      if (!response.ok) {
        console.error("[multimodal] Failed to fetch audio:", response.status);
        return null;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      buffer = audio;
    }

    // Whisper принимает File. Конвертируем Buffer в File через Blob.
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp3") ? "mp3" : "m4a";
    const file = new File([new Uint8Array(buffer)], `voice.${ext}`, { type: mimeType });

    const transcript = await getOpenAI().audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ru",
    });

    return transcript.text || null;
  } catch (err) {
    console.error("[multimodal] transcribeAudio error:", err);
    return null;
  }
}

/**
 * Универсальная обработка входящего сообщения с Avito (текст/фото/voice).
 * Возвращает текстовый эквивалент для подачи в sales-agent.
 */
export interface AvitoIncomingMessage {
  type: "text" | "image" | "voice" | "file" | "system" | "item" | "link" | "location" | string;
  content: {
    text?: string;
    image?: { url: string; id?: string };
    voice?: { url: string; voice_id?: string };
  };
}

export async function enrichMessageForAI(msg: AvitoIncomingMessage): Promise<string> {
  // Текст — как есть
  if (msg.type === "text" && msg.content.text) {
    return msg.content.text;
  }

  // Фото — описываем через Vision
  if (msg.type === "image" && msg.content.image?.url) {
    const description = await describeImage(msg.content.image.url);
    return `[Фото от покупателя]${description ? ": " + description : ""}`;
  }

  // Голос — транскрибируем
  if (msg.type === "voice" && msg.content.voice?.url) {
    const text = await transcribeAudio(msg.content.voice.url);
    return `[Голосовое сообщение]${text ? ": " + text : " (не удалось распознать)"}`;
  }

  // Item / link / location
  if (msg.type === "item") {
    return "[Покупатель прислал объявление товара]";
  }
  if (msg.type === "link") {
    return "[Покупатель прислал ссылку]";
  }
  if (msg.type === "location") {
    return "[Покупатель прислал геолокацию]";
  }

  return msg.content.text || `[Сообщение типа ${msg.type}]`;
}
