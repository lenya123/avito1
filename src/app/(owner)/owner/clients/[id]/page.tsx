"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerClient, useClientAction } from "@/hooks/use-owner-clients";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ErrorState,
  Input,
  Modal,
  Skeleton,
} from "@/components/ui";
import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
} from "@/lib/constants/order-status";
import {
  FreezeControls,
  BalanceControls,
  PendingVibePaymentsSection,
  BalanceHistorySection,
} from "@/components/owner/clients";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export default function OwnerClientDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const { data, isLoading, error, refetch } = useOwnerClient(id);
  const { mutate: updateClient, isPending } = useClientAction(id);

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [notesDraft, setNotesDraft] = useState("");

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить данные клиента"
          onRetry={refetch}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    customer: c,
    stats,
    recentOrders,
    pendingVibePayments,
    balanceHistory,
    debtByRecipient,
  } = data;
  const overLimit = c.vibeEnabled && c.effectiveLimit > 0 && c.debt >= 0.9 * c.effectiveLimit;

  const handleToggleVibe = () => updateClient({ vibeEnabled: !c.vibeEnabled });
  const handleBlock = () =>
    updateClient(
      { isBlocked: true, blockedReason: blockReason.trim() || null },
      {
        onSuccess: () => {
          setShowBlockModal(false);
          setBlockReason("");
        },
      }
    );
  const handleUnblock = () => updateClient({ isBlocked: false, blockedReason: null });
  const handleUpdateLimit = () => {
    const limit = newLimit === "" ? null : Number(newLimit);
    if (limit != null && (isNaN(limit) || limit < 0)) return;
    updateClient(
      { vibeCreditLimitOverride: limit },
      {
        onSuccess: () => {
          setShowLimitModal(false);
          setNewLimit("");
        },
      }
    );
  };
  const handleSaveNotes = () =>
    updateClient(
      { notes: notesDraft.trim() || null },
      { onSuccess: () => setShowNotesModal(false) }
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Back button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Назад к списку
        </button>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center gap-4"
      >
        <Avatar name={c.telegramUsername || c.name || "?"} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">
              {c.name || (c.telegramUsername ? `@${c.telegramUsername}` : "Без имени")}
            </h1>
            {c.vibeEnabled && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-blue-500/20 to-blue-500/10 border border-blue-500/25 text-accent-blue">
                +ВАЙБ
              </span>
            )}
            {c.isFrozen && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/25 text-accent-orange">
                Заморожен
              </span>
            )}
            {c.isBlocked && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-red-500/20 to-red-500/10 border border-red-500/25 text-accent-red">
                Заблокирован
              </span>
            )}
          </div>
          <p className="text-white/60">
            {c.telegramUsername ? `@${c.telegramUsername}` : `tg:${c.tgUserId}`}
            {c.phone && ` · ${c.phone}`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {c.telegramUsername && (
            <a
              href={`https://t.me/${c.telegramUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-gradient-to-b from-blue-500/20 to-blue-500/10 border border-blue-500/25 text-accent-blue hover:from-blue-500/30 hover:to-blue-500/15 transition-colors"
              title="Написать в Telegram"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.686c.223-.198-.054-.308-.346-.11l-6.4 4.02-2.76-.918c-.6-.187-.612-.6.125-.89l10.782-4.156c.5-.18.94.12.78.89z" />
              </svg>
            </a>
          )}

          <Button
            variant={c.vibeEnabled ? "secondary" : "primary"}
            size="sm"
            onClick={handleToggleVibe}
            isLoading={isPending}
          >
            {c.vibeEnabled ? "Убрать +ВАЙБ" : "Выдать +ВАЙБ"}
          </Button>

          <FreezeControls
            customerId={c.id}
            vibeEnabled={c.vibeEnabled}
            isFrozen={c.isFrozen}
            currentDebt={c.debt}
            requiredPaymentAmount={c.requiredPaymentAmount ?? null}
            frozenReason={c.frozenReason ?? null}
            onChanged={refetch}
          />

          {c.isBlocked ? (
            <Button variant="secondary" size="sm" onClick={handleUnblock} isLoading={isPending}>
              Разблокировать
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setShowBlockModal(true)}>
              Заблокировать
            </Button>
          )}
        </div>
      </motion.div>

      {/* Main info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Информация</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Telegram ID</p>
                <p className="text-white">{c.tgUserId}</p>
              </div>
              {c.telegramUsername && (
                <div>
                  <p className="text-xs text-white/40 mb-1">@username</p>
                  <p className="text-white">@{c.telegramUsername}</p>
                </div>
              )}
              {c.phone && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Телефон</p>
                  <p className="text-white">{c.phone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/40 mb-1">Дата регистрации</p>
                <p className="text-white">{new Date(c.createdAt).toLocaleDateString("ru-RU")}</p>
              </div>
              <div className="pt-3 border-t border-glass">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-white/40">Заметка владельца</p>
                  <button
                    onClick={() => {
                      setNotesDraft(c.notes || "");
                      setShowNotesModal(true);
                    }}
                    className="text-xs text-accent-blue hover:text-accent-blue/80"
                  >
                    {c.notes ? "Изменить" : "Добавить"}
                  </button>
                </div>
                <p className="text-sm text-white/80 whitespace-pre-wrap">
                  {c.notes || <span className="text-white/30">—</span>}
                </p>
              </div>
              {c.isBlocked && c.blockedReason && (
                <div className="pt-3 border-t border-glass">
                  <p className="text-xs text-accent-red mb-1">Причина блокировки</p>
                  <p className="text-sm text-white">{c.blockedReason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Finance / +ВАЙБ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Финансы</h3>
              {c.vibeEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewLimit(
                      c.vibeCreditLimitOverride != null ? String(c.vibeCreditLimitOverride) : ""
                    );
                    setShowLimitModal(true);
                  }}
                >
                  Изменить лимит
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <BalanceControls
                customerId={c.id}
                customerBalance={c.customerBalance}
                onChanged={refetch}
              />
              <div className="pt-3 border-t border-glass">
                <p className="text-xs text-white/40 uppercase tracking-wide mb-3">+ВАЙБ-кредит</p>
              </div>
              {!c.vibeEnabled ? (
                <p className="text-white/50 text-sm">
                  +ВАЙБ отключён. Клиент не может брать заказы в долг. Нажмите «Выдать +ВАЙБ» в
                  шапке страницы.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Текущий долг</p>
                    <p
                      className={`text-xl font-bold ${
                        overLimit ? "text-accent-red" : "text-white"
                      }`}
                    >
                      {formatRub(c.debt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Лимит</p>
                    <p className="text-white">{formatRub(c.effectiveLimit)}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {c.vibeCreditLimitOverride != null ? "индивидуальный" : "дефолт из настроек"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Доступно ещё</p>
                    <p
                      className={`text-xl font-bold ${
                        c.effectiveLimit - c.debt > 0 ? "text-accent-green" : "text-accent-red"
                      }`}
                    >
                      {formatRub(Math.max(0, c.effectiveLimit - c.debt))}
                    </p>
                  </div>
                  {c.isFrozen && (
                    <div className="p-3 rounded-lg bg-gradient-to-b from-orange-500/15 to-orange-500/5 border border-orange-500/20">
                      <p className="text-sm text-accent-orange">
                        Автозаморожен
                        {c.frozenAt && <> {new Date(c.frozenAt).toLocaleDateString("ru-RU")}</>}.
                      </p>
                      <p className="text-xs text-white/60 mt-1">
                        Разморозится автоматически, когда долг опустится ниже лимита.
                      </p>
                    </div>
                  )}
                  {debtByRecipient.length > 0 && (
                    <div className="pt-3 border-t border-glass">
                      <p className="text-xs text-white/40 uppercase tracking-wide mb-2">
                        Кому должен
                      </p>
                      <div className="space-y-1">
                        {debtByRecipient.map((row) => (
                          <div
                            key={row.partnerId ?? "owner"}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-white/80 truncate pr-2">
                              {row.recipientType === "owner"
                                ? "🏠 Свой склад"
                                : `🤝 ${row.partnerName ?? "Партнёр"}`}
                            </span>
                            <span className="text-white font-medium shrink-0">
                              {formatRub(row.debt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Статистика</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/40 mb-1">Всего заказов</p>
                  <p className="text-xl font-bold text-white">{stats.total}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Завершённых</p>
                  <p className="text-xl font-bold text-accent-green">{stats.completed}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Отменённых</p>
                  <p className="text-xl font-bold text-white/60">{stats.cancelled}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Возвратов</p>
                  <p className="text-xl font-bold text-accent-orange">{stats.returns}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-glass">
                <div>
                  <p className="text-xs text-white/40 mb-1">Вложено</p>
                  <p className="text-xl font-bold text-white">{formatRub(stats.invested)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Выручка</p>
                  <p className="text-xl font-bold text-white">{formatRub(stats.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Средний чек</p>
                  <p className="text-xl font-bold text-white">{formatRub(stats.avgCheck)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Прибыль</p>
                  <p
                    className={`text-xl font-bold ${
                      stats.profit >= 0 ? "text-accent-green" : "text-accent-red"
                    }`}
                  >
                    {stats.profit >= 0 ? "+" : ""}
                    {formatRub(stats.profit)}
                    <span className="text-sm font-normal text-white/40 ml-1">({stats.roi}%)</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Pending vibe-payments — confirm/reject UI */}
      <PendingVibePaymentsSection customerId={c.id} payments={pendingVibePayments} />

      {/* История движений баланса (последние 5 + модалка с полной) */}
      <BalanceHistorySection customerId={c.id} recentHistory={balanceHistory} />

      {/* Recent orders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="font-semibold text-white">Последние заказы</h3>
            <Link
              href={`/owner/orders?clientId=${id}`}
              className="text-sm text-accent-blue hover:text-accent-blue/80"
            >
              Все заказы
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-white/60 text-center py-4">Нет заказов</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/owner/orders/${order.id}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.08] shrink-0">
                      {order.productPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={order.productPhoto}
                          alt={order.productName || ""}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-white/40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">#{order.orderNumber}</span>
                        <Badge
                          variant={
                            STATUS_VARIANTS[order.status as keyof typeof STATUS_VARIANTS] ||
                            "default"
                          }
                          size="sm"
                        >
                          {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS] ||
                            order.status}
                        </Badge>
                        {!order.isPaid && (
                          <Badge variant="warning" size="sm">
                            не оплачен
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-white/60 truncate">
                        {order.productName || "Товар удалён"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-white">
                        {formatRub(order.clientPrice)}
                      </p>
                      <p className="text-xs text-white/40">
                        {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Block modal */}
      <Modal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title="Заблокировать клиента"
      >
        <div className="space-y-4">
          <p className="text-white/60">
            Клиент больше не сможет оформлять новые заказы. Уже открытые заказы продолжатся без
            изменений.
          </p>
          <Input
            label="Причина блокировки"
            placeholder="Укажите причину (для внутренней заметки)..."
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowBlockModal(false)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={handleBlock} isLoading={isPending}>
              Заблокировать
            </Button>
          </div>
        </div>
      </Modal>

      {/* Limit modal */}
      <Modal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        title="Изменить лимит +ВАЙБ"
      >
        <div className="space-y-4">
          <Input
            label="Индивидуальный лимит (₽, пусто = дефолт из настроек)"
            type="number"
            placeholder={String(c.effectiveLimit)}
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
          />
          <p className="text-xs text-white/50">
            Текущий: {formatRub(c.effectiveLimit)} (
            {c.vibeCreditLimitOverride != null ? "индивидуальный" : "дефолт из настроек"}).
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowLimitModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleUpdateLimit} isLoading={isPending}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Notes modal */}
      <Modal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        title="Заметка о клиенте"
      >
        <div className="space-y-4">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Внутренняя заметка (клиенту не видна)"
            className="w-full rounded-xl bg-white/[0.04] border border-glass px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-glass-active resize-none"
          />
          <div className="flex gap-3 justify-end">
            <Button variant="ghost" onClick={() => setShowNotesModal(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveNotes} isLoading={isPending}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
