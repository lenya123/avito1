"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import {
  INSIGHT_STYLES,
  type InsightType,
  type InsightSeverity,
} from "@/lib/analytics/insights-engine";

interface InsightCardProps {
  type: InsightType | string;
  severity: InsightSeverity;
  title: string;
  body: string;
  index: number;
}

const FALLBACK_STYLE = { emoji: "💡", accentClass: "accent-blue" };

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { bar: string; iconBg: string; iconBorder: string }
> = {
  positive: {
    bar: "bg-accent-green",
    iconBg: "bg-gradient-to-br from-accent-green/20 to-accent-green/10",
    iconBorder: "border-accent-green/25",
  },
  warning: {
    bar: "bg-accent-orange",
    iconBg: "bg-gradient-to-br from-accent-orange/20 to-accent-orange/10",
    iconBorder: "border-accent-orange/25",
  },
  info: {
    bar: "bg-accent-blue",
    iconBg: "bg-gradient-to-br from-accent-blue/20 to-accent-blue/10",
    iconBorder: "border-accent-blue/25",
  },
  celebration: {
    bar: "bg-accent-purple",
    iconBg: "bg-gradient-to-br from-accent-purple/20 to-accent-purple/10",
    iconBorder: "border-accent-purple/25",
  },
};

export function InsightCard({ type, severity, title, body, index }: InsightCardProps) {
  const style = INSIGHT_STYLES[type as InsightType] || FALLBACK_STYLE;
  const severityStyle = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index }}
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-b from-white/[0.08] to-white/[0.04]",
        "backdrop-blur-xl",
        "border border-glass",
        "shadow-card"
      )}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", severityStyle.bar)} />

      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        {/* Emoji icon */}
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
            "border",
            severityStyle.iconBg,
            severityStyle.iconBorder
          )}
        >
          <span className="text-base">{style.emoji}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}
