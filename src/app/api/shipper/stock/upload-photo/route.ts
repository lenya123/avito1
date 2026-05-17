import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const BUCKET = "product-photos";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const bodySchema = z.object({
  productId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const productId = formData.get("productId") as string | null;

    if (!file || !productId) {
      return NextResponse.json({ error: "Нужен файл и productId" }, { status: 400 });
    }

    bodySchema.parse({ productId });

    // Validate file
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Файл слишком большой (макс 5 МБ)" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Только JPEG, PNG или WebP" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Check product exists
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, photo_urls")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Upload to storage
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${productId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: "Ошибка загрузки файла" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const photoUrl = urlData.publicUrl;

    // Append to product photo_urls
    const currentUrls = product.photo_urls || [];
    const { error: updateError } = await supabase
      .from("products")
      .update({ photo_urls: [...currentUrls, photoUrl] })
      .eq("id", productId);

    if (updateError) {
      console.error("Update error:", updateError);
      return NextResponse.json({ error: "Ошибка сохранения URL" }, { status: 500 });
    }

    return NextResponse.json({ success: true, photoUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
