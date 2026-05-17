import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const credentialsSchema = z.object({
  avitoClientId: z.string().min(1, "Укажите client_id").max(200).trim(),
  avitoClientSecret: z.string().min(1, "Укажите client_secret").max(200).trim(),
});

function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return "••••";
  return "••••••••" + secret.slice(-4);
}

// GET — получить текущие credentials (секрет замаскирован)
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    return NextResponse.json({
      avitoClientId: session.avitoClientId || "",
      avitoClientSecretMasked: session.avitoClientSecret
        ? maskSecret(session.avitoClientSecret)
        : "",
      hasCredentials: !!(session.avitoClientId && session.avitoClientSecret),
    });
  } catch (error) {
    console.error("Get avito credentials error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — сохранить credentials в avito_browser_sessions
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Заполните все поля" },
        { status: 400 }
      );
    }
    const { avitoClientId, avitoClientSecret } = parsed.data;

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    const supabase = createServiceClient();

    if (session.id) {
      // Обновляем существующую сессию
      const { error: updateError } = await supabase
        .from("avito_browser_sessions")
        .update({
          avito_client_id: avitoClientId,
          avito_client_secret: avitoClientSecret,
        })
        .eq("id", session.id);

      if (updateError) {
        console.error("Update avito credentials error:", updateError);
        return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
      }
    } else {
      // Создаём новую сессию для этого accountIndex
      const { error: insertError } = await supabase.from("avito_browser_sessions").insert({
        user_id: userId,
        account_index: session.accountIndex,
        avito_client_id: avitoClientId,
        avito_client_secret: avitoClientSecret,
        cookies: [],
        status: "pending",
      });

      if (insertError) {
        console.error("Insert avito credentials error:", insertError);
        return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save avito credentials error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
