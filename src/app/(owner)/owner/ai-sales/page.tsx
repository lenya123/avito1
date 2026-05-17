"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { QuickStats } from "@/components/owner/ai-sales/quick-stats";
import { DraftList } from "@/components/owner/ai-sales/draft-list";
import { useAiSalesStats } from "@/hooks/use-ai-sales";
import Link from "next/link";

export default function AiSalesPage() {
  const { data: stats, isLoading: statsLoading } = useAiSalesStats(7);

  return (
    <div className="min-h-screen bg-[#0a0a0c] pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-14 pb-4"
      >
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-white">AI Продажник</h1>
          <Link
            href="/owner/ai-sales/settings"
            className={cn(
              "p-2 rounded-xl",
              "bg-white/[0.06] border border-glass-subtle",
              "text-white/40 active:bg-white/[0.1] transition-colors"
            )}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
        </div>
        <p className="text-sm text-white/40">Черновики ответов покупателям</p>
      </motion.div>

      {/* Quick Stats */}
      <div className="px-4 mb-5">
        <QuickStats stats={stats} isLoading={statsLoading} />
      </div>

      {/* Навигация по разделам */}
      <div className="px-4 mb-4 flex gap-2">
        <Link
          href="/owner/ai-sales"
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium",
            "bg-accent-purple/20 text-accent-purple/80 border border-accent-purple/30"
          )}
        >
          Черновики
        </Link>
        <Link
          href="/owner/ai-sales/analytics"
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium",
            "bg-white/[0.06] text-white/40 border border-glass-subtle",
            "active:bg-white/[0.1] transition-colors"
          )}
        >
          Аналитика
        </Link>
      </div>

      {/* Список черновиков */}
      <div className="px-4">
        <DraftList />
      </div>
    </div>
  );
}
