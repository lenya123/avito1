import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

// =====================================================
// GET — список всех прокси с привязками
// =====================================================

export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: proxies, error } = await supabase
      .from("avito_proxies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Получаем сессии с привязанными прокси для отображения кому назначен
    const assignedProxyUrls = (proxies ?? [])
      .filter((p) => p.assigned_to)
      .map((p) => p.proxy_url);

    let sessionsMap = new Map<
      string,
      { user_id: string; account_index: number; avito_login: string | null; status: string }
    >();

    if (assignedProxyUrls.length > 0) {
      const { data: sessions } = await supabase
        .from("avito_browser_sessions")
        .select("proxy_url, user_id, account_index, avito_login, status")
        .in("proxy_url", assignedProxyUrls);

      if (sessions) {
        sessionsMap = new Map(
          sessions
            .filter((s): s is typeof s & { proxy_url: string } => s.proxy_url !== null)
            .map((s) => [s.proxy_url, s])
        );
      }
    }

    const result = (proxies ?? []).map((p) => {
      const assignedSession = sessionsMap.get(p.proxy_url);
      return {
        id: p.id,
        proxyUrl: p.proxy_url,
        isActive: p.is_active,
        assignedTo: p.assigned_to,
        assignedSession: assignedSession
          ? {
              userId: assignedSession.user_id,
              accountIndex: assignedSession.account_index,
              avitoLogin: assignedSession.avito_login,
              status: assignedSession.status,
            }
          : null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });

    const total = result.length;
    const free = result.filter((p) => p.isActive && !p.assignedTo).length;
    const assigned = result.filter((p) => !!p.assignedTo).length;
    const inactive = result.filter((p) => !p.isActive).length;

    return NextResponse.json({
      proxies: result,
      summary: { total, free, assigned, inactive },
    });
  } catch (error) {
    console.error("[owner/proxies GET]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// =====================================================
// POST — массовое добавление прокси
// =====================================================

const addProxiesSchema = z.object({
  // Принимает текст с прокси, по одному на строку
  // Форматы: ip:port:login:pass, login:pass@ip:port, http://login:pass@ip:port
  rawText: z.string().min(1, "Введите хотя бы один прокси"),
});

/**
 * Парсит строку прокси в стандартный формат http://login:pass@ip:port
 * Поддерживает:
 * - ip:port:login:pass
 * - ip:port:login:pass:protocol
 * - login:pass@ip:port
 * - http://login:pass@ip:port
 * - http://ip:port (без авторизации)
 * - ip:port
 */
function parseProxyLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return null;

  // Уже в формате http(s)://...
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      // Нормализуем в http://
      return `http://${url.username ? `${url.username}:${url.password}@` : ""}${url.hostname}:${url.port || "8080"}`;
    } catch {
      return null;
    }
  }

  // login:pass@ip:port
  if (trimmed.includes("@")) {
    const [auth, hostPort] = trimmed.split("@");
    if (auth && hostPort) {
      return `http://${auth}@${hostPort}`;
    }
    return null;
  }

  const parts = trimmed.split(":");
  if (parts.length === 4) {
    // ip:port:login:pass
    const [ip, port, login, pass] = parts;
    return `http://${login}:${pass}@${ip}:${port}`;
  }

  if (parts.length === 2) {
    // ip:port (без авторизации)
    return `http://${parts[0]}:${parts[1]}`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = addProxiesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const lines = parsed.data.rawText.split("\n");
    const parsedProxies: string[] = [];
    const failedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const proxyUrl = parseProxyLine(line);
      if (proxyUrl) {
        parsedProxies.push(proxyUrl);
      } else {
        failedLines.push(line.trim());
      }
    }

    if (parsedProxies.length === 0) {
      return NextResponse.json(
        { error: "Не удалось распознать ни одного прокси. Проверьте формат." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Вставляем, пропуская дубликаты (proxy_url UNIQUE)
    const rows = parsedProxies.map((url) => ({
      proxy_url: url,
      is_active: true,
    }));

    const { data, error } = await supabase
      .from("avito_proxies")
      .upsert(rows, { onConflict: "proxy_url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error("[owner/proxies POST]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      added: data?.length ?? 0,
      total: parsedProxies.length,
      duplicates: parsedProxies.length - (data?.length ?? 0),
      failed: failedLines,
    });
  } catch (error) {
    console.error("[owner/proxies POST]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// =====================================================
// DELETE — удалить прокси (только свободные)
// =====================================================

const deleteSchema = z.object({
  proxyId: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Невалидный ID" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Проверяем что прокси не назначен
    const { data: proxy } = await supabase
      .from("avito_proxies")
      .select("id, assigned_to")
      .eq("id", parsed.data.proxyId)
      .single();

    if (!proxy) {
      return NextResponse.json({ error: "Прокси не найден" }, { status: 404 });
    }

    if (proxy.assigned_to) {
      return NextResponse.json(
        { error: "Нельзя удалить назначенный прокси. Сначала отключите аккаунт." },
        { status: 409 }
      );
    }

    const { error } = await supabase.from("avito_proxies").delete().eq("id", parsed.data.proxyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[owner/proxies DELETE]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// =====================================================
// PATCH — переключить is_active
// =====================================================

export async function PATCH(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const { proxyId, isActive } = body;

    if (!proxyId || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "Невалидные параметры" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("avito_proxies")
      .update({ is_active: isActive })
      .eq("id", proxyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[owner/proxies PATCH]", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
