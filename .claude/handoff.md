# Project State

> Текущее состояние проекта. Обновляй секции, не добавляй записи.
> Обновлено: 2026-02-21

## В работе

<!-- Ничего -->

## Запланировано

- Редизайн панели владельца и отправщика — доработка
- Товары без размеров (план: `~/.claude/plans/purrfect-cooking-pinwheel.md`)
- Доставка (трекинг) — доработка
- AI-агент продаж
- Платежи ЮKassa

## Известные баги

<!-- Нет известных багов -->

## Что уже сделано в этой сессии

- Код-ревью: 27 проблем исправлены (план: `~/.claude/plans/spicy-doodling-dahl.md`)
  - Фаза 1: миграция БД (`status_history`, RPC, no-op триггер), `auth/session.ts`, `constants/order-status.ts`, `status-history.ts`, transitions fix
  - Фаза 2: критические фиксы (validateTransition, status_history записи, атомарные резервации, оптимистичная блокировка, expire-order RPC)
  - Фаза 3: owner — валидация переходов, batch endpoint (`/api/owner/orders/batch`), stats с фильтрами
  - Фаза 4: timeline с реальными датами из status_history, запись history во всех BullMQ handlers
  - Фаза 5: мелкие фиксы (problem в active, shipper rate из settings, таймзона МСК, дедупликация getSession и STATUS_LABELS)
  - Фаза 6: типы (StatusHistoryEntry, status_history в database.generated.ts)
- Документация обновлена: DATABASE.md, BUSINESS_LOGIC.md

## Последний контекст

- **Миграция не применена:** `supabase/migrations/20260220000003_fixes.sql` — нужно выполнить `npm run db:migrate`
- **Типы временные:** `database.generated.ts` отредактирован вручную — после миграции запустить `npm run db:gen-types`
- **Нерешённые проблемы:** Редизайн owner/shipper не завершён

## Заметки

- Skills читать перед написанием нового кода
- Редизайн owner/shipper — WIP, не считать завершённым
- Все переходы статусов теперь через `validateTransition()` — нет "режима бога" для владельца
- Отправщик не получает оплату за `complete_return`
- `problem` считается активным статусом везде (owner stats, export, telegram)
