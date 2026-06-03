import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";


/** GET — пункты, привязанные к городу (или все привязки) */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    const supabase = createServiceClient();

    let query = supabase
      .from("location_pickup_points")
      .select(
        "id, city, pickup_point_id, created_at, pickup_points(id, address, delivery_service, city)"
      )
      .order("city")
      .order("created_at");

    if (city) {
      query = query.eq("city", city);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Location pickup points GET error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    // Filter out entries where pickup point is inactive (deleted)
    const active = (data || []).filter(
      (item) => item.pickup_points && (item.pickup_points as Record<string, unknown>).id
    );

    const points = active.map((item) => {
      const pp = item.pickup_points as Record<string, unknown>;
      return {
        id: item.id,
        city: item.city,
        pickupPointId: pp.id as string,
        address: pp.address as string,
        deliveryService: pp.delivery_service as string,
      };
    });

    return NextResponse.json({ points });
  } catch (error) {
    console.error("Location pickup points API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const linkSchema = z.object({
  city: z.string().min(1, "Город обязателен"),
  pickupPointId: z.string().uuid("Неверный ID пункта"),
});

/** POST — привязать пункт к городу */
export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = linkSchema.parse(body);

    const supabase = createServiceClient();
    const { error } = await supabase.from("location_pickup_points").insert({
      city: data.city,
      pickup_point_id: data.pickupPointId,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Пункт уже привязан к этому городу" }, { status: 409 });
      }
      console.error("Location pickup point link error:", error);
      return NextResponse.json({ error: "Ошибка привязки" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Location pickup point link API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const deleteSchema = z.object({
  id: z.string().uuid("Неверный ID"),
});

/** DELETE — убрать привязку */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = deleteSchema.parse(body);

    const supabase = createServiceClient();
    const { error } = await supabase.from("location_pickup_points").delete().eq("id", data.id);

    if (error) {
      console.error("Location pickup point delete error:", error);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Location pickup point delete API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
