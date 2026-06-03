"use client";

import { Card } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { FinanceData } from "@/hooks/use-owner-finance";

interface DebtsTabProps {
  debts: FinanceData["debts"];
  totalDebt: number;
  treasury: FinanceData["treasury"];
}

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

/**
 * Касса — два направления денежного потока + защита от кассового разрыва.
 * (1) Балансы клиентов (§9.2): пассивная сумма на их внутренних счетах,
 *     физически на картах владельца — держать нетронутой.
 * (2) Должны тебе: ожидаемые поступления — +ВАЙБ-долги клиентов (§7.4) +
 *     комиссии партнёров (§10.4). На картах их ЕЩЁ нет.
 */
export function DebtsTab({ debts, treasury }: DebtsTabProps) {
  const owed = treasury?.customerBalanceOwed ?? 0;
  const vibe = treasury?.vibeDebtTotal ?? 0;
  const partner = treasury?.partnerDebtOwed ?? 0;

  return (
    <div className="space-y-4">
      {/* Балансы клиентов + два потока «должны тебе» */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={cn(
            "p-4 rounded-2xl",
            "bg-gradient-to-b from-accent-orange/[0.12] to-accent-orange/[0.04]",
            "border border-accent-orange/20 shadow-card"
          )}
        >
          <p className="text-2xs uppercase tracking-wider text-accent-orange/80 mb-1">
            Балансы клиентов
          </p>
          <p className="text-2xl font-bold text-white">{rub(owed)}</p>
          <p className="text-xs text-white/50 mt-2 leading-relaxed">
            Пассивная сумма на внутренних балансах клиентов (возвраты, ручные начисления). Запроса
            на выплату нет, но клиент может попросить в любой момент — держи эту сумму на своих
            картах <span className="text-white/70">нетронутой</span>.
          </p>
        </div>

        <div
          className={cn(
            "p-4 rounded-2xl",
            "bg-gradient-to-b from-accent-teal/[0.12] to-accent-teal/[0.04]",
            "border border-accent-teal/20 shadow-card"
          )}
        >
          <p className="text-2xs uppercase tracking-wider text-accent-teal/80 mb-1">
            Должны тебе (+ВАЙБ)
          </p>
          <p className="text-2xl font-bold text-white">{rub(vibe)}</p>
          <p className="text-xs text-white/50 mt-2 leading-relaxed">
            Заказы в долг — клиенты погасят позже. Этих денег на твоих картах{" "}
            <span className="text-white/70">ещё нет</span>, не считай их своим кэшем.
          </p>
        </div>

        <div
          className={cn(
            "p-4 rounded-2xl",
            "bg-gradient-to-b from-accent-blue/[0.12] to-accent-blue/[0.04]",
            "border border-accent-blue/20 shadow-card"
          )}
        >
          <p className="text-2xs uppercase tracking-wider text-accent-blue/80 mb-1">
            Должны тебе (комиссии)
          </p>
          <p className="text-2xl font-bold text-white">{rub(partner)}</p>
          <p className="text-xs text-white/50 mt-2 leading-relaxed">
            Комиссии по отгруженным партнёрским заказам (§10.4). Партнёр платит их тебе отдельно —{" "}
            <span className="text-white/70">ожидаемое поступление</span>, не текущий кэш.
          </p>
        </div>
      </div>

      {/* Объяснение «реального кэша» */}
      <div
        className={cn(
          "p-3 rounded-2xl text-xs leading-relaxed",
          "bg-white/[0.04] border border-glass text-white/55"
        )}
      >
        <span className="text-white/80 font-medium">Реальный свободный кэш</span> = деньги на твоих
        картах <span className="text-accent-orange">−</span> «Балансы клиентов» ({rub(owed)}).
        Ожидаемые поступления — +ВАЙБ-долг клиентов ({rub(vibe)}) и комиссии партнёров (
        {rub(partner)}) — ещё не на картах, не считай их текущими деньгами. Так виден разрыв между
        «кажется, что есть» и «реально свободно» — защита от кассового разрыва.
      </div>

      {/* Список +ВАЙБ-должников */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-white/60">Должники +ВАЙБ</p>
        <p className="text-sm text-white/40">
          {debts.length === 0 ? "никого" : `${debts.length} чел.`}
        </p>
      </div>

      {debts.length === 0 ? (
        <Card>
          <p className="text-center text-white/40 py-6">Никто не должен по +ВАЙБ</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...debts]
            .sort((a, b) => b.debt - a.debt)
            .map((d) => (
              <div
                key={d.id}
                className={cn(
                  "p-3 rounded-2xl",
                  "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
                  "border border-glass shadow-card"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center",
                        "bg-gradient-to-br from-teal-500/20 to-teal-500/10",
                        "border border-teal-500/25"
                      )}
                    >
                      <span className="text-xs font-medium text-white">
                        {(d.username || d.name || "?").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">
                        {d.username ? `@${d.username}` : d.name || "Без имени"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {d.isVibePlus && <span className="text-2xs text-accent-teal">+ВАЙБ</span>}
                        {d.limit && (
                          <span className="text-2xs text-white/40">лимит: {rub(d.limit)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-accent-teal font-bold">{rub(d.debt)}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
