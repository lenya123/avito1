"use client";

import { useMemo } from "react";
import { buildSmoothPath, buildSmoothAreaPath, niceMax } from "@/utils/svg-chart";

interface MiniSparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export function MiniSparkline({ data, color, width = 80, height = 32 }: MiniSparklineProps) {
  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) return { linePath: "", areaPath: "" };

    const max = niceMax(Math.max(...data));
    const padY = 2;
    const plotH = height - padY * 2;

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: padY + plotH - (max > 0 ? (v / max) * plotH : 0),
    }));

    return {
      linePath: buildSmoothPath(points),
      areaPath: buildSmoothAreaPath(points, height),
    };
  }, [data, width, height]);

  if (data.length < 2) return null;

  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
