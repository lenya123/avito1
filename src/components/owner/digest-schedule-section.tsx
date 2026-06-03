"use client";

/**
 * Расписание digest-уведомлений директору и партнёрам.
 *
 * Каждое расписание — это окно работы (start/end в МСК) + шаг между
 * уведомлениями (часов). Должные часы вычисляются как
 * `[start, start+step, start+2*step, ..., end]`. Handler digest'а стреляет
 * каждый час и сам решает на основе этих настроек — отправлять или skip.
 *
 * Изменения через эту панель применяются **на следующем же часовом тике**
 * без рестартов, ручных операций или участия программиста.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, Button } from "@/components/ui";
import { useOwnerSettings, useUpdateOwnerSettings } from "@/hooks/use-owner-settings";
import { cn } from "@/utils/cn";

const STEP_OPTIONS = [1, 2, 3, 4, 6] as const;

type Slice = {
  windowStart: string;
  windowEnd: string;
  stepHours: number;
};

function expectedHours(start: string, end: string, step: number): number[] {
  const [sh] = start.split(":").map((s) => parseInt(s, 10));
  const [eh] = end.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(sh) || Number.isNaN(eh) || step < 1) return [];
  const out: number[] = [];
  for (let h = sh; h <= eh; h++) {
    if ((h - sh) % step === 0) out.push(h);
  }
  return out;
}

function formatHourList(hours: number[]): string {
  if (hours.length === 0) return "—";
  return hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(" · ");
}

export function DigestScheduleSection() {
  const { data: settings, isLoading } = useOwnerSettings();
  const update = useUpdateOwnerSettings();

  type Target = "director" | "partner" | "trumpet";
  const [editing, setEditing] = useState<Target | null>(null);
  const [draft, setDraft] = useState<Slice>({
    windowStart: "10:00",
    windowEnd: "22:00",
    stepHours: 3,
  });

  const directorCurrent: Slice = useMemo(
    () =>
      settings
        ? {
            windowStart: settings.directorNotifyWindowStart,
            windowEnd: settings.directorNotifyWindowEnd,
            stepHours: settings.directorDigestStepHours,
          }
        : { windowStart: "10:00", windowEnd: "22:00", stepHours: 3 },
    [settings]
  );

  const partnerCurrent: Slice = useMemo(
    () =>
      settings
        ? {
            windowStart: settings.partnerNotifyWindowStart,
            windowEnd: settings.partnerNotifyWindowEnd,
            stepHours: settings.partnerDigestStepHours,
          }
        : { windowStart: "10:00", windowEnd: "22:00", stepHours: 3 },
    [settings]
  );

  const trumpetCurrent: Slice = useMemo(
    () =>
      settings
        ? {
            windowStart: settings.trumpetNotifyWindowStart,
            windowEnd: settings.trumpetNotifyWindowEnd,
            stepHours: 0, // не используется в trumpet — расписание серии фиксировано
          }
        : { windowStart: "10:00", windowEnd: "21:00", stepHours: 0 },
    [settings]
  );

  useEffect(() => {
    if (editing === "director") setDraft(directorCurrent);
    else if (editing === "partner") setDraft(partnerCurrent);
    else if (editing === "trumpet") setDraft(trumpetCurrent);
  }, [editing, directorCurrent, partnerCurrent, trumpetCurrent]);

  function startEdit(target: Target) {
    setEditing(target);
  }

  async function save() {
    if (!editing) return;
    let payload: Record<string, unknown>;
    if (editing === "director") {
      payload = {
        directorNotifyWindowStart: draft.windowStart,
        directorNotifyWindowEnd: draft.windowEnd,
        directorDigestStepHours: draft.stepHours,
      };
    } else if (editing === "partner") {
      payload = {
        partnerNotifyWindowStart: draft.windowStart,
        partnerNotifyWindowEnd: draft.windowEnd,
        partnerDigestStepHours: draft.stepHours,
      };
    } else {
      payload = {
        trumpetNotifyWindowStart: draft.windowStart,
        trumpetNotifyWindowEnd: draft.windowEnd,
      };
    }
    await update.mutateAsync(payload);
    setEditing(null);
  }

  if (isLoading || !settings) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="space-y-3"
    >
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider px-1">
        ⏰ Расписание сводок
      </h2>
      <Card>
        <div className="space-y-4">
          <p className="text-xs text-white/60">
            Сводка приходит несколько раз в день внутри окна работы. Шаг — сколько часов между
            соседними уведомлениями. Если очередь чеков пустая — сообщение не уходит, никого не
            будит зря. Изменения применяются на следующем часовом тике (минут пять-десять).
          </p>

          <ScheduleRow
            title="👑 Директору — чеки на ручной проверке"
            current={directorCurrent}
            isEditing={editing === "director"}
            draft={draft}
            setDraft={setDraft}
            onEdit={() => startEdit("director")}
            onCancel={() => setEditing(null)}
            onSave={save}
            isSaving={update.isPending}
            disabled={editing === "partner"}
          />

          <div className="border-t border-white/10" />

          <ScheduleRow
            title="🤝 Партнёрам — чеки от клиентов"
            current={partnerCurrent}
            isEditing={editing === "partner"}
            draft={draft}
            setDraft={setDraft}
            onEdit={() => startEdit("partner")}
            onCancel={() => setEditing(null)}
            onSave={save}
            isSaving={update.isPending}
            disabled={editing === "director" || editing === "trumpet"}
          />

          <div className="border-t border-white/10" />

          <ScheduleRow
            title="📢 Клиентам — напомнить про код возврата"
            description="Окно отправки серии напоминаний (#1 сразу, #2 +30мин, #3 +1ч, #4 +2ч, дальше каждые 3ч). Применяется и когда отправщик «трубит» возвраты на ПВЗ, и когда партнёр трубит свои."
            current={trumpetCurrent}
            isEditing={editing === "trumpet"}
            draft={draft}
            setDraft={setDraft}
            onEdit={() => startEdit("trumpet")}
            onCancel={() => setEditing(null)}
            onSave={save}
            isSaving={update.isPending}
            disabled={editing === "director" || editing === "partner"}
            hideStep
          />

          {update.error && (
            <p className="text-sm text-accent-red">{(update.error as Error).message}</p>
          )}
        </div>
      </Card>
    </motion.section>
  );
}

interface RowProps {
  title: string;
  description?: string;
  current: Slice;
  isEditing: boolean;
  draft: Slice;
  setDraft: (s: Slice) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  disabled: boolean;
  /** Если true — расписание не шаговое (для trumpet — серия с фиксированными
   *  delays, нам важно только окно). Скрываем step-инпут и preview часов. */
  hideStep?: boolean;
}

function ScheduleRow({
  title,
  description,
  current,
  isEditing,
  draft,
  setDraft,
  onEdit,
  onCancel,
  onSave,
  isSaving,
  disabled,
  hideStep,
}: RowProps) {
  const previewHours = hideStep
    ? []
    : expectedHours(
        isEditing ? draft.windowStart : current.windowStart,
        isEditing ? draft.windowEnd : current.windowEnd,
        isEditing ? draft.stepHours : current.stepHours
      );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-medium text-white">{title}</h3>
        {!isEditing && (
          <Button size="sm" variant="ghost" onClick={onEdit} disabled={disabled}>
            Изменить
          </Button>
        )}
      </div>

      {description && <p className="text-xs text-white/60">{description}</p>}

      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Начало (МСК)</label>
              <input
                type="time"
                value={draft.windowStart}
                onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 rounded-lg text-sm",
                  "bg-white/[0.06] border border-glass text-white",
                  "focus:outline-none focus:border-accent-blue"
                )}
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Конец (МСК)</label>
              <input
                type="time"
                value={draft.windowEnd}
                onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 rounded-lg text-sm",
                  "bg-white/[0.06] border border-glass text-white",
                  "focus:outline-none focus:border-accent-blue"
                )}
              />
            </div>
          </div>

          {!hideStep && (
            <div>
              <label className="block text-xs text-white/60 mb-1">Шаг между сводками</label>
              <div className="flex flex-wrap gap-2">
                {STEP_OPTIONS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => setDraft({ ...draft, stepHours: step })}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm border transition",
                      draft.stepHours === step
                        ? "bg-accent-blue/20 border-accent-blue text-white"
                        : "bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]"
                    )}
                  >
                    {step === 1 ? "1 час" : `${step} часа`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!hideStep && (
            <div className="text-xs text-white/60">
              Уведомления придут в:{" "}
              <span className="text-white">{formatHourList(previewHours)}</span> МСК (всего{" "}
              {previewHours.length} раз{previewHours.length === 1 ? "" : "а"} в день).
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Сохраняем…" : "Сохранить"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
              Отмена
            </Button>
          </div>
        </div>
      ) : hideStep ? (
        <div className="text-sm text-white/70">
          Окно:{" "}
          <span className="text-white">
            {current.windowStart}–{current.windowEnd}
          </span>{" "}
          МСК
        </div>
      ) : (
        <div className="text-sm text-white/70">
          Окно:{" "}
          <span className="text-white">
            {current.windowStart}–{current.windowEnd}
          </span>{" "}
          МСК · шаг <span className="text-white">{current.stepHours}ч</span> · придёт в{" "}
          <span className="text-white">{formatHourList(previewHours)}</span>
        </div>
      )}
    </div>
  );
}
