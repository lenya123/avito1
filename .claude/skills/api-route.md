# API Route Pattern

Паттерн для API routes в Next.js App Router.

## Авторизация

Shared хелпер: `src/lib/auth/session.ts`

```typescript
import {
  type SessionData,
  getSession,
  getOwnerSession,
  getShipperSession,
} from "@/lib/auth/session";

// SessionData = { userId: string; role: string; isVibePlus: boolean; subscriptionTier: string }

// Client routes — async, без параметров (читает cookies через next/headers)
const session = await getSession();

// Owner routes — sync, принимает NextRequest, проверяет role === "owner"
const session = getOwnerSession(request);

// Shipper routes — sync, принимает NextRequest, проверяет role === "shipper" | "owner"
const session = getShipperSession(request);
```

## Структура route

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";
import { z } from "zod";

// 1. Zod-схемы
const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.string().optional(),
});

const bodySchema = z.object({
  productId: z.string().uuid(),
  comment: z.string().max(60).optional(),
});

// 2. GET handler
export async function GET(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Query params через safeParse
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const result = querySchema.safeParse(params);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные параметры", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, status } = result.data;
    const supabase = createServiceClient();

    // Логика...
    const { data, error } = await supabase.from("table").select("*");

    if (error) {
      console.error("Error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// 3. POST handler
export async function POST(request: NextRequest) {
  try {
    const session = getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = bodySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Неверные данные", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, comment } = result.data;
    // ...
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
```

## Правила

1. **Zod + safeParse** — валидируй входные данные, возвращай `error.flatten()` при ошибке
2. **Try-catch** — оборачивай весь handler
3. **Логирование** — `console.error` для ошибок
4. **HTTP статусы** — 401 auth, 400 валидация, 403 доступ, 404 не найдено, 500 ошибка
5. **createServiceClient()** — для обхода RLS в API routes

## Путь файлов

```
src/app/api/[role]/[resource]/route.ts

Примеры:
  src/app/api/client/orders/route.ts      # getSession() — async
  src/app/api/owner/products/route.ts     # getOwnerSession(request) — sync
  src/app/api/shipper/returns/route.ts    # getShipperSession(request) — sync
  src/app/api/avito/chats/route.ts        # inline getUserIdFromSession (legacy)
```
