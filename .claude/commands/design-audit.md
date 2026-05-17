# Design Audit

Проведи комплексный аудит UI дизайна проекта на консистентность и качество.

## Фаза 1: Обнаружение дизайн-системы

1. Найди конфигурацию стилей:
   - `tailwind.config.*` — кастомные цвета, spacing, fonts
   - `globals.css` / `variables.css` — CSS-переменные
   - `theme.ts` / `tokens.ts` — дизайн-токены
   - `DESIGN_SYSTEM.md` — документация

2. Определи стек:
   - Tailwind CSS / CSS Modules / styled-components / Emotion
   - UI библиотека: shadcn, Radix, MUI, Chakra, Mantine
   - Анимации: Framer Motion, React Spring, CSS

3. Найди UI компоненты: `components/ui/`, `components/common/`, `shared/`

## Фаза 2: Анализ консистентности

### Цвета
- [ ] Все цвета через переменные/токены, не hardcoded (#xxx, rgb, hsl)
- [ ] Единая палитра: primary, secondary, accent, success, warning, error
- [ ] Согласованные opacity для overlays и текста

### Spacing (отступы)
- [ ] Используется система: 4px/8px сетка или Tailwind spacing
- [ ] Нет произвольных значений (px-[13px], mt-[7px])
- [ ] Консистентные gap, padding, margin между компонентами

### Typography
- [ ] Определены font-family, sizes, weights, line-heights
- [ ] Иерархия заголовков (h1-h6) единообразна
- [ ] Текст: primary, secondary, muted, disabled

### Border & Radius
- [ ] Единая система радиусов (sm, md, lg, xl, full)
- [ ] Согласованные border-width и border-color
- [ ] Нет hardcoded значений

### Shadows
- [ ] Определены уровни: sm, md, lg, xl
- [ ] Согласованное использование по глубине элементов

### Компоненты
- [ ] Базовые UI используются везде (Button, Input, Card, Modal)
- [ ] Нет дублирования (два разных Button в проекте)
- [ ] Variants/sizes согласованы

## Фаза 3: Проверка состояний

### Интерактивные элементы
- [ ] hover — визуальная обратная связь
- [ ] active/pressed — реакция на клик
- [ ] focus — видимый outline для a11y
- [ ] disabled — визуально неактивен + cursor

### Загрузка
- [ ] Кнопки: loading state с spinner
- [ ] Списки: skeleton или placeholder
- [ ] Страницы: loading overlay или progress

### Пустые состояния
- [ ] Пустые списки: иконка + текст + CTA
- [ ] Нет результатов поиска
- [ ] Нет данных

### Ошибки
- [ ] Формы: inline ошибки под полями
- [ ] API: toast/alert с retry
- [ ] Критические: error boundary

## Фаза 4: Accessibility (a11y)

- [ ] Touch targets: минимум 44x44px
- [ ] Focus visible: ring/outline на всех интерактивных
- [ ] Color contrast: 4.5:1 для текста, 3:1 для UI
- [ ] ARIA: labels на иконках-кнопках, role где нужно
- [ ] Keyboard: Tab navigation работает

## Фаза 5: Responsive

- [ ] Breakpoints используются консистентно
- [ ] Mobile-first или desktop-first — единый подход
- [ ] Компоненты адаптируются корректно

## Фаза 6: Анимации

- [ ] Единые timing functions (ease, spring)
- [ ] Согласованные duration (fast: 100-150ms, normal: 200-300ms)
- [ ] Не перегружено анимациями
- [ ] prefers-reduced-motion учитывается

---

## Формат отчёта

### 🔴 Critical — нарушает дизайн-систему
Примеры:
- `file.tsx:42` — hardcoded цвет `#3b82f6`, использовать `text-primary` или `var(--primary)`
- `card.tsx:15` — кастомный радиус `rounded-[14px]`, использовать `rounded-xl`

### 🟡 Warning — несогласованность
Примеры:
- `button.tsx:8` — отсутствует disabled state
- `list.tsx:23` — нет empty state для пустого массива
- `form.tsx:45` — input без focus-visible стилей

### 🔵 Info — рекомендации
Примеры:
- `modal.tsx:5` — можно добавить анимацию появления
- `page.tsx:12` — skeleton вместо текста "Загрузка..."

### 📊 Summary
```
Файлов проверено: X
Компонентов: Y
Critical: N
Warning: N
Info: N

Общая оценка: X/10
```

---

## Примечания

- Сначала изучи дизайн-систему проекта, потом проверяй
- Если дизайн-системы нет — отметь это как Critical
- Предлагай конкретные исправления с кодом
- Группируй проблемы по файлам для удобства
