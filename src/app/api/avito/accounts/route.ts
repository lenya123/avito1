import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

/**
 * GET /api/avito/accounts
 * Список Avito аккаунтов (сессий) пользователя + лимит
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Получаем все сессии — display_name (кастомное от владельца), shop_name
    // (из Avito API), avito_login для отображения в свитчере.
    const { data: sessions } = await supabase
      .from("avito_browser_sessions")
      .select(
        "id, account_index, avito_client_id, avito_user_id, avito_login, display_name, shop_name, status, last_sync_at, error_message"
      )
      .eq("user_id", userId)
      .order("account_index", { ascending: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (sessions || []).map((s: any) => ({
      id: s.id,
      accountIndex: s.account_index,
      // hasCredentials в standalone-форке = есть avito_login для HTTP-login
      // (старое OAuth поле avito_client_id остаётся для обратной совместимости).
      hasCredentials: !!(s.avito_login || (s.avito_client_id && s.avito_user_id)),
      sessionStatus: s.status,
      lastSyncAt: s.last_sync_at,
      errorMessage: s.error_message,
      displayName: s.display_name ?? null,
      shopName: s.shop_name ?? null,
      avitoLogin: s.avito_login ?? null,
    }));

    // Лимит снят: динамически отдаём «подключённых + 1» с минимумом 10,
    // чтобы в UI всегда был свободный слот для нового аккаунта.
    const limit = Math.max(accounts.length + 1, 10);

    return NextResponse.json({
      accounts,
      limit,
      subscriptionTier: null,
    });
  } catch (error) {
    console.error("[avito/accounts GET] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
