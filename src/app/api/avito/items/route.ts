import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(1).max(50).default(20),
  status: z.string().optional(),
});

// GET — объявления из кеша
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({
        items: [],
        pagination: { page: 1, per_page: 20, total: 0, totalPages: 0 },
      });
    }

    const supabase = createServiceClient();

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      per_page: searchParams.get("per_page") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const from = (params.page - 1) * params.per_page;
    const to = from + params.per_page - 1;

    let query = supabase
      .from("avito_items")
      .select("*", { count: "exact" })
      .eq("session_id", session.id)
      .order("synced_at", { ascending: false });

    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data: items, count, error } = await query.range(from, to);

    if (error) {
      console.error("Avito items fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    // Подтягиваем привязки к продуктам через маппинг
    let enrichedItems = items || [];
    if (enrichedItems.length > 0) {
      const avitoItemIds = enrichedItems.map((i) => i.avito_item_id);

      const { data: mappings } = await supabase
        .from("avito_item_product_mapping")
        .select("avito_item_id, product_id, products(name, photo_urls, photo_main_index)")
        .eq("user_id", userId)
        .in("avito_item_id", avitoItemIds);

      if (mappings?.length) {
        const mappingMap = new Map(
          mappings.map((m) => {
            const product = m.products as unknown as {
              name: string;
              photo_urls: string[] | null;
              photo_main_index: number | null;
            } | null;
            const photoUrl = product?.photo_urls?.length
              ? product.photo_urls[product.photo_main_index ?? 0] || product.photo_urls[0]
              : null;
            return [
              m.avito_item_id,
              {
                product_id: m.product_id,
                product_name: product?.name || null,
                product_photo_url: photoUrl,
              },
            ];
          })
        );

        enrichedItems = enrichedItems.map((item) => {
          const linked = mappingMap.get(item.avito_item_id);
          return {
            ...item,
            product_id: linked?.product_id || null,
            product_name: linked?.product_name || null,
            product_photo_url: linked?.product_photo_url || null,
          };
        });
      } else {
        enrichedItems = enrichedItems.map((item) => ({
          ...item,
          product_id: null,
          product_name: null,
          product_photo_url: null,
        }));
      }
    }

    return NextResponse.json({
      items: enrichedItems,
      pagination: {
        page: params.page,
        per_page: params.per_page,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.per_page),
      },
    });
  } catch (error) {
    console.error("Avito items error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
