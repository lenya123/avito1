"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Input, Toggle } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useUpdatePendulumSettings } from "@/hooks/use-shipper-payouts";

interface PendulumSettingsCardProps {
  settings: {
    paymentMode: "fixed" | "dynamic";
    fixedRate: number;
    rateMin: number;
    rateBase: number;
    rateMax: number;
    speedTargetHours: number;
    avgWindowDays: number;
    minWorkDays: number;
  };
}

export function PendulumSettingsCard({ settings }: PendulumSettingsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(settings);
  const updateSettings = useUpdatePendulumSettings();

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const isDynamic = form.paymentMode === "dynamic";

  async function handleToggleMode() {
    const newMode = isDynamic ? "fixed" : "dynamic";
    setForm({ ...form, paymentMode: newMode });

    try {
      await updateSettings.mutateAsync({ paymentMode: newMode });
    } catch {
      setForm({ ...form });
    }
  }

  async function handleSave() {
    try {
      await updateSettings.mutateAsync(
        isDynamic
          ? {
              rateMin: form.rateMin,
              rateBase: form.rateBase,
              rateMax: form.rateMax,
              speedTargetHours: form.speedTargetHours,
              avgWindowDays: form.avgWindowDays,
            }
          : { fixedRate: form.fixedRate }
      );
      setIsEditing(false);
    } catch {
      // error handled by mutation
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-2xl p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border",
        isEditing ? "border-accent-blue/20" : "border-glass",
        "shadow-card"
      )}
    >
      {/* Mode toggle */}
      <div className="flex items-center justify-between mb-4">
        <Toggle
          checked={isDynamic}
          onChange={handleToggleMode}
          label={isDynamic ? "Динамическая оплата" : "Фиксированная оплата"}
          description={
            isDynamic
              ? "Маятник — ставка зависит от скорости и объёма"
              : "Одна ставка за каждый заказ"
          }
          size="sm"
          disabled={updateSettings.isPending}
        />
      </div>

      <AnimatePresence mode="wait">
        {isDynamic ? (
          <motion.div
            key="dynamic"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!isEditing ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white/60">Настройки маятника</h3>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                    Изменить
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Ставка мин</p>
                    <p className="text-sm font-medium text-white">{settings.rateMin} ₽</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Ставка база</p>
                    <p className="text-sm font-medium text-white">{settings.rateBase} ₽</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Ставка макс</p>
                    <p className="text-sm font-medium text-white">{settings.rateMax} ₽</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Скорость цель</p>
                    <p className="text-sm font-medium text-white">{settings.speedTargetHours}ч</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Окно среднего</p>
                    <p className="text-sm font-medium text-white">{settings.avgWindowDays} дней</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Мин. рабочих дней</p>
                    <p className="text-sm font-medium text-white">{settings.minWorkDays}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-medium text-white/60 mb-3">Настройки маятника</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      label="Ставка мин"
                      type="number"
                      value={String(form.rateMin)}
                      onChange={(e) => setForm({ ...form, rateMin: Number(e.target.value) })}
                    />
                    <Input
                      label="Ставка база"
                      type="number"
                      value={String(form.rateBase)}
                      onChange={(e) => setForm({ ...form, rateBase: Number(e.target.value) })}
                    />
                    <Input
                      label="Ставка макс"
                      type="number"
                      value={String(form.rateMax)}
                      onChange={(e) => setForm({ ...form, rateMax: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      label="Скорость (ч)"
                      type="number"
                      value={String(form.speedTargetHours)}
                      onChange={(e) =>
                        setForm({ ...form, speedTargetHours: Math.max(24, Number(e.target.value)) })
                      }
                    />
                    <Input
                      label="Окно (дни)"
                      type="number"
                      value={String(form.avgWindowDays)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          avgWindowDays: Math.min(30, Math.max(1, Number(e.target.value))),
                        })
                      }
                    />
                    <Input
                      label="Мин. раб. дней"
                      type="number"
                      value={String(form.minWorkDays)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          minWorkDays: Math.min(7, Math.max(1, Number(e.target.value))),
                        })
                      }
                    />
                  </div>

                  {updateSettings.isError && (
                    <p className="text-xs text-accent-red">{updateSettings.error.message}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm(settings);
                        setIsEditing(false);
                      }}
                      className="flex-1"
                    >
                      Отмена
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      isLoading={updateSettings.isPending}
                      className="flex-1"
                    >
                      Сохранить
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="fixed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!isEditing ? (
              <div className="flex items-center justify-between">
                <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3 flex-1">
                  <p className="text-2xs text-white/40 mb-0.5">Ставка за заказ</p>
                  <p className="text-sm font-medium text-white">{settings.fixedRate} ₽</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="ml-3"
                >
                  Изменить
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  label="Ставка за заказ (₽)"
                  type="number"
                  value={String(form.fixedRate)}
                  onChange={(e) => setForm({ ...form, fixedRate: Number(e.target.value) })}
                />

                {updateSettings.isError && (
                  <p className="text-xs text-accent-red">{updateSettings.error.message}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm(settings);
                      setIsEditing(false);
                    }}
                    className="flex-1"
                  >
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    isLoading={updateSettings.isPending}
                    className="flex-1"
                  >
                    Сохранить
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
