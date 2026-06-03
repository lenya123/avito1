# Развёртывание клиента

> **Заглушка.** Детальный чеклист заполняется в Этапе 8 (коробочность и онбординг). Текущая запись нужна, чтобы CLAUDE.md и handoff ссылались на существующий файл.

## Опорные шаги (как будет выглядеть)

1. **Supabase-проект**: создать отдельный проект на оптовика (single-tenant). Получить URL, anon key, service role key, session pooler URL для тестов.
2. **Миграции**: `npm run db:migrate` против нового проекта — применит всю цепочку `supabase/migrations/`.
3. **Env-переменные**: заполнить `.env.local` по шаблону `.env.example` (Supabase, Session, Redis, Telegram-боты, Sentry, Track.global).
4. **Telegram-боты**: создать owner-bot + shipper-bot через BotFather, получить токены, настроить webhook-и с `TELEGRAM_WEBHOOK_SECRET` (см. `docs/TELEGRAM_SETUP.md`). Customer-bot появится после Этапа 3.
5. **Первый owner-пользователь**: вставить запись `users` с `role='owner'`, `telegram_id` из настоящего TG-аккаунта владельца.
6. **Vercel-деплой**: подключить репо, прокинуть env-переменные, задеплоить. Выставить `NEXT_PUBLIC_APP_URL` на прод-домен.
7. **Railway-воркер**: развернуть `scripts/worker.ts` как фоновый процесс, прокинуть `REDIS_URL` и Supabase env. `AVITO_ENABLED=false` до Этапа 9.
8. **Sentry**: создать проект, вставить DSN в env. `NEXT_PUBLIC_TENANT_ID` — короткий идентификатор инсталляции, теги событий.
9. **Проверка**: открыть `/owner/login`, авторизоваться, пройти чеклист первой конфигурации.

## Пока Этап 8 не реализован

Развёртывание идёт вручную. Пошаговая инструкция, скрипт bootstrap нового клиента и seed демо-данных — в бэклоге Этапа 8.

---

## Telegram-боты: dev vs prod

Проект содержит 4 бота: `customer`, `partner`, `owner`, `shipper`. Логика
хендлеров (`src/lib/telegram/bots/*.ts`) одна и та же в обоих режимах,
разница только в способе получения апдейтов от Telegram.

| Режим            | Запуск                                                   | Когда          |
| ---------------- | -------------------------------------------------------- | -------------- |
| **Long polling** | `scripts/dev-bots.ts` (process сам ходит в Telegram)     | dev (локально) |
| **Webhook**      | `/api/telegram/<bot>` Next.js-роут (Telegram пушит туда) | prod (Vercel)  |

Telegram допускает на каждый токен **только один режим одновременно**.
Поэтому:

- `dev-bots.ts` на старте вызывает `deleteWebhook(drop_pending_updates=true)`
  — снимает webhook у токена и забирает апдейты в polling.
- После prod-деплоя нужно один раз вернуть webhook через
  `npm run webhooks:set <base-url>`.

### Dev-flow (повседневный)

```bash
npm run dev:all
```

Запускает в одном терминале три процесса:

- `next dev` (порт 3000),
- `npm run worker:dev` (BullMQ),
- `npm run dev:bots` (4 бота в polling).

Меняешь код — оба `tsx watch` процесса (worker + bots) перезапускаются.
Никакого туннеля и ручной установки webhook'ов не нужно.

### Prod-flow (после деплоя)

1. **Деплой** — `vercel --prod` или git push в main (если CI настроен).
2. **Установка webhook'ов** — один раз:
   ```bash
   npm run webhooks:set https://yourshop.vercel.app
   ```
3. **Проверка** — пингуешь любого бота в Telegram, в Vercel-логах видны
   POST-запросы на `/api/telegram/<bot>`.

### Когда перезапускать `webhooks:set`

- После смены кастомного домена.
- После ротации `TELEGRAM_WEBHOOK_SECRET`.
- После dev-сессии с polling на **тех же токенах**, что в prod (polling
  перетянул апдейты на себя; нужно вернуть webhook на prod-URL).

### Dev-токены vs prod-токены

**Рекомендация:** завести в BotFather **отдельный комплект 4 ботов**
для prod, чтобы dev-сессии не задевали prod. Dev-токены — в `.env.local`,
prod-токены — в Vercel Environment Variables.

## RF-нюансы (deployment)

При деплое инсталляции для российского владельца:

- **Vercel custom domains** периодически блокируются Роскомнадзором по IP.
  Дефолтный URL `*.vercel.app` обычно работает. Если нужен свой домен —
  ставить через Cloudflare-прокси.
- **OpenAI API** блокирует российские IP. На Vercel (US/EU) это не влияет,
  но при локальной отладке AI-фич нужен VPN.
- **Telegram Bot API** работает в РФ без ограничений.
