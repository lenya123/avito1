# Page Creation Pattern

Шаблон создания новой страницы клиента. **Обязательно** перед созданием страницы прочитай `docs/DESIGN_SYSTEM.md` (TLDR) и `component-style.md` (КРИТИЧЕСКИЕ ПРАВИЛА).

## Шаблон страницы

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button, BackButton, Card, Spinner, Empty } from "@/components/ui";

export default function ExamplePage() {
  const router = useRouter();

  // React Query для данных
  const { data, isLoading, error } = useQuery(/* ... */);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pt-6 pb-24">
        <Empty
          icon="⚠️"
          title="Ошибка загрузки"
          description="Попробуйте обновить страницу"
          action={<Button onClick={() => window.location.reload()}>Обновить</Button>}
        />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="px-4 pt-6 pb-24">
        <Empty icon="📦" title="Пока пусто" description="Данные появятся здесь" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 space-y-4">
      {/* Header с навигацией (подстраница — text-xl + BackButton) */}
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/previous" />
        <h1 className="text-xl font-bold text-white">Заголовок</h1>
      </div>

      {/* ИЛИ: главная страница без BackButton — text-2xl */}
      {/* <h1 className="text-2xl font-bold text-white mb-6">Заголовок</h1> */}

      {/* Карточки */}
      {data.map((item) => (
        <Card key={item.id} padding="md">
          <p className="text-sm text-white">{item.title}</p>
          <p className="text-xs text-white/60">{item.description}</p>
        </Card>
      ))}
    </div>
  );
}
```

## Чеклист перед коммитом

Проверь файл на соответствие дизайн-системе:

- [ ] **Нет `text-[Xpx]`** — только стандартные Tailwind: text-2xs через text-3xl
- [ ] **Нет нестандартных opacity** — только /80 /60 /40 /20 (для text-white И для accent-цветов)
- [ ] **Нет hex в className** — только accent-_, level-_, bg-secondary и т.д.
- [ ] **Кнопки через `<Button>`** — primary / warning / secondary / ghost / danger
- [ ] **Карточки через `<Card>`** — не inline glass pattern
- [ ] **Назад через `<BackButton>`** — не inline `<button>` с glass-стилями
- [ ] **Тени через токены** — shadow-card / shadow-glass / shadow-glass-sm где возможно
- [ ] **cn()** используется для всех className
- [ ] **rounded** — badges/pills `rounded-xl`, карточки `rounded-2xl`, иконки `rounded-lg`
- [ ] **Заголовки** — главная text-2xl, подстраница text-xl, секция text-lg
- [ ] **Loading state** — Spinner или Skeleton
- [ ] **Empty state** — Empty компонент
- [ ] **Error state** — ErrorState или Empty с кнопкой retry
- [ ] **Touch targets** — min-h-[44px] для кнопок
- [ ] **focus-visible** — ring-2 ring-accent-blue на интерактивных элементах

## Правила текста

```
Заголовок главной страницы:  text-2xl font-bold text-white   (без BackButton)
Заголовок подстраницы:       text-xl font-bold text-white    (с BackButton)
Секция на странице:          text-lg font-semibold text-white
Заголовок карточки:          text-base font-medium text-white
Описание:                    text-sm text-white/80
Вторичный текст:             text-xs text-white/60
Label/hint:                  text-xs text-white/40
Мета/timestamp:              text-2xs text-white/40
Неактивный:                  text-white/20
Крупные значения:            text-2xl font-bold text-white   (stat values)
Выделенные значения:         text-3xl font-bold text-white   (баланс, score)
```

## Правила цветов

```
Основной акцент:     accent-blue
Успех:               accent-green
Ошибка:              accent-red
Предупреждение:      accent-orange
Премиум:             accent-purple
Telegram:            accent-telegram
Уровни:              level-1, level-2, accent-blue (уровень 3)
```
