"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export interface ToggleProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "size"
> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  description?: string;
  className?: string;
}

const sizeStyles = {
  sm: {
    track: "w-9 h-5",
    thumb: "w-4 h-4",
    translate: "translate-x-4",
  },
  md: {
    track: "w-11 h-6",
    thumb: "w-5 h-5",
    translate: "translate-x-5",
  },
  lg: {
    track: "w-14 h-7",
    thumb: "w-6 h-6",
    translate: "translate-x-7",
  },
};

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  (
    {
      checked = false,
      onChange,
      size = "md",
      label,
      description,
      disabled = false,
      className,
      ...props
    },
    ref
  ) => {
    const styles = sizeStyles[size];

    const handleClick = () => {
      if (!disabled) {
        onChange?.(!checked);
      }
    };

    return (
      <label
        className={cn(
          "flex items-center gap-3",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer",
          className
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          className="sr-only"
          {...props}
        />

        {/* Track */}
        <motion.button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            "relative rounded-full transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 focus-visible:ring-offset-primary",
            styles.track,
            checked
              ? "bg-accent-blue shadow-[0_0_12px_rgba(10,132,255,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]"
              : "bg-white/[0.12] shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
          )}
        >
          {/* Thumb */}
          <motion.div
            initial={false}
            animate={{
              x: checked ? parseInt(styles.translate.replace(/\D/g, "")) * 4 : 0,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "absolute top-0.5 left-0.5 rounded-full",
              "bg-white",
              "shadow-[0_2px_4px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.1)]",
              styles.thumb
            )}
          />
        </motion.button>

        {/* Label & Description */}
        {(label || description) && (
          <div className="flex-1 min-w-0">
            {label && <span className="block text-sm font-medium text-white">{label}</span>}
            {description && (
              <span className="block text-xs text-white/40 mt-0.5">{description}</span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Toggle.displayName = "Toggle";
