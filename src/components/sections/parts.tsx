import { useRef, type ReactNode } from "react";
import { m, useScroll, useTransform } from "motion/react";
import { useReducedMotion } from "../../motion/config";
import { store } from "../../rr/store";
import { rise } from "./reveal";

/** A section's supporting title and short description, under its heading. Visible at once. */
export function Lede({ copy, className = "" }: { copy: readonly [string, string]; className?: string }) {
  return (
    <div className={`lede col-span-full ${className}`}>
      <p className="heading text-heading text-bone-100">{copy[0]}</p>
      <p className="mt-3 max-w-[52ch] text-lead text-bone-300">{copy[1]}</p>
    </div>
  );
}

/** One line that rises from its own clip. Must sit inside a revealing parent. */
export function Rise({ children, i = 0, className = "", own = false }: { children: ReactNode; i?: number; className?: string; own?: boolean }) {
  // own: the journey drives this line from scroll, so it carries no reveal variant and is visible by default.
  if (own)
    return (
      <span className={`rise ${className}`} data-rr-line>
        <span className="block">{children}</span>
      </span>
    );
  return (
    <span className={`rise ${className}`}>
      <m.span className="block" variants={rise} custom={i}>
        {children}
      </m.span>
    </span>
  );
}

/** Mono section label (no number). Its hairline sits 16px down, level with the thread's dock node, and fills ember
 *  as the header nears the reading line where that node lights. This must be the section's first child. */
// `n` is accepted and ignored until About and Contact stop passing it.
export function SectionHead({ label, note }: { n?: string; label: string; note?: ReactNode }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.4"] });
  const fill = useTransform(scrollYProgress, (p) => (still ? 1 : store.get().mode === "raster" ? Math.round(p * 16) / 16 : p)); // raster: 16 steps
  return (
    <div ref={ref} aria-hidden="true" className="meta col-span-full flex h-8 items-center gap-4 text-bone-500">
      <span className="text-bone-100">{label}</span>
      <span className="relative h-px flex-1 bg-ink-800">
        <m.span className="absolute inset-0 origin-left bg-ember" style={{ scaleX: fill }} />
      </span>
      {note && <span className="max-sm:hidden">{note}</span>}
    </div>
  );
}
