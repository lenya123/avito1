/**
 * POST /api/avito/autopost/generate-cover
 *
 * Генерация обложки для объявления через Gemini nano-banana.
 * Принимает: { imageUrl: string, productName?: string }
 * Возвращает: { imageBase64, mimeType } или { error }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { generateCoverFromUrl } from "@/lib/ai/gemini-cover";

const schema = z.object({
  imageUrl: z.string().url(),
  productName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const result = await generateCoverFromUrl(parsed.data.imageUrl, parsed.data.productName);

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Ошибка генерации" }, { status: 502 });
    }

    return NextResponse.json({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
    });
  } catch (error) {
    console.error("Gemini cover error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
