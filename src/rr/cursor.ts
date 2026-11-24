import { UI } from "../lib/site.ts";
import { loadGsap } from "./refresh.ts";
import type { Handle, Registry } from "./registry.ts";
import { store } from "./store.ts";

export type CursorHandle = Handle;
type State = "default" | "link" | "select" | "drag" | "expand" | "disabled" | "text";

// Prose that takes the native I-beam (motion.css mirrors this list); the hero keeps the cross.
const PROSE = "p, li, dd, dt, h1, h2, h3, blockquote, figcaption";

/** Context state for the element under the pointer, plus its label (visual only: the node is aria-hidden). */
function read(t: EventTarget | null, y: number): [State, string] {
  if (!(t instanceof Element)) return ["default", ""];
  const named = t.closest<HTMLElement>("[data-cursor]")?.dataset["cursor"] ?? "";
  if (t.closest(".wk__grip, .bench__handle")) return ["drag", UI.cursor.drag];
  const world = t.closest("[data-world-hit]");
  if (world?.closest("#work")) return ["drag", named || UI.cursor.drag];
  if (world?.closest("#lab")) return ["expand", named || UI.cursor.view];
  if (t.closest(":disabled, [aria-disabled='true']")) return ["disabled", ""];
  // The picker: a live pane picks its side anywhere below the top bar (intro.ts), so the whole pane is a target.
  if (t.closest(".intro__pane:not([inert])") && y > (document.querySelector(".intro__top")?.getBoundingClientRect().bottom ?? 0)) return ["select", ""];
  // Fields keep the native cursor (motion.css); only drag and view carry a label.
  if (t.closest("input, textarea, select, [contenteditable='true']") || (t.closest(PROSE) && !t.closest(".hero, a, button"))) return ["text", ""];
  if (t.closest("a[href]")) return ["link", ""];
  if (t.closest("button, [role='button'], [data-pick], summary, label")) return ["select", ""];
  return named ? ["expand", named] : ["default", ""]; // the world names a desk object under the pointer on <html>
}

interface Dot { kill(): void }
let dot: Dot | null = null;

/** The dot and its ring, built once per page (the intro picker starts it, the orchestrator adopts it). A solid Signal Red
 *  dot and a ring that grows over interactive things. The native cursor is hidden (html.has-cur) only after the dot has
 *  painted once; Tab hides the dot until the pointer moves again. Off for coarse pointers. */
function mount(): Dot | null {
  if (dot) return dot;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return null;
  const life = new AbortController();
  const html = document.documentElement;
  const node = document.createElement("div");
  node.className = "cur off";
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = '<i class="r"></i><i class="d"></i><span class="lab"></span>';
  const lab = node.querySelector<HTMLElement>(".lab")!;
  document.body.append(node);

  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, seen = false;
  const paint = () => {
    const s = store.get().mode === "raster" ? 8 : 1;
    node.style.transform = `translate3d(${Math.round(x / s) * s}px, ${Math.round(y / s) * s}px, 0)`;
  };
  // Follow: 0.35 of the remaining gap per frame; the loop stops once the dot is within 0.1 px.
  const step = () => {
    x += (tx - x) * 0.35; y += (ty - y) * 0.35;
    if (Math.abs(tx - x) < 0.1 && Math.abs(ty - y) < 0.1) { x = tx; y = ty; raf = 0; } else raf = requestAnimationFrame(step);
    paint();
  };

  const opts = { passive: true, signal: life.signal };
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    tx = e.clientX; ty = e.clientY;
    if (!seen || store.get().motion !== "full") { seen = true; x = tx; y = ty; paint(); }
    else if (!raf) raf = requestAnimationFrame(step);
    const [state, label] = read(e.target, e.clientY);
    node.dataset["state"] = state;
    if (lab.textContent !== label) lab.textContent = label;
    node.classList.toggle("on", !!label);
    node.classList.remove("off");
    html.classList.add("has-cur");
  }, opts);
  addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") node.classList.add("down"); }, opts);
  addEventListener("pointerup", () => node.classList.remove("down"), opts);
  // A click can open an overlay under a still pointer; drop the label until the pointer moves again.
  addEventListener("click", () => { lab.textContent = ""; node.classList.remove("on"); }, { capture: true, signal: life.signal });
  addEventListener("keydown", (e) => { if (e.key === "Tab") node.classList.add("off"); }, opts);
  document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) node.classList.add("off"); }, opts);

  return dot = {
    kill() {
      life.abort();
      cancelAnimationFrame(raf);
      node.remove();
      html.classList.remove("has-cur");
      dot = null;
    },
  };
}

/** Intro picker: start the dot before the orchestrator is up. */
export function early(): void { mount(); }

export async function create(o: { signal: AbortSignal; registry: Registry }): Promise<CursorHandle> {
  const d = mount();
  if (!d) return { destroy() {} };
  let done = false;
  let off = () => {};
  const h: CursorHandle = { destroy() { if (done) return; done = true; off(); d.kill(); } };
  o.signal.addEventListener("abort", h.destroy, { once: true });

  // Magnets: factor 0.28, capped at 8 px. Full motion only; gsap loads only when an element asks for it.
  const magnets = [...document.querySelectorAll<HTMLElement>("[data-magnetic]")];
  if (magnets.length && store.get().motion === "full") {
    const { gsap } = await loadGsap();
    if (done) return h;
    const cap = (v: number) => Math.max(-8, Math.min(8, v * 0.28));
    const ac = new AbortController();
    for (const el of magnets) {
      const mx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
      const my = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
      el.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        mx(cap(e.clientX - r.left - r.width / 2));
        my(cap(e.clientY - r.top - r.height / 2));
      }, { passive: true, signal: ac.signal });
      el.addEventListener("pointerleave", () => { mx(0); my(0); }, { signal: ac.signal });
    }
    off = () => { ac.abort(); gsap.killTweensOf(magnets); gsap.set(magnets, { clearProps: "transform" }); };
  }
  return h;
}
