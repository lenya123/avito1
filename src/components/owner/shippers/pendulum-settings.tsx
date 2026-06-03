"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Input, Toggle } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useUpdatePendulumSettings } from "@/hooks/use-shipper-payouts";

// Канон §9.5/9.6 — 2 режима оплаты отправщиков:
//  • pendulum — ставка плавает от ELO-рейтинга (rate_min..rate_max);
//  • fixed    — одна ставка за каждый отгруженный (sent) заказ.
interface PendulumSettingsCardProps {
  settings: {
    paymentMode: "pendulum" | "fixed";
    fixedRate: number;
    rateMin: number;
    rateMax: number;
  };
}

export function PendulumSettingsCard({ settings }: PendulumSettingsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(settings);
  const updateSettings = useUpdatePendulumSettings();

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const isPendulum = form.paymentMode === "pendulum";

  async function handleToggleMode() {
    const newMode = isPendulum ? "fixed" : "pendulum";
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
        isPendulum
          ? { rateMin: form.rateMin, rateMax: form.rateMax }
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
          checked={isPendulum}
          onChange={handleToggleMode}
          label={isPendulum ? "Маятник (по рейтингу)" : "Фиксированная оплата"}
          description={
            isPendulum
              ? "Ставка за заказ плавает от ELO-рейтинга отправщика"
              : "Одна ставка за каждый отгруженный заказ"
          }
          size="sm"
          disabled={updateSettings.isPending}
        />
      </div>

      <AnimatePresence mode="wait">
        {isPendulum ? (
          <motion.div
            key="pendulum"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!isEditing ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white/60">Диапазон ставки</h3>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                    Изменить
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Ставка мин (рейтинг 0)</p>
                    <p className="text-sm font-medium text-white">{settings.rateMin} ₽</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-glass-subtle p-3">
                    <p className="text-2xs text-white/40 mb-0.5">Ставка макс (рейтинг 100)</p>
                    <p className="text-sm font-medium text-white">{settings.rateMax} ₽</p>
                  </div>
                </div>
                <p className="text-2xs text-white/30 mt-3">
                  Ставка за заказ = мин + рейтинг/100 × (макс − мин). Рейтинг (0–100) обновляется
                  ежедневно от доли отгруженных доступных заказов — чем стабильнее работает
                  отправщик, тем больше зарабатывает за каждый заказ.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-medium text-white/60 mb-3">Диапазон ставки</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Ставка мин (₽)"
                      type="number"
                      value={String(form.rateMin)}
                      onChange={(e) => setForm({ ...form, rateMin: Number(e.target.value) })}
                    />
                    <Input
                      label="Ставка макс (₽)"
                      type="number"
                      value={String(form.rateMax)}
                      onChange={(e) => setForm({ ...form, rateMax: Number(e.target.value) })}
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-glass-subtle">
                    <p className="text-2xs text-white/40 leading-relaxed">
                      <span className="text-white/60 font-medium">Как работает:</span> ELO-рейтинг
                      отправщика определяет ставку от {form.rateMin} до {form.rateMax} ₽. Рейтинг
                      падает быстрее, чем растёт — чтобы держать максимум, нужно стабильно
                      отправлять заказы.
                    </p>
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
                <p className="text-2xs text-white/30">
                  Отправщик получает эту сумму за каждый отгруженный (sent) заказ. Рейтинг в этом
                  режиме на оплату не влияет.
                </p>

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
