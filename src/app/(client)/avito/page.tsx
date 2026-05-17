"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Spinner } from "@/components/ui";
import {
  useAvitoOverview,
  useAvitoItems,
  useAvitoChats,
  useAvitoSync,
  useAvitoReviews,
  useAvitoOperations,
  useAvitoAiAgentStatus,
  useAvitoSession,
  useAvitoOrders,
} from "@/hooks/use-avito";
import { AvitoSessionConnect } from "@/components/client/avito/avito-session-connect";
import { AiAgentCard } from "@/components/client/avito/ai-agent-card";
import {
  DashboardHeader,
  DashboardOverview,
  DashboardFunnel,
  DashboardInsights,
  DashboardTopItems,
  DashboardItems,
  DashboardOrders,
  DashboardReviews,
  DashboardOperations,
  DashboardChats,
} from "@/components/client/avito/dashboard";

const PULL_THRESHOLD = 60;

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function AvitoDashboardPage() {
  const { data: sessionData, isLoading: sessionLoading } = useAvitoSession();
  const { isLoading: overviewLoading } = useAvitoOverview();
  const { isLoading: itemsLoading } = useAvitoItems(1, 6);
  const { isLoading: chatsLoading } = useAvitoChats(1, 4);
  useAvitoReviews(0, 3);
  useAvitoOperations();
  const { isLoading: aiAgentLoading } = useAvitoAiAgentStatus();
  const { isLoading: ordersLoading } = useAvitoOrders(1, 3);
  const syncMutation = useAvitoSync();

  // Если сессия не active — показываем форму подключения
  const needsConnect =
    !sessionLoading &&
    (!sessionData?.status || sessionData.status !== "active" || !sessionData.hasLogin);

  const isLoading =
    overviewLoading ||
    itemsLoading ||
    chatsLoading ||
    aiAgentLoading ||
    sessionLoading ||
    ordersLoading;

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const isAtTop = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
      isAtTop.current = true;
    } else {
      isAtTop.current = false;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isAtTop.current || touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 100));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !syncMutation.isPending) {
      syncMutation.mutate();
    }
    setPullDistance(0);
    touchStartY.current = null;
  }, [pullDistance, syncMutation]);

  return (
    <main
      className="max-w-4xl mx-auto px-4 py-6 relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {pullDistance > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center transition-opacity"
          style={{ top: pullDistance - 32 }}
        >
          <Spinner size="sm" />
        </div>
      )}

      <DashboardHeader onSync={() => syncMutation.mutate()} isSyncing={syncMutation.isPending} />

      {/* Форма подключения — если нет активной браузерной сессии */}
      {needsConnect && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <AvitoSessionConnect />
        </motion.div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={staggerItem}>
            <DashboardOverview />
          </motion.div>
          <motion.div variants={staggerItem}>
            <AiAgentCard />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardFunnel />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardInsights />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardTopItems />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardItems />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardOrders />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardChats />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardOperations />
          </motion.div>
          <motion.div variants={staggerItem}>
            <DashboardReviews />
          </motion.div>
        </motion.div>
      )}
    </main>
  );
}
