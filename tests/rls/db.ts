import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.test") });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error("TEST_DATABASE_URL is not set. Create .env.test with Session pooler URL.");
}

export const db = postgres(url, {
  max: 4,
  connect_timeout: 30,
  idle_timeout: 60,
  prepare: false,
});

type Sql = postgres.Sql;

export async function withSellerContext<T>(uuid: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const reserved = await db.reserve();
  try {
    await reserved.unsafe("BEGIN");
    await reserved.unsafe("SET LOCAL ROLE authenticated");
    const claims = JSON.stringify({ sub: uuid, role: "authenticated" });
    await reserved.unsafe(`SET LOCAL "request.jwt.claims" TO '${claims}'`);
    return await fn(reserved as unknown as Sql);
  } finally {
    try {
      await reserved.unsafe("ROLLBACK");
    } catch {}
    reserved.release();
  }
}

export async function asSuperuser<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return await fn(db);
}
