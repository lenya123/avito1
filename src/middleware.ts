import { NextResponse, type NextRequest } from "next/server";

// Публичные роуты (доступны без авторизации)
const publicRoutes = [
  "/",
  "/auth/login",
  "/api/auth/login",
  "/shipper/login",
  "/api/shipper/auth/login",
  "/owner/login",
  "/api/owner/auth/login",
];

// Роуты по ролям
const roleRoutes: Record<string, string[]> = {
  client: [
    "/catalog",
    "/order",
    "/orders",
    "/stats",
    "/profile",
    "/favorites",
    "/education",
    "/support",
  ],
  shipper: ["/shipper"],
  owner: ["/owner"],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Пропускаем API роуты (кроме защищённых клиентских)
  // Но всегда пропускаем API подписки (нужен до активации)
  if (pathname.startsWith("/api/client/subscription")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/client/")) {
    return NextResponse.next();
  }

  // Публичные роуты — пропускаем
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    // Если пользователь авторизован и идёт на логин — редирект на каталог
    const session = request.cookies.get("session");
    if (session && pathname === "/auth/login") {
      return NextResponse.redirect(new URL("/catalog", request.url));
    }
    return NextResponse.next();
  }

  // Проверяем сессию
  const sessionCookie = request.cookies.get("session");

  if (!sessionCookie?.value) {
    // Не авторизован — редирект на логин
    // Для shipper — своя страница логина
    if (pathname.startsWith("/shipper")) {
      const loginUrl = new URL("/shipper/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Для owner — своя страница логина
    if (pathname.startsWith("/owner")) {
      const loginUrl = new URL("/owner/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Декодируем сессию
  let sessionData;
  try {
    sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
  } catch {
    // Невалидная сессия — на логин
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.set("session", "", { maxAge: 0, path: "/" });
    return response;
  }

  const { role, subscriptionTier, subscriptionEnd, isVibePlus } = sessionData;

  // Проверяем доступ по роли
  // Клиентские роуты
  if (roleRoutes.client.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    if (role !== "client" && role !== "owner") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Paywall: клиент без активной подписки → страница paywall
    if (role === "client" && pathname !== "/subscribe") {
      const hasActiveSubscription =
        isVibePlus ||
        (subscriptionTier &&
          subscriptionTier !== "none" &&
          // Если subscriptionEnd есть — проверяем дату; если нет (старая сессия) — считаем активной
          (!subscriptionEnd || new Date(subscriptionEnd) > new Date()));

      if (!hasActiveSubscription) {
        return NextResponse.redirect(new URL("/subscribe", request.url));
      }
    }
  }

  // /subscribe — доступна только авторизованным клиентам (paywall)
  if (pathname === "/subscribe") {
    if (role !== "client") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Роуты отправщика
  if (pathname.startsWith("/shipper")) {
    if (role !== "shipper" && role !== "owner") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Роуты владельца
  if (pathname.startsWith("/owner")) {
    if (role !== "owner") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
