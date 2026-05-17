"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, Skeleton, Badge } from "@/components/ui";

interface RecentOrdersCardProps {
  orders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    price: number;
    createdAt: string;
    productName: string;
    productPhoto: string | null;
    clientUsername: string | null;
  }>;
}

import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
} from "@/lib/constants/order-status";

export function RecentOrdersCard({ orders }: RecentOrdersCardProps) {
  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Последние заказы</h3>
        </CardHeader>
        <CardContent>
          <p className="text-center text-white/40 py-8">Нет заказов</p>
        </CardContent>
      </Card>
    );
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (minutes < 60) {
      return `${minutes} мин назад`;
    }
    if (hours < 24) {
      return `${hours} ч назад`;
    }
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Последние заказы</h3>
        <Link
          href="/owner/orders"
          className="text-sm text-accent-purple hover:text-accent-purple/80"
        >
          Все заказы
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/owner/orders/${order.id}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.08] border border-glass">
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
                      STATUS_VARIANTS[order.status as keyof typeof STATUS_VARIANTS] || "default"
                    }
                    size="sm"
                  >
                    {STATUS_LABELS[order.status as keyof typeof STATUS_LABELS] || order.status}
                  </Badge>
                </div>
                <p className="text-xs text-white/60 truncate">
                  @{order.clientUsername || "unknown"} • {order.productName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  {order.price.toLocaleString("ru-RU")} ₽
                </p>
                <p className="text-xs text-white/40">{formatTime(order.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecentOrdersCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="text-right">
                <Skeleton className="h-4 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
