"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { getActionLabel, getActionIcon, getActionColor } from "@/hooks/use-owner-notifications";
import type { UseNotificationsResult } from "@/lib/roles/role-config";

interface Props {
  useNotificationsHook: (limit: number) => UseNotificationsResult;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} дн`;
}

export function NotificationPanel({ useNotificationsHook, onClose }: Props) {
  const { data, isLoading } = useNotificationsHook(15);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "fixed top-14 right-4 z-[60] w-80 max-h-[70vh] overflow-hidden",
        "lg:top-4 lg:right-auto lg:left-[17rem]",
        "rounded-2xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-modal"
      )}
    >
      <div className="px-4 py-3 border-b border-glass-minimal flex items-center justify-between">
        <h3 className="text-base font-medium text-white">Активность</h3>
        {data && <span className="text-2xs text-white/40">{data.recentCount} за 24ч</span>}
      </div>

      <div className="overflow-y-auto max-h-[calc(70vh-52px)]">
        {isLoading ? (
          <div className="p-6 flex justify-center">
            <Spinner size="sm" />
          </div>
        ) : !data?.items.length ? (
          <div className="p-6 text-center">
            <p className="text-sm text-white/40">Нет активности</p>
          </div>
        ) : (
          <div>
            {data.items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 border-b border-glass-minimal last:border-0 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-base flex-shrink-0 mt-0.5">
                    {getActionIcon(item.action)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", getActionColor(item.action))}>
                      {getActionLabel(item.action)}
                    </p>
                    {item.entityType && item.entityId && (
                      <p className="text-xs text-white/40 truncate mt-0.5">
                        {item.entityType} #{item.entityId.slice(0, 8)}
                      </p>
                    )}
                  </div>
                  <span className="text-2xs text-white/20 flex-shrink-0">
                    {item.createdAt ? timeAgo(item.createdAt) : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
