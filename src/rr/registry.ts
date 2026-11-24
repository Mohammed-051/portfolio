import { store, type ModuleName, type ModuleState } from "./store.ts";
import type { BootHandle } from "./boot.ts";
import type { EngineHandle } from "./engine.ts";
import type { BenchHandle } from "./bench.ts";
import type { HeroHandle } from "./hero.ts";
import type { PlatesHandle } from "./plates.ts";
import type { CursorHandle } from "./cursor.ts";
import type { MenuHandle } from "./menu.ts";
import type { RefreshHandle } from "./refresh.ts";
import type { ScrollHandle } from "./scroll.ts";
import type { WipeHandle } from "./wipe.ts";

export interface Handle { destroy(): void } // destroy is idempotent

// One entry per module; modules narrow these to their own handle types.
export interface HandleMap {
  engine: EngineHandle; wipe: WipeHandle; plates: PlatesHandle; bench: BenchHandle; menu: MenuHandle; cases: Handle; rail: Handle;
  cursor: CursorHandle; boot: BootHandle; hero: HeroHandle; closing: Handle; scroll: ScrollHandle; refresh: RefreshHandle; journey: Handle;
  ring: RingApi;
}
/** The Work ring handle (createRing in Work.tsx, lazy). Declared here so the registry never imports the lazy module. */
export interface RingApi extends Handle {
  goTo(i: number, o?: { immediate?: boolean }): void; // sets e = 0 and scrolls to s = i
  step(dir: 1 | -1): void;
  active(): number;
  offset(): number; // continuous o = s + e in rows; the world drum (src/world) turns with it
  onPose(fn: (o: number) => void): () => void;
  bindDrag(el: HTMLElement, pxPerRow: number): void; // the drum hit area turns the ring like the grip
}
export type HandleOf<N extends ModuleName> = HandleMap[N];

export class DepFailed extends Error {
  readonly module: ModuleName;
  constructor(module: ModuleName, cause: unknown) {
    super(`dependency "${module}" failed`, { cause });
    this.name = "DepFailed";
    this.module = module;
  }
}

interface Entry { name: ModuleName; h: Handle; gen: number }
interface Waiter { resolve(h: Handle): void; reject(e: unknown): void }

let gen = 0;
const live: Entry[] = []; // readiness order
const failed = new Map<ModuleName, { gen: number; err: unknown }>();
const waiters = new Map<ModuleName, Set<Waiter>>();

const mark = (name: ModuleName, s: ModuleState) => store.set({ modules: { ...store.get().modules, [name]: s } });
const abortError = () => new DOMException("Aborted", "AbortError");

function settle(name: ModuleName, fn: (w: Waiter) => void) {
  const set = waiters.get(name);
  waiters.delete(name);
  set?.forEach(fn);
}

export const registry = {
  get gen() { return gen; },
  begin(): number { return ++gen; },

  set<N extends ModuleName>(name: N, h: HandleOf<N>, g: number): void {
    if (g !== gen) return;
    failed.delete(name);
    live.push({ name, h, gen: g });
    mark(name, "ready");
    settle(name, (w) => w.resolve(h));
  },

  get<N extends ModuleName>(name: N): HandleOf<N> | undefined {
    return live.find((e) => e.name === name && e.gen === gen)?.h as HandleOf<N> | undefined;
  },

  whenReady<N extends ModuleName>(name: N, signal: AbortSignal): Promise<HandleOf<N>> {
    if (signal.aborted) return Promise.reject(abortError());
    const h = registry.get(name);
    if (h) return Promise.resolve(h);
    const f = failed.get(name);
    if (f && f.gen === gen) return Promise.reject(new DepFailed(name, f.err));
    return new Promise((resolve, reject) => {
      const set = waiters.get(name) ?? new Set<Waiter>();
      waiters.set(name, set);
      const onAbort = () => { set.delete(w); reject(abortError()); };
      const w: Waiter = {
        resolve: (x) => { signal.removeEventListener("abort", onAbort); resolve(x as HandleOf<N>); },
        reject: (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
      };
      set.add(w);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  },

  fail(name: ModuleName, err: unknown, g: number): void {
    if (g !== gen) return;
    failed.set(name, { gen: g, err });
    mark(name, "failed");
    settle(name, (w) => w.reject(new DepFailed(name, err)));
  },

  /** Destroys h and drops it from the registry. Used by guardCreateAsync (duplicate guard, abort after register). */
  release(name: ModuleName, h: Handle): void {
    const i = live.findIndex((e) => e.h === h);
    if (i >= 0) { live.splice(i, 1); mark(name, "destroyed"); }
    h.destroy();
  },

  destroyAll(g: number): void {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i]!;
      if (e.gen !== g) continue;
      live.splice(i, 1);
      try { e.h.destroy(); } catch (err) { console.error(`[rr] destroy ${e.name}`, err); }
      mark(e.name, "destroyed");
    }
  },

  /** Old-generation live entries for a name (the duplicate guard in guardCreateAsync). */
  stale(name: ModuleName, g: number): Handle[] {
    return live.filter((e) => e.name === name && e.gen < g).map((e) => e.h);
  },

  liveCounts(): Partial<Record<ModuleName, number>> {
    const c: Partial<Record<ModuleName, number>> = {};
    for (const e of live) c[e.name] = (c[e.name] ?? 0) + 1;
    return c;
  },
};
export type Registry = typeof registry;
