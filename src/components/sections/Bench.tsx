import { useState } from "react";
import { m } from "motion/react";
import { UI } from "../../lib/site";
import "../../styles/bench.css";
import { Raster } from "./Raster";
import { Showcase } from "./Showcase";
import { Rise } from "./parts";
import { fade, useReveal } from "./reveal";

const B = UI.bench;

const has2d = () => {
  try { return !!document.createElement("canvas").getContext("2d"); } catch { return false; }
};

/** Lab entry L.01: its heading and side line, then the "From a line to pixels" showcase (Showcase.tsx). Without canvas 2D
 *  the static Raster figure stands in. The class "bench" is what world/lab.ts reads to lift card L.01 on hover. */
export function Bench() {
  const reveal = useReveal();
  const [failed] = useState(() => !has2d());

  return (
    <>
      <m.div className="bench col-span-full mt-12 grid grid-cols-subgrid gap-y-6 lg:mt-20" {...reveal}>
        <h3 id="bench-title" className="heading col-span-full text-display-m md:col-span-4 lg:col-span-6">
          <Rise own>{B.heading}</Rise>
        </h3>
        <m.p
          variants={fade}
          className="col-span-full max-w-[40ch] text-bone-300 md:col-span-4 md:col-start-3 lg:col-span-4 lg:col-start-9 lg:self-end"
        >
          {B.side}
        </m.p>
      </m.div>

      {failed ? (
        <m.figure className="col-span-full mt-12 lg:mt-16" {...reveal}>
          <Raster />
          <figcaption className="meta mt-3 text-bone-500">{B.caption}</figcaption>
        </m.figure>
      ) : (
        <Showcase />
      )}
    </>
  );
}
