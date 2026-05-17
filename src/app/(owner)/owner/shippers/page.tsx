"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  useOwnerShippers,
  useDeleteShipper,
  type ShipperListItem,
} from "@/hooks/use-owner-shippers";
import { useOwnerPendulumSettings } from "@/hooks/use-shipper-payouts";
import { ErrorState, Button, Modal } from "@/components/ui";
import {
  ShipperCard,
  ShipperCardSkeleton,
  CreateShipperModal,
  EditShipperModal,
} from "@/components/owner/shippers";
import { PendulumSettingsCard } from "@/components/owner/shippers/pendulum-settings";

export default function OwnerShippersPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShipper, setEditingShipper] = useState<ShipperListItem | null>(null);
  const [deletingShipper, setDeletingShipper] = useState<ShipperListItem | null>(null);
  const { data, isLoading, error, refetch } = useOwnerShippers();
  const { data: pendulumSettings } = useOwnerPendulumSettings();
  const deleteShipper = useDeleteShipper();

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ErrorState
          title="Ошибка загрузки"
          message="Не удалось загрузить список отправщиков"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Отправщики</h1>
          <p className="text-white/60">Управление командой отправщиков</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Добавить
        </Button>
      </motion.div>

      {/* Today stats */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-4"
        >
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-2xl font-bold text-white">{data.totalToday.shipped}</p>
            <p className="text-sm text-white/60">Отправлено сегодня</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border border-glass shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-2xl font-bold text-green-400">
              {data.totalToday.earnings.toLocaleString()} ₽
            </p>
            <p className="text-sm text-white/60">К выплате за месяц</p>
          </div>
        </motion.div>
      )}

      {/* Shippers list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <ShipperCardSkeleton key={i} />)
        ) : data?.shippers.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="w-16 h-16 mx-auto text-white/30 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-white/60 mb-4">Отправщики не добавлены</p>
            <Button onClick={() => setShowCreateModal(true)}>Добавить первого отправщика</Button>
          </div>
        ) : (
          data?.shippers.map((shipper, index) => (
            <ShipperCard
              key={shipper.id}
              shipper={shipper}
              index={index}
              onEdit={() => setEditingShipper(shipper)}
              onDelete={() => setDeletingShipper(shipper)}
            />
          ))
        )}
      </motion.div>

      {/* Pendulum settings */}
      {pendulumSettings && <PendulumSettingsCard settings={pendulumSettings} />}

      {/* Create modal */}
      <CreateShipperModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {/* Edit modal */}
      {editingShipper && (
        <EditShipperModal
          isOpen={!!editingShipper}
          onClose={() => setEditingShipper(null)}
          shipper={editingShipper}
        />
      )}

      {/* Delete confirmation modal */}
      {deletingShipper && (
        <Modal
          isOpen={!!deletingShipper}
          onClose={() => setDeletingShipper(null)}
          title="Удалить отправщика?"
        >
          <div className="space-y-4">
            <p className="text-white/70">
              Вы уверены, что хотите удалить отправщика{" "}
              <span className="text-white font-medium">{deletingShipper.name}</span>? Это действие
              нельзя отменить.
            </p>

            {deleteShipper.isError && (
              <p className="text-sm text-red-400">
                {deleteShipper.error instanceof Error
                  ? deleteShipper.error.message
                  : "Ошибка удаления"}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setDeletingShipper(null)} className="flex-1">
                Отмена
              </Button>
              <Button
                variant="danger"
                isLoading={deleteShipper.isPending}
                onClick={async () => {
                  try {
                    await deleteShipper.mutateAsync(deletingShipper.id);
                    setDeletingShipper(null);
                  } catch {
                    // Ошибка уже показывается через isError
                  }
                }}
                className="flex-1"
              >
                Удалить
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
