// Blender props: fetched at idle after the world has drawn, swapped in place for the procedural meshes, which stay
// on any error. Each node comes back as one Z-up geometry whose groups follow the station's own material order, so the
// kit pairs dress it in both modes. Not on phones: a few pixels of detail there do not pay for the download.
import type { BufferGeometry, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Ctx } from "./core.ts";

type Idle = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
const idle = () => new Promise<void>((r) => { const w = window as Idle; if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 4000 }); else setTimeout(r, 1000); });

// The v2 props (bevels, page stack, stitched spine, rolled tray lip, hex pencil, AO in COLOR_0, quantised
// normals via KHR_mesh_quantization). Same node and slot names as v1, so callers ask by the old name.
const V2: Record<string, string> = { notebook: "notebook-v2", "lab-tray": "lab-tray-v2", "desk-kit": "desk-kit-v2" };
/** Bumped as each GLB lands: desk.ts dresses AO on the next frame after. */
export let landed = 0;

/** /world/<name>.glb as node name -> geometry; group i of a primitive is slots.indexOf(its material name). */
export async function glb(ctx: Ctx, name: string, slots: string[]): Promise<Record<string, BufferGeometry>> {
  if (ctx.tier === "phone") throw new Error("glb: phone keeps the procedural meshes");
  await idle();
  const { scene } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}world/${V2[name] ?? name}.glb`);
  landed++;
  const out: Record<string, BufferGeometry> = {};
  const props = name.startsWith("props/"); // every node of a prop file merges into one geometry, keyed by the file name
  for (const node of props ? [scene] : scene.children) {
    const meshes: Mesh[] = [];
    node.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
    const g = mergeGeometries(meshes.map((m) => m.geometry), true);
    if (!g) throw new Error(`glb: ${name}/${node.name} would not merge`);
    g.groups.forEach((gr, i) => {
      gr.materialIndex = slots.indexOf((meshes[i]!.material as { name: string }).name);
      if (gr.materialIndex < 0) throw new Error(`glb: ${name} has an unknown slot ${(meshes[i]!.material as { name: string }).name}`);
    });
    out[props ? name.slice(6) : node.name] = g.rotateX(Math.PI / 2); // Blender's Z-up came out as glTF Y-up
  }
  return out;
}

/** Top-down uvs over a w x h box centred on the origin, like kit.card: the kit's face textures (flipY) read upright. */
export function planar(g: BufferGeometry, w: number, h: number) {
  const p = g.getAttribute("position"), uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return g;
}
