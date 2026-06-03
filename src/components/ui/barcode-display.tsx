"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { cn } from "@/utils/cn";

export interface BarcodeDisplayProps {
  value: string;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export function BarcodeDisplay({
  value,
  height = 80,
  displayValue = true,
  className,
}: BarcodeDisplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 2,
        height,
        displayValue,
        fontSize: 14,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [value, height, displayValue]);

  if (!value) return null;

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-4 rounded-xl",
          "bg-accent-red/10 border border-accent-red/20",
          className
        )}
      >
        <p className="text-sm text-accent-red">Не удалось сгенерировать штрихкод</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl overflow-hidden bg-white", className)}>
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}
