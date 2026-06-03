"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";

/**
 * Avito-медиа товара: живые фотосеты (мульти-альбом без лимита), живые обложки-превью,
 * банк AI-обложек по категориям (наполняется автогенерацией + апрувом в боте), настройки
 * автогенерации (тумблер + chat_id получателя) и ручной триггер «Сгенерить сейчас».
 */
interface Album {
  set_key: string;
  title: string;
  photo_count: number;
  usage_count: number;
  thumb: string | null;
}
interface Cover {
  id: string;
  url: string | null;
  usage_count: number;
}
interface Media {
  albums: Album[];
  liveCovers: Cover[];
  aiCovers: Record<string, Cover[]>;
  pendingGenerations: number;
  settings: { autoCoversEnabled: boolean; coverTgChatId: number | null };
}

const AI_CATS: { key: string; label: string }[] = [
  { key: "normal", label: "Живой фон" },
  { key: "photozone", label: "Фотозона" },
  { key: "personality", label: "На модели" },
];

export function ProductAvitoMedia({ productId }: { productId: string }) {
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [chatId, setChatId] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const datasetInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const targetSetKey = useRef<string | null>(null); // куда грузим фотосет (null = новый альбом)
  const didInitSettings = useRef(false); // тумблер+chat_id берём с сервера ОДИН раз — поллинг их не затирает

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/avito/listings/product-media?productId=${productId}`);
      const j = (await r.json()) as Media;
      setMedia(j);
      // Тумблер + chat_id инициализируем ЕДИНОЖДЫ. Иначе поллинг (каждые 5с) затирал то, что
      // пользователь редактирует/только что сохранил: chat_id «пропадал», тумблер «отскакивал».
      if (!didInitSettings.current) {
        setAutoOn(!!j?.settings?.autoCoversEnabled);
        setChatId(j?.settings?.coverTgChatId ? String(j.settings.coverTgChatId) : "");
        didInitSettings.current = true;
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  // Поллинг, пока карточка открыта — ловим завершение генерации и новые одобренные обложки.
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Переход «создал товар → сразу управляй медиа»: если пришли с #avito-media — скроллим к блоку.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#avito-media") {
      const t = setTimeout(
        () =>
          document
            .getElementById("avito-media")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        300
      );
      return () => clearTimeout(t);
    }
  }, []);

  const uploadDataset = async (files: FileList | null) => {
    if (!files?.length) return;
    const setKey = targetSetKey.current;
    setBusy(setKey ?? "new-album");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("productId", productId);
      if (setKey) fd.append("setKey", setKey);
      Array.from(files).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/avito/listings/dataset", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Ошибка загрузки");
      if (j?.skipped > 0)
        setError(`Добавлено ${j.created}, пропущено ${j.skipped} — в альбоме максимум 9 фото.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
      if (datasetInput.current) datasetInput.current.value = "";
    }
  };

  const uploadCovers = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("covers");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("productId", productId);
      Array.from(files).forEach((f) => fd.append("files", f));
      const r = await fetch("/api/avito/listings/covers", { method: "POST", body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка загрузки");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
      if (coverInput.current) coverInput.current.value = "";
    }
  };

  // Единая точка сохранения настроек (тумблер + chat_id). Локально обновляем media.settings —
  // кнопка «Сгенерить сейчас» завязана на сохранённый chat_id и должна появиться/скрыться сразу.
  const persistSettings = async (nextAuto: boolean, nextChatId: string): Promise<boolean> => {
    setSavingSettings(true);
    setError(null);
    try {
      const cid = nextChatId.trim() ? Number(nextChatId.trim()) : null;
      if (nextChatId.trim() && !Number.isInteger(cid)) throw new Error("chat_id должен быть числом");
      const r = await fetch("/api/avito/listings/cover-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, autoCoversEnabled: nextAuto, coverTgChatId: cid }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Ошибка");
      setMedia((m) =>
        m ? { ...m, settings: { autoCoversEnabled: nextAuto, coverTgChatId: cid } } : m
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const saveSettings = () => persistSettings(autoOn, chatId);

  // Тумблер сохраняется сразу (switch = моментальный эффект); при ошибке откатываем визуал.
  const toggleAuto = async () => {
    const next = !autoOn;
    setAutoOn(next);
    const ok = await persistSettings(next, chatId);
    if (!ok) setAutoOn(!next);
  };

  const generateNow = async () => {
    setGenMsg(null);
    setError(null);
    setBusy("gen");
    try {
      const r = await fetch("/api/avito/listings/generate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const j = await r.json().catch(() => ({}));
      setGenMsg(
        r.ok
          ? "Запущена генерация 5 обложек — придут в Telegram на «Четко/Переделай»."
          : j?.error || "Не удалось запустить"
      );
      await load();
    } catch {
      setGenMsg("Ошибка запуска");
    } finally {
      setBusy(null);
    }
  };

  const pending = (media?.pendingGenerations ?? 0) > 0;
  // chat_id «грязный» = в поле не то, что сохранено в БД → показываем «Сохранить»; иначе «Сохранено ✓».
  const savedChatId =
    media?.settings?.coverTgChatId != null ? String(media.settings.coverTgChatId) : "";
  const chatIdDirty = chatId.trim() !== savedChatId;
  const sectionCls =
    "p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass";

  return (
    <div id="avito-media" className="space-y-4">
      {error && <p className="text-xs text-accent-red">{error}</p>}

      {/* Скрытые инпуты загрузки */}
      <input
        ref={datasetInput}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => uploadDataset(e.target.files)}
      />
      <input
        ref={coverInput}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => uploadCovers(e.target.files)}
      />

      {/* ── Автогенерация AI-обложек ── */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-base font-semibold text-white">Автогенерация AI-обложек</h3>
          <button
            type="button"
            onClick={toggleAuto}
            disabled={savingSettings}
            className={cn(
              "relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60",
              autoOn ? "bg-accent-blue" : "bg-white/15"
            )}
            aria-pressed={autoOn}
          >
            <span
              className={cn(
                "inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                autoOn ? "translate-x-[1.375rem]" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-white/40 mb-2">
          Раз в ночь (по МСК) система сама генерирует 5 обложек этого товара и присылает их в
          Telegram на «Четко/Переделай». Одобренные копятся в банк и используются при выкладке.
          Укажи свой chat_id и нажми <span className="text-white/70">/start</span> боту{" "}
          <a
            href="https://t.me/krossovodaiphotosbot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue underline hover:text-accent-blue/80"
          >
            @krossovodaiphotosbot
          </a>{" "}
          (узнать id — команда <span className="text-white/70">/myid</span> там же). ⚠️ Отключи звук
          уведомлений бота — фото приходят ночью.
        </p>
        {/* Строка ввода chat_id показывается ТОЛЬКО при включённом тумблере автогенерации. */}
        {autoOn && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Telegram chat_id (без него AI-генерация не работает)"
              className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 border border-glass-minimal outline-none transition-colors bg-white/[0.06] focus:border-accent-blue/50"
            />
            <button
              type="button"
              onClick={saveSettings}
              disabled={savingSettings || !chatIdDirty}
              className={cn(
                "text-sm px-3 py-2 rounded-xl transition-colors disabled:cursor-default",
                !chatIdDirty && savedChatId
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 disabled:opacity-40"
              )}
            >
              {savingSettings
                ? "Сохраняю…"
                : !chatIdDirty && savedChatId
                  ? "Сохранено ✓"
                  : "Сохранить"}
            </button>
            {/* Кнопка генерации появляется только когда получатель привязан (chat_id сохранён). */}
            {media?.settings?.coverTgChatId ? (
              <button
                type="button"
                onClick={generateNow}
                disabled={busy === "gen" || pending}
                className="text-sm px-3 py-2 rounded-xl border border-glass-minimal text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40"
              >
                ✨ Сгенерить сейчас
              </button>
            ) : (
              <span className="text-[11px] text-white/35 self-center">
                Сохрани chat_id получателя — появится «Сгенерить сейчас»
              </span>
            )}
          </div>
        )}
        {genMsg && <p className="text-[11px] text-white/50 mt-2">{genMsg}</p>}
        {pending && (
          <div className="text-[11px] text-accent-blue/90 mt-2 flex items-center gap-1.5">
            <Spinner size="sm" /> Идёт генерация — обложки появятся после подтверждения в боте…
          </div>
        )}
      </section>

      {/* ── Живые фотосеты (альбомы) ── */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between mb-1 gap-2">
          <h3 className="text-base font-semibold text-white">Живые фотосеты (альбомы)</h3>
          <button
            type="button"
            onClick={() => {
              targetSetKey.current = null;
              datasetInput.current?.click();
            }}
            disabled={busy === "new-album"}
            className="text-sm px-3 py-1.5 rounded-xl bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {busy === "new-album" ? "Загрузка…" : "+ Новый альбом"}
          </button>
        </div>
        <p className="text-xs text-white/40 mb-3">
          9 фото в альбоме. Кол-во альбомов неограничено.
        </p>
        {loading ? (
          <p className="text-sm text-white/30">Загрузка…</p>
        ) : (media?.albums.length ?? 0) === 0 ? (
          <p className="text-sm text-white/30">Пока пусто — добавь первый альбом.</p>
        ) : (
          <div className="space-y-2">
            {media!.albums.map((a) => (
              <div
                key={a.set_key}
                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-glass-minimal"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/5 relative flex-shrink-0">
                  {a.thumb && (
                    <Image src={a.thumb} alt="" fill className="object-cover" sizes="48px" unoptimized />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{a.title}</p>
                  <p className="text-xs text-white/40">
                    {a.photo_count} фото · использован {a.usage_count}×
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    targetSetKey.current = a.set_key;
                    datasetInput.current?.click();
                  }}
                  disabled={busy === a.set_key}
                  className="text-xs px-2.5 py-1 rounded-lg border border-glass-minimal text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {busy === a.set_key ? "…" : "+ фото"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Живые обложки ── */}
      <section className={sectionCls}>
        <div className="flex items-center justify-between mb-1 gap-2">
          <h3 className="text-base font-semibold text-white">Живые обложки (превью с инета)</h3>
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            disabled={busy === "covers"}
            className="text-sm px-3 py-1.5 rounded-xl bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {busy === "covers" ? "Загрузка…" : "+ Добавить"}
          </button>
        </div>
        <p className="text-xs text-white/40 mb-3">
          Красивые картинки-приманки на 1-е фото объявления (обложку). Ротируются с AI-обложками.
        </p>
        {(media?.liveCovers.length ?? 0) === 0 ? (
          <p className="text-sm text-white/30">Пусто.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {media!.liveCovers.map((c) => (
              <div key={c.id} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
                {c.url && <Image src={c.url} alt="" fill className="object-cover" sizes="80px" unoptimized />}
                <span className="absolute bottom-0 inset-x-0 text-[10px] text-white/90 bg-black/50 text-center py-0.5">
                  {c.usage_count}↑
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Банк AI-обложек по категориям ── */}
      <section className={sectionCls}>
        <h3 className="text-base font-semibold text-white mb-1">AI-обложки (банк)</h3>
        <p className="text-xs text-white/40 mb-3">
          Наполняется автогенерацией и подтверждением «Четко» в боте. Используются при выкладке.
        </p>
        <div className="space-y-3">
          {AI_CATS.map((cat) => {
            const items = media?.aiCovers?.[cat.key] ?? [];
            return (
              <div key={cat.key}>
                <p className="text-[11px] text-white/40 mb-1.5">
                  {cat.label} · {items.length}
                </p>
                {items.length === 0 ? (
                  <p className="text-xs text-white/20">пока нет</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className="relative aspect-square rounded-lg overflow-hidden bg-white/5"
                      >
                        {c.url && (
                          <Image src={c.url} alt="" fill className="object-cover" sizes="80px" unoptimized />
                        )}
                        <span className="absolute bottom-0 inset-x-0 text-[10px] text-white/90 bg-black/50 text-center py-0.5">
                          {c.usage_count}↑
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
