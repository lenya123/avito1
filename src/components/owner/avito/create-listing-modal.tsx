"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Modal, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  useAvitoListingProducts,
  useCreatePost,
  useGenerateListingText,
  type AvitoListingProduct,
} from "@/hooks/use-avito";
import { DescriptionTemplateButton } from "@/components/owner/products/description-template-button";

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CoverItem {
  id: string;
  url: string | null;
  usage_count: number;
}
interface AlbumItem {
  set_key: string;
  title: string;
  photo_count: number;
  usage_count: number;
  thumb: string | null;
}
interface ProductMedia {
  albums: AlbumItem[];
  liveCovers: CoverItem[];
  aiCovers: Record<string, CoverItem[]>;
}

export function CreateListingModal({ isOpen, onClose }: CreateListingModalProps) {
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState<AvitoListingProduct | null>(null);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const [photoMode, setPhotoMode] = useState<"auto" | "manual">("auto");
  const [manualSetKey, setManualSetKey] = useState<string | null>(null);
  const [manualCoverPresetId, setManualCoverPresetId] = useState<string | null>(null);

  // Медиа товара для ручного выбора (обложки по категориям + альбомы фотосета).
  const [media, setMedia] = useState<ProductMedia | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  const { data: productsData, isLoading: productsLoading } = useAvitoListingProducts(
    search,
    isOpen && step === "pick"
  );
  const generateText = useGenerateListingText();
  const createPost = useCreatePost();
  const [phase, setPhase] = useState<"idle" | "done">("idle");

  const reset = () => {
    setStep("pick");
    setSearch("");
    setProduct(null);
    setTitle("");
    setPrice("");
    setDescription("");
    setPhotoMode("auto");
    setManualSetKey(null);
    setManualCoverPresetId(null);
    setMedia(null);
    setPhase("idle");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Префилл при выборе товара.
  useEffect(() => {
    if (!product) return;
    setTitle(product.name.slice(0, 50));
    setPrice(String(product.drop_price ?? ""));
    setDescription(product.description ?? "");
  }, [product]);

  // Лениво подтягиваем медиа товара только при ручном выборе.
  useEffect(() => {
    if (step !== "form" || !product || photoMode !== "manual") return;
    let active = true;
    setMediaLoading(true);
    fetch(`/api/avito/listings/product-media?productId=${product.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (active) setMedia(j);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMediaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [step, product, photoMode]);

  const selectProduct = (p: AvitoListingProduct) => {
    setProduct(p);
    setStep("form");
  };

  const handleGenText = async (kind: "title" | "description") => {
    if (!product) return;
    const res = await generateText.mutateAsync({ productId: product.id, kind });
    if (kind === "title" && res.title) setTitle(res.title.slice(0, 50));
    if (kind === "description" && res.description) setDescription(res.description);
  };

  const priceNum = Number(price);
  const canSubmit = title.trim().length >= 3 && priceNum > 0 && !createPost.isPending;
  const saveDescriptionToProduct = !product?.description?.trim() && !!description.trim();

  const handleSubmit = async () => {
    if (!product || !canSubmit) return;
    try {
      await createPost.mutateAsync({
        productId: product.id,
        title: title.trim(),
        price: priceNum,
        description: description.trim() || undefined,
        manualSetKey: photoMode === "manual" ? manualSetKey : null,
        manualCoverPresetId: photoMode === "manual" ? manualCoverPresetId : null,
        saveDescriptionToProduct,
      });
      // Уникализация прошла синхронно в POST — показываем «Готово ✓» и закрываем.
      setPhase("done");
      setTimeout(() => handleClose(), 1400);
    } catch {
      // Ошибку показываем под кнопкой (createPost.error); модалку не закрываем.
    }
  };

  const products = productsData?.products ?? [];

  const coverGroups: { label: string; items: CoverItem[] }[] = media
    ? [
        { label: "Живой фон", items: media.aiCovers?.normal ?? [] },
        { label: "Фотозона", items: media.aiCovers?.photozone ?? [] },
        { label: "На модели", items: media.aiCovers?.personality ?? [] },
        { label: "Живые обложки", items: media.liveCovers ?? [] },
      ]
    : [];
  const hasAnyCover = coverGroups.some((g) => g.items.length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === "pick" ? "Создать объявление" : "Новое объявление"}
      size="lg"
    >
      {step === "pick" ? (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className={cn(
              "w-full rounded-xl px-3 py-2.5 text-sm mb-3",
              "bg-white/[0.06] text-white placeholder-white/30",
              "border border-glass-minimal focus:border-accent-blue/50",
              "outline-none transition-colors"
            )}
          />
          <p className="text-xs text-white/30 mb-3">Только свои товары (без партнёров).</p>
          <div className="max-h-80 overflow-y-auto -mx-1 px-1">
            {productsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : products.length === 0 ? (
              <p className="text-xs text-white/20 text-center py-8">
                {search ? "Ничего не найдено" : "Нет своих товаров"}
              </p>
            ) : (
              <div className="space-y-1">
                {products.map((p) => {
                  const mainIdx = p.photo_main_index ?? 0;
                  // Живая обложка (cover_url) в приоритете — паритет с меню «Товары».
                  const photoUrl =
                    p.cover_url || p.photo_urls?.[mainIdx] || p.photo_urls?.[0];
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-xl text-left",
                        "hover:bg-white/[0.06] border border-transparent transition-colors duration-150"
                      )}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/5 overflow-hidden flex-shrink-0 relative">
                        {photoUrl ? (
                          <Image src={photoUrl} alt={p.name} fill className="object-cover" sizes="40px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">
                            📦
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{p.name}</p>
                        <p className="text-xs text-white/40">
                          {p.category || "—"} · {p.drop_price.toLocaleString("ru")} ₽
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setStep("pick")}
            className="text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            ← к выбору товара
          </button>

          {/* Название */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-white/60">Название</label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white/30">{title.length}/50</span>
                <button
                  type="button"
                  onClick={() => handleGenText("title")}
                  disabled={generateText.isPending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                >
                  ✨ Сгенерировать
                </button>
              </div>
            </div>
            <input
              type="text"
              value={title}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm bg-white/[0.06] text-white placeholder-white/30 border border-glass-minimal focus:border-accent-blue/50 outline-none"
            />
          </div>

          {/* Цена */}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">Цена, ₽</label>
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm bg-white/[0.06] text-white placeholder-white/30 border border-glass-minimal focus:border-accent-blue/50 outline-none"
            />
          </div>

          {/* Описание */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-white/60">Описание</label>
              <div className="flex items-center gap-2">
                <DescriptionTemplateButton
                  category={product?.category}
                  currentValue={description}
                  onInsert={setDescription}
                />
                <button
                  type="button"
                  onClick={() => handleGenText("description")}
                  disabled={generateText.isPending}
                  className="text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                >
                  ✨ Уникальное
                </button>
              </div>
            </div>
            <textarea
              value={description}
              rows={6}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание объявления..."
              className="w-full rounded-xl px-3 py-2.5 text-sm bg-white/[0.06] text-white placeholder-white/30 border border-glass-minimal focus:border-accent-blue/50 outline-none resize-none"
            />
            {saveDescriptionToProduct && (
              <p className="text-[11px] text-white/30 mt-1">Этот текст сохранится в карточку товара.</p>
            )}
          </div>

          {/* Фото (10) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-white/60">Фото (10)</label>
              <div className="flex rounded-lg overflow-hidden border border-glass-minimal text-xs">
                <button
                  type="button"
                  onClick={() => setPhotoMode("auto")}
                  className={cn("px-2.5 py-1", photoMode === "auto" ? "bg-accent-blue/20 text-white" : "text-white/50")}
                >
                  Авто (лестница)
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoMode("manual")}
                  className={cn("px-2.5 py-1", photoMode === "manual" ? "bg-accent-blue/20 text-white" : "text-white/50")}
                >
                  Вручную
                </button>
              </div>
            </div>

            {photoMode === "auto" ? (
              <p className="text-[11px] text-white/40 rounded-xl border border-glass-minimal p-3">
                Обложка и фотосет выберутся <b className="text-white/60">автоматически</b> — наименее
                использованные по лестнице (чтобы Авито не банил за дубли). AI-обложки генерируются
                в фоне и накапливаются в банк (см. карточку товара).
              </p>
            ) : mediaLoading && !media ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-glass-minimal p-3">
                {/* Обложка — 4 категории */}
                <div>
                  <p className="text-xs text-white/40 mb-1.5">Обложка (1-е фото)</p>
                  {!hasAnyCover && (
                    <p className="text-[11px] text-white/30">
                      Нет готовых обложек. Включи автогенерацию или «Сгенерить сейчас» в карточке товара.
                    </p>
                  )}
                  {coverGroups.map(
                    (g) =>
                      g.items.length > 0 && (
                        <div key={g.label} className="mb-2">
                          <p className="text-[11px] text-white/30 mb-1">{g.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.items.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  setManualCoverPresetId(manualCoverPresetId === c.id ? null : c.id)
                                }
                                className={cn(
                                  "w-14 h-14 rounded-lg overflow-hidden relative border-2 transition-colors",
                                  manualCoverPresetId === c.id
                                    ? "border-accent-blue"
                                    : "border-transparent opacity-70 hover:opacity-100"
                                )}
                                title={`использован ${c.usage_count}×`}
                              >
                                {c.url && (
                                  <Image src={c.url} alt="" fill className="object-cover" sizes="56px" unoptimized />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                  )}
                </div>

                {/* Фотосет — альбомы */}
                <div>
                  <p className="text-xs text-white/40 mb-1.5">Фотосет (9 фото)</p>
                  {(media?.albums.length ?? 0) === 0 ? (
                    <p className="text-[11px] text-white/30">Нет альбомов — добавь в карточке товара.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {media!.albums.map((a) => (
                        <button
                          key={a.set_key}
                          type="button"
                          onClick={() => setManualSetKey(manualSetKey === a.set_key ? null : a.set_key)}
                          className={cn(
                            "flex items-center gap-2 pr-2.5 rounded-lg border-2 overflow-hidden transition-colors",
                            manualSetKey === a.set_key
                              ? "border-accent-blue bg-accent-blue/10"
                              : "border-transparent bg-white/[0.04] hover:bg-white/[0.06]"
                          )}
                        >
                          <div className="w-10 h-10 relative flex-shrink-0 bg-white/5">
                            {a.thumb && (
                              <Image src={a.thumb} alt="" fill className="object-cover" sizes="40px" unoptimized />
                            )}
                          </div>
                          <span className="text-[11px] text-white/70">
                            {a.title} · {a.usage_count}↑
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Пустой ручной выбор = лестница подберёт автоматически. Подсказываем, что именно. */}
                {(!manualCoverPresetId || !manualSetKey) && (
                  <p className="text-[11px] text-white/40">
                    {!manualCoverPresetId && !manualSetKey
                      ? "Не выбрано → обложку и фотосет подберём автоматически."
                      : !manualCoverPresetId
                        ? "Обложка не выбрана → подберём автоматически."
                        : "Фотосет не выбран → подберём автоматически."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          {createPost.error && (
            <p className="text-xs text-accent-red text-right">
              {(createPost.error as Error).message || "Не удалось опубликовать"}
            </p>
          )}
          {createPost.isPending && (
            <p className="text-[11px] text-accent-blue/80 text-right">
              Уникализируем ваши фото перед публикацией…
            </p>
          )}
          {phase === "done" && (
            <p className="text-[11px] text-accent-green text-right">
              ✓ Готово — объявление отправлено на публикацию
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={handleClose}
              className="text-sm px-4 py-2 rounded-xl text-white/60 hover:text-white/80 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || phase === "done"}
              className="text-sm px-4 py-2 rounded-xl bg-accent-blue text-white font-medium hover:bg-accent-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createPost.isPending
                ? "Уникализируем фото…"
                : phase === "done"
                  ? "Готово ✓"
                  : "Опубликовать"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
