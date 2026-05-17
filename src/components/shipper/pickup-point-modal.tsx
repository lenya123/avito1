"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal, ModalFooter, Button, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import {
  usePickupPoints,
  useCreatePickupPoint,
  useDeletePickupPoint,
} from "@/hooks/use-pickup-points";
import { DELIVERY_SERVICE_LABELS } from "@/hooks/use-shipper-orders";

// ─── Types ──────────────────────────────────────────────────

export interface PickupPointSelections {
  [deliveryService: string]: string | null; // service → pickupPointId or null
}

interface PickupPointModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Unique delivery services from selected orders */
  deliveryServices: string[];
  /** Called with a map: deliveryService → pickupPointId (or null) */
  onConfirm: (selections: PickupPointSelections) => void;
  isLoading?: boolean;
}

// ─── Single service step ────────────────────────────────────

function ServiceStep({
  deliveryService,
  selectedId,
  onSelect,
}: {
  deliveryService: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: pickupPoints, isLoading } = usePickupPoints(deliveryService);
  const createPickupPoint = useCreatePickupPoint();
  const deletePickupPoint = useDeletePickupPoint();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddNew = async () => {
    if (!newAddress.trim()) return;
    try {
      const point = await createPickupPoint.mutateAsync({
        delivery_service: deliveryService,
        address: newAddress.trim(),
      });
      onSelect(point.id);
      setShowAddForm(false);
      setNewAddress("");
    } catch {
      // error handled by React Query
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deletePickupPoint.mutateAsync(id);
      if (selectedId === id) onSelect(null);
    } catch {
      // error handled by React Query
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* List */}
      {pickupPoints && pickupPoints.length > 0 ? (
        <div
          className={cn(
            "space-y-2 max-h-[300px] overflow-y-auto overscroll-contain pr-1",
            "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
            "[&::-webkit-scrollbar]:hidden"
          )}
        >
          <AnimatePresence mode="popLayout">
            {pickupPoints.map((point) => (
              <motion.div
                key={point.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(selectedId === point.id ? null : point.id)}
                  disabled={deletingId === point.id}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all",
                    "border",
                    selectedId === point.id
                      ? "bg-accent-blue/20 border-accent-blue/40 shadow-[0_0_12px_rgba(10,132,255,0.15)]"
                      : "bg-white/[0.05] border-glass hover:bg-white/[0.08]",
                    deletingId === point.id && "opacity-40"
                  )}
                >
                  {/* Radio circle */}
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all",
                      selectedId === point.id
                        ? "border-accent-blue bg-accent-blue shadow-[0_0_8px_rgba(10,132,255,0.4)]"
                        : "border-white/20"
                    )}
                  >
                    {selectedId === point.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-2 h-2 rounded-full bg-white"
                      />
                    )}
                  </div>

                  {/* Address */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium leading-snug">{point.address}</p>
                    {point.city && <p className="text-xs text-white/40 mt-0.5">{point.city}</p>}
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(point.id);
                    }}
                    disabled={deletingId === point.id}
                    className={cn(
                      "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                      "text-white/20 hover:text-red-400 hover:bg-red-400/20",
                      "transition-all"
                    )}
                    aria-label="Удалить"
                  >
                    {deletingId === point.id ? (
                      <Spinner size="sm" />
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        !showAddForm && (
          <div className="text-sm text-white/40 text-center py-6">Нет сохранённых адресов</div>
        )
      )}

      {/* Add form */}
      <AnimatePresence mode="wait">
        {showAddForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <textarea
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Адрес ПВЗ"
              rows={2}
              className={cn(
                "w-full px-3.5 py-3 rounded-2xl text-sm text-white placeholder-white/20",
                "bg-white/[0.07] border border-glass-active",
                "resize-none outline-none focus:border-accent-blue/40 focus:ring-1 focus:ring-accent-blue/20",
                "transition-colors"
              )}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowAddForm(false);
                  setNewAddress("");
                }}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={handleAddNew}
                isLoading={createPickupPoint.isPending}
                disabled={!newAddress.trim()}
              >
                Добавить
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="add-btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            type="button"
            onClick={() => setShowAddForm(true)}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm",
              "border border-dashed border-white/20 text-white/40",
              "hover:border-white/40 hover:text-white/60 active:scale-[0.98] transition-all"
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Добавить адрес
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main modal ─────────────────────────────────────────────

export function PickupPointModal({
  isOpen,
  onClose,
  deliveryServices,
  onConfirm,
  isLoading,
}: PickupPointModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<PickupPointSelections>({});

  const totalSteps = deliveryServices.length;
  const currentService = deliveryServices[currentStep] ?? null;
  const serviceLabel = currentService
    ? (DELIVERY_SERVICE_LABELS[currentService] ?? currentService)
    : null;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setSelections({});
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (!currentService) return;
      setSelections((prev) => ({ ...prev, [currentService]: id }));
    },
    [currentService]
  );

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // Last step — confirm all
      onConfirm(selections);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const isLastStep = currentStep >= totalSteps - 1;
  const currentSelection = currentService ? (selections[currentService] ?? null) : null;

  // Build title
  const title =
    totalSteps > 1
      ? `ПВЗ — ${serviceLabel} (${currentStep + 1}/${totalSteps})`
      : `ПВЗ — ${serviceLabel}`;

  if (!currentService) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {/* Step indicator for multi-service */}
      {totalSteps > 1 && (
        <div className="flex gap-1.5 mb-4">
          {deliveryServices.map((svc, i) => (
            <div
              key={svc}
              className={cn(
                "h-1 flex-1 rounded-full transition-all",
                i < currentStep
                  ? "bg-accent-blue"
                  : i === currentStep
                    ? "bg-accent-blue/60"
                    : "bg-white/[0.08]"
              )}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentService}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <ServiceStep
            deliveryService={currentService}
            selectedId={currentSelection}
            onSelect={handleSelect}
          />
        </motion.div>
      </AnimatePresence>

      <ModalFooter>
        {totalSteps > 1 && currentStep > 0 ? (
          <Button variant="secondary" size="sm" onClick={handleBack} disabled={isLoading}>
            Назад
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Отмена
          </Button>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleNext}
          isLoading={isLoading && isLastStep}
        >
          {isLastStep ? (currentSelection ? "Отправить" : "Без ПВЗ") : "Далее"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
