"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button, Card, CardContent, CardHeader, Modal } from "@/components/ui";
import { useVibePaymentAction, type PendingVibePayment } from "@/hooks/use-owner-clients";

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

interface Props {
  customerId: string;
  payments: PendingVibePayment[];
}

// Секция «Ожидают подтверждения» на странице клиента: чеки от клиента,
// которые Vision не смог распознать. Owner подтверждает или отклоняет
// вручную. Видна только при наличии pendingVibePayments.length > 0.
export function PendingVibePaymentsSection({ customerId, payments }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const action = useVibePaymentAction(customerId);

  if (payments.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <span className="text-accent-orange">⚠</span>
            Ожидают подтверждения <span className="text-white/40">({payments.length})</span>
          </h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-col md:flex-row gap-3 md:items-center p-3 rounded-lg bg-white/[0.03] border border-glass"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-white">{formatRub(p.amount)}</p>
                  <p className="text-xs text-white/40">
                    {new Date(p.receivedAt).toLocaleString("ru-RU")}
                  </p>
                  {p.recognizedText && (
                    <p className="text-xs text-white/60 mt-1 truncate" title={p.recognizedText}>
                      Vision: «{p.recognizedText}»
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.receiptFileUrl && (
                    <Button size="sm" variant="ghost" onClick={() => setPhotoUrl(p.receiptFileUrl)}>
                      📷 Фото чека
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => action.mutate({ paymentId: p.id, action: "confirm" })}
                    isLoading={action.isPending && action.variables?.paymentId === p.id}
                  >
                    ✅ Подтвердить
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => action.mutate({ paymentId: p.id, action: "reject" })}
                    isLoading={action.isPending && action.variables?.paymentId === p.id}
                  >
                    ❌ Отклонить
                  </Button>
                </div>
              </div>
            ))}
            {action.error && (
              <p className="text-sm text-accent-red">{(action.error as Error).message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={photoUrl !== null} onClose={() => setPhotoUrl(null)} title="Фото чека">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Чек"
            className="w-full h-auto rounded-lg max-h-[70vh] object-contain mx-auto"
          />
        )}
      </Modal>
    </motion.div>
  );
}
