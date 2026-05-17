import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShipperSession } from "@/lib/auth/session";
import { z } from "zod";

const createPickupPointSchema = z.object({
  delivery_service: z.string().min(1),
  address: z.string().min(1).max(500),
  city: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { delivery_service, address, city } = createPickupPointSchema.parse(body);

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("pickup_points")
      .insert({ delivery_service, address, city: city || null, is_active: true })
      .select()
      .single();

    if (error) {
      console.error("Create pickup point error:", error);
      return NextResponse.json({ error: "Ошибка создания ПВЗ" }, { status: 500 });
    }

    return NextResponse.json({ pickupPoint: data });
  } catch (error) {
    console.error("Create pickup point error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const deliveryService = searchParams.get("delivery_service");

    const supabase = createServiceClient();

    let query = supabase.from("pickup_points").select("*").eq("is_active", true).order("address");

    if (deliveryService) {
      query = query.eq("delivery_service", deliveryService);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Pickup points error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ pickupPoints: data });
  } catch (error) {
    console.error("Pickup points error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const deletePickupPointSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = getShipperSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = deletePickupPointSchema.parse(body);

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("pickup_points")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      console.error("Delete pickup point error:", error);
      return NextResponse.json({ error: "Ошибка удаления ПВЗ" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete pickup point error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
