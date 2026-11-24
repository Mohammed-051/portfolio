import type { Variants } from "motion/react";
import { store } from "../../rr/store";
import { duration, ease, reveal, useReducedMotion } from "../../motion/config";

/* Section entrances. A parent spreads `useReveal()`; children pick a variant and an index (`custom`).
 * The observer sits on the parent: a child clipped by .rise would never count as visible. */
const step = 0.06;
// Mode is read when a variant runs (never at load): a wipe can flip it at any time.
const raster = () => store.get().mode === "raster";
const stepped = (n: number) => (t: number) => Math.min(1, Math.ceil(t * n) / n);
export const rise: Variants = {
  hidden: { y: "110%" },
  shown: (i = 0) => ({
    y: 0,
    transition: { duration: raster() ? 0.6 : duration.slow, ease: raster() ? stepped(8) : ease.outExpo, delay: i * step },
  }),
};
export const fade: Variants = {
  // Render: 12 px rise and fade, outExpo. Raster: 16 px in two cells, opacity 0, .5, 1.
  // Only the first `cap` items stagger, so a long list never waits on its tail.
  hidden: () => ({ opacity: 0, y: raster() ? reveal.raster.y : reveal.render.y }),
  shown: (i = 0) => {
    const r = raster() ? reveal.raster : reveal.render;
    const delay = Math.min(i, r.cap) * r.step;
    return {
      opacity: 1,
      y: 0,
      transition: raster() ? { duration: reveal.raster.dur, ease: stepped(2), delay } : { duration: duration.base, ease: ease.outExpo, delay },
    };
  },
};
export const draw: Variants = {
  hidden: { scaleX: 0 },
  shown: (i = 0) => ({
    scaleX: 1,
    transition: raster()
      ? { duration: 0.6, ease: stepped(12), delay: i * step }
      : { duration: duration.slow, ease: ease.inOut, delay: i * step },
  }),
};

/** Hidden start states only when the page is enhanced; otherwise everything renders final. */
export function useReveal() {
  const still = useReducedMotion();
  return still
    ? ({ initial: false, animate: "shown" } as const)
    : ({ initial: "hidden", whileInView: "shown", viewport: { once: true, margin: "0px 0px -12% 0px" } } as const);
}
