"use client";

import { useState } from "react";
import { Button, Input, Modal, DatePicker } from "@/components/ui";
import {
  useCreateExpense,
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
} from "@/hooks/use-owner-finance";
import { cn } from "@/utils/cn";
import { displayToIso, isoToDisplay } from "@/utils/date-format";
import type { ExpenseCategory } from "@/hooks/use-owner-finance";

interface AddExpenseModalProps {
  onClose: () => void;
  categories: ExpenseCategory[];
}

export function AddExpenseModal({ onClose, categories }: AddExpenseModalProps) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0]?.name || "");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(
    isoToDisplay(new Date().toISOString().slice(0, 10))
  );
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editMode, setEditMode] = useState(false);

  const createExpense = useCreateExpense();
  const createCategory = useCreateExpenseCategory();
  const deleteCategory = useDeleteExpenseCategory();

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await createCategory.mutateAsync({ name });
      setCategory(name);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch {
      // error shown below
    }
  };

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0 || !category) return;
    try {
      await createExpense.mutateAsync({
        amount: Number(amount),
        category,
        description: description || undefined,
        expenseDate: displayToIso(expenseDate),
      });
      onClose();
    } catch {
      // error shown via mutation state
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Добавить расход">
      <div className="space-y-4">
        <div>
          <label className="text-sm text-white/60 mb-1 block">Сумма</label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-white/60">Категория</label>
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-xs text-white/40 hover:text-white transition-colors"
            >
              {editMode ? "Готово" : "Изм."}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <div key={cat.id} className="relative">
                <button
                  onClick={() => {
                    if (!editMode) {
                      setCategory(cat.name);
                      setShowNewCategory(false);
                    }
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-sm transition-all duration-200",
                    category === cat.name && !showNewCategory && !editMode
                      ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                      : "text-white/60 bg-white/[0.04] border border-glass hover:bg-white/[0.06]",
                    editMode && "pr-7"
                  )}
                >
                  {cat.name}
                </button>
                {editMode && (
                  <button
                    onClick={() => {
                      deleteCategory.mutate(cat.id);
                      if (category === cat.name) setCategory(categories[0]?.name || "");
                    }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent-red flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setShowNewCategory(true)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-sm transition-all duration-200",
                showNewCategory
                  ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/30 shadow-glass-inset"
                  : "text-white/40 bg-white/[0.04] border border-dashed border-glass hover:text-white/60 hover:bg-white/[0.06]"
              )}
            >
              + Новая
            </button>
          </div>

          {showNewCategory && (
            <div className="flex gap-2 mt-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Название категории"
                className="flex-1"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddCategory}
                isLoading={createCategory.isPending}
              >
                Добавить
              </Button>
            </div>
          )}

          {createCategory.error && (
            <p className="text-xs text-accent-red mt-1">{createCategory.error.message}</p>
          )}
          {deleteCategory.error && (
            <p className="text-xs text-accent-red mt-1">{deleteCategory.error.message}</p>
          )}
        </div>

        <DatePicker label="Дата" value={expenseDate} onChange={setExpenseDate} />

        <div>
          <label className="text-sm text-white/60 mb-1 block">Описание</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опционально"
          />
        </div>

        {createExpense.error && (
          <p className="text-sm text-accent-red">{createExpense.error.message}</p>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            isLoading={createExpense.isPending}
          >
            Добавить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
