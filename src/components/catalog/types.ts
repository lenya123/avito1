/**
 * Типы для публичного каталога. Расширения — отдельно от
 * `database.generated.ts`, чтобы UI-слой не зависел от deep-вложенных
 * Supabase-relations.
 */

export interface CatalogSize {
  id: string;
  size: string;
  available: number;
  /** Замеры — только в детальном эндпоинте. JSON `{ chest: 50, length: 70, ... }`. */
  measurements?: Record<string, number> | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  drop_price: number;
  recommended_price: number | null;
  photo_urls: string[];
  photo_main_index: number;
  is_in_stock: boolean;
  expected_arrival_date: string | null;
  sizes: CatalogSize[];
}
