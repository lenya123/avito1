import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export type SessionData = {
  userId: string;
  role: string;
  isVibePlus: boolean;
  subscriptionTier: string;
};

/**
 * Получить сессию из cookies().
 * Используется в client API routes (без NextRequest).
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const decoded = Buffer.from(sessionCookie.value, "base64").toString("utf-8");
    return JSON.parse(decoded) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Получить сессию из request.cookies.
 * Используется в API routes с NextRequest (shipper, owner).
 */
export function getSessionFromRequest(request: NextRequest): SessionData | null {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const decoded = Buffer.from(sessionCookie.value, "base64").toString("utf-8");
    return JSON.parse(decoded) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Получить сессию владельца (role === "owner").
 */
export function getOwnerSession(request: NextRequest): SessionData | null {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== "owner") return null;
  return session;
}

/**
 * Получить сессию отправщика (role === "shipper" или "owner").
 */
export function getShipperSession(request: NextRequest): SessionData | null {
  const session = getSessionFromRequest(request);
  if (!session || (session.role !== "shipper" && session.role !== "owner")) return null;
  return session;
}
