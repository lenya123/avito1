import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";
import {
  generateTitle,
  generateDescription,
  type ListingProductInput,
} from "@/lib/ai/listing-content";
import { z } from "zod";

const schema = z.object({
  productId: z.string().uuid().optional(),
  kind: z.enum(["title", "description", "both"]).default("both"),
  // Если товар не выбран — можно сгенерировать из переданных полей
  name: z.string().max(200).optional(),
});

// POST — сгенерировать название/описание (кнопка «сгенерировать»)
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }

    let p: ListingProductInput | null = null;
    if (parsed.data.productId) {
      const supabase = createServiceClient();
      // brand/measurements колонок нет в schema standalone-форка
      const { data: product } = await supabase
        .from("products")
        .select("name, description, category, drop_price")
        .eq("id", parsed.data.productId)
        .maybeSingle();
      if (product) {
        p = {
          name: product.name,
          description: product.description,
          brand: null,
          category: product.category,
          price: product.drop_price,
          measurements: null,
        };
      }
    }
    if (!p && parsed.data.name) p = { name: parsed.data.name };
    if (!p) return NextResponse.json({ error: "Выберите товар" }, { status: 400 });

    const result: { title?: string; description?: string } = {};
    if (parsed.data.kind === "title" || parsed.data.kind === "both") {
      result.title = await generateTitle(p);
    }
    if (parsed.data.kind === "description" || parsed.data.kind === "both") {
      result.description = await generateDescription(p);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("avito post generate error:", e);
    return NextResponse.json({ error: "Ошибка генерации" }, { status: 500 });
  }
}
