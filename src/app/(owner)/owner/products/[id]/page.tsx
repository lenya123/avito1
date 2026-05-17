"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useOwnerProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-owner-products";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE_VARIANTS as STATUS_VARIANTS,
} from "@/lib/constants/order-status";
import type { OrderStatus } from "@/types/database";
import {
  ErrorState,
  Button,
  Card,
  CardContent,
  CardHeader,
  Badge,
  Modal,
  Input,
  Skeleton,
} from "@/components/ui";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const { data, isLoading, error, refetch } = useOwnerProduct(productId);
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    brand: "",
    category: "",
    description: "",
    purchasePrice: "",
    dropPrice: "",
    recommendedPrice: "",
    isPremium: false,
    isActive: true,
    isInStock: true,
    expectedArrivalDate: "",
    sizes: [] as Array<{ size: string; quantity: string }>,
  });

  const openEditModal = () => {
    if (!data) return;
    const { product } = data;
    setEditForm({
      name: product.name,
      brand: product.brand || "",
      category: product.category || "",
      description: product.description || "",
      purchasePrice: product.purchasePrice.toString(),
      dropPrice: product.dropPrice.toString(),
      recommendedPrice: product.recommendedPrice?.toString() || "",
      isPremium: product.isPremium,
      isActive: product.isActive,
      isInStock: product.isInStock,
      expectedArrivalDate: product.expectedArrivalDate || "",
      sizes: product.sizes.map((s) => ({
        size: s.size,
        quantity: s.currentQuantity.toString(),
      })),
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProduct.mutateAsync({
        productId,
        name: editForm.name,
        brand: editForm.brand || null,
        category: editForm.category || null,
        description: editForm.description || null,
        purchasePrice: parseFloat(editForm.purchasePrice) || 0,
        dropPrice: parseFloat(editForm.dropPrice) || 0,
        recommendedPrice: editForm.recommendedPrice ? parseFloat(editForm.recommendedPrice) : null,
        isPremium: editForm.isPremium,
        isActive: editForm.isActive,
        isInStock: editForm.isInStock,
        expectedArrivalDate: editForm.expectedArrivalDate || null,
        sizes: editForm.sizes.map((s) => ({
          size: s.size,
          quantity: parseInt(s.quantity) || 0,
        })),
      });
      setShowEditModal(false);
    } catch {
      // Error shown via mutation state
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProduct.mutateAsync(productId);
      router.push("/owner/products");
    } catch {
      // Error shown via mutation state
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить данные товара"
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

  const { product, sales, recentOrders } = data;
  const margin = product.dropPrice - product.purchasePrice;
  const marginPercent =
    product.purchasePrice > 0 ? Math.round((margin / product.purchasePrice) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Back button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <Link
          href="/owner/products"
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
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center gap-4"
      >
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/[0.08] flex-shrink-0">
          {product.photoUrls[0] ? (
            <img
              src={product.photoUrls[0]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white/20"
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
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{product.name}</h1>
            {product.isPremium && (
              <Badge variant="purple" size="sm">
                Premium
              </Badge>
            )}
            {product.isActive ? (
              <Badge variant="success" size="sm">
                Активный
              </Badge>
            ) : (
              <Badge variant="error" size="sm">
                Неактивный
              </Badge>
            )}
            {product.isInStock ? (
              <Badge variant="success" size="sm">
                В наличии
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                В пути
              </Badge>
            )}
          </div>
          <p className="text-white/60">
            {product.brand || "Без бренда"}
            {product.category && ` • ${product.category}`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={openEditModal}>
            Редактировать
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
            Удалить
          </Button>
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
                <p className="text-xs text-white/40 mb-1">Название</p>
                <p className="text-white">{product.name}</p>
              </div>
              {product.brand && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Бренд</p>
                  <p className="text-white">{product.brand}</p>
                </div>
              )}
              {product.category && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Категория</p>
                  <p className="text-white">{product.category}</p>
                </div>
              )}
              {product.description && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Описание</p>
                  <p className="text-white/80 text-sm">{product.description}</p>
                </div>
              )}
              {product.expectedArrivalDate && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Ожидаемая дата прибытия</p>
                  <p className="text-white">
                    {new Date(product.expectedArrivalDate).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/40 mb-1">Создан</p>
                <p className="text-white">
                  {product.createdAt
                    ? new Date(product.createdAt).toLocaleDateString("ru-RU")
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Prices card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Цены</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-white/40 mb-1">Закупочная цена</p>
                <p className="text-white">{product.purchasePrice.toLocaleString("ru-RU")} ₽</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Дроп-цена</p>
                <p className="text-xl font-bold text-white">
                  {product.dropPrice.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              {product.recommendedPrice && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Рекомендуемая</p>
                  <p className="text-white">{product.recommendedPrice.toLocaleString("ru-RU")} ₽</p>
                </div>
              )}
              <div className="pt-2 border-t border-glass">
                <p className="text-xs text-white/40 mb-1">Маржа</p>
                <p
                  className={`text-xl font-bold ${margin >= 0 ? "text-accent-green" : "text-accent-red"}`}
                >
                  {margin.toLocaleString("ru-RU")} ₽{" "}
                  <span className="text-sm font-normal text-white/40">({marginPercent}%)</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Sales card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-white">Продажи</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/40 mb-1">Всего заказов</p>
                  <p className="text-xl font-bold text-white">{sales.total}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40 mb-1">Завершённых</p>
                  <p className="text-xl font-bold text-accent-green">{sales.completed}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Отменённых</p>
                <p className="text-white/60">{sales.cancelled}</p>
              </div>
              <div className="pt-2 border-t border-glass">
                <p className="text-xs text-white/40 mb-1">Выручка</p>
                <p className="text-xl font-bold text-white">
                  {sales.revenue.toLocaleString("ru-RU")} ₽
                </p>
              </div>
              {sales.completed > 0 && (
                <div>
                  <p className="text-xs text-white/40 mb-1">Средняя цена</p>
                  <p className="text-white">{sales.avgPrice.toLocaleString("ru-RU")} ₽</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sizes */}
      {product.sizes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="font-semibold text-white">Размеры</h3>
              <p className="text-sm text-white/60">
                Всего: {product.totalStock} / {product.totalInitial} шт.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {product.sizes.map((size) => {
                  const sold = size.initialQuantity - size.currentQuantity;
                  return (
                    <div
                      key={size.id}
                      className="p-3 rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass text-center"
                    >
                      <p className="font-medium text-white mb-1">{size.size}</p>
                      <p
                        className={`text-lg font-bold ${
                          size.currentQuantity === 0
                            ? "text-accent-red"
                            : size.currentQuantity <= 2
                              ? "text-accent-orange"
                              : "text-accent-green"
                        }`}
                      >
                        {size.currentQuantity}
                      </p>
                      <p className="text-xs text-white/40">
                        из {size.initialQuantity} • {sold} продано
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Photos */}
      {product.photoUrls.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Фотографии</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {product.photoUrls.map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden bg-white/[0.08]">
                    <img
                      src={url}
                      alt={`${product.name} ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent orders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="font-semibold text-white">Последние заказы</h3>
            <Link
              href={`/owner/orders?product=${productId}`}
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">#{order.orderNumber}</span>
                        <Badge
                          variant={STATUS_VARIANTS[order.status as OrderStatus] || "default"}
                          size="sm"
                        >
                          {ORDER_STATUS_LABELS[order.status as OrderStatus] || order.status}
                        </Badge>
                        {order.size && <span className="text-xs text-white/40">{order.size}</span>}
                      </div>
                      <p className="text-xs text-white/60 truncate">
                        {order.clientUsername ? `@${order.clientUsername}` : "Клиент"}
                      </p>
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

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Редактировать товар"
        size="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Название"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Бренд"
              value={editForm.brand}
              onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
            />
            <Input
              label="Категория"
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">Описание</label>
            <textarea
              className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-glass text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-accent-blue resize-none"
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Закупка"
              type="number"
              value={editForm.purchasePrice}
              onChange={(e) => setEditForm({ ...editForm, purchasePrice: e.target.value })}
              rightIcon={<span className="text-white/40">₽</span>}
            />
            <Input
              label="Дроп-цена"
              type="number"
              value={editForm.dropPrice}
              onChange={(e) => setEditForm({ ...editForm, dropPrice: e.target.value })}
              rightIcon={<span className="text-white/40">₽</span>}
            />
            <Input
              label="Рекомендуемая"
              type="number"
              value={editForm.recommendedPrice}
              onChange={(e) => setEditForm({ ...editForm, recommendedPrice: e.target.value })}
              rightIcon={<span className="text-white/40">₽</span>}
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isPremium}
                onChange={(e) => setEditForm({ ...editForm, isPremium: e.target.checked })}
              />
              <span className="text-white/80">Premium</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              />
              <span className="text-white/80">Активный</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                checked={editForm.isInStock}
                onChange={(e) => setEditForm({ ...editForm, isInStock: e.target.checked })}
              />
              <span className="text-white/80">В наличии</span>
            </label>
          </div>

          {!editForm.isInStock && (
            <Input
              label="Ожидаемая дата прибытия"
              type="date"
              value={editForm.expectedArrivalDate}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  expectedArrivalDate: e.target.value,
                })
              }
            />
          )}

          {/* Sizes */}
          <div className="border-t border-glass pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-white/80">Размеры</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    sizes: [...editForm.sizes, { size: "", quantity: "0" }],
                  })
                }
              >
                Добавить
              </Button>
            </div>
            {editForm.sizes.map((size, index) => (
              <div key={index} className="flex items-end gap-3 mb-2">
                <div className="flex-1">
                  <Input
                    label={index === 0 ? "Размер" : undefined}
                    value={size.size}
                    onChange={(e) => {
                      const newSizes = [...editForm.sizes];
                      newSizes[index].size = e.target.value;
                      setEditForm({ ...editForm, sizes: newSizes });
                    }}
                    placeholder="M"
                  />
                </div>
                <div className="w-28">
                  <Input
                    label={index === 0 ? "Кол-во" : undefined}
                    type="number"
                    value={size.quantity}
                    onChange={(e) => {
                      const newSizes = [...editForm.sizes];
                      newSizes[index].quantity = e.target.value;
                      setEditForm({ ...editForm, sizes: newSizes });
                    }}
                    placeholder="10"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newSizes = editForm.sizes.filter((_, i) => i !== index);
                    setEditForm({ ...editForm, sizes: newSizes });
                  }}
                  className="p-2 mb-1 text-white/60 hover:text-accent-red transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {updateProduct.isError && (
            <p className="text-sm text-accent-red">
              {updateProduct.error instanceof Error
                ? updateProduct.error.message
                : "Ошибка обновления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowEditModal(false)}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button type="submit" isLoading={updateProduct.isPending} className="flex-1">
              Сохранить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Удалить товар?"
      >
        <div className="space-y-4">
          <p className="text-white/80">
            Вы уверены, что хотите удалить товар{" "}
            <span className="text-white font-medium">{product.name}</span>? Товар будет
            деактивирован.
          </p>

          {deleteProduct.isError && (
            <p className="text-sm text-accent-red">
              {deleteProduct.error instanceof Error
                ? deleteProduct.error.message
                : "Ошибка удаления"}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              variant="danger"
              isLoading={deleteProduct.isPending}
              onClick={handleDelete}
              className="flex-1"
            >
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
