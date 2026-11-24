// Test hooks. Compiled in only outside production mode; check-bundle.mjs fails on the hook name in production JS.
import * as canvasBudget from "./canvasBudget.ts";
import { registry } from "./registry.ts";
import * as ringMath from "./ringMath.ts";

export interface GsapCounters { st: () => number; tl: () => number; ticker: () => number }

const gsapCounters: GsapCounters = { st: () => 0, tl: () => 0, ticker: () => 0 };

/** Called once GSAP has loaded (it is a dynamic import), e.g. st: () => ScrollTrigger.getAll().length. */
export function registerDebugGsap(c: GsapCounters): void {
  Object.assign(gsapCounters, c);
}

if (import.meta.env.MODE !== "production") {
  (window as unknown as Record<string, unknown>)["__rr"] = {
    st: () => gsapCounters.st(),
    tl: () => gsapCounters.tl(),
    ticker: () => gsapCounters.ticker(),
    handles: () => registry.liveCounts(),
    canvasBytes: () => canvasBudget.total(),
    contexts: () => canvasBudget.liveContexts(),
    teardown: () => registry.destroyAll(registry.gen),
    ringMath, // ring scripts compare measured row poses with the pure maths
  };
}
