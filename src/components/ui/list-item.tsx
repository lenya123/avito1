"use client";

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/utils/cn";

export interface ListItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** Иконка слева */
  icon?: ReactNode;
  /** Заголовок */
  title: string;
  /** Подзаголовок/описание */
  subtitle?: string;
  /** Контент справа (badge, value, etc.) */
  rightContent?: ReactNode;
  /** Показать стрелку справа */
  showChevron?: boolean;
  /** Ссылка (превращает в Link) */
  href?: string;
  /** Вариант */
  variant?: "default" | "danger";
  /** Размер */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeStyles = {
  sm: {
    padding: "py-2.5 px-3",
    iconBox: "w-8 h-8",
    iconSize: "text-base",
    title: "text-sm",
    subtitle: "text-xs",
  },
  md: {
    padding: "py-3 px-4",
    iconBox: "w-10 h-10",
    iconSize: "text-lg",
    title: "text-sm",
    subtitle: "text-xs",
  },
  lg: {
    padding: "py-4 px-4",
    iconBox: "w-12 h-12",
    iconSize: "text-xl",
    title: "text-base",
    subtitle: "text-sm",
  },
};

export const ListItem = forwardRef<HTMLButtonElement, ListItemProps>(
  (
    {
      icon,
      title,
      subtitle,
      rightContent,
      showChevron = true,
      href,
      variant = "default",
      size = "md",
      disabled = false,
      className,
      onClick,
    },
    ref
  ) => {
    const styles = sizeStyles[size];

    const content = (
      <>
        {/* Icon */}
        {icon && (
          <div
            className={cn(
              "flex-shrink-0 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-white/[0.12] to-white/[0.06]",
              "border border-glass-subtle",
              "shadow-glass-inset",
              styles.iconBox,
              styles.iconSize,
              variant === "danger" && "from-accent-red/20 to-accent-red/10 border-accent-red/25"
            )}
          >
            {icon}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <span
            className={cn(
              "block font-medium",
              styles.title,
              variant === "default" && "text-white",
              variant === "danger" && "text-accent-red"
            )}
          >
            {title}
          </span>
          {subtitle && (
            <span className={cn("block text-white/40 mt-0.5", styles.subtitle)}>{subtitle}</span>
          )}
        </div>

        {/* Right content */}
        {rightContent && <div className="flex-shrink-0">{rightContent}</div>}

        {/* Chevron */}
        {showChevron && (
          <svg
            className="w-4 h-4 text-white/40 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </>
    );

    const baseStyles = cn(
      "w-full flex items-center gap-3",
      "rounded-xl",
      "transition-all duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-inset",
      styles.padding,
      disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/[0.04] active:scale-[0.99]",
      className
    );

    if (href && !disabled) {
      return (
        <motion.div whileTap={{ scale: 0.99 }}>
          <Link href={href} className={baseStyles}>
            {content}
          </Link>
        </motion.div>
      );
    }

    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.99 }}
        className={baseStyles}
      >
        {content}
      </motion.button>
    );
  }
);

ListItem.displayName = "ListItem";

// ─── List Group ───────────────────────────────────────────────────

export interface ListGroupProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

export function ListGroup({ children, title, className }: ListGroupProps) {
  return (
    <div className={className}>
      {title && (
        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2 px-1">
          {title}
        </h3>
      )}
      <div
        className={cn(
          "rounded-2xl overflow-hidden",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
          "border border-glass",
          "shadow-card",
          "divide-y divide-white/[0.06]"
        )}
      >
        {children}
      </div>
    </div>
  );
}
