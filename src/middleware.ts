import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/jwt";

// Публичные роуты (доступны без авторизации)
const publicRoutes = [
  "/",
  "/catalog",
  "/shipper/login",
  "/api/shipper/auth/login",
  "/owner/login",
  "/api/owner/auth/login",
];

type SessionPayload = {
  userId: string;
  role: string;
  session_epoch?: number;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Все API-роуты пропускаем — у них свои session-checks внутри
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Публичные роуты — пропускаем
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // Проверяем сессию
  const sessionCookie = request.cookies.get("session");

  const redirectToLogin = () => {
    if (pathname.startsWith("/shipper")) {
      const loginUrl = new URL("/shipper/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (pathname.startsWith("/owner")) {
      const loginUrl = new URL("/owner/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.redirect(new URL("/", request.url));
  };

  if (!sessionCookie?.value) {
    return redirectToLogin();
  }

  const sessionData = await verifySession<SessionPayload>(sessionCookie.value);
  if (!sessionData) {
    console.warn("[middleware] session verify failed", { pathname });
    const response = redirectToLogin();
    response.cookies.set("session", "", { maxAge: 0, path: "/" });
    return response;
  }

  const { role } = sessionData;

  if (pathname.startsWith("/shipper")) {
    if (role !== "shipper" && role !== "owner" && role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (pathname.startsWith("/owner")) {
    if (role !== "owner" && role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
