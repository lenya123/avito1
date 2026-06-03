"use client";

/**
 * Inline-секция настроек: для каждого типа уведомления переключатель
 * «Владелец / Директор». Если директор не привязан, выбор «Директор»
 * автоматически фоллбэчит на владельца с пометкой в самом сообщении.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, Button } from "@/components/ui";

type Recipient = "owner" | "director";

interface RoutesResponse {
  routes: Record<string, Recipient>;
  labels: Record<string, string>;
}

export function NotificationRoutingSection() {
  const [data, setData] = useState<RoutesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/notification-routes");
      if (!res.ok) throw new Error("Ошибка загрузки");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setRecipient = async (key: string, recipient: Recipient) => {
    if (!data || data.routes[key] === recipient) return;
    setBusy(key);
    // optimistic
    setData((prev) => (prev ? { ...prev, routes: { ...prev.routes, [key]: recipient } } : prev));
    try {
      const res = await fetch("/api/owner/notification-routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: recipient }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      // откат
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.105 }}
      className="space-y-3"
    >
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
        🔔 Кому какие уведомления
      </h2>
      <Card>
        {loading ? (
          <div className="text-sm text-white/50">Загружаем…</div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-accent-red">{error}</p>
            <Button variant="ghost" onClick={load} size="sm">
              Повторить
            </Button>
          </div>
        ) : data ? (
          <div className="space-y-3">
            <p className="text-sm text-white/60">
              Выбери, кому приходит каждое уведомление. Если директор не привязан, всё равно придёт
              владельцу с пометкой.
            </p>

            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 text-sm">
              <div className="text-xs uppercase tracking-wider text-white/40 self-end pb-1">
                Тип
              </div>
              <div className="text-xs uppercase tracking-wider text-white/40 text-center pb-1">
                👑 Владелец
              </div>
              <div className="text-xs uppercase tracking-wider text-white/40 text-center pb-1">
                🤝 Директор
              </div>

              {Object.entries(data.labels).map(([key, label]) => (
                <RoutingRow
                  key={key}
                  routeKey={key}
                  label={label}
                  recipient={data.routes[key]}
                  busy={busy === key}
                  onChange={(r) => setRecipient(key, r)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </motion.section>
  );
}

function RoutingRow({
  routeKey,
  label,
  recipient,
  busy,
  onChange,
}: {
  routeKey: string;
  label: string;
  recipient: Recipient;
  busy: boolean;
  onChange: (r: Recipient) => void;
}) {
  return (
    <>
      <div className="text-white/80 self-center py-1">{label}</div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange("owner")}
        aria-label={`${label} — владельцу`}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors border ${
          recipient === "owner"
            ? "bg-accent-blue border-accent-blue text-white"
            : "bg-white/[0.04] border-white/10 text-white/30 hover:text-white/60"
        } ${busy ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
      >
        {recipient === "owner" ? "●" : "○"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange("director")}
        aria-label={`${label} — директору`}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors border ${
          recipient === "director"
            ? "bg-accent-green border-accent-green text-white"
            : "bg-white/[0.04] border-white/10 text-white/30 hover:text-white/60"
        } ${busy ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
      >
        {recipient === "director" ? "●" : "○"}
      </button>
    </>
  );
}
