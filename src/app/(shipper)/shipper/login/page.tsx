"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Card, CardContent, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { useShipperAuthStore } from "@/stores/shipper-auth-store";

export default function ShipperLoginPage() {
  const router = useRouter();
  const { login, checkAuth, isLoading, error, clearError, user } = useShipperAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [siteKey, setSiteKey] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const check = async () => {
      await checkAuth();
      setIsChecking(false);
    };
    check();
  }, [checkAuth]);

  useEffect(() => {
    if (!isChecking && user) {
      router.replace("/shipper");
    }
  }, [isChecking, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    // Валидация
    const cleanKey = siteKey.trim().toLowerCase();

    if (!cleanKey) {
      setLocalError("Введите ключ доступа");
      return;
    }

    if (cleanKey.length !== 64) {
      setLocalError("Ключ должен содержать 64 символа");
      return;
    }

    if (!/^[a-f0-9]+$/i.test(cleanKey)) {
      setLocalError("Ключ должен содержать только hex символы (0-9, a-f)");
      return;
    }

    const success = await login(cleanKey);
    if (success) {
      router.replace("/shipper");
    }
  };

  const displayError = localError || error;

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4",
              "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
              "border border-accent-blue/25",
              "shadow-[0_0_16px_rgba(10,132,255,0.25),inset_0_1px_0_rgba(255,255,255,0.1)]"
            )}
          >
            <svg
              className="w-8 h-8 text-accent-blue"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Панель отправщика</h1>
          <p className="text-white/60">Введите ключ доступа из Telegram бота</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="siteKey" className="block text-sm font-medium mb-2 text-white/80">
                  Ключ доступа
                </label>
                <input
                  id="siteKey"
                  type="text"
                  value={siteKey}
                  onChange={(e) => {
                    setSiteKey(e.target.value);
                    setLocalError("");
                    clearError();
                  }}
                  placeholder="Вставьте 64-символьный ключ"
                  className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-text-primary placeholder:text-text-tertiary
                             focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue
                             transition-all duration-200 font-mono text-sm"
                  autoComplete="off"
                  autoFocus
                  disabled={isLoading}
                />
              </div>

              {displayError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-accent-red/10 border border-accent-red/20"
                >
                  <p className="text-sm text-accent-red text-center">{displayError}</p>
                </motion.div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isLoading}
                disabled={isLoading || !siteKey.trim()}
              >
                Войти
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-white/40 text-sm mt-6">
          Ключ предоставляет владелец через Telegram бота
        </p>
      </motion.div>
    </div>
  );
}
