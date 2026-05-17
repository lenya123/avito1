# Бизнес-логика

## Система уровней клиентов

| Уровень | Заказов (completed) | Скидка |
| ------- | ------------------- | ------ |
| 0       | 0-14                | 0%     |
| 1       | 15-29               | 3%     |
| 2       | 30-49               | 6%     |
| 3       | 50+                 | 10%    |

**Правила:**

- Считаются только `completed` заказы
- Минимум 24 часа между созданием и завершением (защита от накрутки)
- Скидка от `drop_price` товара
- Уровень не понижается
- При повышении — уведомление в Telegram

```typescript
async function recalculateLevel(userId: string) {
  const completedOrders = await db.orders.count({
    where: {
      client_id: userId,
      status: "completed",
      completed_at: { gt: db.raw("created_at + INTERVAL '24 hours'") },
    },
  });

  const level =
    completedOrders >= 50 ? 3 : completedOrders >= 30 ? 2 : completedOrders >= 15 ? 1 : 0;

  const discount = level >= 3 ? 10 : level === 2 ? 6 : level === 1 ? 3 : 0;

  return { level, discount, completedOrders };
}
```

---

## Скидка 500₽ для новых клиентов

- **Всем** новым клиентам на **первый** заказ
- Поле `users.first_order_discount_used = false` для новых
- После оформления первого заказа → `true`
- Скидка вычитается из `drop_price`

---

## Система +ВАЙБ

### Что даёт:

- **Автоматически уровень 3** и скидка 10%
- Заказы без предоплаты (в долг)
- Лимит минуса до 100 000₽
- Доступ к premium товарам

### Поля в users:

```
is_vibe_plus = true
deposit_limit = 100000
vibe_plus_granted_by = UUID владельца
vibe_plus_granted_at = timestamp
```

### Логика заказа:

```typescript
async function canCreateOrder(userId: string, price: number) {
  const user = await getUser(userId);

  const availableBalance = user.deposit + user.referral_deposit;

  if (availableBalance >= price) {
    return { allowed: true, method: "deposit" };
  }

  if (user.is_vibe_plus) {
    const vibeAvailable = availableBalance + user.deposit_limit;
    if (vibeAvailable >= price) {
      return { allowed: true, method: "vibe" };
    }
  }

  return { allowed: false, reason: "insufficient_funds" };
}
```

### Правила +ВАЙБ:

- Лимит долга: 100 000₽ (владелец может изменить индивидуально)
- При превышении лимита — блокировка новых заказов

---

## Реферальная система

### Механика:

1. У каждого клиента есть `referral_code`
2. Новый клиент вводит код при регистрации (через Telegram бот `/start {code}`)
3. Создаётся запись в `referral_bonuses`
4. Все выплаты происходят **мгновенно** при завершении заказа реферала (статус `completed`)

### Бонус 500₽ за приглашённого:

- После **первого завершённого** заказа реферала
- Начисляется **сразу** на `referral_deposit`

### Процентный бонус 7%:

- От каждого успешного заказа реферала в течение 60 дней
- Начисляется **сразу** на `referral_deposit` при завершении заказа
- Максимум 7000₽ за одного реферала
- После 60 дней реферальный период деактивируется (BullMQ job)

### Защита от фрода:

- Нельзя ввести код после регистрации
- Fingerprinting (защита от мультиаккаунтов)
- Проверка IP
- Бонусы начисляются только за успешные (`completed`) заказы

```typescript
async function processReferralBonus(clientId: string, orderPrice: number) {
  const bonus = await db.referralBonuses.findFirst({
    where: { referral_id: clientId, is_active: true },
  });

  if (!bonus) return;

  // 500₽ за первый успешный заказ
  if (!bonus.first_order_bonus_paid) {
    await db.users.update({
      where: { id: bonus.referrer_id },
      data: { referral_deposit: { increment: 500 } },
    });
    await db.referralBonuses.update({
      where: { id: bonus.id },
      data: { first_order_bonus_paid: true },
    });
  }

  // 7% от заказа — сразу на referral_deposit
  if (bonus.percent_bonus < bonus.percent_bonus_cap) {
    const amount = Math.min(orderPrice * 0.07, bonus.percent_bonus_cap - bonus.percent_bonus);
    await db.$transaction([
      db.referralBonuses.update({
        where: { id: bonus.id },
        data: { percent_bonus: { increment: amount } },
      }),
      db.users.update({
        where: { id: bonus.referrer_id },
        data: { referral_deposit: { increment: amount } },
      }),
    ]);
  }
}
```

---

## Подписки (тарифы)

| Тариф          | Цена        | Лимит заказов |
| -------------- | ----------- | ------------- |
| none           | 0₽          | Нет доступа   |
| basic          | 500₽/мес    | 3 заказа/день |
| premium        | 5 000₽/мес  | Безлимит      |
| top_floor_boss | 15 000₽/мес | Безлимит      |

### Basic (500₽/мес)

- Доступ к каталогу
- 3 заказа в день
- Статистика продаж
- Push-уведомления

### Premium (5 000₽/мес)

- Всё из Basic
- Безлимит на кол-во заказов
- Первым видишь новинки
- Эксклюзивные позиции
- Dashboard с графиками
- Обучение и гайды
- AI-помощник 24/7
- Еженедельная гонка продаж

### Top Floor Boss (15 000₽/мес)

- Всё из Premium
- Подключение Avito магазина
- AI отвечает покупателям
- Статистика заказов по API
- Автопубликация объявлений
- Генерация фото через AI
- Персональные консультации

### Цены для +ВАЙБ клиентов

| Тариф          | Обычная цена | Цена +ВАЙБ                         |
| -------------- | ------------ | ---------------------------------- |
| basic          | 500₽         | Недоступен (автоматически Premium) |
| premium        | 5 000₽       | **Бесплатно**                      |
| top_floor_boss | 15 000₽      | 10 000₽                            |

### Смена тарифа:

**Downgrade (на дешёвый):**

- Действует до конца оплаченного периода
- Потом переключается на новый

**Upgrade (на дорогой):**

- Рассчитывается остаток от текущего
- Доплата = новый_тариф - остаток
- Мгновенная активация

```typescript
function calculateUpgradePrice(currentTier: string, newTier: string, daysLeft: number) {
  const prices = { basic: 500, premium: 5000, top_floor_boss: 15000 };

  const currentDailyRate = prices[currentTier] / 30;
  const unusedBalance = currentDailyRate * daysLeft;

  const toPay = prices[newTier] - unusedBalance;
  return Math.max(toPay, 0);
}
```

---

## Депозит

### Два типа:

1. `deposit` — основной (пополняется клиентом)
2. `referral_deposit` — бонусный (рефералы)

### Приоритет списания:

1. Сначала `referral_deposit`
2. Затем `deposit`

### Пополнение:

- Минимум 500₽
- Максимум 100 000₽ за раз
- Через ЮKassa

### При отмене/возврате:

- Возврат на `deposit` (не на карту)
- Исключение: отмена в течение 24ч после оплаты картой → возврат на карту

---

## Статусы заказов

```
awaiting_shipment → collecting → in_transit → completed
       ↓                 ↓              ↓            ↓
    problem           problem    return_in_transit ←─┘
       ↓                                ↓
    cancelled                  return_arrived → return_completed
                                      ↓
                                    trash → disposed
```

| Статус              | Описание              | Кто меняет            |
| ------------------- | --------------------- | --------------------- |
| `awaiting_shipment` | Оплачен, ждёт сборки  | Создание заказа       |
| `collecting`        | Стикер напечатан      | Отправщик             |
| `in_transit`        | Отправлен             | Отправщик             |
| `completed`         | Доставлен             | Клиент / СДЭК webhook |
| `problem`           | Проблема (см. типы)   | Отправщик             |
| `return_in_transit` | Возврат в пути        | Клиент                |
| `return_arrived`    | Возврат на ПВЗ        | СДЭК webhook          |
| `return_completed`  | Возврат забран        | Отправщик             |
| `cancelled`         | Отменён               | Клиент / Система      |
| `trash`             | Не забрали 14 дней    | Автоматически         |
| `disposed`          | Аннулирован (30 дней) | Автоматически         |

**Активные статусы** (считаются "в работе"): `awaiting_shipment`, `collecting`, `in_transit`, `problem`.

### Валидация переходов

Все переходы статусов проходят через `validateTransition(from, to)` из `src/lib/orders/transitions.ts`. Невалидные переходы возвращают ошибку 400. Владелец также подчиняется матрице переходов (нет "режима бога").

**Важно:** `in_transit → cancelled` запрещён. Отмена возможна только из `awaiting_shipment`, `collecting`, `problem`.

### История статусов (`status_history`)

Каждый заказ хранит `status_history` — JSONB массив с реальными датами переходов:

```json
[
  { "status": "awaiting_shipment", "timestamp": "2026-01-15T12:00:00Z" },
  { "status": "collecting", "timestamp": "2026-01-15T14:30:00Z" },
  { "status": "in_transit", "timestamp": "2026-01-16T09:00:00Z" }
]
```

- Инициализируется при создании заказа
- Обновляется при каждой смене статуса (API + BullMQ handlers)
- Используется для timeline на странице заказа клиента
- Хелпер: `appendStatusHistory()` из `src/lib/orders/status-history.ts`

### Разрешённые отмены:

| Статус              | Отмена клиентом | Отмена владельцем   |
| ------------------- | --------------- | ------------------- |
| `awaiting_shipment` | ✅              | ✅                  |
| `collecting`        | ❌              | ✅                  |
| `problem`           | ✅              | ✅                  |
| `in_transit`        | ❌              | ❌ (только возврат) |
| Остальные           | ❌              | ❌                  |

### Типы проблем (`problem_type`)

| Тип            | Описание                 | Кто ставит | Что делает клиент        |
| -------------- | ------------------------ | ---------- | ------------------------ |
| `out_of_stock` | Нет в наличии при сборке | Отправщик  | Ждёт (автовосстановл.)   |
| `bad_barcode`  | Штрихкод не считывается  | Отправщик  | Меняет трек или отменяет |

**out_of_stock:**

- При установке: ищем возврат того же размера (`return_in_transit`/`return_arrived`), привязываем через `linked_return_order_id` (1 возврат : 1 проблема)
- При `complete_return` привязанного возврата: заказ автоматически восстанавливается в `awaiting_shipment` (если дедлайн не прошёл)
- Если дедлайн прошёл: `expire-order` отменит заказ автоматически
- `dispute_return` НЕ вызывает восстановление (товар повреждён)

**bad_barcode:**

- Клиент видит баннер "Штрихкод не считывается" и может изменить трек-номер или отменить заказ
- При изменении трек-номера: `status → awaiting_shipment`, `barcode_image_url → null`, `barcode_printed → false`

---

## Возвраты

### Процесс:

1. Клиент нажимает "Оформить возврат" (статус `in_transit` или `completed`)
2. Загружает штрихкод возврата
3. Указывает ожидаемую дату прибытия
4. Статус → `return_in_transit`
5. Возврат приходит на ПВЗ → `return_arrived`
6. Клиент указывает код возврата (обновляется каждый день)
7. Отправщик забирает → `return_completed`
8. Деньги возвращаются на `deposit`

### Оплата отправщику за возврат:

- Отправщик **не получает оплату** за `complete_return` (earnings = 0)
- Оплата начисляется только за `ship` (отправка) и `dispute_return` (оспоренный возврат)
- Ставка отправщика читается из `settings.shipper_rate` (по умолчанию 150₽)

### Напоминания о коде возврата:

- Каждые 3 дня пока не указан
- "Протрубить возвраты" — массовое напоминание всем

### Утиль (trash):

- Если 14 дней на ПВЗ без кода → `trash`
- Деньги не возвращаются (уже были списаны при заказе)
- Ещё 30 дней → `disposed`

---

## Гонка продаж

- Период: понедельник 00:00 — воскресенье 23:59
- Считаются `completed` заказы
- Доступна только premium+
- Топ-3 получают призы
- Realtime обновление таблицы лидеров

---

## Резервирование товаров

### Товары с размерами:

1. Клиент выбирает размер
2. `product_sizes.reserved_quantity += 1`
3. Создаётся запись в `size_reservations` с `product_size_id` (10 минут)
4. `available = current_quantity - reserved_quantity`

### Товары без размеров:

1. При открытии страницы заказа автоматически создаётся резерв
2. `products.reserved_quantity += 1`
3. Создаётся запись в `size_reservations` с `product_id` (10 минут)
4. `available = current_quantity - reserved_quantity`

### При оплате:

- Удаляется резерв
- `current_quantity -= 1` (на уровне `product_sizes` или `products`)

### При истечении 10 минут:

- Cleanup через sendBeacon / cleanup endpoint
- `reserved_quantity -= 1`
- Удаляется запись

### Лимит:

- Максимум 3 резерва на пользователя одновременно

---

## Лимиты заказов в день

| Подписка       | Лимит         |
| -------------- | ------------- |
| basic          | 3 заказа/день |
| premium        | Без лимита    |
| top_floor_boss | Без лимита    |

**Примечание:** +ВАЙБ клиенты всегда без лимита (автоматически premium+).

---

## Продление дедлайна

- Максимум +5 дней от текущего дедлайна
- Нельзя продлить если осталось < 1 дня
- Перепланируются BullMQ jobs: `deadline-reminder`, `expire-order`

---

## Автоматизации (Event-Driven)

| Триггер              | Действие               | Задержка              |
| -------------------- | ---------------------- | --------------------- |
| Создание заказа      | Напоминание о дедлайне | За 1 день до deadline |
| Создание заказа      | Автоотмена             | Конец deadline        |
| Возврат прибыл       | Перевод в trash        | 14 дней               |
| Переход в trash      | Аннулирование          | 30 дней               |
| Резервирование       | Освобождение           | 10 минут              |
| Регистрация реферала | Деактивация периода    | 60 дней               |

---

## AI-помощник (страница поддержки)

### Доступ:

- Только для `premium` и `top_floor_boss` подписок
- Путь: `/support`

### Что умеет:

- Отвечает на вопросы о сервисе
- Персонализированные ответы (использует данные клиента)
- Показывает статус заказов, уровень, депозит

### Контекст клиента:

- Имя, уровень, скидка
- Депозит (основной + реферальный)
- Подписка, +ВАЙБ статус
- Активные заказы и возвраты

### Эскалация к владельцу:

- Вывод депозита
- Потерянный/бракованный товар
- Проблемы с оплатой
- Всё, что не может решить AI

### Контакт владельца:

- Telegram: @avitofammanager
- Ссылка: https://t.me/avitofammanager

### Модель:

- GPT-4o-mini
- Max tokens: 500
- Temperature: 0.7
