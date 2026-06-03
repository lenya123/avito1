/**
 * Загрузка QR-фото для kind='ip_qr' в bucket `payment-requisites`.
 * Возвращает storage_path, который сохраняется в payment_methods.qr_storage_path.
 *
 * Bucket private. customer-bot скачивает файл через service-role и шлёт буфером
 * в чат клиента (по аналогии с partner-bot QR — см. customer-bot.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { randomUUID } from "node:crypto";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Не передан файл" }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: "Допустимы только JPG / PNG / WEBP" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Файл больше 5 МБ" }, { status: 400 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceClient();
    const { error: uploadError } = await supabase.storage
      .from("payment-requisites")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[qr-upload] Storage upload failed:", uploadError);
      return NextResponse.json({ error: "Не удалось загрузить файл" }, { status: 500 });
    }

    return NextResponse.json({ qrStoragePath: path });
  } catch (error) {
    console.error("[qr-upload] error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
