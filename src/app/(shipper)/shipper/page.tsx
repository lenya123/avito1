"use client";

import { useState, useMemo, useCallback, useReducer } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button, Modal } from "@/components/ui";
import { cn } from "@/utils/cn";
import { OrderCardSkeleton } from "@/components/shipper/order-card";
import { PrintModal } from "@/components/shipper/print-modal";
import { QualityDisputeModal } from "@/components/shipper/quality-dispute-modal";
import { PickupPointModal } from "@/components/shipper/pickup-point-modal";
import { FILTER_STATUSES, type OrderFilter } from "@/components/shipper/order-filters";
import { DaySummary } from "@/components/shipper/day-summary";
import { CollectTab } from "@/components/shipper/collect-tab";
import { ShipTab } from "@/components/shipper/ship-tab";
import { ReturnsTab } from "@/components/shipper/returns-tab";
import { HistoryTab } from "@/components/shipper/history-tab";
import { BottomActionBar } from "@/components/shipper/bottom-action-bar";
import { ConfirmModals } from "@/components/shipper/confirm-modals";
import {
  useShipperOrders,
  useBatchOrderAction,
  useOrderAction,
  useSetOrderSize,
  type ShipperOrder,
} from "@/hooks/use-shipper-orders";
import { Z_HEADER } from "@/components/shipper/constants";
import { useShipperStock, type StockProductSize } from "@/hooks/use-shipper-stock";

// ─── Haptic ──────────────────────────────────────────────────────────

function haptic(style: "light" | "medium" | "heavy" = "light") {
  const ms = style === "light" ? 10 : style === "medium" ? 20 : 30;
  try {
    navigator?.vibrate?.(ms);
  } catch {
    // silently ignore — desktop or unsupported
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function ShipperOrdersPage() {
  const [activeFilter, setActiveFilter] = useState<OrderFilter>("collect");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // All modal state in one place — single state update, single re-render
  type ModalType =
    | null
    | "print"
    | "cancel"
    | "pickupPoint"
    | "ship"
    | "undoShip"
    | "completeReturns"
    | "startReturn"
    | "problem"
    | "batchSize";
  type ModalState = {
    open: ModalType;
    startReturnSingleId: string | null;
    disputeOrderId: string | null;
    disputeOrderNumber: number;
  };
  type ModalAction =
    | { type: "open"; modal: ModalType; startReturnSingleId?: string }
    | { type: "close" }
    | { type: "openDispute"; orderId: string; orderNumber: number }
    | { type: "closeDispute" };

  const [modal, dispatchModal] = useReducer(
    (state: ModalState, action: ModalAction): ModalState => {
      switch (action.type) {
        case "open":
          return {
            ...state,
            open: action.modal,
            startReturnSingleId: action.startReturnSingleId ?? null,
          };
        case "close":
          return { ...state, open: null, startReturnSingleId: null };
        case "openDispute":
          return {
            ...state,
            disputeOrderId: action.orderId,
            disputeOrderNumber: action.orderNumber,
          };
        case "closeDispute":
          return { ...state, disputeOrderId: null };
        default:
          return state;
      }
    },
    { open: null, startReturnSingleId: null, disputeOrderId: null, disputeOrderNumber: 0 }
  );

  // ─── Data fetching ──────────────────────────────────────────
  //
  // Один запрос на все активные статусы — счётчики и карточки берут данные
  // из одного источника (нет race-condition «карточка есть, счётчик 0»).
  // History — отдельный запрос (пагинация + сортировка по updated_at),
  // живёт внутри HistoryTab.

  const {
    data: allOrders,
    isLoading: isLoadingAll,
    error: errorAll,
    refetch,
  } = useShipperOrders({
    statuses: ["paid", "collecting", "problem", "return"],
  });

  const isHistoryTab = activeFilter === "history";

  // Карточки текущего таба — фильтрация на клиенте по статусам таба.
  // Дополнительно: для таба «Собрать» скрываем problem_type='out_of_stock' —
  // эти заказы решаются автоматически (auto-resume-problem при поступлении
  // возврата либо expire-send-by по дедлайну), отправщику делать нечего.
  // bad_barcode остаётся видимым: ждёт новый трек от клиента, потом отправщик
  // жмёт «Вернуть в работу» (`undo_problem`).
  const filteredOrders = useMemo(() => {
    if (!allOrders || isHistoryTab) return [];
    const tabStatuses = FILTER_STATUSES[activeFilter];
    if (tabStatuses.length === 0) return [];
    let list = allOrders.filter((o) => tabStatuses.includes(o.status));
    if (activeFilter === "collect") {
      list = list.filter((o) => !(o.status === "problem" && o.problem_type === "out_of_stock"));
    }
    return list;
  }, [allOrders, activeFilter, isHistoryTab]);

  const isLoading = isHistoryTab ? false : isLoadingAll;
  const error = isHistoryTab ? null : errorAll;

  const batchAction = useBatchOrderAction();
  const orderAction = useOrderAction();
  const setOrderSize = useSetOrderSize();

  const { data: stockProducts } = useShipperStock();

  const stockSizesMap = useMemo(() => {
    const map = new Map<string, StockProductSize[]>();
    if (!stockProducts) return map;
    for (const product of stockProducts) {
      if (product.sizes.length > 0) {
        map.set(product.id, product.sizes);
      }
    }
    return map;
  }, [stockProducts]);

  // ─── Computed counts ────────────────────────────────────────

  const filterCounts = useMemo(() => {
    const counts: Record<OrderFilter, number> = {
      collect: 0,
      ship: 0,
      returns: 0,
      history: 0,
    };
    if (!allOrders) return counts;

    allOrders.forEach((order) => {
      const status = order.status;
      // collect-таб скрывает problem/out_of_stock — в счётчике тоже исключаем
      if (FILTER_STATUSES.collect.includes(status)) {
        if (!(status === "problem" && order.problem_type === "out_of_stock")) counts.collect++;
      }
      if (FILTER_STATUSES.ship.includes(status)) counts.ship++;
      if (FILTER_STATUSES.returns.includes(status)) counts.returns++;
    });
    // history count is not shown — loaded via separate query
    return counts;
  }, [allOrders]);

  // ─── Collect grouping ──────────────────────────────────────

  const { urgentOrders, normalOrders, problemOrders } = useMemo(() => {
    if (activeFilter !== "collect" || !filteredOrders)
      return { urgentOrders: [], normalOrders: [], problemOrders: [] };

    const urgent: ShipperOrder[] = [];
    const normal: ShipperOrder[] = [];
    const problem: ShipperOrder[] = [];

    filteredOrders.forEach((order) => {
      if (order.status === "problem") problem.push(order);
      else if (order.isUrgent) urgent.push(order);
      else normal.push(order);
    });

    return { urgentOrders: urgent, normalOrders: normal, problemOrders: problem };
  }, [activeFilter, filteredOrders]);

  // ─── Ship grouping by delivery service ─────────────────────

  const shipServiceGroups = useMemo(() => {
    if (activeFilter !== "ship" || !filteredOrders) return {};
    const groups: Record<string, ShipperOrder[]> = {};
    filteredOrders.forEach((order) => {
      const service = order.delivery_service;
      if (!groups[service]) groups[service] = [];
      groups[service].push(order);
    });
    return groups;
  }, [activeFilter, filteredOrders]);

  // ─── Selection helpers ─────────────────────────────────────

  const currentOrders = useMemo(() => filteredOrders || [], [filteredOrders]);
  const totalCount = currentOrders.length;
  const selectedCount = selectedIds.size;

  const selectedStatuses = useMemo(() => {
    const statuses = new Set<string>();
    currentOrders.filter((o) => selectedIds.has(o.id)).forEach((o) => statuses.add(o.status));
    return statuses;
  }, [currentOrders, selectedIds]);

  const selectedOrders = useMemo(
    () => currentOrders.filter((o) => selectedIds.has(o.id)),
    [currentOrders, selectedIds]
  );

  const selectedDeliveryServices = useMemo(() => {
    if (selectedOrders.length === 0) return [];
    return Array.from(new Set(selectedOrders.map((o) => o.delivery_service).filter(Boolean)));
  }, [selectedOrders]);

  // Phase E action guards.
  //   collect-tab (общий пул paid + problem):
  //     canPrint        — выделены paid (доступно «Беру в работу»).
  //     canCancelOrder  — выделены paid одним статусом.
  //     canMarkProblem  — выделены paid (отметить «нет в наличии»).
  //     canUndoProblem  — все выделены problem.
  //   ship-tab: печать опциональна (§4.2) — «Сдал в ПВЗ» доступен всегда
  //     для выбранных collecting; печать стикера не блокирует и не гейтит.
  //   Прочее: canSetSize — для Avito-заказов без размера в любом активном статусе.
  const canPrint =
    activeFilter === "collect" &&
    selectedStatuses.size > 0 &&
    Array.from(selectedStatuses).every((s) => s === "paid");
  const canCancelOrder =
    activeFilter === "collect" && selectedStatuses.size === 1 && selectedStatuses.has("paid");
  const canMarkProblem =
    (activeFilter === "collect" || activeFilter === "ship") &&
    selectedStatuses.size > 0 &&
    Array.from(selectedStatuses).every((s) => ["paid", "collecting"].includes(s));
  const canUndoProblem =
    activeFilter === "collect" && selectedStatuses.size === 1 && selectedStatuses.has("problem");
  const canSetSize =
    activeFilter === "collect" &&
    selectedCount > 0 &&
    selectedOrders.some((o) => !o.size && o.product?.id && stockSizesMap.has(o.product.id));

  // For batch size modal: check if all selected orders share the same product
  const batchSizeProductId = useMemo(() => {
    const noSize = selectedOrders.filter((o) => !o.size);
    if (noSize.length === 0) return null;
    const productIds = new Set(noSize.map((o) => o.product?.id).filter(Boolean));
    return productIds.size === 1 ? (noSize[0].product?.id ?? null) : null;
  }, [selectedOrders]);

  const batchSizeOptions = useMemo(() => {
    if (!batchSizeProductId) return [];
    return stockSizesMap.get(batchSizeProductId) || [];
  }, [batchSizeProductId, stockSizesMap]);

  const handleSelect = (id: string) => {
    haptic("light");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === totalCount) setSelectedIds(new Set());
    else setSelectedIds(new Set(currentOrders.map((o) => o.id)));
  };

  const handleSelectGroup = (groupOrders: ShipperOrder[]) => {
    const groupIds = groupOrders.map((o) => o.id);
    const allSelected = groupIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleFilterChange = (filter: OrderFilter) => {
    haptic("medium");
    setActiveFilter(filter);
    setSelectedIds(new Set());
  };

  // ─── Actions ───────────────────────────────────────────────

  const closeModal = useCallback(() => dispatchModal({ type: "close" }), []);

  // Phase E: «Беру в работу» — paid → collecting (БЕЗ физической печати).
  const handlePrintBarcodes = async () => {
    if (selectedIds.size === 0) return;
    const orderIds = Array.from(selectedIds);
    try {
      await batchAction.mutateAsync({ action: "start_collecting", order_ids: orderIds });
      haptic("medium");
      toast.success(`Взято в работу: ${orderIds.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
    setSelectedIds(new Set());
  };

  // Phase E: «Напечатал стикер» — collecting → printed. Открывает модал печати.
  const handleMarkPrinted = () => {
    if (selectedIds.size === 0) return;
    dispatchModal({ type: "open", modal: "print" });
  };

  const handlePrintComplete = async (orderIds: string[]) => {
    try {
      await batchAction.mutateAsync({ action: "mark_printed", order_ids: orderIds });
      haptic("heavy");
      toast.success(`Напечатано: ${orderIds.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка при печати");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleCancelOrder = async () => {
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({ action: "cancel_order", order_ids: Array.from(selectedIds) });
      haptic("heavy");
      toast.success(`Отменено: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отмены заказа");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleUndoProblem = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({ action: "undo_problem", order_ids: Array.from(selectedIds) });
      haptic("medium");
      toast.success(`Возвращено в работу: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка возврата в работу");
    }
    setSelectedIds(new Set());
  };

  const handlePickupPointConfirm = async (selections: Record<string, string | null>) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      // Group selected orders by delivery service, ship each group with its PVZ
      const ordersByService = new Map<string, string[]>();
      for (const order of selectedOrders) {
        const svc = order.delivery_service || "__none__";
        const list = ordersByService.get(svc) || [];
        list.push(order.id);
        ordersByService.set(svc, list);
      }

      const promises = Array.from(ordersByService.entries()).map(([svc, orderIds]) => {
        const pickupPointId = selections[svc] ?? null;
        return batchAction.mutateAsync({
          action: "mark_sent",
          order_ids: orderIds,
          ...(pickupPointId ? { pickup_point_id: pickupPointId } : {}),
        });
      });

      // batch-эндпоинт отвечает 200 даже при per-order провалах
      // ({ processed, failed, errors }). Не проглатываем — показываем итог.
      const results = await Promise.all(promises);
      const processed = results.reduce((s, r) => s + (r?.processed ?? 0), 0);
      const failed = results.reduce((s, r) => s + (r?.failed ?? 0), 0);
      haptic("heavy");
      if (failed > 0) {
        const firstErr = results.flatMap((r) => r?.errors ?? [])[0]?.error;
        toast.error(
          `Не удалось отправить: ${failed}${firstErr ? ` — ${firstErr}` : ""}` +
            (processed > 0 ? `. Отправлено: ${processed}` : "")
        );
      } else {
        toast.success(`Отправлено: ${processed || count}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleMarkProblem = async (
    type: "out_of_stock" | "bad_barcode",
    scope?: "single" | "all"
  ) => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({
        action: "mark_problem",
        order_ids: Array.from(selectedIds),
        problem_type: type,
        problem_scope: scope,
      });
      haptic("heavy");
      toast.warning(`Проблема отмечена: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отметки проблемы");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleUndoShip = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({ action: "undo_ship", order_ids: Array.from(selectedIds) });
      haptic("medium");
      toast.success(`Отправка отменена: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отмены отправки");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleStartReturn = async () => {
    const ids = modal.startReturnSingleId ? [modal.startReturnSingleId] : Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await batchAction.mutateAsync({ action: "start_return", order_ids: ids });
      haptic("heavy");
      toast.success(`Возврат начат: ${ids.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка начала возврата");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleCompleteReturns = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({
        action: "complete_return",
        order_ids: Array.from(selectedIds),
      });
      haptic("heavy");
      toast.success(`Возвраты забраны: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка обработки возвратов");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleMarkReturnArrived = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({
        action: "mark_return_arrived",
        order_ids: Array.from(selectedIds),
      });
      haptic("heavy");
      toast.success(`Возврат прибыл: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отметки прибытия");
    }
    setSelectedIds(new Set());
  };

  const handleSetSize = useCallback(
    async (orderId: string, size: string, productSizeId: string) => {
      try {
        await setOrderSize.mutateAsync({ orderId, size, product_size_id: productSizeId });
        haptic("medium");
        toast.success(`Размер ${size} установлен`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка установки размера");
      }
    },
    [setOrderSize]
  );

  const handleBatchSetSize = async (size: string, productSizeId: string) => {
    const orderIds = selectedOrders.filter((o) => !o.size).map((o) => o.id);
    if (orderIds.length === 0) return;
    try {
      await batchAction.mutateAsync({
        action: "set_size",
        order_ids: orderIds,
        size,
        product_size_id: productSizeId,
      });
      haptic("medium");
      toast.success(`Размер ${size} установлен для ${orderIds.length} заказов`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка установки размера");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleOpenDispute = useCallback((orderId: string, orderNumber: number) => {
    dispatchModal({ type: "openDispute", orderId, orderNumber });
  }, []);

  const handlePickupResult = useCallback(
    async (
      orderId: string,
      result: "picked_up" | "wrong_code" | "wrong_tracking" | "not_found"
    ) => {
      try {
        const res = await fetch(`/api/shipper/orders/${orderId}/pickup-result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        haptic("medium");
        const successText: Record<typeof result, string> = {
          picked_up: "Возврат принят",
          wrong_code: "Отметили: неверный код",
          wrong_tracking: "Отметили: неверный трек",
          not_found: "Отметили: нет на ПВЗ",
        };
        toast.success(successText[result]);
        refetch();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка");
      }
    },
    [refetch]
  );

  const handleSubmitDispute = useCallback(
    async (photos: string[], reason: string) => {
      if (!modal.disputeOrderId) return;
      try {
        await orderAction.mutateAsync({
          orderId: modal.disputeOrderId,
          action: "dispute_return",
          dispute_photos: photos,
          dispute_reason: reason,
        });
        haptic("heavy");
        toast.success("Спор по качеству отправлен");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка отправки спора");
      }
      dispatchModal({ type: "closeDispute" });
      refetch();
    },
    [modal.disputeOrderId, orderAction, refetch]
  );

  // ─── Main render ───────────────────────────────────────────

  return (
    <div className="min-h-dvh md:-mt-16" style={{ overscrollBehavior: "none" }}>
      <header
        className={`sticky top-0 ${Z_HEADER} bg-primary backdrop-blur-xl border-b border-glass`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 md:pt-[76px]">
          <DaySummary
            counts={filterCounts}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 pb-52 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "text-center py-12 rounded-2xl",
              "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
              "border border-glass"
            )}
          >
            <div className="text-4xl mb-3">😔</div>
            <p className="text-white/60 mb-4">Ошибка загрузки заказов</p>
            <Button variant="secondary" onClick={() => refetch()}>
              Повторить
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            className="space-y-4"
          >
            {activeFilter === "collect" && (
              <CollectTab
                urgentOrders={urgentOrders}
                normalOrders={normalOrders}
                problemOrders={problemOrders}
                totalCount={totalCount}
                selectedIds={selectedIds}
                selectedCount={selectedCount}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                stockSizesMap={stockSizesMap}
                onSetSize={handleSetSize}
              />
            )}
            {activeFilter === "ship" && (
              <ShipTab
                serviceGroups={shipServiceGroups}
                totalCount={totalCount}
                selectedIds={selectedIds}
                selectedCount={selectedCount}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                onSelectGroup={handleSelectGroup}
              />
            )}
            {activeFilter === "returns" && (
              <ReturnsTab
                orders={filteredOrders || []}
                selectedIds={selectedIds}
                selectedCount={selectedCount}
                onSelect={handleSelect}
                onSelectAll={handleSelectAll}
                onDispute={handleOpenDispute}
                onPickupResult={handlePickupResult}
              />
            )}
            {activeFilter === "history" && <HistoryTab />}
          </motion.div>
        )}
      </main>

      {!isHistoryTab && (
        <BottomActionBar
          activeFilter={activeFilter}
          selectedCount={selectedCount}
          batchPending={batchAction.isPending}
          canPrint={canPrint}
          canCancelOrder={canCancelOrder}
          canMarkProblem={canMarkProblem}
          canUndoProblem={canUndoProblem}
          canSetSize={canSetSize}
          selectedStatuses={selectedStatuses}
          onPrintBarcodes={handlePrintBarcodes}
          onOpenPrintModal={handleMarkPrinted}
          onCancelConfirm={() => dispatchModal({ type: "open", modal: "cancel" })}
          onProblemModal={() => dispatchModal({ type: "open", modal: "problem" })}
          onUndoProblem={handleUndoProblem}
          onShipConfirm={() => dispatchModal({ type: "open", modal: "pickupPoint" })}
          onUndoShipConfirm={() => dispatchModal({ type: "open", modal: "undoShip" })}
          onStartReturn={() => dispatchModal({ type: "open", modal: "startReturn" })}
          onCompleteReturnsConfirm={() => dispatchModal({ type: "open", modal: "completeReturns" })}
          onMarkReturnArrived={handleMarkReturnArrived}
          onBatchSetSize={() => dispatchModal({ type: "open", modal: "batchSize" })}
        />
      )}

      <PrintModal
        isOpen={modal.open === "print"}
        onClose={closeModal}
        orders={selectedOrders}
        onPrintComplete={handlePrintComplete}
      />

      <PickupPointModal
        isOpen={modal.open === "pickupPoint"}
        onClose={closeModal}
        deliveryServices={selectedDeliveryServices}
        onConfirm={handlePickupPointConfirm}
        isLoading={batchAction.isPending}
      />

      <ConfirmModals
        selectedCount={selectedCount}
        batchPending={batchAction.isPending}
        cancelOpen={modal.open === "cancel"}
        onCancelClose={closeModal}
        onCancelConfirm={handleCancelOrder}
        shipOpen={modal.open === "ship"}
        onShipClose={closeModal}
        onShipConfirm={() => handlePickupPointConfirm({})}
        undoShipOpen={modal.open === "undoShip"}
        onUndoShipClose={closeModal}
        onUndoShipConfirm={handleUndoShip}
        completeReturnsOpen={modal.open === "completeReturns"}
        onCompleteReturnsClose={closeModal}
        onCompleteReturnsConfirm={handleCompleteReturns}
        startReturnOpen={modal.open === "startReturn"}
        startReturnCount={modal.startReturnSingleId ? 1 : selectedCount}
        onStartReturnClose={closeModal}
        onStartReturnConfirm={handleStartReturn}
        problemOpen={modal.open === "problem"}
        onProblemClose={closeModal}
        onMarkProblem={handleMarkProblem}
      />

      <QualityDisputeModal
        isOpen={modal.disputeOrderId !== null}
        onClose={() => dispatchModal({ type: "closeDispute" })}
        onSubmit={handleSubmitDispute}
        orderNumber={modal.disputeOrderNumber}
        isLoading={orderAction.isPending}
      />

      {/* Batch set size modal */}
      <Modal
        isOpen={modal.open === "batchSize"}
        onClose={closeModal}
        title="Установить размер"
        description={
          batchSizeProductId
            ? `Выберите размер для ${selectedOrders.filter((o) => !o.size).length} заказов`
            : undefined
        }
        size="sm"
      >
        {!batchSizeProductId ? (
          <div className="text-center py-4">
            <p className="text-white/60 text-sm">
              Выберите заказы одного товара для группового выбора размера
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={closeModal}>
              Понятно
            </Button>
          </div>
        ) : batchSizeOptions.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-white/60 text-sm">Нет доступных размеров для этого товара</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={closeModal}>
              Закрыть
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {batchSizeOptions.map((sizeOption) => (
              <button
                key={sizeOption.id}
                onClick={() => handleBatchSetSize(sizeOption.size, sizeOption.id)}
                disabled={batchAction.isPending}
                className={cn(
                  "px-3 py-3 rounded-xl text-sm font-medium transition-all",
                  "bg-white/[0.08] border border-glass text-white",
                  "active:scale-95 active:bg-accent-blue/20",
                  "disabled:opacity-50"
                )}
              >
                {sizeOption.size}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
