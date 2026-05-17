import { NextResponse, type NextRequest } from "next/server";

/**
 * Standalone single-operator gate.
 * Никаких ролей/подписок/paywall — только наличие валидной cookie-сессии.
 * API-роуты проверяют сессию сами (resolve-session / getUserIdFromSession).
 *
 * // STUB: owner-panel — заменить на middleware панели владельца.
 */

const LOGIN_PATH = "/auth/login";
const HOME_PATH = "/avito";

// Доступно без авторизации
const publicRoutes = [LOGIN_PATH, "/api/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API — пропускаем (роуты сами валидируют сессию)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const session = request.cookies.get("session");
  const isPublic = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublic) {
    // Уже авторизован и идёт на логин → на дашборд
    if (session?.value && pathname === LOGIN_PATH) {
      return NextResponse.redirect(new URL(HOME_PATH, request.url));
    }
    return NextResponse.next();
  }

  // Защищённый роут без сессии → на логин
  if (!session?.value) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Сессия есть, но битая → чистим и на логин
  try {
    JSON.parse(Buffer.from(session.value, "base64").toString());
  } catch {
    const response = NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    response.cookies.set("session", "", { maxAge: 0, path: "/" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
