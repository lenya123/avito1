"use client";

import { Card, CardContent } from "@/components/ui";

// Заглушка. Полный флоу автопостинга реализуется в Фазе 4
// (выбор товара → название с генерацией → цена → выложить).
export default function CreateListingPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">Создать объявление</h1>
      <Card>
        <CardContent className="p-6">
          <p className="text-white/60 text-sm">
            Флоу автопостинга в разработке (Фаза 4): выбор товара из каталога,
            генерация названия и описания, миксование фото-пресетов и обложек,
            публикация через браузерную автоматизацию с антидетектом на каждый магазин.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
