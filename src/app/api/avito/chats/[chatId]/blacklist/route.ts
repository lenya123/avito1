import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

// POST — добавить пользователя чата в чёрный список
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { chatId } = await params;

    const supabase = createServiceClient();

    // Находим чат (проверяем владельца + получаем session_id)
    const { data: chat } = await supabase
      .from("avito_chats")
      .select("avito_chat_id, session_id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .single();

    if (!chat) {
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    }

    if (!chat.session_id) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const client = await createAvitoClientForSession(chat.session_id);
    if (!client) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const result = await client.addToBlacklist(chat.avito_chat_id);

    if (!result.success) {
      console.error("[Avito Blacklist] Error:", result.error);
      return NextResponse.json({ error: "Не удалось добавить в чёрный список" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avito blacklist error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
