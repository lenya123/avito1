import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptPassword } from "@/lib/avito/crypto";
import { scheduleAvitoLogin } from "@/lib/jobs/queues";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

const connectSchema = z.object({
  login: z.string().min(1, "Логин обязателен"),
  password: z.string().min(1, "Пароль обязателен"),
  accountIndex: z.number().int().min(1).max(3).optional(),
});

// POST — подключить Avito аккаунт
// Правило безопасности: без свободного прокси сессия НЕ создаётся.
// При мультиаккаунтинге без прокси Avito блокирует аккаунты.
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { login, password, accountIndex = 1 } = parsed.data;
    const supabase = createServiceClient();

    // Проверяем подписку и лимит аккаунтов
    const { data: user } = await supabase
      .from("users")
      .select("subscription_tier, is_vibe_plus, avito_account_limit")
      .eq("id", userId)
      .single();

    if (!user || (user.subscription_tier !== "top_floor_boss" && !user.is_vibe_plus)) {
      return NextResponse.json({ error: "Доступно только для Top Floor Boss" }, { status: 403 });
    }

    if (accountIndex > (user.avito_account_limit || 1)) {
      return NextResponse.json(
        { error: `Аккаунт ${accountIndex} недоступен. Ваш лимит: ${user.avito_account_limit}` },
        { status: 403 }
      );
    }

    // Проверяем: есть ли уже прокси у этой сессии
    const { data: existingSession } = await supabase
      .from("avito_browser_sessions")
      .select("id, proxy_url")
      .eq("user_id", userId)
      .eq("account_index", accountIndex)
      .maybeSingle();

    let proxyUrl: string | null = existingSession?.proxy_url ?? null;

    if (!proxyUrl) {
      // Ищем прокси уже назначенный этому пользователю
      const { data: existingProxy } = await supabase
        .from("avito_proxies")
        .select("proxy_url")
        .eq("assigned_to", userId)
        .eq("is_active", true)
        .maybeSingle();
      proxyUrl = existingProxy?.proxy_url ?? null;

      if (!proxyUrl) {
        // Берём первый свободный прокси
        // "Свободный" = is_active=true И proxy_url НЕ используется ни одной сессией
        const { data: allProxies } = await supabase
          .from("avito_proxies")
          .select("proxy_url")
          .eq("is_active", true);

        const { data: usedSessions } = await supabase
          .from("avito_browser_sessions")
          .select("proxy_url")
          .not("proxy_url", "is", null);

        const usedUrls = new Set((usedSessions ?? []).map((s) => s.proxy_url));
        const freeProxy = (allProxies ?? []).find((p) => !usedUrls.has(p.proxy_url));

        if (!freeProxy) {
          return NextResponse.json(
            {
              error:
                "Нет доступных прокси. Без прокси подключение невозможно — аккаунт будет заблокирован. Обратитесь к администратору.",
            },
            { status: 409 }
          );
        }

        proxyUrl = freeProxy.proxy_url;
      }
    }

    const passwordEnc = encryptPassword(password, userId);

    // Upsert сессии с прокси
    const { error: upsertError } = await supabase.from("avito_browser_sessions").upsert(
      {
        user_id: userId,
        account_index: accountIndex,
        avito_login: login,
        avito_password_enc: passwordEnc,
        cookies: [],
        proxy_url: proxyUrl,
        status: "pending",
        error_message: null,
        sms_code: null,
      },
      { onConflict: "user_id,account_index" }
    );

    if (upsertError) {
      console.error("[avito/session POST] Upsert error:", upsertError);
      return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
    }

    await scheduleAvitoLogin(userId, accountIndex);

    return NextResponse.json({ status: "connecting" });
  } catch (error) {
    console.error("[avito/session POST] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// GET — получить статус сессии (или всех сессий)
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const accountIndexParam = request.nextUrl.searchParams.get("accountIndex");

    if (accountIndexParam) {
      // Конкретный аккаунт
      const accountIndex = parseInt(accountIndexParam, 10);
      const { data: session } = await supabase
        .from("avito_browser_sessions")
        .select("status, last_login_at, last_sync_at, error_message, account_index, avito_login, proxy_url")
        .eq("user_id", userId)
        .eq("account_index", accountIndex)
        .single();

      if (!session) {
        return NextResponse.json({
          status: null,
          lastLoginAt: null,
          lastSyncAt: null,
          errorMessage: null,
          hasLogin: false,
          accountIndex,
          proxyHost: null,
          avitoLogin: null,
        });
      }

      // Извлекаем хост прокси (без логина/пароля)
      let proxyHost: string | null = null;
      if (session.proxy_url) {
        try {
          const url = new URL(session.proxy_url);
          proxyHost = `${url.hostname}:${url.port}`;
        } catch {
          proxyHost = session.proxy_url;
        }
      }

      return NextResponse.json({
        status: session.status,
        lastLoginAt: session.last_login_at,
        lastSyncAt: session.last_sync_at,
        errorMessage: session.error_message,
        hasLogin: !!session.avito_login,
        accountIndex: session.account_index,
        proxyHost,
        avitoLogin: session.avito_login,
      });
    }

    // Все сессии
    const { data: sessions } = await supabase
      .from("avito_browser_sessions")
      .select("status, last_login_at, last_sync_at, error_message, account_index, avito_login, proxy_url")
      .eq("user_id", userId)
      .order("account_index", { ascending: true });

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        status: null,
        lastLoginAt: null,
        lastSyncAt: null,
        errorMessage: null,
        hasLogin: false,
        proxyHost: null,
        avitoLogin: null,
      });
    }

    const first = sessions[0];
    let proxyHost: string | null = null;
    if (first.proxy_url) {
      try {
        const url = new URL(first.proxy_url);
        proxyHost = `${url.hostname}:${url.port}`;
      } catch {
        proxyHost = first.proxy_url;
      }
    }

    return NextResponse.json({
      status: first.status,
      lastLoginAt: first.last_login_at,
      lastSyncAt: first.last_sync_at,
      errorMessage: first.error_message,
      hasLogin: !!first.avito_login,
      accountIndex: first.account_index,
      proxyHost,
      avitoLogin: first.avito_login,
      sessions: sessions.map((s) => {
        let pHost: string | null = null;
        if (s.proxy_url) {
          try { const u = new URL(s.proxy_url); pHost = `${u.hostname}:${u.port}`; } catch { pHost = s.proxy_url; }
        }
        return {
          status: s.status,
          lastLoginAt: s.last_login_at,
          lastSyncAt: s.last_sync_at,
          errorMessage: s.error_message,
          hasLogin: !!s.avito_login,
          accountIndex: s.account_index,
          proxyHost: pHost,
          avitoLogin: s.avito_login,
        };
      }),
    });
  } catch (error) {
    console.error("[avito/session GET] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// DELETE — отключить сессию (прокси и fingerprint сохраняются навсегда)
export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const accountIndex = parseInt(request.nextUrl.searchParams.get("accountIndex") || "1", 10);

    const supabase = createServiceClient();

    // Прокси НЕ освобождается — он навсегда привязан к аккаунту.
    // browser_fingerprint тоже сохраняется для консистентности при переподключении.
    await supabase
      .from("avito_browser_sessions")
      .update({
        cookies: [],
        status: "pending",
        error_message: null,
        last_login_at: null,
        last_sync_at: null,
        sms_code: null,
      })
      .eq("user_id", userId)
      .eq("account_index", accountIndex);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[avito/session DELETE] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
