"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent, CardHeader, Skeleton, Input } from "@/components/ui";

interface PartnerDetail {
  partner: {
    id: string;
    name: string;
    tgUsername: string | null;
    tgUserId: number | null;
    inviteToken: string;
    isActive: boolean;
    notes: string | null;
    warehouseCity: string | null;
    acceptsVibeDebt: boolean;
    createdAt: string;
    isLinked: boolean;
  };
  products: Array<{
    id: string;
    name: string;
    dropPrice: number;
    isActive: boolean | null;
    isInStock: boolean | null;
    bindings: Array<{
      bindingId: string;
      priority: number;
      warehouseKind: string;
      commission: number;
    }>;
  }>;
  orders: Array<{
    id: string;
    orderNumber: number;
    status: string;
    clientPrice: number;
    commissionSnapshot: number | null;
    partnerPaymentReceivedAt: string | null;
    partnerCommissionPaidAt: string | null;
    trackingNumber: string | null;
    createdAt: string;
  }>;
  debts: Array<{
    id: string;
    orderId: string | null;
    pendingId: string | null;
    amount: number;
    reason: string;
    createdAt: string;
  }>;
  partnerOwesOwner: number;
  otherDebts: number;
}

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

const DEBT_REASON_LABELS: Record<string, string> = {
  size_out_money_received: "размер закончился (деньги пришли партнёру)",
  product_out_money_received: "товар закончился (деньги пришли партнёру)",
  manual: "ручная корректировка",
};

export default function PartnerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "owed">("owed");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state for warehouse_city / accepts_vibe_debt.
  const [editCity, setEditCity] = useState("");
  const [editAcceptsVibe, setEditAcceptsVibe] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/partners/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const body = (await res.json()) as PartnerDetail;
      setData(body);
      setEditCity(body.partner.warehouseCity ?? "");
      setEditAcceptsVibe(body.partner.acceptsVibeDebt);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const { partner, products, orders, debts, partnerOwesOwner, otherDebts } = data;

  const filteredOrders =
    filter === "owed"
      ? orders.filter((o) => o.partnerPaymentReceivedAt && !o.partnerCommissionPaidAt)
      : orders;

  const toggleSelect = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const markPaid = async (orderIds?: string[]) => {
    setError(null);
    setLoadingAction(true);
    try {
      const res = await fetch(`/api/owner/partners/${id}/mark-commission-paid`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderIds ? { orderIds } : {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка");
      }
      setSelected(new Set());
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingAction(false);
    }
  };

  const settleDebt = async (debtId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/owner/partners/${id}/owner-debt-settle`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debtId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка");
      }
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const togglePartnerActive = async () => {
    if (!data) return;
    const willActivate = !data.partner.isActive;
    const confirmMsg = willActivate
      ? "Возобновить работу с партнёром? Его товары снова станут доступны клиентам."
      : "Поставить партнёра на паузу? Его товары перестанут показываться клиентам в новых заказах. Текущие заказы доводятся до конца как обычно.";
    if (!window.confirm(confirmMsg)) return;

    setTogglingActive(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/partners/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: willActivate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка");
      }
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTogglingActive(false);
    }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/partners/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseCity: editCity.trim(),
          acceptsVibeDebt: editAcceptsVibe,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Ошибка");
      }
      await refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMeta(false);
    }
  };

  const metaDirty =
    editCity.trim() !== (partner.warehouseCity ?? "") ||
    editAcceptsVibe !== partner.acceptsVibeDebt;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <Link href="/owner/partners" className="text-sm text-accent-blue">
        ← К списку партнёров
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{partner.name}</h1>
            {!partner.isActive && (
              <span className="px-2 py-1 text-xs rounded-full bg-gradient-to-b from-orange-500/20 to-orange-500/10 border border-orange-500/25 text-accent-orange">
                ⏸ На паузе
              </span>
            )}
          </div>
          <p className="text-sm text-white/60">
            {partner.tgUsername ? `@${partner.tgUsername}` : "без @username"}
            {partner.isLinked ? " · привязан" : " · не привязан"}
          </p>
          <div className="mt-2">
            <Button
              size="sm"
              variant={partner.isActive ? "danger" : "primary"}
              onClick={togglePartnerActive}
              isLoading={togglingActive}
            >
              {partner.isActive ? "⏸ Поставить на паузу" : "▶ Возобновить"}
            </Button>
          </div>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-white/40">💰 Долг по комиссии</p>
            <p
              className={`text-xl font-bold ${
                partnerOwesOwner > 0 ? "text-accent-orange" : "text-accent-green"
              }`}
            >
              {formatRub(partnerOwesOwner)}
            </p>
          </div>
          {otherDebts > 0 && (
            <div>
              <p className="text-xs text-white/40">📒 Прочие долги</p>
              <p className="text-xl font-bold text-accent-orange">{formatRub(otherDebts)}</p>
            </div>
          )}
        </div>
      </div>

      {partner.notes && (
        <Card>
          <CardContent className="text-sm text-white/80 whitespace-pre-wrap">
            {partner.notes}
          </CardContent>
        </Card>
      )}

      {/* Настройки партнёра */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-white">Настройки</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              label="Город склада"
              placeholder="Например, Москва"
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              required
            />
            <p className="text-xs text-white/40 mt-1">
              Показывается клиенту при выборе размера и в карточке заказа — откуда товар физически
              едет.
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editAcceptsVibe}
              onChange={(e) => setEditAcceptsVibe(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded bg-white/[0.08] border-white/20 accent-[#0A84FF]"
            />
            <div className="text-sm">
              <div className="text-white/80">Принимает заказы в долг (+ВАЙБ)</div>
              <div className="text-xs text-white/40">
                Если выключено — клиенты с +ВАЙБ перед оформлением партнёрского размера получат
                предупреждение «только обычная оплата».
              </div>
            </div>
          </label>
          {metaDirty && (
            <Button size="sm" onClick={saveMeta} disabled={savingMeta || !editCity.trim()}>
              {savingMeta ? "Сохраняем…" : "Сохранить"}
            </Button>
          )}
          {error && <p className="text-sm text-accent-red">{error}</p>}
        </CardContent>
      </Card>

      {/* Прочие долги (manual + legacy compensation). Canonical commission-долг
          считается из orders в шапке выше (§10.4). Эта секция — только для
          ручных корректировок и старых compensation-записей до G.5. */}
      {debts.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-white">📒 Прочие долги партнёра ({debts.length})</h3>
            <p className="text-xs text-white/60 mt-1">
              Ручные корректировки и старые записи (до G.5: компенсации за «нет товара/размера»).
              Комиссия по заказам — в карточке долга выше, не здесь.
            </p>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-glass">
              {debts.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-sm gap-3">
                  <div className="flex-1">
                    <p className="text-white">{DEBT_REASON_LABELS[d.reason] ?? d.reason}</p>
                    <p className="text-xs text-white/40">
                      {new Date(d.createdAt).toLocaleString("ru-RU")}
                      {d.orderId && (
                        <>
                          {" · "}
                          <Link
                            href={`/owner/orders/${d.orderId}`}
                            className="text-accent-blue hover:underline"
                          >
                            заказ
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-accent-orange font-bold">{formatRub(d.amount)}</div>
                  <Button size="sm" variant="ghost" onClick={() => settleDebt(d.id)}>
                    Получил
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="font-semibold text-white">Товары партнёра ({products.length})</h3>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-white/60">Не подключён ни к одному товару.</p>
          ) : (
            <div className="divide-y divide-glass">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link
                      href={`/owner/products/${p.id}`}
                      className="text-white hover:text-accent-blue"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-white/40">
                      Цена: {formatRub(p.dropPrice)}
                      {p.bindings.map((b) => (
                        <span key={b.bindingId}>
                          {" · "}#{b.priority}{" "}
                          {b.warehouseKind === "owner" ? "📦 у меня" : "🤝 у партнёра"}
                          {" · "}комиссия {formatRub(b.commission)}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs text-white/60">
                    {!p.isActive && <span>⏸ неактивен</span>}
                    {!p.isInStock && <span>📦 нет в наличии</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="font-semibold text-white">Заказы</h3>
          <div className="flex gap-2">
            <Button
              variant={filter === "owed" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter("owed")}
            >
              С долгом
            </Button>
            <Button
              variant={filter === "all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              Все
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-accent-red mb-2">{error}</p>}
          {filteredOrders.length === 0 ? (
            <p className="text-sm text-white/60">Заказов нет.</p>
          ) : (
            <>
              <div className="divide-y divide-glass">
                {filteredOrders.map((o) => {
                  const owed = o.partnerPaymentReceivedAt && !o.partnerCommissionPaidAt;
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between py-2 text-sm gap-3"
                    >
                      {owed && (
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          className="w-4 h-4"
                        />
                      )}
                      <div className="flex-1">
                        <Link
                          href={`/owner/orders/${o.id}`}
                          className="text-white hover:text-accent-blue"
                        >
                          №{o.orderNumber}
                        </Link>
                        <p className="text-xs text-white/40">
                          {o.status}
                          {o.trackingNumber && ` · ${o.trackingNumber}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40">Сумма</p>
                        <p className="text-white">{formatRub(o.clientPrice)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white/40">Комиссия</p>
                        <p
                          className={
                            owed
                              ? "text-accent-orange"
                              : o.partnerCommissionPaidAt
                                ? "text-accent-green"
                                : "text-white/60"
                          }
                        >
                          {o.commissionSnapshot != null ? formatRub(o.commissionSnapshot) : "—"}
                          {o.partnerCommissionPaidAt && " ✓"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filter === "owed" && filteredOrders.length > 0 && (
                <div className="flex gap-2 pt-4 mt-4 border-t border-glass">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={selected.size === 0 || loadingAction}
                    onClick={() => markPaid(Array.from(selected))}
                  >
                    Получил по выбранным ({selected.size})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={loadingAction}
                    onClick={() => markPaid()}
                  >
                    Получил по всем
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
