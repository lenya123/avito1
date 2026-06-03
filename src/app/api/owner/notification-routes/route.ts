/**
 * GET   /api/owner/notification-routes — текущий маппинг тип→получатель.
 * PATCH /api/owner/notification-routes — обновляет один или несколько ключей.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_ROUTE_DEFAULTS,
  NOTIFICATION_ROUTE_LABELS,
  type NotificationRouteKey,
} from "@/lib/telegram/notifications";

const ROUTE_KEYS = Object.keys(NOTIFICATION_ROUTE_LABELS) as NotificationRouteKey[];

export async function GET(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("notification_routes")
    .limit(1)
    .maybeSingle();

  const stored = (settings?.notification_routes ?? {}) as Record<string, string>;

  const routes: Record<NotificationRouteKey, "owner" | "director"> = {
    ...NOTIFICATION_ROUTE_DEFAULTS,
  };
  for (const key of ROUTE_KEYS) {
    const value = stored[key];
    if (value === "owner" || value === "director") {
      routes[key] = value;
    }
  }

  return NextResponse.json({
    routes,
    labels: NOTIFICATION_ROUTE_LABELS,
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updates: Record<string, "owner" | "director"> = {};
  for (const key of ROUTE_KEYS) {
    const v = body[key];
    if (v === "owner" || v === "director") {
      updates[key] = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нет валидных полей" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("id, notification_routes")
    .limit(1)
    .maybeSingle();

  if (!settings) {
    return NextResponse.json({ error: "business_settings не найдены" }, { status: 500 });
  }

  const merged: Record<string, "owner" | "director"> = {
    ...NOTIFICATION_ROUTE_DEFAULTS,
    ...((settings.notification_routes ?? {}) as Record<string, "owner" | "director">),
    ...updates,
  };

  const { error } = await supabase
    .from("business_settings")
    .update({ notification_routes: merged })
    .eq("id", settings.id);

  if (error) {
    console.error("[notification-routes] update failed:", error);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }

  return NextResponse.json({ routes: merged });
}
