"use client";

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";

interface DailyEntry {
  date: string;
  orders: number;
  earnings: number;
}

export const DailyEarningsChart = memo(function DailyEarningsChart({
  data,
}: {
  data: DailyEntry[];
}) {
  const maxEarnings = useMemo(() => Math.max(...data.map((d) => d.earnings), 1), [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/40 text-sm">
        Нет данных за этот месяц
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((entry, i) => {
        const heightPercent = (entry.earnings / maxEarnings) * 100;
        return (
          <motion.div
            key={entry.date}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.3 + i * 0.03, duration: 0.4, ease: "easeOut" }}
            className="flex-1 flex flex-col items-center justify-end origin-bottom group"
          >
            <div className="relative w-full flex justify-center mb-1">
              <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-2xs text-white/60 whitespace-nowrap">
                {entry.earnings > 0 ? formatPrice(entry.earnings) : "—"}
              </div>
            </div>
            <div
              className={cn(
                "w-full rounded-t-sm min-h-[2px] transition-colors",
                entry.earnings > 0
                  ? "bg-gradient-to-t from-accent-green/60 to-accent-green"
                  : "bg-white/10"
              )}
              style={{ height: `${Math.max(heightPercent, 2)}%` }}
            />
            {(i === 0 || i === data.length - 1 || i % 5 === 0) && (
              <span className="text-2xs text-white/40 mt-1 truncate max-w-full">
                {new Date(entry.date + "T00:00:00").getDate()}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
});
