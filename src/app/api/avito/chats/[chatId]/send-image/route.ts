import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

// POST — отправить изображение в чат (двухшаговый: upload → send)
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

    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Изображение обязательно" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Максимальный размер 10 МБ" }, { status: 400 });
    }

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

    // Получаем avito_user_id из сессии
    const { data: sessionData } = await supabase
      .from("avito_browser_sessions")
      .select("avito_user_id")
      .eq("id", chat.session_id)
      .single();

    // Шаг 1: Загрузка изображения
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await client.uploadImage(imageBuffer, file.name);

    if (!uploadResult.success) {
      console.error("[Avito SendImage] Upload error:", uploadResult.error);
      return NextResponse.json(
        { error: "Не удалось загрузить изображение в Avito" },
        { status: 502 }
      );
    }

    // Шаг 2: Отправка в чат
    const sendResult = await client.sendImageMessage(chat.avito_chat_id, uploadResult.data.id);

    if (!sendResult.success) {
      console.error("[Avito SendImage] Send error:", sendResult.error);
      return NextResponse.json({ error: "Не удалось отправить изображение" }, { status: 502 });
    }

    // Сохраняем в кеш
    const now = new Date().toISOString();
    await supabase.from("avito_messages").insert({
      chat_id: chatId,
      user_id: userId,
      avito_message_id: sendResult.data.id,
      direction: "out",
      content_image_url: sendResult.data.content?.image?.url || null,
      message_type: "image",
      author_id: sessionData?.avito_user_id ?? null,
      avito_created_at: now,
    });

    await supabase
      .from("avito_chats")
      .update({
        last_message: "[Изображение]",
        last_message_at: now,
        last_message_direction: "out",
        updated_at: now,
      })
      .eq("id", chatId);

    return NextResponse.json({
      success: true,
      message: {
        id: sendResult.data.id,
        direction: "out",
        content_image_url: sendResult.data.content?.image?.url,
        message_type: "image",
        avito_created_at: now,
      },
    });
  } catch (error) {
    console.error("Avito send image error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
