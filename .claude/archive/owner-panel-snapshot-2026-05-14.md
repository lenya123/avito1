# Owner Panel snapshot — 2026-05-14

> Структурный snapshot Owner Panel перед стартом фазы 2 (Owner Panel +
> Shipper PWA). Метод: статический анализ кода. Визуальная часть
> (Playwright-скриншоты) будет добавлена отдельной итерацией — см.
> секцию [«🖼️ Визуальные заметки»](#визуальные-заметки) ниже.
>
> Smoke-карта ботов — `.claude/smoke-map.md`. Требования фазы 2 — в
> `.claude/walkthrough-notes.md` секция «🪟 Требования к Owner Panel».
>
> **Поверхность:** 24 страницы под `src/app/(owner)/owner/*` + ~54 API
> routes под `src/app/api/owner/*`.

## TL;DR

- **🟢 Каркас собран:** 24 страницы, 54 API, React Query почти везде,
  auth — 64-char hex key. Заказы, клиенты, продукты, партнёры,
  отправщики — функциональные.
- **🔴 Broken navigation (2 dead-link'а):**
  - Sidebar пункт «Продавцы» → `/owner/sellers` → **404** (страницы
    нет в коде, реальный URL партнёров — `/owner/partners`).
  - В `/owner/shippers` ссылка «Все шиперы платформы →»
    `/owner/platform/shippers` → **404** (платформа-уровень не
    реализован).
- **🟡 Уточнение по требованию #1 (KPI отправщика):** в карточке
  `/owner/shippers/[id]` ELO-score (65%) уже отрисован крупно с
  progress-bar и ставкой ₽/заказ. Это **агрегированный**
  KPI, но walkthrough хочет конкретный **daily/weekly/monthly ratio
  orders_shipped/orders_taken**. Требование частично закрыто (через
  ELO), нужен дополнительный «процент успешных» отдельно.
- **🟡 Уточнение по требованию #2 («Написать владельцу»):** это
  про **customer-bot** карточку заказа, не про Owner Panel — в
  `/owner/orders/[id]` такой кнопки нет и не должно быть. В snapshot
  фразa «в карточке заказа» вводит в заблуждение.
- **🟡 Требования фазы 2 — частично:**
  - `partner_stock_location` поле есть в БД (миграция 20260502000030),
    но **отсутствует в форме** `/owner/products/new` и edit-форме.
  - `shipper_daily_stats` инкрементит `orders_shipped/returns_collected`,
    но **нет `orders_taken`** для KPI «процент успешных».
  - Чек оплаты (фото) — API `/api/owner/orders/[id]/receipt-url` есть,
    но из UI карточки заказа **не вызывается** (только текстовый ref в
    OrderPaymentReview).
  - `customer_balance_history` есть в БД (миграция 20260428000004), но
    **в UI клиента не отображается**. Manual credit/debit кнопок нет.
  - «Написать владельцу» в customer-bot — **callback без orderId**
    (`order:contact_owner` глобальный), маршрутизация не сделана.
  - «Новые клиенты» фильтр + бейдж «не просмотрен» — **отсутствует**.
- **⭐ Сюрпризы:** в UI больше, чем требует план — partner ladder editor
  (drag-drop) на форме товара; ELO score color-coding в карточке
  отправщика; AI Sales модуль (drafts/analytics/settings) скелет уже
  есть (фаза 3); Finance — donut chart + 5 вкладок; Security — risk
  profiles + fraud alerts.
- **⚠️ Мёртвый/полу-готовый код:** `setSelectedBar` без caller'а в
  `/owner/shippers/[id]:73`; `warehouseCity` state без использования в
  `/owner/partners`; SecurityPage fraud-alerts UI без bulk-действий.
- **Блокеров нет** — все 7 требований реализуемы без переписывания
  каркаса.

---

## Pages (24)

### `/owner` — home

- **Renders:** redirect на `/owner/dashboard` (без UI).
- **Data:** —
- **Actions:** —

### `/owner/login`

- **Renders:** карточка по центру: логотип + input (64-hex key) + submit.
  Баннер ошибки при невалиде.
- **Data:** —
- **Actions:** `handleSubmit()` → `login()` из `useOwnerAuthStore` →
  redirect на dashboard (или `?redirect`-параметр).
- **States:** spinner + disabled input во время POST.

### `/owner/dashboard`

- **Renders:** обёртка `<DashboardPage role="owner" />` — реальный UI
  в `@/components/shared/dashboard`.
- **Data:** делегировано.
- **Actions:** —

### `/owner/orders`

- **Renders:** 4 KPI-плитки (Orders/Revenue/COGS/Profit+ROI) → sales chart
  (day/week/month, bar-select фильтрует список) → фильтры (статус,
  delivery service, sort, диапазон, search, product/client/seller) →
  таблица карточек заказа (checkbox-выбор) → pagination.
- **Data:** `useOwnerStats` → `/api/owner/stats`; `useOwnerOrders` →
  `/api/owner/orders`.
- **Actions:** период, bar-select, фильтры URL-sync, batch select +
  cancel (`POST /api/owner/orders/batch`), export
  (`POST /api/owner/orders/export` → XLSX).
- **Unusual:** bar-select обходит URL — только клиентский фильтр дат.

### `/owner/orders/[id]`

- **Renders:** header (номер, статус, urgency, source-tag, vision/partner
  badges) → 3 колонки:
  - Order info (статус, delivery, dispatch city, deadline, tracking,
    payment status, created)
  - Product card (превью, имя, размер, цены, profit+ROI)
  - Client card (avatar, имя, +ВАЙБ-badge, статистика, ссылка на
    `/clients/[id]`)
  - Shipper card (если присвоен) → Partner card (если партнёрский) →
    `OrderPaymentReview` блок → history timeline (action_log).
- **Data:** `useOwnerOrder(orderId)` → `/api/owner/orders/[id]`.
- **Actions:** Cancel (с reason), update comment.
- **Unusual:** `confirmedBy` (vision/partner/manual) виден как badge;
  `visionOperationId` — tooltip. **Receipt-фото не отрисовывается**
  (API endpoint `receipt-url` есть, но не зовётся отсюда).

### `/owner/clients`

- **Renders:** header → 4 summary cards (Total/+ВАЙБ/Frozen/Blocked) →
  фильтры (search/vibe/frozen/blocked/sort) → card list (ClientCard)
  → pagination.
- **Data:** `useOwnerClients(filters)` → `/api/owner/customers`.
- **Actions:** URL-sync фильтров, pagination.
- **Unusual:** **нет фильтра «новые»**, нет бейджа «не просмотрен» —
  TO-DO фазы 2.

### `/owner/clients/[id]` ⭐ ключевой экран фазы 2

- **Renders:** header (avatar, имя, badges +ВАЙБ/Frozen/Blocked + кнопки
  Telegram-link, +ВАЙБ-toggle, FreezeControls, Block) → 3 колонки:
  - Info card (tgId, @username, phone, joined, notes, block reason)
  - +ВАЙБ-credit card (current debt, limit, available, frozen alert)
  - Stats card (orders/financials/avg/profit+ROI)
  - Recent orders (10 последних + ссылка «все заказы»).
- **Data:** `useOwnerClient(id)` → `/api/owner/customers/[id]`
  (customer, stats, recentOrders, pendingVibePayments).
- **Actions:** toggle +ВАЙБ, block (с reason), update limit, save notes,
  FreezeControls (auto-freeze).
- **Unusual:** **нет балансовой истории** (`customer_balance_history`),
  **нет кнопок «➕ Пополнить» / «➖ Списать»**, **pendingVibePayments**
  возвращаются из API, но confirm/reject UI на странице не виден.

### `/owner/partners`

- **Renders:** header → create modal → партнёр-список (плоские Card-ы:
  имя, tgUsername, кол-во товаров, commission owed, invite token).
- **Data:** raw `fetch("/api/owner/partners")` — без хука.
- **Actions:** create modal (name/tgUsername/warehouseCity/notes) →
  POST + refetch.
- **Unusual:** `warehouseCity` state объявлен, но **не виден в UI формы**
  — мёртвый useState на line ~90. Edit-UI на этой странице нет.

### `/owner/partners/[id]`

- **Renders:** header + badges → 2 колонки:
  - Partner metadata (tgUsername, tgUserId, isLinked, isActive, notes,
    warehouse_city edit, acceptsVibeDebt toggle)
  - Debt summary (ownerOwes/partnerOwes) + manual settlement form
  - Products section (таблица товаров партнёра + binding/commission)
  - Orders section (фильтр all/owed, multi-select + mark-commission-paid)
  - Debts section (manual debt log).
- **Data:** raw `fetch("/api/owner/partners/[id]")`.
- **Actions:** PATCH partner_meta, mark-commission-paid (bulk),
  owner-debt-settle.
- **Unusual:** raw fetch без хука; multi-select на orders таблице.

### `/owner/shippers`

- **Renders:** header (link на «всех отправщиков платформы») → create
  button → 2 quick-stat cards (shipped/returns сегодня) → grid
  ShipperCard → modals (Create/Edit/Delete).
- **Data:** `useOwnerShippers`, `useOwnerPendulumSettings`,
  `useDeleteShipper`.
- **Actions:** Create/Edit/Delete с confirm.
- **Unusual:** PendulumSettings card видна (payment automation).

### `/owner/shippers/[id]` ⭐ ключевой экран фазы 2

- **Renders:** header (имя + ELO score badge с color-coding:
  green ≥85 / orange ≥60 / red <60) → 2 info колонки:
  - Shipper metadata (имя, phone, pendulum bar, payout stats)
  - KPI cards (orders assigned, shipped, returns, earnings, ELO score)
  - Period selector (week/month/custom) → sales chart → payouts table.
- **Data:** `useOwnerShipperDetail(id)` →
  `/api/owner/shippers/[id]`; `useShipperChart(id, from, to)` →
  `/api/owner/shippers/[id]/stats`.
- **Actions:** период, edit, delete.
- **Unusual:** `setSelectedBar` declared but **never called** (мёртвая
  строка ~73 — copy-paste из orders); DAY_LABELS/DAY_ORDER массивы.
  **Нет KPI ratio orders_shipped/orders_taken** — поля `orders_taken`
  в БД нет.

### `/owner/products`

- **Renders:** фильтры (search/status/stock/premium/category/size/seller/
  sort) → ProductCard grid → pagination.
- **Data:** `useOwnerProducts(filters)`.
- **Actions:** URL-sync, pagination, click → detail.
- **Unusual:** `sellerId` дефолтится "me"; можно фильтровать чужих
  (партнёрские товары); search debounce 300ms.

### `/owner/products/new`

- **Renders:** форма: basics (name/category/description) → pricing
  (purchase/drop/recommended) → stock (city autocomplete, premium,
  expected arrival, sizes grid, one-size quantity) → **partner ladder
  editor** (drag-drop).
- **Data:** `useOwnerSettings`, `useOwnerPartnersList`.
- **Actions:** Zod validation, `useCreateProduct` → POST → redirect.
- **Unusual:** **`partner_stock_location` поле отсутствует** в схеме
  (zod) и в UI. Нужно добавить radio/dropdown
  owner_warehouse/partner_warehouse. RUSSIAN_CITIES autocomplete с
  startsWith→includes ранжированием.

### `/owner/products/[id]`

- **Renders:** header + status/stock badges + edit/delete/publish →
  3 колонки:
  - Product info (name, category, description, prices, premium, active,
    expected arrival, location, sizes, partner ladder read-only)
  - Photo gallery (main + thumbnails + upload)
  - Sales chart (период selector)
  - Orders table (заказы по этому товару).
- **Data:** `useOwnerProduct`, `useOwnerPartnersList`, `useUpdateProduct`,
  `useDeleteProduct`.
- **Actions:** Edit (модалка с теми же полями), Delete, Publish →
  `/api/owner/products/[id]/publish-to-catalog`.
- **Unusual:** **`partner_stock_location` — нет в editForm**.

### `/owner/finance`

- **Renders:** период selector (preset 7/30/90 или custom) → donut chart
  (expenses) → 5 вкладок:
  - Products (orders/revenue/cost/profit)
  - Expenses (table + add modal)
  - Payouts (table + add modal + generate batch)
  - Debts (table + settle modals)
  - Platform (вероятно полу-готовый).
- **Data:** `useOwnerFinance(filters)` → `/api/owner/finance`.
- **Actions:** период, tab change, add expense/payout/debt, generate
  payouts (batch).
- **Unusual:** `handleGenerate` action не виден в excerpt — возможно
  half-finished.

### `/owner/payouts`

- **Renders:** status filter (All/Pending/Paid) → таблица (seller,
  amount, status, date) → offset-pagination.
- **Data:** `useOwnerPayouts({status, limit, offset})`.
- **Actions:** mark-paid (`window.confirm`), cancel, generate.
- **Unusual:** `window.confirm` вместо нормального модала; нет bulk-
  mark-paid.

### `/owner/payment-methods`

- **Renders:** breadcrumb → create → method list (card/SBP/IP_QR карточки
  с kind/account/limits/status) → modals.
- **Data:** `usePaymentMethods`, `useCreate/Update/DeletePaymentMethod`,
  `uploadPaymentQr`.
- **Actions:** create/edit/delete; upload QR multipart.
- **Unusual:** "Payment farm" метафора — customer-bot ротирует методы.

### `/owner/analytics`

- **Renders:** обёртка `<AnalyticsPage role="owner" />`.
- **Data:** делегировано.

### `/owner/settings`

- **Renders:** меню секций (VIBE/Finance/Business/Goals/Returns/
  Shippers/Contacts/Location) → collapsible editor cards →
  отдельные компоненты: `DirectorBotSection`,
  `NotificationRoutingSection`, `DigestScheduleSection`.
- **Data:** `useOwnerSettings`, `useUpdateOwnerSettings`,
  `useLocationPickupPoints`, `useLink/Unlink/CreatePickupPoint`.
- **Actions:** редактирование секций → PATCH → toast «Сохранено».
  Pickup-points CRUD. Logout.
- **Unusual:** Section-based редактор; разные sub-компоненты для
  director-bot/notification-routes/digest-schedule.

### `/owner/security`

- **Renders:** 2 секции:
  - Risk profiles (клиенты с return rate ≥30% или cancel rate ≥50%,
    color-coded строки)
  - Fraud alerts (по severity, bulk-actions).
- **Data:** `useQuery` → `/api/owner/security/risk-profiles?...`;
  `useQuery` → `/api/owner/fraud-alerts`.
- **Actions:** mark false-positive, dismiss, click row → клиент.
- **Unusual:** хардкод `minReturnRate=30&minCancelRate=50` (не
  редактируется в UI); fraud_alerts UI half-finished (bulk-кнопок не
  видно в excerpt).

### `/owner/more`

- **Renders:** menu grid: Finance, AI Sales, Analytics, Shippers,
  Security. Иконка/label/subtitle/color.
- **Actions:** навигация.
- **Unusual:** «more menu» для мобильной навигации.

### `/owner/ai-sales` (фаза 3, скелет уже есть)

- **Renders:** header → QuickStats (7-day) → tabs → DraftList.
- **Data:** `useAiSalesStats(7)` → `/api/owner/ai-sales/stats`;
  DraftList → `/api/owner/ai-sales/drafts`.
- **Actions:** navigate → settings/analytics; approve/reject в DraftList
  (TBD).

### `/owner/ai-sales/analytics`

- **Renders:** период (7/14/30 дней) → `useAiSalesStats(days)` → stats.
- **Actions:** период.

### `/owner/ai-sales/settings`

- **Renders:** mode selector (draft/auto_simple/auto_full) → confidence
  threshold slider → save.
- **Data:** `useAiSalesSettings`, `useUpdateAiSalesSettings`.

---

## API routes (~54) — grouped

### Orders (7)

- `GET/POST /api/owner/orders` — list+filters / create pending.
- `GET/PATCH/DELETE /api/owner/orders/[id]` — detail / update / cancel.
- `POST /api/owner/orders/[id]/confirm-payment`
- `POST /api/owner/orders/[id]/reject-payment`
- `GET /api/owner/orders/[id]/receipt-url` — **существует, но из UI не
  зовётся**.
- `POST /api/owner/orders/batch` — bulk cancel.
- `POST /api/owner/orders/export` — XLSX.

### Customers (6)

- `GET/POST /api/owner/customers`
- `GET/PATCH /api/owner/customers/[id]`
- `POST /api/owner/customers/[id]/freeze`
- `POST /api/owner/customers/[id]/unfreeze`
- `GET /api/owner/customers/[id]/conversation`
- `GET /api/owner/customers/[id]/vibe-payments`

### Shippers (3)

- `GET/POST /api/owner/shippers`
- `GET/PATCH/DELETE /api/owner/shippers/[id]`
- `GET /api/owner/shippers/[id]/stats`

### Partners (4)

- `GET/POST /api/owner/partners`
- `GET/PATCH /api/owner/partners/[id]`
- `POST /api/owner/partners/[id]/mark-commission-paid`
- `POST /api/owner/partners/[id]/owner-debt-settle`

### Products (4)

- `GET/POST /api/owner/products`
- `GET/PATCH/DELETE /api/owner/products/[id]`
- `POST /api/owner/products/[id]/publish-to-catalog`

### Finance (2)

- `GET /api/owner/finance`
- `GET /api/owner/finance/categories`

### Payouts (4)

- `GET /api/owner/payouts`
- `PATCH /api/owner/payouts/[id]/mark-paid`
- `POST /api/owner/payouts/[id]/cancel`
- `POST /api/owner/payouts/generate`

### Payment Methods (3)

- `GET/POST /api/owner/payment-methods`
- `GET/PATCH/DELETE /api/owner/payment-methods/[id]`
- `POST /api/owner/payment-methods/qr-upload`

### AI Sales (4)

- `GET /api/owner/ai-sales/stats`
- `GET/POST /api/owner/ai-sales/drafts`
- `GET/PATCH /api/owner/ai-sales/drafts/[id]`
- `GET/PATCH /api/owner/ai-sales/settings`

### Settings & Config (5)

- `GET/PATCH /api/owner/settings`
- `GET /api/owner/location-pickup-points`
- `POST /api/owner/pickup-points` (+ link/unlink)
- `GET /api/owner/notification-routes`
- `POST /api/owner/notification-routes`

### Security (4)

- `GET /api/owner/security/risk-profiles`
- `POST /api/owner/security/run-detectors`
- `GET/POST /api/owner/fraud-alerts`
- `PATCH/DELETE /api/owner/fraud-alerts/[id]`
- `POST /api/owner/fraud-alerts/bulk`

### Analytics & Stats (2)

- `GET /api/owner/stats`
- `GET /api/owner/analytics`

### Vibe Payments (2)

- `POST /api/owner/vibe-payments/[id]/confirm`
- `POST /api/owner/vibe-payments/[id]/reject`

### Auth & Misc (3)

- `POST /api/owner/auth/login`
- `GET /api/owner/director-link`
- `GET /api/owner/search`

---

## Phase-2 requirements cross-check

| #   | Требование                                             | Статус                  | Где сейчас / что добавить                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | KPI «процент успешных отправок» в карточке отправщика  | 🔴 Missing              | UI карточки готов (`/owner/shippers/[id]` lines ~123-132). Нет поля `orders_taken` в `shipper_daily_stats`. Нужна миграция + инкремент в `executeStartCollecting` + UI ratio.                                                                                                                                                                                                                                                                                           |
| 2   | «Написать владельцу» — orderId-aware маршрутизация     | 🔴 Missing              | Callback `order:contact_owner` глобальный (без orderId) в `src/lib/telegram/customer-bot/my-orders.ts:105,110`. Нужен `:{id}` + логика partner/director/owner.                                                                                                                                                                                                                                                                                                          |
| 3   | Receipt-фото в карточке заказа                         | 🟡 Partial              | API `/api/owner/orders/[id]/receipt-url` существует, но UI не зовёт. Нужно проверить наличие `orders.tg_file_id` и подвесить отображение в `/owner/orders/[id]` + `OrderPaymentReview`.                                                                                                                                                                                                                                                                                 |
| 4   | Единая функция баланса клиента в `/owner/clients/[id]` | 🔴 Missing              | Сейчас разрозненно: +ВАЙБ-card отдельно, FreezeControls отдельно, withdrawal-alert через owner-bot DM. **Нет** balance history list, **нет** кнопок ➕/➖. Таблица `customer_balance_history` в БД с 20260428000004. Нужен API endpoint + UI секция.                                                                                                                                                                                                                    |
| 5   | `partner_stock_location` в форме товара                | ✅ Done (другая модель) | Поле `products.partner_stock_location` дропнуто миграцией 20260503000030 — модель переехала на уровень привязки (`product_partner_bindings.warehouse_kind`: 'owner'/'partner'). В UI это toggle «📦 Склад мой» / «🤝 Склад его» под каждым партнёром в `partner-ladder-editor.tsx:270-301` (раскрывается из «+ Подключить партнёра»). Подсказка под toggle'ом объясняет последствия. Тоньше: один товар может одновременно лежать у разных партнёров на разных складах. |
| 6   | ~~Фильтр «новые клиенты» + бейдж «не просмотрен»~~     | 🔁 Переформулировано    | 2026-05-14: владелец не работает per-customer, бейдж/фильтр в списке избыточны. Перенесено в Дашборд как KPI-плитка «Новых клиентов за период». См. memory `feedback_clients_list_no_per_customer_ui`.                                                                                                                                                                                                                                                                  |
| 7   | Notification routing для типа `customer_contact`       | 🟡 Partial              | `notification_routes` таблица с типами есть. NotificationRoutingSection компонент есть. Нужно проверить, есть ли в enum `customer_contact` или добавить.                                                                                                                                                                                                                                                                                                                |

---

## Половинчатый / мёртвый код

- `/owner/shippers/[id]:73` — `setSelectedBar` без caller'а (copy-paste
  из orders).
- ~~`/owner/partners:90` — `warehouseCity` useState без UI~~ — **ложная
  тревога** (агент ошибся): поле «Город склада» используется в
  Input на line 191-197 + required-валидация на line 212. Не мёртвый.
- `/owner/finance` — `handleGenerate` payouts batch — реализация TBD.
- `/owner/security` — fraud_alerts bulk UI — реализация TBD.
- `/owner/analytics` и `/owner/dashboard` — обёртки над shared
  компонентами, owner-специфики не видно.

---

## 🖼️ Визуальные заметки (Playwright, 2026-05-14)

Скриншоты в `.claude/screenshots/` (в `.gitignore`, локальные
артефакты сессии — в репо не попадают).

| Экран                   | Скриншот                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| Login                   | [owner-login.png](screenshots/owner-login.png)                   |
| Dashboard               | [owner-dashboard.png](screenshots/owner-dashboard.png)           |
| Orders list             | [owner-orders.png](screenshots/owner-orders.png)                 |
| Order detail #279       | [owner-order-detail.png](screenshots/owner-order-detail.png)     |
| Clients list            | [owner-clients.png](screenshots/owner-clients.png)               |
| Client detail (Dmitrii) | [owner-client-detail.png](screenshots/owner-client-detail.png)   |
| Shipper detail          | [owner-shipper-detail.png](screenshots/owner-shipper-detail.png) |
| Product create form     | [owner-product-new.png](screenshots/owner-product-new.png)       |
| Settings                | [owner-settings.png](screenshots/owner-settings.png)             |
| Security                | [owner-security.png](screenshots/owner-security.png)             |
| Finance                 | [owner-finance.png](screenshots/owner-finance.png)               |
| Payouts                 | [owner-payouts.png](screenshots/owner-payouts.png)               |
| Partners                | [owner-partners.png](screenshots/owner-partners.png)             |

### Темa и UI-язык

- **Тёмная тема**, фон чёрный/тёмно-серый, акценты бирюзовый/розовый/
  жёлтый/зелёный. KPI-плитки везде с цветной mini-chart-историей за
  период.
- **Sidebar** 12 пунктов (см. mismatch ниже), персистентный, нижний
  блок «Управление / owner / Выйти».
- **Loading state:** skeleton-карточки на списках (хорошо), полные
  spinner'ы на detail-страницах.

### Sidebar (12 пунктов) и реальные URL

| Лейбл        | href               | Состояние                                   |
| ------------ | ------------------ | ------------------------------------------- |
| Дашборд      | /owner/dashboard   | ✅                                          |
| Заказы       | /owner/orders      | ✅                                          |
| Товары       | /owner/products    | ✅                                          |
| Клиенты      | /owner/clients     | ✅                                          |
| Финансы      | /owner/finance     | ✅                                          |
| Выплаты      | /owner/payouts     | ✅                                          |
| Аналитика    | /owner/analytics   | ✅ (не открывал)                            |
| Отправщики   | /owner/shippers    | ✅                                          |
| **Продавцы** | **/owner/sellers** | **🔴 404 (реальный URL — /owner/partners)** |
| AI Продажник | /owner/ai-sales    | ✅ (не открывал)                            |
| Безопасность | /owner/security    | ✅                                          |
| Настройки    | /owner/settings    | ✅                                          |

Страница `/owner/more` есть в коде, но **не отрисована в sidebar**
desktop-навигации (видимо, mobile-only drawer).

### Заметки по экранам

**Dashboard** (`/owner/dashboard`):

- KPI: Прибыль/Выручка/Заказы/Средний чек/ROI — каждая с mini-chart
  «vs вчера». Цель 500 K ₽ — справа в плитке прибыли.
- Алерт-блок: «🟡 Заканчивается товар — 20 товаров с остатком ≤ 5 шт.»
  с кнопкой «Товары». Алертный hub явно работает.
- «Воронка заказов» (5 статусов с %) + «Сегодня на отправке» +
  «Операционные показатели (7 дн)» (Среднее до отправки, медленные,
  на отправщика; SLA соблюдение, % выполнения сегодня) + «Топ
  товаров (30 дн)» с ranks 1–5 и % продаж.
- В dev sandbox БД пустая → большинство значений 0; alert «20 товаров
  на остатке ≤ 5» работает от seed-данных.

**Order detail #279** (`/owner/orders/[id]`):

- 3 колонки: Информация (status, СДЭК, дедлайн **подсвечен красным
  если близко** 14 мая 2026, трек 6993389080, payment «Не оплачен ·
  deposit», created), Товар (превью + ROI +109%), Финансы клиента (
  Цена клиента 11500 ₽).
- Header badges: Оплачен / Срочный / drop / 🤚 balance.
- Внизу: Клиент (avatar, @username, бейдж «Лапшичник»), Отправщик
  («Ещё не отправлен»), Комментарии («Нет комментариев»), История
  («Заказ создан»).
- **Receipt-фото блока НЕТ** — подтверждено #3.
- Кнопка «Отменить заказ» крупная справа сверху.

**Client detail (Dmitrii)** (`/owner/clients/[id]`):

- Header: avatar, имя «Dmitrii», бейдж «+ВАЙБ», кнопки «Ждать +ВАЙБ»
  (видимо «обновить» или «pending vibe payments»?) / «Заморозить» /
  «Заблокировать».
- 3 колонки: Информация (tgId, @username, joined 27.04.2026, кнопка
  «Добавить» под notes); +ВАЙБ-кредит (Текущий долг 11500 ₽ /
  Лимит 100000 ₽ — с «Изменить» / Доступно 88500 ₽);
  Статистика (Заказов 11, Возвраты 0, +0 ₽ прибыль).
- Внизу — «Последние заказы» (~10 карточек с badge статуса и ценой).
- **Балансовой истории НЕТ**, **кнопок ➕ Пополнить / ➖ Списать
  НЕТ** — подтверждено #4.
- Кнопка «Ждать +ВАЙБ» не самоочевидна — нужно уточнить семантику
  при walkthrough'е (вероятно «ожидание подтверждения чеков»).

**Shipper detail** (`/owner/shippers/[id]`):

- Header: avatar, имя «Отправщик Тест», бейдж «ELO 65», «С 12 января
  2026 г.», кнопки Edit/Удалить.
- **Гигантский KPI-блок:** «65 % Нужно подтянуться» + horizontal
  bar от 100 ₽ до 250 ₽, текущая ставка 149 ₽/заказ. Текст пояснения:
  «Рейтинг зависит от % отправленных заказов за рабочие дни. Выше
  80 % — ставка растёт быстрее». Подпись «Отработано 0 / 8 дней».
- 3 KPI-плитки: Сегодня (0 заказов, 0 ₽), За месяц (0 заказов, 0 ₽),
  Всё время (142 заказа, 16 возвр., 21 440 ₽).
- «Заработок» bar-chart (Неделя / Месяц / Свой период), пустой за
  текущий месяц.
- «Расписание» — кнопки дней недели (выбраны Пн-Чт), 09:00-18:00.
- «Выплаты» — список (4 мар. — хай — 1 000 ₽).
- ⭐ **Важно:** агрегированный KPI-bar уже отрисован.
  Конкретного ratio orders_shipped/orders_taken по дню/неделе/
  месяцу — НЕТ.

**Product create form** (`/owner/products/new`):

- Секции: Основная информация (Название, Категория-dropdown, Описание,
  Premium toggle) → Цены (Закупка 1500, Дроп 2500, Рекомендуемая 3000)
  → Ожидаемое поступление (дата) → Город отправки (autocomplete) →
  Размеры и количество (grid XXXS / XXS / XS / S / M / L / XL / XXL /
  XXXL + One Size).
- В самом низу: «Партнёры в очереди» с пояснением про ladder, ссылка
  «+ Подключить партнёра». Под раскрытием — drag-drop editor (из
  кода).
- **`partner_stock_location` (radio owner_warehouse / partner_warehouse)
  — нет в форме.** Подтверждено #5.
- Кнопка «Создать товар» снизу синяя.

**Clients list** (`/owner/clients`):

- 4 KPI-плитки: Всего 3 / С +ВАЙБ 1 / Заморожены 0 / Заблокированы 0.
- Поиск + сортировочные чипы: Дата ▾ / Заказы / Выручка / Долг +
  иконка фильтра. **Фильтра «новые клиенты» НЕТ.** Подтверждено #6.
- Карточки: avatar, имя, @username, кол-во заказов, +ВАЙБ-бейдж
  (если есть), долг подсвечен (например 11 500 ₽ / 100 000 ₽).
- **Бейджа «не просмотрено» нет.**

**Settings** (`/owner/settings`):

- Глубоко-секционная страница (~12 секций): Владелец / +ВАЙБ /
  Активные платёжные карты / Подтверждение оплат / Алерты после
  неоднозначных платежей (тоглы) / Настройки сводок (Директор /
  Партнёры / Клиенты — окна 10:00–21:00 МСК, шаги) / Финансы
  платформы / Бизнес-правила / Цели (500 000 ₽) / Возвраты и
  утилизация (7 дней / 30 дней) / Оплата отправщикам (Мин 50 ₽,
  Макс 150 ₽, шаг 5 ₽) / Контакты / Город по умолчанию / Точки
  отправки / Система (часовой пояс, MSK).
- Кнопки «Изменить» рядом с каждой секцией.
- Кнопка «Выйти из аккаунта» внизу крупная красная.
- **Notification routing** реализован в форме toggles для разных
  типов («Алерты после неоднозначных платежей» — там toggles), но
  явный список типов (`customer_contact` и т.п.) на одном уровне
  требует углубления в DigestScheduleSection и NotificationRouting
  компонент.

**Security** (`/owner/security`):

- 2 секции: «Подозрительные клиенты» (empty: «Все клиенты в пределах
  нормы») / «Все активные алерты» (empty: «Открытых алертов нет»).
- Кнопка «Запустить детекторы» сверху справа (POST на run-detectors).
- Без данных bulk-UI не виден.

**Finance** (`/owner/finance`):

- 4 KPI (Расходы 0 / Выручка 0 / Прибыль 0 / ROI 0 %).
- Период selector сверху (7 дней / 30 дней / 90 дней / Свой период).
- Bar-chart «Нет данных для отображения».
- Блок «Доход с партнёров».
- 3 вкладки (НЕ 5 как предполагал статический анализ): **Поставщики /
  Товары / Выплаты**. На «Товары» — фильтры по категориям
  (Аксессуары/Бельё/Верх/Джинсы/Обувь/Платья/Худи/Шорты/Юбки/Сборы)
  и большой список товаров с закупкой/выручкой.
- Уточнение к первичному snapshot: вкладок Expenses / Debts / Platform
  не видно как отдельных tabs — возможно встроены или их UI ещё не
  реализован.

**Payouts** (`/owner/payouts`):

- Title «Выплаты селлерам» (terminology: «селлерам» — продавцам;
  Shippers платятся через `/owner/shippers/[id]` payouts отдельно).
- Status filter: Все / Ожидают / Выплачено + кнопка «Сформировать за
  период».
- Empty: «Нет выплат. Запустите "Сформировать за период" или дождитесь
  еженедельного расчёта.»

**Partners** (`/owner/partners`):

- Title «Партнёры» (несмотря на label «Продавцы» в sidebar).
- Subtitle «Поставщики чужих товаров — сами отправляют клиенту,
  возвращают вам комиссию.»
- Кнопка «+ Добавить партнёра» справа сверху.
- 1 партнёр: «Тестовый Партнёр (владелец) @dimatalksreal · Товаров 3»,
  «Долг по комиссии 0 ₽», кнопки «📋 Скопировать приглашение» / «Детали».
- ⚠️ Активный пункт sidebar в этот момент — «Дашборд» (не
  «Продавцы») потому что `/owner/partners` нет в навигации.

### Что НЕ сделано в этом проходе (если понадобится — добавлю отдельно)

- `/owner/products/[id]` (detail карточка)
- `/owner/partners/[id]` (detail с debts/orders/products)
- `/owner/payment-methods`
- `/owner/analytics`
- `/owner/ai-sales` + `/analytics` + `/settings`
- `/owner/more`

---

## Заключение / приоритет walkthrough

С учётом расхождений выше — предлагаемый порядок walkthrough фазы 2:

1. **`/owner/clients/[id]`** — самый дырявый ключевой экран
   (#4 + история баланса + manual credit/debit + pendingVibePayments
   confirm-UI).
2. **`/owner/orders/[id]`** — #3 (чек-фото) + #2 «контакт владельца»
   (общая нить «карточка заказа со всем контекстом»).
3. **`/owner/shippers/[id]`** — #1 (KPI orders_taken) — отдельная
   миграция + RPC + UI ratio.
4. **`/owner/products/{new,[id]}`** — #5 (`partner_stock_location`) —
   простая правка, разогрев перед более крупными экранами.
5. **`/owner/clients`** — #6 (фильтр «новые») + бейдж — мелкая правка.
6. **`/owner/settings`** — NotificationRoutingSection (#7 проверка
   enum `customer_contact`) — может быть связана с задачей #2.
7. **Shipper PWA** — отдельный трек после Owner Panel.
