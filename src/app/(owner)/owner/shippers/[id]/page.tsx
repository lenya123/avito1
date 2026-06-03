"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { formatPrice } from "@/utils/pricing";
import { BackButton, Button, Card, DatePicker, Spinner, Empty, Modal } from "@/components/ui";
import PendulumBar from "@/components/shipper/pendulum-bar";
import { SalesChart, type ChartDataPoint } from "@/components/owner/charts";
import { EditShipperModal } from "@/components/owner/shippers/edit-shipper-modal";
import { useOwnerShipperDetail, useShipperChart } from "@/hooks/use-owner-shipper-detail";
import { useDeleteShipper } from "@/hooks/use-owner-shippers";

type ChartPeriod = "week" | "month" | "custom";

const PERIOD_OPTIONS: { value: ChartPeriod; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "custom", label: "Свой период" },
];

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function displayToIso(display: string): string {
  if (!display) return "";
  const [day, month, year] = display.split(".");
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

const DAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  0: "Вс",
};
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function getScoreColor(score: number) {
  if (score >= 85)
    return {
      bg: "bg-accent-green/20",
      text: "text-accent-green",
      border: "border-accent-green/40",
    };
  if (score >= 60)
    return {
      bg: "bg-accent-orange/20",
      text: "text-accent-orange",
      border: "border-accent-orange/40",
    };
  return { bg: "bg-accent-red/20", text: "text-accent-red", border: "border-accent-red/40" };
}

export default function ShipperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const deleteShipper = useDeleteShipper();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (chartPeriod === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { dateFrom: toISODate(d), dateTo: toISODate(now) };
    }
    if (chartPeriod === "custom") {
      return { dateFrom: displayToIso(customFrom), dateTo: displayToIso(customTo) };
    }
    // month (default) — последние 30 дней
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { dateFrom: toISODate(d), dateTo: toISODate(now) };
  }, [chartPeriod, customFrom, customTo]);

  const { data, isLoading, error, refetch } = useOwnerShipperDetail(id);
  const { data: chartData } = useShipperChart(id, dateFrom, dateTo);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Empty
          title="Ошибка загрузки"
          description="Не удалось загрузить данные отправщика"
          action={
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              Повторить
            </Button>
          }
        />
      </div>
    );
  }

  const { shipper, stats, payouts } = data;
  const score = Math.round(shipper.shipperScore);
  const scoreColor = getScoreColor(score);

  const historySource = chartData?.dailyHistory ?? stats.dailyHistory;
  const granularity = chartData?.chartGranularity ?? stats.chartGranularity ?? "day";
  const chartDataPoints: ChartDataPoint[] = historySource.map((d) => ({
    date: d.date,
    label: d.label,
    orders: d.orders,
    revenue: d.earnings,
    profit: 0,
    invested: 0,
  }));

  const handleDelete = async () => {
    try {
      await deleteShipper.mutateAsync(shipper.id);
      router.replace("/owner/shippers");
    } catch {
      // error handled by mutation
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <BackButton href="/owner/shippers" />
        <div className="flex items-start justify-between mt-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-b from-accent-purple/30 to-accent-purple/15 border border-accent-purple/20 flex items-center justify-center">
              <span className="text-xl text-accent-purple font-medium">
                {shipper.name?.charAt(0).toUpperCase() || "?"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">{shipper.name || "Без имени"}</h1>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-xl text-xs font-medium border",
                    scoreColor.bg,
                    scoreColor.text,
                    scoreColor.border
                  )}
                >
                  ELO {score}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/60 mt-0.5">
                {shipper.telegramUsername && <span>@{shipper.telegramUsername}</span>}
                {shipper.phone && (
                  <>
                    <span className="text-white/20">&middot;</span>
                    <span>{shipper.phone}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-white/40 mt-1">
                С{" "}
                {new Date(shipper.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              aria-label="Редактировать"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </Button>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Удалить
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ELO Visualization */}
      {stats.efficiency && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <PendulumBar data={stats.efficiency} />
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <div className="grid grid-cols-3 divide-x divide-glass">
            {[
              {
                label: "Сегодня",
                orders: stats.today.orders,
                ordersTaken: stats.today.ordersTaken,
                returns: stats.today.returns,
                earnings: stats.today.earnings,
                successRate: stats.today.successRate,
              },
              {
                label: "За месяц",
                orders: stats.month.orders,
                ordersTaken: stats.month.ordersTaken,
                returns: stats.month.returns,
                earnings: stats.month.earnings,
                successRate: stats.month.successRate,
              },
              {
                label: "Всё время",
                orders: stats.allTime.orders,
                ordersTaken: stats.allTime.ordersTaken,
                returns: stats.allTime.returns,
                earnings: stats.allTime.earnings,
                successRate: stats.allTime.successRate,
              },
            ].map((block) => (
              <div key={block.label} className="px-4 py-3 text-center">
                <p className="text-xs text-white/40 mb-2">{block.label}</p>
                <p className="text-lg font-medium text-white">{block.orders}</p>
                <p className="text-xs text-white/60">отправлено</p>
                {block.ordersTaken > 0 && (
                  <p
                    className="text-xs mt-1"
                    title="Доля успешно отправленных заказов от взятых в работу"
                  >
                    <span className="text-white/40">взято </span>
                    <span className="text-white/70">{block.ordersTaken}</span>
                    {block.successRate !== null && (
                      <>
                        <span className="text-white/40"> · </span>
                        <span
                          className={cn(
                            "font-semibold",
                            block.successRate >= 80
                              ? "text-accent-green"
                              : block.successRate >= 50
                                ? "text-accent-orange"
                                : "text-accent-red"
                          )}
                        >
                          {block.successRate}%
                        </span>
                      </>
                    )}
                  </p>
                )}
                {block.returns > 0 && (
                  <p className="text-xs text-accent-orange mt-1">{block.returns} возвр.</p>
                )}
                <p className="text-xs text-accent-green mt-1">{formatPrice(block.earnings)}</p>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <SalesChart
          data={chartDataPoints}
          granularity={granularity}
          visibleMetrics={["revenue"]}
          title="Заработок"
          headerRight={
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setChartPeriod(opt.value);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-xs font-medium transition-all",
                    chartPeriod === opt.value
                      ? "bg-white/[0.15] text-white"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.05]"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
          headerBelow={
            chartPeriod === "custom" ? (
              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <DatePicker label="От" value={customFrom} onChange={setCustomFrom} />
                </div>
                <div className="flex-1">
                  <DatePicker
                    label="До"
                    value={customTo}
                    onChange={setCustomTo}
                    minDate={customFrom ? new Date(displayToIso(customFrom)) : undefined}
                  />
                </div>
              </div>
            ) : undefined
          }
          renderSelected={(bar) => (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-baseline gap-2"
            >
              <span className="text-2xl font-bold text-white">{formatPrice(bar.revenue)}</span>
              <span className="text-sm text-white/40">
                {bar.orders} зак. &middot; {bar.label}
              </span>
            </motion.div>
          )}
        />
      </motion.div>

      {/* Work Schedule */}
      {shipper.workDays && shipper.workDays.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium text-white">Расписание</h3>
                <p className="text-sm text-white/60">
                  {String(shipper.workHourStart).padStart(2, "0")}:00 &mdash;{" "}
                  {String(shipper.workHourEnd).padStart(2, "0")}:00
                </p>
              </div>
              <div className="flex gap-1.5">
                {DAY_ORDER.map((day) => {
                  const isWork = shipper.workDays!.includes(day);
                  const isToday = day === new Date().getDay();
                  return (
                    <span
                      key={day}
                      className={cn(
                        "flex-1 text-center py-2 rounded-xl text-xs font-medium transition-colors",
                        isWork
                          ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/25"
                          : "bg-white/[0.03] text-white/20 border border-transparent",
                        isToday && "ring-1 ring-white/20"
                      )}
                    >
                      {DAY_LABELS[day]}
                    </span>
                  );
                })}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Payouts */}
      {payouts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium text-white">Выплаты</h3>
                {stats.pendingPayout > 0 && (
                  <span className="text-sm text-accent-green">
                    К выплате: {formatPrice(stats.pendingPayout)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between py-2 border-b border-glass last:border-0"
                  >
                    <div>
                      <p className="text-sm text-white/80">
                        {new Date(payout.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                      {payout.note && <p className="text-xs text-white/40">{payout.note}</p>}
                    </div>
                    <span className="text-sm font-medium text-white">
                      {formatPrice(payout.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Edit Modal */}
      <EditShipperModal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          refetch();
        }}
        shipper={{
          id: shipper.id,
          telegramId: null,
          telegramUsername: shipper.telegramUsername,
          name: shipper.name,
          phone: shipper.phone,
          login: null,
          shipperScore: shipper.shipperScore,
          workDays: shipper.workDays,
          workHourStart: shipper.workHourStart,
          workHourEnd: shipper.workHourEnd,
          createdAt: shipper.createdAt,
          today: { shipped: 0, returned: 0, ordersAvailable: 0 },
          month: { shipped: 0, returned: 0, earnings: 0 },
        }}
      />

      {/* Delete Confirmation */}
      <Modal isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} title="Удалить отправщика?">
        <p className="text-sm text-white/60 mb-4">
          Отправщик <span className="text-white">{shipper.name}</span> будет удалён. Это действие
          нельзя отменить.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="flex-1">
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteShipper.isPending}
            className="flex-1"
          >
            Удалить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
