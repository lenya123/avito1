"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/utils/cn";

export type ButtonVariant = "primary" | "warning" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-gradient-to-b from-[#4da6ff] via-[#2196ff] to-[#0A84FF]",
    "text-white",
    "border border-glass-active",
    "shadow-button-primary",
    "hover:from-[#5cb0ff] hover:via-[#2ea0ff] hover:to-[#1a8fff]",
    "hover:shadow-[0_6px_16px_rgba(0,0,0,0.35),0_4px_12px_rgba(10,132,255,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
  ),
  warning: cn(
    "bg-gradient-to-b from-[#ffbe4d] via-[#ffaa30] to-[#FF9F0A]",
    "text-white",
    "border border-glass-active",
    "shadow-[0_4px_12px_rgba(0,0,0,0.3),0_2px_8px_rgba(255,159,10,0.4),inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.1)]",
    "hover:from-[#ffc866] hover:via-[#ffb545] hover:to-[#ffaa20]",
    "hover:shadow-[0_6px_16px_rgba(0,0,0,0.35),0_4px_12px_rgba(255,159,10,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
  ),
  secondary: cn(
    "bg-[rgba(50,50,50,0.9)]",
    "text-white/80",
    "border border-glass-active",
    "shadow-[0_2px_10px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]",
    "hover:bg-[rgba(60,60,60,0.95)] hover:text-white hover:border-white/30",
    "hover:shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.18)]"
  ),
  ghost: cn("bg-transparent text-white/60", "hover:bg-white/10 hover:text-white"),
  danger: cn(
    "bg-gradient-to-b from-[#ff6b6b] via-[#ff5252] to-[#FF453A]",
    "text-white",
    "border border-glass-active",
    "shadow-[0_4px_12px_rgba(0,0,0,0.3),0_2px_8px_rgba(255,69,58,0.4),inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(0,0,0,0.1)]",
    "hover:from-[#ff7a7a] hover:via-[#ff6161] hover:to-[#ff5449]",
    "hover:shadow-[0_6px_16px_rgba(0,0,0,0.35),0_4px_12px_rgba(255,69,58,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]"
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-xl",
  md: "px-4 py-2.5 text-base rounded-xl",
  lg: "px-6 py-3 text-lg rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: isDisabled ? 1 : 0.98 }}
        transition={{ duration: 0.1 }}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "font-semibold transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={isDisabled}
        {...(props as HTMLMotionProps<"button">)}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
