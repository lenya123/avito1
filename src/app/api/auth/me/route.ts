import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { signSession, verifySession } from "@/lib/auth/jwt";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session");

    if (!sessionCookie?.value) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    let sessionData;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessionData = (await verifySession<any>(sessionCookie.value)) ?? {};
    } catch {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    const { userId } = sessionData;

    if (!userId) {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from("users")
      .select(
        "id, role, name, avatar_url, telegram_username, is_blocked, blocked_reason, session_epoch"
      )
      .eq("id", userId)
      .single();

    if (error || !user) {
      const response = NextResponse.json({ error: "Пользователь не найден" }, { status: 401 });
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    if (user.is_blocked) {
      const response = NextResponse.json(
        { error: "Аккаунт заблокирован", reason: user.blocked_reason },
        { status: 403 }
      );
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    const tokenEpoch = Number(sessionData.session_epoch ?? 0);
    const dbEpoch = Number(user.session_epoch ?? 0);
    if (tokenEpoch !== dbEpoch) {
      const response = NextResponse.json({ error: "Сессия инвалидирована" }, { status: 401 });
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        role: user.role,
        name: user.name,
        avatarUrl: user.avatar_url || null,
        telegramUsername: user.telegram_username,
      },
    });

    // Переподписываем cookie чтобы продлить TTL (24 часа owner, остальное без изменений в структуре)
    const ttlSec = 24 * 60 * 60;
    const sessionToken = await signSession(
      { userId: user.id, role: user.role, session_epoch: user.session_epoch ?? 0 },
      ttlSec
    );
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ttlSec,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
