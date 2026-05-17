"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Input, Button } from "@/components/ui";
import { useAiSalesSettings, useUpdateAiSalesSettings } from "@/hooks/use-ai-sales";
import type { AiSalesSettings } from "@/hooks/use-ai-sales";
import Link from "next/link";

const MODE_OPTIONS = [
  {
    value: "draft",
    label: "Черновики",
    desc: "AI генерирует черновики, вы одобряете каждый",
  },
  {
    value: "auto_simple",
    label: "Полуавтомат",
    desc: "Авто-отправка при высокой уверенности, остальное — черновики",
  },
  {
    value: "auto_full",
    label: "Полный автомат",
    desc: "Все ответы отправляются автоматически",
  },
] as const;

export default function AiSalesSettingsPage() {
  const { data, isLoading } = useAiSalesSettings();
  const updateMutation = useUpdateAiSalesSettings();
  const [local, setLocal] = useState<Partial<AiSalesSettings>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      setLocal(data.settings);
    }
  }, [data]);

  const handleSave = () => {
    updateMutation.mutate(local, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  const update = (key: keyof AiSalesSettings, value: unknown) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-purple/40 border-t-accent-purple rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-14 pb-4 flex items-center gap-3"
      >
        <Link
          href="/owner/ai-sales"
          className="p-2 rounded-xl bg-white/[0.06] border border-glass-subtle text-white/40"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">Настройки</h1>
          <p className="text-xs text-white/40">AI Продажник</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-4">
        {/* Toggle */}
        <SettingsSection title="Основное" delay={0.05}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Включён</p>
              <p className="text-xs text-white/40">AI отвечает на входящие сообщения</p>
            </div>
            <button
              onClick={() => update("isEnabled", !local.isEnabled)}
              className={cn(
                "w-12 h-7 rounded-full transition-colors relative",
                local.isEnabled ? "bg-accent-purple" : "bg-white/[0.12]"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full bg-white shadow-card transition-transform absolute top-1",
                  local.isEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </SettingsSection>

        {/* Mode */}
        <SettingsSection title="Режим работы" delay={0.1}>
          <div className="space-y-2">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update("mode", opt.value)}
                className={cn(
                  "w-full p-3 rounded-xl text-left transition-colors",
                  local.mode === opt.value
                    ? "bg-accent-purple/15 border border-accent-purple/30"
                    : "bg-white/[0.04] border border-glass-subtle"
                )}
              >
                <p
                  className={cn(
                    "text-sm font-medium",
                    local.mode === opt.value ? "text-accent-purple/80" : "text-white/60"
                  )}
                >
                  {opt.label}
                </p>
                <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* Confidence threshold */}
        {local.mode !== "draft" && (
          <SettingsSection title="Порог уверенности" delay={0.15}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-white/40">Авто-отправка при confidence &ge;</p>
              <span className="text-sm font-bold text-accent-purple">
                {Math.round((local.confidenceThreshold ?? 0.85) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={Math.round((local.confidenceThreshold ?? 0.85) * 100)}
              onChange={(e) => update("confidenceThreshold", Number(e.target.value) / 100)}
              className="w-full accent-[#0A84FF]"
            />
          </SettingsSection>
        )}

        {/* Рабочие часы */}
        <SettingsSection title="Рабочие часы (МСК)" delay={0.2}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                label="С"
                type="number"
                min={0}
                max={23}
                value={local.workHoursStart ?? 8}
                onChange={(e) => update("workHoursStart", Number(e.target.value))}
                className="text-center"
              />
            </div>
            <span className="text-white/20 mt-5">—</span>
            <div className="flex-1">
              <Input
                label="До"
                type="number"
                min={0}
                max={23}
                value={local.workHoursEnd ?? 23}
                onChange={(e) => update("workHoursEnd", Number(e.target.value))}
                className="text-center"
              />
            </div>
          </div>
        </SettingsSection>

        {/* Задержка */}
        <SettingsSection title="Задержка ответа (сек)" delay={0.25}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                label="Мин"
                type="number"
                min={0}
                max={600}
                value={local.minResponseDelay ?? 30}
                onChange={(e) => update("minResponseDelay", Number(e.target.value))}
                className="text-center"
              />
            </div>
            <span className="text-white/20 mt-5">—</span>
            <div className="flex-1">
              <Input
                label="Макс"
                type="number"
                min={0}
                max={600}
                value={local.maxResponseDelay ?? 120}
                onChange={(e) => update("maxResponseDelay", Number(e.target.value))}
                className="text-center"
              />
            </div>
          </div>
          <p className="text-xs text-white/20 mt-2">Имитация &laquo;живого&raquo; ответа</p>
        </SettingsSection>

        {/* Сохранить */}
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={updateMutation.isPending}
          className="w-full"
        >
          {saved ? "Сохранено!" : "Сохранить настройки"}
        </Button>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        "p-4 rounded-2xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass",
        "shadow-card"
      )}
    >
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}
