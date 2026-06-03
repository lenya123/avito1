import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type PaymentMethodKind = "card" | "sbp" | "ip_qr";

export interface PaymentMethod {
  id: string;
  kind: PaymentMethodKind;
  label: string;
  cardNumberFull: string | null;
  cardLast4: string | null;
  holderName: string | null;
  bankName: string | null;
  sbpPhone: string | null;
  ipName: string | null;
  qrStoragePath: string | null;
  monthlyLimit: number | null;
  amountUsedThisMonth: number;
  isActive: boolean;
  tier: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodCreate {
  kind: PaymentMethodKind;
  label: string;
  cardNumberFull?: string | null;
  holderName?: string | null;
  bankName?: string | null;
  sbpPhone?: string | null;
  ipName?: string | null;
  qrStoragePath?: string | null;
  monthlyLimit?: number | null;
  isActive?: boolean;
  tier?: 1 | 2 | 3;
}

/** Загружает фото QR-кода в Storage и возвращает storage_path для сохранения в payment_methods.qr_storage_path. */
export async function uploadPaymentQr(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/owner/payment-methods/qr-upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Не удалось загрузить QR");
  }
  const json = (await res.json()) as { qrStoragePath: string };
  return json.qrStoragePath;
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ["owner", "payment-methods"],
    queryFn: async () => {
      const res = await fetch("/api/owner/payment-methods");
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<{ methods: PaymentMethod[] }>;
    },
  });
}

export function useCreatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PaymentMethodCreate) => {
      const res = await fetch("/api/owner/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Ошибка создания");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "payment-methods"] }),
  });
}

export function useUpdatePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<PaymentMethodCreate>) => {
      const res = await fetch(`/api/owner/payment-methods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Ошибка обновления");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "payment-methods"] }),
  });
}

export function useDeletePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/owner/payment-methods/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка удаления");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "payment-methods"] }),
  });
}
