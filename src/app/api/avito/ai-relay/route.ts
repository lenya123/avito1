import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { relayToGPT } from "@/lib/ai/relay";
import { z } from "zod";

/**
 * Универсальная труба до нейронки: текст/фото/гс → GPT → текст (+опц. озвучка).
 * Бизнес-логику диалога/отзывов ведёт владелец — здесь только транспорт.
 */
const schema = z.object({
  text: z.string().max(8000).optional(),
  imageUrl: z.string().url().optional(),
  voiceUrl: z.string().url().optional(),
  system: z.string().max(8000).optional(),
  wantVoice: z.boolean().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .max(40)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const { text, imageUrl, voiceUrl, system, wantVoice, history } = parsed.data;
    if (!text && !imageUrl && !voiceUrl) {
      return NextResponse.json(
        { error: "Передайте text, imageUrl или voiceUrl" },
        { status: 400 }
      );
    }

    const result = await relayToGPT({
      incoming: { text, imageUrl, voiceUrl },
      history,
      system,
      wantVoice,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("ai-relay error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
