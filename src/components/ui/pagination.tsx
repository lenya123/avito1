"use client";

import { useState } from "react";
import { cn } from "@/utils/cn";
import { Button } from "./button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const [jumpInput, setJumpInput] = useState("");
  const [showJump, setShowJump] = useState(false);

  if (totalPages <= 1) return null;

  // Window-based pagination: show pages around current
  const getVisiblePages = () => {
    const pages: (number | "...")[] = [];
    const windowSize = 2; // pages on each side of current

    // Always show page 1
    pages.push(1);

    const start = Math.max(2, page - windowSize);
    const end = Math.min(totalPages - 1, page + windowSize);

    if (start > 2) pages.push("...");

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) pages.push("...");

    // Always show last page
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const handleJump = () => {
    const target = Number(jumpInput);
    if (target >= 1 && target <= totalPages) {
      onPageChange(target);
      setShowJump(false);
      setJumpInput("");
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
      >
        Назад
      </Button>

      <div className="flex items-center gap-1">
        {getVisiblePages().map((p, i) =>
          p === "..." ? (
            <button
              key={`dots-${i}`}
              onClick={() => setShowJump(!showJump)}
              className="w-8 h-8 text-white/40 text-sm hover:text-white transition-colors"
              title="Перейти к странице"
            >
              ...
            </button>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                "w-8 h-8 rounded-xl text-sm transition-colors duration-200",
                page === p
                  ? "bg-white/[0.12] text-white shadow-glass-inset"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              )}
            >
              {p}
            </button>
          )
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Далее
      </Button>

      {/* Jump-to-page popover */}
      {showJump && (
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJump()}
            placeholder={`1-${totalPages}`}
            className={cn(
              "w-20 px-2 py-1.5 rounded-xl text-sm text-white text-center",
              "bg-white/[0.06] border border-glass",
              "focus:outline-none focus:ring-2 focus:ring-accent-blue"
            )}
            autoFocus
          />
          <button
            onClick={handleJump}
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Перейти
          </button>
        </div>
      )}
    </div>
  );
}
