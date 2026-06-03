"use client";

import { useEffect } from "react";

export default function ShipperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shipper error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-accent-red/15 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-accent-red"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-[15px] font-semibold text-white mb-1">Что-то пошло не так</h2>
      <p className="text-[13px] text-white/50 mb-6 max-w-[280px]">
        {error.message || "Произошла ошибка при загрузке страницы"}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-xl text-[13px] font-medium bg-white/10 text-white active:bg-white/15 transition-colors"
      >
        Попробовать снова
      </button>
    </div>
  );
}
