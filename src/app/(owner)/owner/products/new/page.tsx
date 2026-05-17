"use client";

import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useCreateProduct } from "@/hooks/use-owner-products";
import { Button, Input, Card, CardContent, CardHeader } from "@/components/ui";

const productSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.coerce.number().min(0, "Цена должна быть положительной"),
  dropPrice: z.coerce.number().min(0, "Цена должна быть положительной"),
  recommendedPrice: z.coerce.number().optional(),
  isPremium: z.boolean().default(false),
  isInStock: z.boolean().default(true),
  expectedArrivalDate: z.string().optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1, "Размер обязателен"),
        quantity: z.coerce.number().min(0, "Количество должно быть положительным"),
      })
    )
    .min(0),
});

type ProductForm = z.infer<typeof productSchema>;

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export default function NewProductPage() {
  const router = useRouter();
  const { mutate: createProduct, isPending, error } = useCreateProduct();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      brand: "",
      category: "",
      description: "",
      purchasePrice: 0,
      dropPrice: 0,
      isPremium: false,
      isInStock: true,
      sizes: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "sizes",
  });

  const isInStock = watch("isInStock");

  const onSubmit = (data: ProductForm) => {
    createProduct(data, {
      onSuccess: (result) => {
        router.push(`/owner/products/${result.productId}`);
      },
    });
  };

  const addStandardSizes = () => {
    // Очищаем текущие размеры
    while (fields.length > 0) {
      remove(0);
    }
    // Добавляем стандартные
    STANDARD_SIZES.forEach((size) => {
      append({ size, quantity: 0 });
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back button */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <button
          onClick={() => router.back()}
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
        </button>
      </motion.div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-white mb-1">Новый товар</h1>
        <p className="text-white/60">Заполните информацию о товаре</p>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Основная информация</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Название *"
                placeholder="Футболка Nike Dri-FIT"
                error={errors.name?.message}
                {...register("name")}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Бренд"
                  placeholder="Nike"
                  error={errors.brand?.message}
                  {...register("brand")}
                />
                <Input
                  label="Категория"
                  placeholder="Футболки"
                  error={errors.category?.message}
                  {...register("category")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Описание</label>
                <textarea
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-glass text-white placeholder-white/40 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-accent-blue resize-none"
                  rows={3}
                  placeholder="Описание товара..."
                  {...register("description")}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
                    {...register("isPremium")}
                  />
                  <span className="text-white/80">Premium товар</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Prices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Цены</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Закупка *"
                  type="number"
                  placeholder="1500"
                  error={errors.purchasePrice?.message}
                  {...register("purchasePrice")}
                  rightIcon={<span className="text-white/40">₽</span>}
                />
                <Input
                  label="Дроп-цена *"
                  type="number"
                  placeholder="2500"
                  error={errors.dropPrice?.message}
                  {...register("dropPrice")}
                  rightIcon={<span className="text-white/40">₽</span>}
                />
                <Input
                  label="Рекомендуемая"
                  type="number"
                  placeholder="3500"
                  error={errors.recommendedPrice?.message}
                  {...register("recommendedPrice")}
                  rightIcon={<span className="text-white/40">₽</span>}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stock */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Наличие</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="w-4 h-4 accent-[#0A84FF] bg-white/[0.08] border-white/20"
                    checked={isInStock}
                    onChange={() => setValue("isInStock", true)}
                  />
                  <span className="text-white/80">В наличии</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="w-4 h-4 accent-[#0A84FF] bg-white/[0.08] border-white/20"
                    checked={!isInStock}
                    onChange={() => setValue("isInStock", false)}
                  />
                  <span className="text-white/80">В пути</span>
                </label>
              </div>

              {!isInStock && (
                <Input
                  label="Ожидаемая дата прибытия"
                  type="date"
                  {...register("expectedArrivalDate")}
                />
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Sizes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Размеры и количество</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Для аксессуаров и сумок оставьте пустым
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={addStandardSizes}>
                Стандартные размеры
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {errors.sizes?.message && (
                <p className="text-accent-red text-sm">{errors.sizes.message}</p>
              )}

              {fields.length === 0 && (
                <div className="py-4 text-center text-white/20 text-sm rounded-xl border border-dashed border-glass-minimal">
                  Без размеров (one size)
                </div>
              )}

              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      label={index === 0 ? "Размер" : undefined}
                      placeholder="M"
                      error={errors.sizes?.[index]?.size?.message}
                      {...register(`sizes.${index}.size`)}
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      label={index === 0 ? "Кол-во" : undefined}
                      type="number"
                      placeholder="10"
                      error={errors.sizes?.[index]?.quantity?.message}
                      {...register(`sizes.${index}.quantity`)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
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

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ size: "", quantity: 0 })}
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Добавить размер
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-gradient-to-b from-red-500/[0.12] to-red-500/[0.06] border border-red-500/20 text-accent-red shadow-card"
          >
            {error.message}
          </motion.div>
        )}

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex gap-4"
        >
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Отмена
          </Button>
          <Button type="submit" isLoading={isPending} className="flex-1">
            Создать товар
          </Button>
        </motion.div>
      </form>
    </div>
  );
}
