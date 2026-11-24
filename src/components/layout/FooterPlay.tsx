import { useEffect, useRef, useState } from "react";
import { SITE } from "../../lib/site";
import { guardCreateAsync } from "../../rr/guard.ts";
import { registry } from "../../rr/registry.ts";
import "../../styles/footer.css";
import { FADE, pixelName } from "./pixelName";

const has2d = () => {
  try { return !!document.createElement("canvas").getContext("2d"); } catch { return false; }
};

const WORDS = SITE.name.toUpperCase().split(" ");
const PX = [pixelName([WORDS.join(" ")])]; // the name is one line at every width

/** The visual name. Each word's box runs from cap line to baseline (text-box trim); each cell SVG carries its lines and letter
 *  extents in data-ls (viewBox units), so rr/closing.ts can place the scene around the letters. */
function Name() {
  return (
    <div className="ftr-name">
      <div className="ftr-name__t">
        {WORDS.map((w, i) => (
          <span key={w} className="ftr-name__l">
            <span className="ftr-name__w" aria-hidden="true">{w}</span>
            {i === WORDS.length - 1 && (
              <span className="ftr-name__s">
                <span aria-hidden="true">.</span>
                <a className="ftr-dot" href="#top" aria-label="Back to top" title="Back to top" />
              </span>
            )}
          </span>
        ))}
      </div>
      {PX.map((n, i) => (
        <div key={i} className="ftr-name__pw">
        <svg className={`ftr-name__px ftr-name__px--${i + 1}`} viewBox={`0 0 ${n.w} ${n.h}`} data-ls={JSON.stringify(n.ls)} data-ch={n.ch.join(" ")} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
          {/* opaque bands: a translucent cell let the scene behind it split the cell in two tones */}
          {n.d.map((d, k) => <path key={k} d={d} style={{ fill: `color-mix(in srgb, currentColor ${Math.round((FADE[k] ?? 1) * 1000) / 10}%, var(--paper))` }} />)}
          <rect className="ftr-dot__r" x={n.stop[0]} y={n.stop[1]} width="13" height="13" fill="var(--signal)" />
        </svg>
        <a className="ftr-dot" href="#top" aria-label="Back to top" title="Back to top" style={{ left: `${(n.stop[0] / n.w) * 100}%`, top: `${(n.stop[1] / n.h) * 100}%`, width: `${(13 / n.w) * 100}%`, height: `${(13 / n.h) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Decorative closing stage: back canvas, the name, front canvas. The worlds live in rr/closing.ts; without canvas 2D or
 *  that module the canvases go and the name stays, so the stage never depends on them. */
export function FooterPlay() {
  const [failed, setFailed] = useState(() => !has2d());
  const host = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const h = host.current, b = back.current, f = front.current;
    if (failed || !h || !b || !f) return;
    const ac = new AbortController();
    const { signal } = ac;
    void (async () => {
      // Child effects run before App's orchestrator effect, so read the generation after it has begun.
      await null;
      if (signal.aborted) return;
      const handle = await guardCreateAsync("closing", signal, registry.gen, async () =>
        (await import("../../rr/closing.ts")).create({ signal, host: h, back: b, front: f }),
      );
      if (!signal.aborted && !handle) setFailed(true);
    })();
    return () => ac.abort();
  }, [failed]);

  return (
    <div ref={host} className="ftr-stage">
      {!failed && <canvas ref={back} aria-hidden="true" />}
      <Name />
      {!failed && <canvas ref={front} aria-hidden="true" />}
    </div>
  );
}
