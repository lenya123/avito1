import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";

const patchSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  cardNumberFull: z.string().max(32).nullable().optional(),
  holderName: z.string().max(255).nullable().optional(),
  bankName: z.string().max(100).nullable().optional(),
  sbpPhone: z.string().max(32).nullable().optional(),
  ipName: z.string().max(255).nullable().optional(),
  qrStoragePath: z.string().max(500).nullable().optional(),
  monthlyLimit: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const data = patchSchema.parse(body);

    const update: Record<string, unknown> = {};
    if (data.label !== undefined) update.label = data.label;
    if (data.cardNumberFull !== undefined) update.card_number_full = data.cardNumberFull;
    if (data.holderName !== undefined) update.holder_name = data.holderName;
    if (data.bankName !== undefined) update.bank_name = data.bankName;
    if (data.sbpPhone !== undefined) update.sbp_phone = data.sbpPhone;
    if (data.ipName !== undefined) update.ip_name = data.ipName;
    if (data.qrStoragePath !== undefined) update.qr_storage_path = data.qrStoragePath;
    if (data.monthlyLimit !== undefined) update.monthly_limit = data.monthlyLimit;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    if (data.tier !== undefined) update.tier = data.tier;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase.from("payment_methods").update(update).eq("id", id);

    if (error) {
      console.error("Payment method update error:", error);
      return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Payment method PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const supabase = createServiceClient();

    // Hard-delete безопасен: payment_method_month_stats — ON DELETE CASCADE
    // (статистика помесячная нерелевантна без метода), vibe_payments —
    // ON DELETE SET NULL (история платежей сохранится без привязки).
    const { error } = await supabase.from("payment_methods").delete().eq("id", id);

    if (error) {
      console.error("Payment method delete error:", error);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment method DELETE error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
