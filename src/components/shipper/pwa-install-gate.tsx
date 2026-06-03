"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import { isStandalone, getPlatform, type PlatformType } from "@/hooks/use-platform";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaInstallGateProps {
  children: ReactNode;
}

export function PwaInstallGate({ children }: PwaInstallGateProps) {
  const [standalone, setStandalone] = useState(true); // default true to avoid flash
  const [platform, setPlatform] = useState<PlatformType>("unknown");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Skip gate in development
    if (process.env.NODE_ENV === "development") {
      setStandalone(true);
      setChecking(false);
      return;
    }

    setStandalone(isStandalone());
    setPlatform(getPlatform());
    setChecking(false);

    // Listen for Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Listen for display mode changes
    const mql = window.matchMedia("(display-mode: standalone)");
    const mqlHandler = (e: MediaQueryListEvent) => {
      setStandalone(e.matches);
    };
    mql.addEventListener("change", mqlHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      mql.removeEventListener("change", mqlHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setStandalone(true);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // Show nothing while checking
  if (checking) return null;

  // If standalone — show app
  if (standalone) return <>{children}</>;

  // Show install instructions
  return (
    <div className="min-h-dvh bg-primary flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center"
      >
        {/* App icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "w-20 h-20 mx-auto mb-6 rounded-[22px] flex items-center justify-center",
            "bg-gradient-to-br from-accent-blue/30 to-accent-blue/10",
            "border border-accent-blue/25",
            "shadow-[0_0_24px_rgba(10,132,255,0.3)]"
          )}
        >
          <svg
            className="w-10 h-10 text-accent-blue"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-white mb-2"
        >
          Отправщик
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-white/60 mb-8"
        >
          Установите приложение на домашний экран для работы
        </motion.p>

        {/* Android: native install button */}
        {platform === "android" && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleInstall}
            >
              Установить приложение
            </Button>
          </motion.div>
        )}

        {/* Instructions card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={cn(
            "rounded-2xl p-5 text-left",
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "border border-glass"
          )}
        >
          {platform === "ios" ? (
            <IOSInstructions />
          ) : (
            <AndroidInstructions hasPrompt={!!deferredPrompt} />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

function IOSInstructions() {
  return (
    <>
      <h3 className="text-sm font-medium text-white/80 mb-4">
        Как установить на iPhone / iPad:
      </h3>
      <div className="space-y-4">
        <Step
          number={1}
          text={
            <>
              Нажмите{" "}
              <span className="inline-flex items-center align-middle">
                <ShareIcon />
              </span>{" "}
              внизу экрана
            </>
          }
        />
        <Step
          number={2}
          text="Прокрутите вниз и нажмите «На экран Домой»"
        />
        <Step number={3} text="Нажмите «Добавить»" />
      </div>
    </>
  );
}

function AndroidInstructions({ hasPrompt }: { hasPrompt: boolean }) {
  if (hasPrompt) {
    return (
      <p className="text-sm text-white/60">
        Или нажмите кнопку «Установить» выше
      </p>
    );
  }

  return (
    <>
      <h3 className="text-sm font-medium text-white/80 mb-4">
        Как установить на Android:
      </h3>
      <div className="space-y-4">
        <Step
          number={1}
          text={
            <>
              Нажмите{" "}
              <span className="inline-flex items-center align-middle">
                <MenuDotsIcon />
              </span>{" "}
              в правом верхнем углу
            </>
          }
        />
        <Step number={2} text='Нажмите «Добавить на главный экран»' />
        <Step number={3} text='Нажмите «Установить»' />
      </div>
    </>
  );
}

function Step({
  number,
  text,
}: {
  number: number;
  text: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
          "bg-accent-blue/20 text-accent-blue text-xs font-bold"
        )}
      >
        {number}
      </div>
      <p className="text-sm text-white/70 pt-0.5">{text}</p>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      className="w-5 h-5 text-accent-blue"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}

function MenuDotsIcon() {
  return (
    <svg
      className="w-5 h-5 text-accent-blue"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
