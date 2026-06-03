import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/auth/jwt";

/**
 * Извлекает userId из JWT session cookie (партнёрский формат).
 *
 * Кука — JWT HS256 (как ставит signSession в owner/shipper/partner-логине).
 * Проверка подписи и срока выполняется через verifySession (jose, jwtVerify) —
 * единый канон верификации. Async: вызывающие avito-роуты делают await.
 * Middleware пропускает /api/* без проверки, поэтому верификация обязана быть здесь.
 *
 * (Раньше парсил куку как base64-JSON — несовместимо с JWT-сессией, из-за чего
 *  все avito-роуты возвращали 401 живому пользователю и не проверяли подпись.)
 */
export async function getUserIdFromSession(request: NextRequest): Promise<string | null> {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;
  try {
    const data = await verifySession<{ userId?: string }>(sessionCookie.value);
    return data?.userId ?? null;
  } catch {
    return null;
  }
}

export interface ResolvedSession {
  id: string;
  userId: string;
  accountIndex: number;
  avitoClientId: string | null;
  avitoClientSecret: string | null;
  avitoUserId: number | null;
}

/**
 * Резолвит Avito session из запроса.
 * Читает ?accountIndex= (default 1), валидирует против avito_account_limit.
 * Возвращает session данные или NextResponse с ошибкой.
 */
export async function resolveSession(
  request: NextRequest,
  userId: string
): Promise<ResolvedSession | NextResponse> {
  const { searchParams } = new URL(request.url);
  const accountIndex = parseInt(searchParams.get("accountIndex") || "1", 10);
  if (isNaN(accountIndex) || accountIndex < 1) {
    return NextResponse.json({ error: "Неверный accountIndex" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Standalone-режим: subscription/vibe-проверка снята (один оператор имеет
  // полный доступ; колонки могут отсутствовать в прод-схеме).
  const { data: user } = await supabase
    .from("users")
    .select("avito_account_limit")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (accountIndex > (user.avito_account_limit || 1)) {
    return NextResponse.json(
      { error: `Аккаунт ${accountIndex} недоступен. Ваш лимит: ${user.avito_account_limit}` },
      { status: 403 }
    );
  }

  // Получаем session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error } = await (supabase as any)
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, avito_client_id, avito_client_secret, avito_user_id")
    .eq("user_id", userId)
    .eq("account_index", accountIndex)
    .maybeSingle();

  if (error) {
    console.error("[resolveSession] DB error:", error);
    return NextResponse.json({ error: "Ошибка БД" }, { status: 500 });
  }

  if (!session) {
    // Сессии нет — это нормально (новый аккаунт), возвращаем заглушку
    return {
      id: "",
      userId,
      accountIndex,
      avitoClientId: null,
      avitoClientSecret: null,
      avitoUserId: null,
    };
  }

  return {
    id: session.id,
    userId: session.user_id,
    accountIndex: session.account_index,
    avitoClientId: session.avito_client_id,
    avitoClientSecret: session.avito_client_secret,
    avitoUserId: session.avito_user_id,
  };
}
