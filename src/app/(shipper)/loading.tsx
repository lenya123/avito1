"use client";

import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="min-h-screen bg-primary pb-20 md:pb-6">
      {/* Header skeleton */}
      <header className="w-full z-40 bg-primary/80 backdrop-blur-glass">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-white">Отправщик</span>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          </div>
        </div>
      </header>

      {/* Content area with spinner */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </main>
    </div>
  );
}
