import { NextRequest, NextResponse } from "next/server";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoGeneratePhoto } from "@/lib/jobs/queues";
import { moscowToday } from "@/lib/utils/moscow-time";
import { z } from "zod";

// Дневные лимиты AI-генерации на товар (=5/день).
const CAPS = { normal: 2, photozone: 2, personality: 1 } as const;
type GenCategory = keyof typeof CAPS;

const createSchema = z.object({
  productId: z.string().uuid(),
  category: z.enum(["normal", "photozone", "personality"]),
  referencePresetId: z.string().uuid().optional(),
  // Ручной выбор исходных фото из датасета товара (до 3). Пусто = авто (лестница).
  sourcePresetIds: z.array(z.string().uuid()).max(3).optional(),
});

// POST — поставить генерацию фото (результат придёт в owner-bot на подтверждение).
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }

    await scheduleAvitoGeneratePhoto({
      userId,
      productId: parsed.data.productId,
      category: parsed.data.category,
      referencePresetId: parsed.data.referencePresetId ?? null,
      sourcePresetIds: parsed.data.sourcePresetIds ?? null,
    });

    return NextResponse.json({ success: true, queued: true });
  } catch (e) {
    console.error("[avito/autopost/ai-photo] POST error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// GET — остаток дневной квоты по товару (?productId=).
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId обязателен" }, { status: 400 });

    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_ai_gen_counters")
      .select("category, used_count")
      .eq("product_id", productId)
      .eq("gen_date", moscowToday());

    const used: Record<GenCategory, number> = { normal: 0, photozone: 0, personality: 0 };
    for (const row of (data ?? []) as { category: GenCategory; used_count: number }[]) {
      if (row.category in used) used[row.category] = row.used_count;
    }

    const remaining = {
      normal: Math.max(0, CAPS.normal - used.normal),
      photozone: Math.max(0, CAPS.photozone - used.photozone),
      personality: Math.max(0, CAPS.personality - used.personality),
    };

    // Доставленные в TG фото по товару — монотонный счётчик. tg_message_id
    // проставляется ТОЛЬКО после успешной отправки фото в бот, поэтому UI снимает
    // блокировку именно по факту прихода фото (а не сразу после insert).
    const { count: generatedCount } = await loose
      .from("avito_ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .not("tg_message_id", "is", null);

    // Обложек-кандидатов для этого товара (слот 1): одобренные AI-превью + ручные.
    // На одно объявление идёт 1, остальные копятся и ротируются по лестнице.
    const { count: coverCount } = await loose
      .from("avito_media_presets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .in("kind", ["preview", "cover", "ai-preview"]);

    return NextResponse.json({
      caps: CAPS,
      used,
      remaining,
      generatedCount: generatedCount ?? 0,
      coverCount: coverCount ?? 0,
    });
  } catch (e) {
    console.error("[avito/autopost/ai-photo] GET error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
