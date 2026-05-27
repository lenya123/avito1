import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

/**
 * GET /api/avito/accounts
 * Список Avito аккаунтов (сессий) пользователя + лимит
 */
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Получаем лимит. subscription_tier/is_vibe_plus отсутствуют в standalone-форке,
    // поэтому запрашиваем только то что реально есть в схеме.
    const { data: user } = await supabase
      .from("users")
      .select("avito_account_limit")
      .eq("id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    // Получаем все сессии пользователя
    const { data: sessions } = await supabase
      .from("avito_browser_sessions")
      .select(
        "id, account_index, avito_client_id, avito_user_id, status, last_sync_at, error_message"
      )
      .eq("user_id", userId)
      .order("account_index", { ascending: true });

    const accounts = (sessions || []).map((s) => ({
      id: s.id,
      accountIndex: s.account_index,
      hasCredentials: !!(s.avito_client_id && s.avito_user_id),
      sessionStatus: s.status,
      lastSyncAt: s.last_sync_at,
      errorMessage: s.error_message,
    }));

    return NextResponse.json({
      accounts,
      limit: user.avito_account_limit ?? 0,
      subscriptionTier: null,
    });
  } catch (error) {
    console.error("[avito/accounts GET] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
