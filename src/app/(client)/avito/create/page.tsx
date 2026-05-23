"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import { Card, CardContent, Button, Badge, Spinner } from "@/components/ui";
import {
  useAvitoProducts,
  useCreatePost,
  useGenerateListingText,
  usePostJobs,
  usePresets,
  useUploadPresets,
  type PostJob,
} from "@/hooks/use-avito";

const statusBadge: Record<PostJob["status"], { variant: "default" | "success" | "warning" | "error" | "info"; label: string }> = {
  queued: { variant: "info", label: "В очереди" },
  processing: { variant: "warning", label: "Публикуется" },
  published: { variant: "success", label: "Опубликовано" },
  failed: { variant: "error", label: "Ошибка" },
  cancelled: { variant: "default", label: "Отменено" },
};

const inputCls = cn(
  "w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/30",
  "bg-white/[0.06] border border-glass-minimal",
  "focus:outline-none focus:border-accent-blue/50 transition-colors"
);

export default function CreateListingPage() {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const { data: productsData } = useAvitoProducts(search, true);
  const products = productsData?.products ?? [];

  const createPost = useCreatePost();
  const genText = useGenerateListingText();
  const { data: jobsData } = usePostJobs();
  const jobs = jobsData?.jobs ?? [];

  const handleGenTitle = async () => {
    if (!productId) return toast.error("Сначала выберите товар");
    try {
      const r = await genText.mutateAsync({ productId, kind: "title" });
      if (r.title) setTitle(r.title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handleGenDesc = async () => {
    if (!productId) return toast.error("Сначала выберите товар");
    try {
      const r = await genText.mutateAsync({ productId, kind: "description" });
      if (r.description) setDescription(r.description);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const handlePublish = async () => {
    const priceNum = parseInt(price, 10);
    if (!title.trim() || title.trim().length < 3) return toast.error("Введите название");
    if (!priceNum || priceNum < 1) return toast.error("Введите цену");
    try {
      await createPost.mutateAsync({
        productId: productId ?? undefined,
        title: title.trim(),
        price: priceNum,
        description: description.trim() || undefined,
      });
      toast.success("Объявление поставлено в очередь на публикацию");
      setTitle("");
      setPrice("");
      setDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-bold text-white"
      >
        Создать объявление
      </motion.h1>

      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Товар */}
          <div>
            <label className="text-xs text-white/60 block mb-1.5">Товар</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск товара…"
              className={inputCls}
            />
            <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setProductId(p.id);
                    if (!price) setPrice(String(Math.round(p.drop_price)));
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    productId === p.id
                      ? "bg-accent-blue/20 border border-accent-blue/40 text-white"
                      : "bg-white/[0.04] border border-glass-minimal text-white/80 hover:bg-white/[0.08]"
                  )}
                >
                  {p.name}
                  <span className="text-white/40"> · {Math.round(p.drop_price)} ₽</span>
                </button>
              ))}
              {products.length === 0 && (
                <p className="text-xs text-white/40 px-1 py-2">
                  Каталог из панели владельца (заглушка — сид-товары). Начните вводить название.
                </p>
              )}
            </div>
          </div>

          {/* Название + генерация */}
          <div>
            <label className="text-xs text-white/60 block mb-1.5">Название</label>
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название объявления"
                maxLength={50}
                className={inputCls}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenTitle}
                isLoading={genText.isPending}
                disabled={!productId}
              >
                Сген.
              </Button>
            </div>
          </div>

          {/* Цена */}
          <div>
            <label className="text-xs text-white/60 block mb-1.5">Цена, ₽</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Цена"
              className={inputCls}
            />
          </div>

          {/* Описание (опц.) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-white/60">Описание (опционально — иначе сгенерируется)</label>
              <button
                onClick={handleGenDesc}
                disabled={!productId || genText.isPending}
                className="text-xs text-accent-blue disabled:opacity-40"
              >
                Сгенерировать
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Оставьте пустым — система сгенерирует по карточке товара"
              rows={4}
              className={inputCls}
            />
          </div>

          <p className="text-xs text-white/40">
            Город берётся из карточки товара (заглушка → Москва), метро — случайное
            из коричневого кольца. Фото миксуются из пресетов и уникализируются.
          </p>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handlePublish}
            isLoading={createPost.isPending}
          >
            Выложить
          </Button>
        </CardContent>
      </Card>

      <PresetsManager />

      {/* Последние заявки */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-2">Последние выкладки</h2>
        <div className="space-y-2">
          {jobs.length === 0 && (
            <p className="text-xs text-white/40">Пока нет заявок автопостинга.</p>
          )}
          {jobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-glass-minimal"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{j.title}</p>
                <p className="text-xs text-white/40">
                  {Math.round(j.price).toLocaleString("ru")} ₽ · {j.city}
                  {j.metro ? ` · м. ${j.metro}` : ""}
                  {j.error_message ? ` · ${j.error_message}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {j.avito_item_url && (
                  <a
                    href={j.avito_item_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-blue"
                  >
                    Открыть
                  </a>
                )}
                <Badge variant={statusBadge[j.status].variant} size="sm">
                  {statusBadge[j.status].label}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// --- Менеджер пресетов фото (обложки / фотосеты) ---
function PresetsManager() {
  const { data, isLoading } = usePresets();
  const upload = useUploadPresets();
  const [setName, setSetName] = useState("");

  const presets = data?.presets ?? [];
  const covers = presets.filter((p) => p.kind === "cover");
  const sets = Array.from(
    new Set(presets.filter((p) => p.kind === "photoset").map((p) => p.set_key))
  ).filter(Boolean) as string[];

  const doUpload = async (kind: "cover" | "photoset", files: FileList | null) => {
    if (!files || files.length === 0) return;
    const form = new FormData();
    form.append("kind", kind);
    if (kind === "photoset") form.append("set_key", setName || `set-${Date.now()}`);
    Array.from(files).forEach((f) => form.append("files", f));
    try {
      await upload.mutateAsync(form);
      toast.success("Пресеты загружены");
      setSetName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Банк фото (пресеты)</h2>
        <p className="text-xs text-white/40">
          Обложки миксуются с живыми фотосетами и уникализируются на каждой выкладке.
          Часть обложек система генерирует Nano Banana из фото товара.
        </p>

        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <p className="text-xs text-white/60">
            Обложек: {covers.length} · Фотосетов: {sets.length}
          </p>
        )}

        <div className="space-y-2">
          <label className="block text-xs text-white/60">
            Добавить обложки
            <input
              type="file"
              accept="image/*"
              multiple
              className="block mt-1 text-xs text-white/60"
              onChange={(e) => doUpload("cover", e.target.files)}
            />
          </label>

          <div className="pt-1">
            <input
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              placeholder="Название фотосета (напр. set-1)"
              className={inputCls}
            />
            <label className="block text-xs text-white/60 mt-1.5">
              Добавить фото в фотосет
              <input
                type="file"
                accept="image/*"
                multiple
                className="block mt-1 text-xs text-white/60"
                onChange={(e) => doUpload("photoset", e.target.files)}
              />
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
