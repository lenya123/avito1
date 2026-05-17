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
import { TrackingTab } from "@/components/shipper/tracking-tab";
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

  const { data: allOrders } = useShipperOrders({
    statuses: [
      "awaiting_shipment",
      "collecting",
      "problem",
      "in_transit",
      "delivered_to_point",
      "not_picked_up",
      "return_in_transit",
      "return_arrived",
    ],
  });

  const isHistoryTab = activeFilter === "history";

  const {
    data: filteredOrders,
    isLoading: isLoadingFiltered,
    error: errorFiltered,
    refetch,
  } = useShipperOrders({
    statuses: isHistoryTab ? [] : FILTER_STATUSES[activeFilter],
    search: undefined,
  });

  // History tab manages its own loading — don't show main loading/error for it
  const isLoading = isHistoryTab ? false : isLoadingFiltered;
  const error = isHistoryTab ? null : errorFiltered;

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
      tracking: 0,
      returns: 0,
      history: 0,
    };
    if (!allOrders) return counts;

    allOrders.forEach((order) => {
      const status = order.status;
      if (FILTER_STATUSES.collect.includes(status)) counts.collect++;
      if (FILTER_STATUSES.ship.includes(status)) counts.ship++;
      if (FILTER_STATUSES.tracking.includes(status)) counts.tracking++;
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

  // Collect action guards
  const canPrint =
    activeFilter === "collect" &&
    selectedStatuses.size > 0 &&
    Array.from(selectedStatuses).every((s) => ["awaiting_shipment", "collecting"].includes(s));
  const canUndoPrint =
    activeFilter === "collect" && selectedStatuses.size === 1 && selectedStatuses.has("collecting");
  const canCancelOrder =
    activeFilter === "collect" &&
    selectedStatuses.size === 1 &&
    selectedStatuses.has("awaiting_shipment");
  const canMarkProblem =
    activeFilter === "collect" &&
    selectedStatuses.size > 0 &&
    Array.from(selectedStatuses).every((s) => ["awaiting_shipment", "collecting"].includes(s));
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

  const handlePrintBarcodes = () => {
    if (selectedIds.size === 0) return;
    dispatchModal({ type: "open", modal: "print" });
  };

  const handlePrintComplete = async (orderIds: string[]) => {
    try {
      await batchAction.mutateAsync({ action: "print_barcode", order_ids: orderIds });
      haptic("heavy");
      toast.success(`Напечатано: ${orderIds.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка при печати");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleUndoPrint = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({ action: "undo_print", order_ids: Array.from(selectedIds) });
      haptic("medium");
      toast.success(`Печать отменена: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отмены печати");
    }
    setSelectedIds(new Set());
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
          action: "ship",
          order_ids: orderIds,
          ...(pickupPointId ? { pickup_point_id: pickupPointId } : {}),
        });
      });

      await Promise.all(promises);
      haptic("heavy");
      toast.success(`Отправлено: ${count}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    }
    setSelectedIds(new Set());
    closeModal();
  };

  const handleMarkProblem = async (type: "out_of_stock" | "bad_barcode") => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    try {
      await batchAction.mutateAsync({
        action: "mark_problem",
        order_ids: Array.from(selectedIds),
        problem_type: type,
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

  const handleCardStartReturn = useCallback((orderId: string) => {
    dispatchModal({ type: "open", modal: "startReturn", startReturnSingleId: orderId });
  }, []);

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
            {activeFilter === "tracking" && (
              <TrackingTab
                orders={filteredOrders || []}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onResetSelection={() => setSelectedIds(new Set())}
                onStartReturn={handleCardStartReturn}
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
          canUndoPrint={canUndoPrint}
          canCancelOrder={canCancelOrder}
          canMarkProblem={canMarkProblem}
          canUndoProblem={canUndoProblem}
          canSetSize={canSetSize}
          selectedStatuses={selectedStatuses}
          onPrintBarcodes={handlePrintBarcodes}
          onUndoPrint={handleUndoPrint}
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
