"use client";

import { useState, createContext, useContext, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

// ─── Accordion Context ────────────────────────────────────────────

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (id: string) => void;
  variant: "default" | "separated";
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be used within an Accordion");
  }
  return context;
}

// ─── Accordion Root ───────────────────────────────────────────────

export interface AccordionProps {
  children: ReactNode;
  /** Режим открытия: single (один) или multiple (несколько) */
  type?: "single" | "multiple";
  /** Начально открытые элементы */
  defaultOpen?: string[];
  /** Вариант отображения */
  variant?: "default" | "separated";
  className?: string;
}

export function Accordion({
  children,
  type = "single",
  defaultOpen = [],
  variant = "default",
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpen));

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (type === "single") {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle, variant }}>
      <div
        className={cn(
          variant === "default" && "space-y-0",
          variant === "separated" && "space-y-3",
          className
        )}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// ─── Accordion Item ───────────────────────────────────────────────

export interface AccordionItemProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ id, children, className }: AccordionItemProps) {
  const { openItems, variant } = useAccordionContext();
  const isOpen = openItems.has(id);

  return (
    <div
      className={cn(
        "overflow-hidden transition-colors duration-200",
        variant === "default" && [
          "border-b border-glass-minimal",
          "first:rounded-t-xl last:rounded-b-xl last:border-b-0",
        ],
        variant === "separated" && [
          "rounded-xl",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card",
        ],
        isOpen && variant === "separated" && "border-glass-active",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
    >
      {children}
    </div>
  );
}

// ─── Accordion Trigger ────────────────────────────────────────────

export interface AccordionTriggerProps {
  id: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function AccordionTrigger({ id, children, icon, className }: AccordionTriggerProps) {
  const { openItems, toggle, variant } = useAccordionContext();
  const isOpen = openItems.has(id);

  return (
    <button
      type="button"
      id={`accordion-trigger-${id}`}
      onClick={() => toggle(id)}
      className={cn(
        "w-full flex items-center gap-3 text-left",
        "transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-inset",
        variant === "default" && "py-4 hover:bg-white/[0.02]",
        variant === "separated" && "p-4 hover:bg-white/[0.02]",
        className
      )}
      aria-expanded={isOpen}
      aria-controls={`accordion-content-${id}`}
    >
      {/* Icon */}
      {icon && (
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
            "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
            "border border-glass-subtle",
            "shadow-glass-inset"
          )}
        >
          {icon}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Chevron */}
      <motion.div
        initial={false}
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
        className="flex-shrink-0"
      >
        <svg
          className="w-5 h-5 text-white/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </motion.div>
    </button>
  );
}

// ─── Accordion Content ────────────────────────────────────────────

export interface AccordionContentProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionContent({ id, children, className }: AccordionContentProps) {
  const { openItems, variant } = useAccordionContext();
  const isOpen = openItems.has(id);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div
            id={`accordion-content-${id}`}
            role="region"
            aria-labelledby={`accordion-trigger-${id}`}
            className={cn(
              "text-sm text-white/60 leading-relaxed",
              variant === "default" && "pb-4",
              variant === "separated" && "px-4 pb-4",
              className
            )}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
