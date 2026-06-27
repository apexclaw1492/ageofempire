import * as THREE from 'three';
import { MAP } from '../config.js';
import { makeGrass, makeDirt, makeRock } from '../engine/textures.js';

// Seeded fractal value noise for the heightfield.
function makeNoise(seed) {
  const p = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => { const u = h & 1 ? x : -x, v = h & 2 ? y : -y; return u + v; };
  function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u),
                lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v);
  }
  return (x, y) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < 5; o++) { sum += noise2(x * freq, y * freq) * amp; norm += amp; amp *= 0.5; freq *= 2.0; }
    return sum / norm;
  };
}

export class Terrain {
  constructor(seed = MAP.seed) {
    this.size = MAP.size;
    this.seg = 128;                 // geometry resolution
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed ^ 0x9e3779b9);
    this.heights = null;
    this.mesh = this._build();
  }

  // World-space height lookup (bilinear over the cached grid).
  heightAt(x, z) {
    const s = this.size, seg = this.seg;
    const fx = ((x + s / 2) / s) * seg;
    const fz = ((z + s / 2) / s) * seg;
    const x0 = Math.max(0, Math.min(seg, Math.floor(fx)));
    const z0 = Math.max(0, Math.min(seg, Math.floor(fz)));
    const x1 = Math.min(seg, x0 + 1), z1 = Math.min(seg, z0 + 1);
    const tx = fx - x0, tz = fz - z0;
    const H = this.heights, w = seg + 1;
    const h00 = H[z0 * w + x0], h10 = H[z0 * w + x1];
    const h01 = H[z1 * w + x0], h11 = H[z1 * w + x1];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h00, h10, tx), THREE.MathUtils.lerp(h01, h11, tx), tz);
  }

  _elev(nx, nz) {
    // base rolling hills + a couple of ridges, flattened toward the two base corners.
    const n = this.noise(nx * 1.4 + 5, nz * 1.4 + 5);
    const ridge = Math.abs(this.noise2(nx * 2.2, nz * 2.2));
    let h = n * 7.0 + (0.5 - ridge) * 5.0;
    return h;
  }

  _build() {
    const seg = this.seg, s = this.size, w = seg + 1;
    const geo = new THREE.PlaneGeometry(s, s, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const H = new Float32Array(w * w);
    const splat = new Float32Array(pos.count * 3);

    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const idx = j * w + i;
        const nx = i / seg, nz = j / seg;
        // flatten near the four playable corners so bases sit on level ground
        const cornerFlat = this._cornerFlatten(nx, nz);
        let h = this._elev(nx, nz) * (1 - cornerFlat) ;
        H[idx] = h;
        pos.setY(idx, h);
      }
    }
    this.heights = H;

    // splat weights from height + slope
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const idx = j * w + i;
        const hL = H[j * w + Math.max(0, i - 1)], hR = H[j * w + Math.min(seg, i + 1)];
        const hD = H[Math.max(0, j - 1) * w + i], hU = H[Math.min(seg, j + 1) * w + i];
        const slope = Math.hypot(hR - hL, hU - hD) * (seg / s) * 0.5;
        const h = H[idx];
        let grass = THREE.MathUtils.clamp(1.0 - slope * 2.2, 0, 1);
        let rock = THREE.MathUtils.clamp((slope - 0.35) * 2.5 + (h - 5.0) * 0.18, 0, 1);
        let dirt = THREE.MathUtils.clamp(0.5 - Math.abs(h) * 0.15, 0, 1) * (1 - rock);
        grass *= (1 - rock);
        const sum = grass + dirt + rock + 1e-5;
        splat[idx * 3] = grass / sum;
        splat[idx * 3 + 1] = dirt / sum;
        splat[idx * 3 + 2] = rock / sum;
      }
    }
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 3));
    geo.computeVertexNormals();

    const g = makeGrass(), d = makeDirt(), r = makeRock();
    const rep = 36;
    [g, d, r].forEach(m => { m.map.repeat.set(rep, rep); m.normal.repeat.set(rep, rep); });

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.grassMap = { value: g.map };
      shader.uniforms.dirtMap = { value: d.map };
      shader.uniforms.rockMap = { value: r.map };
      shader.uniforms.grassN = { value: g.normal };
      shader.uniforms.dirtN = { value: d.normal };
      shader.uniforms.rockN = { value: r.normal };
      shader.uniforms.uRepeat = { value: rep };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aSplat;\nvarying vec3 vSplat;\nvarying vec2 vTUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat;\nvTUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D grassMap; uniform sampler2D dirtMap; uniform sampler2D rockMap;
          uniform sampler2D grassN; uniform sampler2D dirtN; uniform sampler2D rockN;
          uniform float uRepeat; varying vec3 vSplat; varying vec2 vTUv;`)
        .replace('#include <map_fragment>', `
          vec2 tuv = vTUv * uRepeat;
          vec3 cg = texture2D(grassMap, tuv).rgb;
          vec3 cd = texture2D(dirtMap, tuv).rgb;
          vec3 cr = texture2D(rockMap, tuv).rgb;
          vec3 blended = cg * vSplat.x + cd * vSplat.y + cr * vSplat.z;
          diffuseColor.rgb *= blended;
        `)
        .replace('#include <normal_fragment_maps>', `
          vec3 ng = texture2D(grassN, vTUv * uRepeat).xyz * 2.0 - 1.0;
          vec3 nd = texture2D(dirtN, vTUv * uRepeat).xyz * 2.0 - 1.0;
          vec3 nr = texture2D(rockN, vTUv * uRepeat).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(ng * vSplat.x + nd * vSplat.y + nr * vSplat.z);
          normal = normalize(normal + mapN * vec3(0.8, 0.8, 1.0) - vec3(0.0,0.0,0.0));
        `);
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  _cornerFlatten(nx, nz) {
    // returns 0..1, 1 = fully flat. Flatten the two opposite base corners.
    const d1 = Math.hypot(nx - 0.16, nz - 0.16);     // player
    const d2 = Math.hypot(nx - 0.84, nz - 0.84);     // enemy
    const r = 0.16;
    const f1 = THREE.MathUtils.clamp(1 - d1 / r, 0, 1);
    const f2 = THREE.MathUtils.clamp(1 - d2 / r, 0, 1);
    return Math.max(f1, f2) * 0.92;
  }
}
