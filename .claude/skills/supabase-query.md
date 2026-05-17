# Supabase Query Pattern

Паттерны работы с Supabase в проекте.

## Клиенты

```typescript
// API routes, Server Components — с cookie auth (RLS активен)
import { createClient } from "@/lib/supabase/server";
const supabase = createClient();

// API routes — service role, обходит RLS
import { createServiceClient } from "@/lib/supabase/server";
const supabase = createServiceClient();

// React Components — browser client
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

**Job handlers** — предпочитай обёртку `createServiceClient()`. Legacy-код может использовать raw SDK:

```typescript
// ✅ Рекомендуемый (sync-avito-data.ts и др.)
import { createServiceClient } from "@/lib/supabase/server";

// ⚠️ Legacy (aggregate-sales-stats.ts и др.)
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**Telegram-боты** — свой клиент: `createBotDbClient()` из `src/lib/telegram/db.ts`

## Базовые операции

```typescript
// SELECT
const { data, error } = await supabase
  .from("users")
  .select("id, name, email")
  .eq("role", "client")
  .order("created_at", { ascending: false });

// SELECT с count
const { data, error, count } = await supabase
  .from("orders")
  .select("*", { count: "exact" })
  .range(0, 19);

// INSERT
const { data, error } = await supabase
  .from("orders")
  .insert({ client_id: userId, product_id: productId, status: "pending" })
  .select()
  .single();

// UPDATE
const { error } = await supabase.from("users").update({ deposit: newDeposit }).eq("id", userId);

// DELETE
const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
```

## Фильтры

```typescript
.eq("status", "active")
.gte("price", 1000).lte("price", 5000)
.or("status.eq.pending,status.eq.processing")
.ilike("name", `%${search}%`)
.in("id", [1, 2, 3])
.not("deleted_at", "is", null)
```

## Пагинация

```typescript
const from = (page - 1) * limit;
const to = from + limit - 1;
const { data, count } = await supabase
  .from("products")
  .select("*", { count: "exact" })
  .range(from, to);
```

## Связанные таблицы

```typescript
const { data } = await supabase.from("orders").select(`
    id, status, created_at,
    product:products(id, title, image_url),
    client:users!client_id(id, name, telegram_username)
  `);
```

## Миграции и CLI

Проект слинкован с облачным Supabase. Локальный Supabase НЕ используется.

```bash
# Применить миграции — единственно правильный способ:
npx supabase db push --linked

# Создать миграцию:
# supabase/migrations/YYYYMMDDHHMMSS_описание.sql

# Сгенерировать типы:
npm run db:gen-types

# НЕ ДЕЛАТЬ:
# npm run db:migrate             — supabase migration up (локальный режим)
# supabase.rpc('exec_sql', ...) — нет такой RPC-функции
# fetch к REST API               — REST не поддерживает сырой SQL
```

### После изменения типов

1. Создай миграцию (ALTER TABLE)
2. Обнови `src/types/database.generated.ts` — Row, Insert, Update секции
3. `npm run build` — найдёт ВСЕ места, где код ломается из-за нового типа
4. Исправь ошибки (часто `.eq("id", value)` где value стал nullable)

## Seed-скрипты

Файлы: `scripts/seed*.ts`. Запуск: `npx tsx scripts/seed.ts`.

```typescript
// Seed-скрипты используют raw SDK (не обёртку проекта):
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**Правила seed:**

1. Перед вставкой — проверь данные. Не предполагай что таблица заполнена
2. Обратный JOIN для FK: `product_sizes` с JOIN на `products`, а не наоборот
3. Seed может запускаться повторно — учитывай FK-зависимости
4. Порядок удаления: orders → product_sizes → products

## Правила

1. **Всегда проверяй error** — `if (error) throw/return`
2. **Типизация** — Database типы из `@/types/database.generated`
3. **Service client** — для обхода RLS в API routes и jobs
4. **Anon client** — для клиентских запросов с RLS
5. **Миграции** — `npx supabase db push --linked` (не localhost)
6. **Nullable FK** — при `.eq("id", value)` если value может быть null, оборачивай в `if (value)`
7. **Проверяй состояние** — перед операцией убедись что данные в ожидаемом состоянии
