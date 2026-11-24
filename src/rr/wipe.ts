import * as canvasBudget from "./canvasBudget.ts";
import { loadGsap, token } from "./refresh.ts";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

// color: Boot's handoff wipes in paper, transitions default to ink.
export interface WipeOpts { origin?: { x: number; y: number }; cell?: number; dur?: number; host?: HTMLElement; color?: string }
export interface WipeHandle extends Handle {
  transition(swap: () => void | Promise<void>, o?: WipeOpts): Promise<void>;
  cover(o?: WipeOpts): Promise<void>;
  reveal(o?: WipeOpts): Promise<void>;
  readonly busy: boolean;
}

/** mulberry32 PRNG. */
const rnd = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export async function create(_o: { signal: AbortSignal; registry: Registry }): Promise<WipeHandle> {
  const life = new AbortController();
  const instant = () => store.get().motion !== "full";
  const g = instant() ? null : (await loadGsap()).gsap;
  const ctx = g?.context(() => {});
  let cv: HTMLCanvasElement | null = null, cx: CanvasRenderingContext2D | null = null;
  let busy = false;
  const pending = new Set<() => void>();
  if (g) {
    cv = document.createElement("canvas");
    cv.className = "rr-wipe";
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:96;pointer-events:none;display:block";
    cx = cv.getContext("2d");
    document.body.append(cv);
    canvasBudget.register(cv, { visible: () => busy });
  }

  // Stepped cell cover or reveal, radial when origin is set.
  function run(phase: "cover" | "reveal", w: WipeOpts): Promise<void> {
    if (!g || !ctx || !cv || !cx || instant() || life.signal.aborted) return Promise.resolve();
    const c = cv, x = cx;
    const W = innerWidth, H = innerHeight;
    const coarse = matchMedia("(pointer: coarse)").matches || W < 900;
    const d = canvasBudget.size(c, W, H, Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2));
    x.setTransform(d, 0, 0, d, 0, 0);
    (phase === "reveal" && w.host ? w.host : document.body).append(c); // case dialog top layer
    const color = w.color ?? token("--ink"), cell = w.cell ?? 48, dur = w.dur ?? 380, org = w.origin;
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), r = rnd((Math.random() * 1e6) | 0), th = new Float32Array(cols * rows);
    const maxD = org ? Math.hypot(Math.max(org.x, W - org.x), Math.max(org.y, H - org.y)) : 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      th[j * cols + i] = org ? (Math.hypot(i * cell + cell / 2 - org.x, j * cell + cell / 2 - org.y) / maxD) * 0.78 + r() * 0.2 : r() * 0.82;
    }
    const p = { v: 0 };
    const draw = () => {
      const q = Math.floor(p.v * 14) / 14; // stepped
      x.clearRect(0, 0, W, H);
      x.fillStyle = color;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const on = q >= th[j * cols + i]!;
        if ((phase === "cover") === on) x.fillRect(i * cell, j * cell, cell, cell);
      }
    };
    return new Promise((resolve) => {
      const end = () => { pending.delete(end); resolve(); };
      pending.add(end);
      ctx.add(() => g.to(p, {
        v: 1, duration: dur / 1000, ease: "none", onUpdate: draw,
        onComplete: () => {
          if (phase === "reveal") { // release the full-screen backing store between transitions
            c.width = c.height = 0;
            canvasBudget.update(c);
            document.body.append(c);
          }
          end();
        },
      }));
    });
  }

  const cover = async (w: WipeOpts = {}) => {
    busy = true;
    store.set({ transitionLock: true });
    await run("cover", w);
  };
  const reveal = async (w: WipeOpts = {}) => {
    try { await run("reveal", w); } finally { busy = false; store.set({ transitionLock: false }); }
  };

  return {
    cover,
    reveal,
    async transition(swap, w = {}) {
      // a throw in swap still reveals and clears the lock, then propagates
      try { await cover(w); await swap(); } finally { await reveal(w); }
    },
    get busy() { return busy; },
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      ctx?.revert();
      for (const end of [...pending]) end();
      if (busy) { busy = false; store.set({ transitionLock: false }); }
      if (cv) canvasBudget.release(cv, true);
    },
  };
}
