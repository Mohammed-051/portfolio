import { useEffect } from "react";
import { LazyMotion } from "motion/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Layout } from "./components/layout/Layout";
import { Hero } from "./components/hero/Hero";
import { Sections } from "./components/sections/Sections";
import { guardCreateAsync } from "./rr/guard.ts";
import * as Refresh from "./rr/refresh.ts";
import * as Plates from "./rr/plates.ts";
import { registry } from "./rr/registry.ts";
import * as Scroll from "./rr/scroll.ts";
import { isEnhanced } from "./motion/config";

// Test hooks (window.__rr) exist only outside production; check-bundle fails on them in the production entry.
if (import.meta.env.MODE !== "production") void import("./rr/debug.ts");

// Motion's animation features arrive in their own chunk. Until then `m` elements render their
// initial styles, so the hero paints at once with no layout shift.
const features = () => import("./motion/features").then((r) => r.default);

/** Orchestrator: the only creator of the shared core modules, in readiness order. Plates is core: static in the main chunk. */
function useRR() {
  useEffect(() => {
    const ac = new AbortController();
    const { signal } = ac;
    const gen = registry.begin();
    const o = { signal, registry };
    void (async () => {
      await guardCreateAsync("scroll", signal, gen, () => Scroll.create(o));
      if (signal.aborted) return;
      await guardCreateAsync("refresh", signal, gen, () => Refresh.create(o));
      if (signal.aborted) return;
      // Wipe, Boot and the hero modules load as their own chunks (the main chunk carries only the core rr modules).
      await guardCreateAsync("wipe", signal, gen, async () => (await import("./rr/wipe.ts")).create(o));
      if (signal.aborted) return;
      await guardCreateAsync("plates", signal, gen, () => Plates.create());
      if (signal.aborted) return;
      await guardCreateAsync("boot", signal, gen, async () => (await import("./rr/boot.ts")).create(o));
      if (signal.aborted) return;
      await guardCreateAsync("rail", signal, gen, async () => (await import("./rr/rail.ts")).create(o));
      if (signal.aborted) return;
      await guardCreateAsync("menu", signal, gen, async () => (await import("./rr/menu.ts")).create(o));
      if (signal.aborted) return;
      await guardCreateAsync("cursor", signal, gen, async () => (await import("./rr/cursor.ts")).create(o));
      if (signal.aborted) return;
      if (isEnhanced()) await guardCreateAsync("journey", signal, gen, async () => (await import("./rr/journey.ts")).createJourney({ signal }));
    })();
    return () => {
      ac.abort();
      registry.destroyAll(gen);
    };
  }, []);
}

export default function App() {
  useRR();
  return (
    <LazyMotion features={features} strict>
      <Layout>
        <Hero />
        <Sections />
      </Layout>
      <SpeedInsights />
    </LazyMotion>
  );
}
