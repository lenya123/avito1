import { sortSizeEntries } from "@/utils/sizes";

export const ONE_SIZE_LABEL = "One Size";

export type SizeInput = { size: string; quantity: number };

export type SizeRow = {
  product_id: string;
  size: string;
  initial_quantity: number;
  current_quantity: number;
};

/**
 * Превращает вход формы в строки для insert в product_sizes.
 * Если sizes пустой — вставляется одна строка "One Size" с fallback-количеством.
 * Это единственное место с логикой sizeless → One Size.
 */
export function buildSizeRowsForInsert(
  productId: string,
  sizes: SizeInput[],
  fallbackQty: number
): SizeRow[] {
  if (sizes.length === 0) {
    const qty = Math.max(0, Math.floor(fallbackQty ?? 0));
    return [
      {
        product_id: productId,
        size: ONE_SIZE_LABEL,
        initial_quantity: qty,
        current_quantity: qty,
      },
    ];
  }

  return sortSizeEntries(sizes).map((s) => ({
    product_id: productId,
    size: s.size,
    initial_quantity: s.quantity,
    current_quantity: s.quantity,
  }));
}

/**
 * JSONB-нагрузка для RPC create_product_with_sizes.
 * Если sizes пустой — возвращает пустой массив; RPC сама добавит One Size строку
 * с quantity = p_product.purchase_quantity.
 */
export function buildSizesJsonbForRpc(sizes: SizeInput[]): SizeInput[] {
  if (sizes.length === 0) return [];
  return sortSizeEntries(sizes);
}
