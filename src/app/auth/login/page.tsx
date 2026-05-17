"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button, Card, CardContent, Spinner } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError, isInitialized } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [siteKey, setSiteKey] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (isInitialized) {
      setIsChecking(false);
    }
  }, [isInitialized]);

  useEffect(() => {
    if (!isChecking && isAuthenticated) {
      router.replace("/catalog");
    }
  }, [isChecking, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

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
      router.replace("/catalog");
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
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 bg-accent-blue/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
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
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">Каталог товаров</h1>
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
          Нет ключа?{" "}
          <a
            href="https://t.me/your_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline"
          >
            Получите в Telegram боте
          </a>
        </p>
      </motion.div>
    </div>
  );
}
