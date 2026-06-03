"use client";

import { templateFor } from "@/lib/constants/listing-templates";
import { cn } from "@/utils/cn";

interface DescriptionTemplateButtonProps {
  category: string | null | undefined;
  currentValue: string;
  onInsert: (text: string) => void;
  className?: string;
}

/**
 * Кнопка «Шаблон» рядом с полем описания: вставляет скелет описания по категории
 * товара. Дизейбл, если категория не выбрана. При непустом описании — подтверждение.
 * Используется в форме создания/редактирования товара и в модалке «Создать объявление».
 */
export function DescriptionTemplateButton({
  category,
  currentValue,
  onInsert,
  className,
}: DescriptionTemplateButtonProps) {
  const tpl = templateFor(category);
  const disabled = !tpl;

  const handleClick = () => {
    if (!tpl) return;
    if (currentValue.trim() && !confirm("Заменить текущее описание шаблоном?")) return;
    onInsert(tpl);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? "Сначала выберите категорию" : "Вставить шаблон по категории"}
      className={cn(
        "text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/70",
        "hover:text-white hover:bg-white/[0.06] transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
    >
      📋 Шаблон
    </button>
  );
}
