"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Button, Modal, Badge } from "@/components/ui";
import {
  useOwnerProxies,
  useAddProxies,
  useDeleteProxy,
  useToggleProxy,
  type ProxyItem,
} from "@/hooks/use-owner-proxies";

// =====================================================
// Summary Card
// =====================================================

function SummaryCard({
  value,
  label,
  color = "text-white",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-sm text-white/60">{label}</p>
    </div>
  );
}

// =====================================================
// Proxy Row
// =====================================================

function ProxyRow({
  proxy,
  index,
  onDelete,
  onToggle,
}: {
  proxy: ProxyItem;
  index: number;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  // Извлекаем хост из URL для отображения
  let displayHost = proxy.proxyUrl;
  try {
    const url = new URL(proxy.proxyUrl);
    displayHost = `${url.hostname}:${url.port}`;
  } catch {
    // оставляем как есть
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl shadow-card hover:border-white/20 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <p className="font-medium text-white truncate font-mono text-sm">{displayHost}</p>
            <Badge
              variant={proxy.isActive ? (proxy.assignedTo ? "info" : "success") : "default"}
              size="sm"
            >
              {proxy.assignedTo ? "Назначен" : proxy.isActive ? "Свободен" : "Отключён"}
            </Badge>
          </div>

          {proxy.assignedSession && (
            <p className="text-xs text-white/40">
              {proxy.assignedSession.avitoLogin || "Аккаунт"} · Слот{" "}
              {proxy.assignedSession.accountIndex} ·{" "}
              <span
                className={cn(
                  proxy.assignedSession.status === "active"
                    ? "text-green-400"
                    : proxy.assignedSession.status === "expired"
                      ? "text-orange-400"
                      : "text-white/40"
                )}
              >
                {proxy.assignedSession.status}
              </span>
            </p>
          )}

          {!proxy.assignedTo && (
            <p className="text-xs text-white/40">
              Добавлен {new Date(proxy.createdAt).toLocaleDateString("ru-RU")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Toggle active */}
          <button
            onClick={() => onToggle(proxy.id, !proxy.isActive)}
            className={cn(
              "p-2 rounded-xl transition-colors",
              proxy.isActive
                ? "text-green-400 hover:bg-green-500/10"
                : "text-white/40 hover:bg-white/[0.06]"
            )}
            title={proxy.isActive ? "Отключить" : "Включить"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  proxy.isActive
                    ? "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 9v2m0 4h.01"
                    : "M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728m2.828 9.9a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M13 12a1 1 0 11-2 0 1 1 0 012 0z"
                }
              />
            </svg>
          </button>

          {/* Delete (только если не назначен) */}
          {!proxy.assignedTo && (
            <button
              onClick={() => onDelete(proxy.id)}
              className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Удалить"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// =====================================================
// Skeleton
// =====================================================

function ProxySkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-white/10 rounded w-48" />
          <div className="h-3 bg-white/10 rounded w-32" />
        </div>
        <div className="flex gap-1">
          <div className="w-9 h-9 bg-white/10 rounded-xl" />
          <div className="w-9 h-9 bg-white/10 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Add Proxies Modal
// =====================================================

function AddProxiesModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<{
    added: number;
    duplicates: number;
    failed: string[];
  } | null>(null);

  const addProxies = useAddProxies();

  const handleSubmit = async () => {
    if (!rawText.trim()) return;
    setResult(null);

    try {
      const res = await addProxies.mutateAsync(rawText);
      setResult({
        added: res.added,
        duplicates: res.duplicates,
        failed: res.failed,
      });
      if (res.added > 0 && res.failed.length === 0) {
        setTimeout(() => {
          setRawText("");
          setResult(null);
          onClose();
        }, 1500);
      }
    } catch {
      // ошибка покажется через addProxies.error
    }
  };

  const handleClose = () => {
    setRawText("");
    setResult(null);
    onClose();
  };

  const lineCount = rawText
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Добавить прокси">
      <div className="space-y-4">
        <p className="text-sm text-white/60">
          Вставьте прокси по одному на строку. Поддерживаемые форматы:
        </p>

        <div className="space-y-1">
          <div className="flex gap-2 flex-wrap">
            {["ip:port:login:pass", "login:pass@ip:port", "http://login:pass@ip:port"].map(
              (fmt) => (
                <code
                  key={fmt}
                  className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-xs text-white/80 font-mono"
                >
                  {fmt}
                </code>
              )
            )}
          </div>
        </div>

        <div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`185.12.34.56:8080:user1:pass1\n185.12.34.57:8080:user2:pass2\n185.12.34.58:8080:user3:pass3`}
            rows={8}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.08] border border-glass text-white text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-accent-blue/20 resize-none"
          />
          {lineCount > 0 && (
            <p className="text-xs text-white/40 mt-1">{lineCount} прокси для добавления</p>
          )}
        </div>

        {/* Результат */}
        {result && (
          <div
            className={cn(
              "p-3 rounded-xl text-sm",
              result.added > 0
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : "bg-orange-500/10 border border-orange-500/20 text-orange-400"
            )}
          >
            {result.added > 0 && <p>Добавлено: {result.added}</p>}
            {result.duplicates > 0 && <p>Дубликаты (пропущены): {result.duplicates}</p>}
            {result.failed.length > 0 && (
              <div>
                <p>Не распознаны:</p>
                {result.failed.map((line, i) => (
                  <code key={i} className="block text-xs font-mono text-red-400">
                    {line}
                  </code>
                ))}
              </div>
            )}
          </div>
        )}

        {addProxies.error && (
          <p className="text-sm text-red-400">{addProxies.error.message}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} className="flex-1">
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={addProxies.isPending}
            disabled={!rawText.trim()}
            className="flex-1"
          >
            Добавить {lineCount > 0 ? `(${lineCount})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// =====================================================
// Page
// =====================================================

export default function OwnerProxiesPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "free" | "assigned" | "inactive">("all");

  const { data, isLoading, error, refetch } = useOwnerProxies();
  const deleteProxy = useDeleteProxy();
  const toggleProxy = useToggleProxy();

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить прокси?")) return;
    try {
      await deleteProxy.mutateAsync(id);
    } catch {
      // ошибка через toast
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await toggleProxy.mutateAsync({ proxyId: id, isActive: active });
    } catch {
      // ошибка через toast
    }
  };

  const filteredProxies = (data?.proxies ?? []).filter((p) => {
    if (filter === "free") return p.isActive && !p.assignedTo;
    if (filter === "assigned") return !!p.assignedTo;
    if (filter === "inactive") return !p.isActive;
    return true;
  });

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="text-center py-12">
          <p className="text-white/60 mb-4">Не удалось загрузить прокси</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Прокси</h1>
          <p className="text-white/60 text-sm">Управление IPv4 прокси для Avito аккаунтов</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Добавить
        </Button>
      </motion.div>

      {/* Summary */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <SummaryCard value={data.summary.total} label="Всего" />
          <SummaryCard value={data.summary.free} label="Свободных" color="text-green-400" />
          <SummaryCard value={data.summary.assigned} label="Назначено" color="text-accent-blue" />
          <SummaryCard value={data.summary.inactive} label="Отключено" color="text-white/40" />
        </motion.div>
      )}

      {/* Low proxy warning */}
      {data && data.summary.free <= 2 && data.summary.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20"
        >
          <p className="text-sm text-orange-400">
            ⚠ Осталось {data.summary.free} свободных прокси. Новые пользователи не смогут подключить Avito аккаунт без прокси.
          </p>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] w-fit">
          {(
            [
              { value: "all", label: "Все" },
              { value: "free", label: "Свободные" },
              { value: "assigned", label: "Назначенные" },
              { value: "inactive", label: "Отключённые" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                filter === option.value
                  ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "text-white/60 hover:text-white"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-3"
      >
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <ProxySkeleton key={i} />)
        ) : filteredProxies.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.06] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white/20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-white/60 mb-1">
              {filter === "all" ? "Прокси не добавлены" : "Нет прокси в этой категории"}
            </p>
            {filter === "all" && (
              <p className="text-white/40 text-sm mb-4">
                Купите прокси и вставьте сюда для автоматического назначения
              </p>
            )}
            {filter === "all" && (
              <Button variant="secondary" onClick={() => setShowAddModal(true)}>
                Добавить прокси
              </Button>
            )}
          </div>
        ) : (
          filteredProxies.map((proxy, index) => (
            <ProxyRow
              key={proxy.id}
              proxy={proxy}
              index={index}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))
        )}
      </motion.div>

      {/* Count */}
      {filteredProxies.length > 0 && (
        <p className="text-xs text-white/40 text-center">
          Показано: {filteredProxies.length} из {data?.summary.total ?? 0}
        </p>
      )}

      {/* Modal */}
      <AddProxiesModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
