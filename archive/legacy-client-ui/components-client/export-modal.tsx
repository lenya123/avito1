"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import { cn } from "@/utils/cn";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui";

type ExportPeriod = "all" | "month" | "3months" | "custom";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PERIODS: { value: ExportPeriod; label: string }[] = [
  { value: "all", label: "Всё время" },
  { value: "3months", label: "3 месяца" },
  { value: "month", label: "Месяц" },
];

const isoToDisplay = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
};

const displayToIso = (displayDate: string): string => {
  if (!displayDate) return "";
  const [day, month, year] = displayDate.split(".");
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
};

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [period, setPeriod] = useState<ExportPeriod>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePeriodChange = (value: ExportPeriod) => {
    setPeriod(value);
    if (value !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
  };

  const handleExport = async () => {
    if (period === "custom" && !dateFrom && !dateTo) {
      setError("Укажите хотя бы одну дату");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const body: Record<string, string> =
        period === "custom"
          ? { period: "custom", ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }) }
          : { period };

      const res = await fetch("/api/export/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Ошибка экспорта");
      }

      const blob = await res.blob();
      const date = new Date()
        .toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
        .replace(/\./g, "-");
      saveAs(blob, `заказы_${date}.xlsx`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка экспорта");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Экспорт заказов"
      description="Выгрузите данные по заказам в Excel"
      size="sm"
    >
      <div className="space-y-4">
        {/* Period selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">Период</label>
          <div className="grid grid-cols-3 gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handlePeriodChange(p.value)}
                className={cn(
                  "py-2.5 px-2 rounded-xl text-sm font-medium transition-all duration-200",
                  "border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
                  period === p.value
                    ? "bg-white/[0.12] border-glass-strong text-white shadow-glass-inset"
                    : "bg-white/[0.04] border-glass-subtle text-white/40 hover:bg-white/[0.08] hover:text-white/60"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom period button */}
          <button
            type="button"
            onClick={() => handlePeriodChange("custom")}
            className={cn(
              "w-full py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200",
              "border flex items-center justify-center gap-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:rounded-xl",
              period === "custom"
                ? "bg-white/[0.12] border-glass-strong text-white shadow-glass-inset"
                : "bg-white/[0.04] border-glass-subtle text-white/40 hover:bg-white/[0.08] hover:text-white/60"
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {period === "custom" && (dateFrom || dateTo)
              ? `${dateFrom ? isoToDisplay(dateFrom) : "..."} — ${dateTo ? isoToDisplay(dateTo) : "..."}`
              : "Выбрать период"}
          </button>
        </div>

        {/* Custom date range */}
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="От"
              value={isoToDisplay(dateFrom)}
              onChange={(display) => setDateFrom(displayToIso(display))}
              placeholder="дд.мм.гггг"
            />
            <DatePicker
              label="До"
              value={isoToDisplay(dateTo)}
              onChange={(display) => setDateTo(displayToIso(display))}
              placeholder="дд.мм.гггг"
            />
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle">
          <svg
            className="w-4 h-4 shrink-0 mt-0.5 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-xs text-white/40 leading-relaxed">
            Файл будет содержать сводку по статистике и подробную таблицу всех заказов с ценами,
            прибылью и статусами
          </p>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-center text-accent-red">{error}</p>}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          onClick={handleExport}
          isLoading={isExporting}
          leftIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          }
        >
          Скачать .xlsx
        </Button>
      </ModalFooter>
    </Modal>
  );
}
