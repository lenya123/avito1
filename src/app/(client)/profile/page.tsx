"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUserLevel, useBalance } from "@/hooks/use-auth";
import { useLeaderboard } from "@/hooks/use-stats";
import { cn } from "@/utils/cn";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ProfileCard,
  ProfileCardSkeleton,
  BalanceCard,
  BalanceCardSkeleton,
  SubscriptionCard,
  SubscriptionCardSkeleton,
  ReferralCard,
  ReferralCardSkeleton,
  LevelProgress,
  LevelProgressSkeleton,
  LeaderboardCard,
  LeaderboardCardSkeleton,
  ExportModal,
} from "@/components/client";

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout, isLoading: authLoading } = useAuth();
  const { level, discountPercent, isVibePlus } = useUserLevel();
  const { deposit, referralDeposit } = useBalance();

  // Проверка premium для лидерборда
  const isPremium = useMemo(
    () =>
      isVibePlus ||
      user?.subscriptionTier === "premium" ||
      user?.subscriptionTier === "top_floor_boss",
    [user, isVibePlus]
  );

  // Загрузка лидерборда (только для premium)
  const { data: leaderboardData, isLoading: leaderboardLoading } = useLeaderboard(isPremium);

  // Handlers
  const handleTopUp = useCallback(() => {
    router.push("/profile/topup");
  }, [router]);

  const handleManageSubscription = useCallback(() => {
    router.push("/profile/subscription");
  }, [router]);

  // Avito доступен только для top_floor_boss или Vibe+
  const hasAvitoAccess = useMemo(
    () => isVibePlus || user?.subscriptionTier === "top_floor_boss",
    [user, isVibePlus]
  );

  // Modals
  const [avitoModalOpen, setAvitoModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const referralStats = useMemo(
    () => ({
      totalReferrals: user?.referralCount ?? 0,
      activeReferrals: 0,
      totalEarned: user?.referralEarned ?? 0,
    }),
    [user]
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      {/* Заголовок */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-white">Профиль</h1>
        <p className="text-sm text-white/60 mt-1">Управление аккаунтом и настройками</p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {authLoading ? (
            <ProfileCardSkeleton />
          ) : (
            <ProfileCard
              name={user?.name || user?.telegramUsername || "Клиент"}
              telegramUsername={user?.telegramUsername}
              avatarUrl={user?.avatarUrl}
              level={level}
              discountPercent={discountPercent}
              isVibePlus={isVibePlus}
              completedOrders={user?.completedOrdersCount ?? 0}
            />
          )}
        </motion.div>

        {/* Balance */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
        >
          {authLoading ? (
            <BalanceCardSkeleton />
          ) : (
            <BalanceCard
              deposit={deposit}
              referralDeposit={referralDeposit}
              isVibePlus={isVibePlus}
              depositLimit={user?.depositLimit ?? 100000}
              onTopUp={handleTopUp}
            />
          )}
        </motion.div>

        {/* Subscription */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
        >
          {authLoading ? (
            <SubscriptionCardSkeleton />
          ) : (
            <SubscriptionCard
              tier={user?.subscriptionTier ?? "none"}
              subscriptionEnd={user?.subscriptionEnd}
              isVibePlus={isVibePlus}
              onManage={handleManageSubscription}
            />
          )}
        </motion.div>

        {/* Referral */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
        >
          {authLoading ? (
            <ReferralCardSkeleton />
          ) : (
            <ReferralCard referralCode={user?.referralCode ?? ""} stats={referralStats} />
          )}
        </motion.div>

        {/* Leaderboard - только для premium */}
        {isPremium && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="md:col-span-2"
          >
            {leaderboardLoading ? (
              <LeaderboardCardSkeleton />
            ) : leaderboardData ? (
              <LeaderboardCard
                leaderboard={leaderboardData.leaderboard}
                currentUserRank={leaderboardData.currentUserRank}
                currentUserEntry={leaderboardData.currentUserEntry}
                totalParticipants={leaderboardData.totalParticipants}
              />
            ) : null}
          </motion.div>
        )}

        {/* Level Progress - full width */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="md:col-span-2"
        >
          {authLoading ? (
            <LevelProgressSkeleton />
          ) : (
            <LevelProgress
              level={level}
              completedOrders={user?.completedOrdersCount ?? 0}
              isVibePlus={isVibePlus}
            />
          )}
        </motion.div>
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 pt-6 border-t border-glass-subtle"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Быстрые действия</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ActionButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            }
            label="Avito аккаунт"
            disabled={!hasAvitoAccess}
            subtitle={!hasAvitoAccess ? "Top Floor Boss" : "Подключить"}
            onClick={() => {
              router.push("/avito");
            }}
          />
          <ActionButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            }
            label="Экспорт"
            onClick={() => setExportModalOpen(true)}
          />
          <ActionButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            }
            label="Уведомления"
            onClick={() => router.push("/profile/notifications")}
          />
          <ActionButton
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            }
            label="TG Бот"
            onClick={() => window.open("https://t.me/avitofamclientsbot", "_blank")}
          />
        </div>
      </motion.div>

      {/* Logout button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <button
          onClick={logout}
          className={cn(
            "w-full py-3 rounded-xl",
            "text-white/40 text-sm font-medium",
            "bg-gradient-to-b from-white/[0.04] to-transparent",
            "border border-glass-subtle",
            "hover:text-white/60 hover:border-glass",
            "transition-all duration-200"
          )}
        >
          Выйти из аккаунта
        </button>
      </motion.div>

      {/* Avito API Modal */}
      <AvitoApiModal
        isOpen={avitoModalOpen}
        onClose={() => setAvitoModalOpen(false)}
        onConnected={() => {
          setAvitoModalOpen(false);
          router.push("/avito");
        }}
      />

      {/* Export Modal */}
      <ExportModal isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} />
    </main>
  );
}

// Avito API modal
type ConnectionStatus = "idle" | "checking" | "connected" | "error";

function AvitoApiModal({
  isOpen,
  onClose,
  onConnected,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [profileId, setProfileId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [secretPlaceholder, setSecretPlaceholder] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Загрузка credentials при открытии (секрет приходит замаскированным)
  useEffect(() => {
    if (isOpen) {
      setClientSecret("");
      setConnectionStatus("idle");
      setStatusMessage("");
      setLoading(true);

      fetch("/api/avito/credentials")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setProfileId(data.avitoProfileId || "");
            setClientId(data.avitoClientId || "");
            setSecretPlaceholder(data.avitoClientSecretMasked || "");
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleCheckConnection = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setConnectionStatus("error");
      setStatusMessage("Заполните оба поля");
      return;
    }

    setConnectionStatus("checking");
    setStatusMessage("");

    try {
      const res = await fetch("/api/avito/check-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avitoClientId: clientId.trim(),
          avitoClientSecret: clientSecret.trim(),
        }),
      });

      const data = await res.json();

      if (data.connected) {
        setConnectionStatus("connected");
        setStatusMessage("Подключение успешно");
      } else {
        setConnectionStatus("error");
        setStatusMessage(data.error || "Ошибка подключения");
      }
    } catch {
      setConnectionStatus("error");
      setStatusMessage("Ошибка сети");
    }
  };

  const handleSave = async () => {
    if (!profileId.trim() || !clientId.trim() || !clientSecret.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/avito/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avitoProfileId: profileId.trim(),
          avitoClientId: clientId.trim(),
          avitoClientSecret: clientSecret.trim(),
        }),
      });

      if (res.ok) {
        // После сохранения — проверяем подключение (сохраняет avito_user_id)
        const checkRes = await fetch("/api/avito/check-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avitoClientId: clientId.trim(),
            avitoClientSecret: clientSecret.trim(),
          }),
        });
        const checkData = await checkRes.json();

        if (checkData.connected) {
          onConnected();
        } else {
          // Ключи сохранены, но подключение не прошло
          setConnectionStatus("error");
          setStatusMessage(checkData.error || "Ключи сохранены, но подключение не удалось");
        }
      } else {
        const data = await res.json();
        setConnectionStatus("error");
        setStatusMessage(data.error || "Ошибка сохранения");
      }
    } catch {
      setConnectionStatus("error");
      setStatusMessage("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<ConnectionStatus, string> = {
    idle: "bg-white/20",
    checking: "bg-accent-orange animate-pulse",
    connected: "bg-accent-green",
    error: "bg-accent-red",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Avito API"
      description="Введите данные API вашего магазина Avito"
      size="sm"
    >
      <div className="space-y-4">
        {/* Требование к тарифу */}
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-accent-orange/10 border border-accent-orange/20">
          <svg
            className="w-4 h-4 text-accent-orange shrink-0 mt-0.5"
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
          <p className="text-xs text-white/60 leading-relaxed">
            Требуется подписка{" "}
            <span className="text-accent-orange font-medium">«Максимальный»</span> в разделе «Для
            профессионалов» на Avito
          </p>
        </div>

        {/* Раскрывающаяся инструкция */}
        <div>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            <svg
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200",
                showGuide && "rotate-90"
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Где найти эти данные?
          </button>

          <AnimatePresence>
            {showGuide && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-3 rounded-xl bg-white/[0.04] border border-glass-subtle space-y-2.5 text-xs text-white/60 leading-relaxed">
                  <div className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-2xs font-bold text-white/60">
                      1
                    </span>
                    <span>
                      Войдите в аккаунт магазина на <span className="text-white/80">avito.ru</span>
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-2xs font-bold text-white/60">
                      2
                    </span>
                    <span>
                      <span className="text-white/80">Profile ID</span> — откройте Настройки →
                      Управление профилем, ID находится в карточке аккаунта
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-2xs font-bold text-white/60">
                      3
                    </span>
                    <span>
                      <span className="text-white/80">Client ID и Secret</span> — откройте{" "}
                      <span className="text-white/80">avito.ru/professionals/api</span> (тариф
                      «Максимальный») и нажмите «Получить ключи»
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Input
          label="Profile ID"
          placeholder="Номер профиля Avito"
          value={profileId}
          disabled={loading}
          onChange={(e) => {
            setProfileId(e.target.value);
            setConnectionStatus("idle");
          }}
        />
        <Input
          label="Client ID"
          placeholder="Введите Client ID"
          value={clientId}
          disabled={loading}
          onChange={(e) => {
            setClientId(e.target.value);
            setConnectionStatus("idle");
          }}
        />
        <Input
          label="Client Secret"
          type="password"
          placeholder={secretPlaceholder || "Введите Client Secret"}
          value={clientSecret}
          disabled={loading}
          onChange={(e) => {
            setClientSecret(e.target.value);
            setConnectionStatus("idle");
          }}
        />

        {/* Статус подключения */}
        <button
          onClick={handleCheckConnection}
          disabled={connectionStatus === "checking" || !clientId.trim() || !clientSecret.trim()}
          className={cn(
            "w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl",
            "bg-white/[0.06] border border-glass-subtle",
            "text-sm font-medium text-white/60",
            "hover:bg-white/[0.1] hover:text-white/80",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "transition-all duration-200"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              statusColors[connectionStatus]
            )}
          />
          {connectionStatus === "checking"
            ? "Проверка..."
            : connectionStatus === "connected"
              ? "Подключено"
              : connectionStatus === "error"
                ? "Ошибка"
                : "Проверить подключение"}
        </button>

        {statusMessage && connectionStatus !== "idle" && (
          <p
            className={cn(
              "text-xs text-center",
              connectionStatus === "connected" ? "text-accent-green" : "text-accent-red"
            )}
          >
            {statusMessage}
          </p>
        )}
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          onClick={handleSave}
          isLoading={saving}
          disabled={!profileId.trim() || !clientId.trim() || !clientSecret.trim()}
        >
          Сохранить
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// Action button component
function ActionButton({
  icon,
  label,
  subtitle,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2.5 p-4 rounded-xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "border border-glass-subtle",
        "transition-all duration-200",
        "shadow-glass-inset",
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "hover:border-glass hover:from-white/[0.1] hover:to-white/[0.06]"
      )}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center relative",
          "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
          "border border-glass-subtle",
          "text-white/60",
          "shadow-glass-inset"
        )}
      >
        {icon}
        {disabled && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white/10 border border-glass-subtle flex items-center justify-center">
            <svg
              className="w-2.5 h-2.5 text-white/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs font-medium text-white/80">{label}</span>
        {subtitle && <span className="text-2xs text-white/20">{subtitle}</span>}
      </div>
    </button>
  );
}
