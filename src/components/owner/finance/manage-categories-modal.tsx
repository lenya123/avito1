"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui";
import {
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
} from "@/hooks/use-owner-finance";
import { cn } from "@/utils/cn";
import type { ExpenseCategory } from "@/hooks/use-owner-finance";

const COLOR_OPTIONS = [
  { token: "accent-orange", hex: "#FF9F0A" },
  { token: "accent-blue", hex: "#0A84FF" },
  { token: "accent-green", hex: "#30D158" },
  { token: "accent-red", hex: "#FF453A" },
  { token: "accent-purple", hex: "#BF5AF2" },
  { token: "accent-pink", hex: "#FF375F" },
  { token: "accent-teal", hex: "#64D2FF" },
  { token: "accent-indigo", hex: "#5E5CE6" },
];

interface ManageCategoriesModalProps {
  onClose: () => void;
  categories: ExpenseCategory[];
}

export function ManageCategoriesModal({ onClose, categories }: ManageCategoriesModalProps) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("accent-orange");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const createCategory = useCreateExpenseCategory();
  const updateCategory = useUpdateExpenseCategory();
  const deleteCategory = useDeleteExpenseCategory();

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCategory.mutateAsync({ name: newName.trim(), color: newColor });
      setNewName("");
    } catch {
      // error shown via mutation
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id, name: editName.trim(), color: editColor });
      setEditingId(null);
    } catch {
      // error shown via mutation
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory.mutateAsync(id);
    } catch {
      // error shown via mutation
    }
  };

  const startEdit = (cat: ExpenseCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };

  return (
    <Modal isOpen onClose={onClose} title="Категории расходов">
      <div className="space-y-4">
        {/* Existing categories */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {categories.map((cat) => {
            const hex = COLOR_OPTIONS.find((c) => c.token === cat.color)?.hex || "#FF9F0A";
            const isEditing = editingId === cat.id;

            return (
              <div key={cat.id} className="p-3 rounded-xl bg-white/[0.04] border border-glass">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Название"
                    />
                    <div className="flex gap-1.5">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.token}
                          onClick={() => setEditColor(c.token)}
                          className={cn(
                            "w-6 h-6 rounded-full transition-all",
                            editColor === c.token &&
                              "ring-2 ring-white ring-offset-2 ring-offset-black"
                          )}
                          style={{ background: c.hex }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Отмена
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleUpdate(cat.id)}
                        isLoading={updateCategory.isPending}
                      >
                        Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: hex }} />
                    <span className="text-sm text-white flex-1">{cat.name}</span>
                    <button
                      onClick={() => startEdit(cat)}
                      className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                      Изм.
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-xs text-white/40 hover:text-accent-red transition-colors"
                    >
                      Удл.
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Error messages */}
        {createCategory.error && (
          <p className="text-xs text-accent-red">{createCategory.error.message}</p>
        )}
        {deleteCategory.error && (
          <p className="text-xs text-accent-red">{deleteCategory.error.message}</p>
        )}

        {/* Add new category */}
        <div className="pt-3 border-t border-glass-minimal space-y-2">
          <p className="text-sm text-white/60">Новая категория</p>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название категории"
          />
          <div className="flex gap-1.5">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.token}
                onClick={() => setNewColor(c.token)}
                className={cn(
                  "w-6 h-6 rounded-full transition-all",
                  newColor === c.token && "ring-2 ring-white ring-offset-2 ring-offset-black"
                )}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            isLoading={createCategory.isPending}
            className="w-full"
          >
            Добавить категорию
          </Button>
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full">
          Закрыть
        </Button>
      </div>
    </Modal>
  );
}
