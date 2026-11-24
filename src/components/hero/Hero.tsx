import { Fragment, useEffect, useRef, useState, type RefObject } from "react";
import { SITE, UI } from "../../lib/site";
import { isEnhanced } from "../../motion/config";
import { guardCreateAsync } from "../../rr/guard.ts";
import { registry } from "../../rr/registry.ts";
import { store } from "../../rr/store.ts";
import { DhakaClock } from "./DhakaClock";

const WORDS = SITE.name.split(" "); // matches the h1 aria-label
const FACTS = [SITE.study, SITE.lab, SITE.support];
/** Signature, an SVG under public/. rr/signature.ts inlines it and the entrance draws it (pen stroke in Render,
 *  stepped plotter in Raster). STATIC is the resting image: no JS, reduced motion, or inlining failed. */
const SIGNATURE_SRC: string | null = "/portrait/signature.svg";
const SIGNATURE_STATIC = "/portrait/signature-static.svg";

/** Motion-tier leaf host: Engine (GL wordmark) then Hero (intro, tracking settle, parallax, lens). */
function useHeroModules(hero: RefObject<HTMLElement | null>, word: RefObject<HTMLHeadingElement | null>, onLens: (on: boolean) => void) {
  useEffect(() => {
    const host = hero.current;
    if (!isEnhanced() || !host || !word.current) return;
    const lines = [...word.current.querySelectorAll<HTMLElement>(".wordmark__word")];
    const ac = new AbortController();
    const { signal } = ac;
    void (async () => {
      // Child effects run before App's orchestrator effect, so read the generation after it has begun.
      await null;
      if (signal.aborted) return;
      const gen = registry.gen;
      // Engine starts at once: Boot waits on its readiness (or failure) before the handoff.
      const engine = await guardCreateAsync("engine", signal, gen, async () =>
        (await import("../../rr/engine.ts")).create({ signal, host, lines, store }),
      );
      if (signal.aborted) return;
      const h = await guardCreateAsync("hero", signal, gen, async () =>
        (await import("../../rr/hero.ts")).create({ signal, host, lines, refresh: await registry.whenReady("refresh", signal), engine: engine ?? null }),
      );
      // The lens lives in hero.ts and needs the GL wordmark, so the hint only promises it once both are up.
      if (h && engine?.ok && !signal.aborted) onLens(true);
    })();
    return () => ac.abort();
  }, [hero, word, onLens]);
}

/** Optional signature. Static image first (no JS, reduced motion); the motion tier appends the inline vector. */
function Signature({ src }: { src: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = el.current;
    if (!isEnhanced() || !host) return;
    const ac = new AbortController();
    void import("../../rr/signature.ts").then((m) => m.inline(host, src, ac.signal)).catch(() => {});
    return () => ac.abort();
  }, [src]);
  return (
    <div ref={el} className="hero__sig" data-rr-signature aria-hidden="true">
      <img src={SIGNATURE_STATIC} alt="" width={774} height={522} decoding="async" />
    </div>
  );
}

/** Hero: portrait, meta line, wordmark, role column and hint. */
export function Hero() {
  const hero = useRef<HTMLElement>(null);
  const word = useRef<HTMLHeadingElement>(null);
  const [lens, setLens] = useState(false);
  useHeroModules(hero, word, setLens);

  const hint = !lens ? UI.hero.hint.start : matchMedia("(pointer: fine)").matches ? UI.hero.hint.fine : UI.hero.hint.touch;

  // Lines rise from their clip boxes (data-rr-rise); meta and role drift (data-rr-parallax): rr/hero.ts.
  return (
    <section ref={hero} id="top" aria-label="Introduction" className="hero isolate">
      {/* Portrait. Decorative: the name is the identity. Engine draws it in GL and adds
          .por-ok; until then, and without WebGL, these CSS layers show the same treatment. */}
      <div className="hero__portrait" aria-hidden="true">
        <div className="hero__portrait-box">
          <div className="por-ink" />
          <img className="por-px" src="/portrait/portrait-px-raster.png" alt="" width={408} height={456} decoding="async" />
        </div>
      </div>

      <div className="hero__meta" data-rr-parallax="-0.22">
        <div className="rise">
          <span className="block" data-rr-rise>{SITE.place}</span>
        </div>
        <div className="rise">
          <span className="block" data-rr-rise>{SITE.coords}</span>
        </div>
        <div className="rise">
          {/* DhakaClock carries its own screen-reader label, so the visible word stays out of the accessible name. */}
          <div className="flex items-center gap-2" data-rr-rise>
            <span aria-hidden="true">{UI.hero.local}</span>
            <DhakaClock />
          </div>
        </div>
      </div>

      <div className="hero__measure">
        <h1 ref={word} aria-label={SITE.name} className="wordmark">
          {WORDS.map((w, wi) => (
            <Fragment key={w}>
              {wi > 0 && " "}
              <span className="wordmark__word" aria-hidden="true">{w}</span>
            </Fragment>
          ))}
        </h1>

        <div className="hero__role" data-rr-parallax="-0.09">
          <div className="hero__lead">
            <p className="rise">
              <span className="block" data-rr-rise>Creator &amp; Developer.</span>
            </p>
            <ul className="hero__facts">
              {FACTS.map((f) => (
                <li key={f} className="rise">
                  <span className="block" data-rr-rise>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {SIGNATURE_SRC && <Signature src={SIGNATURE_SRC} />}
      </div>

      <p className="hero__hint rise" data-rr-parallax="-0.09">
        <span className="block" data-rr-rise>{hint}</span>
      </p>
    </section>
  );
}
