"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { BackButton, Spinner } from "@/components/ui";
import { useAvitoChats } from "@/hooks/use-avito";
import { AvitoChatListItem } from "@/components/client/avito/chat-list-item";

export default function AvitoChatsPage() {
  const router = useRouter();
  const { data, isLoading } = useAvitoChats(1, 50);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/avito" />
        <div>
          <h1 className="text-xl font-bold text-white">Чаты</h1>
          <p className="text-sm text-white/40 mt-0.5">Сообщения покупателей</p>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : data && data.chats.length > 0 ? (
        <div className="space-y-2">
          {data.chats.map((chat, i) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <AvitoChatListItem
                id={chat.id}
                buyerName={chat.buyer_name}
                itemTitle={chat.item_title}
                lastMessage={chat.last_message}
                lastMessageAt={chat.last_message_at}
                lastMessageDirection={chat.last_message_direction}
                unreadCount={chat.unread_count ?? 0}
                onClick={(chatId) => router.push(`/avito/chats/${chatId}`)}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl p-12 text-center",
            "bg-white/[0.06] backdrop-blur-xl",
            "border border-glass-minimal"
          )}
        >
          <div className="text-4xl mb-3">💬</div>
          <p className="text-white/40 text-sm">Нет чатов</p>
          <p className="text-white/20 text-xs mt-1">
            Синхронизируйте данные на главной странице Avito
          </p>
        </motion.div>
      )}
    </main>
  );
}
