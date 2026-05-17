# Avito Автопостинг — Standalone

Обособленный инструмент одного оператора для управления N магазинами Avito:
KPI-дашборд, автопостинг объявлений (браузерная автоматизация + антидетект на каждый
магазин), подтягивание заказов с Avito, AI-агент переписок (текст/фото/голос).

Форк `avito-project`. Мультиарендность (клиенты/подписки/paywall/owner/shipper)
заменена на единственного оператора. Точки интеграции с панелью владельца помечены
комментариями `// STUB: owner-panel`.

## Стек

Next.js 14 (App Router) · TypeScript · Tailwind · Framer Motion · Supabase (PostgreSQL+RLS)
· BullMQ + Redis · Puppeteer (stealth) · OpenAI (GPT/Whisper/TTS) · Gemini «Nano Banana» (обложки)

## Быстрый старт

```bash
cp .env.example .env.local        # заполнить значения
npm install
npm run db:migrate                # применить миграции к Supabase
npm run dev                       # http://localhost:3000
npm run worker:dev                # BullMQ-воркер (постинг/синк/AI) — отдельный процесс
```

Вход: `OPERATOR_LOGIN` / `OPERATOR_PASSWORD` из `.env.local`.

## Ключевые env

| Переменная | Назначение |
| --- | --- |
| `OPERATOR_LOGIN` / `OPERATOR_PASSWORD` | Учётка оператора (обязательно сменить в проде) |
| `OPERATOR_USER_ID` | Фиксированный UUID строки оператора в `users` |
| `OPERATOR_AVITO_ACCOUNT_LIMIT` | Сколько магазинов можно подключить |
| `NEXT_PUBLIC_SUPABASE_URL` / `*_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `REDIS_URL` | BullMQ |
| `OPENAI_API_KEY` | Описания/названия/чат-агент/Whisper/TTS |
| `GEMINI_API_KEY` | Генератор обложек (без ключа → pass-through) |

## Авторизация

Один оператор. Логин/пароль из `.env`, сессия — подписанная cookie. Под капотом
оператор = одна привилегированная строка `users` (`is_vibe_plus`, высокий
`avito_account_limit`), под которой живут все Avito-сессии (`account_index` = «магазин»).
См. `src/lib/constants/operator.ts`. // STUB: owner-panel.

## Статус по фазам

- [x] Фаза 0 — каркас standalone (форк, 1-операторский логин, навигация)
- [x] Фаза 1 — схема БД и инфраструктура (миграция, сид, фичефлаги, метро)
- [x] Фаза 2 — дашборд по ТЗ (KPI-карты, AI-блок, окно заказов)
- [ ] Фаза 3 — управление объявлениями
- [ ] Фаза 4 — автопостинг
- [ ] Фаза 5 — заказы с Avito
- [ ] Фаза 6 — AI-реле (текст/фото/голос)
- [ ] Фаза 7 — полировка
