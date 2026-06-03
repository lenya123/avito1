"use client";

import { useRouter } from "next/navigation";
import { useAvitoChats } from "@/hooks/use-avito";
import { AvitoChatListItem } from "@/components/client/avito/chat-list-item";
import { Empty, ErrorState } from "@/components/ui/empty";

export function DashboardChats() {
  const router = useRouter();
  const { data: chatsData, isLoading, isError, refetch } = useAvitoChats(1, 4);

  if (isError) {
    return <ErrorState title="Ошибка" message="Не удалось загрузить чаты" onRetry={refetch} />;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Чаты</h2>
        {chatsData && chatsData.chats.length > 0 && (
          <button
            onClick={() => router.push("/avito/chats")}
            className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            Все →
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white/[0.04] border border-glass-minimal animate-pulse h-20"
            />
          ))}
        </div>
      ) : chatsData && chatsData.chats.length > 0 ? (
        <div className="space-y-2">
          {chatsData.chats.map((chat) => (
            <AvitoChatListItem
              key={chat.id}
              id={chat.id}
              buyerName={chat.buyer_name}
              itemTitle={chat.item_title}
              lastMessage={chat.last_message}
              lastMessageAt={chat.last_message_at}
              lastMessageDirection={chat.last_message_direction}
              unreadCount={chat.unread_count ?? 0}
              onClick={(chatId) => router.push(`/avito/chats/${chatId}`)}
            />
          ))}
        </div>
      ) : (
        <Empty icon="💬" title="Нет активных чатов" />
      )}
    </section>
  );
}
