import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Извлекает userId из session cookie
 */
export function getUserIdFromSession(request: NextRequest): string | null {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    return sessionData.userId || null;
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
  const accountIndex = parseInt(request.nextUrl.searchParams.get("accountIndex") || "1", 10);

  if (isNaN(accountIndex) || accountIndex < 1 || accountIndex > 3) {
    return NextResponse.json({ error: "Невалидный accountIndex (1-3)" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Проверяем лимит аккаунтов
  const { data: user } = await supabase
    .from("users")
    .select("avito_account_limit, subscription_tier, is_vibe_plus")
    .eq("id", userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (user.subscription_tier !== "top_floor_boss" && !user.is_vibe_plus) {
    return NextResponse.json(
      { error: "Доступно только для подписки Top Floor Boss" },
      { status: 403 }
    );
  }

  if (accountIndex > (user.avito_account_limit || 1)) {
    return NextResponse.json(
      { error: `Аккаунт ${accountIndex} недоступен. Ваш лимит: ${user.avito_account_limit}` },
      { status: 403 }
    );
  }

  // Получаем session
  const { data: session } = await supabase
    .from("avito_browser_sessions")
    .select("id, user_id, account_index, avito_client_id, avito_client_secret, avito_user_id")
    .eq("user_id", userId)
    .eq("account_index", accountIndex)
    .single();

  if (!session) {
    // Нет сессии для этого account_index — это ОК, вернём пустую
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
    userId,
    accountIndex: session.account_index,
    avitoClientId: session.avito_client_id,
    avitoClientSecret: session.avito_client_secret,
    avitoUserId: session.avito_user_id,
  };
}
