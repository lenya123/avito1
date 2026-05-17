#!/usr/bin/env npx tsx
/**
 * Bootstrap AI Sales Agent — выгрузка всех диалогов с Avito
 *
 * Запуск:
 *   npx tsx scripts/bootstrap-ai-sales.ts
 *
 * Что делает:
 *   1. Находит пользователя с Avito credentials в БД
 *   2. Загружает ВСЕ чаты через Avito API (пагинация по 100)
 *   3. Для каждого чата загружает сообщения
 *   4. Сохраняет в scripts/data/avito-dialogues.json
 *
 * Rate limits: 5с между запросами к Avito API
 * Примерное время: 500 чатов = ~40-80 минут
 */

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync, readFileSync } from "fs";

// Загружаем env
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AVITO_API = "https://api.avito.ru";
const DELAY_MS = 5000; // 5с между запросами
const OUTPUT_FILE = resolve(__dirname, "data/avito-dialogues.json");
const PROGRESS_FILE = resolve(__dirname, "data/avito-progress.json");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Avito API helpers ---

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const response = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

async function avitoGet<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${AVITO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GET ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Types ---

interface ExportedDialogue {
  chatId: string;
  buyerName: string;
  buyerAvitoId: number | null;
  itemTitle: string;
  itemPrice: number | null;
  itemUrl: string | null;
  messageCount: number;
  messages: Array<{
    direction: "in" | "out";
    text: string;
    type: string;
    time: string;
  }>;
}

interface Progress {
  completedChatIds: string[];
  dialogues: ExportedDialogue[];
}

// --- Main ---

async function main() {
  console.log("[bootstrap] Starting Avito dialogues export...\n");

  // 1. Найти пользователя с Avito credentials
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, avito_client_id, avito_client_secret, avito_user_id")
    .not("avito_client_id", "is", null)
    .not("avito_client_secret", "is", null)
    .not("avito_user_id", "is", null);

  if (error || !users?.length) {
    console.error("[bootstrap] No users with Avito credentials found:", error?.message);
    process.exit(1);
  }

  const user = users[0];
  console.log(`[bootstrap] User: ${user.name} (id: ${user.id})`);
  console.log(`[bootstrap] Avito User ID: ${user.avito_user_id}\n`);

  // 2. Авторизация
  const token = await getToken(user.avito_client_id, user.avito_client_secret);
  console.log("[bootstrap] Avito auth OK\n");

  // 3. Загрузить прогресс (для продолжения после сбоя)
  let progress: Progress = { completedChatIds: [], dialogues: [] };
  if (existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
      console.log(`[bootstrap] Resuming: ${progress.completedChatIds.length} chats already done\n`);
    } catch {
      console.log("[bootstrap] Could not read progress file, starting fresh\n");
    }
  }

  // 4. Загружаем все чаты (пагинация по 100)
  console.log("[bootstrap] Fetching all chats...");
  const allChats: Array<{
    id: string;
    users?: Array<{ id: number; name?: string }>;
    context?: { value?: { title?: string; price?: number; url?: string } };
  }> = [];

  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const freshToken = await getToken(user.avito_client_id, user.avito_client_secret);
    const data = await avitoGet<{
      chats: typeof allChats;
      meta?: { last_page?: boolean };
    }>(
      freshToken,
      `/messenger/v2/accounts/${user.avito_user_id}/chats?chat_types=u2i&limit=${limit}&offset=${offset}`
    );

    if (data.chats?.length) {
      allChats.push(...data.chats);
      console.log(`  fetched ${allChats.length} chats (offset=${offset})`);
    }

    hasMore = !data.meta?.last_page && (data.chats?.length ?? 0) === limit;
    offset += limit;

    if (hasMore) await delay(DELAY_MS);
  }

  console.log(`\n[bootstrap] Total chats: ${allChats.length}`);

  // Фильтруем уже обработанные
  const pendingChats = allChats.filter((c) => !progress.completedChatIds.includes(c.id));
  console.log(`[bootstrap] Pending: ${pendingChats.length} chats to process\n`);

  // 5. Для каждого чата загружаем сообщения
  let processed = 0;
  const total = pendingChats.length;

  for (const chat of pendingChats) {
    processed++;
    const pct = ((processed / total) * 100).toFixed(1);
    const chatId = chat.id;

    try {
      const freshToken = await getToken(user.avito_client_id, user.avito_client_secret);
      const messages = await avitoGet<
        Array<{
          id: string;
          author_id: number;
          created: number;
          type: string;
          content: { text?: string; image?: { url: string } };
          direction: "in" | "out";
        }>
      >(freshToken, `/messenger/v3/accounts/${user.avito_user_id}/chats/${chatId}/messages/`);

      const buyer = chat.users?.find((u) => u.id !== user.avito_user_id);
      const item = chat.context?.value;

      const dialogue: ExportedDialogue = {
        chatId,
        buyerName: buyer?.name || "Unknown",
        buyerAvitoId: buyer?.id || null,
        itemTitle: item?.title || "Unknown",
        itemPrice: item?.price ?? null,
        itemUrl: item?.url || null,
        messageCount: messages?.length || 0,
        messages: (messages || [])
          .filter((m) => m.type === "text" && m.content?.text)
          .map((m) => ({
            direction: m.direction,
            text: m.content.text!,
            type: m.type,
            time: new Date(m.created * 1000).toISOString(),
          }))
          .sort((a, b) => a.time.localeCompare(b.time)),
      };

      progress.dialogues.push(dialogue);
      progress.completedChatIds.push(chatId);

      const msgCount = dialogue.messages.length;
      console.log(
        `  [${pct}%] ${processed}/${total} | Chat ${chatId.slice(0, 8)}... | ` +
          `${buyer?.name || "?"} | "${item?.title?.slice(0, 30) || "?"}" | ${msgCount} msgs`
      );

      // Сохраняем прогресс каждые 10 чатов
      if (processed % 10 === 0) {
        writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        console.log(`  [progress saved: ${progress.dialogues.length} dialogues]\n`);
      }
    } catch (err) {
      console.error(`  ERROR chat ${chatId}:`, err instanceof Error ? err.message : err);
    }

    await delay(DELAY_MS);
  }

  // 6. Финальное сохранение
  writeFileSync(OUTPUT_FILE, JSON.stringify(progress.dialogues, null, 2));
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  // 7. Статистика
  const totalMessages = progress.dialogues.reduce((sum, d) => sum + d.messages.length, 0);
  const dialoguesWithMessages = progress.dialogues.filter((d) => d.messages.length > 0);
  const avgMessages = dialoguesWithMessages.length
    ? (totalMessages / dialoguesWithMessages.length).toFixed(1)
    : 0;

  console.log("\n========================================");
  console.log("[bootstrap] DONE!");
  console.log(`  Total dialogues: ${progress.dialogues.length}`);
  console.log(`  With messages:   ${dialoguesWithMessages.length}`);
  console.log(`  Total messages:  ${totalMessages}`);
  console.log(`  Avg messages:    ${avgMessages}`);
  console.log(`  Output:          ${OUTPUT_FILE}`);
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("[bootstrap] Fatal error:", err);
  process.exit(1);
});
