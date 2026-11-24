import { store } from "./store.ts";

/** Sound intents. Main chunk. Nothing listens to "rr:sfx"; cues come from
 *  data-sfx attributes and store changes (rr/sound). */
export type Intent = "tap" | "navigate" | "select" | "toggle" | "open" | "close";

/** Dispatches CustomEvent "rr:sfx" on document with detail = intent. */
export function sfx(intent: Intent): void {
  document.dispatchEvent(new CustomEvent<Intent>("rr:sfx", { detail: intent }));
}

// Loader (main chunk, kept tiny): rr/sound loads on the first real gesture made while sound is on, never before.
const T = ["click", "keydown"];
const go = (e: Event) => {
  if (store.get().sound !== "on" || !navigator.userActivation?.isActive) return;
  T.forEach((t) => removeEventListener(t, go, true));
  off();
  void import("./sound/index.ts").then((m) => m.start(e), () => {});
};
T.forEach((t) => addEventListener(t, go, true));
const off = store.subscribe("sound", () => go(new Event("rr:sound")));
