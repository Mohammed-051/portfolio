// World eligibility: no three, so boot.ts can set `world-wait` from the main chunk before the world loads.
import type { Tier } from "./core.ts";

let gl2: boolean | undefined;
/** One real WebGL2 context, released at once: the constructor existing does not mean a context can be made (GPU blocklist,
 *  --disable-webgl2), and three would log an error for every failed attempt. Cached, so the probe runs once per page. */
function canGL2(): boolean {
  if (gl2 === undefined) {
    const gl = typeof WebGL2RenderingContext === "undefined" ? null : document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    gl2 = !!gl;
  }
  return gl2;
}

export function eligible(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (matchMedia("(forced-colors: active)").matches) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  return !nav.connection?.saveData && canGL2();
}

export function tier(): Tier {
  const coarse = matchMedia("(pointer: coarse)").matches;
  if ((coarse && Math.min(innerWidth, innerHeight) < 600) || innerWidth < 768) return "phone";
  return coarse ? "tablet" : "desktop";
}
