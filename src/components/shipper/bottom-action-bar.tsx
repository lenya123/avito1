"use client";

import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import type { OrderFilter } from "@/components/shipper/order-filters";
import { Z_BOTTOM_BAR } from "@/components/shipper/constants";

interface BottomActionBarProps {
  activeFilter: OrderFilter;
  selectedCount: number;
  batchPending: boolean;
  // Collect guards
  canPrint: boolean;
  canUndoPrint: boolean;
  canCancelOrder: boolean;
  canMarkProblem: boolean;
  canUndoProblem: boolean;
  canSetSize: boolean;
  // Tracking guards
  selectedStatuses: Set<string>;
  // Handlers
  onPrintBarcodes: () => void;
  onUndoPrint: () => void;
  onCancelConfirm: () => void;
  onProblemModal: () => void;
  onUndoProblem: () => void;
  onShipConfirm: () => void;
  onUndoShipConfirm: () => void;
  onStartReturn: () => void;
  onCompleteReturnsConfirm: () => void;
  onMarkReturnArrived: () => void;
  onBatchSetSize: () => void;
}

export function BottomActionBar({
  activeFilter,
  selectedCount,
  batchPending,
  canPrint,
  canUndoPrint,
  canCancelOrder,
  canMarkProblem,
  canUndoProblem,
  canSetSize,
  selectedStatuses,
  onPrintBarcodes,
  onUndoPrint,
  onCancelConfirm,
  onProblemModal,
  onUndoProblem,
  onShipConfirm,
  onUndoShipConfirm,
  onStartReturn,
  onCompleteReturnsConfirm,
  onMarkReturnArrived,
  onBatchSetSize,
}: BottomActionBarProps) {
  const isVisible = selectedCount > 0;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 pt-4 px-4 pb-[calc(max(env(safe-area-inset-bottom),12px)+66px)] md:pb-4",
        "bg-gradient-to-t from-primary via-primary/95 to-primary/80 backdrop-blur-xl border-t border-glass",
        `transition-all duration-200 ${Z_BOTTOM_BAR}`,
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
      )}
    >
      <div className="max-w-4xl mx-auto space-y-2">
        {activeFilter === "collect" && (
          <>
            {canPrint && (
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  onClick={onPrintBarcodes}
                  isLoading={batchPending}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  Напечатать ({selectedCount})
                </Button>
                {canMarkProblem && (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={onProblemModal}
                    isLoading={batchPending}
                    title="Отметить проблему"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                      />
                    </svg>
                  </Button>
                )}
              </div>
            )}
            {canUndoPrint && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={onUndoPrint}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Отменить печать ({selectedCount})
              </Button>
            )}
            {canCancelOrder && (
              <Button
                variant="danger"
                size="lg"
                className="w-full"
                onClick={onCancelConfirm}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                Отменить заказ ({selectedCount})
              </Button>
            )}
            {canUndoProblem && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={onUndoProblem}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Вернуть в работу ({selectedCount})
              </Button>
            )}
            {canSetSize && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={onBatchSetSize}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                  />
                </svg>
                Установить размер ({selectedCount})
              </Button>
            )}
          </>
        )}

        {activeFilter === "ship" && (
          <>
            <div className="flex gap-3">
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={onShipConfirm}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Отправлены ({selectedCount})
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={onProblemModal}
                isLoading={batchPending}
                title="Отметить проблему"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </Button>
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="w-full opacity-70"
              onClick={onUndoPrint}
              isLoading={batchPending}
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              Отменить печать
            </Button>
          </>
        )}

        {activeFilter === "tracking" && (
          <>
            {selectedStatuses.has("not_picked_up") && !selectedStatuses.has("in_transit") && (
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={onStartReturn}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Начать возврат ({selectedCount})
              </Button>
            )}
            {selectedStatuses.has("in_transit") && !selectedStatuses.has("not_picked_up") && (
              <Button
                variant="danger"
                size="lg"
                className="w-full"
                onClick={onUndoShipConfirm}
                isLoading={batchPending}
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Отменить отправку ({selectedCount})
              </Button>
            )}
          </>
        )}

        {activeFilter === "returns" && (
          <>
            {selectedStatuses.has("return_in_transit") &&
              !selectedStatuses.has("return_arrived") && (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={onMarkReturnArrived}
                  isLoading={batchPending}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                  Возврат прибыл ({selectedCount})
                </Button>
              )}
            {selectedStatuses.has("return_arrived") &&
              !selectedStatuses.has("return_in_transit") && (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={onCompleteReturnsConfirm}
                  isLoading={batchPending}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Возвраты забраны ({selectedCount})
                </Button>
              )}
          </>
        )}
      </div>
    </div>
  );
}
