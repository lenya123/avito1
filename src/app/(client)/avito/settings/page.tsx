"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { BackButton, Button } from "@/components/ui";
import { useRegisterWebhook } from "@/hooks/use-avito";

export default function AvitoSettingsPage() {
  const webhookMutation = useRegisterWebhook();
  const [webhookUrl, setWebhookUrl] = useState("");

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/avito" />
        <h1 className="text-xl font-bold text-white">Настройки Avito</h1>
      </motion.div>

      {/* Webhook Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={cn(
          "rounded-2xl p-4",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl border border-glass shadow-card"
        )}
      >
        <h3 className="text-sm font-semibold text-white">Webhook</h3>
        <p className="text-xs text-white/40 mt-0.5 mb-3">
          Получайте входящие сообщения в реальном времени
        </p>

        <div className="flex gap-2">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-domain.com/api/avito/webhook"
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-sm",
              "bg-white/[0.06] text-white placeholder-white/30",
              "border border-glass-minimal focus:border-accent-blue/50",
              "outline-none transition-colors"
            )}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (webhookUrl.trim()) {
                webhookMutation.mutate(webhookUrl.trim());
              }
            }}
            disabled={!webhookUrl.trim() || webhookMutation.isPending}
          >
            {webhookMutation.isPending ? "..." : "Сохранить"}
          </Button>
        </div>

        {webhookMutation.isSuccess && (
          <p className="text-xs text-accent-green mt-2">Webhook зарегистрирован</p>
        )}
        {webhookMutation.isError && (
          <p className="text-xs text-accent-red mt-2">Ошибка регистрации webhook</p>
        )}
      </motion.div>
    </main>
  );
}
