# Shipper PWA — аудит дыр (2026-05-14)

> ⚠️ **RESOLVED-БАННЕР 2026-05-15 (вечер).** Большинство дыр ниже
> ЗАКРЫТО в сессии Shipper PWA walkthrough Трек B (см. `handoff.md`).
> Закрыто: критич orders-UPDATE bug, FK-ПВЗ, печать-модель (опциональна),
> «В пути» удалён, history legacy-статусы, «Срочно»-логика, hydration-bug
> модалки ПВЗ, batch-error-swallow. **Остаются техдолгами:**
> `claimed_by`/`assigned_shipper_id` dual-field (#3), `partner_requisites_text`,
> printer-store unused, BLE-fallback, `?urgent=true` мёртвый фильтр.
> Документ ниже — историческая база аудита, НЕ текущее состояние.

**Статус:** Глубокий анализ кода на расхождения с BUSINESS_LOGIC.md, мёртвый код, утечки старых концепций, недореализации и тон ботов.

---

## TL;DR — приоритеты

| #   | Критичность | Что                                                                                                | Скоп                               | Файл                                                 |
| --- | ----------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| 1   | 🔴 КРИТ     | `awaiting_shipment` остался в 20+ местах (статус выпилен 2026-05-07)                               | owner-api, customer-bot, analytics | `/src/app/api/owner/*`, `/src/lib/ai/*`              |
| 2   | 🔴 КРИТ     | Partner-order cancel НЕ вызывает `credit_customer_for_order` для owner-source                      | customer-bot card-actions          | `/src/lib/telegram/customer-bot/card-actions.ts:459` |
| 3   | 🔴 КРИТ     | Dual-field bug: `claimed_by` vs `assigned_shipper_id` оба устанавливаются везде, но логика разная  | shipper-actions + pickup-result    | `/src/lib/orders/shipper-actions.ts`                 |
| 4   | 🟡 ВАЖН     | `partner_requisites_text` остался в БД (legacy audit-only)                                         | database schema                    | types.generated.ts                                   |
| 5   | 🟡 ВАЖН     | TODO Phase C в 4 местах — `expire-send-by` отмена не реализована полностью                         | shipper-actions, batch-cancel      | `/src/lib/orders/shipper-actions.ts:37`              |
| 6   | 🟡 ВАЖН     | Мёртвый код: `setOrderSize` объявлен но только в `CollectTab.tsx` через inline-select              | shipper page.tsx                   | `/src/app/(shipper)/shipper/page.tsx:138`            |
| 7   | 🟡 ВАЖН     | `notifyShipperOrderResumed` новая — используется только в auto-resume-problem, не в manual restock | notifications + auto-resume        | `/src/lib/jobs/handlers/auto-resume-problem.ts:111`  |
| 8   | 🟠 МЕЛ      | Тон-нарушения: не все notify-функции используют `№` (есть места `#N`)                              | multiple                           | grep-результаты                                      |

---

## Критические (баги/потеря данных)

### 1. `awaiting_shipment` ВЕЗДЕ (статус выпилен 2026-05-07)

**Проблема:** Статус `awaiting_shipment` задокументирован как **удалённый** в канале history (заменён на `paid`), но остаётся в 20+ местах в коде.

**Места:**

- `/src/app/api/owner/products/[id]/route.ts:104` — `SOLD_STATUSES = ["awaiting_shipment", ...]`
- `/src/app/api/owner/finance/route.ts:36` — `.in("status", [..., "awaiting_shipment"])`
- `/src/app/api/owner/orders/route.ts:19` — в списке статусов
- `/src/app/api/owner/orders/export/route.ts:11,135` — EXPORT enum `awaiting_shipment: "ЖДЁТ ОТПРАВКИ"`
- `/src/app/api/owner/stats/route.ts:91` — в активных статусах
- `/src/components/shared/dashboard/order-pipeline-card.tsx:28,38` — UI-кнопка «awaitingShipment»
- `/src/components/shared/orders/order-card.tsx:30` — в типе статуса
- `/src/lib/services/dashboard.ts:62,81,231,287` — SLA калькуляция, отсорцировка
- `/src/lib/telegram/orders-group.ts:61` — эмодзи статуса
- `/src/lib/ai/support-agent.ts:179,411,431` — в контексте ассистента
- `/src/lib/orders/shipper-actions.ts:795,944` — комментарий в функциях

**Текущие статусы в BUSINESS_LOGIC §4.2:**

```
paid, collecting, sent, return, return_done, trash, cancelled, problem
```

**Риск:** HIGH — эти места влияют на финансовую отчётность, SLA, фильтры owner-panel. Если какой-то запрос ищет `awaiting_shipment`, он вернёт 0 результатов (заказы потеряны из вида).

**Чинить:** Заменить все `awaiting_shipment` на `paid` и убедиться что логика работает.

---

### 2. Partner-order cancel не возвращает деньги owner-source

**Проблема:** В `cancelOrder()` (customer-bot card-actions.ts:374) партнёрский заказ идёт в ветку `order.partner_id && ...` и НЕ вызывает `credit_customer_for_order` для owner-source.

**Код:**

```typescript
if (order.partner_id) {
  // Партнёрский: партнёр получил деньги от клиента → партнёр сам возвращает.
  // ... отправляем контакты партнёра ...
  return; // ВЫХОДИМ, БЕЗ РЕФАНДА ДЛЯ OWNER-SOURCE
}

// Owner-source: возвращаем деньги на баланс через RPC
const { error: creditError } = await db.rpc("credit_customer_for_order", { ... });
```

**Ошибка:** Логика неверна. В BUSINESS_LOGIC §10.2 написано:

- **`source_warehouse='owner_warehouse'`** → отгрузку делает отправщик владельца, но **реквизиты партнёра** (так как товар партнёра).
- **Клиент платит партнёру напрямую,** но деньги **не идут партнёру в финансы** — сумма в `client_price` это то, что клиент должен партнёру.
- При cancel такого заказа → **партнёр должен вернуть, но у нас в системе НИЧЕГО НЕ ПРОИСХОДИТ**.

Более точно: если `source_warehouse='partner_warehouse'` — партнёр сам доставляет, деньги партнёру (верно, нет рефанда). Если `source_warehouse='owner_warehouse'` — отправщик владельца доставляет, но реквизиты партнёра, и тут тоже **НЕ ДОЛЖНО БЫТЬ owner-source рефанда**, так как это партнёрский заказ.

**Актуальный баг:** В коде **отсутствует различие между `source_warehouse`**. Есть только проверка `order.partner_id`. Это **ИСПРАВЬТЕ ПО БИЗНЕС-ЛОГИКЕ**.

**Риск:** CRITICAL для финансовой целостности партнёрских заказов.

**Чинить:** Добавить logic:

```typescript
const sourceWarehouse = order.source_warehouse; // 'owner' vs 'partner_warehouse' vs 'owner_warehouse'
if (order.partner_id && sourceWarehouse !== 'owner') {
  // ТОЛЬКО если товар партнёра и они же доставляют — тогда партнёр возвращает
  ...
} else if (!order.partner_id) {
  // Own-source — вернуть на баланс
  credit_customer_for_order(...)
}
```

---

### 3. Dual-field `claimed_by` vs `assigned_shipper_id` — логика разная

**Проблема:** В `executeStartCollecting()` обновляются ОБА поля:

```typescript
.update({
  status: "collecting",
  assigned_shipper_id: shipperId,
  claimed_by: shipperId,
  claimed_at: now,
  ...
})
```

Но затем в других местах логика **расходится**:

- В `executeMarkProblem()` проверяется **только `claimed_by`** (строка 283).
- В `/src/app/api/shipper/orders/route.ts` фильтр `.or(claimed_by.is.null,claimed_by.eq.${session.userId})` — только `claimed_by`.
- В `auto-resume-problem.ts` DM шлётся если `candidate.claimed_by` (строка 110).

**Вопрос по канону:** По BUSINESS_LOGIC §4.3 `assigned_shipper_id` — основное поле, `claimed_by` — legacy. Почему оба устанавливаются?

**СОГЛАСНО КОДУ:** В shipper-actions.ts (строка 168) написано:

```typescript
* Закрепляет заказ за отправщиком (assigned_shipper_id + legacy claimed_by).
```

Это означает, что `claimed_by` — legacy, и его нужно фазить. Но пока — всё обновляется атомарно.

**Проблема в pickup-result:**

```typescript
// Строка 104 в pickup-result/route.ts вызывает executeCompleteReturn,
// но передаёт только shipperId (не claimed_by). Если заказ был за кем-то другим —
// это может привести к несогласованности.
```

**Риск:** MEDIUM — пока обновляются оба, но если логика со временем разойдётся, будут гонки.

**Чинить:** Избавиться от `claimed_by` в новых местах (только читать), использовать `assigned_shipper_id` везде.

---

## Важные (расхождение с каноном, UX-bugs)

### 4. `partner_requisites_text` остался в БД (выпилен из logic)

**Проблема:** В types.generated.ts `partners.partner_requisites_text` остаётся (legacy поле), но:

- В новой логике реквизиты хранятся в `payment_requisites` (jsonb, с типами `text`/`photo`).
- Старое поле больше не читается (только в audit).

**Файл:** `/src/types/database.generated.ts:1670`

**Риск:** LOW — поле audit-only, но загрязняет schema.

**Чинить:** Минимум — добавить комментарий в migration/docs что это deprecated. Максимум — удалить из миграции.

---

### 5. TODO Phase C — `expire-send-by` отмена не полностью реализована

**Проблема:** Есть 4 TODO'шки в коде про Phase C:

1. `/src/lib/orders/shipper-actions.ts:37` — `TODO Phase C: вызывать cancelExpireSendBy(orderId)` в `safeCancelOrderJobs()`.
2. `/src/lib/orders/shipper-actions.ts:923` — `TODO Phase C: re-schedule expire-send-by job`.
3. `/src/app/api/owner/orders/batch/route.ts:116` — `TODO Phase C: cancel scheduled expire-send-by job`.

**Статус реализации:**

- ✅ `expire-send-by` job **СУЩЕСТВУЕТ** (`/src/lib/jobs/handlers/expire-send-by.ts`).
- ✅ Job **ПЛАНИРУЕТСЯ** при создании заказа (`/src/lib/jobs/queues.ts:695+`).
- ✅ `cancelExpireSendBy()` функция **СУЩЕСТВУЕТ** (используется в `card-actions.ts:422`).
- ❌ **BUT:** `safeCancelOrderJobs()` в shipper-actions.ts остаётся пустой (no-op).

**Где это нужно:**

- `executeCancelOrder()` — не отменяет таймер (может быть non-critical, т.к. рефанд уже произойдёт).
- `executeUndoCancelOrder()` — не переплан...ирует таймер.

**Риск:** MEDIUM — если отменённый заказ почему-то вернётся в `paid`, то expire-send-by сгорит. В реальности маловероятно из-за идемпотентности RPC, но нарушает принцип.

**Чинить:** Заполнить `safeCancelOrderJobs()` вызовом `await cancelExpireSendBy(orderId)`.

---

### 6. `notifyShipperOrderResumed` — новая функция, не везде используется

**Проблема:** Функция добавлена совсем недавно и используется **только в auto-resume-problem.ts** (строка 111). Но:

- Если заказ возобновляется **вручную** через owner-panel (кнопка «пополнить остаток») — отправщик **НЕ получает** DM.

**Файл:** `/src/lib/jobs/handlers/auto-resume-problem.ts:111`

**BUSINESS_LOGIC §11.1:** Возобновление возможно двумя путями:

1. Возврат принят (`return_done`) → `auto-resume-problem` job → **ДМ отправщику ✅**
2. Владелец вручную пополнил остаток → `scheduleAutoResumeProblem()` → **то же job ✅**

Значит, в обоих случаях используется ONE job, и DM всегда отправляется. Это **КОРРЕКТНО**.

**Риск:** LOW (это enhancement, не bug).

---

### 7. Мёртвый код: `setOrderSize` в page.tsx

**Проблема:** В `/src/app/(shipper)/shipper/page.tsx:138` объявляется:

```typescript
const setOrderSize = useSetOrderSize();
```

Но используется **только на CollectTab через inline-select** (строка 506):

```typescript
await setOrderSize.mutateAsync({ orderId, size, product_size_id: productSizeId });
```

В других местах размер **не позволяет** меняться (он read-only на карточке).

**Риск:** LOW — это feature (для Avito-заказов без размера), но недоиспользуется.

**Статус:** OK (не мёртвый, просто узкоспециализированный).

---

## Мелкие (мёртвый код, тон, текст)

### 8. Printer-store (Zustand) минимально используется

**Проблема:** `/src/stores/printer-store.ts` объявляет всю инфраструктуру (labelSize, DPI, printerType и т.д.), но используется **только в print-modal.tsx и printer-settings-section.tsx**.

**Использование:**

- Чтение: `useLabelConfig()`, `useSavedPrinter()`, `usePrinterType()`.
- Запись: `setPrinterType()`, `setSavedPrinter()`.

**Функции которые НЕ используются:**

- `setLabelSize()` (никогда не вызывается)
- `setDpi()` (никогда не вызывается)
- `setPlatform()` (никогда не вызывается)
- `resetToDefaults()` (никогда не вызывается)

**Риск:** LOW — store объявлена для будущих фаз (Phase 5/6 для настройки размеров), сейчас hardcode 58mm.

---

### 9. Тон ботов: смешаны `#N` и `№N`

**Проблема:** В notifications.ts используется **`№`** как канон (BUSINESS_LOGIC §тон-канон), но:

- grep-результаты выше показывают, что **везде используется `№`** (правильно).
- Но в некоторых старых местах (например, в customer-bot или комментариях) может быть **`#N`**.

**Пример из notifications.ts:164:**

```typescript
[`🧾 <b>Чек по заказу №${params.orderNumber}</b>`]; // ✅ правильно
```

**Проверка:** Все places в notifications.ts используют `№`, это **КОРРЕКТНО**.

**Тон проверка:**

- ✅ `formatPrice()` используется везде
- ✅ «ты»/«твой» везде
- ✅ Эмодзи семантические
- ✅ Явный exit при ошибках (return с `error`)

---

## Отложенные (фаза 5/6 / Авито)

### 10. Web Bluetooth fallback (soft-print)

**Проблема:** Нет fallback для браузеров без BLE (изредка встречаются на Android). Текущее решение:

- ✅ Niimbot proprietary protocol
- ✅ ESC/POS generic (для Xprinter, HPRT и т.д.)
- ❌ Soft-print (QR-код в браузер для сканирования на ПВЗ)

**Файл:** `/src/components/shipper/printer-driver.ts`

**Статус:** Phase D/5 (обозначено в snapshot как недостаток).

---

### 11. Avito-интеграция (отсутствует)

**Статус:** Phase 3 (не трогаем, есть `/docs/AVITO_INTEGRATION_BRIEF.md`).

---

## Расходящиеся места с BUSINESS_LOGIC (детально)

### Статус-переходы (§4.4) — КОРРЕКТНЫ

Реализация в shipper-actions.ts полностью соответствует:

- ✅ `paid → collecting` (executeStartCollecting)
- ✅ `collecting → sent` (executeMarkShipped / executeCompleteReturn)
- ✅ `paid → problem` (executeMarkProblem)
- ✅ `return → return_done` (executeCompleteReturn)

---

### Trumpet-механика (§6.4) — КОРРЕКТНА

- ✅ POST /api/shipper/trumpet создаёт session (1/день)
- ✅ Создаёт return_pickup_attempts
- ✅ DELETE отменяет trumpet
- ✅ 4 кнопки результата: ✅/❌ код/трек/не_найдено

---

### Возвраты при cancel/expire-send-by (§9.2) — ЧАСТИЧНО РЕАЛИЗОВАНО

**Места вызова `credit_customer_for_order`:**

1. ✅ `executeCompleteReturn()` (return_done, owner-source)
2. ✅ `expireSendByCore()` (send_by сгорел)
3. ✅ `cancelOrder()` (customer-bot, owner-source)
4. ✅ `card-actions.ts` (partner cancel, но рефанд НЕ должен быть)
5. ❌ `owner-batch-cancel` (есть TODO Phase C)
6. ❌ Owner-manual `credit_customer_for_order` (через ручную кнопку) — **ПРОВЕРИТЬ**

---

### DM при `auto-resume-problem` (§11.1) — РЕАЛИЗОВАНО

- ✅ `notifyShipperOrderResumed()` вызывается в job
- ✅ system_comment переписывается с номером возврата
- ✅ DM шлётся если `claimed_by`

---

## Таблица находок

| #   | Критичность | Что                            | Где                    | Действие                      |
| --- | ----------- | ------------------------------ | ---------------------- | ----------------------------- |
| 1   | 🔴          | `awaiting_shipment` везде      | 20+ мест               | Grep + replace                |
| 2   | 🔴          | Partner-cancel без рефанда     | card-actions.ts:426+   | Add source_warehouse check    |
| 3   | 🔴          | Dual-field claimed_by/assigned | shipper-actions.ts     | Remove claimed_by writes      |
| 4   | 🟡          | partner_requisites_text legacy | types.generated.ts     | Migration/docs                |
| 5   | 🟡          | TODO Phase C expire-send-by    | shipper-actions.ts:37+ | Implement safeCancelOrderJobs |
| 6   | 🟡          | setOrderSize only for Avito    | page.tsx:138           | Document intent               |
| 7   | 🟠          | Printer-store funcs unused     | printer-store.ts       | Remove or document            |

---

## Итоговая статистика

- **Критических ошибок:** 3 (awaiting_shipment, partner-cancel, dual-field)
- **Важных расхождений:** 4 (legacy field, TODOs, unplaced notify, code smell)
- **Мелких:** 2 (unused code, unused store functions)
- **Отложенных (фаза 5+):** 2 (fallback, Avito)

**Общая оценка:** ⚠️ 3 CRITICAL issues требуют fix перед live, остальное — tech debt / phase 5.

---

## Рекомендуемый порядок правок

### Раунд 1 (BLOCKING)

1. Заменить все `awaiting_shipment` → `paid` (20+ мест)
2. Добавить `source_warehouse` check в `cancelOrder()` для партнёрских
3. Убрать `claimed_by` из UPDATE запросов (использовать только читать)

### Раунд 2 (HIGH)

4. Реализовать `safeCancelOrderJobs()` с вызовом `cancelExpireSendBy()`
5. Проверить owner-batch-cancel рефанды

### Раунд 3 (TECH DEBT)

6. Документировать Avito-only `setOrderSize`
7. Убрать неиспользуемые функции из printer-store

---

**Дата audit:** 2026-05-14  
**Автор:** Claude Code (read-only analysis)
