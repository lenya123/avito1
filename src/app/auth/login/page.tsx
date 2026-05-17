"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button, Card, CardContent, Spinner } from "@/components/ui";

const HOME_PATH = "/avito";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || HOME_PATH;
  const { login, isAuthenticated, isLoading, error, clearError, isInitialized } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (isInitialized) setIsChecking(false);
  }, [isInitialized]);

  useEffect(() => {
    if (!isChecking && isAuthenticated) router.replace(redirectTo);
  }, [isChecking, isAuthenticated, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!loginValue.trim() || !password) {
      setLocalError("Введите логин и пароль");
      return;
    }

    const success = await login(loginValue.trim(), password);
    if (success) router.replace(redirectTo);
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
            <svg className="w-8 h-8 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mb-2">Avito Автопостинг</h1>
          <p className="text-white/60">Вход оператора</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login" className="block text-sm font-medium mb-2 text-white/80">
                  Логин
                </label>
                <input
                  id="login"
                  type="text"
                  value={loginValue}
                  onChange={(e) => {
                    setLoginValue(e.target.value);
                    setLocalError("");
                    clearError();
                  }}
                  placeholder="Логин оператора"
                  className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-text-primary placeholder:text-text-tertiary
                             focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue
                             transition-all duration-200 text-sm"
                  autoComplete="username"
                  autoFocus
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-2 text-white/80">
                  Пароль
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError("");
                    clearError();
                  }}
                  placeholder="Пароль"
                  className="w-full px-4 py-3 rounded-xl bg-secondary border border-border
                             text-text-primary placeholder:text-text-tertiary
                             focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue
                             transition-all duration-200 text-sm"
                  autoComplete="current-password"
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
                disabled={isLoading || !loginValue.trim() || !password}
              >
                Войти
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-white/40 text-sm mt-6">
          Standalone-режим. Учётные данные задаются в .env
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
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
