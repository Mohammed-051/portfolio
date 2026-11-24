import { useSyncExternalStore } from "react";

export type Mode = "render" | "raster"; // render = light paper, raster = dark
export type ProjectId = "glitched-server" | "climate-controller" | "smart-life";
export type ModuleState = "idle" | "ready" | "failed" | "destroyed";
export type ModuleName = "engine" | "wipe" | "plates" | "bench" | "menu" | "journey" | "cases"
  | "rail" | "cursor" | "boot" | "hero" | "closing" | "scroll" | "refresh" | "ring";
export type SectionId = string; // ids of SECTIONS (lib/site.ts) plus a few extra ids
export type CaseState = // case dialog state machine
  | { kind: "closed" }
  | { kind: "opening" | "open" | "closing"; id: ProjectId }
  | { kind: "switching"; from: ProjectId; to: ProjectId };

export interface RRState {
  mode: Mode;
  modeBusy: boolean;
  motion: "full" | "reduced";
  layout: "pin" | "stack";
  booted: boolean;
  caseState: CaseState;
  transitionLock: boolean;
  pinDragging: boolean;
  workFront: number; // active Work row index; one writer per layout (pin: createRing in Work.tsx)
  currentSection: SectionId | null;
  fontGen: number;
  modules: Record<ModuleName, ModuleState>;
  sound: "on" | "off"; // off until chosen, persisted as rr-sound; the nav SOUND key writes it, rr/sound reads it
}

const PAPER: Record<Mode, string> = { render: "#EBE7DD", raster: "#080807" };
const MODULES: ModuleName[] = ["engine", "wipe", "plates", "bench", "menu", "cases", "rail", "cursor", "boot", "hero", "closing", "scroll", "refresh", "ring", "journey"];
const html = document.documentElement;
const dark = matchMedia("(prefers-color-scheme: dark)");
const enhanced = html.classList.contains("enhanced");
const seeded = html.dataset.mode;
// The pinned gallery needs 620 px of height. Reduced motion and core tier drop the enhanced class.
const pinMq = matchMedia("(min-width: 900px) and (pointer: fine) and (min-height: 620px)");
const layoutNow = (): RRState["layout"] => (html.classList.contains("enhanced") && pinMq.matches ? "pin" : "stack");

let state: RRState = {
  mode: seeded === "render" || seeded === "raster" ? seeded : dark.matches ? "raster" : "render",
  modeBusy: false,
  motion: enhanced ? "full" : "reduced",
  layout: layoutNow(),
  booted: false,
  caseState: { kind: "closed" },
  transitionLock: false,
  pinDragging: false,
  workFront: 0,
  currentSection: null,
  fontGen: 0,
  modules: Object.fromEntries(MODULES.map((m) => [m, "idle"])) as Record<ModuleName, ModuleState>,
  sound: (() => { try { return localStorage.getItem("rr-sound") === "on" ? "on" : "off"; } catch { return "off"; } })(),
};

type Listener = (next: RRState, prev: RRState) => void;
const keyed = new Map<keyof RRState, Set<Listener>>();
const any = new Set<() => void>();

function applyMode(m: Mode) {
  html.dataset.mode = m;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = PAPER[m];
}

function write(patch: Partial<RRState>) {
  const prev = state;
  state = { ...state, ...patch };
  const changed = (Object.keys(patch) as (keyof RRState)[]).filter((k) => state[k] !== prev[k]);
  if (!changed.length) return;
  if (state.mode !== prev.mode) applyMode(state.mode);
  for (const k of changed) keyed.get(k)?.forEach((fn) => fn(state, prev));
  any.forEach((fn) => fn());
}

const storedMode = () => {
  try { return localStorage.getItem("rr-mode"); } catch { return null; }
};

export const store = {
  get: (): RRState => state,
  set(patch: Partial<RRState>): void {
    // persisting render/raster also rewrites a legacy light/dark value
    if (patch.mode) try { localStorage.setItem("rr-mode", patch.mode); } catch { /* storage blocked */ }
    if (patch.sound) try { localStorage.setItem("rr-sound", patch.sound); } catch { /* the choice lasts this page only */ }
    write(patch);
  },
  subscribe(key: keyof RRState, fn: Listener): () => void {
    const set = keyed.get(key) ?? new Set<Listener>();
    keyed.set(key, set);
    set.add(fn);
    return () => { set.delete(fn); };
  },
};
export type RRStore = typeof store;

applyMode(state.mode);

// Page-lifetime singleton listeners (store is created once, never torn down).
// With no stored mode, the mode follows the system color scheme live, without persisting.
dark.addEventListener("change", (e) => { if (!storedMode()) write({ mode: e.matches ? "raster" : "render" }); });
pinMq.addEventListener("change", () => write({ layout: layoutNow() }));
// Tiers: OS reduce-on applies live; reduce-off waits for the next load.
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => {
  if (!e.matches) return;
  html.classList.remove("enhanced", "pre");
  html.classList.add("calm");
  write({ motion: "reduced", layout: "stack" });
});

const subscribeAny = (cb: () => void) => { any.add(cb); return () => { any.delete(cb); }; };
/** Selector must return a primitive or a stable reference (useSyncExternalStore compares with Object.is). */
export function useRRStore<T>(selector: (s: RRState) => T): T {
  return useSyncExternalStore(subscribeAny, () => selector(state));
}
