import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const bodySchema = z.object({
  webhookUrl: z.string().url(),
});

// POST — зарегистрировать webhook URL в Avito
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректный URL" }, { status: 400 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const result = await client.registerWebhook(parsed.data.webhookUrl);

    if (!result.success) {
      console.error("[Avito Webhook] Register error:", result.error);
      return NextResponse.json(
        { error: "Не удалось зарегистрировать webhook в Avito" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, webhookUrl: parsed.data.webhookUrl });
  } catch (error) {
    console.error("Avito webhook register error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
