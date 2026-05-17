"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface Message {
  id: string;
  direction: string;
  content_text: string | null;
  content_image_url: string | null;
  message_type: string | null;
  avito_created_at: string | null;
}

interface ChatViewProps {
  messages: Message[];
  onSend: (text: string) => void;
  isSending: boolean;
}

function formatMessageTime(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatView({ messages, onSend, isSending }: ChatViewProps) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/20 text-sm">Нет сообщений</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isOut = msg.direction === "out";

          return (
            <motion.div
              key={msg.id || i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", isOut ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2",
                  isOut
                    ? "bg-accent-blue/90 text-white rounded-br-md"
                    : "bg-white/[0.10] text-white/80 rounded-bl-md"
                )}
              >
                {msg.content_text && (
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content_text}</p>
                )}
                {msg.content_image_url && (
                  <Image
                    src={msg.content_image_url}
                    alt="Изображение в сообщении"
                    width={0}
                    height={0}
                    sizes="100vw"
                    style={{ width: "100%", height: "auto" }}
                    className="rounded-xl mt-1"
                  />
                )}
                {!msg.content_text && !msg.content_image_url && (
                  <p className="text-sm text-white/40 italic">
                    [{msg.message_type || "сообщение"}]
                  </p>
                )}
                <p
                  className={cn(
                    "text-2xs mt-0.5",
                    isOut ? "text-white/40 text-right" : "text-white/20"
                  )}
                >
                  {formatMessageTime(msg.avito_created_at)}
                </p>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex-shrink-0 p-3 border-t border-glass-minimal",
          "bg-white/[0.06] backdrop-blur-xl"
        )}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Написать сообщение..."
            maxLength={1000}
            disabled={isSending}
            className={cn(
              "flex-1 rounded-xl px-4 py-2.5 text-sm",
              "bg-white/10 text-white placeholder-white/30",
              "border border-glass-minimal focus:border-accent-blue/50",
              "outline-none transition-colors"
            )}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="submit"
            disabled={!text.trim() || isSending}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              "bg-accent-blue text-white",
              "disabled:opacity-30 disabled:cursor-not-allowed",
              "transition-opacity"
            )}
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
