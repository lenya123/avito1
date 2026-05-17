# Дизайн-система

## TLDR — Быстрая справка

### Font sizes (8 уровней)

**Текст (контент внутри карточек):**

| Класс       | Размер    | Использование        |
| ----------- | --------- | -------------------- |
| `text-2xs`  | 10px/14px | Мета, timestamps     |
| `text-xs`   | 12px      | Мелкий текст, labels |
| `text-sm`   | 14px      | Основной текст       |
| `text-base` | 16px      | Заголовки карточек   |

**Заголовки и акценты (структура страницы):**

| Класс      | Размер | Использование                                    |
| ---------- | ------ | ------------------------------------------------ |
| `text-lg`  | 18px   | Секционные заголовки, значения в карточках, цены |
| `text-xl`  | 20px   | Заголовки подстраниц (с кнопкой «Назад»), имена  |
| `text-2xl` | 24px   | Заголовки главных страниц, крупные stat-значения |
| `text-3xl` | 30px   | Выделенные значения (баланс, score)              |

**Правило:** text-[Xpx] запрещён. Только стандартные Tailwind размеры.

### Text opacity (только 5 уровней)

| Класс           | Opacity | Использование           |
| --------------- | ------- | ----------------------- |
| `text-white`    | 100%    | Заголовки, значения     |
| `text-white/80` | 80%     | Подзаголовки, описания  |
| `text-white/60` | 60%     | Вторичный текст, labels |
| `text-white/40` | 40%     | Placeholder, hint       |
| `text-white/20` | 20%     | Muted, disabled         |

**Правило распространяется и на accent-цвета:** `text-accent-blue/80`, `text-accent-red/60` и т.д. — только /80 /60 /40 /20. Нестандартные `/70`, `/90`, `/50` запрещены.

### Accent-токены

| Класс             | Hex     | Пример           |
| ----------------- | ------- | ---------------- |
| `accent-blue`     | #0A84FF | Основной акцент  |
| `accent-green`    | #30D158 | Успех, активный  |
| `accent-red`      | #FF453A | Ошибка, удаление |
| `accent-orange`   | #FF9F0A | Предупреждение   |
| `accent-purple`   | #BF5AF2 | Премиум          |
| `accent-pink`     | #FF375F | Акцент           |
| `accent-teal`     | #64D2FF | Информация       |
| `accent-indigo`   | #5E5CE6 | Акцент           |
| `accent-telegram` | #229ED9 | Telegram бренд   |
| `level-1`         | #AED6FF | Уровень 1        |
| `level-2`         | #5DAEFF | Уровень 2        |

### Shadow-токены

| Класс                   | Использование        |
| ----------------------- | -------------------- |
| `shadow-card`           | Стандартная карточка |
| `shadow-card-hover`     | Hover карточки       |
| `shadow-glass`          | Глубокая тень        |
| `shadow-glass-sm`       | Малая тень           |
| `shadow-glass-inset`    | Inset highlight      |
| `shadow-button-primary` | Primary кнопка       |
| `shadow-modal`          | Модальное окно       |

### UI-компоненты (импорт)

```tsx
import { Button, Card, Input, Modal, Badge, Spinner, Empty } from "@/components/ui";
```

### Антипаттерны ❌ → ✅

| Нельзя                     | Правильно                                |
| -------------------------- | ---------------------------------------- |
| `text-[11px]`              | `text-xs`                                |
| `text-[13px]`              | `text-sm`                                |
| `text-white/90`            | `text-white/80`                          |
| `text-white/70`            | `text-white/60`                          |
| `#BF5AF2` в className      | `accent-purple`                          |
| `#229ED9` в className      | `accent-telegram`                        |
| `from-[#4da6ff]...` inline | `<Button variant="primary">`             |
| `from-[#ffbe4d]...` inline | `<Button variant="warning">`             |
| `shadow-[0_4px_24px...]`   | `shadow-card` (если совпадает с токеном) |

---

## Правила принятия решений

> Этот раздел описывает НЕ «какие классы писать», а «КАК ДУМАТЬ» при создании/редактировании UI.

### 1. Выбор Button variant

Спроси себя: «Что это за действие?»

- **Пользователь подтверждает/завершает?** → `primary` (Купить, Оформить, Отправить)
- **Активный toggle / предупреждающее CTA?** → `warning` (Уведомить, Оформить заказ)
- **Действие внутри карточки?** → `secondary` (Привязать, Цена, Загрузить ещё)
- **Утилитарное/вспомогательное действие?** → `ghost` + className неактивного фильтра (Синхронизировать, Экспорт)
- **Минимальная кнопка/ссылка?** → `ghost` без className (Отмена, Сбросить)
- **Удаление/отмена заказа?** → `danger`

**Частая ошибка:** Синхронизировать, Обновить, Экспорт — это НЕ CTA. Не используй `primary` и не используй `secondary` — это утилитарные кнопки, стиль неактивного фильтра.

### 2. Бейджи и статусы

**Правило:** Бейдж нужен только когда он несёт информацию, которую пользователь не может определить из контекста.

- Страница показывает только активные товары → бейдж «Активно» **бессмыслен**
- Страница показывает товары всех статусов → бейджи **нужны**
- Статус виден из другого элемента (цвет, иконка) → бейдж **дублирует**

### 3. Text opacity

| Opacity           | Назначение                         | Пример                                  |
| ----------------- | ---------------------------------- | --------------------------------------- |
| 100% `text-white` | Заголовки, цены, значения          | h1, цена товара                         |
| `/80`             | Подзаголовки, описания             | текст карточки, имя отправителя         |
| `/60`             | Вторичный текст, labels, метрики   | label в форме, views/favorites          |
| `/40`             | Hint, placeholder, мета, timestamp | «Обновлено 2ч назад», «2 мин. назад»    |
| `/20`             | Декоративные элементы, разделители | точка-разделитель «·», disabled элемент |

**Критическое правило:** `/20` — НЕЧИТАЕМЫЙ текст. Если текст должен быть прочитан пользователем — минимум `/40`.

### 4. Загрузка на страницах-дашбордах

Если страница загружает данные из нескольких хуков:

1. **Вызови ВСЕ хуки в компоненте страницы** (React Query кэширует — дочерние компоненты получат данные из кэша)
2. **`isLoading = hook1Loading || hook2Loading || ...`** (оператор `||`, НЕ `&&`!)
3. **Показывай один общий `<Spinner>`** пока ВСЕ данные не загружены
4. **После загрузки** — stagger-анимация через `staggerChildren` в framer-motion
5. **НЕ давай** каждому дочернему компоненту свою `initial/animate` анимацию — управляй из родителя

### 5. Консистентность при редактировании

Когда обновляешь стиль элемента:

1. Посмотри ВСЕ элементы в том же визуальном контексте (header, карточка, секция)
2. Если обновил кнопку в header — проверь кнопку «назад» рядом
3. Если обновил бейджи — проверь все статусы, не только первый
4. **Правило радиуса:** если рядом с элементом стоят другие элементы с другим стилем — это баг

### 6. Перед выбором стиля — посмотри референс

Не угадывай стиль. Перед созданием элемента:

1. Найди аналогичный элемент на другой странице (grep по className/компоненту)
2. Прочитай его код
3. Скопируй стиль точно

Референсные страницы:

- `/catalog` — фильтры, sort-кнопки (активные/неактивные), карточки товаров
- `/stats` — пагинация, period tabs, stat cards
- `/stats/analytics` — progress bars, toggles, метрики

### 7. Toggle / Tab кнопки (активная/неактивная)

```tsx
// Активная:
"bg-gradient-to-br from-white/[0.20] via-white/[0.14] to-white/[0.08]";
"text-white border-glass-strong shadow-glass-inset";

// Неактивная:
"bg-white/[0.06] text-white/60 border-glass-subtle shadow-glass-inset";
"hover:text-white hover:bg-white/[0.10] hover:border-white/20";
```

### 8. Кнопка «Назад» (BackButton компонент)

**Путь:** `src/components/ui/back-button.tsx`

```tsx
import { BackButton } from "@/components/ui";

<BackButton href="/avito" />;
```

Glass-стиль: `w-9 h-9 rounded-xl`, gradient, border-glass-subtle, inset shadow. Не копируй inline — используй компонент.

### 9. Иерархия заголовков на страницах

| Уровень          | Класс                              | Когда использовать                                  | Пример                                 |
| ---------------- | ---------------------------------- | --------------------------------------------------- | -------------------------------------- |
| Главная страница | `text-2xl font-bold text-white`    | Страницы без BackButton (верхний уровень навигации) | Профиль, Поддержка, Обучение, Подписки |
| Подстраница      | `text-xl font-bold text-white`     | Страницы с BackButton (вложенные)                   | Avito/Отзывы, Avito/Чаты, Аналитика    |
| Секция           | `text-lg font-semibold text-white` | Заголовки секций внутри страницы                    | Статистика, Быстрые действия, FAQ      |
| Карточка         | `text-base font-medium text-white` | Заголовок внутри карточки                           | Название товара, имя клиента           |

### 10. Скругления (rounded)

| Класс                | Размер             | Использование                                      |
| -------------------- | ------------------ | -------------------------------------------------- |
| `rounded-lg` (8px)   | Маленькие элементы | Иконки-контейнеры (w-7..w-9), thumbnails, skeleton |
| `rounded-xl` (12px)  | Средние элементы   | Кнопки, badges, pills, input, info-блоки           |
| `rounded-2xl` (16px) | Карточки           | Card, большие контейнеры                           |
| `rounded-3xl` (24px) | Модалки            | Modal                                              |
| `rounded-full`       | Круглые            | Аватары, индикаторы, dots                          |

**Правило:** Если элемент — badge/pill/info-block → `rounded-xl`, не `rounded-lg`.

---

## Spacing-паттерны

### Spacing scale

| Токен                     | Значение | Использование                                    |
| ------------------------- | -------- | ------------------------------------------------ |
| `gap-1` / `gap-1.5`       | 4-6px    | Иконка ↔ label внутри одного элемента            |
| `gap-2` / `space-y-2`     | 8px      | Связанная пара (label + value, title + subtitle) |
| `gap-2.5` / `space-y-2.5` | 10px     | Поля формы между собой                           |
| `gap-3` / `space-y-3`     | 12px     | Элементы в карточке, items в списке              |
| `gap-4` / `space-y-4`     | 16px     | Grid карточек, секции внутри страницы            |
| `gap-6` / `space-y-6`     | 24px     | Секции дашборда, крупные блоки                   |
| `mb-6` → `mb-8`           | 24-32px  | Заголовок страницы → контент                     |

**Принцип иерархии (Gestalt proximity):** внутренний spacing < внешний spacing (минимум 1.5×). Связанные элементы (label + value) — ближе, несвязанные (секции) — дальше.

### Padding карточек

| Padding prop | Класс | Использование                  |
| ------------ | ----- | ------------------------------ |
| `none`       | —     | Списки с px-4 на строках       |
| `sm` (p-3)   | p-3   | Компактные формы, мелкие блоки |
| `md` (p-4)   | p-4   | Основные карточки (default)    |
| `lg` (p-6)   | p-6   | Главные карточки на странице   |

### Page layout

```tsx
<main className="max-w-4xl mx-auto px-4 py-6">
  <h1 className="text-2xl font-bold text-white mb-6">Page Title</h1>
  <div className="space-y-6">
    {" "}
    {/* Секции */}
    <section>...</section>
    <section>...</section>
  </div>
</main>
```

### Gotchas

- **Card wrapper:** `<Card className="space-y-3">` — НЕ работает. Card оборачивает children в `<div className="relative">`, поэтому `space-y-*` не пробрасывается. Используй явные mb/mt на children или обёртку внутри Card.
- **space-y с hidden elements:** `space-y-*` учитывает все children, включая невидимые. Если элемент условно скрыт — используй явные mt вместо space-y.
- **Формы:** Не оборачивай inputs и button в общий `space-y`. Inputs — в `<div className="space-y-2.5">`, button — отдельно с `mt-3`. Это создаёт визуальную иерархию по Gestalt proximity.

---

## Концепция: iOS 26 Liquid Glass (Dark Mode)

> Адаптация visionOS и iOS 26 стиля для web — многослойные стеклянные поверхности с глубиной

**Ключевые принципы:**

- Глубокий тёмный фон (`#0a0a0c`) — почти чёрный
- Многослойные полупрозрачные "стеклянные" поверхности с градиентами
- Inset shadows для эффекта объёма
- Декоративные блики (via-white/15 сверху)
- Glow-эффекты для акцентов
- Мягкие скругления (rounded-2xl, rounded-3xl)
- Framer Motion для всех анимаций

---

## CSS-переменные

Определены в `src/app/globals.css`:

```css
:root {
  /* Фоны — глубокий тёмный */
  --bg-primary: #0a0a0c;
  --bg-secondary: #1a1a1e;
  --bg-tertiary: #2a2a2e;

  /* Glass эффекты */
  --bg-glass: rgba(255, 255, 255, 0.06);
  --bg-glass-hover: rgba(255, 255, 255, 0.1);
  --bg-glass-elevated: rgba(255, 255, 255, 0.12);
  --bg-glass-active: rgba(255, 255, 255, 0.16);

  /* Акценты */
  --accent-blue: #0a84ff;
  --accent-green: #30d158;
  --accent-red: #ff453a;
  --accent-orange: #ff9f0a;
  --accent-purple: #bf5af2;
  --accent-pink: #ff375f;
  --accent-teal: #64d2ff;
  --accent-indigo: #5e5ce6;

  /* Glow эффекты */
  --glow-purple: rgba(191, 90, 242, 0.4);
  --glow-blue: rgba(10, 132, 255, 0.4);
  --glow-teal: rgba(100, 210, 255, 0.3);
  --glow-pink: rgba(255, 55, 95, 0.3);

  /* Текст — 5 уровней: 100/80/60/40/20 */
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.8);
  --text-tertiary: rgba(255, 255, 255, 0.6);
  --text-quaternary: rgba(255, 255, 255, 0.4);
  --text-muted: rgba(255, 255, 255, 0.2);

  /* Border система (7 уровней) */
  --border-color: rgba(255, 255, 255, 0.08); /* Базовая */
  --border-color-minimal: rgba(255, 255, 255, 0.1); /* Разделители, footer */
  --border-color-subtle: rgba(255, 255, 255, 0.15); /* Лёгкая */
  --border-color-default: rgba(255, 255, 255, 0.2); /* Карточки */
  --border-color-active: rgba(255, 255, 255, 0.25); /* Hover/модалки */
  --border-color-strong: rgba(255, 255, 255, 0.4); /* Бейджи */
  --border-color-glow: rgba(255, 255, 255, 0.5); /* Галерея */

  /* Level-specific цвета */
  --level-1-color: #aed6ff;
  --level-2-color: #5daeff;

  /* Тени */
  --shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-glass-sm: 0 4px 16px rgba(0, 0, 0, 0.35);
}
```

---

## Tailwind классы

### Border система (из tailwind.config.ts)

| Класс                  | Opacity | Использование        |
| ---------------------- | ------- | -------------------- |
| `border-glass-minimal` | 10%     | Разделители, footer  |
| `border-glass-subtle`  | 15%     | Лёгкие разделители   |
| `border-glass`         | 20%     | Карточки, контейнеры |
| `border-glass-active`  | 25%     | Модалки, hover       |
| `border-glass-strong`  | 40%     | Бейджи, акценты      |
| `border-glass-glow`    | 50%     | Кнопки галереи       |

### Shadow токены (из tailwind.config.ts)

| Класс                   | Использование                                  |
| ----------------------- | ---------------------------------------------- |
| `shadow-card`           | Стандартная карточка (inset highlight + depth) |
| `shadow-card-hover`     | Hover-состояние карточки                       |
| `shadow-glass-inset`    | Только inset highlight                         |
| `shadow-glass`          | Глубокая тень (модалки)                        |
| `shadow-glass-sm`       | Малая тень                                     |
| `shadow-button-primary` | Primary кнопка (с blue glow)                   |

### Цвета

```tsx
// Акценты
className = "text-accent-blue"; // #0A84FF
className = "text-accent-green"; // #30D158
className = "text-accent-red"; // #FF453A
className = "text-accent-orange"; // #FF9F0A
className = "text-accent-purple"; // #BF5AF2
className = "text-accent-teal"; // #64D2FF

// Фоны
className = "bg-primary"; // #0a0a0c
className = "bg-secondary"; // #1a1a1e

// Текст — строго 5 уровней
className = "text-white"; // 100% — заголовки, значения
className = "text-white/80"; // 80% — подзаголовки, описания
className = "text-white/60"; // 60% — вторичный текст, label
className = "text-white/40"; // 40% — placeholder, hint, неактивный
className = "text-white/20"; // 20% — muted, разделители, disabled
```

### Font sizes

**Текст (контент):**

| Класс       | Размер    | Использование               |
| ----------- | --------- | --------------------------- |
| `text-2xs`  | 10px/14px | Мета-информация, timestamps |
| `text-xs`   | 12px      | Мелкий текст, labels        |
| `text-sm`   | 14px      | Основной текст              |
| `text-base` | 16px      | Заголовки карточек          |

**Заголовки (структура):**

| Класс      | Размер | Использование                                    |
| ---------- | ------ | ------------------------------------------------ |
| `text-lg`  | 18px   | Секционные заголовки, значения, цены             |
| `text-xl`  | 20px   | Заголовки подстраниц (с BackButton)              |
| `text-2xl` | 24px   | Заголовки главных страниц, крупные stat-значения |
| `text-3xl` | 30px   | Выделенные значения (баланс, score)              |

---

## Адаптивная типографика

Font-size масштабируется по ширине экрана:

| Ширина    | font-size   |
| --------- | ----------- |
| ≤375px    | 14px        |
| 376-413px | 14.6px      |
| 414-429px | 15.4px      |
| ≥430px    | 16px (base) |

---

## UI Компоненты

### Button

**Путь:** `src/components/ui/button.tsx`

**Варианты и КОГДА их использовать:**

| Вариант             | Вид                   | Когда использовать                                | Примеры                                   |
| ------------------- | --------------------- | ------------------------------------------------- | ----------------------------------------- |
| `primary`           | Синий градиент с glow | Финальное подтверждающее действие. Одна на экран. | Купить, Оформить, Отправить ответ         |
| `warning`           | Оранжевый градиент    | Предупреждающее CTA, активный toggle-статус       | Уведомить, Оформить заказ (когда активно) |
| `secondary`         | Тёмно-серый glass     | Действие в карточке, альтернатива primary         | Привязать, Цена, Отмена (в модалке)       |
| `ghost`             | Прозрачный            | Минимальное действие, ссылка-кнопка               | Отмена (в inline-форме), Сбросить фильтры |
| `danger`            | Красный градиент      | Деструктивное действие                            | Удалить, Отменить заказ                   |
| `ghost` + className | Неактивный фильтр     | Утилитарные кнопки (не CTA)                       | Синхронизировать, Экспорт, Обновить       |

**Паттерн «утилитарная кнопка» (неактивный фильтр):**

```tsx
<Button
  variant="ghost"
  size="sm"
  className="bg-white/[0.06] text-white/60 border border-glass-subtle shadow-glass-inset hover:text-white hover:bg-white/[0.10] hover:border-white/20"
>
  Синхронизировать
</Button>
```

Это стиль неактивной sort-кнопки с `/catalog`. Используй для любых утилитарных действий, которые не являются CTA.

**Размеры:**

- `sm` — px-3 py-1.5 text-sm rounded-xl
- `md` — px-4 py-2.5 text-base rounded-xl
- `lg` — px-6 py-3 text-lg rounded-xl

**Стили primary:**

```tsx
cn(
  "bg-gradient-to-b from-[#4da6ff] via-[#2196ff] to-[#0A84FF]",
  "text-white",
  "border border-glass-active",
  "shadow-[0_4px_12px_rgba(0,0,0,0.3),0_2px_8px_rgba(10,132,255,0.4),inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.1)]"
);
```

**Использование:**

```tsx
<Button variant="primary" size="md">Оформить</Button>
<Button variant="secondary">Отмена</Button>
<Button variant="danger" isLoading>Удалить</Button>
```

---

### Card

**Путь:** `src/components/ui/card.tsx`

**Стили glass:**

```tsx
cn(
  "relative rounded-2xl overflow-hidden",
  "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
  "backdrop-blur-xl",
  "border border-glass",
  "shadow-card"
);
// + декоративный блик сверху: via-white/15
```

**Padding:**

- `none` — без отступов
- `sm` — p-3
- `md` — p-4 (default)
- `lg` — p-6

**Использование:**

```tsx
<Card padding="md" hoverable>
  <CardHeader title="Заголовок" subtitle="Подзаголовок" />
  <CardContent>Контент</CardContent>
  <CardFooter>Действия</CardFooter>
</Card>
```

---

### Input

**Путь:** `src/components/ui/input.tsx`

**Стили:**

```tsx
cn(
  "w-full px-4 py-2.5 rounded-xl",
  "bg-white/[0.08] backdrop-blur-sm",
  "border border-glass",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  "text-white placeholder:text-white/40",
  "focus:outline-none focus:border-white/30 focus:bg-white/[0.12]",
  "focus-visible:ring-2 focus-visible:ring-accent-blue"
  // aria-invalid={!!error} добавлен автоматически
);
```

**Использование:**

```tsx
<Input
  label="Email"
  placeholder="example@mail.com"
  error="Неверный формат"
  leftIcon={<MailIcon />}
/>
```

---

### Modal

**Путь:** `src/components/ui/modal.tsx`

**Стили контента:**

```tsx
cn(
  "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
  "backdrop-blur-[24px]",
  "border border-glass-active",
  "rounded-3xl",
  "shadow-[0_8px_32px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]"
);
```

**Backdrop:**

```tsx
"bg-black/60 backdrop-blur-md";
```

**Размеры:** sm | md | lg | xl | full

**Использование:**

```tsx
<Modal isOpen={open} onClose={close} title="Заголовок">
  <p>Контент</p>
  <ModalFooter>
    <Button variant="secondary">Отмена</Button>
    <Button>Подтвердить</Button>
  </ModalFooter>
</Modal>
```

---

### Badge

**Путь:** `src/components/ui/badge.tsx`

**Варианты:**
| Вариант | Стиль |
|---------|-------|
| default | bg-white/10 text-white/80 border-white/20 |
| success | bg-accent-green/20 text-accent-green border-accent-green/30 |
| warning | bg-accent-orange/20 text-accent-orange border-accent-orange/30 |
| error | bg-accent-red/20 text-accent-red border-accent-red/30 |
| info | bg-accent-blue/20 text-accent-blue border-accent-blue/30 |

**Размеры:**

- `sm` — px-2 py-0.5 text-xs
- `md` — px-2.5 py-1 text-sm
- `lg` — px-3 py-1.5 text-base

**Props:** dot, pulse (для анимированной точки)

**Использование:**

```tsx
<Badge variant="success" dot pulse>Активен</Badge>
<StatusBadge status="pending" />
```

---

### Spinner

**Путь:** `src/components/ui/spinner.tsx`

Три точки с glow и breathing-анимацией.

**Размеры:** xs | sm | md | lg | xl

**Использование:**

```tsx
<Spinner size="lg" />
<LoadingOverlay visible message="Загрузка..." />
<Skeleton variant="text" />
```

---

### Avatar

**Путь:** `src/components/ui/avatar.tsx`

**Размеры:**
| Size | Container | Text |
|------|-----------|------|
| xs | w-6 h-6 | text-2xs |
| sm | w-8 h-8 | text-xs |
| md | w-10 h-10 | text-sm |
| lg | w-12 h-12 | text-base |
| xl | w-16 h-16 | text-xl |

**Использование:**

```tsx
<Avatar src="/photo.jpg" name="Иван" size="lg" />
<AvatarGroup avatars={users} max={4} />
```

---

### DatePicker

**Путь:** `src/components/ui/date-picker.tsx`

Календарь с выбором даты в формате dd.mm.yyyy. Рендерится через портал.

**Props:**
| Prop | Тип | Описание |
|------|-----|----------|
| label | string? | Лейбл над полем |
| value | string | Значение в формате dd.mm.yyyy |
| onChange | (value: string) => void | Обработчик изменения |
| minDate | Date? | Минимальная дата |
| placeholder | string? | Плейсхолдер (default: "Выберите дату") |

**Использование:**

```tsx
<DatePicker label="Дедлайн доставки" value={deadline} onChange={setDeadline} minDate={new Date()} />
```

---

### Empty / ErrorState

**Путь:** `src/components/ui/empty.tsx`

Компоненты для пустых состояний и ошибок.

**Empty Props:**
| Prop | Тип | Описание |
|------|-----|----------|
| icon | ReactNode? | Иконка/эмодзи |
| title | string | Заголовок |
| description | string? | Описание |
| action | ReactNode? | Кнопка действия |

**Пресеты:** `EmptyPresets.orders`, `EmptyPresets.products`, `EmptyPresets.search`, `EmptyPresets.clients`

**Использование:**

```tsx
<Empty
  icon="📦"
  title="Нет заказов"
  description="Ваши заказы появятся здесь"
  action={<Button>Перейти в каталог</Button>}
/>

<ErrorState
  title="Ошибка загрузки"
  message="Не удалось загрузить данные"
  onRetry={() => refetch()}
/>
```

---

### Header / NavLink / UserMenu

**Путь:** `src/components/ui/header.tsx`

Компоненты для десктопного хедера (скрыт на мобильных).

**Header Props:**
| Prop | Тип | Описание |
|------|-----|----------|
| logo | ReactNode? | Логотип |
| logoHref | string? | Ссылка логотипа (default: "/") |
| children | ReactNode? | Навигация |
| rightContent | ReactNode? | Контент справа |

**Использование:**

```tsx
<Header rightContent={<UserMenu name="Иван" balance={5000} />}>
  <NavLink href="/catalog" active>
    Каталог
  </NavLink>
  <NavLink href="/orders">Заказы</NavLink>
</Header>
```

---

### BottomNav

**Путь:** `src/components/ui/bottom-nav.tsx`

Нижняя навигация для мобильных (скрыта на md+). Glass-стиль с glow-эффектами.

**Props:**
| Prop | Тип | Описание |
|------|-----|----------|
| items | BottomNavItem[] | Элементы навигации |
| activeHref | string? | Активный путь |
| alwaysVisible | boolean? | Показывать на всех экранах |

**BottomNavItem:**

```typescript
interface BottomNavItem {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}
```

**Готовые иконки:** `NavIcons.home`, `NavIcons.catalog`, `NavIcons.orders`, `NavIcons.stats`, `NavIcons.education`, `NavIcons.support`, `NavIcons.profile`

**Использование:**

```tsx
<BottomNav
  items={[
    { href: "/catalog", icon: NavIcons.catalog, label: "Каталог" },
    { href: "/stats", icon: NavIcons.stats, label: "Заказы", badge: 3 },
    { href: "/profile", icon: NavIcons.profile, label: "Профиль" },
  ]}
  activeHref={pathname}
/>
```

---

## Анимации

### Framer Motion паттерны

**Появление элементов:**

```tsx
<motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
>
```

**Кнопки:**

```tsx
<motion.button
  whileTap={{ scale: 0.98 }}
  transition={{ duration: 0.1 }}
>
```

**Карточки при hover:**

```tsx
<motion.div
  whileHover={{ scale: 1.005, y: -2 }}
  transition={{ duration: 0.2 }}
>
```

### CSS анимации

```css
/* Breathing — для Spinner */
@keyframes breathing {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes breathing-glow {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.8);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.2);
  }
}

.animate-breathing {
  animation: breathing 1.4s ease-in-out infinite;
}
.animate-breathing-glow {
  animation: breathing-glow 1.4s ease-in-out infinite;
}
```

---

## Паттерны стилей

### Glass-карточка (инлайн)

```tsx
className={cn(
  "relative rounded-2xl overflow-hidden",
  "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
  "backdrop-blur-xl",
  "border border-glass",
  "shadow-card"
)}
```

### Статус-индикатор с glow

```tsx
<span
  className={cn("w-2 h-2 rounded-full", isBlinking && "animate-pulse")}
  style={{
    background: hexColor,
    boxShadow: `0 0 6px 0 ${hexColor}`,
  }}
/>
```

### Навигационная кнопка "Назад" (BackButton)

```tsx
import { BackButton } from "@/components/ui";

// Простое использование — переход по href
<BackButton href="/avito" />

// С router.back()
<BackButton />
```

**Не используй** inline `<button>` с glass-стилями — всегда импортируй `BackButton`.

### File input

```tsx
<input
  type="file"
  accept="image/*"
  className={cn(
    "w-full text-sm text-white/70",
    "file:mr-4 file:py-2 file:px-4",
    "file:rounded-lg file:border-0",
    "file:text-sm file:font-medium",
    "file:bg-white/10 file:text-white",
    "hover:file:bg-white/20"
  )}
/>
```

---

## Accessibility

### Основные принципы

- **Touch targets:** минимум 44x44px (`min-h-[44px]`). Для маленьких кнопок — невидимая зона: `after:absolute after:inset-[-14px] after:content-['']`
- **Focus ring:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue` на всех интерактивных элементах (40+ кнопок)
- **Контраст:** минимум 4.5:1 для текста
- **ARIA:** labels на иконках-кнопках, `role="button"` на кликабельных div, `aria-controls`/`aria-labelledby` на accordion

### prefers-reduced-motion

Framer Motion: `<MotionConfig reducedMotion="user">` в providers.tsx
CSS-анимации: отключены через `@media (prefers-reduced-motion: reduce)` в globals.css

### Modal focus trap

`focus-trap-react` удерживает фокус внутри модалки. Кнопка закрытия — 40px touch target.

### ARIA-атрибуты

| Компонент         | Атрибуты                                                 |
| ----------------- | -------------------------------------------------------- |
| BottomNav         | `<nav aria-label="Основная навигация">`                  |
| Accordion         | `aria-controls`, `aria-expanded`, `id`, `role="region"`  |
| Avatar (initials) | `role="img" aria-label={name}`                           |
| Input             | `aria-invalid={!!error}`                                 |
| BarcodeUpload     | `role="button" aria-label="Загрузить фото" tabIndex={0}` |
| OrderCard         | `role="button" tabIndex={0} aria-label="Заказ №{id}"`    |

### Safe Area (iOS)

```css
.safe-area-top {
  padding-top: env(safe-area-inset-top);
}
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
.safe-area-x {
  padding-left/right: env(safe-area-inset- *);
}
```

---

## Цвета статусов заказов

| Статус                                               | Цвет      | Класс         |
| ---------------------------------------------------- | --------- | ------------- |
| awaiting_shipment, collecting, in_transit, completed | Зелёный   | accent-green  |
| pending*payment, return*\*                           | Оранжевый | accent-orange |
| cancelled, problem, trash                            | Красный   | accent-red    |
| disposed                                             | Серый     | white/30      |

---

## Быстрые рецепты

### Акцентная карточка

```tsx
<div
  className={cn(
    "relative p-4 rounded-2xl overflow-hidden",
    "backdrop-blur-xl",
    "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
    "border border-accent-blue/30",
    "shadow-card"
  )}
>
  {/* Декоративный блик */}
  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent" />
  {/* Контент */}
</div>
```

### Кнопка выбора (select option)

```tsx
<button
  className={cn(
    "w-full p-3 rounded-xl text-left transition-all border",
    isSelected
      ? "bg-accent-blue/20 border-accent-blue/50 text-white"
      : isDisabled
      ? "bg-white/[0.02] border-glass-subtle text-white/30 cursor-not-allowed"
      : "bg-white/[0.04] border-glass hover:bg-white/[0.08] text-white"
  )}
>
```

### Информационный блок

```tsx
<div className={cn("p-3 rounded-xl", "bg-white/[0.04] border border-glass-subtle")}>
  <div className="flex justify-between text-sm">
    <span className="text-white/60">Label</span>
    <span className="text-white">Value</span>
  </div>
</div>
```

---

## Дополнительные UI-компоненты

### Accordion

**Путь:** `src/components/ui/accordion.tsx`

Компонент аккордеона с ARIA-атрибутами (`aria-controls`, `aria-expanded`, `role="region"`).

**Использование:**

```tsx
<Accordion type="single" variant="separated">
  <AccordionItem value="faq-1">
    <AccordionTrigger>Вопрос?</AccordionTrigger>
    <AccordionContent>Ответ.</AccordionContent>
  </AccordionItem>
</Accordion>
```

### Toggle

**Путь:** `src/components/ui/toggle.tsx`

Переключатель (switch) с label и описанием.

**Использование:**

```tsx
<Toggle label="Только в наличии" checked={inStockOnly} onChange={setInStockOnly} size="sm" />
```

---

## Общие утилиты

### formatPrice

**Путь:** `src/utils/pricing.ts`

Единственный источник форматирования цен. Добавляет ` ₽` и пробелы-разделители.

```tsx
import { formatPrice } from "@/utils/pricing";
formatPrice(1500); // "1 500 ₽"
```

### sortSizes / sizeOrder

**Путь:** `src/utils/sizes.ts`

Стандартный порядок размеров одежды (XXS → 5XL, 38 → 58, ONE SIZE).

```tsx
import { sortSizes, sizeOrder } from "@/utils/sizes";
sortSizes(["L", "S", "XL"]); // ["S", "L", "XL"]
```
