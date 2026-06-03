"use client";

import { motion } from "framer-motion";

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  showLabel?: boolean;
  labelOverride?: string | number;
}

export function ProgressRing({
  value,
  size = 24,
  strokeWidth = 3,
  color,
  showLabel = false,
  labelOverride,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
      />
      {showLabel && (
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={size * 0.32}
          fontWeight={600}
        >
          {labelOverride !== undefined ? labelOverride : Math.round(value)}
        </text>
      )}
    </svg>
  );
}
