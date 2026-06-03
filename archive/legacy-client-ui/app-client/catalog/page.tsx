"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useLeaderboard, useRankChange } from "@/hooks/use-stats";
import {
  useInfiniteProducts,
  useProductFilters,
  useProduct,
  useFavoriteToggle,
  useNotificationToggle,
} from "@/hooks/use-products";
import {
  ProductGrid,
  ProductFilters,
  ProductModal,
  RaceStatusCard,
  type FilterState,
} from "@/components/client";
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

  const { data: leaderboardData } = useLeaderboard(isPremium);

  // Race data
  const currentRank = leaderboardData?.currentUserRank ?? null;
  const rankChange = useRankChange(currentRank);

  const currentUserOrders = useMemo(() => {
    if (!leaderboardData) return 0;
    const entry = leaderboardData.leaderboard.find((e) => e.isCurrentUser);
    return entry?.ordersCount ?? leaderboardData.currentUserEntry?.ordersCount ?? 0;
  }, [leaderboardData]);

  const ordersToNextRank = useMemo(() => {
    if (!leaderboardData || !currentRank || currentRank <= 1) return null;
    const aboveEntry = leaderboardData.leaderboard.find((e) => e.rank === currentRank - 1);
    if (!aboveEntry) return null;
    return Math.max(aboveEntry.ordersCount - currentUserOrders + 1, 1);
  }, [leaderboardData, currentRank, currentUserOrders]);

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
        {/* Race Status Card (mobile) */}
        {isPremium && leaderboardData && (
          <RaceStatusCard
            rank={currentRank}
            rankChange={rankChange}
            totalParticipants={leaderboardData.totalParticipants}
            ordersCount={currentUserOrders}
            ordersToNextRank={ordersToNextRank}
            balance={(user?.deposit || 0) + (user?.referralDeposit || 0)}
            periodEnd={leaderboardData.periodEnd}
          />
        )}

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
