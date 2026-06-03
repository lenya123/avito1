import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/jwt";
import { createServiceClient } from "@/lib/supabase/server";

type SessionPayload = { userId: string; role: string };

export async function POST(request: NextRequest) {
  // Инкремент session_epoch инвалидирует украденные/дублированные JWT
  const token = request.cookies.get("session")?.value;
  if (token) {
    try {
      const session = await verifySession<SessionPayload>(token);
      if (session?.userId) {
        const supabase = createServiceClient();
        await supabase.rpc("increment_user_session_epoch", { p_user_id: session.userId });
      }
    } catch (e) {
      console.warn("[logout] failed to increment session_epoch:", e);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
