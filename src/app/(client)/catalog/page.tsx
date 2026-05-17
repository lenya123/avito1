"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import {
  useInfiniteProducts,
  useProductFilters,
  useProduct,
  useFavoriteToggle,
  useNotificationToggle,
} from "@/hooks/use-products";
import { ProductGrid, ProductFilters, ProductModal, type FilterState } from "@/components/client";
import { Button, Spinner, ErrorState } from "@/components/ui";

const defaultFilters: FilterState = {
  search: "",
  category: "",
  brand: "",
  size: "",
  inStock: false,
  favorites: false,
  premiumOnly: false,
  sort: "newest",
};

export default function CatalogPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: filtersData, isLoading: filtersLoading } = useProductFilters(filters);
  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts(filters);
  const { data: productData, isLoading: productLoading } = useProduct(selectedProductId);

  // Flatten all pages into single products array
  const allProducts = useMemo(() => {
    if (!productsData?.pages) return [];
    return productsData.pages.flatMap((page) => page.products);
  }, [productsData]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mutations
  const favoriteToggle = useFavoriteToggle();
  const notificationToggle = useNotificationToggle();

  // User level and premium status
  const userLevel = user?.level || 0;
  const isFirstOrder = user ? !user.firstOrderDiscountUsed : false;
  const isPremium = useMemo(
    () =>
      user?.isVibePlus ||
      user?.subscriptionTier === "premium" ||
      user?.subscriptionTier === "top_floor_boss",
    [user]
  );

  // Handlers
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const handleFavoriteToggle = useCallback(
    async (productId: string, isFavorite: boolean) => {
      await favoriteToggle.mutateAsync({ productId, isFavorite });
    },
    [favoriteToggle]
  );

  const handleNotifyClick = useCallback(
    async (productId: string) => {
      await notificationToggle.mutateAsync({ productId, enabled: true });
    },
    [notificationToggle]
  );

  const handleOrderClick = useCallback(
    (productId: string) => {
      router.push(`/order/${productId}`);
    },
    [router]
  );

  // Находим базовые данные продукта из списка для мгновенного показа
  const selectedProductFromList = useMemo(() => {
    if (!selectedProductId) return null;
    return allProducts.find((p) => p.id === selectedProductId) || null;
  }, [selectedProductId, allProducts]);

  // Объединяем данные: детальные из API только если ID совпадает
  const selectedProduct = useMemo(() => {
    // Проверяем что данные API относятся к выбранному товару
    if (productData?.product && productData.product.id === selectedProductId) {
      return productData.product;
    }
    // Иначе показываем данные из списка
    return selectedProductFromList;
  }, [productData?.product, selectedProductId, selectedProductFromList]);

  const handleProductClick = useCallback((productId: string) => {
    setSelectedProductId(productId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedProductId(null);
  }, []);

  const handleNotifyToggle = useCallback(
    async (productId: string) => {
      const isEnabled = productData?.product?.isNotificationEnabled;
      await notificationToggle.mutateAsync({ productId, enabled: !isEnabled });
    },
    [notificationToggle, productData]
  );

  return (
    <>
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* User info card (mobile) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:hidden mb-4 p-4 rounded-2xl overflow-hidden relative bg-gradient-to-br from-white/[0.10] via-white/[0.06] to-white/[0.02] backdrop-blur-xl border border-glass shadow-card"
        >
          {/* Градиент зависит от уровня — чем выше, тем ярче */}
          <div
            className="absolute inset-0 bg-gradient-to-br via-transparent pointer-events-none"
            style={{
              background: `linear-gradient(to bottom right, ${["rgba(255,255,255,0.12)", "rgba(174,214,255,0.14)", "rgba(93,174,255,0.16)", "rgba(10,132,255,0.18)"][userLevel]} 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm text-white/40">Уровень {userLevel}</p>
              <p className="text-lg font-semibold text-white">
                Скидка {[0, 3, 6, 10][userLevel] || 0}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/40">Баланс</p>
              <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/90">
                {((user?.deposit || 0) + (user?.referralDeposit || 0)).toLocaleString("ru-RU")} ₽
              </p>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <ProductFilters
            filters={filters}
            onChange={handleFiltersChange}
            categories={filtersData?.categories || []}
            brands={filtersData?.brands || []}
            sizes={filtersData?.sizes || []}
            totalProducts={filtersData?.totalProducts}
            isPremium={isPremium}
            isLoading={filtersLoading}
            className="mb-6"
          />
        </motion.div>

        {/* Products grid or error */}
        {productsError ? (
          <ErrorState message="Не удалось загрузить товары" onRetry={() => refetchProducts()} />
        ) : (
          <>
            <ProductGrid
              products={allProducts}
              isLoading={productsLoading}
              userLevel={userLevel}
              isFirstOrder={isFirstOrder}
              onFavoriteToggle={handleFavoriteToggle}
              onNotifyClick={handleNotifyClick}
              onOrderClick={handleOrderClick}
              onProductClick={handleProductClick}
            />

            {/* Infinite scroll trigger & Load More button */}
            {hasNextPage && (
              <div
                ref={loadMoreRef}
                className="flex flex-col items-center justify-center gap-3 mt-8 py-4"
              >
                {isFetchingNextPage ? (
                  <div className="flex items-center gap-2 text-white/40">
                    <Spinner size="sm" />
                    <span className="text-sm">Загрузка...</span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    className="px-6"
                  >
                    Загрузить ещё
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Product modal */}
      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProductId}
        onClose={handleModalClose}
        onFavoriteToggle={handleFavoriteToggle}
        onNotifyToggle={handleNotifyToggle}
        onOrder={handleOrderClick}
        userLevel={userLevel}
        isFirstOrder={isFirstOrder}
        isLoading={
          productLoading || (!!selectedProductId && productData?.product?.id !== selectedProductId)
        }
      />
    </>
  );
}
