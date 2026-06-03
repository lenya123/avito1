"use client";

import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface RiskProfile {
  customerId: string;
  name: string | null;
  telegramUsername: string | null;
  isFrozen: boolean;
  isBlocked: boolean;
  totalOrders: number;
  returnCount: number;
  cancelCount: number;
  returnRatePct: number;
  cancelRatePct: number;
  currentDebt: number;
  vibeLimit: number;
  lastOrderAt: string | null;
  openAlertsCount: number;
}

interface FraudAlert {
  id: string;
  alertType: string;
  severity: string | null;
  customerId: string | null;
  customer: {
    id: string;
    name: string | null;
    telegramUsername: string | null;
  } | null;
  details: Record<string, unknown> | null;
  status: string | null;
  createdAt: string;
}

const ALERT_LABELS: Record<string, string> = {
  rapid_orders: "Быстрые заказы",
  return_abuse: "Злоупотр. возвратами",
  suspicious_cancellation: "Подозр. отмена",
  frequent_cancellation: "Частые отмены",
  high_debt: "Высокий долг",
  suspicious_address: "Подозр. адрес",
  vibe_replay: "Повторный чек (+ВАЙБ)",
};

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

/** Человекочитаемое описание алерта по типу + payload-данным. */
function formatAlertDetails(alertType: string, details: Record<string, unknown> | null): string {
  if (!details) return "";
  const num = (k: string) => (typeof details[k] === "number" ? (details[k] as number) : null);
  const str = (k: string) => (typeof details[k] === "string" ? (details[k] as string) : null);
  switch (alertType) {
    case "frequent_cancellation": {
      const total = num("total_orders");
      const rate = num("cancel_rate_pct");
      const th = num("threshold");
      if (total != null && rate != null)
        return `Клиент отменил ${Math.round((rate * total) / 100)} из ${total} заказов (${rate}%${th != null ? `, порог ${th}%` : ""})`;
      break;
    }
    case "return_abuse": {
      const total = num("total_orders");
      const rate = num("return_rate_pct");
      const th = num("threshold");
      if (total != null && rate != null)
        return `Клиент вернул ${Math.round((rate * total) / 100)} из ${total} заказов (${rate}%${th != null ? `, порог ${th}%` : ""})`;
      break;
    }
    case "high_debt": {
      const debt = num("current_debt");
      const limit = num("vibe_limit");
      const ratio = num("ratio_pct");
      if (debt != null && limit != null)
        return `Долг ${formatRub(debt)} из лимита ${formatRub(limit)}${ratio != null ? ` (${ratio}% от лимита)` : ""}`;
      break;
    }
    case "rapid_orders": {
      const n = num("orders_per_hour");
      const th = num("threshold");
      if (n != null) return `${n} заказов за последний час${th != null ? ` (порог ${th})` : ""}`;
      break;
    }
    case "vibe_replay": {
      const opId = str("operation_id");
      const usedFor = str("used_for");
      return `Чек прислан повторно${opId ? ` (операция ${opId})` : ""}${usedFor ? ` — уже использован: ${usedFor}` : ""}`;
    }
  }
  // Fallback — компактный список ключ:значение, чтобы не показывать JSON.
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

function rowClass(p: RiskProfile): string {
  if (p.openAlertsCount > 0 || p.returnRatePct > 50)
    return "bg-accent-red/[0.04] border-l-2 border-accent-red";
  if (p.cancelRatePct > 50 || (p.vibeLimit > 0 && p.currentDebt >= 0.9 * p.vibeLimit))
    return "bg-accent-orange/[0.04] border-l-2 border-accent-orange";
  return "";
}

export default function OwnerSecurityPage() {
  const queryClient = useQueryClient();

  const profilesQuery = useQuery({
    queryKey: ["owner", "security", "risk-profiles"],
    queryFn: async () => {
      const res = await fetch(
        "/api/owner/security/risk-profiles?minReturnRate=30&minCancelRate=50"
      );
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<{ profiles: RiskProfile[] }>;
    },
  });

  const alertsQuery = useQuery({
    queryKey: ["owner", "security", "fraud-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/owner/fraud-alerts");
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<{ alerts: FraudAlert[] }>;
    },
  });

  const runDetectors = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/owner/security/run-detectors", { method: "POST" });
      if (!res.ok) throw new Error("Ошибка");
      return res.json() as Promise<{ insertedAlerts: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "security"] });
    },
  });

  const resolveAlert = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/owner/fraud-alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) throw new Error("Не удалось закрыть алерт");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "security"] });
    },
  });

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white text-2xl font-semibold">Безопасность</h1>
          <p className="text-white/60 text-sm mt-1">
            Подозрительные клиенты и активные алерты. Детекторы прогоняются раз в сутки
            автоматически.
          </p>
        </div>
        <Button onClick={() => runDetectors.mutate()} isLoading={runDetectors.isPending}>
          Запустить детекторы
        </Button>
      </div>

      {runDetectors.isSuccess && (
        <div className="text-accent-green text-sm">
          Добавлено новых алертов: {runDetectors.data.insertedAlerts}
        </div>
      )}

      <section>
        <h2 className="text-white font-semibold mb-3">Подозрительные клиенты</h2>
        <Card variant="glass" padding="none">
          {profilesQuery.isLoading ? (
            <div className="p-10 flex justify-center">
              <Spinner />
            </div>
          ) : (profilesQuery.data?.profiles ?? []).length === 0 ? (
            <div className="p-10 text-center text-white/50 text-sm">
              Все клиенты в пределах нормы.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.04] text-white/50 text-2xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Клиент</th>
                    <th className="text-right px-4 py-3">Заказов</th>
                    <th className="text-right px-4 py-3">% возвр.</th>
                    <th className="text-right px-4 py-3">% отмен</th>
                    <th className="text-right px-4 py-3">Долг / лимит</th>
                    <th className="text-right px-4 py-3">Алерты</th>
                    <th className="text-right px-4 py-3">Актив.</th>
                  </tr>
                </thead>
                <tbody>
                  {profilesQuery.data!.profiles.map((p) => (
                    <tr
                      key={p.customerId}
                      className={`border-t border-glass-minimal ${rowClass(p)}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/owner/clients/${p.customerId}`}
                          className="text-white font-medium hover:underline"
                        >
                          {p.name || "Без имени"}
                        </Link>
                        {p.telegramUsername && (
                          <div className="text-white/50 text-xs">@{p.telegramUsername}</div>
                        )}
                        <div className="flex gap-1 mt-1">
                          {p.isFrozen && (
                            <Badge variant="warning" size="sm">
                              заморожен
                            </Badge>
                          )}
                          {p.isBlocked && (
                            <Badge variant="error" size="sm">
                              заблок.
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white">{p.totalOrders}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={p.returnRatePct > 50 ? "text-accent-red" : "text-white/70"}
                        >
                          {p.returnRatePct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={p.cancelRatePct > 50 ? "text-accent-orange" : "text-white/70"}
                        >
                          {p.cancelRatePct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.vibeLimit > 0 ? (
                          <>
                            <div
                              className={
                                p.currentDebt >= 0.9 * p.vibeLimit
                                  ? "text-accent-red font-semibold"
                                  : "text-white"
                              }
                            >
                              {formatRub(p.currentDebt)}
                            </div>
                            <div className="text-white/40 text-xs">из {formatRub(p.vibeLimit)}</div>
                          </>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.openAlertsCount > 0 ? (
                          <Badge variant="error" size="sm">
                            {p.openAlertsCount}
                          </Badge>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white/50 text-xs">
                        {p.lastOrderAt ? new Date(p.lastOrderAt).toLocaleDateString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-3">Все активные алерты</h2>
        <Card variant="glass" padding="none">
          {alertsQuery.isLoading ? (
            <div className="p-10 flex justify-center">
              <Spinner />
            </div>
          ) : (alertsQuery.data?.alerts ?? []).length === 0 ? (
            <div className="p-10 text-center text-white/50 text-sm">Открытых алертов нет.</div>
          ) : (
            <div className="divide-y divide-glass-minimal">
              {alertsQuery.data!.alerts.map((a) => {
                const description = formatAlertDetails(a.alertType, a.details);
                return (
                  <div key={a.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={
                            a.severity === "high"
                              ? "error"
                              : a.severity === "medium"
                                ? "warning"
                                : "info"
                          }
                          size="sm"
                        >
                          {ALERT_LABELS[a.alertType] || a.alertType}
                        </Badge>
                        {a.customer && (
                          <Link
                            href={`/owner/clients/${a.customer.id}`}
                            className="text-white font-medium hover:underline text-sm"
                          >
                            {a.customer.name || "Без имени"}
                            {a.customer.telegramUsername && ` · @${a.customer.telegramUsername}`}
                          </Link>
                        )}
                      </div>
                      {description && (
                        <p className="text-white/65 text-sm mt-1.5 leading-snug">{description}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-white/40 text-xs whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString("ru-RU")}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => resolveAlert.mutate(a.id)}
                        isLoading={resolveAlert.isPending && resolveAlert.variables === a.id}
                      >
                        Закрыть
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
