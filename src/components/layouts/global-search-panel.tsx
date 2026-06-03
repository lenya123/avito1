"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Spinner, Input } from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/utils/cn";

interface SearchResults {
  orders: Array<{ id: string; orderNumber: number; status: string; price: number }>;
  products: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; username: string | null; name: string | null }>;
  shippers?: Array<{ id: string; name: string | null; telegramUsername: string | null }>;
}

interface Props {
  searchEndpoint: string;
  basePath: string;
  onClose: () => void;
}

export function GlobalSearchPanel({ searchEndpoint, basePath, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    fetch(`${searchEndpoint}?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setIsSearching(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchEndpoint]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const hasResults =
    results &&
    (results.orders.length > 0 ||
      results.products.length > 0 ||
      results.clients.length > 0 ||
      (results.shippers?.length ?? 0) > 0);

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "fixed top-14 left-4 right-4 z-[60] max-w-md max-h-[70vh] overflow-hidden",
        "lg:top-4 lg:left-[17rem] lg:right-auto lg:w-96",
        "rounded-2xl",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-modal"
      )}
    >
      <div className="px-4 py-3 border-b border-glass-minimal">
        <Input
          type="text"
          placeholder="Заказ, товар, клиент..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="overflow-y-auto max-h-[calc(70vh-64px)]">
        {isSearching ? (
          <div className="p-6 flex justify-center">
            <Spinner size="sm" />
          </div>
        ) : !query || query.length < 2 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-white/40">Введите минимум 2 символа</p>
          </div>
        ) : results && !hasResults ? (
          <div className="p-6 text-center">
            <p className="text-sm text-white/40">Ничего не найдено</p>
          </div>
        ) : results ? (
          <div>
            {results.orders.length > 0 && (
              <SearchSection title="Заказы">
                {results.orders.map((o) => (
                  <SearchItem
                    key={o.id}
                    label={`#${o.orderNumber}`}
                    sublabel={`${o.price.toLocaleString()} ₽`}
                    onClick={() => navigate(`${basePath}/orders/${o.id}`)}
                  />
                ))}
              </SearchSection>
            )}
            {results.products.length > 0 && (
              <SearchSection title="Товары">
                {results.products.map((p) => (
                  <SearchItem
                    key={p.id}
                    label={p.name}
                    onClick={() => navigate(`${basePath}/products/${p.id}`)}
                  />
                ))}
              </SearchSection>
            )}
            {results.clients.length > 0 && (
              <SearchSection title="Клиенты">
                {results.clients.map((c) => (
                  <SearchItem
                    key={c.id}
                    label={c.username ? `@${c.username}` : c.name || "Без имени"}
                    onClick={() => navigate(`${basePath}/clients/${c.id}`)}
                  />
                ))}
              </SearchSection>
            )}
            {results.shippers && results.shippers.length > 0 && (
              <SearchSection title="Отправщики">
                {results.shippers.map((s) => (
                  <SearchItem
                    key={s.id}
                    label={s.name || "Без имени"}
                    sublabel={s.telegramUsername ? `@${s.telegramUsername}` : undefined}
                    onClick={() => navigate(`${basePath}/shippers/${s.id}`)}
                  />
                ))}
              </SearchSection>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function SearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 py-2 text-2xs text-white/40 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function SearchItem({
  label,
  sublabel,
  onClick,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.06] transition-colors text-left"
    >
      <span className="text-sm text-white">{label}</span>
      {sublabel && <span className="text-xs text-white/40">{sublabel}</span>}
    </button>
  );
}
