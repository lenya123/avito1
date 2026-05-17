import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { OPERATOR_USER_ID } from "@/lib/constants/operator";
import { mapOperatorUser } from "../login/route";

/**
 * Standalone: возвращает данные единственного оператора по сессии.
 * Логика подписок/paywall/автопродления удалена (не нужна для 1 оператора).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session");
    if (!sessionCookie?.value) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    let sessionData;
    try {
      sessionData = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    } catch {
      return NextResponse.json({ error: "Невалидная сессия" }, { status: 401 });
    }

    const userId = sessionData?.userId || OPERATOR_USER_ID;

    const supabase = createServiceClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !user) {
      const response = NextResponse.json({ error: "Оператор не найден" }, { status: 401 });
      response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return response;
    }

    return NextResponse.json({ user: mapOperatorUser(user) });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
