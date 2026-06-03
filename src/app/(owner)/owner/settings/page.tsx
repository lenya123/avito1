"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerAuthStore, useOwnerUser } from "@/stores/owner-auth-store";
import {
  useOwnerSettings,
  useUpdateOwnerSettings,
  type OwnerSettings,
} from "@/hooks/use-owner-settings";
import { Button, Card, Input, Spinner, ErrorState } from "@/components/ui";
import { cn } from "@/utils/cn";
import { RUSSIAN_CITIES, findCity } from "@/lib/constants/cities";
import {
  useLocationPickupPoints,
  useLinkPickupPoint,
  useUnlinkPickupPoint,
  useCreatePickupPoint,
} from "@/hooks/use-location-pickup-points";
import { DirectorBotSection } from "@/components/owner/director-bot-section";
import { NotificationRoutingSection } from "@/components/owner/notification-routing-section";
import { DigestScheduleSection } from "@/components/owner/digest-schedule-section";
import { DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";

type SectionKey =
  | "vibe"
  | "finance"
  | "business"
  | "goals"
  | "returns"
  | "shippers"
  | "contacts"
  | "location";

const PAYOUT_CADENCE_LABELS: Record<string, string> = {
  weekly: "Еженедельно",
  biweekly: "Раз в 2 недели",
  monthly: "Ежемесячно",
};
const WEEKDAY_LABELS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const SECTION_LABELS: Record<SectionKey, { title: string; icon: string }> = {
  vibe: { title: "+ВАЙБ-кредит", icon: "⚡" },
  finance: { title: "Финансы платформы", icon: "💸" },
  business: { title: "Бизнес-правила", icon: "📋" },
  goals: { title: "Цели", icon: "🎯" },
  returns: { title: "Возвраты и утилизация", icon: "📦" },
  shippers: { title: "Оплата отправщиков", icon: "💰" },
  contacts: { title: "Контакты", icon: "📱" },
  location: { title: "Город по умолчанию", icon: "📍" },
};

export default function OwnerSettingsPage() {
  const router = useRouter();
  const user = useOwnerUser();
  const { logout } = useOwnerAuthStore();
  const { data: settings, isLoading, error, refetch } = useOwnerSettings();
  const updateMutation = useUpdateOwnerSettings();

  const [editingSection, setEditingSection] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState<Partial<OwnerSettings>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (settings && editingSection) {
      setDraft({ ...settings });
    }
  }, [editingSection, settings]);

  const handleLogout = async () => {
    await logout();
    router.replace("/owner/login");
  };

  const handleSave = async () => {
    if (!settings || !editingSection) return;

    const changes: Partial<OwnerSettings> = {};
    const sectionFields = SECTION_FIELDS[editingSection];

    for (const key of sectionFields) {
      const k = key as keyof OwnerSettings;
      if (draft[k] !== undefined && draft[k] !== settings[k]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (changes as any)[k] = draft[k];
      }
    }

    if (Object.keys(changes).length === 0) {
      setEditingSection(null);
      return;
    }

    try {
      await updateMutation.mutateAsync(changes);
      setEditingSection(null);
      setSaved(editingSection);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      // error shown via mutation state
    }
  };

  const updateDraft = (key: keyof OwnerSettings, value: number | string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const numVal = (key: keyof OwnerSettings) => {
    const v = draft[key];
    return v !== undefined ? Number(v) : 0;
  };

  const strVal = (key: keyof OwnerSettings) => {
    const v = draft[key];
    return v !== undefined ? String(v) : "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить настройки"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Настройки</h1>
        <p className="text-white/60">Конфигурация бизнеса и системы</p>
      </motion.div>

      {/* Profile */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-3"
      >
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">Профиль</h2>
        <Card>
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center",
                "bg-gradient-to-br from-purple-500/20 to-purple-500/10",
                "border border-purple-500/25",
                "shadow-[0_0_16px_rgba(191,90,242,0.2)]"
              )}
            >
              <span className="text-xl font-semibold text-white">
                {(user?.name || "O").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-white">{user?.name || "Владелец"}</p>
              <p className="text-sm text-white/40">
                {user?.email || user?.telegramUsername || "Администратор системы"}
              </p>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* +ВАЙБ settings */}
      <SettingsSection
        sectionKey="vibe"
        settings={settings}
        isEditing={editingSection === "vibe"}
        isSaved={saved === "vibe"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("vibe")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.08}
      >
        {editingSection === "vibe" ? (
          <div className="space-y-4">
            <SettingsInput
              label="Лимит по умолчанию"
              value={numVal("vibeCreditDefaultLimit")}
              onChange={(v) => updateDraft("vibeCreditDefaultLimit", v)}
              suffix="₽"
            />
            <SettingsInput
              label="Порог подтверждения чека (0 = всегда авто)"
              value={numVal("vibeReceiptConfirmThreshold")}
              onChange={(v) => updateDraft("vibeReceiptConfirmThreshold", v)}
              suffix="₽"
            />
            <p className="text-xs text-white/40">
              Лимит применяется к клиентам без индивидуального override. Чеки свыше порога будут
              требовать ручного подтверждения (0 или пусто — не требовать).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <SettingsValue
              label="Лимит по умолчанию"
              value={`${(settings.vibeCreditDefaultLimit ?? 0).toLocaleString("ru-RU")} ₽`}
            />
            <SettingsValue
              label="Порог чека"
              value={
                settings.vibeReceiptConfirmThreshold != null
                  ? `${settings.vibeReceiptConfirmThreshold.toLocaleString("ru-RU")} ₽`
                  : "не задан"
              }
            />
          </div>
        )}
      </SettingsSection>

      {/* Payment methods link */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.095 }}
        className="space-y-3"
      >
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
          💳 Ферма платёжных карт
        </h2>
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-medium text-white mb-1">Карты, СБП-реквизиты и ИП</h3>
              <p className="text-sm text-white/60">
                Настройте активные методы оплаты с месячными лимитами — customer-bot сам будет
                выбирать следующий подходящий.
              </p>
            </div>
            <Link
              href="/owner/payment-methods"
              className="px-4 py-2 rounded-xl bg-accent-blue text-white font-semibold text-sm whitespace-nowrap hover:opacity-90 transition-opacity"
            >
              Открыть →
            </Link>
          </div>
        </Card>
      </motion.section>

      <DirectorBotSection />

      <NotificationRoutingSection />

      <DigestScheduleSection />

      {/* Platform finance */}
      <SettingsSection
        sectionKey="finance"
        settings={settings}
        isEditing={editingSection === "finance"}
        isSaved={saved === "finance"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("finance")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.1}
      >
        {editingSection === "finance" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-white/60 mb-2">Периодичность выплат</p>
              <select
                value={strVal("payoutCadence") || "weekly"}
                onChange={(e) => updateDraft("payoutCadence", e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm"
              >
                <option value="weekly">Еженедельно</option>
                <option value="biweekly">Раз в 2 недели</option>
                <option value="monthly">Ежемесячно</option>
              </select>
            </div>
            <SettingsInput
              label="День выплат (1=Пн, 7=Вс)"
              value={numVal("payoutWeekday")}
              onChange={(v) => updateDraft("payoutWeekday", v)}
            />
            <SettingsInput
              label="Reserve days (дней холда)"
              value={numVal("payoutReserveDays")}
              onChange={(v) => updateDraft("payoutReserveDays", v)}
              suffix="дн."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <SettingsValue
              label="Выплаты"
              value={PAYOUT_CADENCE_LABELS[settings.payoutCadence ?? "weekly"] ?? "Еженедельно"}
            />
            <SettingsValue
              label="День"
              value={WEEKDAY_LABELS[settings.payoutWeekday ?? 1] ?? "Пн"}
            />
            <SettingsValue label="Reserve" value={`${settings.payoutReserveDays ?? 0} дн.`} />
          </div>
        )}
      </SettingsSection>

      {/* Business rules */}
      <SettingsSection
        sectionKey="business"
        settings={settings}
        isEditing={editingSection === "business"}
        isSaved={saved === "business"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("business")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.1}
      >
        {editingSection === "business" ? (
          <div className="space-y-4">
            <SettingsInput
              label="Скидка на первый заказ"
              value={numVal("firstOrderDiscount")}
              onChange={(v) => updateDraft("firstOrderDiscount", v)}
              suffix="₽"
            />
            <SettingsInput
              label="Таймаут резервации"
              value={numVal("reservationTimeoutMinutes")}
              onChange={(v) => updateDraft("reservationTimeoutMinutes", v)}
              suffix="мин"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <SettingsValue label="Скидка 1-й заказ" value={`${settings.firstOrderDiscount} ₽`} />
            <SettingsValue label="Резервация" value={`${settings.reservationTimeoutMinutes} мин`} />
          </div>
        )}
      </SettingsSection>

      {/* Goals */}
      <SettingsSection
        sectionKey="goals"
        settings={settings}
        isEditing={editingSection === "goals"}
        isSaved={saved === "goals"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("goals")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.12}
      >
        {editingSection === "goals" ? (
          <SettingsInput
            label="Месячная цель по прибыли"
            value={numVal("monthlyProfitTarget")}
            onChange={(v) => updateDraft("monthlyProfitTarget", v)}
            suffix="₽"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <SettingsValue
              label="Месячная цель по прибыли"
              value={`${(settings.monthlyProfitTarget || 500000).toLocaleString("ru-RU")} ₽`}
            />
          </div>
        )}
      </SettingsSection>

      {/* Реферальная программа вырезана в Stage 1.5 пивота (см. план
          `.claude/plans/valiant-hatching-lollipop.md`). Колонки
          settings.referral_* удалены в stage1-миграции. */}

      {/* Returns */}
      <SettingsSection
        sectionKey="returns"
        settings={settings}
        isEditing={editingSection === "returns"}
        isSaved={saved === "returns"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("returns")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.2}
      >
        {editingSection === "returns" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SettingsInput
              label="Дней до корзины"
              value={numVal("returnToTrashDays")}
              onChange={(v) => updateDraft("returnToTrashDays", v)}
              suffix="дней"
            />
            <SettingsInput
              label="Дней до утилизации"
              value={numVal("trashToDisposedDays")}
              onChange={(v) => updateDraft("trashToDisposedDays", v)}
              suffix="дней"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <SettingsValue label="До корзины" value={`${settings.returnToTrashDays} дней`} />
            <SettingsValue label="До утилизации" value={`${settings.trashToDisposedDays} дней`} />
          </div>
        )}
      </SettingsSection>

      {/* Shippers */}
      <SettingsSection
        sectionKey="shippers"
        settings={settings}
        isEditing={editingSection === "shippers"}
        isSaved={saved === "shippers"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("shippers")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.25}
      >
        {editingSection === "shippers" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-white/60 mb-2">Режим оплаты</p>
              <div className="flex gap-2">
                {(["pendulum", "fixed"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateDraft("shipperPaymentMode", mode)}
                    className={cn(
                      "px-3 py-2 rounded-xl text-sm transition-all duration-200",
                      strVal("shipperPaymentMode") === mode
                        ? "bg-white/[0.12] text-white border border-glass-active shadow-glass-inset"
                        : "text-white/60 bg-white/[0.04] border border-glass hover:bg-white/[0.06]"
                    )}
                  >
                    {mode === "pendulum" ? "Маятник (по рейтингу)" : "Фиксированная"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SettingsInput
                label="Ставка за заказ"
                value={numVal("shipperRate")}
                onChange={(v) => updateDraft("shipperRate", v)}
                suffix="₽"
              />
              <SettingsInput
                label="Фиксированная ставка"
                value={numVal("shipperFixedRate")}
                onChange={(v) => updateDraft("shipperFixedRate", v)}
                suffix="₽"
              />
            </div>
            {strVal("shipperPaymentMode") === "pendulum" && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <SettingsInput
                  label="Мин. ставка"
                  value={numVal("rateMin")}
                  onChange={(v) => updateDraft("rateMin", v)}
                  suffix="₽"
                />
                <SettingsInput
                  label="Базовая ставка"
                  value={numVal("rateBase")}
                  onChange={(v) => updateDraft("rateBase", v)}
                  suffix="₽"
                />
                <SettingsInput
                  label="Макс. ставка"
                  value={numVal("rateMax")}
                  onChange={(v) => updateDraft("rateMax", v)}
                  suffix="₽"
                />
                <SettingsInput
                  label="Целевая скорость"
                  value={numVal("speedTargetHours")}
                  onChange={(v) => updateDraft("speedTargetHours", v)}
                  suffix="ч"
                />
                <SettingsInput
                  label="Окно среднего"
                  value={numVal("avgWindowDays")}
                  onChange={(v) => updateDraft("avgWindowDays", v)}
                  suffix="дн"
                />
                <SettingsInput
                  label="Мин. раб. дней"
                  value={numVal("minWorkDays")}
                  onChange={(v) => updateDraft("minWorkDays", v)}
                  suffix="дн"
                />
              </div>
            )}
            <div className="border-t border-glass-minimal pt-4">
              <p className="text-sm text-white/60 mb-3">Стрик-бонусы</p>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <SettingsInput
                  label="Цель/день"
                  value={numVal("dailyGoal")}
                  onChange={(v) => updateDraft("dailyGoal", v)}
                  suffix="шт"
                />
                <SettingsInput
                  label="Бонус за цель"
                  value={numVal("dailyGoalBonus")}
                  onChange={(v) => updateDraft("dailyGoalBonus", v)}
                  suffix="₽"
                />
                <SettingsInput
                  label="Множитель 3д"
                  value={numVal("streakMultiplier3")}
                  onChange={(v) => updateDraft("streakMultiplier3", v)}
                  suffix="×"
                />
                <SettingsInput
                  label="Множитель 7д"
                  value={numVal("streakMultiplier7")}
                  onChange={(v) => updateDraft("streakMultiplier7", v)}
                  suffix="×"
                />
                <SettingsInput
                  label="Порог удержания"
                  value={numVal("streakKeepThreshold")}
                  onChange={(v) => updateDraft("streakKeepThreshold", v)}
                  suffix="шт"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <SettingsValue
                label="Режим оплаты"
                value={settings.shipperPaymentMode === "fixed" ? "Фиксированная" : "Маятник"}
                accent
              />
              <SettingsValue label="Ставка" value={`${settings.shipperRate} ₽`} />
              <SettingsValue label="Фикс. ставка" value={`${settings.shipperFixedRate} ₽`} />
            </div>
            {settings.shipperPaymentMode === "pendulum" && (
              <div className="grid grid-cols-3 gap-3">
                <SettingsValue label="Мин" value={`${settings.rateMin} ₽`} />
                <SettingsValue label="Баз" value={`${settings.rateBase} ₽`} />
                <SettingsValue label="Макс" value={`${settings.rateMax} ₽`} />
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <SettingsValue label="Цель/день" value={`${settings.dailyGoal} шт`} />
              <SettingsValue label="Бонус" value={`${settings.dailyGoalBonus} ₽`} />
              <SettingsValue label="Стрик ×3д" value={`${settings.streakMultiplier3}×`} />
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Contacts */}
      <SettingsSection
        sectionKey="contacts"
        settings={settings}
        isEditing={editingSection === "contacts"}
        isSaved={saved === "contacts"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("contacts")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.3}
      >
        {editingSection === "contacts" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/60 mb-1 block">Telegram владельца</label>
              <Input
                value={strVal("ownerTelegramUsername")}
                onChange={(e) => updateDraft("ownerTelegramUsername", e.target.value)}
                placeholder="username"
              />
            </div>
            <div>
              <label className="text-sm text-white/60 mb-1 block">Telegram поддержки</label>
              <Input
                value={strVal("supportTelegramUsername")}
                onChange={(e) => updateDraft("supportTelegramUsername", e.target.value)}
                placeholder="username"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <SettingsValue
              label="Telegram владельца"
              value={
                settings.ownerTelegramUsername ? `@${settings.ownerTelegramUsername}` : "Не указан"
              }
            />
            <SettingsValue
              label="Telegram поддержки"
              value={
                settings.supportTelegramUsername
                  ? `@${settings.supportTelegramUsername}`
                  : "Не указан"
              }
            />
          </div>
        )}
      </SettingsSection>

      {/* Location */}
      <SettingsSection
        sectionKey="location"
        settings={settings}
        isEditing={editingSection === "location"}
        isSaved={saved === "location"}
        isSaving={updateMutation.isPending}
        error={updateMutation.error?.message}
        onEdit={() => setEditingSection("location")}
        onCancel={() => setEditingSection(null)}
        onSave={handleSave}
        delay={0.32}
      >
        {editingSection === "location" ? (
          <div>
            <label className="text-sm text-white/60 mb-1 block">
              Город по умолчанию для товаров
            </label>
            <CityInput
              value={strVal("defaultLocationCity")}
              onChange={(v) => updateDraft("defaultLocationCity", v)}
              placeholder="Начните вводить город..."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <SettingsValue
              label="Город по умолчанию"
              value={settings.defaultLocationCity || "Не указан"}
            />
          </div>
        )}
      </SettingsSection>

      {/* Pickup Points */}
      <PickupPointsSection />

      {/* System info */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.37 }}
        className="space-y-3"
      >
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">Система</h2>
        <Card>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <SettingsValue label="Версия" value="1.0.0" />
            <SettingsValue label="Платформа" value="Next.js + Supabase" />
            <SettingsValue label="Дизайн" value="iOS 26 Liquid Glass" />
          </div>
          {settings.updatedAt && (
            <p className="text-2xs text-white/20 mt-3">
              Обновлено: {new Date(settings.updatedAt).toLocaleString("ru-RU")}
            </p>
          )}
        </Card>
      </motion.section>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button variant="danger" size="lg" className="w-full" onClick={handleLogout}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Выйти из аккаунта
        </Button>
      </motion.div>
    </div>
  );
}

// --- Sub-components ---

const SECTION_FIELDS: Record<SectionKey, string[]> = {
  vibe: ["vibeCreditDefaultLimit", "vibeReceiptConfirmThreshold"],
  finance: ["payoutCadence", "payoutWeekday", "payoutReserveDays"],
  business: ["firstOrderDiscount", "reservationTimeoutMinutes"],
  goals: ["monthlyProfitTarget"],
  returns: ["returnToTrashDays", "trashToDisposedDays"],
  shippers: [
    "shipperRate",
    "shipperFixedRate",
    "shipperPaymentMode",
    "rateMin",
    "rateBase",
    "rateMax",
    "speedTargetHours",
    "avgWindowDays",
    "minWorkDays",
    "dailyGoal",
    "dailyGoalBonus",
    "streakMultiplier3",
    "streakMultiplier7",
    "streakKeepThreshold",
  ],
  contacts: ["ownerTelegramUsername", "supportTelegramUsername"],
  location: ["defaultLocationCity"],
};

function SettingsSection({
  sectionKey,
  isEditing,
  isSaved,
  isSaving,
  error,
  onEdit,
  onCancel,
  onSave,
  delay,
  children,
}: {
  sectionKey: SectionKey;
  settings: OwnerSettings;
  isEditing: boolean;
  isSaved: boolean;
  isSaving: boolean;
  error?: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  delay: number;
  children: React.ReactNode;
}) {
  const { title, icon } = SECTION_LABELS[sectionKey];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="space-y-3"
    >
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
        {icon} {title}
      </h2>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-white">{title}</h3>
          {!isEditing ? (
            <div className="flex items-center gap-2">
              {isSaved && <span className="text-sm text-accent-green">Сохранено</span>}
              <button
                onClick={onEdit}
                className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
              >
                Изменить
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
                Отмена
              </Button>
              <Button variant="primary" size="sm" onClick={onSave} isLoading={isSaving}>
                Сохранить
              </Button>
            </div>
          )}
        </div>
        {children}
        {error && isEditing && <p className="text-sm text-accent-red mt-3">{error}</p>}
      </Card>
    </motion.section>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-sm text-white/60 mb-1 block">{label}</label>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="pr-10"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/40">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function SettingsValue({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.04] border border-glass-minimal">
      <p className="text-2xs text-white/40 mb-1">{label}</p>
      <p className={cn("text-sm font-medium", accent ? "text-accent-blue" : "text-white")}>
        {value}
      </p>
    </div>
  );
}

// Лейблы служб — единый справочник (@/lib/constants/order-status).
// Было локально с «Avito» (англ.) / «Почта» — расходилось со страницей
// заказа и экспортом.

function PickupPointsSection() {
  const [pickupCity, setPickupCity] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPointAddress, setNewPointAddress] = useState("");
  const [newPointService, setNewPointService] = useState("cdek");

  const { data: linkedPoints, isLoading: linkedLoading } = useLocationPickupPoints(
    pickupCity || undefined
  );
  const createMutation = useCreatePickupPoint();
  const linkMutation = useLinkPickupPoint();
  const unlinkMutation = useUnlinkPickupPoint();

  const handleAddPoint = async () => {
    if (!pickupCity || !newPointAddress.trim()) return;
    try {
      const result = await createMutation.mutateAsync({
        address: newPointAddress.trim(),
        city: pickupCity,
        deliveryService: newPointService,
      });
      const pointId = result.point?.id || result.id;
      if (pointId) {
        await linkMutation.mutateAsync({ city: pickupCity, pickupPointId: pointId });
      }
      setNewPointAddress("");
      setNewPointService("cdek");
      setShowAddForm(false);
    } catch {
      // error shown via mutation state
    }
  };

  const handleUnlink = async (id: string) => {
    try {
      await unlinkMutation.mutateAsync(id);
    } catch {
      // error shown via mutation state
    }
  };

  const isSaving = createMutation.isPending || linkMutation.isPending;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
      className="space-y-3"
    >
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
        📦 Пункты отправки
      </h2>
      <Card>
        <div className="space-y-4">
          {/* City selector */}
          <div>
            <label className="text-sm text-white/60 mb-1 block">
              Город для управления пунктами
            </label>
            <CityInput
              value={pickupCity}
              onChange={(v) => {
                setPickupCity(v);
                setShowAddForm(false);
              }}
              placeholder="Выберите город..."
            />
          </div>

          {/* Linked points */}
          {pickupCity && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white/70">
                Привязанные пункты для {pickupCity}
              </h3>

              {linkedLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : linkedPoints && linkedPoints.length > 0 ? (
                <div className="space-y-2">
                  {linkedPoints.map((point) => (
                    <div
                      key={point.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-xl",
                        "bg-white/[0.04] border border-glass-minimal"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "shrink-0 px-2 py-0.5 rounded-lg text-xs font-medium",
                            "bg-white/[0.08] border border-glass-minimal text-white/70"
                          )}
                        >
                          {DELIVERY_SERVICE_LABELS[point.deliveryService] || point.deliveryService}
                        </span>
                        <span className="text-sm text-white truncate">{point.address}</span>
                      </div>
                      <button
                        onClick={() => handleUnlink(point.id)}
                        disabled={unlinkMutation.isPending}
                        className={cn(
                          "shrink-0 text-xs text-accent-red/70 hover:text-accent-red transition-colors",
                          "disabled:opacity-50"
                        )}
                      >
                        Убрать
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40 py-2">Нет привязанных пунктов</p>
              )}

              {/* Add form toggle */}
              {!showAddForm ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
                >
                  + Добавить пункт
                </button>
              ) : (
                <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-glass-minimal">
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Служба доставки</label>
                      <select
                        value={newPointService}
                        onChange={(e) => setNewPointService(e.target.value)}
                        className={cn(
                          "h-10 px-3 rounded-xl text-sm text-white bg-white/[0.06]",
                          "border border-glass-subtle focus:border-glass-active",
                          "outline-none transition-colors"
                        )}
                      >
                        {Object.entries(DELIVERY_SERVICE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Адрес</label>
                      <Input
                        value={newPointAddress}
                        onChange={(e) => setNewPointAddress(e.target.value)}
                        placeholder="ул. Тверская, 12"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAddPoint}
                        isLoading={isSaving}
                        disabled={!newPointAddress.trim()}
                      >
                        Добавить
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewPointAddress("");
                          setNewPointService("cdek");
                        }}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                  {(createMutation.error || linkMutation.error) && (
                    <p className="text-sm text-accent-red">
                      {createMutation.error?.message || linkMutation.error?.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.section>
  );
}

function CityInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useCallback((q: string) => {
    if (!q) return RUSSIAN_CITIES.slice(0, 8);
    const lower = q.toLowerCase();
    const starts = RUSSIAN_CITIES.filter((c) => c.toLowerCase().startsWith(lower));
    const includes = RUSSIAN_CITIES.filter(
      (c) => !c.toLowerCase().startsWith(lower) && c.toLowerCase().includes(lower)
    );
    return [...starts, ...includes].slice(0, 8);
  }, []);

  const suggestions = filtered(query);
  const isValid = !query || !!findCity(query);

  const handleSelect = (city: string) => {
    setQuery(city);
    onChange(city);
    setOpen(false);
  };

  const handleBlur = () => {
    setTimeout(() => {
      const match = findCity(query);
      if (match) {
        setQuery(match);
        onChange(match);
      } else if (query) {
        onChange(query);
      }
    }, 150);
  };

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder || "Город"}
        className={cn(!isValid && query && "border-accent-orange/40")}
      />
      {!isValid && query && (
        <p className="text-2xs text-accent-orange/80 mt-1">Город не найден в справочнике</p>
      )}
      {open && suggestions.length > 0 && (
        <div
          className={cn(
            "absolute z-50 top-full mt-1 w-full rounded-xl overflow-hidden",
            "bg-secondary/95 backdrop-blur-xl border border-glass-subtle",
            "shadow-modal max-h-48 overflow-y-auto"
          )}
        >
          {suggestions.map((city) => (
            <button
              key={city}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(city)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm transition-colors",
                "hover:bg-white/[0.08]",
                city === value ? "text-accent-blue" : "text-white/80"
              )}
            >
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
