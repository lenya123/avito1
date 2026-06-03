/**
 * Карточка «Каналы сбыта» (ТЗ Авито-заказы §7.2).
 *
 * Рендерит сравнение «Дроп vs Авито» по метрикам периода. Toggle-фильтр
 * на странице на эту карточку **не действует** — она всегда показывает
 * оба канала, чтобы владелец сразу видел «где деньги». Внутри —
 * параллельные запросы аналитики с channel=drop и channel=avito.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/utils/cn";

interface ChannelsCardProps {
  period?: "week" | "month" | "quarter" | "year" | "custom";
  dateFrom?: string;
  dateTo?: string;
}

interface ChannelData {
  revenue: number;
  cost: number;
  profit: number;
  ordersCount: number;
  aov: number;
  marginPercent: number;
  avitoFeesSum: number;
  avitoMarketingSum: number;
}

async function fetchChannel(
  channel: "drop" | "avito",
  filters: ChannelsCardProps
): Promise<ChannelData> {
  const params = new URLSearchParams();
  params.set("channel", channel);
  if (filters.period) params.set("period", filters.period);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  const res = await fetch(`/api/owner/analytics?${params}`);
  if (!res.ok) throw new Error("analytics fetch failed");
  const j = await res.json();
  return {
    revenue: j.financial?.revenue ?? 0,
    cost: j.financial?.cost ?? 0,
    profit: j.financial?.profit ?? 0,
    ordersCount: j.funnel?.shipped ?? 0,
    aov: j.financial?.aov ?? 0,
    marginPercent:
      j.financial?.revenue > 0
        ? Math.round((j.financial.profit / j.financial.revenue) * 100)
        : 0,
    avitoFeesSum: j.channels?.avito_fees ?? 0,
    avitoMarketingSum: j.channels?.avito_marketing ?? 0,
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("ru");
}

export function ChannelsCard(props: ChannelsCardProps) {
  const dropQ = useQuery({
    queryKey: ["channels-card", "drop", props],
    queryFn: () => fetchChannel("drop", props),
    staleTime: 60 * 1000,
  });
  const avitoQ = useQuery({
    queryKey: ["channels-card", "avito", props],
    queryFn: () => fetchChannel("avito", props),
    staleTime: 60 * 1000,
  });

  const drop = dropQ.data;
  const avito = avitoQ.data;
  const loading = dropQ.isLoading || avitoQ.isLoading;

  // Бейдж сравнения по доле прибыли.
  const totalProfit = (drop?.profit ?? 0) + (avito?.profit ?? 0);
  const dropShare = totalProfit > 0 ? (drop?.profit ?? 0) / totalProfit : 0;
  const avitoShare = totalProfit > 0 ? (avito?.profit ?? 0) / totalProfit : 0;
  const winner = avitoShare > dropShare ? "avito" : dropShare > avitoShare ? "drop" : null;
  const diffPct =
    totalProfit > 0 ? Math.round(Math.abs(avitoShare - dropShare) * 100) : 0;

  return (
    <section
      className={cn(
        "relative rounded-2xl overflow-hidden p-4",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl border border-glass shadow-card"
      )}
    >
      <h3 className="text-sm font-semibold text-white mb-3">📊 Каналы сбыта</h3>

      {loading ? (
        <div className="text-white/40 text-sm">Загрузка...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs">
                <th className="text-left py-1.5 font-normal"></th>
                <th className="text-right py-1.5 font-normal">Дроп</th>
                <th className="text-right py-1.5 font-normal">Авито</th>
              </tr>
            </thead>
            <tbody className="text-white">
              <Row label="Выручка" left={drop?.revenue} right={avito?.revenue} suffix=" ₽" />
              <Row label="Прибыль" left={drop?.profit} right={avito?.profit} suffix=" ₽" />
              <Row
                label="Маржа"
                left={drop?.marginPercent}
                right={avito?.marginPercent}
                suffix="%"
                isPct
              />
              <Row label="Средний чек" left={drop?.aov} right={avito?.aov} suffix=" ₽" />
              <Row
                label="Отгружено"
                left={drop?.ordersCount}
                right={avito?.ordersCount}
                suffix=""
              />
              <tr>
                <td colSpan={3} className="pt-3 pb-1 text-white/40 text-xs">
                  Расходы канала
                </td>
              </tr>
              <Row label="Комиссии Авито" left={null} right={avito?.avitoFeesSum} suffix=" ₽" muted />
              <Row
                label="Маркетинг"
                left={null}
                right={avito?.avitoMarketingSum}
                suffix=" ₽"
                muted
              />
            </tbody>
          </table>
        </div>
      )}

      {winner && diffPct > 0 && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
            winner === "avito"
              ? "bg-accent-blue/15 text-accent-blue"
              : "bg-accent-green/15 text-accent-green"
          )}
        >
          📊 {winner === "avito" ? "Авито" : "Дроп"} прибыльнее на +{diffPct}%
        </div>
      )}
    </section>
  );
}

function Row(props: {
  label: string;
  left: number | null | undefined;
  right: number | null | undefined;
  suffix: string;
  isPct?: boolean;
  muted?: boolean;
}) {
  const fmtCell = (v: number | null | undefined) =>
    v == null ? "—" : props.isPct ? `${v}${props.suffix}` : `${fmt(v)}${props.suffix}`;
  return (
    <tr className={cn("border-t border-white/5", props.muted && "text-white/60")}>
      <td className="py-1.5 text-white/70">{props.label}</td>
      <td className="py-1.5 text-right">{fmtCell(props.left)}</td>
      <td className="py-1.5 text-right">{fmtCell(props.right)}</td>
    </tr>
  );
}
