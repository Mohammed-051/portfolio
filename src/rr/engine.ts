import * as canvasBudget from "./canvasBudget.ts";
import { addTicker, loadGsap, token } from "./refresh.ts";
import type { Handle } from "./registry.ts";
import type { RRStore } from "./store.ts";

export interface ModeTokens { paper: string; ink: string; signal: string; rule: string; mute: string }
/** Shader inputs Hero drives. mx, my are viewport (client) px; Engine converts them to the host canvas.
 *  por: portrait entrance (tonal emergence in Render, pixel assembly in Raster); atm: background grid. */
export interface EngineUniforms { mx: number; my: number; lens: number; intro: number; derez: number; cell: number; por: number; atm: number }
export interface EngineHandle extends Handle {
  resize(): void;
  setColors(t: ModeTokens): void;
  /** spread: extra tracking in em, widest at the entrance and 0 at rest. Drawn from the real line boxes, so no layout moves. */
  buildTexture(lines: HTMLElement[], spread?: number): void;
  invalidate(): void;
  readonly ok: boolean; // false: DOM wordmark stays visible
  readonly u: EngineUniforms; // the uniforms Hero's timeline drives
}

export const readTokens = (): ModeTokens => ({ paper: token("--paper"), ink: token("--ink"), signal: token("--signal"), rule: token("--rule"), mute: token("--mute") });
// Portrait derivatives. px: R lightness on dark paper, G ink on light paper, B accent.
const POR_PX = "/portrait/portrait-px.png", POR_INK = "/portrait/portrait-ink.webp";
const fontOf = (el: HTMLElement) => { const cs = getComputedStyle(el); return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; };
/** Resolves once the active mode's name face is loaded (Render and Raster use different families), or after ms. */
const nameReady = (el: HTMLElement | undefined, ms = 1500) => el
  ? Promise.race([document.fonts.load(fontOf(el), el.textContent ?? "").catch(() => {}), new Promise((r) => setTimeout(r, ms))])
  : Promise.resolve();

export const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// The wordmark texture carries the glyph coverage in A. There is no halo, and the portrait is drawn whole (no fade band): every pixel of the frame is shown.
const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision highp float;
uniform vec2 uRes;uniform float uDpr;uniform vec2 uMouse;uniform float uLens;uniform float uMode;uniform float uScroll;uniform float uCell;
uniform vec4 uHero;uniform sampler2D uTex;uniform float uTexOn;uniform float uIntro;uniform float uDerez;
uniform vec3 uPaper;uniform vec3 uInk;uniform vec3 uSig;uniform vec3 uRule;uniform vec3 uMute;
uniform sampler2D uPor;uniform sampler2D uPin;uniform vec4 uPorB;uniform float uPorI;uniform float uPorOn;uniform float uAtm;
uniform float uPass;uniform float uField;
float b2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec4 ov(vec4 o,vec3 c,float a){return vec4(c*a,a)+o*(1.-a);}
void main(){
  vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;
  float d=length(p-uMouse);
  float inL=uLens>.5?1.-step(uLens,d):0.;
  float rast=abs(uMode-inL);
  vec4 o=vec4(0.);
  if(uPass<.5){
    float s=uCell;
    vec2 g=mod(p+vec2(0.,uScroll*.35),s)-s*.5;
    float r=mix(.75,1.25,rast);
    o=ov(o,uRule,step(abs(g.x),r)*step(abs(g.y),r)*uAtm);
    if(inL>.5){vec2 f=mod(p,8.);o=ov(o,uRule,max(step(7.,f.x),step(7.,f.y))*.6);}
    if(uPorOn>.5){
      vec2 pp=p-vec2(uPorB.x,uPorB.y-uScroll),q=pp/uPorB.zw;
      if(q.x>=0.&&q.y>=0.&&q.x<1.&&q.y<1.){
        if(max(max(uMode,inL),step(.15,uDerez))<.5){
          float v=texture2D(uPin,q).r,t=1.1-1.2*uPorI;
          o=ov(o,uPaper,smoothstep(.03,.09,v)*uPorI); // opaque paper under the subject hides the signature
          o=ov(o,mix(uInk,uSig,step(.5,texture2D(uPor,q).b)),v*smoothstep(t-.15,t,v));
        }else if(uField*uMode*(1.-inL)<.5){ // Raster blocks come from rr/field.ts once ready; the lens keeps these cells
          float c=floor(clamp(uPorB.z/64.,4.,9.)+.5);
          vec2 id=floor(pp/c),f=pp-id*c;
          vec3 dt=texture2D(uPor,(id+.5)*c/uPorB.zw).rgb;
          float v=uMode>.5?dt.r:dt.g;
          float lv=floor(clamp(v*3.+b4(id)*.98,0.,3.));
          float on=step(.5,lv)*step(h21(id)*.7+q.y*.3,uPorI*1.02)*step(uDerez*1.1,h21(id+3.));
          on*=step(f.x,c-1.)*step(f.y,c-1.);
          vec3 pc=lv<1.5?uRule:lv<2.5?uMute:uInk;
          o=ov(o,mix(pc,uSig,step(.5,dt.b)),on);
        }
      }
    }
  }else{
    vec2 hp=p-vec2(uHero.x,uHero.y-uScroll);
    if(uTexOn>.5&&hp.x>=0.&&hp.y>=0.&&hp.x<uHero.z&&hp.y<uHero.w){
      float c=mix(48.,1.,uIntro);
      c=max(c,1.+uDerez*34.);
      c=max(c,rast*clamp(uHero.w/37.,3.,7.));
      c=floor(c+.5);
      if(c<1.5){
        o=ov(o,uInk,texture2D(uTex,hp/uHero.zw).a);
      }else{
        vec2 id=floor(hp/c);
        float a=texture2D(uTex,(id+.5)*c/uHero.zw).a;
        float on=step(b4(id)*.92+.04,a);
        vec2 f=hp-id*c;
        if(c>3.5){on*=step(f.x,c-1.)*step(f.y,c-1.);}
        float row=step(abs((id.y+.5)*c-(uMouse.y-(uHero.y-uScroll))),c*.5)*inL;
        float hot=step(.985,h21(id))*step(.02,uDerez);
        o=ov(o,mix(uInk,uSig,max(row,hot)),on);
      }
    }
    if(uLens>.5){vec2 rq=(floor(p/4.)+.5)*4.;o=ov(o,uSig,step(abs(length(rq-uMouse)-uLens),2.));}
  }
  gl_FragColor=o; // premultiplied: the body paints the paper under the transparent canvas
}`;
const NAMES = ["uRes", "uDpr", "uMouse", "uLens", "uMode", "uScroll", "uCell", "uHero", "uTex", "uTexOn", "uIntro", "uDerez", "uPaper", "uInk", "uSig", "uRule",
  "uMute", "uPor", "uPin", "uPorB", "uPorI", "uPorOn", "uAtm", "uPass", "uField"] as const;
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = rej;
  i.src = src;
});

export async function create(o: { signal: AbortSignal; host: HTMLElement; lines: HTMLElement[]; store: RRStore }): Promise<EngineHandle> {
  const { gsap } = await loadGsap();
  const { host, store } = o;
  const life = new AbortController();
  const signal = AbortSignal.any([o.signal, life.signal]);
  // intro, por, atm 1: resolved if Hero never runs
  const u: EngineUniforms = { mx: -999, my: -999, lens: 0, intro: 1, derez: 0, cell: 24, por: 1, atm: 1 };
  let gl: WebGLRenderingContext | null = null, prog: WebGLProgram | null = null, buf: WebGLBuffer | null = null, tex: WebGLTexture | null = null;
  let texP: WebGLTexture | null = null, texI: WebGLTexture | null = null;
  let U = {} as Record<(typeof NAMES)[number], WebGLUniformLocation | null>;
  let ok = false, visible = true, dpr = 1, texOn = 0, last = "", rt = 0, aLoc = 0;
  // Living layer (rr/field.ts, own chunk): Raster cube blocks or Render particles, drawn between portrait and name.
  let fieldMod: typeof import("./field.ts") | null = null, field: import("./field.ts").Field | null = null;
  let hero: [number, number, number, number] = [0, 0, 1, 1];
  // Portrait: box in host px (the DOM .hero__portrait-box, the whole 1538:1719 frame).
  let por: [number, number, number, number] = [0, 0, 1, 1], porOn = 0, porKey = "";
  let imgP: HTMLImageElement | null = null, imgI: HTMLImageElement | null = null;
  let hostX = 0, hostY = 0; // host's document offset, cached where layout is already read so draw() never forces layout
  let args: [HTMLElement[], number] = [o.lines, 0];
  let colors = readTokens();
  let mode = store.get().mode === "raster" ? 1 : 0;

  const cv = document.createElement("canvas");
  cv.className = "rr-gl";
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
  host.prepend(cv);
  canvasBudget.register(cv, { visible: () => visible });

  // Builds program, buffer and texture; runs again after webglcontextrestored. WebGL1 only.
  function setup(): boolean {
    const g = cv.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: "low-power" });
    if (!g) return false;
    const sh = (t: number, s: string) => {
      const x = g.createShader(t);
      if (!x) return null;
      g.shaderSource(x, s);
      g.compileShader(x);
      if (g.getShaderParameter(x, g.COMPILE_STATUS)) return x;
      console.warn("[rr] engine shader", g.getShaderInfoLog(x));
      g.deleteShader(x);
      return null;
    };
    const v = sh(g.VERTEX_SHADER, VS), f = sh(g.FRAGMENT_SHADER, FS), p = g.createProgram();
    if (!v || !f || !p) return false;
    g.attachShader(p, v);
    g.attachShader(p, f);
    g.linkProgram(p);
    g.deleteShader(v);
    g.deleteShader(f);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) { g.deleteProgram(p); return false; }
    g.useProgram(p);
    buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    aLoc = g.getAttribLocation(p, "a");
    g.enable(g.BLEND);
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.clearColor(0, 0, 0, 0);
    U = Object.fromEntries(NAMES.map((n) => [n, g.getUniformLocation(p, n)])) as typeof U;
    const mk = (unit: number) => {
      const t = g.createTexture();
      g.activeTexture(g.TEXTURE0 + unit);
      g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      return t;
    };
    texP = mk(1);
    texI = mk(2);
    tex = mk(0); // unit 0 stays active for the wordmark uploads
    g.uniform1i(U.uTex, 0);
    g.uniform1i(U.uPor, 1);
    g.uniform1i(U.uPin, 2);
    gl = g;
    prog = p;
    texOn = 0;
    porOn = 0;
    porKey = "";
    setColors(colors);
    mkField();
    return true;
  }

  // Needs the GL context and the px data image; runs again after a context restore (old GL objects died with it).
  function mkField() {
    field = null;
    if (!gl || !imgP || !fieldMod) return;
    try { field = fieldMod.create(gl, imgP, () => { last = ""; }); } catch (e) { console.warn("[rr] field", e); }
    field?.setColors(colors);
  }

  function setColors(t: ModeTokens) {
    colors = t;
    if (!gl) return;
    gl.uniform3fv(U.uPaper, rgb(t.paper));
    gl.uniform3fv(U.uInk, rgb(t.ink));
    gl.uniform3fv(U.uSig, rgb(t.signal));
    gl.uniform3fv(U.uRule, rgb(t.rule));
    gl.uniform3fv(U.uMute, rgb(t.mute));
    field?.setColors(t);
    last = "";
  }

  // Uploads the portrait once its images and box are known. The ink layer is resampled to the box's device size by
  // the 2D canvas (high-quality downscale), so the engraving hatch does not alias in the shader (WebGL1: no mipmaps).
  function upPortrait() {
    if (!gl || !imgP || !imgI || por[2] < 8) return;
    const k = Math.min(dpr, 2), w = Math.round(por[2] * k), h = Math.round(por[3] * k), key = `${w}x${h}`;
    if (key === porKey) return;
    const c = document.createElement("canvas"); // transient: released below in the same task
    c.width = Math.min(w, imgI.naturalWidth);
    c.height = Math.min(h, imgI.naturalHeight);
    const x = c.getContext("2d");
    if (!x) return;
    x.imageSmoothingQuality = "high";
    x.drawImage(imgI, 0, 0, c.width, c.height);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texI);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    c.width = c.height = 0;
    if (!porOn) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texP);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgP);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    porKey = key;
    porOn = 1;
    last = "";
    host.classList.add("por-ok");
  }

  function resize() {
    if (!ok || !gl) return;
    const coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 900;
    dpr = canvasBudget.size(cv, host.clientWidth, host.clientHeight, Math.min(devicePixelRatio || 1, coarse ? 1 : 1.5));
    gl.viewport(0, 0, cv.width, cv.height);
    const hr = host.getBoundingClientRect();
    hostX = hr.left + scrollX; hostY = hr.top + scrollY;
    last = "";
  }

  // The wordmark drawn into a texture matching the DOM line boxes.
  function buildTexture(lines: HTMLElement[], spread = 0) {
    args = [lines, spread];
    if (!ok || !gl) return;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of lines) {
      const q = el.getBoundingClientRect();
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (!(r > l && b > t)) return;
    const c = document.createElement("canvas"); // transient: released below in the same task
    const x = c.getContext("2d");
    if (!x) return;
    // Measure first: each line is fitted to its DOM box, then spread tracking widens it about its centre.
    const rows = lines.map((el) => {
      const cs = getComputedStyle(el), q = el.getBoundingClientRect(), fs = parseFloat(cs.fontSize);
      const raw = el.textContent ?? "", txt = cs.textTransform === "uppercase" ? raw.toUpperCase() : raw;
      const ls = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;
      x.font = fontOf(el);
      x.letterSpacing = `${ls}px`;
      const m = x.measureText(txt), asc = m.fontBoundingBoxAscent || fs * 0.9, des = m.fontBoundingBoxDescent || fs * 0.22;
      const sc = m.width ? q.width / m.width : 1;
      return { el, txt, q, fs, ls, asc, des, sc, ok: m.width > 0, extra: spread * fs * txt.length * sc };
    }).filter((w) => w.ok);
    const fs0 = rows[0]?.fs ?? 64, padX = Math.ceil(Math.max(0, ...rows.map((w) => w.extra)) / 2) + 2, padY = Math.ceil(fs0 * 0.12);
    const w = r - l + 2 * padX, h = b - t + 2 * padY;
    const k = Math.min(devicePixelRatio || 1, 2);
    c.width = Math.ceil(w * k); // resizing resets the 2D state, so the fonts are set again below
    c.height = Math.ceil(h * k);
    x.scale(k, k);
    x.fillStyle = "#fff";
    for (const o of rows) {
      x.font = fontOf(o.el);
      x.letterSpacing = `${o.ls + spread * o.fs}px`;
      x.save();
      x.translate(o.q.left - l + padX - o.extra / 2, o.q.top - t + padY + o.asc * (o.q.height / (o.asc + o.des)));
      x.scale(o.sc, 1);
      x.fillText(o.txt, 0, 0);
      x.restore();
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    c.width = c.height = 0;
    const hr = host.getBoundingClientRect();
    hero = [l - padX - hr.left, t - padY - hr.top, w, h];
    hostX = hr.left + scrollX; hostY = hr.top + scrollY;
    const pbEl = host.querySelector<HTMLElement>(".hero__portrait-box"), pb = pbEl?.getBoundingClientRect();
    if (pbEl && pb && pb.width > 0) {
      por = [pb.left - hr.left, pb.top - hr.top, pb.width, pb.height];
      upPortrait();
    }
    texOn = 1;
    last = "";
    host.classList.add("gl-ok");
  }

  function draw(time: number) {
    if (!ok || !gl || !visible || document.hidden) return;
    const sy = scrollY, mx = u.mx - (hostX - scrollX), my = u.my - (hostY - sy);
    const reduced = store.get().motion === "reduced", fOn = field?.ready && porOn ? 1 : 0;
    const key = [mx | 0, my | 0, u.lens.toFixed(1), mode, sy | 0, u.cell.toFixed(2), u.intro.toFixed(3), u.derez.toFixed(3), u.por.toFixed(3), u.atm.toFixed(2), cv.width, cv.height, fOn].join();
    // The field animates, so it redraws every tick; reduced motion keeps the cached still.
    if (key === last && !(fOn && !reduced)) return;
    last = key;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U.uPass, 0);
    gl.uniform1f(U.uField, fOn);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform2f(U.uMouse, mx, my);
    gl.uniform1f(U.uLens, u.lens);
    gl.uniform1f(U.uMode, mode);
    gl.uniform1f(U.uScroll, sy);
    gl.uniform1f(U.uCell, u.cell);
    gl.uniform4f(U.uHero, hero[0], hero[1] + sy, hero[2], hero[3]); // shader subtracts uScroll; canvas scrolls with the host
    gl.uniform1f(U.uTexOn, texOn);
    gl.uniform1f(U.uIntro, u.intro);
    gl.uniform1f(U.uDerez, u.derez);
    gl.uniform4f(U.uPorB, por[0], por[1] + sy, por[2], por[3]);
    gl.uniform1f(U.uPorI, u.por);
    gl.uniform1f(U.uPorOn, porOn);
    gl.uniform1f(U.uAtm, u.atm);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (fOn && field) {
      field.draw({ t: reduced ? 0 : time, mode, box: por, res: [cv.width, cv.height], dpr, mouse: [u.mx < -500 ? -1e4 : mx, my], lens: u.lens, por: u.por, derez: u.derez, reduced });
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
    }
    gl.uniform1f(U.uPass, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  ok = setup();
  if (!ok) {
    canvasBudget.release(cv, true);
    const noop = () => {};
    return { ok: false, u, resize: noop, setColors: noop, buildTexture: noop, invalidate: noop, destroy: noop };
  }
  resize();
  await nameReady(o.lines[0]); // the active mode's face, so the texture never bakes the fallback
  buildTexture(...args);
  // Not awaited: the wordmark never waits on the portrait. On failure the DOM portrait stays (no .por-ok).
  void Promise.all([load(POR_PX), load(POR_INK)]).then(([a, b]) => {
    if (signal.aborted) return;
    imgP = a; imgI = b;
    upPortrait();
    // On failure the shader keeps its own Raster cells and Render ink: the field is an enhancement only.
    return import("./field.ts").then((m) => { if (!signal.aborted) { fieldMod = m; mkField(); } });
  }).catch(() => {});

  const rmTick = addTicker(gsap, draw);
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(([e]) => { visible = e?.isIntersecting ?? true; }) : null;
  io?.observe(host);
  const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = window.setTimeout(() => { resize(); buildTexture(...args); }, 120);
  });
  ro.observe(host);
  const unsub = [
    store.subscribe("mode", (s) => {
      mode = s.mode === "raster" ? 1 : 0;
      setColors(readTokens());
      // The name face changes with the mode: rebuild once the new one is loaded.
      void nameReady(args[0][0]).then(() => { if (!signal.aborted) buildTexture(...args); });
    }),
    store.subscribe("fontGen", () => buildTexture(...args)),
  ];
  cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ok = false; host.classList.remove("gl-ok", "por-ok"); }, { signal });
  cv.addEventListener("webglcontextrestored", () => { ok = setup(); resize(); buildTexture(...args); }, { signal });

  return {
    get ok() { return ok; },
    u,
    resize,
    setColors,
    buildTexture,
    invalidate: () => { last = ""; },
    destroy() {
      if (life.signal.aborted) return;
      life.abort();
      ok = false;
      rmTick();
      io?.disconnect();
      ro.disconnect();
      clearTimeout(rt);
      for (const f of unsub) f();
      host.classList.remove("gl-ok", "por-ok");
      imgP = imgI = null;
      field?.destroy();
      field = null;
      if (gl) {
        gl.deleteTexture(tex);
        gl.deleteTexture(texP);
        gl.deleteTexture(texI);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvasBudget.release(cv, true);
    },
  };
}
