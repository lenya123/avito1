"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface SelectAllRowProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
}

export function SelectAllRow({ selectedCount, totalCount, onSelectAll }: SelectAllRowProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="flex items-center justify-between"
    >
      <button
        onClick={onSelectAll}
        className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
      >
        <div
          className={cn(
            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
            allSelected ? "bg-accent-blue border-accent-blue" : "border-white/30"
          )}
        >
          {allSelected && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        Выбрать все
      </button>
      {selectedCount > 0 && (
        <span className="text-sm text-accent-blue">Выбрано: {selectedCount}</span>
      )}
    </motion.div>
  );
}
