import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const BUCKET = "avito-presets";

// GET — список пресетов (сгруппировать на клиенте по kind/set_key)
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_media_presets")
      .select(
        "id, kind, set_key, public_url, source, is_active, sort_order, usage_count, last_used_at, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    // Счётчики лестницы по фотосетам (единица — set, а не отдельная строка).
    const { data: sets } = await loose
      .from("avito_photoset_sets")
      .select("set_key, title, photo_count, usage_count, last_used_at, is_active")
      .eq("user_id", userId)
      .order("usage_count", { ascending: true });

    return NextResponse.json({ presets: data ?? [], sets: sets ?? [] });
  } catch (e) {
    console.error("presets list error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — загрузка пресетов (multipart): kind=cover|photoset, set_key?, files[]
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const form = await request.formData();
    const kind = String(form.get("kind") || "");
    const ALLOWED_KINDS = ["preview", "cover", "photoset", "ai-preview", "photozone", "personality"];
    if (!ALLOWED_KINDS.includes(kind)) {
      return NextResponse.json(
        { error: `kind должен быть одним из: ${ALLOWED_KINDS.join(", ")}` },
        { status: 400 }
      );
    }
    // Только у фотосета фото группируются общим set_key.
    const setKey =
      kind === "photoset"
        ? String(form.get("set_key") || `set-${Date.now()}`)
        : null;

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Нет файлов" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const loose = createServiceClientLoose();
    const created: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${kind}/${setKey || "_"}/${Date.now()}-${i}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
      if (upErr) {
        console.error("preset upload error:", upErr);
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { data: row } = await loose
        .from("avito_media_presets")
        .insert({
          user_id: userId,
          kind,
          set_key: setKey,
          storage_path: path,
          public_url: urlData.publicUrl,
          source: "manual",
          sort_order: i,
          is_active: true,
        })
        .select("id")
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (row) created.push((row as any).id);
    }

    // Для фотосета ведём строку-единицу лестницы avito_photoset_sets.
    if (kind === "photoset" && setKey && created.length) {
      const { count } = await loose
        .from("avito_media_presets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "photoset")
        .eq("set_key", setKey)
        .eq("is_active", true);
      const title = form.get("title") ? String(form.get("title")) : null;
      await loose.from("avito_photoset_sets").upsert(
        {
          user_id: userId,
          set_key: setKey,
          title,
          photo_count: count ?? created.length,
          is_active: true,
        },
        { onConflict: "user_id,set_key" }
      );
    }

    return NextResponse.json({ success: true, created, count: created.length, setKey });
  } catch (e) {
    console.error("presets upload error:", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
