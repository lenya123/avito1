"use client";

import { motion } from "framer-motion";
import { Card, CardContent, Skeleton } from "@/components/ui";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  color?: "purple" | "blue" | "green" | "orange";
}

const colorClasses = {
  purple: "from-purple-500/20 to-purple-500/10 border-purple-500/25",
  blue: "from-blue-500/20 to-blue-500/10 border-blue-500/25",
  green: "from-green-500/20 to-green-500/10 border-green-500/25",
  orange: "from-orange-500/20 to-orange-500/10 border-orange-500/25",
};

const iconGradient = {
  purple: "from-purple-500 to-pink-500",
  blue: "from-blue-500 to-cyan-500",
  green: "from-green-500 to-emerald-500",
  orange: "from-orange-500 to-amber-500",
};

export function MetricCard({ title, value, change, icon, color = "purple" }: MetricCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <motion.div
      whileHover={{ scale: 1.005, y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card className="backdrop-blur-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass shadow-card overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-white/60 mb-1">{title}</p>
              <p className="text-2xl font-bold text-white">{value}</p>
              {change !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                  <span
                    className={`text-sm font-medium ${
                      isPositive ? "text-accent-green" : "text-accent-red"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {change}%
                  </span>
                  <svg
                    className={`w-4 h-4 ${isPositive ? "text-accent-green" : "text-accent-red"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={isPositive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
                    />
                  </svg>
                  <span className="text-xs text-white/40">vs вчера</span>
                </div>
              )}
            </div>
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} border flex items-center justify-center`}
            >
              <div className={`bg-gradient-to-br ${iconGradient[color]} bg-clip-text`}>{icon}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="backdrop-blur-xl bg-gradient-to-b from-white/[0.08] to-white/[0.04] border-glass shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="w-12 h-12 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  );
}
