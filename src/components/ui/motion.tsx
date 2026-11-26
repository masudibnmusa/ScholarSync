"use client";

import * as React from "react";
import { animate, motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";
import { num } from "@/lib/i18n";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Counts up to `value` on mount and whenever it changes. The final number is in the HTML, so it works without JS. */
export function AnimatedNumber({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const from = React.useRef(0);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = `${num(value)}${suffix}`;
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: EASE,
      onUpdate: (v) => { el.textContent = `${num(Math.round(v))}${suffix}`; },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, suffix, reduce]);

  return <span ref={ref} className={cn("tabular-nums", className)}>{`${num(value)}${suffix}`}</span>;
}

const groupVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Children wrapped in <StaggerItem> enter one after another. */
export function Stagger({ className, children, inView }: { className?: string; children: React.ReactNode; inView?: boolean }) {
  return (
    <motion.div
      className={className}
      variants={groupVariants}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "-80px" } } : { animate: "show" })}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return <motion.div className={className} variants={itemVariants}>{children}</motion.div>;
}

/** Fades content up when it scrolls into view (once). */
export function Reveal({ className, children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Card with a soft glow that follows the pointer. Decorative only. */
export function Spotlight({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("spotlight relative", className)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      {...props}
    >
      {children}
    </div>
  );
}
