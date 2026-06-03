"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Input, Spinner } from "@/components/ui";
import { CatalogProductCard } from "@/components/catalog/catalog-product-card";
import { CatalogProductModal } from "@/components/catalog/catalog-product-modal";
import type { CatalogProduct } from "@/components/catalog/types";

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/catalog", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((data: { items: CatalogProduct[] }) => {
        if (cancelled) return;
        setProducts(data.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[catalog] list error:", err);
        setError("Не удалось загрузить каталог. Попробуй обновить страницу.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const haystack = [p.name, p.category ?? "", p.description ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [products, search]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Каталог</h1>
          <p className="mt-1 text-sm text-gray-600 sm:text-base">
            Дроп-цены, рекомендуемые цены для Авито, размеры и замеры. Нажми на товар — увидишь
            подробности и сможешь скачать фото для своих объявлений.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Input
          placeholder="Поиск по названию или категории…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full"
        />

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-20 text-center text-sm text-gray-500">
            {products.length === 0 ? "Каталог пока пуст" : "По запросу ничего не нашлось"}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
            className="mt-5 flex flex-col gap-3"
          >
            {filtered.map((p) => (
              <motion.div
                key={p.id}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                <CatalogProductCard product={p} onClick={setActiveProductId} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <CatalogProductModal
        productId={activeProductId}
        isOpen={activeProductId !== null}
        onClose={() => setActiveProductId(null)}
      />
    </main>
  );
}
