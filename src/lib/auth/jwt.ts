import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const SECRET = process.env.SESSION_SECRET;

if (!SECRET) {
  throw new Error("SESSION_SECRET is not set in environment");
}

const secretKey = new TextEncoder().encode(SECRET);

export async function signSession(
  payload: Record<string, unknown>,
  expiresInSeconds: number
): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey);
}

export async function verifySession<T = Record<string, unknown>>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
}
