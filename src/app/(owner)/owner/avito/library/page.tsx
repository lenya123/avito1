"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { BackButton, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { usePresets, useUploadPresets, type PresetKind } from "@/hooks/use-avito";

/**
 * Библиотека медиа для автопостинга (новая система avito_media_presets с лестницей).
 *  • preview     — превью-обложки с инета (кандидаты обложки);
 *  • photoset    — живые фотосеты (9 фото в альбоме, группировка set_key);
 *  • photozone   — готовые фотозоны (референсы для AI-генерации);
 *  • personality — фото популярных личностей (референсы для AI-генерации);
 *  • ai-preview  — одобренные AI-генерации (только просмотр; пополняется ботом).
 *
 * Не путать с легаси-страницей /owner/avito/presets (старые таблицы
 * avito_cover_presets / avito_photoset_presets).
 */

interface UploadSection {
  kind: Exclude<PresetKind, "cover" | "ai-preview">;
  title: string;
  hint: string;
  grouped?: boolean; // photoset → отдельный альбом (set_key)
}

const SECTIONS: UploadSection[] = [
  { kind: "preview", title: "Превью с инета", hint: "Кандидаты обложки (слот 1)" },
  { kind: "photoset", title: "Живые фотосеты", hint: "9 фото в альбоме → слоты 2–10", grouped: true },
  { kind: "photozone", title: "Фотозоны", hint: "Референсы для AI-генерации «Фотозона»" },
  { kind: "personality", title: "Личности", hint: "Референсы для AI-генерации «Личность»" },
];

export default function AvitoLibraryPage() {
  const { data, isLoading } = usePresets();
  const upload = useUploadPresets();
  const [error, setError] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const presets = data?.presets ?? [];
  const sets = data?.sets ?? [];

  const handleUpload = async (section: UploadSection, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyKind(section.kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", section.kind);
      if (section.grouped) fd.append("set_key", `set-${Date.now()}`);
      Array.from(files).forEach((f) => fd.append("files", f));
      await upload.mutateAsync(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusyKind(null);
      const el = inputs.current[section.kind];
      if (el) el.value = "";
    }
  };

  const aiPreviews = presets.filter((p) => p.kind === "ai-preview" && p.is_active);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <BackButton href="/owner/avito" />
        <div>
          <h1 className="text-xl font-bold text-white">Библиотека фото</h1>
          <p className="text-white/40 text-sm">Превью, фотосеты, фотозоны и личности · ротация по лестнице</p>
        </div>
      </motion.div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-accent-red/10 border border-accent-red/30 text-sm text-accent-red">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <section
              key={section.kind}
              className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold text-white">{section.title}</h2>
                <button
                  onClick={() => inputs.current[section.kind]?.click()}
                  disabled={busyKind === section.kind}
                  className="text-sm px-3 py-1.5 rounded-xl bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-40"
                >
                  {busyKind === section.kind ? "Загрузка…" : "+ Загрузить"}
                </button>
                <input
                  ref={(el) => {
                    inputs.current[section.kind] = el;
                  }}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUpload(section, e.target.files)}
                />
              </div>
              <p className="text-xs text-white/40 mb-3">{section.hint}</p>

              {section.grouped ? (
                sets.length === 0 ? (
                  <p className="text-sm text-white/30">Нет фотосетов</p>
                ) : (
                  <div className="space-y-1.5">
                    {sets.map((s) => (
                      <div
                        key={s.set_key}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-glass-minimal"
                      >
                        <span className="text-sm text-white truncate">{s.title || s.set_key}</span>
                        <span className="text-xs text-white/50 flex-shrink-0">
                          {s.photo_count} фото · использован {s.usage_count}×
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                (() => {
                  const items = presets
                    .filter((p) => p.kind === section.kind && p.is_active)
                    .sort((a, b) => (a.usage_count ?? 0) - (b.usage_count ?? 0));
                  return items.length === 0 ? (
                    <p className="text-sm text-white/30">Пусто</p>
                  ) : (
                    <>
                      <p className="text-xs text-white/40 mb-2">
                        В ротации: <span className="text-white">{items.length}</span> · счётчик использований у каждой:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((p) => (
                          <span
                            key={p.id}
                            className="text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/60"
                            title={p.last_used_at ? `последний раз: ${p.last_used_at}` : "ещё не использовалась"}
                          >
                            использован {p.usage_count ?? 0}×
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()
              )}
            </section>
          ))}

          {/* AI-превью — только просмотр (пополняется через подтверждение в боте) */}
          <section className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass">
            <h2 className="text-base font-semibold text-white mb-1">AI-превью (одобренные)</h2>
            <p className="text-xs text-white/40 mb-3">
              Пополняется через подтверждение «Четко» в Telegram-боте
            </p>
            <div className="flex flex-wrap gap-1.5">
              {aiPreviews.length === 0 ? (
                <p className="text-sm text-white/30">Пока нет одобренных AI-фото</p>
              ) : (
                aiPreviews.map((p) => (
                  <span
                    key={p.id}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/60"
                    )}
                  >
                    использован {p.usage_count ?? 0}×
                  </span>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
