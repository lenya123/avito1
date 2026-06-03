#!/bin/bash
set -e

DIR=/opt/avito-autopost

# 1. Заменить getUserIdFromSession в resolve-session.ts
cat > $DIR/src/lib/avito/resolve-session.ts << 'TSEOF'
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/auth/jwt";

/**
 * Извлекает userId из JWT session cookie (партнёрский формат).
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
TSEOF
echo "+ resolve-session.ts patched"

# 2. Во всех файлах где `getUserIdFromSession(request)` без await — добавить await
echo "=== patching $(grep -rln getUserIdFromSession $DIR/src/app/api/ | wc -l) files ==="
for f in $(grep -rln "getUserIdFromSession" $DIR/src/app/api/); do
  # const userId = getUserIdFromSession(request) → const userId = await getUserIdFromSession(request)
  sed -i 's/const userId = getUserIdFromSession(request);/const userId = await getUserIdFromSession(request);/g' "$f"
done
echo "done"
echo ""
echo "=== verify (no non-await calls left) ==="
grep -rln "const userId = getUserIdFromSession(request);" $DIR/src/app/api/ | wc -l
