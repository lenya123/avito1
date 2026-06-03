/**
 * GET  /api/owner/director-link  — текущая ссылка-приглашение директора
 *                                    + статус привязки.
 * POST /api/owner/director-link  — регенерация invite-токена. Опционально
 *                                    сбрасывает текущую привязку (если
 *                                    body.unlink === true), чтобы новый
 *                                    директор смог привязаться по новой ссылке.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

function buildInviteUrl(token: string | null): string | null {
  if (!token) return null;
  const username = process.env.TELEGRAM_DIRECTOR_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username.replace(/^@/, "")}?start=${token}`;
}

export async function GET(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("director_invite_token, director_tg_user_id, director_tg_username, director_linked_at")
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    inviteUrl: buildInviteUrl(settings?.director_invite_token ?? null),
    inviteToken: settings?.director_invite_token ?? null,
    isLinked: !!settings?.director_tg_user_id,
    directorTgUsername: settings?.director_tg_username ?? null,
    directorLinkedAt: settings?.director_linked_at ?? null,
    botConfigured: !!process.env.TELEGRAM_DIRECTOR_BOT_USERNAME,
  });
}

export async function POST(request: NextRequest) {
  const session = await getOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const unlink = body.unlink === true;

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("business_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!settings) {
    return NextResponse.json({ error: "business_settings не настроены" }, { status: 500 });
  }

  // Generate new UUID-like token via DB default. Проще — крутим через crypto.
  const newToken = crypto.randomUUID();

  const update: Record<string, unknown> = { director_invite_token: newToken };
  if (unlink) {
    update.director_tg_user_id = null;
    update.director_tg_username = null;
    update.director_linked_at = null;
  }

  const { error } = await supabase.from("business_settings").update(update).eq("id", settings.id);

  if (error) {
    console.error("[director-link] regenerate failed:", error);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }

  return NextResponse.json({
    inviteUrl: buildInviteUrl(newToken),
    inviteToken: newToken,
    unlinked: unlink,
  });
}
