"use client";

import { useEffect, useCallback, useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import FocusTrap from "focus-trap-react";
import { cn } from "@/utils/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-[calc(100%-2rem)]",
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const scrollPositionRef = useRef(0);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Сохраняем позицию скролла
      scrollPositionRef.current = window.scrollY;

      document.addEventListener("keydown", handleEscape);

      // Фиксируем body для предотвращения скролла на iOS Safari
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollPositionRef.current}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);

      // Восстанавливаем позицию скролла
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";

      if (scrollPositionRef.current > 0) {
        window.scrollTo(0, scrollPositionRef.current);
      }
    };
  }, [isOpen, handleEscape]);

  // Рендерим через портал в body, чтобы избежать проблем с fixed позиционированием
  // на Safari iOS (backdrop-filter в родителях ломает fixed)
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed z-[100] flex items-center justify-center p-4 pb-[4.5rem] md:pb-4"
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bg-black/60 backdrop-blur-md [-webkit-backdrop-filter:blur(12px)]"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              WebkitTapHighlightColor: "transparent",
              touchAction: "none",
            }}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden="true"
          />

          {/* Modal content */}
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              allowOutsideClick: true,
              escapeDeactivates: false,
              fallbackFocus: '[role="dialog"]',
              checkCanFocusTrap: () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "relative w-full",
                "bg-gradient-to-b from-white/[0.12] to-white/[0.06]",
                "backdrop-blur-[24px] [-webkit-backdrop-filter:blur(24px)]",
                "border border-glass-active",
                "rounded-3xl",
                "shadow-modal",
                "p-6",
                sizeStyles[size],
                className
              )}
              style={{
                maxHeight: "calc(100% - 1rem)",
                WebkitOverflowScrolling: "touch",
              }}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              aria-labelledby={title ? "modal-title" : undefined}
              aria-describedby={description ? "modal-description" : undefined}
            >
              {/* Close button */}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className={cn(
                    "absolute top-3 right-3 p-2.5",
                    "text-white/40 hover:text-white/80",
                    "transition-colors duration-200",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue rounded-lg"
                  )}
                  aria-label="Закрыть"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}

              {/* Header */}
              {(title || description) && (
                <div className="mb-4 pr-8">
                  {title && (
                    <h2 id="modal-title" className="text-xl font-semibold text-white">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id="modal-description" className="mt-1 text-sm text-white/60">
                      {description}
                    </p>
                  )}
                </div>
              )}

              {/* Content */}
              {children}
            </motion.div>
          </FocusTrap>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 mt-6 pt-4 border-t border-glass-minimal",
        className
      )}
    >
      {children}
    </div>
  );
}
