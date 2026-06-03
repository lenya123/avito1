"use client";

/**
 * Категория-зависимый редактор размеров + замеров (форма создания и
 * редактирования). Канон §11.6. Контролируемый: value + onChange.
 *
 *  letters  — буквы тогглами (+ «Стандартные»)
 *  jeans    — буквы + опциональная цифра → «M (31)»
 *  shoe     — свободный ввод чисел
 *  oneSize  — единственный «One Size»
 *
 * Замеры (пер-размер, см) — поля из конфига категории; пусто = секции нет.
 */

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  formConfigFor,
  composeJeansSize,
  parseJeansSize,
  ONE_SIZE,
} from "@/lib/constants/product-form-config";
import { sortSizeEntries } from "@/utils/sizes";

export interface SizeRow {
  size: string;
  /** Количество (только форма создания = Партия 1). */
  quantity?: number;
  /** Замеры в см: поле → значение. */
  measurements: Record<string, number>;
}

interface Props {
  category: string | null | undefined;
  value: SizeRow[];
  onChange: (next: SizeRow[]) => void;
  /** Показывать ли поле количества (создание — да; редактирование — нет,
   *  там количество ведут «Партии»). */
  showQuantity?: boolean;
}

const emptyRow = (size: string): SizeRow => ({ size, measurements: {} });

export function ProductSizesEditor({ category, value, onChange, showQuantity }: Props) {
  const cfg = formConfigFor(category);

  if (!cfg) {
    return (
      <p className="text-sm text-white/40 py-2">
        Сначала выберите категорию — набор размеров и замеры подстроятся под неё.
      </p>
    );
  }

  const rows = sortSizeEntries(value);
  const setRows = (next: SizeRow[]) => onChange(next);

  const updateRow = (size: string, patch: Partial<SizeRow>) =>
    setRows(value.map((r) => (r.size === size ? { ...r, ...patch } : r)));

  const setMeasurement = (size: string, field: string, raw: string) => {
    const row = value.find((r) => r.size === size);
    if (!row) return;
    const m = { ...row.measurements };
    const num = parseFloat(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(num)) delete m[field];
    else m[field] = num;
    updateRow(size, { measurements: m });
  };

  // ===== Пикер по режиму =====
  const renderPicker = () => {
    if (cfg.sizeMode === "oneSize") {
      return (
        <p className="text-xs text-white/40">
          У этой категории один размер — «{ONE_SIZE}». Укажите количество ниже.
        </p>
      );
    }

    if (cfg.sizeMode === "shoe") {
      return (
        <ShoeAdder
          onAdd={(num) => {
            if (value.some((r) => r.size === num)) return;
            setRows([...value, emptyRow(num)]);
          }}
        />
      );
    }

    // letters / jeans — тоггл-чипы букв
    const selectedLetters = new Set(
      value.map((r) => (cfg.sizeMode === "jeans" ? parseJeansSize(r.size).letter : r.size))
    );
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {cfg.letterSizes.map((L) => {
            const on = selectedLetters.has(L);
            return (
              <button
                key={L}
                type="button"
                onClick={() => {
                  if (on) {
                    setRows(
                      value.filter((r) =>
                        cfg.sizeMode === "jeans"
                          ? parseJeansSize(r.size).letter !== L
                          : r.size !== L
                      )
                    );
                  } else {
                    setRows([...value, emptyRow(L)]);
                  }
                }}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors",
                  on
                    ? "bg-white/[0.18] text-white border-glass-strong"
                    : "bg-white/[0.06] text-white/60 border-glass hover:text-white hover:bg-white/[0.10]"
                )}
              >
                {L}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows(cfg.defaultLetters.map((L) => emptyRow(L)))}
        >
          Стандартные ({cfg.defaultLetters.join("/")})
        </Button>
      </div>
    );
  };

  // ===== Строки выбранных размеров: цифра(jeans) + кол-во + замеры =====
  return (
    <div className="space-y-4">
      <div>{renderPicker()}</div>

      {(cfg.sizeMode === "oneSize" ? oneSizeRows(value) : rows).map((row) => {
        const jeans = cfg.sizeMode === "jeans" ? parseJeansSize(row.size) : null;
        return (
          <div
            key={row.size}
            className="p-3 rounded-xl bg-white/[0.04] border border-glass space-y-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-sm font-medium text-white min-w-[3rem]">
                {cfg.sizeMode === "oneSize" ? ONE_SIZE : row.size}
              </span>

              {jeans && (
                <div className="w-28">
                  <Input
                    label="Цифра (опц.)"
                    type="number"
                    value={jeans.num}
                    placeholder="напр. 31"
                    onChange={(e) => {
                      const newSize = composeJeansSize(jeans.letter, e.target.value);
                      if (newSize !== row.size && value.some((r) => r.size === newSize)) return;
                      updateRow(row.size, { size: newSize });
                    }}
                  />
                </div>
              )}

              {showQuantity && (
                <div className="w-28">
                  <Input
                    label="Количество"
                    type="number"
                    min="0"
                    value={row.quantity ?? 0}
                    onChange={(e) =>
                      updateRow(row.size, {
                        quantity: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                  />
                </div>
              )}
            </div>

            {cfg.measurementFields.length > 0 && (
              <div>
                <p className="text-xs text-white/50 mb-1.5">Замеры, см (необязательно)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cfg.measurementFields.map((f) => (
                    <div key={f}>
                      <label className="block text-2xs text-white/40 mb-0.5">{f}</label>
                      <Input
                        type="number"
                        min="0"
                        value={row.measurements[f] ?? ""}
                        placeholder="—"
                        onChange={(e) => setMeasurement(row.size, f, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Для oneSize гарантируем ровно одну строку «One Size». */
function oneSizeRows(value: SizeRow[]): SizeRow[] {
  const existing = value.find((r) => r.size === ONE_SIZE);
  return [existing ?? emptyRow(ONE_SIZE)];
}

function ShoeAdder({ onAdd }: { onAdd: (num: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const n = v.trim().replace(",", ".");
    if (n === "" || !Number.isFinite(parseFloat(n))) return;
    onAdd(n);
    setV("");
  };
  return (
    <div className="flex items-end gap-2">
      <div className="w-32">
        <Input
          label="Размер (число)"
          type="number"
          value={v}
          placeholder="напр. 41"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={commit}>
        Добавить
      </Button>
    </div>
  );
}
