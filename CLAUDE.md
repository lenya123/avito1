# AVITO-PROJECT

Автоматизация товарного бизнеса на Avito (дропшиппинг). Владелец продаёт одежду через AI-агент и дропшипперов (клиенты продают, мы отправляем).

## Стек

Frontend: Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion
Backend: Supabase (PostgreSQL + RLS + Realtime)
State: React Query + Zustand | Forms: React Hook Form + Zod
Очереди: BullMQ + Redis | Боты: Grammy | AI: OpenAI API
Дизайн: iOS 26 Liquid Glass Dark Mode

## Роли

- **Владелец** → `/owner/*` (dashboard, orders, products, clients, shippers, analytics)
- **Клиент** → `/catalog`, `/stats`, `/education`, `/support`, `/profile`, `/order/[productId]`
- **Отправщик** → `/shipper/*` PWA (ship, returns, stats, settings)

## Команды

```bash
npm run dev          # Dev-сервер
npm run build        # Сборка + проверка типов
npm run lint         # ESLint
npm run db:migrate   # Применить миграции
npm run db:gen-types # Сгенерировать типы
npm run worker:dev   # BullMQ worker
# Tunnel: npm run dev + /tmp/cloudflared tunnel --url http://localhost:3000
```

## Структура `src/`

```
app/           (client)/ · (owner)/owner/ · (shipper)/shipper/ · auth/ · subscribe/ · api/
components/    ui/ (14 шт.) · client/ (20 шт.) · owner/ (6 подпапок) · shipper/
               providers.tsx · viewport-scale.tsx
lib/           supabase/ · telegram/ (bots + notifications) · jobs/ (queues, worker, 9 handlers)
               delivery/ (Track.global: СДЭК, Почта, 5Post) · constants/ · ai/ · avito/
hooks/         use-auth · use-products · use-orders · use-stats · use-subscription
               use-owner-{dashboard,orders,products,clients,shippers,analytics}
               use-shipper-orders · use-avito · use-debounce · use-nav-click · use-notification-settings
stores/        Zustand: auth · owner-auth · shipper-auth · navigation
types/         database.generated.ts (авто) · database.ts (ручные)
utils/         cn.ts · pricing.ts
middleware.ts  Supabase auth
```

## Правила и стиль

- **Сначала план** для фич, **сразу делать** для багфиксов, **спрашивай** если не уверен
- Один запрос = одно качественное решение
- RLS обязателен · Zod везде · Строгий TypeScript · Транзакции для финансов
- BullMQ для автоматизаций (не cron) · Обновляй документацию сразу
- Handoff: обновляй по команде "обнови handoff" / "сессия закончена"

Соглашения: файлы `kebab-case.tsx` · компоненты `PascalCase` · функции `camelCase` · типы `PascalCase` · API `/api/[role]/[resource]`

## Создание новых страниц/элементов

**Перед созданием UI** прочитай `.claude/skills/page-creation.md` — там шаблон, чеклист и ссылки на все правила.

## Скиллы `.claude/skills/`

**Читай перед использованием инструмента:**
`playwright-browser` (браузер, UI) · `api-route` (API Routes) · `component-style` (UI компоненты) · `supabase-query` (БД, RLS, миграции) · `telegram-bot` (боты) · `page-creation` (шаблон новой страницы)

Веб-контент: сначала `WebSearch`/`WebFetch`, при неудаче → Playwright MCP (см. `playwright-browser.md`)

## Документация

Обновляй сразу при изменениях, не откладывай.

| Файл                     | Обновлять когда                 |
| ------------------------ | ------------------------------- |
| `docs/DATABASE.md`       | Таблицы, колонки, RLS, триггеры |
| `docs/BUSINESS_LOGIC.md` | Правила, скидки, уровни         |
| `docs/DESIGN_SYSTEM.md`  | Дизайн, компоненты, стили       |
| `docs/NAVIGATION.md`     | Страницы, URL                   |
| `.claude/skills/`        | Паттерны, подходы               |
| `.claude/handoff.md`     | Задачи, баги, контекст          |
| `CLAUDE.md` (Статус)     | Завершение модуля               |

## Ключевые файлы

| Файл                                 | Назначение                 |
| ------------------------------------ | -------------------------- |
| `src/utils/pricing.ts`               | Расчёт цен, скидок         |
| `src/lib/constants/subscriptions.ts` | Тарифы подписок            |
| `src/hooks/use-auth.ts`              | Авторизация                |
| `src/lib/jobs/queues.ts`             | BullMQ очереди             |
| `src/lib/delivery/client.ts`         | Track.global API (трекинг) |
| `src/lib/telegram/notifications.ts`  | Уведомления через ботов    |
| `src/types/database.ts`              | Ручные типы БД             |

## Статус

✅ Клиент · Отправщик · Владелец · Telegram · AI-поддержка · BullMQ
🔧 Доставка (трекинг) · Avito API
🔲 AI-агент продаж · Платежи ЮKassa
