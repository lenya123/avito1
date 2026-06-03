/**
 * GET /api/owner/partners/[id] — детали партнёра + товары (через bindings) + заказы
 *   + долги в обе стороны (я должен партнёру / партнёр должен мне).
 * PATCH /api/owner/partners/[id] — обновить name / tg_username / is_active / notes
 *   / warehouse_city / accepts_vibe_debt.
 * DELETE /api/owner/partners/[id] — деактивировать (soft — is_active=false).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  tgUsername: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_]+$/)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  warehouseCity: z.string().trim().min(1, "Город склада обязателен").max(64).optional(),
  acceptsVibeDebt: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: partner, error } = await supabase
    .from("partners")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !partner) {
    return NextResponse.json({ error: "Партнёр не найден" }, { status: 404 });
  }

  // Товары через лестницу (bindings) — уникальные product_id.
  const { data: bindings } = await supabase
    .from("product_partner_bindings")
    .select(
      "id, product_id, priority, warehouse_kind, commission, products!inner(id, name, drop_price, is_active, is_in_stock)"
    )
    .eq("partner_id", id)
    .is("deleted_at", null)
    .order("priority", { ascending: true });

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, client_price, partner_commission_snapshot, partner_payment_received_at, partner_commission_paid_at, tracking_number, created_at"
    )
    .eq("partner_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  // partner_owner_debts (2026-05-26): таблица перестала быть авторитетной
  // для commission-долгов (canonical = orders, см. §10.4). Здесь оставлены
  // только записи с reason != 'partner_commission' — manual-корректировки
  // владельца + legacy compensation-записи до G.5 (size_out_money_received/
  // product_out_money_received-flow выпилен). На новых заказах больше не
  // создаются автоматически — только если владелец вручную добавит.
  const { data: debts } = await supabase
    .from("partner_owner_debts")
    .select("id, order_id, pending_id, amount, reason, created_at, settled_at")
    .eq("partner_id", id)
    .is("settled_at", null)
    .neq("reason", "partner_commission")
    .order("created_at", { ascending: false });

  const ordersList = orders ?? [];
  // Канонический долг партнёра перед владельцем (§10.4):
  // комиссия по заказам status='sent', payment_received, не paid_at.
  // Партнёр-бот считает так же — числа не расходятся.
  const partnerOwesOwner = ordersList
    .filter(
      (o) => o.status === "sent" && o.partner_payment_received_at && !o.partner_commission_paid_at
    )
    .reduce((sum, o) => sum + Number(o.partner_commission_snapshot ?? 0), 0);

  const otherDebts = (debts ?? []).reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  type BindingProduct = {
    id: string;
    name: string;
    drop_price: number | string;
    is_active: boolean;
    is_in_stock: boolean;
  };
  const productsMap = new Map<
    string,
    {
      id: string;
      name: string;
      dropPrice: number;
      isActive: boolean;
      isInStock: boolean;
      bindings: Array<{
        bindingId: string;
        priority: number;
        warehouseKind: string;
        commission: number;
      }>;
    }
  >();
  for (const b of bindings ?? []) {
    const p = b.products as unknown as BindingProduct | null;
    if (!p) continue;
    let entry = productsMap.get(p.id);
    if (!entry) {
      entry = {
        id: p.id,
        name: p.name,
        dropPrice: Number(p.drop_price),
        isActive: p.is_active,
        isInStock: p.is_in_stock,
        bindings: [],
      };
      productsMap.set(p.id, entry);
    }
    entry.bindings.push({
      bindingId: b.id,
      priority: b.priority,
      warehouseKind: b.warehouse_kind,
      commission: Number(b.commission ?? 0),
    });
  }

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: partner.name,
      tgUsername: partner.tg_username,
      tgUserId: partner.tg_user_id,
      inviteToken: partner.invite_token,
      isActive: partner.is_active,
      notes: partner.notes,
      warehouseCity: partner.warehouse_city,
      acceptsVibeDebt: partner.accepts_vibe_debt,
      createdAt: partner.created_at,
      isLinked: !!partner.tg_user_id,
    },
    products: Array.from(productsMap.values()),
    orders: ordersList.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      clientPrice: Number(o.client_price),
      commissionSnapshot:
        o.partner_commission_snapshot != null ? Number(o.partner_commission_snapshot) : null,
      partnerPaymentReceivedAt: o.partner_payment_received_at,
      partnerCommissionPaidAt: o.partner_commission_paid_at,
      trackingNumber: o.tracking_number,
      createdAt: o.created_at,
    })),
    debts: (debts ?? []).map((d) => ({
      id: d.id,
      orderId: d.order_id,
      pendingId: d.pending_id,
      amount: Number(d.amount),
      reason: d.reason,
      createdAt: d.created_at,
    })),
    partnerOwesOwner,
    otherDebts,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.tgUsername !== undefined) update.tg_username = body.tgUsername;
  if (body.isActive !== undefined) update.is_active = body.isActive;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.warehouseCity !== undefined) {
    update.warehouse_city = body.warehouseCity;
  }
  if (body.acceptsVibeDebt !== undefined) update.accepts_vibe_debt = body.acceptsVibeDebt;

  const { error } = await supabase.from("partners").update(update).eq("id", id);
  if (error) {
    console.error("partner patch failed:", error);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "partner_update",
    entity_type: "partner",
    entity_id: id,
    details: update as Record<string, string | null>,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase.from("partners").update({ is_active: false }).eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Не удалось деактивировать" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "partner_deactivate",
    entity_type: "partner",
    entity_id: id,
    details: {},
  });

  return NextResponse.json({ success: true });
}
