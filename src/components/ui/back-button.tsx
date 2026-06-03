"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/utils/cn";

interface BackButtonProps {
  href?: string;
  className?: string;
}

export function BackButton({ href, className }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => (href ? router.push(href) : router.back())}
      className={cn(
        "w-9 h-9 rounded-xl",
        "bg-gradient-to-b from-white/[0.1] to-white/[0.05]",
        "border border-glass-subtle",
        "shadow-glass-inset",
        "flex items-center justify-center",
        "text-white/60 hover:text-white/80 hover:border-glass",
        "transition-all duration-200",
        className
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
