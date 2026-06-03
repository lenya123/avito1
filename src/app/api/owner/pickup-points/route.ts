import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";


/** GET — все активные пункты, опционально по сервису доставки */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deliveryService = searchParams.get("delivery_service");

    const supabase = createServiceClient();
    let query = supabase
      .from("pickup_points")
      .select("id, address, city, delivery_service")
      .eq("is_active", true)
      .order("delivery_service")
      .order("address");

    if (deliveryService) {
      query = query.eq("delivery_service", deliveryService);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Pickup points GET error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ points: data || [] });
  } catch (error) {
    console.error("Pickup points API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const createSchema = z.object({
  address: z.string().min(1, "Адрес обязателен"),
  city: z.string().min(1, "Город обязателен"),
  deliveryService: z.enum(["avito", "yandex", "cdek", "pochta", "5post"]),
});

/** POST — создать новый пункт */
export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = createSchema.parse(body);

    const supabase = createServiceClient();
    const { data: point, error } = await supabase
      .from("pickup_points")
      .insert({
        address: data.address,
        city: data.city,
        delivery_service: data.deliveryService,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Pickup point create error:", error);
      return NextResponse.json({ error: "Ошибка создания" }, { status: 500 });
    }

    return NextResponse.json({ success: true, point });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Pickup point create API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
