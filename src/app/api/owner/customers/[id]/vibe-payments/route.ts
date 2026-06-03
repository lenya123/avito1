import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

// GET /api/owner/customers/[id]/vibe-payments — история +ВАЙБ-платежей клиента.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: payments, error } = await supabase
      .from("vibe_payments")
      .select(
        "id, amount, received_at, confirmed_at, confirmed_by, receipt_file_url, payment_method_id, payment_method:payment_methods(id, label, kind, card_number_last4)"
      )
      .eq("customer_id", id)
      .order("received_at", { ascending: false });

    if (error) {
      console.error("Vibe payments fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({
      payments: (payments || []).map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        receivedAt: p.received_at,
        confirmedAt: p.confirmed_at,
        confirmedBy: p.confirmed_by,
        receiptFileUrl: p.receipt_file_url,
        paymentMethod: p.payment_method
          ? {
              id: p.payment_method.id,
              label: p.payment_method.label,
              kind: p.payment_method.kind,
              cardLast4: p.payment_method.card_number_last4,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Vibe payments API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
