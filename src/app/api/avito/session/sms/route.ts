import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const smsSchema = z.object({
  code: z.string().min(4).max(8),
  accountIndex: z.number().int().min(1).max(3).optional(),
});

// POST — отправить SMS код для верификации Avito аккаунта.
// Worker (avito-login job) поллит этот код из БД и передаёт его в Puppeteer.
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = smsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Код должен быть от 4 до 8 символов" }, { status: 400 });
    }

    const accountIndex = parsed.data.accountIndex ?? 1;
    const supabase = createServiceClient();

    // Проверяем что сессия действительно ждёт SMS
    const { data: session } = await supabase
      .from("avito_browser_sessions")
      .select("status")
      .eq("user_id", userId)
      .eq("account_index", accountIndex)
      .single();

    if (session?.status !== "awaiting_sms") {
      return NextResponse.json({ error: "Сессия не ожидает SMS код" }, { status: 409 });
    }

    // Записываем код — worker подхватит его при следующем поллинге (макс 2с)
    await supabase
      .from("avito_browser_sessions")
      .update({ sms_code: parsed.data.code })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[avito/session/sms POST] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
