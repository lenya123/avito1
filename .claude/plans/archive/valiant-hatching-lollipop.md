# Этап 1.5 — Досборка пивота на B2B SaaS (закрытие пропусков)

## Контекст

Глубокий аудит Этапа 1 показал, что этап закрыт преждевременно. Формально билд зелёный и тесты проходят, но:

- **4 страницы панели владельца падают с 500** при открытии: «Клиенты», карточка клиента, виджет «долгов» в «Финансах», «Безопасность» — API обращается к колонкам, удалённым в stage1-миграциях (`is_vibe_plus`, `subscription_tier`, `deposit_limit`, `referral_code`, `referred_by`, `referral_deposit`, `vibe_plus_granted_at/by`).
- **Роль `admin` заявлена в функциях `is_admin()`, но пользователя с такой ролью создать нельзя** — CHECK-ограничение `users.role` допускает только `owner/shipper/client/seller`.
- **RLS на `product_sizes` потеряла политику SELECT** (упала каскадом при `DROP FUNCTION is_premium_client() CASCADE` в миграции `20260423000005`). Сейчас работает только через `service_role` — мина при переходе на `authenticated`.
- **`products` SELECT-политика сейчас только через `is_owner()`** (видит owner/admin, не видит shipper) — та же мина для PWA отправщика.
- **BullMQ-очередь содержит job-ы без обработчиков:** `build-seller-payouts` (`queues.ts:129`), `deactivate-referral` (`queues.ts:118`) — worker молча логирует «unknown job type».
- **`src/lib/telegram/db.ts:130`** обращается к удалённой таблице `referral_bonuses` + дёргает `scheduleDeactivateReferral` (`:11`). Упадёт при первом вызове соответствующей ветки.
- **`src/lib/jobs/queues.ts:94, 484–499`** — объявлен неиспользуемый тип `BuildSellerPayoutsJobData` и хелпер `scheduleDeactivateReferral`.
- **Секция «Реферальная программа» в `/owner/settings`** (page.tsx:~156–180) пишет несуществующие поля `referralFirstOrderBonus/referralPercent/referralPercentCap/referralPeriodDays`.
- **`src/types/database.generated.ts`** не перегенерирован после stage1-миграций — остались `get_seller_activity_log`, `get_seller_activity_recent_count`, устаревшая сигнатура `build_seller_payouts_for_period`.
- **`scripts/seed.ts`, `scripts/seed-analytics.ts`** ссылаются на удалённые колонки — упадут при запуске.
- **`users.goals` jsonb** (мигр. `20260421000002`) — мёртвое поле от селлерских целей, не используется.
- **Sentry клиентский init потенциально не срабатывает** — `sentry.client.config.ts` в корне, Next 14 + webpack-plugin должен подхватить, но есть deprecation warning. **Нужно фактически проверить** браузерным тестом.
- **Worker запускает Avito-джобы на старте** (`scripts/worker.ts`), хотя Avito-интеграция заморожена до Этапа 9.
- **Мёртвый код:** `src/stores/seller-auth-store.ts` (POST на удалённый `/api/seller/auth/login`), 5 UI-файлов с `role === "seller"` ветками, битая ссылка `/owner/sellers/[id]` в `top-sellers-card.tsx:137`, env-переменная `TELEGRAM_CLIENT_BOT_TOKEN` и её референс в `setup-webhooks.ts`.
- **Документация разъехалась:** `docs/DATABASE.md` под новым header сохранил старый текст; `CLAUDE.md` указывает на несуществующий путь плана `.claude/plans/dapper-hugging-wozniak.md`.
- **CI запускает только `npm run test:rls`** — нет build/e2e/type-check.
- **RLS-тесты покрывают только meta/shipper-ledger/shipper-payouts**; users/orders/products/product_sizes/settings не покрыты.

### Принятые решения (ответы пользователя)

- Битые страницы → **заглушка** «Переделываем в Этапе 2».
- Блокировка клиентов → **подождёт до Этапа 2** (в новой таблице `customers`).
- Ручная корректировка выплат отправщикам → **не нужна**.
- Поле `users.goals` → **удалить**.

### CHECK-ограничение роли — осторожный подход

Добавляем `'admin'`, оставляем `'client'/'seller'` в constraint. Это нужно чтобы:

- Не трогать существующие строки юзеров в prod (исторические client-ы, возможная техническая main-seller запись).
- Не ломать текущую RLS-фикстуру (placeholder `legacyClient` с `role='client'` для `orders.client_id NOT NULL`).
- Stage 2 (перенос клиентов в таблицу `customers` + замена `orders.client_id` на FK в `customers`) уже чисто удалит лишние роли.

### Про план плана

Файл `~/.claude/plans/dapper-hugging-wozniak.md` — roadmap пивота. Он живёт в глобальной машине, не в репо. На Фазе B **копируем его в `.claude/plans/` репозитория**, чтобы CLAUDE.md ссылался на реальный путь и следующий агент нашёл план сразу.

---

## Фазы

Три фазы. Каждая заканчивается коммитом и проверками: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:rls`, `npm run test:e2e`.

---

### Фаза A — Останавливаем кровотечение (1 день)

**Цель: панель владельца и воркер не крашатся, мёртвые ветки не падают, типы свежие.**

**A1. Миграция `supabase/migrations/20260424000001_stage1_5_admin_role_drop_goals.sql`**

- `ALTER TABLE users DROP CONSTRAINT users_role_check` → `ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'shipper', 'admin', 'client', 'seller'))`.
- `ALTER TABLE users DROP COLUMN IF EXISTS goals`.
- Комментарий с отсылкой к этому плану.

**A2. Миграция `supabase/migrations/20260424000002_stage1_5_rls_shipper_read.sql`**

Безусловные (идемпотентные) политики:

- `DROP POLICY IF EXISTS product_sizes_select ON product_sizes` + `CREATE POLICY product_sizes_select ON product_sizes FOR SELECT TO authenticated USING (public.is_shipper())`.
- `DROP POLICY IF EXISTS products_select ON products` + `CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (public.is_shipper())`.

`is_shipper()` после stage1 возвращает TRUE для `shipper/owner/admin` — одна политика покрывает всех.

**A3. Удаляем 3 битые страницы и их API целиком (не заглушаем — удаляем)**

Принцип: если страница отвечает за функционал, который полностью переделывается в Stage 2, её проще удалить сейчас и пересоздать в Stage 2, чем держать заглушку в коде.

Удалить:

- `src/app/(owner)/owner/clients/page.tsx` + `src/app/(owner)/owner/clients/[id]/page.tsx`.
- `src/app/(owner)/owner/security/page.tsx`.
- `src/app/api/owner/clients/route.ts` + `src/app/api/owner/clients/[id]/route.ts`.
- `src/app/api/owner/security/route.ts`.

Заменить в меню / навигации: пункты «Клиенты» и «Безопасность» → показывать компонент `<Stage2Placeholder title="..." description="..." />`. Если меню построено статическим списком в каком-то `nav-items.ts`, заменить href на `/owner/stage2-clients` и `/owner/stage2-security` (или просто оставить в меню как disabled и неактивный). Конкретный механизм — по месту при имплементации.

Компонент `src/components/shared/stage2-placeholder.tsx`:

- Принимает `title`, `description`.
- Карточка в стиле проекта: иконка, заголовок «Переделываем в Этапе 2», описание, пунктирная рамка.

Создать роутинг-заглушки (минимум кода):

- `src/app/(owner)/owner/clients/page.tsx` — одна строка: `export default function Page() { return <Stage2Placeholder title="Клиенты" description="Новая модель клиентов с +ВАЙБ-лимитом и группировкой платежей готовится к Этапу 2." />; }`.
- `src/app/(owner)/owner/clients/[id]/page.tsx` — аналогично.
- `src/app/(owner)/owner/security/page.tsx` — аналогично.

Итог: страницы рендерят placeholder, API не существует, ничего не крашится.

**A4. Финансы: обрезаем сломанный виджет долгов**

- `src/app/api/owner/finance/route.ts` — удалить ветку с выборкой `users.deposit_limit`, `users.is_vibe_plus`. Оставить: выручка, расходы, payout-суммы, прибыль. Снять `@ts-nocheck`.
- `src/app/(owner)/owner/finance/page.tsx` — удалить UI-блок «Долги клиентов». Вставить `<Stage2Placeholder />` inline на место блока — чтобы разметка не проседала.

**A5. Настройки: убираем «Реферальную программу»**

- `src/app/(owner)/owner/settings/page.tsx` — удалить форм-секцию `referralFirstOrderBonus/referralPercent/referralPercentCap/referralPeriodDays` и соответствующие Zod-поля в схеме.
- `src/app/api/owner/settings/route.ts` (если существует и принимает эти поля) — удалить их обработку.

**A6. Telegram DB: зачистка обращений к удалённому**

`src/lib/telegram/db.ts`:

- Прочитать файл целиком.
- Удалить функции, читающие/пишущие `referral_bonuses`.
- Удалить клиентские функции, обращающиеся к удалённым колонкам (`subscription_*`, `is_vibe_plus`, `deposit`, `notification_*`, `referral_code`).
- Оставить только то, что фактически дёргают `src/lib/telegram/bots/owner-bot.ts` и `shipper-bot.ts`. Узнаётся grep-ом импортов из `./db`.
- Снять `@ts-nocheck`.
- Удалить импорт `scheduleDeactivateReferral` (больше не нужен — удаляется в A7).

**A7. BullMQ: удаляем орфанные очереди**

`src/lib/jobs/queues.ts`:

- Удалить `BuildSellerPayoutsJobData`.
- Удалить `scheduleDeactivateReferral`.
- Удалить `"build-seller-payouts"` и `"deactivate-referral"` из union-типа `JobName`/`AutomationJobData`.
- Удалить все константы, ссылающиеся на эти job-ы.

`src/lib/jobs/index.ts`:

- Удалить экспорт `scheduleDeactivateReferral`.

`src/lib/jobs/worker.ts` и `handlers/`:

- Проверить что нет case/handler-ов для удаляемых job-ов. Если есть — удалить.

**A8. Avito-джобы — под env-флагом**

`scripts/worker.ts`:

- Обернуть вызовы `scheduleAvitoSync`, `scheduleAvitoOrdersSync`, `scheduleSalesLearning`, `scheduleSalesStatsAggregation` (и других avito/sales-агент-связанных шедулеров) в `if (process.env.AVITO_ENABLED === 'true')`.
- Оставить без изменений: sweep, tracking-polling, deadline-reminder, shipper-score-update, aggregate-sales-stats.

`.env.example`:

- Добавить `AVITO_ENABLED=false # Включается вместе с Этапом 9 (интеграция Avito)`.

**A9. Удалить мёртвые seed-скрипты**

Предварительно: `grep -r "scripts/seed\|scripts/update-test-orders" .` — убедиться, что нет cross-references из CI / package.json / docs.

- `rm scripts/seed.ts`.
- `rm scripts/seed-analytics.ts`.
- `rm scripts/update-test-orders.ts` и `scripts/update-test-orders.sql`.

Остальные скрипты (`cleanup-reservations.ts`, `process-expired-orders.ts`, `bootstrap-ai-sales.ts`, `apply-test-migrations.mjs`, `worker.ts`) — читаем поверхностно, если ссылаются на удалённые колонки — патчим; если нет — оставляем.

**A10. Регенерация типов базы**

- `npm run db:migrate` — применить миграции A1 и A2 на prod Supabase.
- `npm run db:gen-types` — обновить `src/types/database.generated.ts`.
- Проверить grep-ом в сгенерированном файле:
  - `get_seller_activity_log` → 0.
  - `get_seller_activity_recent_count` → 0.
  - `out_seller_id` в контексте `build_shipper_payouts_for_period` → 0.
  - `goals` (в таблице users) → 0.
- Проверить `src/types/database.ts` (ручные типы): если есть упоминания `SellerPayout`, `SellerLedger`, `SellerShipper`, `ReferralBonus`, `SubscriptionTier`, `ClientLevel` — удалить.

**A11. Sentry: верификация без правки кода**

Шаги в dev-среде (без изменений в коде кроме финального, если понадобится):

1. В `.env.local` выставить `NEXT_PUBLIC_SENTRY_DSN` и `SENTRY_DSN` (рабочий тестовый проект в Sentry).
2. `npm run dev` + открыть `http://localhost:3000`.
3. В консоли браузера выполнить: `Sentry.captureMessage("stage1.5 client test")`. Должно прийти событие в Sentry UI.
4. Если **не пришло** (объект `Sentry` не доступен в `window` или событие не появилось):
   - Создать `src/instrumentation-client.ts` с тем же содержимым что в `sentry.client.config.ts`.
   - Удалить `sentry.client.config.ts`.
   - Перезапустить dev и повторить шаг 3.
5. Для серверной проверки: `curl http://localhost:3000/api/auth/me` с намеренно некорректной сессией — ловим 401 (ожидаемо), плюс для теста добавить `throw` в любой API-route временно → события в Sentry. После проверки убрать throw.
6. Убрать `tunnelRoute: "/monitoring"` из `next.config.mjs` (маршрут не реализован, tunnel не нужен для нашего кейса).

### Проверка Фазы A

- `npx tsc --noEmit` — 0 ошибок.
- `npm run build` — exit 0.
- `npm run lint` — нет новых предупреждений.
- `npm run test:rls` — 22/22 (фикстуры не тронуты; `legacyClient` с role='client' остаётся валидным т.к. `'client'` сохранён в CHECK).
- `npm run test:e2e` — 5/5.
- `npm run dev` — поднимается. Кликнуть каждый пункт меню `/owner/*`: ни один не возвращает 500 (удалённые разделы показывают Stage2Placeholder, финансы — без блока долгов, настройки — без реферальной секции).
- `npm run worker:dev` с `AVITO_ENABLED=false`: стартует без ошибок, avito-джобы пропущены (визуально в логах).
- `grep -rn "referral_bonuses" src/` → 0.
- `grep -rn "scheduleDeactivateReferral\|BuildSellerPayoutsJobData" src/` → 0.
- `grep -rn "get_seller_activity_log\|out_seller_id" src/types/database.generated.ts` → 0.
- Sentry UI показывает тестовые события с клиента и сервера.

**Коммит Фазы A:** `chore(stage1.5): fix panel crashes, drop orphan queues, regen DB types, gate avito jobs`.

---

### Фаза B — Солидность QA/ops (1–1.5 дня)

**Цель: тесты покрывают каркас схемы, CI ловит регрессии, документация синхронна с кодом.**

**B1. RLS-тесты — расширение покрытия**

Новые файлы в `tests/rls/`:

- `users.test.ts` — owner видит всех юзеров; shipper видит только себя; INSERT/UPDATE только owner.
- `orders.test.ts` — owner видит все заказы; shipper видит заказы с допустимыми статусами (`awaiting_shipment/collecting/in_transit/return_in_transit/return_arrived`); shipper может UPDATE только в своих статусах.
- `products.test.ts` — owner может CRUD; shipper может SELECT (после A2); authenticated без роли — ничего.
- `product-sizes.test.ts` — после A2: shipper и owner видят; authenticated без роли — не видит.
- `settings.test.ts` — любой authenticated может SELECT; UPDATE только owner.

Фикстуру `tests/rls/fixtures.ts` дополнить: добавить `authenticatedNoRole` юзер (role не матчится ни с одной helper-функцией — например, `role='client'`, т.к. `'client'` не в `is_owner/is_shipper/is_admin`). Для `settings.test.ts` — вставить пару строк в `settings` через superuser.

**B2. Playwright: хелпер авторизации**

Текущий owner-логин идёт через Telegram Login Widget. Полный UI-логин в headless-Chromium без настоящего Telegram-аккаунта невозможен. Решение — **test-only session-injector**:

- Добавить в `src/middleware.ts` или в отдельный dev-only API route `src/app/api/_e2e/session/route.ts` возможность принимать cookie с тест-токеном в режиме `NODE_ENV !== 'production'` + `E2E_ALLOW_TEST_SESSION=1`.
- Альтернатива (проще): добавить `test-helpers/seed-session.ts` — Node-скрипт, который через `SESSION_SECRET` подписывает jwt и записывает его как cookie в `playwright context`.

Выбрать второй вариант (не трогаем прод-код).

`tests/e2e/fixtures.ts`:

- `loginAsOwner(context)` — подписывает jwt с тест-owner-id через `SESSION_SECRET` (из `.env.test`), устанавливает cookie `session` в `context`. Возвращает context.
- `loginAsShipper(context)` — аналогично с shipper-id.
- Требует наличия тест-юзеров в БД (добавить в `apply-test-migrations.mjs` или отдельный seed).

`tests/e2e/owner-smoke.spec.ts`:

- `beforeEach` — loginAsOwner.
- Пройти меню `/owner/{dashboard, products, orders, payouts, analytics, clients, finance, security, settings}` → для каждой страницы `expect(response.status()).toBeLessThan(400)` + `expect(page.locator('[data-testid="error-500"]')).not.toBeVisible()`.

`tests/e2e/shipper-smoke.spec.ts`:

- Аналогично по меню shipper.

Если сложность session-injector-а превышает 0.5 дня — оставить B2 как TODO на Этап 7 (полировка панели), в этой фазе сделать только SEO/headers smoke на публичных роутах.

**B3. CI расширение — `.github/workflows/ci.yml`**

Новый workflow (триггер: PR на `main`/`owner`):

- Job `build`: `npm ci` + `npm run build`.
- Job `types`: `npx tsc --noEmit`.
- Job `lint`: `npm run lint` — без `--max-warnings=0` (текущий код содержит ~10 warning-ов про `<img>` и `useEffect deps`, fixить их не в этом этапе). Warning-и логируются, build не валится.
- Job `e2e`: `npm run test:e2e` — запускается только на push в `main` (в PR — медленно).

Существующий `test-rls.yml` оставить без изменений.

Добавить бейджи в README (если README есть).

**B4. Документация**

- `docs/DATABASE.md` — **переписать тело полностью**. Структура:
  1. Роли и `is_*()`-хелперы.
  2. Таблицы с колонками: `users`, `products`, `product_sizes`, `orders`, `payments`, `shipper_ledger_entries`, `shipper_payout_periods`, `settings`, `suppliers`, `pickup_points`, `expenses`, `activity_log`, `notifications`, `size_reservations`.
  3. Триггеры (`shipper_ledger_on_order_completed`, `update_updated_at`, `trigger_update_quantity`, `generate_site_key`, `trigger_product_arrival`).
  4. RPC (`mark_shipper_payout_paid`, `cancel_shipper_payout`, `build_shipper_payouts_for_period`, `create_product_with_sizes`, `cancel_order_auto`, `update_shipper_scores`).
  5. RLS — матрица «какая роль видит что».
  6. Stage 2 дополнит: `customers`, `business_settings`, `order_messages`, `customer_conversations`, `product_variants`, `vibe_payments`, `data_imports`.
     Объём ~250–300 строк. Удалить из старого тела всё про `seller_*`, `referral_bonuses`, `subscription`, `deposit`, `level`, `referral`.

- **Скопировать план пивота в репо:** `cp ~/.claude/plans/dapper-hugging-wozniak.md .claude/plans/dapper-hugging-wozniak.md`. Дальше CLAUDE.md ссылается на реальный репо-путь.

- `CLAUDE.md` — ссылка на `.claude/plans/dapper-hugging-wozniak.md` теперь валидна (файл скопирован).

- `docs/DEPLOYMENT.md` — stub: «Чеклист развёртывания нового клиента. Заполняется в Этапе 8. Опорные точки: Supabase проект → миграции → env-переменные → Telegram-боты → первый owner-пользователь.»

- `docs/TELEGRAM_SETUP.md` — stub: «Инструкция по созданию 2 ботов (owner-bot, shipper-bot; customer-bot появится в Этапе 3) и подключению webhook с secret-token. Заполняется в Этапе 8.»

- `.claude/handoff.md`:
  - Обновить секцию «Этап 1» — заменить на «Этап 1.5 — завершено» с перечнем того что добавлено в этой итерации.
  - Добавить секцию «Запуск с нуля»: для `.env.local` — список обязательных переменных со ссылкой на `.env.example` как на канонический источник; для `.env.test` — `TEST_DATABASE_URL` (Session pooler URL Supabase); плюс опциональные (`SENTRY_DSN`, `AVITO_ENABLED`, `E2E_*`).
  - В «Остался технический долг» — обновить список: убрать пункты, закрытые этой итерацией.

- `.claude/skills/` — пройти по `page-creation.md`, `api-route.md`, `supabase-query.md`, `component-style.md`, `telegram-bot.md`. Убрать упоминания `(seller)/`, `(client)/`, мульти-селлер паттерна, `seller_id`-фильтров. Если скилл целиком устарел — пометить «устарело, обновится в Stage 2» или удалить.

### Проверка Фазы B

- `npm run test:rls` — ~40+ тестов, все проходят.
- `npm run test:e2e` — smoke + owner-smoke + shipper-smoke проходят.
- CI на PR запускает build + types + lint + rls, зелёное.
- CI на push в main дополнительно гоняет e2e, зелёное.
- `grep -rn "seller_shippers\|referral_bonuses\|subscription_tier" docs/` → 0 (кроме упоминаний «удалено в Stage 1» в историческом контексте).
- `.claude/plans/dapper-hugging-wozniak.md` в репо существует.
- `CLAUDE.md` ссылка на план открывается.
- `.claude/handoff.md` актуален, «Запуск с нуля» — с env-список.

**Коммит Фазы B:** `test(stage1.5): RLS + e2e coverage, CI build+lint gate, rewrite DATABASE.md, sync plan into repo`.

---

### Фаза C — Зачистка мёртвого кода (0.5 дня)

**Цель: `grep "role === \"seller\"" src/` и `grep "subscription_tier\|is_vibe_plus" src/` — максимум 1–2 легитимных хита (shim + возможно ai-sales.ts).**

**C1. UI-компоненты с seller-ветками — упрощаем до owner-only**

- `src/components/shared/dashboard/dashboard-page.tsx` — удалить тернарники `role === "seller" ? ... : ...`, оставить owner-ветку.
- `src/components/shared/dashboard/hero-card.tsx` — удалить все seller-ветки и fetch в `/api/seller/settings`. Упростить до owner-only.
- `src/components/shared/analytics/analytics-page.tsx` — удалить тернарник заголовка.
- `src/lib/orders/transitions.ts` — удалить `role === "seller"` ветку.
- `src/lib/ai/sales-agent.ts:317` — проверить контекст. Если `m.role === "seller"` — про роль сообщения в AI-диалоге (аналог OpenAI `assistant/user/system`), оставить с комментарием «роль сообщения в sales-агенте, не путать с ролью юзера». Если про юзера — удалить.
- Если в других файлах `src/components/shared/` (top-list, product-matrix, top-products-smart) есть seller-ветки — обработать аналогично.

**C2. Мёртвые файлы**

- `src/stores/seller-auth-store.ts` — удалить. Grep `seller-auth-store` → удалить все импорты.
- `src/components/owner/clients/top-sellers-card.tsx` — удалить. После A3 страница `/owner/clients` — placeholder, компонент больше не импортируется. Убедиться grep-ом.

**C3. Мёртвые хуки**

- `src/hooks/use-analytics.ts` — удалить seller-ветку с fetch на `/api/stats/analytics` (endpoint удалён).
- `src/hooks/use-dashboard.ts` — удалить seller-ветку.
- `src/hooks/use-role-analytics.ts` — если файл целиком под seller → удалить; если универсальный → убрать seller-ветки.

**C4. Мёртвые env и webhook setup**

- `.env.example` — удалить `TELEGRAM_CLIENT_BOT_TOKEN` (customer-bot появится в Stage 3 с новым именем).
- `src/lib/telegram/setup-webhooks.ts` — удалить блок установки webhook на client-bot (обращение к `TELEGRAM_CLIENT_BOT_TOKEN`).

**C5. Shim `src/lib/seller/guards.ts` — документируем как deprecated**

Добавить в начало файла комментарий:

```ts
/**
 * DEPRECATED SHIM — удаляется в Этапе 7.
 *
 * В мульти-селлерной модели проверял владение ресурсом по seller_id.
 * В моно-бизнесе seller_id удалён, функции стали no-op: getMainSellerId
 * возвращает ownerId, requireSellerOwnsProduct/Order только проверяют
 * существование ресурса.
 *
 * НЕ расширять. Callers (список уточнить через grep "from.*seller/guards"):
 *   - src/app/api/owner/dashboard/route.ts
 *   - src/app/api/owner/profile/route.ts
 *   - src/app/api/owner/orders/route.ts
 *   - src/app/api/owner/stats/route.ts
 *   - src/app/api/owner/products/route.ts
 *   - src/app/api/owner/payouts/* (частично)
 *
 * Этап 7 переписывает их на session.userId напрямую и удаляет этот файл.
 */
```

### Проверка Фазы C

- `grep -rn 'role === "seller"' src/` → только `ai-sales.ts` (если legitimate) + `seller/guards.ts` (shim).
- `grep -rn "subscription_tier\|is_vibe_plus\|referral_code\|referral_deposit\|deposit_limit\|total_completed_orders" src/` → 0 хитов.
- `grep -rn "seller-auth-store\|top-sellers-card" src/` → 0 хитов.
- `grep "TELEGRAM_CLIENT_BOT_TOKEN" .env.example src/` → 0 хитов.
- `npm run build` + `npx tsc --noEmit` + `npm run lint` — зелёные.
- `npm run test:rls` + `npm run test:e2e` — зелёные.

**Коммит Фазы C:** `chore(stage1.5): delete dead seller/client code paths`.

---

## Опорные файлы

**Миграции (новые):**

- `supabase/migrations/20260424000001_stage1_5_admin_role_drop_goals.sql`
- `supabase/migrations/20260424000002_stage1_5_rls_shipper_read.sql`

**Код (создаём):**

- `src/components/shared/stage2-placeholder.tsx`
- `src/instrumentation-client.ts` (только если A11 показал что нужно)
- `tests/rls/users.test.ts`, `orders.test.ts`, `products.test.ts`, `product-sizes.test.ts`, `settings.test.ts`
- `tests/e2e/fixtures.ts`, `tests/e2e/owner-smoke.spec.ts`, `tests/e2e/shipper-smoke.spec.ts`
- `.github/workflows/ci.yml`
- `docs/DEPLOYMENT.md` (stub), `docs/TELEGRAM_SETUP.md` (stub)
- `.claude/plans/dapper-hugging-wozniak.md` (копия из `~/.claude/plans/`)

**Код (изменяем):**

| Путь                                                                  | Что делаем                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/app/(owner)/owner/clients/page.tsx`                              | → заглушка (1 строка + импорт)                                |
| `src/app/(owner)/owner/clients/[id]/page.tsx`                         | → заглушка                                                    |
| `src/app/(owner)/owner/security/page.tsx`                             | → заглушка                                                    |
| `src/app/(owner)/owner/finance/page.tsx`                              | удалить виджет долгов                                         |
| `src/app/(owner)/owner/settings/page.tsx`                             | удалить секцию Referral                                       |
| `src/app/api/owner/finance/route.ts`                                  | удалить debts-блок, снять @ts-nocheck                         |
| `src/app/api/owner/settings/route.ts`                                 | удалить handler реферал-полей (если существует)               |
| `src/lib/telegram/db.ts`                                              | удалить referral/client functions, снять @ts-nocheck          |
| `src/lib/telegram/setup-webhooks.ts`                                  | удалить client-bot block                                      |
| `src/lib/jobs/queues.ts`                                              | удалить BuildSellerPayoutsJobData, scheduleDeactivateReferral |
| `src/lib/jobs/index.ts`                                               | убрать экспорт scheduleDeactivateReferral                     |
| `scripts/worker.ts`                                                   | Avito-джобы под AVITO_ENABLED=true                            |
| `next.config.mjs`                                                     | убрать tunnelRoute                                            |
| `src/types/database.generated.ts`                                     | перегенерировать                                              |
| `src/types/database.ts`                                               | удалить ручные типы SellerPayout/Ledger/Shipper/ReferralBonus |
| `src/components/shared/dashboard/*.tsx`                               | удалить seller-ветки                                          |
| `src/components/shared/analytics/*.tsx`                               | удалить seller-ветки                                          |
| `src/lib/orders/transitions.ts`                                       | удалить seller-ветку                                          |
| `src/hooks/use-analytics.ts, use-dashboard.ts, use-role-analytics.ts` | удалить seller-ветки                                          |
| `src/lib/seller/guards.ts`                                            | добавить DEPRECATED-комментарий                               |
| `.env.example`                                                        | + AVITO_ENABLED=false, − TELEGRAM_CLIENT_BOT_TOKEN            |
| `docs/DATABASE.md`                                                    | полный переписывает тело                                      |
| `CLAUDE.md`                                                           | путь к плану (теперь в репо)                                  |
| `.claude/handoff.md`                                                  | секция «Запуск с нуля» + апдейт статуса                       |
| `.claude/skills/*.md`                                                 | убрать seller/client референсы                                |

**Код (удаляем):**

- `src/app/api/owner/clients/route.ts`
- `src/app/api/owner/clients/[id]/route.ts`
- `src/app/api/owner/security/route.ts`
- `src/stores/seller-auth-store.ts`
- `src/components/owner/clients/top-sellers-card.tsx`
- `scripts/seed.ts`, `scripts/seed-analytics.ts`, `scripts/update-test-orders.ts`, `scripts/update-test-orders.sql`
- `sentry.client.config.ts` (только если A11 показал что нужно переезжать в `src/instrumentation-client.ts`)

---

## End-to-end verification после трёх фаз

1. **«Свежий клон»:** `git clone`, `npm install`. По инструкции «Запуск с нуля» в `.claude/handoff.md` настроить `.env.local` и `.env.test`.
2. `npm run db:migrate` — применяются все миграции, включая 20260424\*.
3. `npm run db:gen-types` — `database.generated.ts` синхронен.
4. `npx tsc --noEmit` — 0 ошибок.
5. `npm run lint` — baseline warnings, 0 errors.
6. `npm run build` — exit 0.
7. `npm run test:rls` — ≥40 тестов, все зелёные.
8. `npm run test:e2e` — smoke + owner-smoke + shipper-smoke зелёные.
9. `npm run dev` — руками пройти все пункты меню `/owner/*` и `/shipper/*`: ни один не отдаёт 500. Удалённые разделы показывают Stage2Placeholder.
10. `npm run worker:dev` с `AVITO_ENABLED=false` — стартует чисто, avito-job-ы пропущены.
11. С `NEXT_PUBLIC_SENTRY_DSN` — `Sentry.captureMessage()` в консоли браузера даёт событие в Sentry UI.
12. Grep проверки:
    - `referral_bonuses`, `subscription_tier`, `is_vibe_plus`, `deposit_limit`, `seller-auth-store`, `top-sellers-card`, `TELEGRAM_CLIENT_BOT_TOKEN`, `out_seller_id` в `src/` → 0 хитов.
    - `role === "seller"` в `src/` → максимум 2 легитимных хита (shim + ai-sales).
13. `.claude/plans/dapper-hugging-wozniak.md` существует и открывается из репо.
14. CI на тестовый PR показывает зелёные: build, types, lint, rls; на push в main — плюс e2e.

После этого **Этап 1 действительно закрыт**. Переход к Этапу 2 (таблицы `customers`, `business_settings`, `order_messages`, `customer_conversations`, `product_variants`, `vibe_payments`, `data_imports` + переделка 11 @ts-nocheck файлов).

---

## Оценка трудозатрат

| Фаза | Задача                                                                                                                   | Время      |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| A    | Миграции + удаление битых страниц/API + placeholder + зачистка очередей + регенерация типов + Sentry-верификация         | ~1 день    |
| B    | 5 новых RLS-тестов + e2e-session-injector + owner/shipper-smoke + CI + рерайт DATABASE.md + копия плана в репо + handoff | ~1–1.5 дня |
| C    | Удаление мёртвого кода, зачистка env, документация shim-а                                                                | ~0.5 дня   |

**Итого: 2.5–3 рабочих дня.**

## Риски и допущения

- **A11 Sentry** может показать что сейчас всё работает и ничего делать не надо. Это успех, не отклонение.
- **B2 e2e session-injector** может оказаться сложнее 0.5 дня (зависит от того как устроен JWT в `src/lib/auth/jwt.ts`). Fallback — оставить только unauthenticated smoke-тесты, перенести authenticated e2e в Этап 7.
- **A3 удаление API-роутов** не должно ломать Telegram-бот. Проверить через grep — шипер-бот обращается к `/api/owner/clients`? Вряд ли, но убедиться.
- **A1 `DROP COLUMN goals`** — если где-то в коде есть обращение к `users.goals`, билд упадёт. Перед миграцией grep `\.goals` по `src/` — ожидаем 0 хитов.
- **A8 AVITO_ENABLED=false** как default может в prod выключить уже работающие Avito-интеграции (если они используются сейчас). Уточнить у пользователя: Avito уже активна в prod или нет? Если активна — default `true` в prod-env, но в локальном `.env.example` всё равно `false`.
