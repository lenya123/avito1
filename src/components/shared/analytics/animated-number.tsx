"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toString(),
  duration = 0.8,
  className,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    duration: duration * 1000,
    bounce: 0,
  });
  const display = useTransform(spring, (v) => format(v));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      motionValue.set(value);
    } else {
      motionValue.set(value);
    }
  }, [value, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
