// Общие финансовые утилиты.
// Клиентские лимиты заказов/подписки/депозиты удалены при пивоте на B2B SaaS.

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function calculateClientProfit({
  salePrice,
  purchasePrice,
}: {
  salePrice: number | null;
  purchasePrice: number;
}): number | null {
  if (salePrice === null) return null;
  return salePrice - purchasePrice;
}
