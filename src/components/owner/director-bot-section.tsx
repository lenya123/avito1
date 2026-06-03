"use client";

/**
 * Inline-секция настроек «Бот директора» — invite-link, статус привязки,
 * кнопки перевыпуска и отвязки. Встраивается в /owner/settings.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, Button } from "@/components/ui";

interface DirectorLinkInfo {
  inviteUrl: string | null;
  inviteToken: string | null;
  isLinked: boolean;
  directorTgUsername: string | null;
  directorLinkedAt: string | null;
  botConfigured: boolean;
}

export function DirectorBotSection() {
  const [info, setInfo] = useState<DirectorLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/director-link");
      if (!res.ok) throw new Error("Ошибка загрузки");
      setInfo(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const regenerate = async (unlink: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/owner/director-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlink }),
      });
      if (!res.ok) throw new Error("Ошибка");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!info?.inviteUrl) return;
    await navigator.clipboard.writeText(info.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-3"
    >
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
        🤝 Бот директора
      </h2>
      <Card>
        {loading ? (
          <div className="text-sm text-white/50">Загружаем…</div>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-accent-red">{error}</p>
            <Button variant="ghost" onClick={load} size="sm">
              Повторить
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-white mb-1">
                Подтверждение оплат от клиентов
              </h3>
              <p className="text-sm text-white/60">
                Директор получает чеки на проверку и подтверждает оплату текстом «<b>номер да</b>»
                или «<b>номер нет</b>». Владелец операционной частью не занимается.
              </p>
            </div>

            {!info?.botConfigured && (
              <div className="rounded-xl bg-accent-orange/10 border border-accent-orange/30 p-3 text-sm text-white/80 space-y-1">
                <p className="font-semibold">⚠️ Бот не настроен</p>
                <p className="text-xs text-white/60">
                  В <code>.env.local</code> добавьте <code>TELEGRAM_DIRECTOR_BOT_TOKEN</code> и{" "}
                  <code>TELEGRAM_DIRECTOR_BOT_USERNAME</code>, перезапустите сервер.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-white/40">Статус:</span>
              {info?.isLinked ? (
                <>
                  <span className="text-accent-green font-semibold text-sm">✅ Привязан</span>
                  {info.directorTgUsername && (
                    <span className="text-white/70 text-sm">@{info.directorTgUsername}</span>
                  )}
                  {info.directorLinkedAt && (
                    <span className="text-white/40 text-xs">
                      с {new Date(info.directorLinkedAt).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-white/60 text-sm">Не привязан</span>
              )}
            </div>

            {info?.inviteUrl && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-white/40">
                  Ссылка-приглашение
                </div>
                <div className="flex gap-2 flex-wrap items-stretch">
                  <code className="flex-1 min-w-0 break-all bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 self-stretch flex items-center">
                    {info.inviteUrl}
                  </code>
                  <Button onClick={copyLink} variant="ghost" size="sm">
                    {copied ? "✓ Скопировано" : "📋 Копировать"}
                  </Button>
                </div>
                <p className="text-xs text-white/50">
                  Передай ссылку директору — он откроет её и нажмёт «Start» в боте. После этого чеки
                  клиентов на проверку будут приходить ему.
                </p>
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-2 border-t border-white/10">
              <Button
                variant="ghost"
                onClick={() => regenerate(false)}
                isLoading={busy}
                disabled={busy}
                size="sm"
              >
                🔄 Перевыпустить ссылку
              </Button>
              {info?.isLinked && (
                <Button
                  variant="danger"
                  onClick={() => regenerate(true)}
                  isLoading={busy}
                  disabled={busy}
                  size="sm"
                >
                  🚫 Отвязать и перевыпустить
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </motion.section>
  );
}
