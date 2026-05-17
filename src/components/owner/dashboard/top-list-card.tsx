"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, Skeleton, Avatar } from "@/components/ui";

interface TopProductsCardProps {
  products: Array<{
    id: string;
    name: string;
    photo: string | null;
    orders: number;
    revenue: number;
  }>;
}

export function TopProductsCard({ products }: TopProductsCardProps) {
  if (products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Топ товаров</h3>
        </CardHeader>
        <CardContent>
          <p className="text-center text-white/40 py-8">Нет данных за период</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Топ товаров</h3>
        <Link
          href="/owner/products"
          className="text-sm text-accent-purple hover:text-accent-purple/80"
        >
          Все товары
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.map((product, index) => (
            <Link
              key={product.id}
              href={`/owner/products/${product.id}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-sm font-medium text-white/40 w-4">{index + 1}</span>
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.08] border border-glass">
                {product.photo ? (
                  <img
                    src={product.photo}
                    alt={product.name}
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
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{product.name}</p>
                <p className="text-xs text-white/60">{product.orders} заказов</p>
              </div>
              <span className="text-sm font-medium text-accent-green">
                {product.revenue.toLocaleString("ru-RU")} ₽
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface TopClientsCardProps {
  clients: Array<{
    id: string;
    username: string | null;
    orders: number;
    revenue: number;
  }>;
}

export function TopClientsCard({ clients }: TopClientsCardProps) {
  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Топ клиентов</h3>
        </CardHeader>
        <CardContent>
          <p className="text-center text-white/40 py-8">Нет данных за период</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Топ клиентов</h3>
        <Link
          href="/owner/clients"
          className="text-sm text-accent-purple hover:text-accent-purple/80"
        >
          Все клиенты
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {clients.map((client, index) => (
            <Link
              key={client.id}
              href={`/owner/clients/${client.id}`}
              className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <span className="text-sm font-medium text-white/40 w-4">{index + 1}</span>
              <Avatar name={client.username || "U"} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  @{client.username || "unknown"}
                </p>
                <p className="text-xs text-white/60">{client.orders} заказов</p>
              </div>
              <span className="text-sm font-medium text-accent-green">
                {client.revenue.toLocaleString("ru-RU")} ₽
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TopListCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
