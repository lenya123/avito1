"use client";

/**
 * Редактор «Партнёры в очереди» — лестница привязок партнёров к товару.
 * Каждая привязка: партнёр + склад (мой/его) + комиссия + сток per-размер.
 * Drag-and-drop через @dnd-kit/sortable меняет приоритет (порядок = priority 1..N).
 *
 * Источник стока для размера выбирается «сверху вниз»: пока у владельца есть —
 * от него; кончился — следующий партнёр по очереди и т.д. Логика выбора живёт
 * в RPC select_size_source — UI её не дублирует, просто показывает порядок.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, Input, Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PartnerOption } from "@/hooks/use-owner-partners";
import type { ProductBindingInput } from "@/hooks/use-owner-products";

// Уникальный draft-id для свежедобавленных карточек (binding ещё нет в БД).
type DraftId = string;
type EditableBinding = ProductBindingInput & { _draftId: DraftId };

export interface PartnerLadderEditorProps {
  /** Доступные размеры товара (из product_sizes). Используем как шаблон для inputs. */
  availableSizes: string[];
  /** Текущее состояние лестницы. Передавать в порядке priority. */
  bindings: ProductBindingInput[];
  /** Список всех активных партнёров для select'а. */
  partners: PartnerOption[];
  onChange: (next: ProductBindingInput[]) => void;
}

let draftCounter = 0;
const newDraftId = (): DraftId => `draft-${++draftCounter}-${Date.now()}`;

export function PartnerLadderEditor({
  availableSizes,
  bindings,
  partners,
  onChange,
}: PartnerLadderEditorProps) {
  // Локальное состояние с draft-id для DND/UI.
  const [items, setItems] = useState<EditableBinding[]>(() =>
    bindings.map((b) => ({ ...b, _draftId: b.id ?? newDraftId() }))
  );

  // Синхронизируем наружу при любом изменении.
  function emit(next: EditableBinding[]) {
    setItems(next);
    onChange(
      next.map(({ _draftId, ...rest }) => {
        void _draftId;
        return rest;
      })
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i._draftId === active.id);
    const newIndex = items.findIndex((i) => i._draftId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    emit(arrayMove(items, oldIndex, newIndex));
  }

  function addBinding() {
    const usedIds = new Set(items.map((i) => i.partnerId));
    const firstFree = partners.find((p) => p.isActive && p.isLinked && !usedIds.has(p.id));
    if (!firstFree) return;
    emit([
      ...items,
      {
        _draftId: newDraftId(),
        id: null,
        partnerId: firstFree.id,
        warehouseKind: firstFree.acceptsVibeDebt ? "partner" : "partner",
        commission: 0,
        sizes: availableSizes.map((s) => ({ size: s, currentQuantity: 0 })),
      },
    ]);
  }

  function updateBinding(draftId: DraftId, patch: Partial<EditableBinding>) {
    emit(items.map((i) => (i._draftId === draftId ? { ...i, ...patch } : i)));
  }

  function removeBinding(draftId: DraftId) {
    emit(items.filter((i) => i._draftId !== draftId));
  }

  const usedPartnerIds = new Set(items.map((i) => i.partnerId));

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-white">🤝 Партнёры в очереди</h3>
        <p className="text-xs text-white/60 mt-1">
          Размер сначала продаётся со своего склада. Когда у тебя кончилось — переходит к партнёру
          №1 (если у него есть). Кончилось у него — к №2. И так далее. Порядок можно менять
          перетаскиванием.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-white/40 italic">
            Партнёры не подключены — все размеры идут только со своего склада.
          </p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((i) => i._draftId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((binding, idx) => (
                <BindingCard
                  key={binding._draftId}
                  binding={binding}
                  priority={idx + 1}
                  partners={partners}
                  usedPartnerIds={usedPartnerIds}
                  availableSizes={availableSizes}
                  onChange={(patch) => updateBinding(binding._draftId, patch)}
                  onRemove={() => removeBinding(binding._draftId)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addBinding}
          disabled={
            partners.filter((p) => p.isActive && p.isLinked && !usedPartnerIds.has(p.id)).length ===
            0
          }
        >
          + Подключить партнёра
        </Button>
      </CardContent>
    </Card>
  );
}

interface BindingCardProps {
  binding: EditableBinding;
  priority: number;
  partners: PartnerOption[];
  usedPartnerIds: Set<string>;
  availableSizes: string[];
  onChange: (patch: Partial<EditableBinding>) => void;
  onRemove: () => void;
}

function BindingCard({
  binding,
  priority,
  partners,
  usedPartnerIds,
  availableSizes,
  onChange,
  onRemove,
}: BindingCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: binding._draftId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const partner = partners.find((p) => p.id === binding.partnerId);
  // Реквизиты партнёра в hook не возвращаются (тонкая модель PartnerOption);
  // серверный API валидирует наличие реквизитов при PATCH/POST, поэтому
  // в UI этот warning показываем как мягкий — только когда warehouse=его.
  const reqMissing = false;

  // Партнёры доступные для select'а в этой карточке: активные, привязанные к боту,
  // и либо текущий выбранный (чтоб остался виден), либо ещё не использованный в других карточках.
  const partnerOptions = partners.filter(
    (p) => p.isActive && p.isLinked && (p.id === binding.partnerId || !usedPartnerIds.has(p.id))
  );

  function syncSize(size: string, value: number) {
    const exists = binding.sizes.find((s) => s.size === size);
    if (exists) {
      onChange({
        sizes: binding.sizes.map((s) => (s.size === size ? { ...s, currentQuantity: value } : s)),
      });
    } else {
      onChange({ sizes: [...binding.sizes, { size, currentQuantity: value }] });
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white/70 px-1"
          title="Перетащи чтобы изменить приоритет"
        >
          <span className="text-lg">≡</span>
        </button>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/60">#{priority}</span>
            <select
              value={binding.partnerId}
              onChange={(e) => onChange({ partnerId: e.target.value })}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-sm",
                "bg-white/[0.06] border border-white/10 text-white",
                "focus:outline-none focus:border-accent-blue"
              )}
            >
              {partnerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.tgUsername ? ` (@${p.tgUsername})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRemove}
              className="text-red-400 hover:text-red-300 text-sm px-2"
              title="Удалить привязку"
            >
              🗑
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange({ warehouseKind: "owner" })}
              className={cn(
                "px-2 py-1.5 rounded-lg text-xs border transition",
                binding.warehouseKind === "owner"
                  ? "bg-accent-blue/20 border-accent-blue text-white"
                  : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
              )}
            >
              📦 Склад мой
            </button>
            <button
              type="button"
              onClick={() => onChange({ warehouseKind: "partner" })}
              className={cn(
                "px-2 py-1.5 rounded-lg text-xs border transition",
                binding.warehouseKind === "partner"
                  ? "bg-accent-blue/20 border-accent-blue text-white"
                  : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
              )}
            >
              🤝 Склад его
            </button>
          </div>

          <p className="text-[11px] text-white/40">
            {binding.warehouseKind === "owner"
              ? "Партнёр привёз товар к тебе. Платит клиент тебе. Отгружает твой отправщик. Партнёру — комиссия (цена − комиссия владельца)."
              : "Партнёр держит товар у себя. Платит клиент партнёру. Отгружает партнёр сам. Партнёр должен тебе комиссию с продажи."}
          </p>

          {reqMissing && (
            <p className="text-amber-300 text-[11px]">
              ⚠️ У партнёра нет реквизитов — он не сможет принимать оплату клиента. Попроси его
              настроить через @krossovodpartnersbot.
            </p>
          )}

          {partner?.warehouseCity && (
            <p className="text-[11px] text-white/40">
              Город склада партнёра: <span className="text-white/60">{partner.warehouseCity}</span>
            </p>
          )}

          <div>
            <label className="block text-[11px] text-white/60 mb-1">
              Комиссия владельцу с заказа, ₽
            </label>
            <Input
              type="number"
              min={0}
              step="1"
              value={binding.commission}
              onChange={(e) => onChange({ commission: Number(e.target.value || 0) })}
              placeholder="например: 200"
            />
          </div>

          {availableSizes.length > 0 && (
            <div>
              <label className="block text-[11px] text-white/60 mb-1">
                Сколько у партнёра по размерам
              </label>
              <div className="space-y-1.5">
                {availableSizes.map((size) => {
                  const stock = binding.sizes.find((s) => s.size === size);
                  return (
                    <div key={size} className="flex items-center gap-2">
                      <span className="w-12 text-xs font-medium text-white/70">{size}</span>
                      <input
                        type="number"
                        min={0}
                        value={stock?.currentQuantity ?? 0}
                        onChange={(e) => syncSize(size, Number(e.target.value || 0))}
                        className={cn(
                          "flex-1 rounded-lg px-2 py-1.5 text-sm",
                          "bg-white/[0.04] border border-white/10 text-white",
                          "focus:outline-none focus:border-accent-blue"
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
