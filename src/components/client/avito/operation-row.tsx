"use client";

import { cn } from "@/utils/cn";

interface OperationRowProps {
  operationName: string;
  datetime: string;
  amountRub: number;
  amountBonus: number;
  serviceName?: string;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${amount.toLocaleString("ru")} ₽`;
}

export function OperationRow({
  operationName,
  datetime,
  amountRub,
  amountBonus,
  serviceName,
}: OperationRowProps) {
  const isPositive = amountRub >= 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-glass-minimal last:border-b-0">
      {/* Left side: name + meta */}
      <div className="flex-1 min-w-0 mr-3">
        <p className="text-sm text-white/80 truncate">{operationName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-white/40">{formatDate(datetime)}</span>
          {serviceName && (
            <>
              <span className="text-xs text-white/20">·</span>
              <span className="text-xs text-white/40 truncate">{serviceName}</span>
            </>
          )}
        </div>
      </div>

      {/* Right side: amounts */}
      <div className="flex flex-col items-end shrink-0">
        <span
          className={cn(
            "text-sm font-medium",
            isPositive ? "text-accent-green" : "text-accent-red"
          )}
        >
          {formatAmount(amountRub)}
        </span>
        {amountBonus !== 0 && (
          <span className="text-xs text-accent-purple/80">
            {amountBonus >= 0 ? "+" : ""}
            {amountBonus.toLocaleString("ru")} бон.
          </span>
        )}
      </div>
    </div>
  );
}
