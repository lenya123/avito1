"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BackButton, Button, Input, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";

interface Product {
  id: string;
  name: string;
  description: string | null;
  drop_price: number;
  photo_urls: string[] | null;
  location_city: string;
}

interface ProcessedPhoto {
  url: string;
  source: string;
}

interface PostResult {
  success: boolean;
  message?: string;
  stepsPlanned?: string[];
  processedPhotos?: ProcessedPhoto[];
  photoErrors?: string[];
  draft?: { city: string; metro: string | null; category: string | null };
  meta?: {
    coverSource: string;
    photosetSource: string;
    coverPresetsAvailable: number;
    photosetPresetsAvailable: number;
  };
}

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/avito/autopost/products");
  if (!res.ok) throw new Error("Не удалось загрузить товары");
  const data = await res.json();
  return data.products || [];
}

async function generateText(
  kind: "title" | "description",
  productName: string,
  productDescription: string
): Promise<string> {
  const res = await fetch("/api/avito/autopost/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, productName, productDescription }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Ошибка генерации");
  }
  const data = await res.json();
  return data.text;
}

async function postAd(payload: {
  productId?: string;
  title: string;
  price: number;
  description: string;
}): Promise<PostResult> {
  const res = await fetch("/api/avito/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: payload.productId,
      title: payload.title,
      price: payload.price,
      description: payload.description || undefined,
      manualSetKey: null,
      manualCoverPresetId: null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Ошибка постинга");
  }
  const data = await res.json();
  return {
    success: !!data.success,
    message: data.queued
      ? `Заявка на публикацию поставлена в очередь (ID ${String(data.jobId).slice(0, 8)}). Статус — на дашборде Avito.`
      : "Заявка отправлена",
  };
}

export default function AvitoAutopostPage() {
  const router = useRouter();
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "in-stock"],
    queryFn: fetchProducts,
  });

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PostResult | null>(null);
  const [coverMode, setCoverMode] = useState<"gemini" | "preset" | "none">("gemini");
  const [usePhotosetPreset, setUsePhotosetPreset] = useState(true);
  const [uniquizePhotos, setUniquizePhotos] = useState(true);

  const selectedProduct = products?.find((p) => p.id === selectedProductId);

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const p = products?.find((p) => p.id === id);
    if (p) {
      if (!title) setTitle(p.name);
      if (!price) setPrice(String(p.drop_price));
    }
  };

  const handleGenerateTitle = async () => {
    if (!selectedProduct && !title) {
      setError("Выберите товар или введите название");
      return;
    }
    setGeneratingTitle(true);
    setError(null);
    try {
      const text = await generateText(
        "title",
        selectedProduct?.name || title,
        selectedProduct?.description || ""
      );
      setTitle(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGeneratingTitle(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!selectedProduct && !title) {
      setError("Выберите товар или введите название");
      return;
    }
    setGeneratingDesc(true);
    setError(null);
    try {
      const text = await generateText(
        "description",
        selectedProduct?.name || title,
        selectedProduct?.description || ""
      );
      setDescription(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handlePost = async () => {
    if (!title.trim()) {
      setError("Введите название");
      return;
    }
    const priceNum = parseInt(price);
    if (!priceNum || priceNum <= 0) {
      setError("Введите корректную цену");
      return;
    }
    setPosting(true);
    setError(null);
    setResult(null);
    try {
      const res = await postAd({
        productId: selectedProductId || undefined,
        title: title.trim(),
        price: priceNum,
        description: description.trim(),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPosting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/owner/avito" />
        <div>
          <h1 className="text-xl font-bold text-white">Создать объявление</h1>
          <p className="text-white/40 text-sm">Автопостинг с AI-генерацией</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        {/* Выбор товара */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Товар из склада</h3>

          {productsLoading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Spinner size="sm" /> Загружаем товары...
            </div>
          ) : !products?.length ? (
            <p className="text-sm text-white/40">
              Товары не найдены. Сначала добавьте товары в основную панель.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProduct(p.id)}
                  className={cn(
                    "p-2 rounded-xl border text-left transition-all",
                    selectedProductId === p.id
                      ? "bg-accent-blue/15 border-accent-blue/50"
                      : "bg-white/[0.04] border-glass hover:border-white/20"
                  )}
                >
                  <p className="text-xs font-medium text-white line-clamp-2">{p.name}</p>
                  <p className="text-xs text-white/40 mt-1">{p.drop_price.toLocaleString("ru")} ₽</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Название */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-white">Название</label>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateTitle}
              isLoading={generatingTitle}
            >
              ✨ Генерация
            </Button>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Кроссовки Nike Air Max"
            maxLength={50}
          />
          <p className="text-xs text-white/40 mt-1">{title.length}/50 символов</p>
        </div>

        {/* Цена */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
          <label className="text-sm font-semibold text-white block mb-2">Цена</label>
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="5000"
          />
        </div>

        {/* Описание */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-white">Описание</label>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateDescription}
              isLoading={generatingDesc}
            >
              ✨ Генерация
            </Button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание появится после генерации или введите вручную"
            rows={6}
            className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-glass text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 resize-none"
          />
        </div>

        {/* Обработка фото */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass backdrop-blur-xl">
          <h3 className="text-sm font-semibold text-white mb-3">Обработка фото</h3>

          {/* Cover mode */}
          <div className="mb-3">
            <p className="text-xs text-white/60 mb-1.5">Обложка:</p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { value: "gemini", label: "✨ Gemini" },
                  { value: "preset", label: "🖼 Из пресета" },
                  { value: "none", label: "Без обложки" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCoverMode(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs border transition-colors",
                    coverMode === opt.value
                      ? "bg-accent-blue/15 border-accent-blue/50 text-white"
                      : "bg-white/[0.04] border-glass text-white/60 hover:text-white"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photoset preset */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80 mb-2">
            <input
              type="checkbox"
              checked={usePhotosetPreset}
              onChange={(e) => setUsePhotosetPreset(e.target.checked)}
              className="rounded border-glass bg-white/[0.06]"
            />
            <span>Использовать живой фотосет из пресетов (по категории товара)</span>
          </label>
          <p className="text-2xs text-white/40 ml-6 mb-3">
            Если выкл — используются фото товара. Управление пресетами:{" "}
            <a href="/owner/avito/presets" className="text-accent-blue hover:underline">
              /owner/avito/presets
            </a>
          </p>

          {/* Uniquize */}
          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/80">
            <input
              type="checkbox"
              checked={uniquizePhotos}
              onChange={(e) => setUniquizePhotos(e.target.checked)}
              className="rounded border-glass bg-white/[0.06]"
            />
            <span>Уникализировать (resize + quality jitter, чтобы хеш отличался)</span>
          </label>

          {selectedProduct && (
            <div className="mt-3 p-2 rounded-xl bg-white/[0.04] border border-glass text-xs text-white/60">
              <p>
                Город товара: <span className="text-white">{selectedProduct.location_city}</span>
              </p>
              {selectedProduct.location_city === "Москва" && (
                <p className="mt-0.5">Метро — рандомное из коричневой кольцевой</p>
              )}
              <p className="mt-0.5">
                Фото в товаре:{" "}
                <span className="text-white">{selectedProduct.photo_urls?.length || 0}</span>
              </p>
            </div>
          )}

          <p className="text-2xs text-white/40 mt-2">
            Публикация идёт через stealth-сессию: фото уникализируются и фоновый воркер постит на avito.ru/additem. Статус — в очереди заявок.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-accent-red/10 border border-accent-red/30 text-sm text-accent-red">
            {error}
          </div>
        )}

        {result && (
          <div className="p-4 rounded-xl bg-accent-green/10 border border-accent-green/30 space-y-3">
            <p className="text-sm text-accent-green font-medium">{result.message}</p>

            {result.draft && (
              <div className="text-xs text-white/60">
                <p>
                  Город: <span className="text-white">{result.draft.city}</span>
                  {result.draft.metro && (
                    <>
                      {" "}
                      · Метро: <span className="text-white">{result.draft.metro}</span>
                    </>
                  )}
                </p>
              </div>
            )}

            {result.processedPhotos && result.processedPhotos.length > 0 && (
              <div>
                <p className="text-xs text-white/60 mb-2">
                  Готовые фото ({result.processedPhotos.length}):
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {result.processedPhotos.map((p, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.source}
                        className="w-full aspect-square object-cover rounded-lg border border-glass"
                      />
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-2xs text-white">
                        {p.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.photoErrors && result.photoErrors.length > 0 && (
              <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                <p className="text-xs text-orange-300 font-medium mb-1">Ошибки обработки фото:</p>
                <ul className="text-2xs text-white/60 space-y-0.5">
                  {result.photoErrors.map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.stepsPlanned && (
              <details className="text-xs text-white/60">
                <summary className="cursor-pointer">Что было сделано</summary>
                <ul className="mt-2 space-y-1">
                  {result.stepsPlanned.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/owner/avito")}
            >
              ← Вернуться к дашборду
            </Button>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          onClick={handlePost}
          isLoading={posting}
          disabled={!title.trim() || !price}
          className="w-full"
        >
          Выложить объявление
        </Button>
      </motion.div>
    </main>
  );
}
