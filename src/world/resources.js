import * as THREE from 'three';
import { MAP, NODE } from '../config.js';
import { assets } from '../engine/assets.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

class ResNode {
  constructor(type, kind, x, z, y) {
    this.type = type; this.kind = kind;
    this.pos = new THREE.Vector3(x, y, z);
    this.amount = NODE[kind].amount; this.maxAmount = this.amount;
    this.alive = true; this.scale = 1; this.baseScale = 1;
    this._mesh = null; this.instId = -1;
  }
}

// Variant pools: each entry is an InstancedMesh built from a baked KayKit model.
export class ResourceField {
  constructor(terrain, rng) {
    this.terrain = terrain;
    this.rng = rng;
    this.nodes = [];
    this.group = new THREE.Group();
    this.group.name = 'resources';
    this.variants = [];     // { mesh, capacity, used }
    this._byType = { wood: [], food: [], gold: [] };

    this._computeStarters();
    this._gatherPositions();
    this._buildVariants();
    this._placeNodes();
    this._scatterDecor();
  }

  // ---- positions -----------------------------------------------------------
  _computeStarters() {
    const s = MAP.size;
    const toWorld = (nx, nz) => [(nx - 0.5) * s, (nz - 0.5) * s];
    const bases = [toWorld(0.16, 0.16), toWorld(0.84, 0.84)];
    this.starters = { wood: [], gold: [], food: [] };
    for (const [bx, bz] of bases) {
      const sign = bx < 0 ? 1 : -1;
      const blob = (cx, cz, n, rad, out) => { for (let k = 0; k < n; k++) { const a = this.rng() * 6.283, r = Math.sqrt(this.rng()) * rad; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } };
      blob(bx + sign * 17, bz + sign * 5, 9, 5, this.starters.wood);
      blob(bx + sign * 5, bz + sign * 17, 8, 4.5, this.starters.wood);
      blob(bx + sign * 16, bz + sign * 16, 4, 2.4, this.starters.gold);
      blob(bx - sign * 2, bz + sign * 15, 6, 3.0, this.starters.food);
    }
  }

  _clusters(count, cmin, cmax, radius, out) {
    const s = MAP.size, half = s / 2 - 6;
    let placed = 0, guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const cx = (this.rng() * 2 - 1) * half, cz = (this.rng() * 2 - 1) * half;
      const nx = (cx + s / 2) / s, nz = (cz + s / 2) / s;
      if (Math.hypot(nx - 0.16, nz - 0.16) < 0.14 || Math.hypot(nx - 0.84, nz - 0.84) < 0.14) continue;
      const n = cmin + ((this.rng() * (cmax - cmin)) | 0);
      for (let k = 0; k < n; k++) {
        const a = this.rng() * 6.283, r = this.rng() * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        out.push([x, z]); placed++;
      }
    }
  }

  _gatherPositions() {
    this.pos = { wood: [...this.starters.wood], food: [...this.starters.food], gold: [...this.starters.gold] };
    this._clusters(7, 14, 26, 11, this.pos.wood);
    this._clusters(5, 4, 6, 3, this.pos.food);
    this._clusters(5, 4, 7, 4, this.pos.gold);
  }

  // ---- variants (instanced meshes) ----------------------------------------
  _makeVariant(name, targetH, count, opts = {}) {
    const baked = assets.bakedModel(name, targetH, opts);
    if (!baked || count <= 0) return null;
    const inst = new THREE.InstancedMesh(baked.geometry, baked.material, count);
    inst.castShadow = true; inst.receiveShadow = true;
    inst.count = 0;             // grow as we add
    inst.frustumCulled = false;
    this.group.add(inst);
    const v = { mesh: inst, capacity: count, used: 0, size: baked.size };
    this.variants.push(v);
    return v;
  }

  _buildVariants() {
    const W = this.pos.wood.length, F = this.pos.food.length, G = this.pos.gold.length;
    // wood: clean individual trees (single-mesh models) at varied heights
    this.woodVariants = [
      this._makeVariant('tree_single_A', 3.8, Math.ceil(W * 0.6) + 2),
      this._makeVariant('tree_single_B', 4.1, Math.ceil(W * 0.6) + 2),
    ].filter(Boolean);
    this.foodVariants = [
      this._makeVariant('trees_A_small', 2.0, Math.ceil(F * 0.7) + 2),
      this._makeVariant('trees_B_small', 2.0, Math.ceil(F * 0.7) + 2),
    ].filter(Boolean);
    this.goldVariants = [
      this._makeVariant('resource_stone', 1.7, G + 2, { src: 'prop', tint: 0xe8b94a }),
    ].filter(Boolean);
    if (!this.woodVariants.length || !this.goldVariants.length) {
      console.warn('resource variants missing', { wood: this.woodVariants.length, food: this.foodVariants.length, gold: this.goldVariants.length });
    }
  }

  _addInstance(variant, x, y, z, scale, rotY) {
    const id = variant.used++;
    if (id >= variant.capacity) return -1;
    _p.set(x, y, z); _q.setFromAxisAngle(_Y, rotY); _s.setScalar(scale);
    _m.compose(_p, _q, _s); variant.mesh.setMatrixAt(id, _m);
    variant.mesh.count = variant.used;
    variant.mesh.instanceMatrix.needsUpdate = true;
    return id;
  }

  _placeNodes() {
    const place = (list, type, kind, variants, scaleRange) => {
      if (!variants || !variants.length) return;
      let vi = 0;
      for (const [x, z] of list) {
        const y = this.terrain.heightAt(x, z);
        if (y < -0.5) continue;        // skip water/low
        const variant = variants[vi % variants.length]; vi++;
        const sc = scaleRange[0] + this.rng() * (scaleRange[1] - scaleRange[0]);
        const id = this._addInstance(variant, x, y, z, sc, this.rng() * 6.283);
        if (id < 0) continue;
        const node = new ResNode(type, kind, x, z, y);
        node._mesh = variant.mesh; node.instId = id; node._variant = variant;
        node.baseScale = sc; node.scale = sc;
        this.nodes.push(node);
        this._byType[type].push(node);
      }
    };
    place(this.pos.wood, 'wood', 'tree', this.woodVariants, [0.85, 1.25]);
    place(this.pos.food, 'food', 'bush', this.foodVariants, [0.85, 1.2]);
    place(this.pos.gold, 'gold', 'gold', this.goldVariants, [0.9, 1.3]);
  }

  // Decorative non-harvestable rocks + mountains for visual richness.
  _scatterDecor() {
    const rockNames = ['rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E'];
    const rockVariants = rockNames.map(n => this._makeVariant(n, 1.0, 14)).filter(Boolean);
    const s = MAP.size, half = s / 2 - 8;
    for (let i = 0; i < 60 && rockVariants.length; i++) {
      const x = (this.rng() * 2 - 1) * half, z = (this.rng() * 2 - 1) * half;
      const nx = (x + s / 2) / s, nz = (z + s / 2) / s;
      if (Math.hypot(nx - 0.16, nz - 0.16) < 0.12 || Math.hypot(nx - 0.84, nz - 0.84) < 0.12) continue;
      const y = this.terrain.heightAt(x, z); if (y < -0.5) continue;
      const v = rockVariants[(this.rng() * rockVariants.length) | 0];
      this._addInstance(v, x, y, z, 0.6 + this.rng() * 1.4, this.rng() * 6.283);
    }
    // a few mountains on the high ground
    const mtn = ['mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass'].map(n => this._makeVariant(n, 9, 10)).filter(Boolean);
    for (let i = 0; i < 16 && mtn.length; i++) {
      const x = (this.rng() * 2 - 1) * half, z = (this.rng() * 2 - 1) * half;
      const y = this.terrain.heightAt(x, z); if (y < 2.5) continue;     // only on hills
      const v = mtn[(this.rng() * mtn.length) | 0];
      this._addInstance(v, x, y - 0.5, z, 0.8 + this.rng() * 0.8, this.rng() * 6.283);
    }
  }

  // ---- API used by the game ------------------------------------------------
  pickMeshes() {
    const out = [];
    for (const v of [...this.woodVariants, ...this.foodVariants, ...this.goldVariants]) out.push(v.mesh);
    return out;
  }

  nodeFromIntersect(mesh, instanceId) {
    return this.nodes.find(n => n._mesh === mesh && n.instId === instanceId && n.alive);
  }

  nearestNode(pos, type, maxDist = Infinity) {
    let best = null, bd = maxDist * maxDist;
    const pool = type ? this._byType[type] : this.nodes;
    for (const n of pool) {
      if (!n.alive) continue;
      const d = n.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  harvest(node, amount) {
    const got = Math.min(amount, node.amount);
    node.amount -= got;
    const frac = node.amount / node.maxAmount;
    if (node.kind === 'tree' || node.kind === 'bush') {
      const sc = node.baseScale * (0.45 + frac * 0.55);
      node.scale = sc;
      this._setScale(node, sc);
    }
    if (node.amount <= 0) this._kill(node);
    return got;
  }

  _setScale(node, sc) {
    node._mesh.getMatrixAt(node.instId, _m); _m.decompose(_p, _q, _s);
    _s.setScalar(sc); _m.compose(_p, _q, _s);
    node._mesh.setMatrixAt(node.instId, _m); node._mesh.instanceMatrix.needsUpdate = true;
  }

  _kill(node) {
    node.alive = false;
    node._mesh.getMatrixAt(node.instId, _m); _m.decompose(_p, _q, _s);
    _s.setScalar(0.0001); _m.compose(_p, _q, _s);
    node._mesh.setMatrixAt(node.instId, _m); node._mesh.instanceMatrix.needsUpdate = true;
  }
}
