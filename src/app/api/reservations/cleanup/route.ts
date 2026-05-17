import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

const cleanupSchema = z.object({
  reservationId: z.string().uuid(),
});

// POST /api/reservations/cleanup — cleanup reservation (used by sendBeacon)
export async function POST(request: NextRequest) {
  try {
    // sendBeacon отправляет как text/plain, обрабатываем оба варианта
    const contentType = request.headers.get("content-type") || "";
    let body: unknown;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
    }

    const result = cleanupSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { reservationId } = result.data;
    const supabase = createServiceClient();

    // Атомарно: удаляем резерв и получаем product_size_id / product_id
    // DELETE с RETURNING гарантирует что мы обработаем только если реально удалили
    const { data: deletedReservation } = await supabase
      .from("size_reservations")
      .delete()
      .eq("id", reservationId)
      .select("product_size_id, product_id")
      .single();

    if (!deletedReservation) {
      // Уже удалён или не было — это нормально
      return NextResponse.json({ success: true });
    }

    // Атомарный декремент reserved_quantity через RPC (добавлен в миграции 20260220000003)
    if (deletedReservation.product_size_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("decrement_reserved_quantity_safe", {
        target_size_id: deletedReservation.product_size_id,
      });
    } else if (deletedReservation.product_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)("decrement_reserved_quantity_safe", {
        target_product_id: deletedReservation.product_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cleanup reservation error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
