# Настройка Telegram-ботов

> **Заглушка.** Полная инструкция заполняется в Этапе 8 (коробочность и онбординг).

## Боты в новой модели

- **owner-bot** — админ-команды владельца (`/stats`, `/vibe`, `/block` и т.п., подробности — Этап 10).
- **shipper-bot** — уведомления отправщику и быстрые команды (`/pending`, `/complete`).
- **customer-bot** — пока не создан. Появится вместе с Этапом 3 (заказ-флоу, manual-payment, +ВАЙБ). Тогда же появится отдельный env `TELEGRAM_CUSTOMER_BOT_TOKEN`.

## Опорные шаги

1. **BotFather**: создать `<brand>-owner-bot` и `<brand>-shipper-bot`, сохранить токены в `.env.local` (`TELEGRAM_OWNER_BOT_TOKEN`, `TELEGRAM_SHIPPER_BOT_TOKEN`).
2. **Webhook secret**: `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET` в env.
3. **Установка webhook-ов**: утилита `src/lib/telegram/setup-webhooks.ts` регистрирует webhook в Telegram API. Адреса — `https://<domain>/api/telegram/owner`, `/api/telegram/shipper`.
4. **Группа заказов**: создать приватный супер-чат, добавить owner-bot и shipper-bot, получить `TELEGRAM_ORDERS_GROUP_ID` (`-100...`).
5. **Проверка**: `/start` в owner-bot → должен поздороваться; `/start` в shipper-bot → попросит логин/пароль или подтвердит роль.

## Customer-bot (Этап 3)

Customer-bot будет отдельным ботом с флоу оформления заказа, приёмом чеков оплаты и +ВАЙБ-кредитом. Адрес webhook-а и env-имя токена появятся одновременно с релизом Этапа 3.
