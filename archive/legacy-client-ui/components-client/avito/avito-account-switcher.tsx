"use client";

import { useState, useEffect } from "react";
import { cn } from "@/utils/cn";
import { useAuth } from "@/hooks/use-auth";
import { useAvitoAccountStore } from "@/stores/avito-account-store";
import { useAvitoAccounts } from "@/hooks/use-avito";
import { Modal, ModalFooter } from "@/components/ui";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

export function AvitoAccountSwitcher() {
  const { user } = useAuth();
  const { activeAccountIndex, setActiveAccountIndex } = useAvitoAccountStore();
  const { data: accountsData } = useAvitoAccounts();
  const [connectModalIndex, setConnectModalIndex] = useState<number | null>(null);
  const limit = user?.avitoAccountLimit ?? 1;

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

          return (
            <button
              key={index}
              onClick={() => handleAccountClick(index)}
              className={cn(
                "py-1.5 text-xs font-medium rounded-lg transition-all text-center",
                isActive
                  ? "bg-white/[0.12] text-white"
                  : hasCredentials
                    ? "text-white/50 hover:text-white/70"
                    : "text-white/30 hover:text-white/50"
              )}
            >
              {hasCredentials ? `Аккаунт ${index}` : `+ Аккаунт ${index}`}
            </button>
          );
        })}
      </div>

      <ConnectAccountModal
        isOpen={connectModalIndex !== null}
        onClose={() => setConnectModalIndex(null)}
        onConnected={() => connectModalIndex && handleConnected(connectModalIndex)}
        accountIndex={connectModalIndex ?? 1}
      />
    </>
  );
}

// --- Modal for connecting a new Avito account ---

type ConnectionStatus = "idle" | "checking" | "connected" | "error";

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
  const [profileId, setProfileId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setProfileId("");
      setClientId("");
      setClientSecret("");
      setConnectionStatus("idle");
      setStatusMessage("");
      setSaving(false);
    }
  }, [isOpen]);

  const handleCheckConnection = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setConnectionStatus("error");
      setStatusMessage("Заполните все поля");
      return;
    }

    setConnectionStatus("checking");
    setStatusMessage("");

    try {
      const res = await fetch(`/api/avito/check-connection?accountIndex=${accountIndex}`, {
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
      const res = await fetch(`/api/avito/credentials?accountIndex=${accountIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avitoProfileId: profileId.trim(),
          avitoClientId: clientId.trim(),
          avitoClientSecret: clientSecret.trim(),
        }),
      });

      if (res.ok) {
        // Check connection after saving (saves avito_user_id)
        const checkRes = await fetch(`/api/avito/check-connection?accountIndex=${accountIndex}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avitoClientId: clientId.trim(),
            avitoClientSecret: clientSecret.trim(),
          }),
        });
        const checkData = await checkRes.json();

        if (checkData.connected) {
          // Invalidate accounts and overview queries
          await queryClient.invalidateQueries({ queryKey: ["avito"] });
          onConnected();
        } else {
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
      title={`Подключить Аккаунт ${accountIndex}`}
      description="Введите API-ключи от другого магазина Avito"
      size="sm"
    >
      <div className="space-y-4">
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
            <span className="text-accent-orange font-medium">&laquo;Максимальный&raquo;</span> в
            разделе &laquo;Для профессионалов&raquo; на Avito
          </p>
        </div>

        <Input
          label="Profile ID"
          placeholder="Номер профиля Avito"
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value);
            setConnectionStatus("idle");
          }}
        />
        <Input
          label="Client ID"
          placeholder="Введите Client ID"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setConnectionStatus("idle");
          }}
        />
        <Input
          label="Client Secret"
          type="password"
          placeholder="Введите Client Secret"
          value={clientSecret}
          onChange={(e) => {
            setClientSecret(e.target.value);
            setConnectionStatus("idle");
          }}
        />

        {/* Connection status check button */}
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
          Подключить
        </Button>
      </ModalFooter>
    </Modal>
  );
}
