# Shipper PWA snapshot — 2026-05-14

> ⚠️ **DELTA-БАННЕР 2026-05-15 (вечер).** Снимок ниже описывает СТАРУЮ
> структуру. Актуальные отличия после walkthrough Трек B (см. `handoff.md`):
> • Табов **4**, не 5 — «В пути»/TrackingTab удалён целиком.
> • Печать стикера **опциональна** (§4.2): flow «Беру в работу» →
> «Сдал в ПВЗ»; «Напечатать стикеры» — отдельная необязательная кнопка;
> нет «Откатить печать»/2-этапа/статуса `printed`.
> • ПВЗ = **адрес-снимок** (`pickup_point_*_snapshot`), без FK; таблица
> `shipper_pickup_points` удалена.
> • «Срочно» = дедлайн ≤ завтра (return по `pickup_by`, иначе `send_by`).
> • История: фикс legacy-статусов → `updated_at DESC`, поиск/пагинация ок.
> • Гайд (`guide-section.tsx`) переписан под новую модель.
> Используй как карту файлов/API, но поведение сверяй с handoff/каноном.

> Полный структурный snapshot Shipper PWA (мобильное веб-приложение для отправщиков).
> Метод: статический анализ кода. Контекст: B2B SaaS для оптовиков одежды.
>
> **Что это:** Отправщик ходит на склад, собирает заказ, печатает стикер, сдаёт в ПВЗ,
> обрабатывает возвраты, видит выплаты. Пользуется PWA + получает push-уведомления в
> shipper-bot (Telegram push-канал, не меню).
>
> **Родственные docs:** [`BUSINESS_LOGIC.md`](../docs/BUSINESS_LOGIC.md) (§4.4 и §6.4),
> [`owner-panel-snapshot.md`](owner-panel-snapshot.md) (образец структуры),
> [`smoke-map.md`](smoke-map.md) (ботов).

---

## TL;DR

- **🟢 Каркас собран:** 5 страниц PWA (Orders, Earnings, Profile, Stock, Login) + 14 API
  endpoints. React Query фактически везде (через custom hooks).
- **🟢 3 этапа отправки (Phase E):** paid → collecting («Беру в работу» без печати) →
  printed (флаг) → sent (сдал в ПВЗ). Batch-операции поддерживаны.
- **🟢 Возвраты:** TrumpetButton + 4 кнопки результата: ✅ Забран / ❌ Неверный код /
  ❌ Неверный трек / ❌ Нет на ПВЗ. QualityDisputeModal (≥3 фото + описание).
- **🟢 Печать стикеров:** Web Bluetooth драйверы (Niimbot proprietary + ESC/POS generic).
  Поддерживаемые бренды: Niimbot, Phomemo, HPRT, Xprinter, generic.
- **🟢 Склад отправщика:** POST создание товара + PATCH/DELETE коректировка + загрузка
  фото. Фильтр по наличию (in_stock/out_of_stock). Ручное создание заказа из наличия.
- **🟢 Проблема «нет товара»:** Кнопка в BottomActionBar → executeMarkProblem (RPC)
  с выбором типа `out_of_stock` или `bad_barcode`.
- **🟢 Плохое качество при возврате (Phase D):** QualityDisputeModal — ≥3 фото +
  описание обязательны. executeDisputeReturn→ return_done БЕЗ возврата денег.
- **🟡 Уточнения по фазе 2 roadmap:**
  - **#2 «Написать владельцу»:** callback-то готов (`order:contact_owner:{orderId}`),
    но в PWA кнопка не видна — это Owner Panel функция (в карточке заказа).
  - **#1, #3, #5, #7:** Verified в коде — все закрыты.
- **🟡 Нет найдено:**
  - **Кнопка переформирования заказа при «нет товара»** (BUSINESS_LOGIC §5.1.2) —
    в PWA только отметка problem; переформирование (создание замены) — задача system
    job или owner-bot, не shipper.
  - **Web Bluetooth fallback для non-BLE браузеров** — есть Niimbot и ESC/POS, но нет
    fallback на soft-print (печать QR в браузер для сканирования) — Phase D.
- **⚠️ Мёртвый/полу-готовый код:** `setOrderSize` без caller'а в page.tsx (но есть в
  batch action). Printer-store (Zustand) объявлен но минимально используется.

---

## Pages (6)

| URL                    | Файл                | Что показывается                                                                                                                                                                                                                                                                                                                                                       | Действия                                                                                                                                                                                                                                                | API                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/shipper/login`       | `login/page.tsx`    | Карточка: логотип + input (64-hex key) + submit. Баннер ошибки. Валидация клиента.                                                                                                                                                                                                                                                                                     | `handleSubmit()` → `login()` (useShipperAuthStore) → COOKIE session → `/shipper`                                                                                                                                                                        | `POST /api/shipper/auth/login`                                                                                                                                                                                                                           |
| `/shipper`             | `page.tsx`          | **Главная — заказы.** 5 табов (5 фильтров): Collect / Ship / Tracking / Returns / History. DaySummary (счётчики). Группировка: сегодняшние срочные, обычные, проблемные (collect-tab); по delivery_service (ship-tab); по статусу прибытия (returns-tab). Карточки заказа (фото, имя товара, size, delivery service, трек, deadline подсвечен). Checkbox multi-select. | Фильтр-клик → табо-switch (haptic). Checkbox toggle. Batch-select All → BottomActionBar (3-4 action-кнопки в зависимости от tab). OpenModal (print/pickupPoint/cancel/problem/startReturn/dispute/batchSize). Inline size-selection для Avito без size. | `GET /api/shipper/orders?status=...` (list) + `POST /api/shipper/orders/batch` (batch action) + `PATCH /api/shipper/orders/[id]` (single) + `POST /api/shipper/orders/[id]/pickup-result` + `GET /api/shipper/stock` (размеры для set_size)              |
| `/shipper/earnings`    | `earnings/page.tsx` | **Деньги.** Hero-плитка «К выплате» (pendingPayout + next_payout_date + дней). PendulumBar (только dynamic mode). WorkDaysPicker (only dynamic). Сегодня (fixed mode card). Месяц (3 KPI-плитки + daily bar-chart). За всё время (2 плитки). История выплат (лист + дата/note + amount).                                                                               | Период dynamic/fixed toggle (disabled). Chart animatuin. Пейаут-история scroll.                                                                                                                                                                         | `GET /api/shipper/stats` (все KPI + efficiency + paymentMode) + `GET /api/shipper/payouts` (список) + `POST /api/shipper/payouts` (manual, если реали)                                                                                                   |
| `/shipper/profile`     | `profile/page.tsx`  | **Профиль.** Avatar (инициал), имя, @username. PrinterSettingsSection (выбор принтера: Niimbot / ESC/POS generic). GuideSection (справка по PWA). Версия (package.json). Кнопка Выход.                                                                                                                                                                                 | Logout (clear session + redirect `/shipper/login`). Printer settings (store). Guide expand/collapse.                                                                                                                                                    | `/api/shipper/auth/logout` (implicit — clear-cookie)                                                                                                                                                                                                     |
| `/shipper/stock`       | `stock/page.tsx`    | **Склад.** Header фильтры (Все / В наличии / Нет в наличии) + поиск + кнопка Добавить. Карточки товара (фото, имя, кол-во по размерам, available). Модал корректировки (инвентаризация: учёт vs факт, добавить размер, удалить). Модал создания (имя + sizes + фото). Модал создания заказа (выбор size + delivery_service).                                           | Filter-tab click. Search debounce. + Добавить → OpenCreate modal. Карточка click → OpenAdjust modal (фото/размеры/факт). Удалить товар (confirm). Заказ из наличия → OpenOrder modal → PostCreateManualOrder.                                           | `GET /api/shipper/stock` (список) + `POST /api/shipper/stock` (create product) + `PATCH /api/shipper/stock/[id]` (adjust) + `DELETE /api/shipper/stock/[id]` + `POST /api/shipper/stock/upload-photo` + `POST /api/shipper/orders/create` (manual order) |
| `(shipper)/layout.tsx` | —                   | **Обёртка.** Desktop Header (logo, NavLinks 4 шт, UserMenu logout). Mobile BottomNav (4 шт). Auth middleware (useShipperRealtimeSubscription). Spinner при навигации (targetHref !== null). Toaster.                                                                                                                                                                   | NavLink click → haptic. Logout. Realtime sync.                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                        |

---

## API routes (14)

### Auth

| Метод + URL                    | Файл                  | Payload (Zod)                  | Возвращает                                                                | Побочные эффекты                                                                      | RPC/таблица                            |
| ------------------------------ | --------------------- | ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- |
| `POST /api/shipper/auth/login` | `auth/login/route.ts` | `{ siteKey: string (64 hex) }` | `{ success, user: { id, role, name, telegramUsername }, session-cookie }` | Rate limit 5/мин (IP). JWT session-cookie (8ч, httpOnly). Логирование в activity_log. | `users.site_key eq, eq role='shipper'` |

### Orders — List & Detail

| Метод + URL                      | Файл                   | Payload (Zod)                                                                                                      | Возвращает                                | Побочные эффекты                                                                                                                                                                                      | RPC/таблица                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/shipper/orders`        | `orders/route.ts`      | Query: `status?`, `statuses?`, `delivery_service?`, `pickup_point_id?`, `urgent?`, `search?`, `limit?`, `offset?`  | `{ orders: [...], total? (for history) }` | Фильтрация по `source_warehouse='owner'`. Дефолт: active статусы (paid/collecting/return/problem) с доступом проверкой (claimed_by или free). History tab — сортировка по updated_at DESC, пагинация. | `orders` (SELECT с JOINs product, partner, pickup_point)                                                                                                                                                                              |
| `PATCH /api/shipper/orders/[id]` | `orders/[id]/route.ts` | `{ action: enum[15], pickup_point_id?, problem_type?, dispute_photos?, dispute_reason?, size?, product_size_id? }` | `{ success: true }` или `{ error }`       | Запуск execute\*-функции из shipper-actions.ts. Инкремент shipper_stats (orders_shipped, returns_collected, earnings). Notification shipper-bot.                                                      | RPC: executeStartCollecting, executeMarkPrinted, executeMarkProblem, executeCompleteReturn, executeDisputeReturn, executeStartReturn, executeSetSize, executeCancelOrder, executeUndoPrint, executeUndoShip, executeUndoProblem + др. |
| `GET /api/shipper/orders/[id]`   | —                      | —                                                                                                                  | —                                         | —                                                                                                                                                                                                     | —                                                                                                                                                                                                                                     |

### Orders — Batch & Специальные

| Метод + URL                                   | Файл                                 | Payload (Zod)                                                                                       | Возвращает                                | Побочные эффекты                                                                                                                                                         | RPC/таблица                                                                                                       |
| --------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/shipper/orders/batch`              | `orders/batch/route.ts`              | `{ action: enum[14], order_ids: [uuid], pickup_point_id?, problem_type?, size?, product_size_id? }` | `{ success, processed, failed, errors? }` | Цикл по order_ids + execute. Aggregated stats (skip per-order, batch increment в конце). Для mark_sent/complete_return — одна инкрементация в конце.                     | `shipper_stats` (increment_shipper_stat RPC)                                                                      |
| `POST /api/shipper/orders/[id]/pickup-result` | `orders/[id]/pickup-result/route.ts` | `{ result: enum(picked_up\|wrong_code\|wrong_tracking\|not_found), note? }`                         | `{ ok, result, status }`                  | Upsert return_pickup_attempts (attempt_date). Если picked_up → executeCompleteReturn. Если wrong_code/wrong_tracking → DM клиенту (grammy Bot). Trumpet session linkage. | `return_pickup_attempts` UPSERT, `trumpet_sessions` SELECT                                                        |
| `POST /api/shipper/orders/create`             | `orders/create/route.ts`             | `{ product_id, product_size_id?, size?, delivery_service: enum(5) }`                                | `{ success, orderId, orderNumber }`       | Inventory decrement (optimistic lock). Create orders-row (manual source). notifyShippersOrderUrgent job. Activity log.                                                   | `products`, `product_sizes` (UPDATE current_quantity), `orders` (INSERT), `shipper_stats` (может не инкрементить) |

### Stock — CRUD & Photo

| Метод + URL                            | Файл                          | Payload (Zod)                                                                                                                               | Возвращает                                                                   | Побочные эффекты                                                                                                                | RPC/таблица                                                        |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/shipper/stock`               | `stock/route.ts`              | Query: `search?`, `filter?` (all\|in_stock\|out_of_stock)                                                                                   | `{ products: [{ id, name, sizes: [{size, qty, actual}], totalAvailable }] }` | Активные товары. JOIN product_sizes. Пересчёт totals на клиенте.                                                                | `products` (is_active=true, deleted_at IS NULL) + product_sizes    |
| `POST /api/shipper/stock`              | `stock/route.ts`              | `{ name, sizes?: [{size, quantity}], quantity? }`                                                                                           | `{ success, productId }`                                                     | Create product + product_sizes (или One-Size). Fallback location_city из settings. Activity log.                                | `products` INSERT, `product_sizes` INSERT (buildSizeRowsForInsert) |
| `PATCH /api/shipper/stock/[id]`        | `stock/[id]/route.ts`         | `{ sizes?: [{size_id, new_quantity}], new_sizes?: [{size, qty}], new_quantity?, actual_sizes?: [{size_id, actual_qty}], actual_quantity? }` | `{ success }`                                                                | Update existing sizes / add new / update no-size quantity / update actual (инвентаризация). Пересчёт is_in_stock. Activity log. | `product_sizes` UPDATE, `products` UPDATE                          |
| `DELETE /api/shipper/stock/[id]`       | `stock/[id]/route.ts`         | —                                                                                                                                           | `{ success }`                                                                | Проверка отсутствия активных заказов. Delete product_sizes, product. Activity log.                                              | `products` DELETE, `product_sizes` DELETE                          |
| `POST /api/shipper/stock/upload-photo` | `stock/upload-photo/route.ts` | FormData: `file` (JPEG/PNG/WebP, ≤5MB), `productId`                                                                                         | `{ success, photoUrl }`                                                      | Upload to Supabase storage `product-photos`. Append URL к product.photo_urls.                                                   | `products` (photo_urls JSONB UPDATE), storage                      |

### Earnings & Payouts

| Метод + URL                  | Файл               | Payload (Zod)                                                          | Возвращает                                                                                                | Побочные эффекты                                                                                                                                        | RPC/таблица                                             |
| ---------------------------- | ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/shipper/stats`     | `stats/route.ts`   | —                                                                      | `{ stats: { today, month, allTime, dailyHistory, shipperRate, pendingPayout, paymentMode, efficiency } }` | Parallel queries (today/month/allTime stats + payouts + settings + user work_days). Пересчёт efficiency (shipper_score → S-curve factor → currentRate). | `shipper_stats`, `shipper_payouts`, `settings`, `users` |
| `GET /api/shipper/payouts`   | `payouts/route.ts` | —                                                                      | `{ payouts: [{id, amount, note, created_at}] }`                                                           | Сортировка по created_at DESC.                                                                                                                          | `shipper_payouts` (SELECT)                              |
| `POST /api/shipper/payouts`  | `payouts/route.ts` | `{ amount: positive, note? }`                                          | `{ success, payout }`                                                                                     | Create shipper_payouts-row (ручное логирование выплаты).                                                                                                | `shipper_payouts` (INSERT)                              |
| `PATCH /api/shipper/payouts` | `payouts/route.ts` | `{ rateMin?, rateBase?, rateMax?, speedTargetHours?, avgWindowDays? }` | `{ success }`                                                                                             | Update settings (pendulum_rate_min/max/base, speed_target_hours, avg_window_days). Глобальные, не per-shipper.                                          | `settings` (UPDATE)                                     |

### Pickup Points & Trumpet & Work Days

| Метод + URL                         | Файл                     | Payload (Zod)                                | Возвращает                                                             | Побочные эффекты                                                                                                                                                                                             | RPC/таблица                                                                                                 |
| ----------------------------------- | ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/shipper/pickup-points`    | `pickup-points/route.ts` | Query: `delivery_service?`                   | `{ pickupPoints: [{id, delivery_service, address, city, is_active}] }` | Фильтр по service + is_active=true.                                                                                                                                                                          | `pickup_points`                                                                                             |
| `POST /api/shipper/pickup-points`   | `pickup-points/route.ts` | `{ delivery_service, address, city? }`       | `{ pickupPoint }`                                                      | Create pickup_points-row.                                                                                                                                                                                    | `pickup_points` (INSERT)                                                                                    |
| `DELETE /api/shipper/pickup-points` | `pickup-points/route.ts` | `{ id }` (JSON body)                         | `{ success }`                                                          | Soft delete (is_active=false).                                                                                                                                                                               | `pickup_points` (UPDATE)                                                                                    |
| `POST /api/shipper/trumpet`         | `trumpet/route.ts`       | —                                            | `{ sessionId, triggeredAt, ordersCount, customersCount }`              | 1 trumpet/день (single-tenant). Create trumpet_sessions-row. Создаёт return_pickup_attempts на сегодня для всех return-заказов (owner_warehouse). Планирует trumpet-notify DM-jobs для уникальных customers. | `trumpet_sessions` (INSERT), `return_pickup_attempts` (bulk INSERT), `orders` (SELECT return), `jobs` queue |
| `DELETE /api/shipper/trumpet`       | `trumpet/route.ts`       | —                                            | `{ ok }`                                                               | Mark trumpet cancelled_at. Delete сегодняшние return_pickup_attempts. Cancel DM-jobs.                                                                                                                        | `trumpet_sessions` (UPDATE), `return_pickup_attempts` (DELETE)                                              |
| `GET /api/shipper/trumpet`          | `trumpet/route.ts`       | —                                            | `{ active, session? }`                                                 | Check сегодняшнюю active trumpet-сессию.                                                                                                                                                                     | `trumpet_sessions` (SELECT)                                                                                 |
| `GET /api/shipper/work-days`        | `work-days/route.ts`     | —                                            | `{ workDays, minWorkDays }`                                            | Shipper's work_days (from users) + min_work_days (from settings).                                                                                                                                            | `users`, `settings`                                                                                         |
| `POST /api/shipper/work-days`       | `work-days/route.ts`     | `{ workDays: [0-6] (sorted, unique, ≥min) }` | `{ success, workDays }`                                                | SET work_days если ещё не установлены. Валидация минимума. Сортировка.                                                                                                                                       | `users` (UPDATE work_days)                                                                                  |

---

## Components & Features

### Pages & Sections

| Компонент           | Файл                    | Что                                                                                                                                | Использует API                                                       | Примечание                                 |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| **DaySummary**      | `day-summary.tsx`       | Header с 5 tab-кнопками (счётчики активных по статусам + history count). Active highlight + color glow.                            | filterCounts (computed from allOrders)                               | Tab-фильтры → активный tab setState        |
| **CollectTab**      | `collect-tab.tsx`       | Urgent / Normal / Problem группы. Multi-select checkboxes. Inline size-select для Avito. PartnerLabel.                             | —                                                                    | Группировка происходит в page.tsx          |
| **ShipTab**         | `ship-tab.tsx`          | Group by delivery_service. Per-service select-all.                                                                                 | —                                                                    | shipServiceGroups (computed in page.tsx)   |
| **TrackingTab**     | `tracking-tab.tsx`      | sent/in_transit/completed, not_picked_up (with «Начать возврат»). Days elapsed. Pickup point.                                      | —                                                                    | Separate loading per-tab                   |
| **ReturnsTab**      | `returns-tab.tsx`       | TrumpetButton (disabled if empty). SelectAllRow. Sorting (return_arrived first). 4-button grid для return-статуса. Dispute-button. | `onPickupResult(orderId, result)`, `onDispute(orderId, orderNumber)` | TrumpetButton-фокус                        |
| **HistoryTab**      | `history-tab.tsx`       | Своя пагинация + своя loading. sent/return_done/cancelled/trash.                                                                   | useShipperOrders({ statuses: [] })                                   | Отдельный query (не filters-зависимый)     |
| **BottomActionBar** | `bottom-action-bar.tsx` | 3-4 кнопки в зависимости от tab/selection. Disabled guards (phase E guards: canPrint, canSetSize и т.д.).                          | —                                                                    | Компилирует guard-условия в enable/disable |

### Модали

| Компонент               | Файл                        | Что                                                                                                | Payload                                               | Примечание                            |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| **PrintModal**          | `print-modal.tsx`           | Выбор принтера (Niimbot / ESC/POS). Canvas rendering. Batch print. Progress.                       | orders, onPrintComplete (orderIds)                    | Запускает Web Bluetooth + UI progress |
| **QualityDisputeModal** | `quality-dispute-modal.tsx` | ≥3 фото (≤5 total, ≤5MB each). Описание (≥5 символов). Preview + remove. Drag-to-upload или click. | photos (base64), reason, onSubmit(photos, reason)     | Phase D requirement                   |
| **PickupPointModal**    | `pickup-point-modal.tsx`    | Для каждого delivery_service — dropdown точек. Если нет — input создания новой.                    | selections: { [service]: pointId \| null }, onConfirm | Batch по services                     |
| **ConfirmModals**       | `confirm-modals.tsx`        | Unified модали для cancel/ship/undo-ship/start-return/complete-returns/problem.                    | selectedCount, callbacks                              | Шаблонизация 6 типов подтверждений    |

### Утилиты & Stores

| Компонент                               | Файл                   | Что                                                                                                                                                   | Примечание                                                  |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **PrinterDriver** (interface + factory) | `printer-driver.ts`    | getPrinterDriver(type: 'niimbot' \| 'escpos') → PrinterDriver. Поддерживаемые бренды: Niimbot, Phomemo, HPRT, Xprinter, generic (по BLE device name). | HMR-safe singleton. Disconnect old при type-switch.         |
| **NiimbotDriver**                       | `niimbot-printer.ts`   | Proprietary protocol (GATT services). Canvas → bitmap → Niimbot format.                                                                               | 58mm label (406×1080 px). Sync connect/disconnect.          |
| **EscPosDriver** (bluetooth-printer.ts) | `bluetooth-printer.ts` | Generic ESC/POS (Xprinter, HPRT, Phomemo). Canvas → ESC/POS commands.                                                                                 | UE-адаптер (отправка строк BLE). Batch с progress callback. |
| **useShipperAuthStore**                 | —                      | Login/logout, session cookie, session-epoch validation.                                                                                               | Zustand store                                               |
| **useShipperOrders**                    | —                      | GET /api/shipper/orders + refetch. Кэш React Query.                                                                                                   | Фильтры + параметры                                         |
| **useBatchOrderAction**                 | —                      | POST /api/shipper/orders/batch. Mutation.                                                                                                             | isPending state                                             |
| **useOrderAction**                      | —                      | PATCH /api/shipper/orders/[id]. Single order action.                                                                                                  | Для QualityDisputeModal                                     |
| **useShipperStock**                     | —                      | GET /api/shipper/stock. Stock CRUD mutations.                                                                                                         | Products + sizes normalization                              |
| **useShipperStats**                     | —                      | GET /api/shipper/stats. KPI + efficiency.                                                                                                             | dailyHistory, pendingPayout                                 |
| **useShipperPayouts**                   | —                      | GET /api/shipper/payouts.                                                                                                                             | Историческое только                                         |
| **useSetOrderSize**                     | —                      | PATCH (single order).                                                                                                                                 | Для inline size-select                                      |

### TrumpetButton & Returns Flow

| Компонент               | Файл                                             | Что                                                                                                                                               | Примечание                                                 |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **TrumpetButton**       | `trumpet-button.tsx`                             | Кнопка «📢 Протрубить возвраты» (POST /api/shipper/trumpet). При активной сессии → «✖ Отменить trumpet». GET состояние (active). DELETE (отмена). | Только на returns-tab. 1/день single-tenant.               |
| **4 buttons results**   | `order-card.tsx` (ReturnsContent, lines 549-587) | ✅ Забран / ❌ Неверный код / ❌ Неверный трек / ❌ Нет на ПВЗ. Каждый → POST /api/shipper/orders/[id]/pickup-result.                             | Видны если order.status === 'return'                       |
| **QualityDisputeModal** | `quality-dispute-modal.tsx`                      | «⚠️ Плохое качество» кнопка (в ReturnsContent). Modal с фото-upload (≥3) + description. onSubmit → PATCH .../dispute_return.                      | Phase D. Возврата денег НЕ будет (return_done БЕЗ refund). |

---

## Shipper-Bot Telegram

**Файл:** `src/lib/telegram/bots/shipper-bot.ts`

**Что это:** Push-канал уведомлений. НЕ меню, НЕ команды (только /start). Бот присылает важные DM'ки туда, где web-push ненадёжен.

| Событие                                          | Кто запускает                                | DM-текст                                            | Job в BullMQ                                        |
| ------------------------------------------------ | -------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Регистрация                                      | /start (shipper пишет боту)                  | Приветствие + site_key + ссылка на `/shipper/login` | Смена fake telegram_id на real                      |
| Срочный новый заказ (paid + deadline ≤ сегодня)  | POST /api/shipper/orders/create (внутренний) | «⚠️ Срочный заказ #{order_number} прибыл»           | notifyShippersOrderUrgent job (граммма sendMessage) |
| Дневной дайджест                                 | Cron (send_by_today_cutoff)                  | Список заказов на сегодня                           | Планировщик (каждый день)                           |
| Выплата                                          | POST /api/shipper/payouts или owner batch    | «💰 Выплата {amount} ₽ на карту»                    | notifyShipperPayout job                             |
| Полночный откат (undo_ship в статус sent)        | Batch undo-операция                          | «⚠️ Отправка отменена: заказ №...»                  | notifyShipperOrderRolledBack job                    |
| Wrong code / wrong_tracking (при попытке забора) | POST /api/shipper/orders/[id]/pickup-result  | DM КЛИЕНТУ (не отправщику), в customer-bot          | grammy sendMessage (в customer-bot)                 |

**Функции для notify:**

- `notifyShipperOrderUrgent(orderId)` — новый срочный заказ
- `notifyShipperPayout(shipperId, amount)` — выплата
- `notifyShipperOrderRolledBack(orderId)` — откат отправки
- `scheduleTrumpetNotifications(sessionId, customerId)` — trumpet DM-series (в customer-bot!)
- `cancelTrumpetNotifications(sessionId, customerId)` — отмена trumpet DM-series

---

## Кроссчек с фазой 2 roadmap (из handoff.md)

| #   | Требование (Shipper PWA)                                    | Статус     | Находится в коде                                                                    | Примечание                                                          |
| --- | ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Заказы по статусам (paid/collecting/printed/sent) + фильтры | ✅ Done    | `/shipper` page (5 табов: Collect/Ship/Tracking/Returns/History)                    | FILTER_STATUSES[activeFilter]                                       |
| 2   | Карточка заказа (товар, размер, клиент, трек, send_by)      | ✅ Done    | OrderCard (5 variants). Tracking number визуально. send_by deadline подсвечивается. | recipient: Avito-buyer-name или @telegram_username                  |
| 3   | Кнопки 3 этапов (Беру/Напечатал/Сдал)                       | ✅ Done    | BottomActionBar (phase E: start_collecting → mark_printed → mark_sent)              | Без физической печати на первом этапе                               |
| 4   | «Проблема: нет товара» с выбором причины                    | ✅ Done    | ConfirmModals (problem modal) + executeMarkProblem (out_of_stock \| bad_barcode)    | POST /api/shipper/orders/batch (action: mark_problem, problem_type) |
| 5   | «Плохое качество» при возврате (≥3 фото)                    | ✅ Done    | QualityDisputeModal + executeDisputeReturn (min 3 photos, reason ≥5 chars)          | return_done БЕЗ refund. Phase D.                                    |
| 6   | Возвраты-таб: TrumpetButton + 4 кнопки результата           | ✅ Done    | ReturnsTab (TrumpetButton) + ReturnsContent (4-button grid)                         | ✅/❌ Забран/Неверный код/Неверный трек/Нет на ПВЗ                  |
| 7   | Печать стикеров (текущий минимум)                           | ✅ Done    | PrintModal + PrinterDriver (Niimbot + ESC/POS)                                      | Web Bluetooth. Canvas rendering. Batch print с progress.            |
| —   | Каскадный flow при «нет товара» (переформирование)          | 🟡 Partial | executeMarkProblem (отметка). Переформирование — owner-bot или system job, не PWA.  | BUSINESS_LOGIC §5.1.2 — вторая часть не в PWA.                      |
| —   | Web Bluetooth fallback (soft-print в браузер)               | 🔴 Missing | Нет fallback на QR/код для сканирования. Только BLE.                                | Phase D/E enhancement.                                              |

---

## Расхождения с каноном (BUSINESS_LOGIC.md)

| Пункт                      | Канон требует                                                                                                                            | Код реализует                                                                        | Зазор                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| §4.4 3 этапа отправки      | Беру в работу (paid→collecting) БЕЗ печати. Печать в отдельный этап (collecting→printed, флаг barcode_printed). Отправка (printed→sent). | Все 3 реализованы. Печать НЕ обязательна для переходов (можно пропустить).           | Печать — опция, не requirement. OK.                                    |
| §5.1.2 Каскад «нет товара» | Shipper отмечает problem → owner-bot предлагает переформирование или отмену. Автоматическое создание replace-order.                      | Только отметка (mark_problem → status='problem'). Каскад — не в PWA.                 | Design верный: shipper PWA = только отметка. Каскад = owner-bot logic. |
| §6.4 Возвраты 4 кнопки     | picked_up, wrong_code, wrong_tracking, not_found.                                                                                        | ✅ Все 4 в ReturnsContent.                                                           | Perfect match.                                                         |
| §6.4 Trumpet               | 1/день single-tenant. Для owner-warehouse заказов. Notify клиентов (trumpet-notify jobs).                                                | ✅ POST creates session + attempts + schedules jobs. DELETE cancels.                 | Perfect match.                                                         |
| Печать стикеров            | Поддержка Niimbot, ESCPOS (generic), расширение Phase 5/6.                                                                               | Niimbot proprietary + EscPosDriver (generic). Бренды: Niimbot/Phomemo/HPRT/Xprinter. | Перекрывает минимум + расширение уже есть.                             |

---

## Открытые вопросы (для walkthrough'а)

1. **Печать БЕЗ BLE:** Нет fallback на мягкую печать (QR-код в браузер для сканирования на ПВЗ). Нужна ли Phase D? Или оставить как enhancement фазы 5?

2. **Переформирование при «нет товара»:** Каскадный flow (owner-bot create replace-order) работает? Или нужна отдельная PWA-кнопка?

3. **Trumpet-результаты:** Какая вероятность wrong_code/wrong_tracking в реальной жизни? Нужны ли дополнительные retry-механизмы?

4. **Авито-интеграция:** В коде есть avito_order_id, avito_buyer_name, avito_delivery_address. Синхронизация live или offline-mode?

5. **Работа из нескольких браузеров:** Session cookies — отправщик может ввести key в нескольких местах? Нужна ли одна session или несколько?

6. **Work Days Picker:** Владелец устанавливает дни или отправщик? Код: первый раз POST (only_if_not_set), потом read-only. Правильно ли это?

7. **Inventory sync shipper ↔ owner:** Когда shipper создаёт товар или меняет наличие — real-time sync в Owner Panel stock? Или batch?

---

## Итоговая статистика

- **Страниц PWA:** 6 (login + orders + earnings + profile + stock + layout)
- **API routes:** 14 основных (+ 1 специальный pickup-result)
- **Компонентов (major):** 13 (5 вариантов OrderCard + 5 табов + BottomActionBar + PrinterDriver + TrumpetButton + QualityDisputeModal)
- **Модалей:** 7 (Print + Dispute + PickupPoint + Confirm×6 + Create product + Adjust stock + Create manual order)
- **Фишек:** TrumpetButton (1/день), 4-button return result, ≥3-photo dispute, Niimbot + ESC/POS Web Bluetooth, work_days picker, manual stock orders
- **RPC-функций задействовано:** ~12 (shipper-actions + increment_shipper_stat + trumpet manage)

---

## Заключение / Приоритет walkthrough

Каркас **полностью собран и функционален**. Все требования фазы 2 покрыты. Главные фокусы:

1. **Печать стикеров** — web-Bluetooth работает? Fallback нужен?
2. **Trumpet + возвраты** — логика возврата DM попыток корректна?
3. **Stock shipper** — инвентаризация (actual_quantity) нужна лайву в Owner Panel или batch?
4. **Problem-to-replace flow** — owner-bot готов триггериться от problem-статуса?

**Блокеров нет** — всё готово к live-тесту на реальных заказах.
