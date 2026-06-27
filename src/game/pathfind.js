import * as THREE from 'three';
import { MAP } from '../config.js';

// Uniform grid A* with static obstacle marking.
export class Grid {
  constructor() {
    this.n = MAP.cells;
    this.size = MAP.size;
    this.cell = this.size / this.n;
    this.blocked = new Uint8Array(this.n * this.n);
    this.cost = new Uint8Array(this.n * this.n); // soft cost (e.g. near obstacles)
  }

  worldToCell(x, z) {
    const cx = Math.floor((x + this.size / 2) / this.cell);
    const cz = Math.floor((z + this.size / 2) / this.cell);
    return [THREE.MathUtils.clamp(cx, 0, this.n - 1), THREE.MathUtils.clamp(cz, 0, this.n - 1)];
  }
  cellToWorld(cx, cz) {
    return [(cx + 0.5) * this.cell - this.size / 2, (cz + 0.5) * this.cell - this.size / 2];
  }

  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n; }
  idx(cx, cz) { return cz * this.n + cx; }

  setBlockedCircle(x, z, radius, val = 1) {
    const [c0x, c0z] = this.worldToCell(x - radius, z - radius);
    const [c1x, c1z] = this.worldToCell(x + radius, z + radius);
    const r2 = radius * radius;
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.inBounds(cx, cz)) continue;
        const [wx, wz] = this.cellToWorld(cx, cz);
        if ((wx - x) ** 2 + (wz - z) ** 2 <= r2) this.blocked[this.idx(cx, cz)] = val;
      }
  }

  isBlocked(cx, cz) { return !this.inBounds(cx, cz) || this.blocked[this.idx(cx, cz)] === 1; }

  // A* from world a -> world b. Returns array of THREE.Vector3 waypoints (smoothed), or null.
  findPath(ax, az, bx, bz) {
    const [sx, sz] = this.worldToCell(ax, az);
    let [tx, tz] = this.worldToCell(bx, bz);
    if (this.isBlocked(tx, tz)) {
      const alt = this._nearestOpen(tx, tz);
      if (!alt) return null;
      [tx, tz] = alt;
    }
    const n = this.n;
    const start = this.idx(sx, sz), goal = this.idx(tx, tz);
    if (start === goal) return [new THREE.Vector3(bx, 0, bz)];

    const open = new MinHeap();
    const came = new Int32Array(n * n).fill(-1);
    const g = new Float32Array(n * n).fill(Infinity);
    g[start] = 0;
    const h = (cx, cz) => Math.hypot(cx - tx, cz - tz);
    open.push(start, h(sx, sz));
    const seen = new Uint8Array(n * n);
    let found = false, guard = 0;
    const maxNodes = n * n;

    while (open.size && guard++ < maxNodes) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (seen[cur]) continue;
      seen[cur] = 1;
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx, nz = cz + dz;
        if (this.isBlocked(nx, nz)) continue;
        // prevent diagonal corner cutting
        if (dx !== 0 && dz !== 0 && (this.isBlocked(cx + dx, cz) || this.isBlocked(cx, cz + dz))) continue;
        const ni = this.idx(nx, nz);
        const step = (dx !== 0 && dz !== 0) ? 1.4142 : 1.0;
        const soft = this.cost[ni] * 0.4;
        const ng = g[cur] + step + soft;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; open.push(ni, ng + h(nx, nz)); }
      }
    }
    if (!found) return null;

    // reconstruct
    const cells = [];
    let c = goal;
    while (c !== -1) { cells.push(c); c = came[c]; }
    cells.reverse();
    // smooth via line-of-sight skipping
    const pts = cells.map(ci => { const cx = ci % n, cz = (ci / n) | 0; const [wx, wz] = this.cellToWorld(cx, cz); return [wx, wz]; });
    const smooth = this._stringPull(pts);
    const out = smooth.map(([x, z]) => new THREE.Vector3(x, 0, z));
    out[out.length - 1].set(bx, 0, bz);
    return out;
  }

  _stringPull(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let anchor = 0;
    for (let i = 2; i < pts.length; i++) {
      if (!this._lineClear(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  _lineClear(a, b) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (this.cell * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const [cx, cz] = this.worldToCell(x, z);
      if (this.isBlocked(cx, cz)) return false;
    }
    return true;
  }

  _nearestOpen(tx, tz) {
    for (let r = 1; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const nx = tx + dx, nz = tz + dz;
        if (!this.isBlocked(nx, nz)) return [nx, nz];
      }
    }
    return null;
  }
}

// Binary min-heap keyed by priority.
class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    this.items.push(item); this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) { const par = (i - 1) >> 1; if (this.prio[par] <= this.prio[i]) break; this._swap(i, par); i = par; }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.length - 1;
    this._swap(0, last); this.items.pop(); this.prio.pop();
    let i = 0; const n = this.items.length;
    while (true) {
      let l = 2 * i + 1, r = 2 * i + 2, s = i;
      if (l < n && this.prio[l] < this.prio[s]) s = l;
      if (r < n && this.prio[r] < this.prio[s]) s = r;
      if (s === i) break; this._swap(i, s); i = s;
    }
    return top;
  }
  _swap(a, b) { [this.items[a], this.items[b]] = [this.items[b], this.items[a]]; [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]]; }
}
