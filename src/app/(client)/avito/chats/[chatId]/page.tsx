"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { BackButton, Spinner } from "@/components/ui";
import { useChatMessages, useSendMessage } from "@/hooks/use-avito";
import { ChatView } from "@/components/client/avito/chat-view";

interface PageProps {
  params: { chatId: string };
}

export default function AvitoChatPage({ params }: PageProps) {
  const { chatId } = params;
  const { data, isLoading } = useChatMessages(chatId);
  const sendMutation = useSendMessage();

  const messages = data?.messages || [];
  const chatInfo = data?.chat;

  const handleSend = (text: string) => {
    sendMutation.mutate({ chatId, text });
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] md:max-w-2xl md:mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex-shrink-0 flex items-center gap-3 px-4 py-3",
          "border-b border-glass-minimal",
          "bg-secondary backdrop-blur-xl"
        )}
      >
        <BackButton href="/avito/chats" />
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-white truncate">
            {chatInfo?.buyer_name || "Чат"}
          </h1>
          {chatInfo?.item_title && (
            <p className="text-xs text-accent-blue/70 truncate">{chatInfo.item_title}</p>
          )}
        </div>
      </motion.div>

      {/* Chat content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <ChatView messages={messages} onSend={handleSend} isSending={sendMutation.isPending} />
      )}
    </div>
  );
}
