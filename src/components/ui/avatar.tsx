"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  className?: string;
}

const sizeStyles: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: "w-6 h-6", text: "text-2xs" },
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-10 h-10", text: "text-sm" },
  lg: { container: "w-12 h-12", text: "text-base" },
  xl: { container: "w-16 h-16", text: "text-xl" },
};

const colors = ["bg-accent-blue", "bg-accent-green", "bg-accent-orange", "bg-accent-red"];

function getColorFromName(name: string): string {
  const hash = name.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function Avatar({ src, alt, name = "User", size = "md", className }: AvatarProps) {
  const { container, text } = sizeStyles[size];
  const bgColor = getColorFromName(name);
  const initials = getInitials(name);

  if (src) {
    return (
      <div
        className={cn(
          "relative rounded-full overflow-hidden",
          "ring-2 ring-white/10",
          container,
          className
        )}
      >
        <Image
          src={src}
          alt={alt || name}
          fill
          className="object-cover"
          sizes={`(max-width: 768px) ${container}, ${container}`}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full",
        "ring-2 ring-white/10",
        container,
        bgColor,
        className
      )}
      role="img"
      aria-label={name}
    >
      <span className={cn("font-semibold text-white", text)}>{initials}</span>
    </div>
  );
}

export interface AvatarGroupProps {
  avatars: Array<{ src?: string | null; name: string }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = "sm", className }: AvatarGroupProps) {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;
  const { container, text } = sizeStyles[size];

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((avatar, index) => (
        <Avatar
          key={index}
          src={avatar.src}
          name={avatar.name}
          size={size}
          className="ring-2 ring-primary"
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full",
            "bg-white/[0.08] ring-2 ring-primary",
            container
          )}
        >
          <span className={cn("font-semibold text-white/80", text)}>+{remaining}</span>
        </div>
      )}
    </div>
  );
}
