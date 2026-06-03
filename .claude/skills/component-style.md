# Component Style Pattern

Паттерн создания UI компонентов. **Цвета, токены, тени, компоненты** → см. `docs/DESIGN_SYSTEM.md`.

## КРИТИЧЕСКИЕ ПРАВИЛА

### НИКОГДА

- `text-[Xpx]` — только стандартные Tailwind: text-2xs / text-xs / text-sm / text-base / text-lg / text-xl / text-2xl / text-3xl
- `text-white/NN` кроме 5 уровней — только /80 /60 /40 /20 (или без opacity = 100%). Правило ТО ЖЕ для accent-цветов: `text-accent-blue/70` ❌ → `text-accent-blue/60` ✅
- Hex в className (`#BF5AF2`, `#229ED9`) — используй accent-purple, accent-telegram и т.д.
- Inline gradient кнопки — используй `<Button variant="primary/warning/danger">`
- Inline glass-карточка — используй `<Card>`
- Inline back button — используй `<BackButton href="..." />`
- `shadow-[...]` где есть токен — shadow-card / shadow-glass / shadow-button-primary / shadow-modal
- `rounded-lg` для badges/pills/info-blocks — используй `rounded-xl` (rounded-lg только для иконок w-7..w-9)

### ВСЕГДА

- Импорт UI: `import { Button, Card, Input, Modal, Badge, Spinner, Empty } from "@/components/ui"`
- cn() для всех className
- Framer Motion для анимаций появления

### ❌ → ✅

| Плохо                                       | Хорошо                         |
| ------------------------------------------- | ------------------------------ |
| `text-[11px]`                               | `text-xs`                      |
| `text-[13px]`                               | `text-sm`                      |
| `text-[15px]` / `text-[17px]`               | `text-base`                    |
| `text-[9px]`                                | `text-2xs`                     |
| `text-white/90`                             | `text-white/80`                |
| `text-white/70`                             | `text-white/60`                |
| `text-white/50`                             | `text-white/60`                |
| `text-white/30`                             | `text-white/40`                |
| `text-white/25` / `text-white/10`           | `text-white/20`                |
| `bg-[#1c1c1e]`                              | `bg-secondary`                 |
| `text-[#BF5AF2]`                            | `text-accent-purple`           |
| `text-[#229ED9]`                            | `text-accent-telegram`         |
| `text-[#AED6FF]`                            | `text-level-1`                 |
| `text-[#5DAEFF]`                            | `text-level-2`                 |
| `from-[#4da6ff] via-[#2196ff] to-[#0A84FF]` | `<Button variant="primary">`   |
| `from-[#ffbe4d] via-[#ffaa30] to-[#FF9F0A]` | `<Button variant="warning">`   |
| `bg-[rgba(50,50,50,0.9)]`                   | `<Button variant="secondary">` |
| Inline `<button>` back arrow                | `<BackButton href="..." />`    |
| `rounded-lg` на badge/pill                  | `rounded-xl`                   |

### Layout и Spacing

#### Card gotcha (КРИТИЧНО)

```
❌ <Card className="space-y-3">         — НЕ работает (Card оборачивает children в <div className="relative">)
✅ <Card><div className="space-y-3">... — обёртка внутри
✅ Явные mb-*/mt-* на children          — предпочтительно
```

#### Spacing scale (ограниченный набор)

| Токен                     | Значение | Использование                                    |
| ------------------------- | -------- | ------------------------------------------------ |
| `gap-1` / `gap-1.5`       | 4-6px    | Иконка ↔ label внутри одного элемента            |
| `gap-2` / `space-y-2`     | 8px      | Связанная пара (label + value, title + subtitle) |
| `gap-2.5` / `space-y-2.5` | 10px     | Поля формы между собой                           |
| `gap-3` / `space-y-3`     | 12px     | Элементы в карточке, items в списке              |
| `gap-4` / `space-y-4`     | 16px     | Grid карточек, секции внутри страницы            |
| `gap-6` / `space-y-6`     | 24px     | Секции дашборда, крупные блоки                   |
| `mb-6` → `mb-8`           | 24-32px  | Заголовок страницы → контент                     |

**Принцип иерархии (Gestalt proximity):** внутренний spacing < внешний spacing (минимум 1.5×). Связанные элементы ближе, несвязанные — дальше.

#### Layout-рецепты

**1. Форма в Card:**

```tsx
<Card padding="sm">
  <div className="flex items-center gap-2 mb-3">  {/* Заголовок */}
    <span>📦</span>
    <p className="text-sm font-medium text-white/80">Title</p>
  </div>
  <form>
    <div className="space-y-2.5">             {/* Поля — плотно */}
      <Input ... />
      <Input ... />
    </div>
    <Button className="w-full mt-3">Action</Button>  {/* Кнопка — отделена */}
  </form>
  <p className="text-xs text-white/40 mt-2">Footnote</p>  {/* Сноска */}
</Card>
```

**2. Секция дашборда:**

```tsx
<section>
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-lg font-semibold text-white">Title</h2>
    <button className="text-sm text-accent-blue">All →</button>
  </div>
  <Card padding="none">
    <div className="px-4">
      {items.map((item) => (
        <Row key={item.id} />  {/* border-b внутри Row */}
      ))}
    </div>
  </Card>
</section>
```

**3. Card с контентом:**

```tsx
<Card>
  {" "}
  {/* default padding="md" = p-4 */}
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-base font-medium text-white">Title</h3>
    <Badge>Status</Badge>
  </div>
  <div className="space-y-3">Content</div>
  <div className="pt-3 mt-3 border-t border-glass-minimal">Footer</div>
</Card>
```

#### Антипаттерны → исправления

| Плохо                                    | Хорошо                                                               | Почему                                       |
| ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `<Card className="space-y-3">`           | `<Card>` + явные mb/mt                                               | space-y не пробрасывается через Card wrapper |
| `<form className="space-y-3">` с кнопкой | `<div className="space-y-2.5">` inputs + `<Button className="mt-3">` | Кнопка отделена от полей                     |
| Одинаковый gap для всех элементов        | Меньше gap для связанных, больше для несвязанных                     | Gestalt proximity                            |
| `space-y-4` между label и value          | `gap-2` или `mt-1`                                                   | Пара label-value — один элемент              |

### Import paths

Barrel import из `@/components/ui`:

```tsx
import {
  Button,
  BackButton,
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  Input,
  Modal,
  ModalFooter,
  Badge,
  StatusBadge,
  Spinner,
  LoadingOverlay,
  Skeleton,
  Empty,
  ErrorState,
  EmptyPresets,
  Avatar,
  AvatarGroup,
  DatePicker,
  Toggle,
  Accordion,
  AccordionItem,
  ListItem,
  ListGroup,
  BottomNav,
  Header,
} from "@/components/ui";
```

---

## Базовый компонент

```tsx
"use client";

import { forwardRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

// 1. Типы
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  className?: string;
  children: ReactNode;
}

// 2. Variants через Record<string, string>
const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-gradient-to-b from-[#4da6ff] via-[#2196ff] to-[#0A84FF]",
    "text-white",
    "border border-glass-active",
    "shadow-button-primary"
  ),
  secondary: cn(
    "bg-[rgba(50,50,50,0.9)]",
    "text-white/90",
    "border border-glass-active",
    "shadow-[0_2px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]"
  ),
  ghost: cn("bg-transparent text-white/60", "hover:bg-white/10 hover:text-white"),
  danger: cn(
    "bg-gradient-to-b from-[#ff6b6b] via-[#ff5252] to-[#FF453A]",
    "text-white",
    "border border-glass-active",
    "shadow-button-primary"
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-xl",
  md: "px-4 py-2.5 text-base rounded-xl",
  lg: "px-6 py-3 text-lg rounded-xl",
};

// 3. forwardRef + motion
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className, children }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "font-semibold transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
      >
        {isLoading ? <Spinner size="sm" /> : children}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
```

## Glass-карточка

```tsx
// Стандартная стеклянная карточка (Card компонент)
<div
  className={cn(
    "relative rounded-2xl overflow-hidden",
    "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
    "backdrop-blur-xl",
    "border border-glass",
    "shadow-card"
  )}
>
  {/* Декоративный блик сверху */}
  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
  {/* Контент */}
</div>
```

**Tailwind-токены** (определены в `tailwind.config.ts`):

- Borders: `border-glass` (карточки) · `border-glass-active` (кнопки/модалки) · `border-glass-minimal` (разделители) · `border-glass-subtle` · `border-glass-strong` · `border-glass-glow`
- Shadows: `shadow-card` · `shadow-card-hover` · `shadow-glass` · `shadow-glass-sm` · `shadow-glass-inset` · `shadow-button-primary`

## Compound component

Паттерн для сложных компонентов (Accordion, Card):

```tsx
// 1. Context
const AccordionContext = createContext<AccordionState | null>(null);
function useAccordion() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("useAccordion must be within Accordion");
  return ctx;
}

// 2. Root с провайдером
export function Accordion({ children, type = "single" }: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>([]);
  return (
    <AccordionContext.Provider value={{ openItems, toggle, type }}>
      <div>{children}</div>
    </AccordionContext.Provider>
  );
}

// 3. Children используют context
export function AccordionTrigger({ children }: { children: ReactNode }) {
  const { toggle } = useAccordion();
  return (
    <button aria-expanded={isOpen} aria-controls={`content-${id}`} onClick={() => toggle(id)}>
      {children}
    </button>
  );
}

export function AccordionContent({ children }: { children: ReactNode }) {
  return (
    <div role="region" aria-labelledby={`trigger-${id}`}>
      {children}
    </div>
  );
}
```

## Skeleton

```tsx
export function CardSkeleton() {
  return (
    <div
      className={cn(
        "relative p-4 rounded-2xl overflow-hidden animate-pulse",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
      aria-hidden="true"
    >
      <div className="h-4 w-16 bg-white/10 rounded" />
      <div className="h-7 w-24 bg-white/10 rounded mt-1" />
    </div>
  );
}
```

## Сложные variants

Когда нужно больше одного класса на вариант:

```tsx
type Color = "blue" | "green" | "orange";

const COLOR_STYLES: Record<Color, { bg: string; border: string; shadow: string; text: string }> = {
  blue: {
    bg: "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
    border: "border-accent-blue/25",
    shadow: "shadow-[0_0_12px_rgba(10,132,255,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]",
    text: "text-accent-blue",
  },
  // ...
};

// Использование:
const style = COLOR_STYLES[color];
<div className={cn(style.bg, style.border, style.shadow)}>
  <span className={style.text}>{label}</span>
</div>;
```

## Правила принятия решений (ОБЯЗАТЕЛЬНО)

> Полная версия с примерами → `docs/DESIGN_SYSTEM.md` → раздел «Правила принятия решений»

### Button variant — спроси «Что это за действие?»

| Действие                              | Вариант             | Пример                      |
| ------------------------------------- | ------------------- | --------------------------- |
| Финальное подтверждение (1 на экран)  | `primary`           | Купить, Оформить, Отправить |
| Предупреждающее CTA / активный toggle | `warning`           | Уведомить, Оформить заказ   |
| Действие в карточке                   | `secondary`         | Привязать, Цена             |
| Утилитарное (не CTA)                  | `ghost` + className | Синхронизировать, Экспорт   |
| Минимальное/отмена                    | `ghost`             | Отмена, Сбросить            |
| Деструктивное                         | `danger`            | Удалить                     |

**Паттерн «утилитарная кнопка»** (= неактивный фильтр с /catalog):

```tsx
<Button
  variant="ghost"
  size="sm"
  className="bg-white/[0.06] text-white/60 border border-glass-subtle shadow-glass-inset hover:text-white hover:bg-white/[0.10] hover:border-white/20"
/>
```

### Badge — несёт ли информацию?

- Страница только активные товары → бейдж «Активно» бессмыслен
- Статус виден из контекста → бейдж дублирует

### Text opacity — /20 нечитаем

`/40` — минимум для текста, который должен быть прочитан. `/20` — только декоративные разделители и disabled.

### Загрузка на дашборде

1. Все хуки в компоненте страницы (React Query кэширует)
2. `isLoading = a || b || c` (НЕ `&&`)
3. Один `<Spinner>` → stagger-анимация из родителя
4. Дочерние компоненты БЕЗ своих `initial/animate`

### Консистентность

Обновил элемент → проверь ВСЕ соседние элементы в том же header/карточке/секции.

---

## Правила

1. **cn()** — `import { cn } from "@/utils/cn"` для всех классов
2. **Framer Motion** — `whileTap`, `whileHover`, `initial`/`animate`/`exit` с `AnimatePresence`
3. **forwardRef + displayName** — для интерактивных элементов, которым нужен ref
4. **Tailwind-токены** — используй `border-glass-*`, `shadow-card` и т.д. (не inline rgba)
5. **Accessibility** — `focus-visible:ring-2 ring-accent-blue`, `aria-expanded`, `aria-controls`, `role`, `FocusTrap` в модалках
6. **Skeleton** — `animate-pulse` + glass-стили + `aria-hidden="true"` для загрузки
7. **Дизайн-система** — цвета, типографика, токены → `docs/DESIGN_SYSTEM.md`

## Расположение файлов

- `src/components/ui/` — базовые: Button, Card, Input, Modal, Badge, Accordion, Toggle, Spinner
- `src/components/client/` — компоненты клиента
- `src/components/owner/` — компоненты владельца (подпапки по разделам)
- `src/components/shipper/` — компоненты отправщика
