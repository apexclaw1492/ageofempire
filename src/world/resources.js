import * as THREE from 'three';
import { MAP, NODE } from '../config.js';
import { makeBark } from '../engine/textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// One harvestable node.
class ResNode {
  constructor(type, x, z, y, instId, kind) {
    this.type = type;        // wood | gold | food
    this.kind = kind;        // tree | gold | bush
    this.pos = new THREE.Vector3(x, y, z);
    this.amount = NODE[kind].amount;
    this.maxAmount = this.amount;
    this.instId = instId;
    this.alive = true;
    this.scale = 1;
  }
}

export class ResourceField {
  constructor(terrain, rng) {
    this.terrain = terrain;
    this.rng = rng;
    this.nodes = [];
    this.group = new THREE.Group();
    this.group.name = 'resources';
    this._computeStarters();
    this._buildTrees();
    this._buildGold();
    this._buildBushes();
  }

  // Guaranteed resource patches next to each base so the early economy
  // has wood/food/gold within easy reach (classic RTS starting layout).
  _computeStarters() {
    const s = MAP.size;
    const toWorld = (nx, nz) => [(nx - 0.5) * s, (nz - 0.5) * s];
    const bases = [toWorld(0.16, 0.16), toWorld(0.84, 0.84)];
    this.starters = { tree: [], gold: [], bush: [] };
    for (const [bx, bz] of bases) {
      const sign = bx < 0 ? 1 : -1;        // push patches toward map center
      const blob = (cx, cz, n, rad, out) => {
        for (let k = 0; k < n; k++) {
          const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * rad;
          out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
        }
      };
      // wood line, a gold cluster and berries arranged around the TC
      blob(bx + sign * 16, bz + sign * 5, 10, 5, this.starters.tree);
      blob(bx + sign * 5, bz + sign * 16, 8, 4.5, this.starters.tree);
      blob(bx + sign * 15, bz + sign * 15, 4, 2.4, this.starters.gold);
      blob(bx - sign * 2, bz + sign * 14, 5, 2.6, this.starters.bush);
    }
  }

  _placeClusters(count, clusterMin, clusterMax, radius, avoidCorners, cb) {
    const s = MAP.size, half = s / 2 - 6;
    let placed = 0, guard = 0;
    while (placed < count && guard < count * 40) {
      guard++;
      const cx = (this.rng() * 2 - 1) * half;
      const cz = (this.rng() * 2 - 1) * half;
      // keep clear of both bases
      const nx = (cx + s / 2) / s, nz = (cz + s / 2) / s;
      if (avoidCorners && (Math.hypot(nx - 0.16, nz - 0.16) < 0.14 || Math.hypot(nx - 0.84, nz - 0.84) < 0.14)) continue;
      const n = clusterMin + ((this.rng() * (clusterMax - clusterMin)) | 0);
      for (let k = 0; k < n; k++) {
        const a = this.rng() * Math.PI * 2, r = this.rng() * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        cb(x, z);
        placed++;
      }
    }
  }

  _buildTrees() {
    const bark = makeBark();
    const positions = [...this.starters.tree];
    this._placeClusters(7, 14, 26, 11, true, (x, z) => positions.push([x, z]));
    const N = positions.length;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6);
    trunkGeo.translate(0, 1.1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, roughness: 0.9 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);

    // layered conifer canopy (3 stacked cones) merged via a single cone-ish geo
    const canopyGeo = new THREE.ConeGeometry(1.7, 4.2, 8);
    canopyGeo.translate(0, 4.0, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f5d33, roughness: 1.0, flatShading: true });
    const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, N);
    trunks.castShadow = canopy.castShadow = true;
    trunks.receiveShadow = canopy.receiveShadow = true;

    this.treeMesh = canopy; // pick target
    this.trunkMesh = trunks;
    for (let i = 0; i < N; i++) {
      const [x, z] = positions[i];
      const y = this.terrain.heightAt(x, z);
      const sc = 0.8 + this.rng() * 0.6;
      const rot = this.rng() * Math.PI * 2;
      const node = new ResNode('wood', x, z, y, i, 'tree');
      this.nodes.push(node);
      node._mesh = canopy; node._trunk = trunks;
      _p.set(x, y, z); _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      _s.set(sc, sc * (0.85 + this.rng() * 0.3), sc);
      _m.compose(_p, _q, _s); trunks.setMatrixAt(i, _m); canopy.setMatrixAt(i, _m);
    }
    trunks.instanceMatrix.needsUpdate = canopy.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, canopy);
  }

  _buildGold() {
    const positions = [...this.starters.gold];
    this._placeClusters(5, 4, 7, 4, true, (x, z) => positions.push([x, z]));
    const N = positions.length;
    const geo = new THREE.DodecahedronGeometry(0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.6, metalness: 0.2, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.castShadow = mesh.receiveShadow = true;
    // emissive gold veins via a second smaller instanced mesh
    const veinGeo = new THREE.IcosahedronGeometry(0.32, 0);
    const veinMat = new THREE.MeshStandardMaterial({ color: 0xf2c84b, emissive: 0x6b5210, roughness: 0.4, metalness: 0.6, flatShading: true });
    const veins = new THREE.InstancedMesh(veinGeo, veinMat, N);
    this.goldMesh = mesh; this.goldVein = veins;
    this._goldBase = N; // index offset
    for (let i = 0; i < N; i++) {
      const [x, z] = positions[i];
      const y = this.terrain.heightAt(x, z);
      const sc = 0.9 + this.rng() * 0.8;
      const node = new ResNode('gold', x, z, y + sc * 0.5, this.nodes.length, 'gold');
      node.instId = i; node._mesh = mesh; node._vein = veins;
      this.nodes.push(node);
      _p.set(x, y + sc * 0.4, z); _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * 7);
      _s.setScalar(sc); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); veins.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = veins.instanceMatrix.needsUpdate = true;
    this.group.add(mesh, veins);
  }

  _buildBushes() {
    const positions = [...this.starters.bush];
    this._placeClusters(5, 4, 6, 3, true, (x, z) => positions.push([x, z]));
    const N = positions.length;
    const geo = new THREE.IcosahedronGeometry(0.8, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1.0, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.castShadow = mesh.receiveShadow = true;
    const berryGeo = new THREE.SphereGeometry(0.12, 6, 6);
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xc23b6a, roughness: 0.6 });
    const berries = new THREE.InstancedMesh(berryGeo, berryMat, N * 5);
    let bi = 0;
    this.bushMesh = mesh;
    for (let i = 0; i < N; i++) {
      const [x, z] = positions[i];
      const y = this.terrain.heightAt(x, z);
      const sc = 0.85 + this.rng() * 0.5;
      const node = new ResNode('food', x, z, y + 0.6, this.nodes.length, 'bush');
      node.instId = i; node._mesh = mesh;
      this.nodes.push(node);
      _p.set(x, y + sc * 0.55, z); _q.identity(); _s.setScalar(sc);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
      for (let b = 0; b < 5; b++) {
        const a = this.rng() * 7, rr = 0.5 * sc;
        _p.set(x + Math.cos(a) * rr, y + 0.5 + this.rng() * 0.5, z + Math.sin(a) * rr);
        _s.setScalar(1); _m.compose(_p, _q, _s); berries.setMatrixAt(bi++, _m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    berries.instanceMatrix.needsUpdate = true;
    this.group.add(mesh, berries);
  }

  // Pickable meshes for raycasting.
  pickMeshes() { return [this.treeMesh, this.goldMesh, this.bushMesh]; }

  nodeFromIntersect(mesh, instanceId) {
    return this.nodes.find(n => n._mesh === mesh && n.instId === instanceId && n.alive);
  }

  nearestNode(pos, type, maxDist = Infinity) {
    let best = null, bd = maxDist * maxDist;
    for (const n of this.nodes) {
      if (!n.alive || (type && n.type !== type)) continue;
      const d = n.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Deplete a node, shrinking its instance; remove when empty.
  harvest(node, amount) {
    const got = Math.min(amount, node.amount);
    node.amount -= got;
    const frac = node.amount / node.maxAmount;
    if (node.kind === 'tree') {
      // shrink canopy as it's chopped
      node._mesh.getMatrixAt(node.instId, _m); _m.decompose(_p, _q, _s);
      const sc = 0.25 + frac * 0.75;
      _s.setScalar(_s.x * (sc / (node.scale || 1)));
      node.scale = sc;
    }
    if (node.amount <= 0) this._kill(node);
    return got;
  }

  _kill(node) {
    node.alive = false;
    const mesh = node._mesh;
    mesh.getMatrixAt(node.instId, _m); _m.decompose(_p, _q, _s);
    _s.setScalar(0.0001); _m.compose(_p, _q, _s);
    mesh.setMatrixAt(node.instId, _m); mesh.instanceMatrix.needsUpdate = true;
    if (node._vein) { node._vein.setMatrixAt(node.instId, _m); node._vein.instanceMatrix.needsUpdate = true; }
    if (node._trunk) { node._trunk.setMatrixAt(node.instId, _m); node._trunk.instanceMatrix.needsUpdate = true; }
  }
}
