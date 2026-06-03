"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { cn } from "@/utils/cn";

// FAQ items
const FAQ_ITEMS = [
  {
    id: "1",
    question: "Как пополнить депозит?",
    answer: "Перейдите в раздел Профиль → Пополнить. Доступны оплата картой и СБП.",
  },
  {
    id: "2",
    question: "Когда отправят мой заказ?",
    answer: "Заказы отправляются ежедневно до 17:00 МСК. Если дедлайн сегодня — отправим сегодня.",
  },
  {
    id: "3",
    question: "Как отследить заказ?",
    answer:
      "В разделе Заказы найдите нужный заказ и нажмите на него. Там будет трек-номер и статус.",
  },
  {
    id: "4",
    question: "Что делать если товар вернули?",
    answer:
      "Возвращённый товар автоматически попадает обратно в каталог. Вы можете заказать его снова.",
  },
  {
    id: "5",
    question: "Как получить статус +ВАЙБ?",
    answer: "Статус выдаётся владельцем по результатам работы. Обычно после 30+ успешных заказов.",
  },
];

// Quick questions
const QUICK_QUESTIONS = [
  "Когда отправят мой заказ?",
  "Как пополнить баланс?",
  "Почему заказ отменился?",
  "Как связаться с владельцем?",
];

// Message type
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

// Chat history for API
type ChatHistory = {
  role: "user" | "assistant";
  content: string;
}[];

// LocalStorage persistence
const CHAT_STORAGE_KEY = "support-chat-history";
const CHAT_TTL_MS = 60 * 60 * 1000; // 1 час

type StoredChat = {
  messages: Message[];
  savedAt: number;
};

function loadChatHistory(): Message[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return [];

    const data: StoredChat = JSON.parse(stored);

    // Проверка TTL
    if (Date.now() - data.savedAt > CHAT_TTL_MS) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return [];
    }

    // Восстанавливаем Date объекты
    return data.messages.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

function saveChatHistory(messages: Message[]) {
  if (typeof window === "undefined") return;

  const data: StoredChat = {
    messages,
    savedAt: Date.now(),
  };

  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(data));
}

// Chat bubble component
function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] px-4 py-3 rounded-2xl",
          isUser
            ? [
                "bg-gradient-to-b from-[#4da6ff] via-[#2196ff] to-[#0A84FF]",
                "text-white",
                "rounded-br-md",
                "shadow-[0_2px_8px_rgba(10,132,255,0.35)]",
              ]
            : [
                "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                "text-white/80",
                "border border-glass",
                "rounded-bl-md",
                "shadow-glass-sm",
              ]
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
        <p className={cn("text-2xs mt-1.5", isUser ? "text-white/60" : "text-white/40")}>
          {message.timestamp.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
}

export default function SupportPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check premium status
  const isPremium = useMemo(
    () =>
      user?.isVibePlus ||
      user?.subscriptionTier === "premium" ||
      user?.subscriptionTier === "top_floor_boss",
    [user]
  );

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = loadChatHistory();
    if (saved.length > 0) {
      setMessages(saved);
    }
  }, []);

  // Save chat history to localStorage on change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatHistory(messages);
    }
  }, [messages]);

  // Scroll to bottom when new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Send message to AI API with streaming
  const sendMessage = async (userMessage: string) => {
    setIsTyping(true);

    // Build chat history for context (last 10 messages)
    const history: ChatHistory = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Create placeholder message for streaming response
    const aiMessageId = `ai-${Date.now()}`;
    const aiMessage: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    try {
      const response = await fetch("/api/client/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ошибка сервера");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming не поддерживается");

      const decoder = new TextDecoder();
      let fullContent = "";

      // Add empty message first
      setMessages((prev) => [...prev, aiMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                // Update message content in real-time
                setMessages((prev) =>
                  prev.map((m) => (m.id === aiMessageId ? { ...m, content: fullContent } : m))
                );
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Произошла ошибка";

      // Show error as AI response
      const errorResponse: Message = {
        id: aiMessageId,
        role: "assistant",
        content: `${errorMessage}\n\nПопробуй позже или напиши владельцу в Telegram: @avitofammanager`,
        timestamp: new Date(),
      };

      setMessages((prev) => {
        // Replace the placeholder message or add new one
        const hasPlaceholder = prev.some((m) => m.id === aiMessageId);
        if (hasPlaceholder) {
          return prev.map((m) => (m.id === aiMessageId ? errorResponse : m));
        }
        return [...prev, errorResponse];
      });
    } finally {
      setIsTyping(false);
    }
  };

  // Handle send message
  const handleSend = () => {
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    sendMessage(input.trim());
  };

  // Handle quick question
  const handleQuickQuestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Поддержка</h1>
        <p className="text-sm text-white/60">
          {isPremium ? "AI-ассистент и FAQ" : "Частые вопросы"}
        </p>
      </motion.div>

      {/* Premium AI Chat */}
      {isPremium ? (
        <div className="flex flex-col min-h-[400px] mb-6">
          {/* Chat messages */}
          <div
            className={cn(
              "flex-1 overflow-y-auto mb-4 rounded-2xl p-4",
              "bg-gradient-to-b from-white/[0.06] to-white/[0.02]",
              "border border-glass"
            )}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-accent-blue/20 flex items-center justify-center mb-4">
                  <span className="text-3xl">🤖</span>
                </div>
                <h3 className="text-base font-semibold text-white mb-2">AI-ассистент</h3>
                <p className="text-sm text-white/40 max-w-xs">
                  Задайте вопрос или выберите из быстрых вопросов ниже
                </p>

                {/* Quick questions */}
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickQuestion(q)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs",
                        "bg-white/[0.08] border border-glass-subtle",
                        "text-white/60 hover:text-white hover:bg-white/[0.12]",
                        "transition-colors"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <ChatBubble key={message.id} message={message} />
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-4 py-3"
                  >
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 rounded-full bg-white/40"
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-white/40">AI печатает...</span>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div
            className={cn(
              "flex items-center gap-2 p-3 rounded-2xl",
              "bg-gradient-to-b from-white/[0.10] to-white/[0.05]",
              "border border-glass-active"
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Напишите вопрос..."
              rows={1}
              className={cn(
                "flex-1 bg-transparent resize-none",
                "text-white placeholder:text-white/40",
                "focus:outline-none",
                "text-sm leading-relaxed"
              )}
              style={{ maxHeight: "120px" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center self-end",
                "bg-gradient-to-b from-[#4da6ff] via-[#2196ff] to-[#0A84FF]",
                "text-white",
                "shadow-[0_2px_8px_rgba(10,132,255,0.35)]",
                "transition-all duration-200",
                "hover:shadow-[0_4px_12px_rgba(10,132,255,0.4)]",
                "active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* Non-premium: Show upgrade banner */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "relative mb-6 p-4 rounded-2xl overflow-hidden",
            "bg-gradient-to-br from-accent-blue/15 to-accent-blue/8",
            "border border-accent-blue/20",
            "shadow-[0_4px_24px_rgba(10,132,255,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]"
          )}
        >
          {/* Декоративный блик */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-accent-blue/30 to-transparent" />
          <div className="flex items-center gap-4 relative">
            <div
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                "bg-gradient-to-br from-accent-blue/25 to-accent-blue/15",
                "border border-accent-blue/30",
                "shadow-glass-inset"
              )}
            >
              <span className="text-2xl">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">AI-ассистент</h3>
              <p className="text-xs text-white/60 mt-0.5">Получите мгновенные ответы с Premium</p>
            </div>
            <Button size="sm" onClick={() => router.push("/profile")}>
              Подробнее
            </Button>
          </div>
        </motion.div>
      )}

      {/* FAQ Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-lg font-semibold text-white mb-3">Частые вопросы</h2>
        <Accordion type="single" variant="separated">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} id={item.id}>
              <AccordionTrigger id={item.id}>
                <span className="text-sm font-medium text-white/80">{item.question}</span>
              </AccordionTrigger>
              <AccordionContent id={item.id}>
                <div className="p-3 rounded-xl bg-white/[0.04] border border-glass-subtle">
                  <p className="text-sm text-white/60">{item.answer}</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>

      {/* Contact section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={cn(
          "relative mt-6 p-4 rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card"
        )}
      >
        {/* Декоративный блик */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="flex items-center gap-4 relative">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-accent-telegram/20 to-accent-telegram/10",
              "border border-accent-telegram/30",
              "shadow-glass-inset"
            )}
          >
            <svg className="w-6 h-6 text-accent-telegram" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">Связаться напрямую</h3>
            <p className="text-xs text-white/40 mt-0.5">Напишите владельцу в Telegram</p>
          </div>
          <a
            href="https://t.me/avitofammanager"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "px-4 py-2 rounded-xl flex-shrink-0",
              "bg-accent-telegram/20 border border-accent-telegram/30",
              "text-accent-telegram text-sm font-medium",
              "hover:bg-accent-telegram/30 transition-colors"
            )}
          >
            Написать
          </a>
        </div>
      </motion.div>
    </main>
  );
}
