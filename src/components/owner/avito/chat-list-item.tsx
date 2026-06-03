"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface AvitoChatListItemProps {
  id: string;
  buyerName: string | null;
  itemTitle: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageDirection: string | null;
  unreadCount: number;
  onClick: (chatId: string) => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return mins <= 0 ? "сейчас" : `${mins} мин`;
  }
  if (diffHours < 24) {
    return date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

export function AvitoChatListItem({
  id,
  buyerName,
  itemTitle,
  lastMessage,
  lastMessageAt,
  lastMessageDirection,
  unreadCount,
  onClick,
}: AvitoChatListItemProps) {
  const hasUnread = unreadCount > 0;

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(id)}
      className={cn(
        "relative w-full text-left rounded-2xl p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04] backdrop-blur-xl",
        "border border-glass-minimal shadow-card",
        "transition-all duration-200",
        "hover:border-white/20 hover:bg-white/[0.10]",
        hasUnread && "border-accent-blue/30"
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        {/* Аватар */}
        <div
          className={cn(
            "w-10 h-10 rounded-full flex-shrink-0",
            "bg-white/10 flex items-center justify-center",
            "text-sm font-semibold text-white/60"
          )}
        >
          {(buyerName || "?")[0].toUpperCase()}
        </div>

        {/* Контент */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p
              className={cn(
                "text-sm font-medium truncate",
                hasUnread ? "text-white" : "text-white/80"
              )}
            >
              {buyerName || "Покупатель"}
            </p>
            <span className="text-xs text-white/40 flex-shrink-0 ml-2">
              {formatTime(lastMessageAt)}
            </span>
          </div>

          {itemTitle && <p className="text-xs text-accent-blue/60 truncate mt-0.5">{itemTitle}</p>}

          <div className="flex items-center justify-between mt-1">
            <p className={cn("text-xs truncate", hasUnread ? "text-white/60" : "text-white/40")}>
              {lastMessageDirection === "out" && <span className="text-white/20">Вы: </span>}
              {lastMessage || "Нет сообщений"}
            </p>

            {hasUnread && (
              <span
                className={cn(
                  "ml-2 flex-shrink-0 min-w-[20px] h-5 px-1.5",
                  "rounded-full bg-accent-blue",
                  "text-xs font-semibold text-white",
                  "flex items-center justify-center"
                )}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
