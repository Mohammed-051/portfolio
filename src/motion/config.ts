import { useReducedMotion as useMotionReducedMotion } from "motion/react";

/** Motion tokens in seconds. theme.css mirrors the durations as CSS vars; checkMotionTokens() warns on drift. */
export const duration = { press: 0.07, instant: 0.12, fast: 0.24, wipe: 0.18, base: 0.48, slow: 0.9, hero: 1.4 }; // wipe, hero: legacy, no new use
/** outExpo enters, inOut moves A to B, press is the 70 ms key press. CSS: --ease-out-expo, --ease-in-out, --ease-press. */
export const ease = {
  outExpo: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  press: [0.2, 0.7, 0.2, 1] as [number, number, number, number],
};
export const stagger = { letter: 0.04 };
/** Reveal: offset in px, stagger in seconds, applied to the first `cap` items only. Preloader tokens: motion/preloader.ts. */
export const reveal = { render: { y: 12, step: 0.06, cap: 6 }, raster: { y: 16, step: 0.04, cap: 6, dur: 0.16 } };/** The one spring, for pointer parallax. */
export const spring = { pointer: { stiffness: 140, damping: 22, mass: 0.6 } };
/** Hero choreography, seconds after mount. */
export const cue = { ground: 0, wordmark: 0.2, render: 0.5, thread: 0.7, meta: 1.5 };

/** main.tsx sets this class only when motion is allowed. Without it, everything renders in its final state. */
export const isEnhanced = () => document.documentElement.classList.contains("enhanced");

/** True when the page must not animate: reduced motion (OS, or the site's motion toggle, which can also override the OS to Full), or the plain /index route.
 *  The motion hook stays subscribed so an OS change re-renders; the prepaint script and store.reduceMotion() decide `enhanced`. */
export function useReducedMotion() {
  useMotionReducedMotion();
  return !isEnhanced();
}

export function checkMotionTokens() {
  const css = getComputedStyle(document.documentElement);
  for (const [name, s] of Object.entries(duration)) {
    const ms = parseFloat(css.getPropertyValue(`--duration-${name}`));
    if (ms !== s * 1000) console.warn(`Motion token drift: --duration-${name} is ${ms}ms, config.ts says ${s * 1000}ms`);
  }
}
