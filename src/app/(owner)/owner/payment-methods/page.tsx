"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  usePaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
  uploadPaymentQr,
  type PaymentMethod,
  type PaymentMethodCreate,
  type PaymentMethodKind,
} from "@/hooks/use-payment-methods";
import { Button, Card, Input, Modal, Empty, ErrorState, Badge, Spinner } from "@/components/ui";

const KIND_LABELS: Record<PaymentMethodKind, string> = {
  card: "Карта",
  sbp: "СБП",
  ip_qr: "ИП — оплата по QR",
};

const KIND_ICONS: Record<PaymentMethodKind, string> = {
  card: "💳",
  sbp: "📱",
  ip_qr: "🧾",
};

function formatRub(n: number | null): string {
  if (n == null) return "без лимита";
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export default function PaymentMethodsPage() {
  const { data, isLoading, error, refetch } = usePaymentMethods();
  const createMutation = useCreatePaymentMethod();
  const updateMutation = useUpdatePaymentMethod();
  const deleteMutation = useDeletePaymentMethod();

  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PaymentMethod | null>(null);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить методы оплаты"
          onRetry={refetch}
        />
      </div>
    );
  }

  const methods = data?.methods || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <Link
            href="/owner/settings"
            className="text-white/50 text-sm hover:underline inline-flex items-center gap-1"
          >
            ← к настройкам
          </Link>
          <h1 className="text-2xl font-bold text-white mt-2">Ферма платёжных карт</h1>
          <p className="text-white/60 mt-1">
            Карты, СБП-телефоны и реквизиты ИП для приёма оплат от клиентов. customer-bot
            автоматически выбирает следующую активную запись с достаточным остатком лимита.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Добавить метод</Button>
      </motion.div>

      {isLoading ? (
        <div className="py-16 flex justify-center">
          <Spinner />
        </div>
      ) : methods.length === 0 ? (
        <Empty
          icon="💳"
          title="Методов оплаты пока нет"
          description="Добавьте хотя бы одну карту или СБП-реквизит — без этого customer-bot не сможет просить клиентов оплачивать заказы."
          action={<Button onClick={() => setCreating(true)}>Добавить первый метод</Button>}
        />
      ) : (
        <div className="space-y-6">
          {([1, 2, 3] as const).map((tier) => {
            const tierMethods = methods.filter((m) => (m.tier ?? 1) === tier);
            if (tierMethods.length === 0) return null;
            const tierLabel =
              tier === 1
                ? "Ступень 1 — основные"
                : tier === 2
                  ? "Ступень 2 — запасные"
                  : "Ступень 3 — резерв";
            return (
              <div key={tier} className="space-y-3">
                <h2 className="text-sm uppercase tracking-wide text-white/45 font-semibold">
                  {tierLabel}
                </h2>
                {tierMethods.map((m, i) => (
                  <PaymentMethodCard
                    key={m.id}
                    method={m}
                    index={i}
                    onEdit={() => setEditing(m)}
                    onDelete={() => setConfirmDelete(m)}
                    onToggleActive={() =>
                      updateMutation.mutate({ id: m.id, isActive: !m.isActive })
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <PaymentMethodModal
          isOpen={creating}
          onClose={() => setCreating(false)}
          onSubmit={async (data) => {
            await createMutation.mutateAsync(data);
            setCreating(false);
          }}
          isSubmitting={createMutation.isPending}
          error={createMutation.error?.message}
        />
      )}

      {editing && (
        <PaymentMethodModal
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          initial={editing}
          onSubmit={async (data) => {
            await updateMutation.mutateAsync({ id: editing.id, ...data });
            setEditing(null);
          }}
          isSubmitting={updateMutation.isPending}
          error={updateMutation.error?.message}
        />
      )}

      {confirmDelete && (
        <Modal
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          title="Удалить метод оплаты?"
        >
          <div className="space-y-4">
            <p className="text-white/70">
              «{confirmDelete.label}» будет удалён безвозвратно. История прошлых платежей в отчётах
              сохранится, но без привязки к этому методу.
            </p>
            <p className="text-xs text-white/50">
              Если хочешь временно отключить (например, пауза по лимиту банка) — используй кнопку
              «Отключить». Удаляй только если карта полностью больше не используется.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Отмена
              </Button>
              <Button
                variant="danger"
                isLoading={deleteMutation.isPending}
                onClick={async () => {
                  await deleteMutation.mutateAsync(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Удалить безвозвратно
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PaymentMethodCard({
  method,
  index,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  method: PaymentMethod;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const usedPct =
    method.monthlyLimit && method.monthlyLimit > 0
      ? Math.min(100, Math.round((method.amountUsedThisMonth / method.monthlyLimit) * 100))
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className={!method.isActive ? "opacity-50" : ""}>
        <div className="flex items-start gap-4">
          <div className="text-3xl" aria-hidden="true">
            {KIND_ICONS[method.kind]}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-white">{method.label}</span>
              <Badge variant="default" size="sm">
                {KIND_LABELS[method.kind]}
              </Badge>
              {!method.isActive && (
                <Badge variant="warning" size="sm">
                  неактивна
                </Badge>
              )}
            </div>

            <div className="text-sm text-white/60 space-y-0.5">
              {method.kind === "card" && (
                <>
                  {method.cardLast4 && <div>Номер: •••• {method.cardLast4}</div>}
                  {method.bankName && <div>Банк: {method.bankName}</div>}
                  {method.holderName && <div>Держатель: {method.holderName}</div>}
                </>
              )}
              {method.kind === "sbp" && (
                <>
                  {method.sbpPhone && <div>СБП: {method.sbpPhone}</div>}
                  {method.bankName && <div>Банк: {method.bankName}</div>}
                  {method.holderName && <div>Держатель: {method.holderName}</div>}
                </>
              )}
              {method.kind === "ip_qr" && (
                <>
                  {method.ipName && <div>ИП: {method.ipName}</div>}
                  <div className="text-xs text-white/50">
                    {method.qrStoragePath
                      ? "QR-код загружен (просмотр при редактировании)"
                      : "QR-код не загружен"}
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs flex-wrap">
              <span className="text-white/50">
                Использовано за месяц:{" "}
                <span className="text-white font-medium">
                  {formatRub(method.amountUsedThisMonth)}
                </span>
              </span>
              {method.monthlyLimit != null && (
                <span className="text-white/50">
                  Лимит:{" "}
                  <span className="text-white font-medium">{formatRub(method.monthlyLimit)}</span>
                </span>
              )}
            </div>

            {usedPct != null && (
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={
                    usedPct >= 90
                      ? "h-full bg-accent-red"
                      : usedPct >= 70
                        ? "h-full bg-accent-orange"
                        : "h-full bg-accent-green"
                  }
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Править
            </Button>
            <Button variant="ghost" size="sm" onClick={onToggleActive}>
              {method.isActive ? "Отключить" : "Включить"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Удалить
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function PaymentMethodModal({
  isOpen,
  onClose,
  initial,
  onSubmit,
  isSubmitting,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial?: PaymentMethod;
  onSubmit: (data: PaymentMethodCreate) => Promise<void>;
  isSubmitting: boolean;
  error?: string;
}) {
  const [kind, setKind] = useState<PaymentMethodKind>(initial?.kind ?? "card");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [cardNumberFull, setCardNumberFull] = useState(
    initial?.cardNumberFull ?? (initial?.cardLast4 ? `•••• •••• •••• ${initial.cardLast4}` : "")
  );
  const [holderName, setHolderName] = useState(initial?.holderName ?? "");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [sbpPhone, setSbpPhone] = useState(initial?.sbpPhone ?? "");
  const [ipName, setIpName] = useState(initial?.ipName ?? "");
  const [qrStoragePath, setQrStoragePath] = useState<string | null>(initial?.qrStoragePath ?? null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [monthlyLimit, setMonthlyLimit] = useState<string>(
    initial?.monthlyLimit != null ? String(initial.monthlyLimit) : ""
  );
  const [tier, setTier] = useState<1 | 2 | 3>(initial?.tier ?? 1);

  const handleQrFileChange = async (file: File) => {
    setQrError(null);
    setQrUploading(true);
    try {
      const path = await uploadPaymentQr(file);
      setQrStoragePath(path);
      setQrPreviewUrl(URL.createObjectURL(file));
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Не удалось загрузить QR");
    } finally {
      setQrUploading(false);
    }
  };

  const cleanCard = cardNumberFull.replace(/[^0-9]/g, "");

  const handleSubmit = async () => {
    const data: PaymentMethodCreate = {
      kind,
      label: label.trim(),
      tier,
      monthlyLimit: monthlyLimit === "" ? null : Number(monthlyLimit),
    };
    if (kind === "card") {
      if (cleanCard.length >= 12) data.cardNumberFull = cardNumberFull;
      data.holderName = holderName.trim();
      data.bankName = bankName.trim();
    }
    if (kind === "sbp") {
      data.sbpPhone = sbpPhone.trim();
      data.holderName = holderName.trim();
      data.bankName = bankName.trim();
    }
    if (kind === "ip_qr") {
      data.qrStoragePath = qrStoragePath;
      data.ipName = ipName.trim();
    }
    await onSubmit(data);
  };

  const canSubmit =
    !!label.trim() &&
    !qrUploading &&
    (kind === "ip_qr"
      ? !!qrStoragePath && !!ipName.trim()
      : kind === "card"
        ? cleanCard.length >= 12 && !!holderName.trim() && !!bankName.trim()
        : !!sbpPhone.trim() && !!holderName.trim() && !!bankName.trim());

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initial ? "Редактировать метод" : "Новый метод оплаты"}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90">
          ⚠️ <b>Эти поля сравниваются с чеком клиента побуквенно</b> — Vision использует их для
          авто-подтверждения оплат. Если хоть один символ разойдётся, чек будет уходить на ручную
          проверку директору каждый раз.
        </div>

        <div>
          <label className="text-sm text-white/60 mb-2 block">Тип</label>
          <div className="flex gap-2">
            {(["card", "sbp", "ip_qr"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={
                  "px-3 py-2 rounded-xl text-sm flex-1 border transition-colors " +
                  (kind === k
                    ? "bg-white/[0.18] text-white border-white/20"
                    : "bg-white/[0.06] text-white/60 border-white/10 hover:text-white")
                }
                disabled={!!initial}
              >
                {KIND_ICONS[k]} {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Название (для внутреннего использования)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === "ip_qr" ? "ИП Иванов" : "Т-Банк Иван"}
          maxLength={100}
        />

        {kind === "card" && (
          <>
            <Input
              label="Номер карты"
              value={cardNumberFull}
              onChange={(e) => setCardNumberFull(e.target.value)}
              placeholder="2200 1234 5678 9012"
            />
            <Input
              label="Держатель"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Иван И. (как в чеках — получатель)"
            />
            <Input
              label="Банк"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Т-Банк"
            />
          </>
        )}

        {kind === "sbp" && (
          <>
            <Input
              label="Телефон для СБП"
              value={sbpPhone}
              onChange={(e) => setSbpPhone(e.target.value)}
              placeholder="+79991234567"
            />
            <Input
              label="Держатель"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Иван И. (как в чеках — получатель)"
            />
            <Input
              label="Банк"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Т-Банк"
            />
          </>
        )}

        {kind === "ip_qr" && (
          <div className="space-y-3">
            <Input
              label="Наименование ИП"
              value={ipName}
              onChange={(e) => setIpName(e.target.value)}
              placeholder="ИП ИВАНОВ ИВАН ИВАНОВИЧ"
              maxLength={255}
            />
            <p className="text-xs text-white/50 -mt-2">
              Введи <b>ровно как видно в банковском чеке</b> клиенту (обычно заглавными: «ИП ФАМИЛИЯ
              ИМЯ ОТЧЕСТВО»). Точное совпадение нужно для авто-подтверждения оплаты Vision'ом.
            </p>
            <label className="text-sm text-white/60 block pt-2">
              QR-код для оплаты по реквизитам ИП
            </label>
            <p className="text-xs text-white/40">
              Загрузите фото QR-кода (JPG / PNG / WEBP, до 5 МБ). Клиент получит его в боте при
              оплате.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleQrFileChange(file);
              }}
              disabled={qrUploading}
              className="block w-full text-sm text-white/70 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border file:border-white/10 file:bg-white/[0.08] file:text-white/80 hover:file:bg-white/[0.12] file:cursor-pointer"
            />
            {qrUploading && <p className="text-xs text-white/50">Загружаем…</p>}
            {qrError && <p className="text-xs text-accent-red">{qrError}</p>}
            {(qrPreviewUrl || qrStoragePath) && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center gap-3">
                {qrPreviewUrl ? (
                  // Preview только что загруженного файла из локального blob URL
                  <img
                    src={qrPreviewUrl}
                    alt="QR превью"
                    className="w-24 h-24 object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-white/[0.06] flex items-center justify-center text-3xl">
                    🧾
                  </div>
                )}
                <div className="text-xs text-white/60 flex-1 min-w-0">
                  {qrPreviewUrl
                    ? "Новый QR будет сохранён при сохранении метода."
                    : "QR уже загружен ранее. Загрузите новый файл, чтобы заменить."}
                </div>
              </div>
            )}
          </div>
        )}

        <Input
          label="Месячный лимит (пусто = без лимита)"
          type="number"
          value={monthlyLimit}
          onChange={(e) => setMonthlyLimit(e.target.value)}
          placeholder="500000"
        />
        <div>
          <label className="text-sm text-white/60 mb-2 block">Ступень ротации</label>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={
                  "px-3 py-2 rounded-xl text-sm flex-1 border transition-colors " +
                  (tier === t
                    ? "bg-white/[0.18] text-white border-white/20"
                    : "bg-white/[0.06] text-white/60 border-white/10 hover:text-white")
                }
              >
                {t === 1 ? "1 — основные" : t === 2 ? "2 — запасные" : "3 — резерв"}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/45 mt-2">
            Внутри ступени деньги распределяются равномерно (по % заполнения месячного лимита).
            Следующая ступень включается, только когда на текущей все карты исчерпали лимит.
          </p>
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!canSubmit}>
            {initial ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
