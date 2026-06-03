import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifySession } from "./jwt";
import { createServiceClient } from "@/lib/supabase/server";

export type SessionData = {
  userId: string;
  role: string;
  session_epoch?: number;
  [key: string]: unknown;
};

async function decode(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null;
  return await verifySession<SessionData>(token);
}

/**
 * Валидация сессии через БД: проверяет, что пользователь не заблокирован
 * и session_epoch совпадает с актуальным. Fail-closed: при ошибке БД возвращает false.
 */
async function validateSessionAgainstDb(session: SessionData): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("users")
      .select("is_blocked, session_epoch")
      .eq("id", session.userId)
      .single();
    if (!data) return false;
    if (data.is_blocked) return false;
    const dbEpoch = data.session_epoch ?? 0;
    const tokenEpoch = session.session_epoch ?? 0;
    if (dbEpoch !== tokenEpoch) return false;
    return true;
  } catch (e) {
    console.error("[session] validateSessionAgainstDb error — fail-closed:", {
      userId: session.userId,
      role: session.role,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const session = await decode(cookieStore.get("session")?.value);
  if (!session) return null;
  if (!(await validateSessionAgainstDb(session))) return null;
  return session;
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null> {
  const session = await decode(request.cookies.get("session")?.value);
  if (!session) return null;
  if (!(await validateSessionAgainstDb(session))) return null;
  return session;
}

export async function getOwnerSession(request: NextRequest): Promise<SessionData | null> {
  const session = await getSessionFromRequest(request);
  if (!session) return null;
  if (session.role !== "owner" && session.role !== "admin") return null;
  return session;
}

export async function getShipperSession(request: NextRequest): Promise<SessionData | null> {
  const session = await getSessionFromRequest(request);
  if (!session) return null;
  if (session.role !== "shipper" && session.role !== "owner" && session.role !== "admin") {
    return null;
  }
  return session;
}

export async function getAdminSession(request: NextRequest): Promise<SessionData | null> {
  const session = await getSessionFromRequest(request);
  if (!session || session.role !== "admin") return null;
  return session;
}
