"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BackButton, Button, Input, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";

interface CoverPreset {
  id: string;
  category: string;
  photo_url: string;
}

interface PhotosetPreset {
  id: string;
  category: string;
  name: string;
  photo_urls: string[];
}

interface PresetsResponse {
  covers: CoverPreset[];
  photosets: PhotosetPreset[];
}

async function fetchPresets(): Promise<PresetsResponse> {
  const res = await fetch("/api/owner/avito-presets");
  if (!res.ok) throw new Error("Не удалось загрузить");
  return res.json();
}

async function uploadFiles(bucket: string, category: string, files: File[]): Promise<string[]> {
  const fd = new FormData();
  fd.append("bucket", bucket);
  fd.append("category", category);
  files.forEach((f) => fd.append("files", f));
  const res = await fetch("/api/owner/avito-presets/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка загрузки");
  return data.urls || [];
}

async function addCover(category: string, photoUrl: string) {
  const res = await fetch("/api/owner/avito-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "cover", category, photoUrl }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
  return res.json();
}

async function addPhotoset(category: string, name: string, photoUrls: string[]) {
  const res = await fetch("/api/owner/avito-presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "photoset", category, name, photoUrls }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
  return res.json();
}

async function deletePreset(kind: "cover" | "photoset", id: string) {
  const res = await fetch("/api/owner/avito-presets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, id }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Ошибка");
  return res.json();
}

export default function AvitoPresetsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["avito-presets"], queryFn: fetchPresets });

  const [coverCategory, setCoverCategory] = useState("одежда");
  const [photosetCategory, setPhotosetCategory] = useState("одежда");
  const [photosetName, setPhotosetName] = useState("");

  const coverInputRef = useRef<HTMLInputElement>(null);
  const photosetInputRef = useRef<HTMLInputElement>(null);

  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPhotoset, setUploadingPhotoset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (vars: { kind: "cover" | "photoset"; id: string }) =>
      deletePreset(vars.kind, vars.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avito-presets"] }),
  });

  const handleUploadCovers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingCover(true);
    setError(null);
    try {
      const urls = await uploadFiles("avito-covers", coverCategory, Array.from(files));
      for (const url of urls) {
        await addCover(coverCategory, url);
      }
      qc.invalidateQueries({ queryKey: ["avito-presets"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleUploadPhotoset = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!photosetName.trim()) {
      setError("Введите название фотосета");
      return;
    }
    setUploadingPhotoset(true);
    setError(null);
    try {
      const urls = await uploadFiles("avito-photosets", photosetCategory, Array.from(files));
      await addPhotoset(photosetCategory, photosetName.trim(), urls);
      setPhotosetName("");
      qc.invalidateQueries({ queryKey: ["avito-presets"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUploadingPhotoset(false);
      if (photosetInputRef.current) photosetInputRef.current.value = "";
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/owner/avito" />
        <div>
          <h1 className="text-xl font-bold text-white">Пресеты для автопостинга</h1>
          <p className="text-white/40 text-sm">Обложки и фотосеты по категориям</p>
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-accent-red/10 border border-accent-red/30 text-sm text-accent-red">
          {error}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="space-y-6"
      >
        {/* Обложки */}
        <section className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass">
          <h2 className="text-lg font-semibold text-white mb-3">Обложки (живые с инета)</h2>

          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <Input
              value={coverCategory}
              onChange={(e) => setCoverCategory(e.target.value)}
              placeholder="Категория (одежда, обувь...)"
              className="flex-1"
            />
            <Button
              onClick={() => coverInputRef.current?.click()}
              isLoading={uploadingCover}
              disabled={!coverCategory.trim()}
            >
              Загрузить обложки
            </Button>
            <input
              ref={coverInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUploadCovers(e.target.files)}
            />
          </div>

          {isLoading ? (
            <Spinner />
          ) : (data?.covers.length || 0) === 0 ? (
            <p className="text-sm text-white/40">Пока нет обложек</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {data?.covers.map((c) => (
                <div key={c.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.photo_url}
                    alt={c.category}
                    className="w-full aspect-square object-cover rounded-lg border border-glass"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-2xs text-white">
                    {c.category}
                  </span>
                  <button
                    onClick={() => deleteMut.mutate({ kind: "cover", id: c.id })}
                    className={cn(
                      "absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70",
                      "text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    )}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Фотосеты */}
        <section className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass">
          <h2 className="text-lg font-semibold text-white mb-3">Фотосеты (живые)</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            <Input
              value={photosetCategory}
              onChange={(e) => setPhotosetCategory(e.target.value)}
              placeholder="Категория"
            />
            <Input
              value={photosetName}
              onChange={(e) => setPhotosetName(e.target.value)}
              placeholder="Название фотосета"
            />
            <Button
              onClick={() => photosetInputRef.current?.click()}
              isLoading={uploadingPhotoset}
              disabled={!photosetCategory.trim() || !photosetName.trim()}
            >
              Загрузить фотосет
            </Button>
            <input
              ref={photosetInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUploadPhotoset(e.target.files)}
            />
          </div>

          {isLoading ? (
            <Spinner />
          ) : (data?.photosets.length || 0) === 0 ? (
            <p className="text-sm text-white/40">Пока нет фотосетов</p>
          ) : (
            <div className="space-y-3">
              {data?.photosets.map((ps) => (
                <div key={ps.id} className="p-3 rounded-xl bg-white/[0.04] border border-glass">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{ps.name}</p>
                      <p className="text-xs text-white/40">
                        {ps.category} · {ps.photo_urls.length} фото
                      </p>
                    </div>
                    <button
                      onClick={() => deleteMut.mutate({ kind: "photoset", id: ps.id })}
                      className="px-2 py-1 rounded text-xs text-accent-red hover:bg-accent-red/10"
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5">
                    {ps.photo_urls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`${ps.name} ${i + 1}`}
                        className="w-full aspect-square object-cover rounded-md border border-glass"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-xs text-white/60">
          <p className="text-accent-blue font-medium mb-1">Как использовать:</p>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>Обложки — для опции «генератор обложек nano-banana» (Gemini хавает фото товара + берёт стиль из пресета)</li>
            <li>Фотосеты — миксуются с фото товара при создании объявления (с уникализацией)</li>
            <li>Категория должна совпадать с категорией товара для автоподбора</li>
          </ul>
        </div>
      </motion.div>
    </main>
  );
}
