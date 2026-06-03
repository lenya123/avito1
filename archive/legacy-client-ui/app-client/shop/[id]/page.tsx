"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useSellerStorefront } from "@/hooks/use-seller-storefront";
import { useFavoriteToggle, useNotificationToggle, useProduct } from "@/hooks/use-products";
import { ProductGrid, ProductModal } from "@/components/client";
import { BackButton } from "@/components/ui/back-button";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button, Spinner, ErrorState } from "@/components/ui";
import { RatingStars } from "@/components/ui/rating-stars";
import { hasDisplayableRating, ratingToStars } from "@/lib/seller/rating";

const SLA_CAPTION = "SLA-рейтинг: скорость работы, % успешных заказов";

function MetricTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card variant="glass" padding="md">
      <div className="flex flex-col gap-1">
        <div className="text-lg">{icon}</div>
        <div className="text-white/50 text-2xs uppercase tracking-wide">{label}</div>
        <div className="text-white font-semibold text-lg">{value}</div>
        {sub && <div className="text-white/40 text-2xs">{sub}</div>}
      </div>
    </Card>
  );
}

export default function ShopPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { user } = useAuth();

  const {
    data: queryData,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSellerStorefront(id);

  const data = useMemo(() => {
    if (!queryData?.pages.length) return null;
    const first = queryData.pages[0];
    const products = queryData.pages.flatMap((p) => p.products);
    return {
      seller: first.seller,
      products,
      total: first.pagination.total,
    };
  }, [queryData]);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const { data: productData, isLoading: productLoading } = useProduct(selectedProductId);

  const favoriteToggle = useFavoriteToggle();
  const notificationToggle = useNotificationToggle();

  const userLevel = user?.level || 0;
  const isFirstOrder = user ? !user.firstOrderDiscountUsed : false;

  const handleProductClick = useCallback((productId: string) => {
    setSelectedProductId(productId);
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

  const handleNotifyToggle = useCallback(
    async (productId: string) => {
      const isEnabled = productData?.product?.isNotificationEnabled;
      await notificationToggle.mutateAsync({ productId, enabled: !isEnabled });
    },
    [notificationToggle, productData]
  );

  const selectedProductFromList = useMemo(() => {
    if (!selectedProductId || !data) return null;
    return data.products.find((p) => p.id === selectedProductId) || null;
  }, [selectedProductId, data]);

  const selectedProduct = useMemo(() => {
    if (productData?.product && productData.product.id === selectedProductId) {
      return productData.product;
    }
    return selectedProductFromList;
  }, [productData?.product, selectedProductId, selectedProductFromList]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4">
          <BackButton />
        </div>
        <ErrorState message="Не удалось загрузить магазин" onRetry={() => refetch()} />
      </main>
    );
  }

  const { seller, products, total } = data;
  const canShowRating = hasDisplayableRating(seller.metrics.ordersCount);
  const stars = ratingToStars(seller.rating);

  return (
    <>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-white/80 font-medium">Магазин</h1>
        </div>

        {/* Shop header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card variant="glass" padding="lg">
            <div className="flex items-start gap-4">
              <Avatar
                src={seller.avatar_url}
                name={seller.shop_name}
                size="xl"
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-white text-xl font-bold truncate">{seller.shop_name}</div>
                {canShowRating ? (
                  <>
                    <div className="flex items-center gap-2 mt-1.5" title={SLA_CAPTION}>
                      <RatingStars value={stars} size="md" />
                      <span className="text-white/60 text-sm">{stars.toFixed(1)}</span>
                      <span className="text-white/40 text-sm">
                        · {seller.metrics.ordersCount} заказов
                      </span>
                    </div>
                    <div className="text-white/40 text-xs mt-1">{SLA_CAPTION}</div>
                  </>
                ) : (
                  <div className="text-white/60 text-sm mt-1.5">
                    Новый магазин · принимает первые заказы
                  </div>
                )}
                {seller.bio && (
                  <p className="text-white/70 text-sm mt-3 whitespace-pre-line leading-relaxed">
                    {seller.bio}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <MetricTile
            icon="⚡"
            label="Отправка"
            value={
              seller.metrics.shipSpeedHours > 0
                ? `${Math.round(seller.metrics.shipSpeedHours)} ч`
                : "—"
            }
            sub="за 90 дней"
          />
          <MetricTile
            icon="↩"
            label="Приём возвратов"
            value={
              seller.metrics.returnPickupHours > 0
                ? `${Math.round(seller.metrics.returnPickupHours)} ч`
                : "—"
            }
            sub="за 90 дней"
          />
          <MetricTile
            icon="✅"
            label="Успешные"
            value={`${seller.metrics.successRate}%`}
            sub="за 90 дней"
          />
        </div>

        {/* Products */}
        <div>
          <h2 className="text-white/80 font-semibold mb-3">
            Товары магазина <span className="text-white/40 font-normal">({total})</span>
          </h2>
          {products.length === 0 ? (
            <Card variant="glass" padding="lg">
              <p className="text-white/60 text-sm text-center">
                У магазина пока нет доступных товаров.
              </p>
            </Card>
          ) : (
            <>
              <ProductGrid
                products={products}
                userLevel={userLevel}
                isFirstOrder={isFirstOrder}
                onFavoriteToggle={handleFavoriteToggle}
                onNotifyClick={handleNotifyClick}
                onOrderClick={handleOrderClick}
                onProductClick={handleProductClick}
              />
              {hasNextPage && (
                <div className="flex justify-center mt-6">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    isLoading={isFetchingNextPage}
                    className="px-6"
                  >
                    Загрузить ещё
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onFavoriteToggle={handleFavoriteToggle}
        onNotifyToggle={handleNotifyToggle}
        onOrder={handleOrderClick}
        userLevel={userLevel}
        isFirstOrder={isFirstOrder}
        isLoading={productLoading}
      />
    </>
  );
}
