"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerClient, useClientAction } from "@/hooks/use-owner-clients";
import {
  ErrorState,
  Button,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  Badge,
  Modal,
  Input,
  Skeleton,
} from "@/components/ui";

const TIER_LABELS: Record<string, string> = {
  none: "Free",
  basic: "Basic",
  premium: "Premium",
  top_floor_boss: "Top Floor Boss",
};

import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
} from "@/lib/constants/order-status";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const { data, isLoading, error, refetch } = useOwnerClient(clientId);
  const { mutate: updateClient, isPending } = useClientAction();

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [newLimit, setNewLimit] = useState("");

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

  const { client, stats, recentOrders } = data;
  const debt = client.deposit && client.deposit < 0 ? Math.abs(client.deposit) : 0;
  const available =
    (client.deposit || 0) + (client.referralDeposit || 0) + (client.depositLimit || 0);

  const handleToggleVibePlus = () => {
    updateClient({ clientId, action: "toggle_vibe_plus" });
  };

  const handleBlock = () => {
    updateClient(
      { clientId, action: "block", reason: blockReason },
      { onSuccess: () => setShowBlockModal(false) }
    );
  };

  const handleUnblock = () => {
    updateClient({ clientId, action: "unblock" });
  };

  const handleUpdateLimit = () => {
    const limit = parseInt(newLimit);
    if (!isNaN(limit) && limit >= 0) {
      updateClient(
        { clientId, action: "update_deposit_limit", depositLimit: limit },
        { onSuccess: () => setShowLimitModal(false) }
      );
    }
  };

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
        <Avatar name={client.telegramUsername || client.name || "U"} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">
              @{client.telegramUsername || "unknown"}
            </h1>
            {client.isVibePlus && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/25 text-accent-orange">
                +ВАЙБ
              </span>
            )}
            {client.isBlocked && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-red-500/20 to-red-500/10 border border-red-500/25 text-accent-red">
                Заблокирован
              </span>
            )}
          </div>
          <p className="text-white/60">
            {client.name || "Без имени"} • Уровень {client.level || 0} (
            {client.discountPercent || 0}% скидка)
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <a
            href={`https://t.me/${client.telegramUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-gradient-to-b from-blue-500/20 to-blue-500/10 border border-blue-500/25 text-accent-blue hover:from-blue-500/30 hover:to-blue-500/15 transition-colors"
            title="Написать в Telegram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.548.223l.188-2.85 5.18-4.686c.223-.198-.054-.308-.346-.11l-6.4 4.02-2.76-.918c-.6-.187-.612-.6.125-.89l10.782-4.156c.5-.18.94.12.78.89z" />
            </svg>
          </a>

          <Button
            variant={client.isVibePlus ? "secondary" : "primary"}
            size="sm"
            onClick={handleToggleVibePlus}
            isLoading={isPending}
          >
            {client.isVibePlus ? "Убрать +ВАЙБ" : "Выдать +ВАЙБ"}
          </Button>

          {client.isBlocked ? (
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

      {/* Main content */}
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
                <p className="text-white">{client.telegramId}</p>
              </div>
              {client.email && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Email</p>
                  <p className="text-white">{client.email}</p>
                </div>
              )}
              {client.phone && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Телефон</p>
                  <p className="text-white">{client.phone}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/40 mb-1">Тариф</p>
                <Badge>{TIER_LABELS[client.subscriptionTier || "none"]}</Badge>
                {client.subscriptionEnd && (
                  <p className="text-xs text-white/40 mt-1">
                    до {new Date(client.subscriptionEnd).toLocaleDateString("ru-RU")}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Дата регистрации</p>
                <p className="text-white">
                  {client.createdAt ? new Date(client.createdAt).toLocaleDateString("ru-RU") : "—"}
                </p>
              </div>
              {client.referredBy && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Приглашён</p>
                  <p className="text-white">@{client.referredBy}</p>
                </div>
              )}
              {client.referralsCount > 0 && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Пригласил</p>
                  <p className="text-white">{client.referralsCount} человек</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Finance card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Финансы</h3>
              {client.isVibePlus && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewLimit((client.depositLimit || 0).toString());
                    setShowLimitModal(true);
                  }}
                >
                  Изменить лимит
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Депозит</p>
                <p
                  className={`text-xl font-bold ${(client.deposit || 0) < 0 ? "text-accent-red" : "text-white"}`}
                >
                  {(client.deposit || 0).toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Реферальный бонус</p>
                <p className="text-white">
                  {(client.referralDeposit || 0).toLocaleString("ru-RU")} ₽
                </p>
              </div>
              {client.isVibePlus && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Лимит +ВАЙБ</p>
                  <p className="text-accent-orange">
                    {(client.depositLimit || 0).toLocaleString("ru-RU")} ₽
                  </p>
                </div>
              )}
              <div className="pt-2 border-t border-glass">
                <p className="text-xs text-white/40 mb-1">Доступно</p>
                <p
                  className={`text-xl font-bold ${available < 0 ? "text-accent-red" : "text-accent-green"}`}
                >
                  {available.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              {debt > 0 && (
                <div className="p-3 rounded-lg bg-gradient-to-b from-red-500/15 to-red-500/5 border border-red-500/20">
                  <p className="text-sm text-accent-red">
                    Долг: <span className="font-bold">{debt.toLocaleString("ru-RU")} ₽</span>
                  </p>
                </div>
              )}
              {client.isVibePlus && client.vibePlusGrantedAt && (
                <div className="text-xs text-white/40">
                  +ВАЙБ выдан {new Date(client.vibePlusGrantedAt).toLocaleDateString("ru-RU")}
                  {client.vibePlusGrantedBy && (
                    <>
                      {" "}
                      — @
                      {client.vibePlusGrantedBy.telegram_username || client.vibePlusGrantedBy.name}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Статистика</h3>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <div className="pt-2 border-t border-glass">
                <p className="text-xs text-white/40 mb-1">Выручка</p>
                <p className="text-xl font-bold text-white">
                  {stats.revenue.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Средний чек</p>
                <p className="text-white">{stats.avgCheck.toLocaleString("ru-RU")} ₽</p>
              </div>
              {stats.total > 0 && (
                <div>
                  <p className="text-xs text-white/40 mb-1">% возвратов</p>
                  <p className="text-white">{Math.round((stats.returns / stats.total) * 100)}%</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

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
              href={`/owner/orders?client=${clientId}`}
              className="text-sm text-accent-purple hover:text-accent-purple/80"
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
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.08]">
                      {order.productPhoto ? (
                        <img
                          src={order.productPhoto}
                          alt={order.productName}
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
                      <div className="flex items-center gap-2">
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
                      </div>
                      <p className="text-xs text-white/60 truncate">{order.productName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {order.price.toLocaleString("ru-RU")} ₽
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
            Вы уверены, что хотите заблокировать клиента @{client.telegramUsername}?
          </p>

          <Input
            label="Причина блокировки"
            placeholder="Укажите причину..."
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
            label="Новый лимит (₽)"
            type="number"
            placeholder="100000"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
          />
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
    </div>
  );
}
