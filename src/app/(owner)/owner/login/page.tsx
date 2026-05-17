"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useOwnerAuthStore } from "@/stores/owner-auth-store";
import { Button, Card, CardContent, Spinner, Input } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/owner/dashboard";

  const { login, isLoading, error, clearError, user } = useOwnerAuthStore();
  const [siteKey, setSiteKey] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (user) {
      router.replace(redirect);
    }
  }, [user, router, redirect]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

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
      router.replace(redirect);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-primary">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/10 border border-purple-500/25 shadow-[0_0_16px_rgba(191,90,242,0.25),inset_0_1px_0_rgba(255,255,255,0.1)] flex items-center justify-center"
          >
            <svg
              className="w-8 h-8 text-accent-purple"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">Панель владельца</h1>
          <p className="text-white/60">Введите ключ доступа из Telegram бота</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="siteKey"
                label="Ключ доступа"
                type="text"
                value={siteKey}
                onChange={(e) => {
                  setSiteKey(e.target.value);
                  setLocalError("");
                  clearError();
                }}
                placeholder="Вставьте 64-символьный ключ"
                className="font-mono text-sm"
                autoComplete="off"
                autoFocus
                disabled={isLoading}
              />

              {displayError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-gradient-to-b from-red-500/15 to-red-500/5 border border-red-500/20 text-accent-red text-sm"
                >
                  {displayError}
                </motion.div>
              )}

              <Button
                type="submit"
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
          Доступ только для владельца системы
        </p>
      </motion.div>
    </div>
  );
}

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-primary">
          <Spinner size="lg" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
