/**
 * POST /api/owner/avito-presets/upload
 *
 * Загружает одно или несколько фото в Supabase Storage (bucket avito-covers
 * или avito-photosets), возвращает массив публичных URL.
 *
 * Принимает multipart/form-data с полями:
 * - bucket: "avito-covers" | "avito-photosets"
 * - category: string
 * - files: File[]
 */

import { NextRequest, NextResponse } from "next/server";
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

const ALLOWED_BUCKETS = ["avito-covers", "avito-photosets"] as const;

export async function POST(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const bucket = formData.get("bucket") as string;
    const category = (formData.get("category") as string) || "general";
    const files = formData.getAll("files") as File[];

    if (!ALLOWED_BUCKETS.includes(bucket as (typeof ALLOWED_BUCKETS)[number])) {
      return NextResponse.json({ error: "Невалидный bucket" }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "Файлы не переданы" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeCat = category.replace(/[^a-zа-я0-9-]+/gi, "-").toLowerCase();
      const path = `${safeCat}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.type, upsert: false });

      if (uploadError) {
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }

    return NextResponse.json({ urls: uploadedUrls, errors });
  } catch (error) {
    console.error("[avito-presets/upload]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
