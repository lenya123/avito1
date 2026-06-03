# Avito Integration — Phase 3 entry point

> **Phase 3.** Авито-интеграция: подключение магазинов владельца на
> Авито к нашей системе. Включает: синхронизация заказов с Авито-API,
> AI-продажник в чатах Авито от лица продавца, отдельные ценники Авито
> vs дроп, обработка возвратов и доставки.

Этот файл — **общий entry point** для команды, начинающей работу над
фазой 3. Бизнес-канон в [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md)
поддерживается параллельно (раздел §15 — создаётся в этой фазе как
доказательство решений).

> **AI-автогенерация обложек + поток создания объявления** (реализовано) —
> отдельный документ [`AVITO_COVER_AUTOGEN.md`](AVITO_COVER_AUTOGEN.md)
> (поток, данные, карта файлов, что доделать).

## Контекст

Владелец продаёт со своих Авито-магазинов параллельно с дропом для
клиентов в Telegram:

- **Дроп-заказ:** клиент в Telegram → owner-bot/customer-bot →
  оформление в системе → отгрузка отправщиком → клиент перепродаёт на
  Авито под своим лицом.
- **Авито-заказ:** покупатель на Авито → owner отвечает в Авито-чате
  (с помощью AI-продажника) → заказ синхронизируется к нам через
  Авито-API → отгрузка отправщиком → клиент-покупатель Авито не
  попадает в наш Telegram-бот (общение только через Авито-чат).

Оба типа заказов попадают в одну таблицу `orders` с
`source = 'manual' | 'avito' | ...` (см. **Open Q1** ниже —
окончательное решение принимается в этой фазе).

## Цели фазы

1. **Полная синхронизация заказов с Авито-API** (push/pull) —
   `sync-avito-orders`, `sync-avito-today-stats`, и т.п. (BullMQ-jobs
   уже зарегистрированы в `src/lib/jobs/queues.ts`, см. ниже).
2. **AI-продажник** в чатах Авито — отдельный документ
   `docs/AI_SALES_PRINCIPLES.md` создаётся в этой фазе.
3. **Отдельные ценники Авито** (если решено через `products.avito_price`
   или отдельную таблицу).
4. **Возвраты Авито** — отдельный flow, отличается от дроп-возвратов
   (см. §6/§11.1 канона + список ниже).
5. **Не сломать дроп-flow** при добавлении Авито-веток — список мест
   разветвления ниже.

## С чего начинать

1. Прочитать **этот файл целиком** + связанные секции канона
   [`BUSINESS_LOGIC.md`](BUSINESS_LOGIC.md) (контекст ролей, статусы,
   возвраты — особенно §6/§11/§15).
2. Принять решения по **Open Questions** в конце файла (Q1–Q4) —
   они блокируют структуру.
3. Создать `docs/AI_SALES_PRINCIPLES.md` (если AI-часть в фокусе) —
   как Авито-продажник общается, чем отличается от обычной поддержки.
4. Поднять Авито-API креды, проверить sandbox, наладить полный цикл
   sync на одном тестовом магазине.
5. Заполнить TODO-блоки ниже по мере реализации, фиксировать решения
   в канон (`BUSINESS_LOGIC.md` §15).

## Поля уже в БД (готовы под Авито)

- `orders.source` — `'manual' | 'avito' | …` (string enum).
- `orders.avito_order_id` — string | null.
- `orders.avito_buyer_name` — string | null.
- `orders.avito_delivery_address` — string | null.
- `orders.expected_return_date` — date | null (для Авито-возвратов
  приходит из API).
- `orders.tracking_number` — string | null (для Авито мы генерируем
  стикер из их API).

## Места где логика уже различает дроп vs Авито

| Файл / строка                                       | Что делает                      | Дроп               | Авито                                                                                    |
| --------------------------------------------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `src/components/shipper/order-card.tsx:202`         | Бейдж «Авито #N»                | hidden             | показ avito_order_id                                                                     |
| `src/components/shipper/order-card.tsx:215`         | Заголовок карточки              | client.tg_username | «Авито #N»                                                                               |
| `src/components/shipper/order-card.tsx:233`         | Имя получателя                  | tg_username        | avito_buyer_name                                                                         |
| `src/components/shipper/order-card.tsx:293,370,528` | Адрес доставки + ссылка в Авито | hidden             | avito_delivery_address + ссылка `https://avito.ru/profile/items/orders/{avito_order_id}` |
| `src/components/shipper/label-generator.ts:513`     | Генерация стикера               | tg_username        | avito_buyer_name                                                                         |

## Места где логика **должна** различать (TODO для фазы 3)

### 1. Подбор возврата при `out_of_stock` (см. §11.1 канона)

`src/lib/orders/shipper-actions.ts` — функция `executeMarkProblem`,
ветка `out_of_stock`. Сейчас:

```ts
const effectiveArrival = r.expected_return_date ?? today;
return effectiveArrival <= sendByDate;
```

**Дроп**: `expected_return_date=NULL` означает «клиент сам отметил —
возврат уже на ПВЗ» → берём `today` как эффективную дату.

**Авито**: `expected_return_date` приходит из Авито-API live (точная
дата прибытия). NULL у Авито-возврата — это **аномалия**, а не «уже на
ПВЗ». Возможно нужна отдельная ветка
`if (r.source === 'avito' && r.expected_return_date === null) skip;`

### 2. Уведомление клиенту о проблеме

`src/lib/telegram/notifications.ts` — `notifyCustomerOrderProblem`.
Сейчас: шлёт DM в customer-bot. **Авито-покупатель НЕ в нашем боте** —
общение через Авито-чат. Нужен sync через Авито-API:
`avito.sendMessage(avito_order_id, text)`. Альтернатива — оставить без
уведомления (Авито сам пингует продавца, владелец вручную пишет).

### 3. Возвраты — TrumpetButton vs Авито-flow

`src/app/api/shipper/trumpet/route.ts` — TrumpetButton триггерит
trumpet-notify jobs клиентам. Для Авито — клиент не в боте, jobs
бессмысленны. **Решение фазы 3**: фильтровать trumpet-сессию по
`source != 'avito'`.

### 4. `bad_barcode` для Авито

Концептуально другой кейс. **Дроп**: клиент сам прислал трек, который
не сканируется → текст клиенту «пришли новый трек». **Авито**: трек —
наш собственный (генерируем стикер из Авито-API). Если не сканируется
— проблема в **наших** этикетках, а не у клиента. Нужна другая ветка
текста + возможно другой UI отправщику.

### 5. Refund при отмене (см. §9.2)

`src/lib/orders/shipper-actions.ts` — `executeCancelOrder` +
`src/lib/jobs/handlers/expire-send-by.ts`. Сейчас: рефанд на
`customer_balance` через RPC `credit_customer_for_order`. **Авито**:
у Авито-покупателя нет нашего `customer_balance` — нужен refund через
Авито-API в их экосистеме. Для Авито-заказов RPC вызывать НЕ нужно
(условие `if (order.source === 'avito') skip credit`).

### 6. Каталог + товары

В фазе 3 появятся **отдельные ценники Авито vs дроп**. Поле
`products.avito_price` или отдельная таблица `product_avito_listings`
— решается тогда же.

## BullMQ-jobs (готовые / стабы)

В `src/lib/jobs/queues.ts` уже зарегистрированы (handler'ы скорее
всего скелеты — пишутся в фазе 3):

- `sync-avito-data`
- `sync-avito-today-stats`
- `sync-avito-orders`
- `avito-login`
- `generate-sales-draft` — AI-черновик ответа покупателю
- `send-approved-draft` — отправка одобренного владельцем драфта
- `learn-from-corrections` — fine-tune AI на правках владельца
- `aggregate-sales-stats`

Активируются только при `AVITO_ENABLED=true`.

## Не сломать при правках вне фазы 3

Любые изменения в `src/lib/orders/shipper-actions.ts`,
`src/lib/telegram/notifications.ts` (особенно customer-уведомления),
`src/app/api/shipper/trumpet/route.ts` — проверять что Авито-ветка
(условия с `order.source === 'avito'`) не задета. Сейчас Авито-заказов
в проде нет, но рефакторинги могут оставить грабли для активации.

## ✅ Закрыто (2026-05-30, цикл 1 ТЗ Авито-заказы)

Резолюции зафиксированы в `BUSINESS_LOGIC.md §15`. Что сделано:

- ✅ **Единая `orders` с `source='avito'`** (Q1) — миграции 20260530000001..05.
- ✅ **Статусы**: `awaiting_size`, `delivered`, `return_in_transit` добавлены
  в OrderStatus + CHECK + state machine + label/color/badge/emoji-словари.
- ✅ **Финансы**: `ownerCost` учитывает `avito_fee_snapshot` +
  `avito_marketing_snapshot`. `isRevenueCounted` расширен.
- ✅ **Sync**: `src/lib/avito/order-sync.ts` — mapper + upsert в общую
  `orders`. Интеграция в `sync-avito-orders` handler с lookup
  mapping'а и `purchase_price`.
- ✅ **Мини-AI**: `avito-request-size` (шлёт шаблон),
  `avito-process-awaiting-size` (poll каждые 2м — парсит, резервирует
  через RPC `avito_confirm_size_and_reserve`, шлёт thanks, эскалирует
  таймаут/промахи).
- ✅ **Размер-парсер**: `src/lib/avito/size-parser.ts` (regex + словарь
  синонимов).
- ✅ **Skip-механики для Avito** через `customer_id IS NULL`:
  - `credit_customer_for_order` (Refund при отмене, §5 ниже) — пассивно.
  - Trumpet sessions/notify (§3 ниже) — пассивно.
- ✅ **Канон §15** написан полностью.
- ✅ **UI**: `LogisticsTimeline` компонент (`src/components/owner/orders/`).

## Открытые TODO для следующего цикла

- Cancel-endpoint Авито API (наш cancel → API).
- Генерация Avito-стикера: при `awaiting_size → paid` `tracking_number` /
  `barcode_image_url` подтягивать из `delivery_details.barcodeUrl` /
  `parcelId` (раскрутка из avito_orders).
- `executeMarkProblem` в `src/lib/orders/shipper-actions.ts` —
  выборку расширить `IN ('return', 'return_in_transit')` + условие
  `expected_return_date <= send_by - 1` для Avito-возвратов.
- `bad_barcode` для Avito — отдельный текст (наш стикер).
- DM-helpers: эскалация в мини-AI (директор/владелец), значимые
  события логистики (`delivered`, `return_*`).
- UI остаток: timeline-интеграция в `/owner/orders/[id]`, фильтр
  «ждёт размера» и Avito-бейдж в `/owner/orders`, toggle Дроп/Авито
  на `/owner/analytics` + `/owner/finance`, карточка «Каналы сбыта»,
  компактный timeline в Shipper PWA.

## Open Questions для фазы 3

1. **Q1.** Одна таблица `orders` с `source='avito'` или отдельная
   сущность? — влияет на все API, аналитику, статусы.
2. **Q2.** Куда складывать диалог продавец ↔ Авито-покупатель —
   синхронизировать с нашим Telegram или хранить в Авито?
3. **Q3.** Fees Авито считаем как `partner_commission` или отдельное
   поле?
4. **Q4.** Возвраты Авито — как отслеживаем `expected_return_date`
   (push из API или периодический sync-job)?
   - **Заметка (2026-05-26):** Авито-возвраты, в отличие от дроп-возвратов,
     будут иметь промежуточный статус «возврат-в-пути» с известной
     `expected_return_date`. Когда это будет, расширить подбор
     возвратов под problem-заказы: учитывать возвраты-в-пути,
     при условии что `expected_return_date ≤ send_by - 1 день`
     (день-в-день не подставлять, иначе риск не успеть). Сейчас
     (до Авито) на дроп-заказах берём только уже приехавшие
     возвраты в статусе `return`.
5. **Q5.** AI-продажник: модель (Claude / GPT / yandex-llm), стоимость
   на тысячу обращений, доменный тюнинг, как фиксируем человеческие
   правки для retraining.

Решения фиксируются в канон (§15) и в этом файле как ✅ closed.
