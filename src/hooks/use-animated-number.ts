"use client";

import { useSpring, useTransform, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";

export function useAnimatedNumber(
  value: number,
  options?: { stiffness?: number; damping?: number; format?: (n: number) => string }
) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    stiffness: options?.stiffness ?? 100,
    damping: options?.damping ?? 30,
  });
  const rounded = useTransform(spring, (v) => Math.round(v));
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    return rounded.on("change", (v) => {
      setDisplay(options?.format ? options.format(v) : String(v));
    });
  }, [rounded, options?.format]);

  return display;
}
