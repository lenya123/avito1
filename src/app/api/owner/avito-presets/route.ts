/**
 * GET/POST/DELETE /api/owner/avito-presets
 *
 * Управление пресетами обложек и фотосетов для Avito автопостинга.
 * Доступно только владельцу.
 *
 * NOTE: таблицы avito_cover_presets, avito_photoset_presets создаются
 * миграцией 20260522000010, но генерированные типы Supabase их пока не знают.
 * Используем cast через any для обхода типизации.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;
  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const kind = request.nextUrl.searchParams.get("kind");

    if (kind === "covers") {
      const { data } = await supabase
        .from("avito_cover_presets")
        .select("*")
        .order("created_at", { ascending: false });
      return NextResponse.json({ covers: data || [] });
    }

    if (kind === "photosets") {
      const { data } = await supabase
        .from("avito_photoset_presets")
        .select("*")
        .order("created_at", { ascending: false });
      return NextResponse.json({ photosets: data || [] });
    }

    const [covers, photosets] = await Promise.all([
      supabase.from("avito_cover_presets").select("*").order("created_at", { ascending: false }),
      supabase.from("avito_photoset_presets").select("*").order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      covers: covers.data || [],
      photosets: photosets.data || [],
    });
  } catch (error) {
    console.error("[avito-presets GET]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const coverSchema = z.object({
  kind: z.literal("cover"),
  category: z.string().min(1),
  photoUrl: z.string().url(),
});

const photosetSchema = z.object({
  kind: z.literal("photoset"),
  category: z.string().min(1),
  name: z.string().min(1),
  photoUrls: z.array(z.string().url()).min(1),
});

const bodySchema = z.union([coverSchema, photosetSchema]);

export async function POST(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невалидные данные" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const data = parsed.data;

    if (data.kind === "cover") {
      const { data: row, error } = await supabase
        .from("avito_cover_presets")
        .insert({
          category: data.category,
          photo_url: data.photoUrl,
          created_by: session.userId,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ cover: row });
    }

    const { data: row, error } = await supabase
      .from("avito_photoset_presets")
      .insert({
        category: data.category,
        name: data.name,
        photo_urls: data.photoUrls,
        created_by: session.userId,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ photoset: row });
  } catch (error) {
    console.error("[avito-presets POST]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const deleteSchema = z.object({
  kind: z.enum(["cover", "photoset"]),
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невалидные данные" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceClient() as any;
    const table = parsed.data.kind === "cover" ? "avito_cover_presets" : "avito_photoset_presets";
    const { error } = await supabase.from(table).delete().eq("id", parsed.data.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[avito-presets DELETE]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
