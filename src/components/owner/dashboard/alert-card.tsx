"use client";

import { motion } from "framer-motion";

interface AlertCardProps {
  alerts: Array<{
    type: "urgent" | "warning";
    title: string;
    message: string;
    count: number;
    amount?: number;
  }>;
}

export function AlertCard({ alerts }: AlertCardProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`relative overflow-hidden p-4 rounded-2xl border backdrop-blur-xl shadow-card ${
            alert.type === "urgent"
              ? "bg-gradient-to-b from-red-500/[0.12] to-red-500/[0.06] border-red-500/25"
              : "bg-gradient-to-b from-yellow-500/[0.12] to-yellow-500/[0.06] border-yellow-500/25"
          }`}
        >
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                alert.type === "urgent"
                  ? "bg-gradient-to-br from-red-500/20 to-red-500/10 border-red-500/25"
                  : "bg-gradient-to-br from-yellow-500/20 to-yellow-500/10 border-yellow-500/25"
              }`}
            >
              {alert.type === "urgent" ? (
                <svg
                  className="w-5 h-5 text-accent-red"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5 text-accent-orange"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <h4
                className={`font-medium ${
                  alert.type === "urgent" ? "text-accent-red" : "text-accent-orange"
                }`}
              >
                {alert.title}
              </h4>
              <p className="text-sm text-white/60 mt-0.5">{alert.message}</p>
            </div>
            <span
              className={`text-sm font-medium ${
                alert.type === "urgent" ? "text-accent-red" : "text-accent-orange"
              }`}
            >
              {alert.count}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
