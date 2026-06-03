"use client";

import { Spinner } from "@/components/ui";

export default function Loading() {
  // Мобиле: только BottomNav (64px), Header скрыт
  // Desktop: Header (64px), BottomNav скрыт
  return (
    <main className="flex items-center justify-center h-[calc(100dvh-64px)]">
      <Spinner size="lg" />
    </main>
  );
}
