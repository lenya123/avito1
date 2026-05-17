import { NextRequest, NextResponse } from "next/server";
import { createServiceClientLoose } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { scheduleAvitoPostListing } from "@/lib/jobs/queues";
import { randomRingMetro } from "@/lib/constants/moscow-metro";
import { z } from "zod";

const createSchema = z.object({
  productId: z.string().uuid().optional(),
  title: z.string().min(3).max(120),
  price: z.number().positive().max(99999999),
  description: z.string().max(5000).optional(),
  city: z.string().max(120).optional(),
});

// POST — создать заявку автопостинга (флоу «создать объявление»)
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Проверьте название и цену", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;
    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const loose = createServiceClientLoose();

    // Город: из товара (// STUB: owner-panel) → иначе Москва
    let city = parsed.data.city || "Москва";
    if (parsed.data.productId) {
      const { data: product } = await loose
        .from("products")
        .select("city")
        .eq("id", parsed.data.productId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((product as any)?.city) city = (product as any).city;
    }

    const { data: jobRow, error } = await loose
      .from("avito_post_jobs")
      .insert({
        user_id: userId,
        session_id: session.id,
        product_id: parsed.data.productId ?? null,
        title: parsed.data.title,
        price: parsed.data.price,
        city,
        metro: randomRingMetro(),
        description: parsed.data.description ?? null,
        status: "queued",
      })
      .select("id")
      .single();

    if (error || !jobRow) {
      console.error("[avito/post] insert error:", error);
      return NextResponse.json({ error: "Не удалось создать заявку" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postJobId = (jobRow as any).id as string;
    await scheduleAvitoPostListing(postJobId);

    return NextResponse.json({ success: true, jobId: postJobId, queued: true });
  } catch (e) {
    console.error("avito post create error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// GET — последние заявки автопостинга (для статуса на странице «Создать»)
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const loose = createServiceClientLoose();
    const { data } = await loose
      .from("avito_post_jobs")
      .select(
        "id, title, price, status, city, metro, avito_item_url, error_message, created_at, published_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ jobs: data ?? [] });
  } catch (e) {
    console.error("avito post list error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
