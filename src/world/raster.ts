// Raster treatment of the same scene: a low-res target, nearest upscale, 4x4 Bayer dither onto the Raster 5-tone ramp.
// Red survives as the Raster signal. Alpha is dithered too, so the light pool on the table reads as a dot screen.
import {
  Mesh, NearestFilter, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderTarget,
  type Camera, type WebGLRenderer,
} from "three";

export interface RasterPass { render(scene: Scene, camera: Camera): void; setSize(w: number, h: number, cell: number): void; dispose(): void }

export function createRasterPass(renderer: WebGLRenderer): RasterPass {
  const rt = new WebGLRenderTarget(4, 4, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
  const mat = new ShaderMaterial({
    uniforms: { tSrc: { value: rt.texture }, uSize: { value: new Vector2(4, 4) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `
      uniform sampler2D tSrc; uniform vec2 uSize; varying vec2 vUv;
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      float bayer(vec2 p){ int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
        int m[16] = int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return (float(m[i]) + 0.5) / 16.0; }
      void main(){
        vec2 cell = floor(vUv * uSize);
        vec4 s = texture2D(tSrc, (cell + 0.5) / uSize);
        float b = bayer(cell);
        float a = step(b, s.a);
        if (a < 0.5) { gl_FragColor = vec4(0.0); return; }
        vec3 c = toSRGB(s.rgb / max(s.a, 1e-4));
        if (c.r > 0.42 && c.r > c.g * 1.7 && c.r > c.b * 1.7) { gl_FragColor = vec4(1.0, 0.31, 0.227, 1.0); return; }
        vec3 ramp[5] = vec3[5](vec3(0.031,0.031,0.027), vec3(0.173,0.165,0.149), vec3(0.42,0.404,0.373), vec3(0.722,0.702,0.655), vec3(0.922,0.906,0.867));
        float v = clamp(dot(c, vec3(0.299, 0.587, 0.114)) * 4.2, 0.0, 4.0), f = floor(v);
        gl_FragColor = vec4(ramp[int(min(f + step(b, v - f), 4.0))], 1.0);
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const post = new Scene().add(quad);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    render(scene, camera) {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(post, cam);
    },
    setSize(w, h, cell) {
      const rw = Math.ceil(w / cell), rh = Math.ceil(h / cell);
      rt.setSize(rw, rh);
      mat.uniforms["uSize"]!.value.set(rw, rh);
    },
    dispose() { rt.dispose(); mat.dispose(); quad.geometry.dispose(); },
  };
}
