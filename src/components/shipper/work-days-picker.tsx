"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useWorkDays, useSetWorkDays } from "@/hooks/use-work-days";

const DAY_LABELS: Record<number, { short: string; full: string }> = {
  1: { short: "Пн", full: "Понедельник" },
  2: { short: "Вт", full: "Вторник" },
  3: { short: "Ср", full: "Среда" },
  4: { short: "Чт", full: "Четверг" },
  5: { short: "Пт", full: "Пятница" },
  6: { short: "Сб", full: "Суббота" },
  0: { short: "Вс", full: "Воскресенье" },
};

// Display order: Mon–Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function WorkDaysPicker() {
  const { data, isLoading } = useWorkDays();
  const setWorkDays = useSetWorkDays();
  const [selected, setSelected] = useState<number[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Already set — show read-only
  if (data?.workDays && data.workDays.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-2xl p-4",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card"
        )}
      >
        <h3 className="text-sm font-medium text-white/60 mb-3">Рабочие дни</h3>
        <div className="flex gap-1.5">
          {DAY_ORDER.map((day) => {
            const isActive = data.workDays!.includes(day);
            return (
              <div
                key={day}
                className={cn(
                  "flex-1 py-2 rounded-xl text-center text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/20"
                    : "bg-white/[0.03] text-white/20 border border-transparent"
                )}
              >
                {DAY_LABELS[day].short}
              </div>
            );
          })}
        </div>
        <p className="text-2xs text-white/40 mt-2">Для изменения обратись к владельцу</p>
      </motion.div>
    );
  }

  // Not set — picker
  if (!initialized && !isLoading) {
    setInitialized(true);
  }

  const minDays = data?.minWorkDays || 4;
  const canSave = selected.length >= minDays;

  function toggleDay(day: number) {
    setSelected((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function handleSave() {
    if (!canSave) return;
    setWorkDays.mutate(selected);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-accent-blue/20",
        "shadow-card"
      )}
    >
      <h3 className="text-sm font-medium text-white mb-1">Выбери рабочие дни</h3>
      <p className="text-xs text-white/40 mb-3">
        Минимум {minDays}. После сохранения менять может только владелец.
      </p>

      <div className="flex gap-1.5 mb-3">
        {DAY_ORDER.map((day) => {
          const isActive = selected.includes(day);
          return (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-center text-xs font-medium transition-all border",
                isActive
                  ? "bg-accent-blue/20 text-accent-blue border-accent-blue/40"
                  : "bg-white/[0.04] text-white/60 border-glass hover:bg-white/[0.08] hover:text-white"
              )}
            >
              {DAY_LABELS[day].short}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && selected.length < minDays && (
        <p className="text-2xs text-accent-orange mb-2">
          Выбрано {selected.length} из {minDays} минимум
        </p>
      )}

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        onClick={handleSave}
        isLoading={setWorkDays.isPending}
        disabled={!canSave}
      >
        Сохранить
      </Button>

      {setWorkDays.isError && (
        <p className="text-2xs text-accent-red mt-2">{setWorkDays.error.message}</p>
      )}
    </motion.div>
  );
}
