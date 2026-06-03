"use client";

/**
 * Редактор партий закупок (журнал, §11.5) + «Поправить остаток».
 * Всё редактирование количества товара живёт здесь, внутри модалки
 * «Редактировать товар» (решение пользователя).
 *
 *  • Партии — журнал закупок. Добавление/правка/удаление атомарны (RPC).
 *    «Всего закуплено» и средневзвешенная закупочная пересчитываются из
 *    партий. Остаток (единый пул) двигается на дельту, не уходя в минус.
 *  • «Поправить остаток» — другая ось: физфакт vs система. Потеря/излишек
 *    пишутся в журнал сверок; поправка опечатки — тихо.
 */

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  useProductBatchAction,
  useProductStockAction,
  type ProductBatch,
} from "@/hooks/use-owner-products";

interface SizeRef {
  id: string;
  size: string;
  currentQuantity: number;
}

export interface ProductBatchesEditorProps {
  productId: string;
  sizes: SizeRef[];
  batches: ProductBatch[];
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });

const sumBatch = (b: ProductBatch) => b.sizes.reduce((s, x) => s + (x.quantity || 0), 0);

export function ProductBatchesEditor({ productId, sizes, batches }: ProductBatchesEditorProps) {
  const batchAction = useProductBatchAction();
  const stockAction = useProductStockAction();

  // null | "add" | "edit:<batchId>"
  const [form, setForm] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // «Поправить остаток»
  const [fixSizeId, setFixSizeId] = useState<string | null>(null);
  const [fixQty, setFixQty] = useState("");
  const [fixStep, setFixStep] = useState<"input" | "choice">("input");

  const openAdd = () => {
    setForm("add");
    setPrice("");
    setQtys(Object.fromEntries(sizes.map((s) => [s.id, "0"])));
  };
  const openEdit = (b: ProductBatch) => {
    setForm(`edit:${b.id}`);
    setPrice(String(b.purchasePrice));
    setQtys(
      Object.fromEntries(
        sizes.map((s) => [s.id, String(b.sizes.find((x) => x.size_id === s.id)?.quantity ?? 0)])
      )
    );
  };
  const closeForm = () => setForm(null);

  const buildSizesPayload = () =>
    sizes.map((s) => ({
      size_id: s.id,
      size: s.size,
      quantity: Math.max(0, parseInt(qtys[s.id] ?? "0", 10) || 0),
    }));

  const submitForm = async () => {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p < 0) return;
    const payloadSizes = buildSizesPayload();
    try {
      if (form === "add") {
        if (payloadSizes.every((s) => s.quantity === 0)) return;
        await batchAction.mutateAsync({
          productId,
          action: "add",
          price: p,
          sizes: payloadSizes,
        });
      } else if (form?.startsWith("edit:")) {
        await batchAction.mutateAsync({
          productId,
          action: "edit",
          batchId: form.slice(5),
          price: p,
          sizes: payloadSizes,
        });
      }
      closeForm();
    } catch {
      /* ошибка показывается из mutation state */
    }
  };

  const doDelete = async (batchId: string) => {
    try {
      await batchAction.mutateAsync({ productId, action: "delete", batchId });
      setConfirmDelete(null);
    } catch {
      /* error in state */
    }
  };

  const fixSize = sizes.find((s) => s.id === fixSizeId) || null;
  const fixM = parseInt(fixQty, 10);
  const fixValid = Number.isFinite(fixM) && fixM >= 0;
  const fixDiff = fixSize && fixValid ? fixSize.currentQuantity - fixM : 0;

  const submitFix = async (kind: "reconcile" | "correct") => {
    if (!fixSize || !fixValid) return;
    try {
      await stockAction.mutateAsync({
        productId,
        sizeId: fixSize.id,
        action: kind,
        qty: fixM,
      });
      setFixSizeId(null);
      setFixQty("");
      setFixStep("input");
    } catch {
      /* error in state */
    }
  };

  return (
    <div className="space-y-6">
      {/* ===== Партии закупок ===== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-white/80">Партии закупок</p>
          {form !== "add" && (
            <Button type="button" variant="ghost" size="sm" onClick={openAdd}>
              + Новая партия
            </Button>
          )}
        </div>
        <p className="text-xs text-white/40 mb-3">
          Журнал закупок. «Всего закуплено» и средняя закупочная цена считаются из партий. Новая
          партия увеличивает остаток на складе.
        </p>

        {form === "add" && (
          <BatchForm
            title="Новая партия"
            sizes={sizes}
            price={price}
            setPrice={setPrice}
            qtys={qtys}
            setQtys={setQtys}
            onCancel={closeForm}
            onSubmit={submitForm}
            isPending={batchAction.isPending}
            error={batchAction.isError ? errMsg(batchAction.error) : null}
          />
        )}

        <div className="space-y-2">
          {batches.length === 0 && <p className="text-sm text-white/40 py-2">Партий пока нет.</p>}
          {batches.map((b) =>
            form === `edit:${b.id}` ? (
              <BatchForm
                key={b.id}
                title={`Правка партии ${b.batchNumber}`}
                sizes={sizes}
                price={price}
                setPrice={setPrice}
                qtys={qtys}
                setQtys={setQtys}
                onCancel={closeForm}
                onSubmit={submitForm}
                isPending={batchAction.isPending}
                error={batchAction.isError ? errMsg(batchAction.error) : null}
              />
            ) : (
              <div key={b.id} className="p-3 rounded-xl bg-white/[0.04] border border-glass">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm text-white">
                    <span className="font-medium">Партия {b.batchNumber}</span>
                    <span className="text-white/40">
                      {" "}
                      · {fmtDate(b.createdAt)} · {b.purchasePrice.toLocaleString("ru-RU")} ₽ · Σ{" "}
                      {sumBatch(b)} шт
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="text-xs text-white/60 hover:text-white transition-colors"
                    >
                      Править
                    </button>
                    {batches.length > 1 &&
                      (confirmDelete === b.id ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => doDelete(b.id)}
                            className="text-accent-red hover:underline"
                          >
                            Удалить?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="text-white/40 hover:text-white/70"
                          >
                            нет
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(b.id)}
                          className="text-xs text-white/60 hover:text-accent-red transition-colors"
                        >
                          Удалить
                        </button>
                      ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {b.sizes
                    .filter((x) => x.quantity > 0)
                    .map((x) => (
                      <span
                        key={x.size_id}
                        className="px-2 py-0.5 rounded-lg text-xs bg-white/[0.06] text-white/70 border border-glass"
                      >
                        {x.size}: {x.quantity}
                      </span>
                    ))}
                </div>
              </div>
            )
          )}
        </div>
        {batchAction.isError && form === null && (
          <p className="text-sm text-accent-red mt-2">{errMsg(batchAction.error)}</p>
        )}
      </div>

      {/* ===== Поправить остаток ===== */}
      <div className="border-t border-glass pt-4">
        <p className="text-sm font-medium text-white/80 mb-1">Поправить остаток</p>
        <p className="text-xs text-white/40 mb-3">
          Если по факту на складе другое число (пересчёт). Потеря/излишек попадут в журнал сверок и
          аналитику; поправка опечатки — тихо.
        </p>

        {!fixSizeId && (
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setFixSizeId(s.id);
                  setFixQty("");
                  setFixStep("input");
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.06] text-white/70 border border-glass hover:bg-white/[0.12] hover:text-white transition-colors"
              >
                {s.size}: {s.currentQuantity}
              </button>
            ))}
          </div>
        )}

        {fixSize && (
          <div className="p-3 rounded-xl bg-white/[0.04] border border-glass space-y-3">
            <p className="text-sm text-white/80">
              Размер <span className="text-white font-medium">{fixSize.size}</span> · система
              считает <span className="text-white font-medium">{fixSize.currentQuantity} шт.</span>
            </p>

            {fixStep === "input" && (
              <>
                <Input
                  label="Сколько по факту сейчас на складе"
                  type="number"
                  min="0"
                  value={fixQty}
                  onChange={(e) => setFixQty(e.target.value)}
                  placeholder="фактический пересчёт"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFixSizeId(null)}
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    disabled={!fixValid || fixDiff === 0}
                    onClick={() => setFixStep("choice")}
                    className="flex-1"
                  >
                    {fixValid && fixDiff === 0 ? "Совпадает" : "Дальше"}
                  </Button>
                </div>
              </>
            )}

            {fixStep === "choice" && (
              <>
                <p className="text-sm text-white/80">
                  {fixDiff > 0 ? (
                    <>
                      Не хватает <span className="text-accent-red font-medium">{fixDiff} шт.</span>{" "}
                      (станет {fixM}). Почему?
                    </>
                  ) : (
                    <>
                      Лишние <span className="text-accent-green font-medium">{-fixDiff} шт.</span>{" "}
                      (станет {fixM}). Почему?
                    </>
                  )}
                </p>
                {stockAction.isError && (
                  <p className="text-sm text-accent-red">{errMsg(stockAction.error)}</p>
                )}
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant={fixDiff > 0 ? "danger" : "primary"}
                    isLoading={stockAction.isPending}
                    onClick={() => submitFix("reconcile")}
                    className="w-full"
                  >
                    {fixDiff > 0
                      ? "Потеря — украли / испортилось / пропало"
                      : "Излишек — нашлось больше"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    isLoading={stockAction.isPending}
                    onClick={() => submitFix("correct")}
                    className="w-full"
                  >
                    Поправка ошибки — просто неверная цифра
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setFixStep("input")}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  ← изменить число
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Ошибка";
}

interface BatchFormProps {
  title: string;
  sizes: SizeRef[];
  price: string;
  setPrice: (v: string) => void;
  qtys: Record<string, string>;
  setQtys: (v: Record<string, string>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
}

function BatchForm({
  title,
  sizes,
  price,
  setPrice,
  qtys,
  setQtys,
  onCancel,
  onSubmit,
  isPending,
  error,
}: BatchFormProps) {
  return (
    <div className="p-3 mb-2 rounded-xl bg-white/[0.06] border border-glass-strong space-y-3">
      <p className="text-sm font-medium text-white">{title}</p>
      <Input
        label="Закупочная цена этой партии, ₽"
        type="number"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="например, 1000"
      />
      <div>
        <p className="text-xs text-white/60 mb-1.5">Сколько в этой партии по размерам</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {sizes.map((s) => (
            <div key={s.id}>
              <label className="block text-xs text-white/50 mb-0.5">{s.size}</label>
              <Input
                type="number"
                min="0"
                value={qtys[s.id] ?? "0"}
                onChange={(e) => setQtys({ ...qtys, [s.id]: e.target.value })}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Отмена
        </Button>
        <Button
          type="button"
          isLoading={isPending}
          disabled={!(parseFloat(price) >= 0)}
          onClick={onSubmit}
          className="flex-1"
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}
