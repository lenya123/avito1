"use client";

import { useState, useEffect } from "react";
import { cn } from "@/utils/cn";
import { useAvitoAccountStore } from "@/stores/avito-account-store";
import {
  useAvitoAccounts,
  useAvitoSession,
  useDisconnectAvitoSession,
} from "@/hooks/use-avito";
import { Modal } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AvitoSessionConnect } from "./avito-session-connect";

export function AvitoAccountSwitcher() {
  const { activeAccountIndex, setActiveAccountIndex } = useAvitoAccountStore();
  const { data: accountsData } = useAvitoAccounts();
  const [connectModalIndex, setConnectModalIndex] = useState<number | null>(null);
  const [disconnectingIndex, setDisconnectingIndex] = useState<number | null>(null);
  const limit = accountsData?.limit ?? 1;

  if (limit <= 1) return null;

  const accounts = Array.from({ length: limit }, (_, i) => i + 1);

  const handleAccountClick = (index: number) => {
    // Check if this account has credentials
    const accountInfo = accountsData?.accounts.find((a) => a.accountIndex === index);
    if (!accountInfo?.hasCredentials) {
      // No credentials — show connect modal
      setConnectModalIndex(index);
      return;
    }
    setActiveAccountIndex(index);
  };

  const handleConnected = (index: number) => {
    setConnectModalIndex(null);
    setActiveAccountIndex(index);
  };

  return (
    <>
      <div
        className={cn(
          "grid gap-1 p-1 rounded-xl",
          "bg-gradient-to-b from-white/[0.06] to-white/[0.03]",
          "border border-glass"
        )}
        style={{ gridTemplateColumns: `repeat(${accounts.length}, 1fr)` }}
      >
        {accounts.map((index) => {
          const accountInfo = accountsData?.accounts.find((a) => a.accountIndex === index);
          const hasCredentials = accountInfo?.hasCredentials ?? false;
          const isActive = activeAccountIndex === index;
          // Подключённый: кастомное имя владельца → имя магазина из API →
          // логин/телефон → «Аккаунт N». Не подключённый: «+ Аккаунт N».
          const label = hasCredentials
            ? accountInfo?.displayName ||
              accountInfo?.shopName ||
              accountInfo?.avitoLogin ||
              `Аккаунт ${index}`
            : `+ Аккаунт ${index}`;

          return (
            <div key={index} className="relative group">
              <button
                onClick={() => handleAccountClick(index)}
                title={hasCredentials ? `${label} (Аккаунт ${index})` : `Подключить Аккаунт ${index}`}
                className={cn(
                  "w-full py-1.5 px-2 text-xs font-medium rounded-lg transition-all text-center truncate",
                  hasCredentials && "pr-6",
                  isActive
                    ? "bg-white/[0.12] text-white"
                    : hasCredentials
                      ? "text-white/50 hover:text-white/70"
                      : "text-white/30 hover:text-white/50"
                )}
              >
                {label}
              </button>
              {hasCredentials && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDisconnectingIndex(index);
                  }}
                  title={`Отключить ${label}`}
                  className={cn(
                    "absolute top-1/2 right-1 -translate-y-1/2",
                    "w-4 h-4 flex items-center justify-center rounded",
                    "text-white/30 hover:text-accent-red hover:bg-white/[0.08]",
                    "transition-colors leading-none text-[10px]"
                  )}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ConnectAccountModal
        isOpen={connectModalIndex !== null}
        onClose={() => setConnectModalIndex(null)}
        onConnected={() => connectModalIndex && handleConnected(connectModalIndex)}
        accountIndex={connectModalIndex ?? 1}
      />

      <DisconnectConfirmModal
        isOpen={disconnectingIndex !== null}
        accountIndex={disconnectingIndex ?? 1}
        label={
          disconnectingIndex
            ? accountsData?.accounts.find((a) => a.accountIndex === disconnectingIndex)
                ?.displayName ||
              accountsData?.accounts.find((a) => a.accountIndex === disconnectingIndex)
                ?.shopName ||
              `Аккаунт ${disconnectingIndex}`
            : ""
        }
        onClose={() => setDisconnectingIndex(null)}
        onDisconnected={() => {
          // Если отключаем активный — переключаемся на первый.
          if (activeAccountIndex === disconnectingIndex) setActiveAccountIndex(1);
          setDisconnectingIndex(null);
        }}
      />
    </>
  );
}

// --- Modal for disconnect confirmation ---

function DisconnectConfirmModal({
  isOpen,
  accountIndex,
  label,
  onClose,
  onDisconnected,
}: {
  isOpen: boolean;
  accountIndex: number;
  label: string;
  onClose: () => void;
  onDisconnected: () => void;
}) {
  const queryClient = useQueryClient();
  const disconnectMutation = useDisconnectAvitoSession(accountIndex);

  const handleConfirm = async () => {
    await disconnectMutation.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: ["avito"] });
    onDisconnected();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Отключить ${label}?`}
      description="Cookies и логин будут удалены. Чтобы пользоваться этим магазином снова, нужно подключить заново."
      size="sm"
    >
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "flex-1 py-2 text-sm rounded-xl",
            "bg-white/[0.06] border border-glass-subtle",
            "text-white/70 hover:bg-white/[0.1]"
          )}
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={disconnectMutation.isPending}
          className={cn(
            "flex-1 py-2 text-sm rounded-xl",
            "bg-accent-red/20 border border-accent-red/30 text-accent-red",
            "hover:bg-accent-red/30",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {disconnectMutation.isPending ? "Отключаем..." : "Отключить"}
        </button>
      </div>
    </Modal>
  );
}

// --- Modal for connecting a new Avito account ---
// Использует тот же HTTP-login flow (логин/телефон → SMS), что и подключение
// первого аккаунта — через AvitoSessionConnect с переданным accountIndex.
// Автоматически закрывает модалку и активирует аккаунт после status='active'.

function ConnectAccountModal({
  isOpen,
  onClose,
  onConnected,
  accountIndex,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  accountIndex: number;
}) {
  const queryClient = useQueryClient();
  const { data: session } = useAvitoSession(isOpen ? accountIndex : undefined);

  // Когда сессия стала active — инвалидируем кеш аккаунтов и закрываем модалку.
  useEffect(() => {
    if (isOpen && session?.status === "active") {
      queryClient.invalidateQueries({ queryKey: ["avito"] });
      onConnected();
    }
  }, [isOpen, session?.status, queryClient, onConnected]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Подключить Аккаунт ${accountIndex}`}
      description="Войдите в другой магазин Avito — логин, пароль и SMS."
      size="sm"
    >
      <AvitoSessionConnect accountIndex={accountIndex} />
    </Modal>
  );
}
