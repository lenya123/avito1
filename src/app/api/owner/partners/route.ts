/**
 * GET /api/owner/partners — список партнёров с агрегатами:
 *  - количество товаров
 *  - сумма «не оплаченной владельцу» комиссии (orders с
 *    partner_payment_received_at IS NOT NULL AND partner_commission_paid_at IS NULL).
 *
 * POST /api/owner/partners — создать партнёра.
 *  Body: { name, tgUsername?, notes? }.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  tgUsername: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_]+$/, "Только латиница/цифры/подчёркивание")
    .optional()
    .or(z.literal("")),
  warehouseCity: z.string().trim().min(1, "Город склада обязателен").max(64),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function GET(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: partners, error } = await supabase
    .from("partners")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("partners list error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }

  // Aggregate counts/debts по каждому партнёру.
  const partnerIds = (partners ?? []).map((p) => p.id);

  let productCounts: Record<string, number> = {};
  let partnerOwesOwner: Record<string, number> = {};

  if (partnerIds.length > 0) {
    const [{ data: bindingsList }, { data: ordersList }] = await Promise.all([
      supabase
        .from("product_partner_bindings")
        .select("partner_id, product_id")
        .in("partner_id", partnerIds)
        .is("deleted_at", null),
      // Канонический долг партнёра перед владельцем (§10.4): комиссия
      // по заказам status='sent', payment_received, не paid_at. Единый
      // источник истины — orders; partner_owner_debts больше НЕ
      // используется для commission-долгов (2026-05-26).
      supabase
        .from("orders")
        .select("partner_id, partner_commission_snapshot")
        .in("partner_id", partnerIds)
        .eq("status", "sent")
        .not("partner_payment_received_at", "is", null)
        .is("partner_commission_paid_at", null),
    ]);

    // Уникальные товары на партнёра.
    const productSets = new Map<string, Set<string>>();
    (bindingsList ?? []).forEach((row) => {
      const id = row.partner_id;
      if (!id) return;
      let set = productSets.get(id);
      if (!set) {
        set = new Set();
        productSets.set(id, set);
      }
      set.add(row.product_id);
    });
    productCounts = Object.fromEntries(
      Array.from(productSets.entries()).map(([id, set]) => [id, set.size])
    );

    partnerOwesOwner = (ordersList ?? []).reduce<Record<string, number>>((acc, row) => {
      const id = row.partner_id;
      if (!id) return acc;
      acc[id] = (acc[id] ?? 0) + Number(row.partner_commission_snapshot ?? 0);
      return acc;
    }, {});
  }

  return NextResponse.json({
    partners: (partners ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      tgUsername: p.tg_username,
      tgUserId: p.tg_user_id,
      inviteToken: p.invite_token,
      isActive: p.is_active,
      notes: p.notes,
      warehouseCity: p.warehouse_city,
      acceptsVibeDebt: p.accepts_vibe_debt,
      isLinked: !!p.tg_user_id,
      productCount: productCounts[p.id] ?? 0,
      partnerOwesOwner: partnerOwesOwner[p.id] ?? 0,
      createdAt: p.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    throw error;
  }

  const supabase = createServiceClient();

  const { data: partner, error } = await supabase
    .from("partners")
    .insert({
      name: body.name,
      tg_username: body.tgUsername ? body.tgUsername : null,
      warehouse_city: body.warehouseCity,
      notes: body.notes ? body.notes : null,
    })
    .select("*")
    .single();

  if (error || !partner) {
    console.error("partner create failed:", error);
    return NextResponse.json({ error: "Не удалось создать партнёра" }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    user_id: session.userId,
    action: "partner_create",
    entity_type: "partner",
    entity_id: partner.id,
    details: { name: partner.name },
  });

  return NextResponse.json({ partner: { id: partner.id, inviteToken: partner.invite_token } });
}
