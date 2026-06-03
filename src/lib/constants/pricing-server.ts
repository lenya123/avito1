/**
 * В моно-бизнесе после пивота нет платформенной комиссии — владелец получает всю
 * выручку. Функции оставлены как no-op совместимость для остающихся callers:
 * они постепенно удаляются по мере переработки owner API и дашбордов.
 */

export async function getCurrentPlatformFeePct(): Promise<number> {
  return 0;
}

export function invalidateFeePctCache(): void {
  // noop
}
