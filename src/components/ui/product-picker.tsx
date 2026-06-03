"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

export interface ProductPickerItem {
  id: string;
  name: string;
  photoUrl?: string | null;
}

export interface ProductPickerProps {
  /** Currently selected product id */
  value?: string;
  /** Callback when product is selected or cleared */
  onChange: (productId: string | undefined) => void;
  /** List of products to display */
  products: ProductPickerItem[];
  /** Whether the product list is loading */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Label above the picker */
  label?: string;
  className?: string;
}

export function ProductPicker({
  value,
  onChange,
  products,
  isLoading,
  placeholder = "Все товары",
  label,
  className,
}: ProductPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = useMemo(() => products.find((p) => p.id === value), [products, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  // Position dropdown
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 8,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (productId: string | undefined) => {
    onChange(productId);
    setIsOpen(false);
  };

  const dropdown =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "absolute",
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: Math.max(dropdownPosition.width, 280),
              }}
              className={cn(
                "z-[9999] overflow-hidden",
                "bg-[#1c1c1e]/95 backdrop-blur-2xl",
                "border border-glass rounded-2xl",
                "shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              )}
            >
              {/* Search */}
              <div className="p-3 border-b border-glass">
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск товара..."
                    className={cn(
                      "w-full pl-9 pr-3 py-2 text-sm rounded-xl",
                      "bg-white/[0.06] border border-glass-minimal text-white placeholder-white/40",
                      "focus:outline-none focus:border-white/20"
                    )}
                  />
                </div>
              </div>

              {/* List */}
              <div className="max-h-64 overflow-y-auto overscroll-contain">
                {/* "All" option */}
                <button
                  onClick={() => handleSelect(undefined)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    "hover:bg-white/[0.06]",
                    !value && "bg-white/[0.08]"
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-4 h-4 text-white/40"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 10h16M4 14h16M4 18h16"
                      />
                    </svg>
                  </div>
                  <span
                    className={cn("text-sm font-medium", !value ? "text-white" : "text-white/60")}
                  >
                    Все товары
                  </span>
                  {!value && (
                    <svg
                      className="w-4 h-4 text-accent-blue ml-auto flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>

                {isLoading ? (
                  <div className="px-4 py-6 text-center">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-white/40 mt-2">Загрузка...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-white/40">
                      {search ? "Ничего не найдено" : "Нет товаров"}
                    </p>
                  </div>
                ) : (
                  filtered.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleSelect(product.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        "hover:bg-white/[0.06]",
                        value === product.id && "bg-white/[0.08]"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                        {product.photoUrl ? (
                          <img
                            src={product.photoUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-white/20"
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
                        <p
                          className={cn(
                            "text-sm font-medium truncate",
                            value === product.id ? "text-white" : "text-white/80"
                          )}
                        >
                          {product.name}
                        </p>
                      </div>
                      {value === product.id && (
                        <svg
                          className="w-4 h-4 text-accent-blue flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-white/60 mb-2">{label}</label>}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left",
          "bg-white/[0.08] border transition-all duration-200",
          "hover:bg-white/[0.10]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue",
          value ? "border-glass-strong" : "border-glass-minimal"
        )}
      >
        {selectedProduct ? (
          <>
            <div className="w-7 h-7 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
              {selectedProduct.photoUrl ? (
                <img
                  src={selectedProduct.photoUrl}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-3.5 h-3.5 text-white/20"
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
            <span className="text-sm font-medium text-white truncate flex-1">
              {selectedProduct.name}
            </span>
          </>
        ) : (
          <>
            <svg
              className="w-5 h-5 text-white/40 flex-shrink-0"
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
            <span className="text-sm text-white/40 flex-1">{placeholder}</span>
          </>
        )}
        <svg
          className={cn(
            "w-4 h-4 text-white/30 flex-shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
