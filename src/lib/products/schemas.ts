import { z } from "zod";

/**
 * Единая Zod-схема товара — переиспользуется в owner/seller формах и API.
 * Расширения (e.g. expectedArrivalDate) — через .extend() на уровне вызывающего.
 */
export const productBaseSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  category: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(v)),
    z.number().min(0, "Должно быть ≥ 0")
  ),
  dropPrice: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(v)),
    z.number().min(0, "Должно быть ≥ 0")
  ),
  recommendedPrice: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().min(0, "Должно быть ≥ 0").optional()
  ),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1, "Размер обязателен"),
        quantity: z.coerce.number().int().min(0, "Количество ≥ 0"),
      })
    )
    .default([]),
  oneSizeQuantity: z
    .preprocess(
      (v) => (v === "" || v == null ? 0 : Number(v)),
      z.number().int().min(0, "Должно быть ≥ 0").max(9999, "Слишком большое значение")
    )
    .default(0),
});

export type ProductBaseInput = z.infer<typeof productBaseSchema>;
