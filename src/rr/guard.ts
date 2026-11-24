import { registry, type HandleOf } from "./registry.ts";
import type { ModuleName } from "./store.ts";

/** Creates a module once per generation; never rejects (resolves undefined when not registered). */
export async function guardCreateAsync<N extends ModuleName>(
  name: N,
  signal: AbortSignal,
  gen: number,
  fn: () => Promise<HandleOf<N>>,
): Promise<HandleOf<N> | undefined> {
  for (const old of registry.stale(name, gen)) {
    if (import.meta.env?.DEV) console.warn(`[rr] duplicate "${name}": destroying generation older than ${gen}`);
    registry.release(name, old);
  }
  let h: HandleOf<N>;
  try {
    h = await fn();
  } catch (err) {
    if (!signal.aborted) registry.fail(name, err, gen);
    return undefined;
  }
  if (signal.aborted || gen !== registry.gen) {
    h.destroy();
    return undefined;
  }
  registry.set(name, h, gen);
  // Deferred so a synchronous destroyAll right after abort() keeps reverse readiness order.
  signal.addEventListener("abort", () => queueMicrotask(() => registry.release(name, h)), { once: true });
  return h;
}
