/**
 * Резолв локации объявления по городу (ТЗ):
 *  • Москва        → случайная станция метро (кольцо + БКЛ);
 *  • Санкт-Петербург → случайная центральная станция метро;
 *  • другой город  → примерный адрес в центре от нейронки (или null → геокод по городу).
 *
 * Вызывается хендлером avito-post-listing на момент публикации.
 */
import { randomMoscowMetro } from "@/lib/constants/moscow-metro";
import { randomSpbCenterMetro } from "@/lib/constants/spb-metro";
import { inventCentralAddress } from "@/lib/ai/address-inventor";

export interface ResolvedLocation {
  city: string;
  metro: string | null;
  address: string | null;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, "е");
}

const MOSCOW = new Set(["москва", "мск", "moscow"]);
const SPB = new Set([
  "санкт-петербург",
  "санкт петербург",
  "петербург",
  "питер",
  "спб",
  "spb",
  "saint petersburg",
  "st petersburg",
]);

export async function resolveListingLocation(city: string): Promise<ResolvedLocation> {
  const c = (city || "Москва").trim();
  const key = norm(c);

  if (MOSCOW.has(key)) {
    return { city: c, metro: randomMoscowMetro(), address: null };
  }
  if (SPB.has(key)) {
    return { city: c, metro: randomSpbCenterMetro(), address: null };
  }
  const address = await inventCentralAddress(c);
  return { city: c, metro: null, address };
}
