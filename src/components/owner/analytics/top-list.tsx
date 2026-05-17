"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface TopProduct {
  id: string;
  name: string;
  photo: string | null;
  orders: number;
  revenue: number;
}

interface TopClient {
  id: string;
  username: string | null;
  name: string | null;
  orders: number;
  revenue: number;
}

interface TopProductsListProps {
  products: TopProduct[];
}

interface TopClientsListProps {
  clients: TopClient[];
}

export function TopProductsList({ products }: TopProductsListProps) {
  if (products.length === 0) {
    return <p className="text-center text-white/40 py-8">Нет данных</p>;
  }

  return (
    <div className="space-y-2">
      {products.map((product, index) => (
        <motion.div
          key={product.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
        >
          <span className="text-sm text-white/40 w-6">{index + 1}</span>
          <div className="w-10 h-10 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass overflow-hidden flex-shrink-0">
            {product.photo ? (
              <img src={product.photo} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{product.name}</p>
            <p className="text-xs text-white/60">{product.orders} заказов</p>
          </div>
          <p className="text-sm font-medium text-accent-green">
            {product.revenue.toLocaleString()} ₽
          </p>
        </motion.div>
      ))}
    </div>
  );
}

export function TopClientsList({ clients }: TopClientsListProps) {
  if (clients.length === 0) {
    return <p className="text-center text-white/40 py-8">Нет данных</p>;
  }

  return (
    <div className="space-y-2">
      {clients.map((client, index) => (
        <motion.div
          key={client.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Link
            href={`/owner/clients/${client.id}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <span className="text-sm text-white/40 w-6">{index + 1}</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-b from-purple-500/30 to-purple-500/15 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-accent-purple text-sm font-medium">
                {(client.username || client.name || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                @{client.username || client.name || "\u2014"}
              </p>
              <p className="text-xs text-white/60">{client.orders} заказов</p>
            </div>
            <p className="text-sm font-medium text-accent-green">
              {client.revenue.toLocaleString()} ₽
            </p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export function TopListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <div className="w-6 h-4 bg-white/10 rounded" />
          <div className="w-10 h-10 bg-white/10 rounded-lg" />
          <div className="flex-1 space-y-1">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-3 w-20 bg-white/10 rounded" />
          </div>
          <div className="h-4 w-16 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
