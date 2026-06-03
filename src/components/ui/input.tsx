"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      className,
      containerClassName,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;

    return (
      <div className={cn("w-full", containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-white/80 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 z-10 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={!!error}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl",
              "bg-white/[0.08] backdrop-blur-sm",
              "border border-glass",
              "shadow-glass-inset",
              "text-white placeholder:text-white/40",
              "transition-all duration-200",
              "focus:outline-none focus:border-white/30 focus:bg-white/[0.12]",
              "focus-visible:ring-2 focus-visible:ring-accent-blue",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-accent-red focus:border-accent-red",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 z-10">
              {rightIcon}
            </div>
          )}
        </div>
        {(error || hint) && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("mt-1.5 text-sm", error ? "text-accent-red" : "text-white/40")}
          >
            {error || hint}
          </motion.p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
