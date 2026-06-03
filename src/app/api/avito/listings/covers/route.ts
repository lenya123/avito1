import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const BUCKET = "avito-presets";

// GET ?productId= — превью-обложки ЭТОГО товара (kind='preview', per-product).
// «Превью с инета» — приманки на слот 1; вместе с AI-превью образуют банк обложек товара.
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
      .select("id, storage_path, usage_count, sort_order")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "preview")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const covers = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((data ?? []) as any[]).map(async (p) => {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600);
        return { id: p.id as string, url: s?.signedUrl ?? null, usage_count: (p.usage_count as number) ?? 0 };
      })
    );
    return NextResponse.json({ covers: covers.filter((c) => c.url) });
  } catch (e) {
    console.error("[avito/listings/covers] GET error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST (multipart: productId, files[]) — добавить превью-обложки товара.
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

    const { data: maxRow } = await loose
      .from("avito_media_presets")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .eq("kind", "preview")
      .order("sort_order", { ascending: false })
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sort = (((maxRow ?? [])[0] as any)?.sort_order ?? -1) + 1;

    let created = 0;
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/preview/${productId}/${Date.now()}-${sort}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) {
        console.error("[avito/listings/covers] upload error:", upErr);
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      await loose.from("avito_media_presets").insert({
        user_id: userId,
        kind: "preview",
        product_id: productId,
        storage_path: path,
        public_url: urlData.publicUrl,
        source: "manual",
        sort_order: sort,
        usage_count: 0,
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
      .eq("kind", "preview")
      .eq("is_active", true);

    return NextResponse.json({ success: true, created, total: count ?? created });
  } catch (e) {
    console.error("[avito/listings/covers] POST error:", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
