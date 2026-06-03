#!/usr/bin/env node
// Идемпотентный runner: применяет новые миграции на тестовую БД из .env.test.
// Отслеживает применённые файлы в таблице _test_migrations. Запускается
// автоматически перед `npm run test:rls`, поэтому при добавлении новой
// миграции в supabase/migrations/ ничего руками делать не надо.

import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

config({ path: join(projectRoot, ".env.test") });

const URL = process.env.TEST_DATABASE_URL;
if (!URL) {
  console.error("ERROR: TEST_DATABASE_URL not set in .env.test");
  process.exit(1);
}

const sql = postgres(URL, {
  max: 1,
  connect_timeout: 30,
  idle_timeout: 30,
  prepare: false,
});

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public._test_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = new Set(
    (await sql`SELECT name FROM public._test_migrations`).map((r) => r.name)
  );

  const dir = join(projectRoot, "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`[test-migrations] ${files.length} files, nothing to apply`);
    process.exit(0);
  }

  console.log(`[test-migrations] applying ${pending.length} new migrations:`);
  for (const f of pending) {
    process.stdout.write(`  ${f} ... `);
    const content = readFileSync(join(dir, f), "utf8");
    // Transaction: migration SQL + bookkeeping row commit or roll back together.
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public._test_migrations (name) VALUES (${f})`;
      });
      console.log("ok");
    } catch (e) {
      console.log("FAIL");
      console.error(`  ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`[test-migrations] done`);
} finally {
  await sql.end();
}
