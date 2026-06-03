import type { Variants } from "framer-motion";

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};
