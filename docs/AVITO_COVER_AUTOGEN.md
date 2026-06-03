# Авито: AI-автогенерация обложек + поток создания объявления

Часть Phase 3 (см. [`AVITO_INTEGRATION_BRIEF.md`](AVITO_INTEGRATION_BRIEF.md)). Документ описывает
**текущую реализацию** фичи генерации фото-обложек и сборки объявления. Раздел «Что доделать» —
в конце.

---

## 1. Идея (ТЗ владельца)

Система **сама, по таймеру (ночью)** генерирует AI-обложки для товаров, у которых владелец включил
автогенерацию, и шлёт их в Telegram на оценку «Четко / Переделай». Одобренные копятся в банк
обложек и используются при выкладке объявления на Авито. Генерация — **невидимая** для конечного
пользователя; вручную её не запускают на каждое объявление.

Объявление Авито = **10 фото**: 1 обложка (слот 1) + 9 фото живого фотосета (слоты 2–10).

---

## 2. Поток (как работает)

```
Карточка товара (/owner/products/[id], блок «AI-медиа»):
  • загрузить живой фотосет (альбом 1–9 фото; альбомов сколько угодно)
  • (опц.) загрузить «живые обложки» (превью-картинки)
  • включить тумблер «Автогенерация AI-обложек» + указать Telegram chat_id получателя
        ↓
  Ночной крон 03:00 МСК (nightly-cover-generation) ИЛИ кнопка «Сгенерить сейчас» (1×/сутки/товар):
  батч 5 генераций = 2 «Живой фон» (normal) + 2 «Фотозона» (photozone) + 1 «На модели» (personality)
        ↓
  Gemini «Nano Banana» (gemini-2.5-flash-image) генерит фото из живого фотосета (+ референс зоны)
        ↓
  каждое фото уходит в Telegram получателю (cover_tg_chat_id) с кнопками «✅ Четко / 🔄 Переделай»
        ↓
  «Четко»   → фото в банк (avito_media_presets kind='ai-preview', gen_category), генерация approved
  «Переделай» → новая генерация той же категории (НЕ тратит дневной слот)
        ↓
  Создание объявления (модалка на /owner/avito):
    • Авто (лестница) — обложку и фотосет выберет система (наименее использованные)
    • Вручную — выбрать обложку (4 категории) + альбом; что не выбрал — подберётся лестницей
```

**Важно:** генерация и отправка происходят, ТОЛЬКО если у товара сохранён `cover_tg_chat_id`.
Нет chat_id → крон пропускает товар, ручная кнопка отдаёт 400, кнопка «Сгенерить сейчас» в карточке
скрыта. (Решение владельца: «не указал id → ничего не шлём».)

---

## 3. Категории медиа

| Категория | `gen_category` / `kind` | Что это |
| --- | --- | --- |
| Живой фон | `ai-preview` / `normal` | товар на естественном уличном фоне |
| Фотозона | `ai-preview` / `photozone` | товар в готовой фотозоне (референс из библиотеки) |
| На модели | `ai-preview` / `personality` | товар на вымышленном человеке (НЕ реальное лицо) |
| Живые обложки | `kind='preview'` | загруженные владельцем картинки-приманки |
| Живой фотосет | `kind='photoset'`, `set_key` | альбом(ы) реальных фото товара (слоты 2–10) |

Дневной лимит на товар: normal=2, photozone=2, personality=1 (= 5/сутки), атомарно через
`claim_ai_gen_slot` + `avito_ai_gen_counters`.

---

## 4. Данные (таблицы/колонки)

- `products.auto_covers_enabled boolean` — тумблер автогенерации (миграция `20260529000029`).
- `products.cover_tg_chat_id bigint` — получатель обложек в TG (миграция `20260529000030`).
- `avito_media_presets` — банк медиа: `kind` (`photoset`/`preview`/`ai-preview`), `gen_category`
  (`normal`/`photozone`/`personality`/`live`, миграция `20260529000031`), `set_key` (альбом),
  `storage_path`, `usage_count` (лестница), `sort_order`.
- `avito_photoset_sets` — альбомы фотосета (`set_key`, `title`, `photo_count`, `usage_count`).
- `avito_ai_generations` — pending-генерации: `status` (`pending`/`regenerating`/`approved`),
  `category`, `storage_path`, `tg_chat_id`, `tg_message_id`, `approved_preset_id`, `attempt`.
- `avito_ai_gen_counters` — дневной лимит: `(user_id, product_id, gen_date, category, used_count)`.
- `avito_post_jobs` — заявки публикации: `manual_set_key`, `manual_cover_preset_id`, `status`.

Бакет хранилища: `avito-presets` (приватный → подписанные URL).

---

## 5. Карта файлов

**Очереди/кроны/хендлеры:**
- `src/lib/jobs/queues.ts` — `scheduleNightlyCoverGeneration()` (03:00 МСК),
  `enqueueProductCoverBatch(userId, productId, recipientChatId)` (батч 5; джобы стартуют со сдвигом
  `delay: i*3000` — сериализует claim, иначе гонка лимита давала 3 из 5).
- `src/lib/jobs/handlers/nightly-cover-generation.ts` — обход товаров с `auto_covers_enabled`,
  пропуск без `cover_tg_chat_id`.
- `src/lib/jobs/handlers/avito-generate-photo.ts` — генерация одного фото; получатель резолвится
  ДО claim/Gemini (нет получателя → skip, без дефолта на владельца).
- `src/lib/ai/photo-generator.ts` — Gemini-вызов; `PHOTO_SYSTEM_PROMPTS` + общий `QUALITY_RULES`
  (жёстко: сохранять каждую деталь/надписи/логотипы товара); ретраи на транзиентные провалы.
- `src/lib/avito/ladder.ts` — лестница: `pickLeastUsedCover`, `pickLeastUsedPhotosetSet`,
  `pickLeastUsedReferences`, `bumpCoverUsage`.
- `src/lib/avito/photo-mixer.ts` — сборка 10 фото к публикации (обложка+9), ручной выбор ИЛИ
  лестница; каждое фото уникализируется (`uniqueizeImage`).
- `src/lib/jobs/handlers/avito-post-listing.ts` — публикация (через `mixPhotos`); 0 фото → fail.

**Telegram-бот:**
- `src/lib/telegram/bots/owner-bot.ts` — `registerAiPhotoHandlers`: `aiphoto:ok`/`aiphoto:redo`
  (НЕблокирующие — мгновенный ack, работа в фоне), `editCaptionResilient` (ретраи правки подписи),
  `/myid`, middleware-исключение для `aiphoto:*` (получатель может быть не владельцем).
- `src/lib/telegram/notifications.ts` — `notifyOwnerAiPhotoForApproval({…, chatId})`.

**API (карточка товара / создание объявления):**
- `src/app/api/avito/listings/product-media/route.ts` — банк по категориям + `pendingGenerations`
  (только за 15 мин по `created_at`) + `settings`.
- `src/app/api/avito/listings/generate-now/route.ts` — ручной триггер (1×/сутки, требует chat_id).
- `src/app/api/avito/listings/cover-settings/route.ts` — тумблер + chat_id.
- `src/app/api/avito/listings/covers/route.ts` — живые обложки (kind='preview').
- `src/app/api/avito/listings/dataset/route.ts` — альбомы фотосета (мульти-альбом; кап 9 фото).
- `src/app/api/avito/post/route.ts` — заявка публикации.
- `src/app/api/owner/products/route.ts` — в меню товаров thumbnail берётся из живой обложки
  (приоритет), иначе `photo_urls[0]`.

**Фронт:**
- `src/components/owner/avito/product-avito-media.tsx` — панель карточки (альбомы, живые обложки,
  банк AI по категориям, тумблер+chat_id, «Сгенерить сейчас»; поллинг без затирания ввода).
- `src/components/owner/avito/create-listing-modal.tsx` — модалка объявления (Авто/Вручную).
- `src/app/(owner)/owner/products/new/page.tsx` — создание товара (фотосет до 9; редирект на
  `…/products/{id}#avito-media` со скроллом к медиа).

**Инфраструктура:**
- `src/lib/net/resilient-dispatcher.ts` — глобальный undici-dispatcher (connect 30с/headers 60с/
  body 120с), импортируется ПЕРВЫМ в `scripts/worker.ts`, `scripts/dev-bots.ts`,
  `src/instrumentation.ts`. Без него медленная сеть рубила Telegram/Supabase/Gemini на 10-сек
  connect-таймауте (терялись клики и записи).

---

## 6. Локальная разработка (важно)

- Один `npm run dev:all` (Next + worker + 5 ботов). Несколько = 409 на токене бота.
- `.env.local`: `BULLMQ_PREFIX=bull-localdev`, `WORKER_IN_WEB=false` (воркер отдельным процессом).
- Тест строго через `localhost` (прод-URL кладёт джобы в дефолтный prefix `bull`).
- Правка `owner-bot.ts`/его импортов → рестарт `tsx watch`: клик в окно рестарта теряется. После
  правки ждать `✅ [owner] started`. **В callback-хендлерах НЕ держать `await` сетевых вызовов** —
  grammY последователен, иначе клики копятся и лагают.
- Миграции применялись через Supabase Management API (`SUPABASE_ACCESS_TOKEN`), т.к. нет
  `SUPABASE_DB_PASSWORD` для `db:push`.

---

## 7. Что ещё нужно доделать (TODO)

1. **«На модели» (personality) — нестабильна.** Gemini периодически блокирует генерацию людей
   (safety на лица), даже с «вымышленным» промтом. Промт переписан (снят акцент на лицо) + ретраи,
   но не гарантирует. Варианты: сильнее переработать промт / убрать категорию из авто-батча.
2. **Реальная публикация на Авито не проверена.** `avito-post-listing` упирается в `resolveSession`
   → без подключённого Avito-аккаунта возвращает «Avito не подключён». Нужен живой аккаунт + выверка
   селекторов постинга (`posting.ts`) на боевом кабинете (см. developers.avito.ru / к Лене).
   Публикация — пока браузерный STUB.
3. **Уникализация 10 фото — перепроверить.** `mixPhotos` уже прогоняет каждый буфер через
   `uniqueizeImage`. Уточнить, достаточно ли (степень уникализации) и не нужно ли распространить на
   другие пути (загрузка фотосета как есть).
4. **Прод-инфра (старый долг):** прод-воркер/бот на старом коде на общем Redis/токене — выкатить
   текущий код или изолировать (см. handoff). Локалка изолирована prefix'ом и одним `dev:all`.

---

> Тех-журнал и последние раунды багфиксов — `.claude/handoff.md`. Рабочие конспекты сессий —
> локально в `dionis-n info/` (вне репозитория).
