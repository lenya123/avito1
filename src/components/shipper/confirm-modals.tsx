"use client";

import { Modal, ModalFooter, Button } from "@/components/ui";

interface ConfirmModalsProps {
  selectedCount: number;
  batchPending: boolean;

  cancelOpen: boolean;
  onCancelClose: () => void;
  onCancelConfirm: () => void;

  shipOpen: boolean;
  onShipClose: () => void;
  onShipConfirm: () => void;

  undoShipOpen: boolean;
  onUndoShipClose: () => void;
  onUndoShipConfirm: () => void;

  completeReturnsOpen: boolean;
  onCompleteReturnsClose: () => void;
  onCompleteReturnsConfirm: () => void;

  startReturnOpen: boolean;
  startReturnCount: number;
  onStartReturnClose: () => void;
  onStartReturnConfirm: () => void;

  problemOpen: boolean;
  onProblemClose: () => void;
  onMarkProblem: (type: "out_of_stock" | "bad_barcode") => void;
}

export function ConfirmModals({
  selectedCount,
  batchPending,
  cancelOpen,
  onCancelClose,
  onCancelConfirm,
  shipOpen,
  onShipClose,
  onShipConfirm,
  undoShipOpen,
  onUndoShipClose,
  onUndoShipConfirm,
  completeReturnsOpen,
  onCompleteReturnsClose,
  onCompleteReturnsConfirm,
  startReturnOpen,
  startReturnCount,
  onStartReturnClose,
  onStartReturnConfirm,
  problemOpen,
  onProblemClose,
  onMarkProblem,
}: ConfirmModalsProps) {
  return (
    <>
      <Modal isOpen={cancelOpen} onClose={onCancelClose} title="Отменить заказы?">
        <p className="text-white/60 text-sm">
          {selectedCount === 1
            ? "Выбранный заказ будет отменён. Товар вернётся на склад."
            : `Выбранные заказы (${selectedCount}) будут отменены. Товар вернётся на склад.`}
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={onCancelClose}>
            Назад
          </Button>
          <Button variant="danger" onClick={onCancelConfirm} isLoading={batchPending}>
            Отменить
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={shipOpen} onClose={onShipClose} title="Отправить заказы?">
        <p className="text-white/60 text-sm">
          Выбранные заказы ({selectedCount}) будут отмечены как отправленные.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={onShipClose}>
            Назад
          </Button>
          <Button variant="primary" onClick={onShipConfirm} isLoading={batchPending}>
            Отправить
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={undoShipOpen} onClose={onUndoShipClose} title="Вернуть в сборку?">
        <p className="text-white/60 text-sm">
          Заказы ({selectedCount}) будут возвращены в статус сборки. Трекинг будет отменён.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={onUndoShipClose}>
            Назад
          </Button>
          <Button variant="danger" onClick={onUndoShipConfirm} isLoading={batchPending}>
            Вернуть
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={completeReturnsOpen}
        onClose={onCompleteReturnsClose}
        title="Завершить возвраты?"
      >
        <p className="text-white/60 text-sm">
          Возвраты ({selectedCount}) будут отмечены как полученные. Товар вернётся на склад.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={onCompleteReturnsClose}>
            Назад
          </Button>
          <Button variant="primary" onClick={onCompleteReturnsConfirm} isLoading={batchPending}>
            Завершить
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={startReturnOpen} onClose={onStartReturnClose} title="Начать возврат?">
        <p className="text-white/60 text-sm">
          {startReturnCount === 1
            ? "Заказ будет переведён в статус «Возврат в пути». Ожидаемый срок возврата — 14 дней."
            : `Заказы (${startReturnCount}) будут переведены в статус «Возврат в пути». Ожидаемый срок возврата — 14 дней.`}
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={onStartReturnClose}>
            Назад
          </Button>
          <Button variant="primary" onClick={onStartReturnConfirm} isLoading={batchPending}>
            Начать возврат
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={problemOpen} onClose={onProblemClose} title="Тип проблемы">
        <p className="text-white/60 text-sm mb-4">
          {selectedCount === 1
            ? "Выберите тип проблемы для заказа:"
            : `Выберите тип проблемы для ${selectedCount} заказов:`}
        </p>
        <div className="space-y-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={() => onMarkProblem("out_of_stock")}
            isLoading={batchPending}
          >
            <svg
              className="w-5 h-5 mr-3 text-accent-red shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
            Нет на складе
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={() => onMarkProblem("bad_barcode")}
            isLoading={batchPending}
          >
            <svg
              className="w-5 h-5 mr-3 text-accent-orange shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            Штрихкод не работает
          </Button>
        </div>
      </Modal>
    </>
  );
}
