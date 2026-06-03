"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/utils/cn";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  variant?: "glass" | "solid";
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
  /** Отключает декоративную линию (полезно при вложенных анимациях) */
  hideHighlight?: boolean;
  className?: string;
  children: ReactNode;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "glass",
      padding = "md",
      hoverable = false,
      hideHighlight = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hoverable ? { scale: 1.005, y: -2 } : undefined}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative rounded-2xl overflow-hidden",
          variant === "glass" && [
            "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
            "backdrop-blur-xl",
            "border border-glass",
            "shadow-card",
          ],
          variant === "solid" && "bg-secondary",
          paddingStyles[padding],
          hoverable && "cursor-pointer hover:border-glass-active transition-all duration-300",
          className
        )}
        {...(props as HTMLMotionProps<"div">)}
      >
        {/* Декоративный блик */}
        {variant === "glass" && !hideHighlight && (
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        )}
        <div className="relative">{children}</div>
      </motion.div>
    );
  }
);

Card.displayName = "Card";

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between mb-4", className)} {...props}>
      {children ? (
        children
      ) : (
        <div>
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-white/60 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {action}
    </div>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={cn("", className)} {...props}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 mt-4 pt-4 border-t border-glass-minimal",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
