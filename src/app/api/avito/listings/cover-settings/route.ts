import { NextRequest, NextResponse } from "next/server";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const schema = z.object({
  productId: z.string().uuid(),
  autoCoversEnabled: z.boolean(),
  // chat_id получателя AI-обложек (null = получатель не привязан → не генерируем и не шлём).
  coverTgChatId: z.number().int().nullable().optional(),
});

// POST — сохранить настройки автогенерации обложек товара (тумблер + получатель).
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    const { productId, autoCoversEnabled, coverTgChatId } = parsed.data;

    const loose = createServiceClientLoose();
    const { error } = await loose
      .from("products")
      .update({
        auto_covers_enabled: autoCoversEnabled,
        cover_tg_chat_id: coverTgChatId ?? null,
      })
      .eq("id", productId);

    if (error) {
      console.error("[avito/listings/cover-settings] update error:", error);
      return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[avito/listings/cover-settings] POST error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
