"use client";

/**
 * Просмотр чека оплаты на странице заказа (read-only).
 *
 * Показывается ВСЕГДА, когда по заказу есть входящий чек
 * (`order_messages` kind='receipt'), независимо от статуса оплаты —
 * нужен владельцу для аудита и после подтверждения. Если чека нет
 * (оплата с баланса / +ВАЙБ в долг / создан вручную / ещё не прислан) —
 * секция не рендерится вовсе.
 *
 * Ревью оплаты с кнопками Подтвердить/Отклонить здесь больше нет: оно
 * было завязано на легаси-статус `pending_payment` (никогда не
 * срабатывало) и переехало в pending-orders флоу.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, Modal } from "@/components/ui";

interface Receipt {
  url: string;
  createdAt: string;
}

interface OrderPaymentReviewProps {
  orderId: string;
  /** Сообщает родителю, есть ли чек (для выбора раскладки строки). */
  onLoaded?: (hasReceipt: boolean) => void;
}

export function OrderPaymentReview({ orderId, onLoaded }: OrderPaymentReviewProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const fetchReceipts = useCallback(async () => {
    let list: Receipt[] = [];
    try {
      const res = await fetch(`/api/owner/orders/${orderId}/receipt-url`, {
        credentials: "include",
      });
      if (res.ok) {
        const body = (await res.json()) as { receipts?: Receipt[] };
        list = body.receipts ?? [];
      }
    } catch (err) {
      console.error("fetchReceipts failed:", err);
    } finally {
      setReceipts(list);
      setLoaded(true);
      onLoadedRef.current?.(list.length > 0);
    }
  }, [orderId]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Нет чека — секции нет (не показываем пустой блок / «ждём чек»).
  if (!loaded || receipts.length === 0) {
    return null;
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <h3 className="font-semibold text-white">Чек оплаты</h3>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {receipts.map((r) => (
            <button
              key={r.url}
              type="button"
              onClick={() => setOpenUrl(r.url)}
              title={`Чек от ${new Date(r.createdAt).toLocaleString("ru-RU")} — открыть`}
              className="group relative w-24 h-24 rounded-lg overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt="Чек" className="w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition">
                <svg
                  className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35M11 8v6m-3-3h6m4 0a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </CardContent>

      <Modal isOpen={!!openUrl} onClose={() => setOpenUrl(null)} title="Чек оплаты">
        {openUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={openUrl} alt="Чек" className="w-full max-h-[75vh] object-contain rounded-lg" />
        )}
      </Modal>
    </Card>
  );
}
