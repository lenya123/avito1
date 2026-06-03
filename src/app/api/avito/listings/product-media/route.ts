import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const BUCKET = "avito-presets";

// GET ?productId= — медиа товара для карточки: альбомы фотосета, живые обложки,
// AI-обложки по категориям + признак «идёт генерация» (для индикатора загрузки/обновления).
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId обязателен" }, { status: 400 });

    const supabase = createServiceClient();
    const loose = createServiceClientLoose();
    const sign = async (path: string) =>
      (await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null;

    // Все пресеты товара (обложки + фотосет).
    const { data: presets } = await loose
      .from("avito_media_presets")
      .select("id, kind, set_key, storage_path, usage_count, sort_order, gen_category")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (presets ?? []) as any[];

    // Альбомы фотосета (group by set_key) + usage_count из avito_photoset_sets.
    const { data: setsRaw } = await loose
      .from("avito_photoset_sets")
      .select("set_key, title, photo_count, usage_count")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("is_active", true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const albums = await Promise.all(
      ((setsRaw ?? []) as any[]).map(async (s) => {
        const first = rows.find((r) => r.kind === "photoset" && r.set_key === s.set_key);
        return {
          set_key: s.set_key as string,
          title: (s.title as string) ?? s.set_key,
          photo_count: (s.photo_count as number) ?? 0,
          usage_count: (s.usage_count as number) ?? 0,
          thumb: first ? await sign(first.storage_path) : null,
        };
      })
    );

    // Живые обложки (kind='preview').
    const liveCovers = await Promise.all(
      rows
        .filter((r) => r.kind === "preview")
        .map(async (r) => ({ id: r.id, url: await sign(r.storage_path), usage_count: r.usage_count ?? 0 }))
    );

    // AI-обложки (kind='ai-preview') по категориям.
    const aiByCat: Record<string, { id: string; url: string | null; usage_count: number }[]> = {
      normal: [],
      photozone: [],
      personality: [],
    };
    for (const r of rows.filter((x) => x.kind === "ai-preview")) {
      const cat = (r.gen_category as string) || "normal";
      if (!aiByCat[cat]) aiByCat[cat] = [];
      aiByCat[cat].push({ id: r.id, url: await sign(r.storage_path), usage_count: r.usage_count ?? 0 });
    }

    // «Идёт генерация» = ТОЛЬКО недавно поставленный батч (ещё в работе / только что
    // приземлился), а НЕ старые превью, висящие в ожидании «Четко» в боте. Строка pending
    // создаётся уже ПОСЛЕ успешной генерации (фото залито, кнопки в TG отправлены) и живёт,
    // пока владелец не нажмёт «Четко/Переделай» — без рамки по времени любое неодобренное
    // превью навсегда лочило бы кнопку «Сгенерить сейчас» и держало ложный индикатор.
    // updated_at в таблице не поддерживается (== created_at), поэтому окно считаем по created_at.
    const RECENT_GEN_MS = 15 * 60_000;
    const recentSince = new Date(Date.now() - RECENT_GEN_MS).toISOString();
    const { count: pending } = await loose
      .from("avito_ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .in("status", ["pending", "regenerating"])
      .gte("created_at", recentSince);

    // Текущие настройки автогенерации товара (тумблер + получатель).
    const { data: prod } = await loose
      .from("products")
      .select("auto_covers_enabled, cover_tg_chat_id")
      .eq("id", productId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (prod as any) ?? {};

    return NextResponse.json({
      albums,
      liveCovers: liveCovers.filter((c) => c.url),
      aiCovers: aiByCat,
      pendingGenerations: pending ?? 0,
      settings: {
        autoCoversEnabled: p.auto_covers_enabled ?? false,
        coverTgChatId: p.cover_tg_chat_id ?? null,
      },
    });
  } catch (e) {
    console.error("[avito/listings/product-media] GET error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
