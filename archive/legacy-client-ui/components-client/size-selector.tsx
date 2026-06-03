"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export type SizeOption = {
  id: string;
  size: string;
  available: number;
  isReserved?: boolean;
};

export interface SizeSelectorProps {
  sizes: SizeOption[];
  selectedSizeId: string | null;
  onSelect: (sizeId: string, size: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SizeSelector({
  sizes,
  selectedSizeId,
  onSelect,
  disabled = false,
  className,
}: SizeSelectorProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2.5">
        {sizes.map((sizeOption, index) => {
          const isSelected = selectedSizeId === sizeOption.id;
          const available = Number(sizeOption.available) || 0;
          const isAvailable = available > 0;
          const isDisabledOption = !isAvailable || disabled;

          return (
            <motion.button
              key={sizeOption.id}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              whileTap={{ scale: isDisabledOption ? 1 : 0.95 }}
              whileHover={!isDisabledOption ? { y: -1 } : undefined}
              onClick={() => {
                if (!isDisabledOption) {
                  onSelect(sizeOption.id, sizeOption.size);
                }
              }}
              disabled={isDisabledOption}
              className={cn(
                "relative min-w-[3.5rem] px-4 py-3 rounded-xl",
                "text-sm font-semibold transition-all duration-200",
                "backdrop-blur-sm border",
                "shadow-glass-inset",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                isSelected
                  ? [
                      // Выбранный - стеклянный стиль (как фильтры в каталоге)
                      "bg-white/[0.18] text-white border-glass-strong",
                      "shadow-card",
                    ]
                  : isAvailable
                    ? [
                        // Доступный - стеклянный стиль (как фильтры в каталоге)
                        "bg-white/[0.08] text-white/60 border-glass",
                        "hover:text-white hover:bg-white/[0.12] hover:border-white/25",
                      ]
                    : [
                        // Недоступный
                        "bg-transparent text-white/20 border-white/[0.08]",
                        "cursor-not-allowed",
                      ]
              )}
            >
              <span className="relative z-10">{sizeOption.size}</span>

              {/* Количество badge */}
              {isAvailable && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.03 + 0.1, type: "spring" }}
                  className={cn(
                    "absolute -top-2 -right-2 min-w-[1.35rem] h-[1.35rem]",
                    "flex items-center justify-center px-1.5",
                    "text-2xs font-bold rounded-full",
                    "border",
                    isSelected
                      ? "bg-[rgba(50,50,50,0.95)] text-white border-glass-strong shadow-glass-sm"
                      : "bg-[rgba(50,50,50,0.9)] text-white/80 border-glass"
                  )}
                >
                  {available}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      {sizes.length === 0 && (
        <div className="flex items-center justify-center py-6 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-sm text-white/40">Нет доступных размеров</p>
        </div>
      )}
    </div>
  );
}
