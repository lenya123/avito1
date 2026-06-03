import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";

const createSchema = z
  .object({
    kind: z.enum(["card", "sbp", "ip_qr"]),
    label: z.string().min(1).max(100),
    cardNumberFull: z.string().max(32).nullable().optional(),
    holderName: z.string().max(255).nullable().optional(),
    bankName: z.string().max(100).nullable().optional(),
    sbpPhone: z.string().max(32).nullable().optional(),
    ipName: z.string().max(255).nullable().optional(),
    qrStoragePath: z.string().max(500).nullable().optional(),
    monthlyLimit: z.number().min(0).nullable().optional(),
    isActive: z.boolean().default(true),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  })
  .refine(
    (d) => {
      if (d.kind === "card") {
        const digits = (d.cardNumberFull ?? "").replace(/[^0-9]/g, "");
        return digits.length >= 12 && !!d.holderName?.trim() && !!d.bankName?.trim();
      }
      if (d.kind === "sbp") {
        return !!d.sbpPhone?.trim() && !!d.holderName?.trim() && !!d.bankName?.trim();
      }
      if (d.kind === "ip_qr") return !!d.qrStoragePath && !!d.ipName?.trim();
      return false;
    },
    { message: "Заполните все обязательные поля для выбранного типа" }
  );

// GET — список всех методов, отсортированных по sort_order.
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const supabase = createServiceClient();
    const yearMonth = new Date().toISOString().slice(0, 7);

    const [{ data: methods, error }, { data: stats }] = await Promise.all([
      supabase
        .from("payment_methods")
        .select(
          "id, kind, label, card_number_full, card_number_last4, holder_name, bank_name, sbp_phone, ip_name, qr_storage_path, monthly_limit, is_active, tier, created_at, updated_at"
        )
        .order("tier", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("payment_method_month_stats")
        .select("payment_method_id, amount_used")
        .eq("year_month", yearMonth),
    ]);

    if (error) {
      console.error("Payment methods fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const statsMap = new Map(
      (stats || []).map((s) => [s.payment_method_id, Number(s.amount_used) || 0])
    );

    return NextResponse.json({
      methods: (methods || []).map((m) => ({
        id: m.id,
        kind: m.kind,
        label: m.label,
        cardNumberFull: m.card_number_full,
        cardLast4: m.card_number_last4,
        holderName: m.holder_name,
        bankName: m.bank_name,
        sbpPhone: m.sbp_phone,
        ipName: m.ip_name,
        qrStoragePath: m.qr_storage_path,
        monthlyLimit: m.monthly_limit != null ? Number(m.monthly_limit) : null,
        amountUsedThisMonth: statsMap.get(m.id) ?? 0,
        isActive: m.is_active,
        tier: (m.tier ?? 1) as 1 | 2 | 3,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
    });
  } catch (error) {
    console.error("Payment methods API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const body = await request.json();
    const data = createSchema.parse(body);

    const supabase = createServiceClient();

    const { data: created, error } = await supabase
      .from("payment_methods")
      .insert({
        kind: data.kind,
        label: data.label,
        card_number_full: data.cardNumberFull ?? null,
        holder_name: data.holderName ?? null,
        bank_name: data.bankName ?? null,
        sbp_phone: data.sbpPhone ?? null,
        ip_name: data.ipName ?? null,
        qr_storage_path: data.qrStoragePath ?? null,
        monthly_limit: data.monthlyLimit ?? null,
        is_active: data.isActive,
        tier: data.tier,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("Payment method create error:", error);
      return NextResponse.json({ error: "Ошибка создания" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: created.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Payment method POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
