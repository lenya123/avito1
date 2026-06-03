import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const BUCKET = "avito-presets";

// GET ?productId= — фото живого фотосета (датасета) товара (signed URLs для приватного бакета).
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) return NextResponse.json({ error: "productId обязателен" }, { status: 400 });

    const supabase = createServiceClient();
    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_media_presets")
      .select("id, storage_path, sort_order")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "photoset")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const photos = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map(async (p) => {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600);
        return { id: p.id as string, url: s?.signedUrl ?? null };
      })
    );
    return NextResponse.json({ photos: photos.filter((p) => p.url) });
  } catch (e) {
    console.error("[avito/listings/dataset] GET error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST (multipart: productId, files[]) — добавить фото в датасет товара.
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const form = await request.formData();
    const productId = String(form.get("productId") || "");
    if (!productId) return NextResponse.json({ error: "productId обязателен" }, { status: 400 });
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "Нет файлов" }, { status: 400 });

    const supabase = createServiceClient();
    const loose = createServiceClientLoose();

    // Мульти-альбом (без лимита): setKey передан → дозапись в этот альбом; пусто → НОВЫЙ альбом.
    const reqSetKey = String(form.get("setKey") || "").trim();
    const setKey = reqSetKey || `dataset-${productId}-${Date.now()}`;
    const isNewAlbum = !reqSetKey;

    let albumTitle = "Альбом 1";
    if (isNewAlbum) {
      const { count: albumCount } = await loose
        .from("avito_photoset_sets")
        .select("set_key", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("product_id", productId)
        .eq("is_active", true);
      albumTitle = `Альбом ${(albumCount ?? 0) + 1}`;
    }

    // Лимит альбома: 1–9 фото (заполняют слоты 2–10 объявления; обложка — отдельно). Не превышаем.
    const ALBUM_MAX = 9;
    const { count: alreadyInAlbum } = await loose
      .from("avito_media_presets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "photoset")
      .eq("set_key", setKey)
      .eq("is_active", true);
    const allowed = Math.max(0, ALBUM_MAX - (alreadyInAlbum ?? 0));
    if (allowed === 0) {
      return NextResponse.json(
        { error: `В альбоме уже максимум — ${ALBUM_MAX} фото.` },
        { status: 400 }
      );
    }
    const filesToUpload = files.slice(0, allowed);
    const skipped = files.length - filesToUpload.length;

    const { data: maxRow } = await loose
      .from("avito_media_presets")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "photoset")
      .eq("set_key", setKey)
      .order("sort_order", { ascending: false })
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sort = (((maxRow ?? [])[0] as any)?.sort_order ?? -1) + 1;

    let created = 0;
    for (const file of filesToUpload) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/photoset/${setKey}/${Date.now()}-${sort}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) {
        console.error("[avito/listings/dataset] upload error:", upErr);
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      await loose.from("avito_media_presets").insert({
        user_id: userId,
        kind: "photoset",
        set_key: setKey,
        product_id: productId,
        storage_path: path,
        public_url: urlData.publicUrl,
        source: "manual",
        sort_order: sort,
        is_active: true,
      });
      created++;
      sort++;
    }

    const { count } = await loose
      .from("avito_media_presets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "photoset")
      .eq("set_key", setKey)
      .eq("is_active", true);

    // Для нового альбома задаём title; для дозаписи title не трогаем (не перетираем).
    const setRow: Record<string, unknown> = {
      user_id: userId,
      set_key: setKey,
      product_id: productId,
      photo_count: count ?? created,
      is_active: true,
    };
    if (isNewAlbum) setRow.title = albumTitle;
    await loose.from("avito_photoset_sets").upsert(setRow, { onConflict: "user_id,set_key" });

    return NextResponse.json({ success: true, created, total: count ?? created, setKey, skipped });
  } catch (e) {
    console.error("[avito/listings/dataset] POST error:", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
