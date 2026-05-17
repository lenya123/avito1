import Link from "next/link";
import { cn } from "@/utils/cn";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden p-8 max-w-md w-full text-center",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "backdrop-blur-xl",
          "border border-glass",
          "shadow-card"
        )}
      >
        <h1 className="text-3xl font-bold mb-4">Avito Business</h1>
        <p className="text-white/80 mb-6">Система автоматизации товарного бизнеса на Avito</p>
        <div className="flex flex-col gap-3">
          <Link
            href="/auth/login"
            className="w-full py-3 text-center rounded-xl font-medium bg-accent-blue text-white transition-all hover:opacity-90"
          >
            Войти как клиент
          </Link>
          <Link
            href="/shipper/login"
            className="w-full py-3 text-center rounded-xl font-medium bg-accent-green text-white transition-all hover:opacity-90"
          >
            Войти как отправщик
          </Link>
          <Link
            href="/owner/login"
            className={cn(
              "w-full py-3 text-center rounded-xl font-medium transition-all",
              "bg-white/[0.06] border border-glass text-white",
              "hover:bg-white/[0.12] hover:border-glass-active"
            )}
          >
            Панель владельца
          </Link>
        </div>
      </div>
    </main>
  );
}
