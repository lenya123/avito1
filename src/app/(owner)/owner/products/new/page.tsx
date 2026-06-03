"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { useCreateProduct, type ProductBindingInput } from "@/hooks/use-owner-products";
import { useOwnerSettings } from "@/hooks/use-owner-settings";
import { useOwnerPartnersList } from "@/hooks/use-owner-partners";
import { RUSSIAN_CITIES, findCity } from "@/lib/constants/cities";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import { Button, Input, Card, CardContent, CardHeader, DatePicker } from "@/components/ui";
import { cn } from "@/utils/cn";
import { PartnerLadderEditor } from "@/components/owner/products/partner-ladder-editor";
import { ProductSizesEditor, type SizeRow } from "@/components/owner/products/product-sizes-editor";
import { DescriptionTemplateButton } from "@/components/owner/products/description-template-button";

const productSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  category: z.enum(PRODUCT_CATEGORIES, {
    errorMap: () => ({ message: "Категория обязательна" }),
  }),
  description: z.string().optional(),
  purchasePrice: z.preprocess(
    (v) => (v === "" ? 0 : Number(v)),
    z.number().min(0, "Цена должна быть положительной")
  ),
  dropPrice: z.preprocess(
    (v) => (v === "" ? 0 : Number(v)),
    z.number().min(0, "Цена должна быть положительной")
  ),
  recommendedPrice: z.preprocess(
    (v) => (v === "" ? 0 : Number(v)),
    z.number().min(0, "Цена должна быть положительной")
  ),
  locationCity: z.string().trim().min(1, "Город обязателен").max(64),
  isPremium: z.boolean().default(false),
  // isInStock убран: состояние стока вычисляется автоматически из размеров.
  expectedArrivalDate: z.string().optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1, "Размер обязателен"),
        quantity: z.coerce.number().min(0, "Количество должно быть положительным"),
        // Замеры пер-размер (см). Поля зависят от категории (§11.6).
        measurements: z.record(z.string(), z.number()).default({}),
      })
    )
    .min(0),
});

type ProductForm = z.infer<typeof productSchema>;

export default function NewProductPage() {
  const router = useRouter();
  const { mutate: createProduct, isPending, error } = useCreateProduct();
  const { data: settings } = useOwnerSettings();
  const { data: partners = [] } = useOwnerPartnersList();

  // City search state
  const [cityQuery, setCityQuery] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [cityWarning, setCityWarning] = useState("");
  const cityRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      // Пусто до выбора (placeholder). Не входит в enum → zod даст
      // «Категория обязательна» при сабмите. Тот же приём, что для цен ниже.
      category: "" as unknown as ProductForm["category"],
      description: "",
      purchasePrice: "" as unknown as number,
      dropPrice: "" as unknown as number,
      recommendedPrice: "" as unknown as number,
      isPremium: false,
      sizes: [],
    },
  });

  // Auto-fill city from owner settings
  useEffect(() => {
    if (settings?.defaultLocationCity && !cityQuery) {
      setCityQuery(settings.defaultLocationCity);
      setValue("locationCity", settings.defaultLocationCity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultLocationCity]);

  // Close city dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCityChange = (value: string) => {
    setCityQuery(value);
    setCityWarning("");
    setValue("locationCity", value);

    if (value.length > 0) {
      const lower = value.toLowerCase();
      const startsWith = RUSSIAN_CITIES.filter((c) => c.toLowerCase().startsWith(lower));
      const includes = RUSSIAN_CITIES.filter(
        (c) => !c.toLowerCase().startsWith(lower) && c.toLowerCase().includes(lower)
      );
      setCitySuggestions([...startsWith, ...includes].slice(0, 8));
      setShowCityDropdown(true);
    } else {
      setCitySuggestions([]);
      setShowCityDropdown(false);
    }
  };

  const handleCitySelect = (city: string) => {
    setCityQuery(city);
    setValue("locationCity", city);
    setCityWarning("");
    setShowCityDropdown(false);
  };

  const handleCityBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      setShowCityDropdown(false);
      if (cityQuery.trim()) {
        const canonical = findCity(cityQuery);
        if (canonical) {
          setCityQuery(canonical);
          setValue("locationCity", canonical);
          setCityWarning("");
        } else {
          setCityWarning("Город не найден в справочнике");
        }
      } else {
        setCityWarning("");
      }
    }, 150);
  };

  const [bindings, setBindings] = useState<ProductBindingInput[]>([]);
  // Живой фотосет (датасет) товара — стейджим до создания, заливаем после.
  const [datasetFiles, setDatasetFiles] = useState<{ file: File; url: string }[]>([]);

  const onSubmit = (data: ProductForm) => {
    createProduct(
      { ...data, bindings },
      {
        onSuccess: async (result) => {
          if (datasetFiles.length) {
            const fd = new FormData();
            fd.append("productId", result.productId);
            datasetFiles.forEach((d) => fd.append("files", d.file));
            try {
              await fetch("/api/avito/listings/dataset", { method: "POST", body: fd });
            } catch {
              /* не блокируем переход — датасет можно дозалить в карточке */
            }
          }
          // #avito-media — карточка проскроллит к блоку медиа (управление альбомами/обложками/AI).
          router.push(`/owner/products/${result.productId}#avito-media`);
        },
      }
    );
  };

  const sizes = watch("sizes");

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

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Категория *
                </label>
                <select
                  value={watch("category") || ""}
                  onChange={(e) =>
                    setValue("category", e.target.value as ProductForm["category"], {
                      shouldValidate: true,
                    })
                  }
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl appearance-none",
                    "bg-white/[0.06] border border-glass text-white",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue",
                    "transition-all duration-200",
                    !watch("category") && "text-white/40"
                  )}
                >
                  <option value="" disabled>
                    Выберите категорию
                  </option>
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category?.message && (
                  <p className="text-accent-red text-sm mt-1">{errors.category.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-white/60">Описание</label>
                  <DescriptionTemplateButton
                    category={watch("category") as string}
                    currentValue={watch("description") ?? ""}
                    onInsert={(t) => setValue("description", t, { shouldDirty: true })}
                  />
                </div>
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
                <div>
                  <Input
                    label="Дроп-цена *"
                    type="number"
                    placeholder="2500"
                    error={errors.dropPrice?.message}
                    {...register("dropPrice")}
                    rightIcon={<span className="text-white/40">₽</span>}
                  />
                </div>
                <Input
                  label="Рекомендуемая *"
                  type="number"
                  placeholder="3000"
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
              <h3 className="font-semibold text-white">Ожидаемое поступление</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-white/50">
                Статус «в наличии» вычисляется автоматически из размеров ниже. Заполните дату, если
                товар ещё в пути — клиент увидит её на странице товара.
              </p>
              <DatePicker
                label="Ожидаемая дата прибытия (опционально)"
                placeholder="Выберите дату"
                minDate={new Date()}
                value={(() => {
                  const v = watch("expectedArrivalDate");
                  if (!v) return "";
                  const [y, m, d] = v.split("-");
                  return y && m && d ? `${d}.${m}.${y}` : "";
                })()}
                onChange={(ddmmyyyy) => {
                  const [d, m, y] = ddmmyyyy.split(".");
                  setValue("expectedArrivalDate", `${y}-${m}-${d}`);
                }}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* City */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Город</h3>
            </CardHeader>
            <CardContent>
              <div ref={cityRef} className="relative">
                <Input
                  label="Город отправки *"
                  placeholder="Начните вводить город..."
                  value={cityQuery}
                  onChange={(e) => handleCityChange(e.target.value)}
                  onFocus={() => {
                    if (citySuggestions.length > 0) setShowCityDropdown(true);
                  }}
                  onBlur={handleCityBlur}
                  error={errors.locationCity?.message}
                />
                {cityWarning && !errors.locationCity && (
                  <p className="text-amber-400 text-sm mt-1">{cityWarning}</p>
                )}
                {showCityDropdown && citySuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-secondary/95 backdrop-blur-xl border border-glass-subtle shadow-modal rounded-xl max-h-48 overflow-y-auto">
                    {citySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/[0.08] transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleCitySelect(city);
                        }}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            <CardHeader>
              <div>
                <h3 className="font-semibold text-white">Размеры, количество и замеры</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Набор размеров и поля замеров подстраиваются под категорию (§11.6).
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ProductSizesEditor
                category={watch("category")}
                value={(sizes ?? []).map((s) => ({
                  size: s.size,
                  quantity: s.quantity,
                  measurements: s.measurements ?? {},
                }))}
                onChange={(next: SizeRow[]) =>
                  setValue(
                    "sizes",
                    next.map((r) => ({
                      size: r.size,
                      quantity: r.quantity ?? 0,
                      measurements: r.measurements,
                    })),
                    { shouldValidate: true }
                  )
                }
                showQuantity
              />
              {errors.sizes?.message && (
                <p className="text-accent-red text-sm mt-2">{errors.sizes.message}</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Лестница партнёров */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <PartnerLadderEditor
            availableSizes={sizes && sizes.length > 0 ? sizes.map((s) => s.size) : ["One Size"]}
            bindings={bindings}
            partners={partners}
            onChange={setBindings}
          />
        </motion.div>

        {/* Живой фотосет (для Авито) — датасет товара */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.47 }}
        >
          <Card>
            <CardHeader>
              <div>
                <h3 className="font-semibold text-white">Живой фотосет (для Авито)</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Реальные фото товара: из них берутся 9 фото объявления и исходники AI-генерации.
                  Загрузятся в датасет после создания товара.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 cursor-pointer transition-colors">
                + Добавить фото
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const fs = Array.from(e.target.files ?? []).map((file) => ({
                      file,
                      url: URL.createObjectURL(file),
                    }));
                    // Альбом — максимум 9 фото: берём первые 9, остальное игнорируем (сервер
                    // тоже срежет до 9). Так пользователь сразу видит, что уйдёт ровно 9.
                    if (fs.length) setDatasetFiles((p) => [...p, ...fs].slice(0, 9));
                    e.target.value = "";
                  }}
                />
              </label>
              {datasetFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {datasetFiles.map((d, i) => (
                    <div key={i} className="w-14 h-14 rounded-lg overflow-hidden relative bg-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setDatasetFiles((p) => {
                            URL.revokeObjectURL(p[i].url);
                            return p.filter((_, j) => j !== i);
                          })
                        }
                        className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 leading-4 text-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/30">Можно добавить сейчас — зальём после создания.</p>
              )}
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
