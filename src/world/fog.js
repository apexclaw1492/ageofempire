import * as THREE from 'three';
import { MAP } from '../config.js';

// Three-state fog: 0 unexplored, 1 explored (memory), 2 currently visible.
export class FogOfWar {
  constructor(terrain) {
    this.n = 96;
    this.size = MAP.size;
    this.cell = this.size / this.n;
    this.explored = new Uint8Array(this.n * this.n);   // 0/1
    this.visible = new Uint8Array(this.n * this.n);     // 0/1 this frame

    this.data = new Uint8Array(this.n * this.n * 4);
    this.tex = new THREE.DataTexture(this.data, this.n, this.n, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;

    // Conform the shroud to the terrain surface so the revealed hole sits
    // exactly over the ground (no parallax) and hills don't poke through.
    const segs = 96;
    const geo = new THREE.PlaneGeometry(this.size, this.size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    if (terrain) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, terrain.heightAt(x, z) + 1.4);
      }
      pos.needsUpdate = true;
    }
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 1.0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this._fill();
  }

  _fill() {
    for (let i = 0; i < this.n * this.n; i++) {
      this.data[i * 4] = 8; this.data[i * 4 + 1] = 11; this.data[i * 4 + 2] = 16;
      this.data[i * 4 + 3] = 210;
    }
    this.tex.needsUpdate = true;
  }

  cellOf(x, z) {
    const cx = Math.floor((x + this.size / 2) / this.cell);
    const cz = Math.floor((z + this.size / 2) / this.cell);
    return [cx, cz];
  }

  beginFrame() { this.visible.fill(0); }

  reveal(x, z, radius) {
    const r = radius / this.cell;
    const [ccx, ccz] = this.cellOf(x, z);
    const ri = Math.ceil(r);
    for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      const cx = ccx + dx, cz = ccz + dz;
      if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) continue;
      const i = cz * this.n + cx;
      this.visible[i] = 1; this.explored[i] = 1;
    }
  }

  endFrame() {
    for (let i = 0; i < this.n * this.n; i++) {
      let a;
      if (this.visible[i]) a = 0;
      else if (this.explored[i]) a = 96;
      else a = 198;
      // smooth toward target alpha for a soft reveal
      const cur = this.data[i * 4 + 3];
      this.data[i * 4 + 3] = cur + (a - cur) * 0.25;
    }
    this.tex.needsUpdate = true;
  }

  isVisibleWorld(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return false;
    return this.visible[cz * this.n + cx] === 1;
  }
  isExploredWorld(x, z) {
    const [cx, cz] = this.cellOf(x, z);
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return false;
    return this.explored[cz * this.n + cx] === 1;
  }
}
