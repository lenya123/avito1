import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const checkConnectionSchema = z.object({
  avitoClientId: z.string().min(1).max(200).trim(),
  avitoClientSecret: z.string().min(1).max(200).trim(),
});

// POST — проверить подключение к Avito API
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = checkConnectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Заполните оба поля" }, { status: 400 });
    }
    const { avitoClientId, avitoClientSecret } = parsed.data;

    // resolveSession validates subscription + accountIndex
    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    // Запрашиваем токен у Avito API
    const tokenResponse = await fetch("https://api.avito.ru/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: avitoClientId,
        client_secret: avitoClientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const status = tokenResponse.status;
      const userMessage =
        status === 401 || status === 403
          ? "Неверные данные API — проверьте client_id и client_secret"
          : "Не удалось подключиться к Avito API";
      return NextResponse.json({ connected: false, error: userMessage }, { status: 200 });
    }

    const tokenData = await tokenResponse.json();

    // Получаем числовой Avito user ID через /accounts/self
    let avitoUserId: number | null = null;
    try {
      const selfResponse = await fetch("https://api.avito.ru/core/v1/accounts/self", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (selfResponse.ok) {
        const selfData = await selfResponse.json();
        avitoUserId = selfData.id;

        // Сохраняем avito_user_id в сессию (не в users)
        const supabase = createServiceClient();
        if (session.id) {
          await supabase
            .from("avito_browser_sessions")
            .update({ avito_user_id: avitoUserId })
            .eq("id", session.id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch Avito self:", e);
    }

    return NextResponse.json({
      connected: true,
      expiresIn: tokenData.expires_in,
      avitoUserId,
    });
  } catch (error) {
    console.error("Avito check connection error:", error);
    return NextResponse.json(
      { connected: false, error: "Не удалось подключиться к Avito API" },
      { status: 200 }
    );
  }
}
