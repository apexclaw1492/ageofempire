import * as THREE from 'three';
import { BUILDING_DEFS, TEAM_COLOR } from '../config.js';
import { makeRoof, makePlaster, makeWood } from '../engine/textures.js';

let _bid = 1;

// Shared materials (built once).
let MATS = null;
function materials() {
  if (MATS) return MATS;
  const plaster = makePlaster();
  const wood = makeWood();
  const roofR = makeRoof(128, '#8a3a2a');
  const roofBlue = makeRoof(128, '#3a4a7a');
  MATS = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster.map, normalMap: plaster.normal, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ map: roofR.map, normalMap: roofR.normal, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8f8a82, roughness: 0.95, flatShading: true }),
    darkwood: new THREE.MeshStandardMaterial({ color: 0x4a331f, roughness: 0.9 }),
    thatch: new THREE.MeshStandardMaterial({ color: 0xb89a4e, roughness: 1.0, flatShading: true }),
  };
  return MATS;
}

function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = m.receiveShadow = true; return m; }
function roofPrism(w, h, d, mat) {
  const geo = new THREE.CylinderGeometry(0.0001, w * 0.72, h, 4, 1);
  geo.rotateY(Math.PI / 4);
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.scale.z = d / w; return m;
}

function buildVisual(key, teamColor) {
  const M = materials();
  const g = new THREE.Group();
  const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.5, metalness: 0.1 });

  switch (key) {
    case 'towncenter': {
      const base = box(5.5, 1.4, 5.5, M.stone); base.position.y = 0.7; g.add(base);
      const hall = box(4.2, 2.6, 4.2, M.plaster); hall.position.y = 2.6; g.add(hall);
      const roof = roofPrism(4.8, 2.4, 4.8, M.roof); roof.position.y = 5.0; g.add(roof);
      // four corner pillars
      for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
        const p = box(0.5, 4.2, 0.5, M.wood); p.position.set(x, 2.1, z); g.add(p);
        const flag = box(0.05, 0.6, 0.4, teamMat); flag.position.set(x, 4.6, z); g.add(flag);
      }
      const door = box(1.0, 1.6, 0.2, M.wood); door.position.set(0, 1.6, 2.11); g.add(door);
      break;
    }
    case 'house': {
      const body = box(2.4, 1.8, 2.0, M.plaster); body.position.y = 0.9; g.add(body);
      const roof = roofPrism(2.6, 1.4, 2.2, M.roof); roof.position.y = 2.5; g.add(roof);
      const door = box(0.6, 1.0, 0.15, M.wood); door.position.set(0, 0.5, 1.01); g.add(door);
      const beam1 = box(0.12, 1.8, 0.12, M.wood); beam1.position.set(-1.1, 0.9, 1.0); g.add(beam1);
      const beam2 = beam1.clone(); beam2.position.x = 1.1; g.add(beam2);
      break;
    }
    case 'lumbercamp':
    case 'mill':
    case 'miningcamp': {
      const body = box(2.6, 1.4, 2.6, M.wood); body.position.y = 0.7; g.add(body);
      const roof = roofPrism(2.8, 1.0, 2.8, M.thatch); roof.position.y = 1.9; g.add(roof);
      if (key === 'mill') {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 14), M.wood);
        wheel.position.set(1.5, 1.0, 0); g.add(wheel);
        for (let i = 0; i < 6; i++) { const sp = box(0.08, 1.7, 0.1, M.wood); sp.position.set(1.5, 1.0, 0); sp.rotation.x = i * Math.PI / 3; g.add(sp); }
      } else if (key === 'lumbercamp') {
        for (let i = 0; i < 3; i++) { const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.8), M.wood); log.rotation.z = Math.PI / 2; log.position.set(1.4, 0.2 + i * 0.36, -0.6 + (i % 2) * 0.2); g.add(log); }
      } else {
        for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), M.stone); r.position.set(1.3 + Math.random() * 0.3, 0.3, -0.6 + i * 0.4); g.add(r); }
      }
      break;
    }
    case 'barracks':
    case 'archery': {
      const body = box(3.6, 2.0, 3.0, M.plaster); body.position.y = 1.0; g.add(body);
      const roof = roofPrism(4.0, 1.4, 3.4, M.roof); roof.position.y = 2.7; g.add(roof);
      const door = box(1.2, 1.5, 0.2, M.darkwood || M.wood); door.position.set(0, 0.75, 1.51); g.add(door);
      const banner = box(0.05, 1.4, 0.7, teamMat); banner.position.set(-1.4, 2.4, 1.4); g.add(banner);
      if (key === 'barracks') { const wr = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 10), M.stone); wr.position.set(1.4, 1.4, 1.51); g.add(wr); }
      else { const targ = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16), teamMat); targ.rotation.x = Math.PI / 2; targ.position.set(1.4, 1.2, 1.55); g.add(targ); }
      break;
    }
    case 'tower': {
      const base = box(1.6, 4.0, 1.6, M.stone); base.position.y = 2.0; g.add(base);
      const top = box(2.0, 0.6, 2.0, M.stone); top.position.y = 4.2; g.add(top);
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8], [0, -0.9], [0, 0.9]]) {
        const cr = box(0.4, 0.5, 0.4, M.stone); cr.position.set(x, 4.6, z); g.add(cr);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 4), M.roof); roof.rotation.y = Math.PI / 4; roof.position.y = 5.2; g.add(roof);
      const flag = box(0.04, 0.5, 0.4, teamMat); flag.position.set(0, 5.9, 0); g.add(flag);
      break;
    }
    default: {
      const body = box(2, 2, 2, M.plaster); body.position.y = 1; g.add(body);
    }
  }
  return g;
}

export class Building {
  constructor(key, team, x, z, terrain, { complete = false } = {}) {
    this.id = _bid++;
    this.key = key;
    this.def = BUILDING_DEFS[key];
    this.team = team;
    this.terrain = terrain;
    this.hp = complete ? this.def.hp : Math.max(1, this.def.hp * 0.05);
    this.maxHp = this.def.hp;
    this.footprint = this.def.footprint;
    this.complete = complete;
    this.buildProgress = complete ? 1 : 0;
    this.dead = false;
    this.selected = false;
    this.rallyPoint = null;
    this.queue = [];          // training queue
    this.trainTimer = 0;
    this.attackTimer = 0;     // towers/TC
    this.populationCounted = false;

    const y = terrain.heightAt(x, z);
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);
    this.mesh.userData.building = this;

    this.visual = buildVisual(key, TEAM_COLOR[team]);
    this.mesh.add(this.visual);

    // construction scaffold
    this.scaffold = this._makeScaffold();
    this.mesh.add(this.scaffold);

    if (complete) { this._showComplete(); }
    else { this.visual.visible = true; this._applyProgress(); }

    // selection ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.footprint, this.footprint + 0.2, 32),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; this.mesh.add(ring); this.ring = ring;

    this.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.building = this; } });
  }

  get pos() { return this.mesh.position; }

  _makeScaffold() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
    const s = this.footprint;
    for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4), mat);
      pole.position.set(x * 0.8, 2, z * 0.8); g.add(pole);
    }
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(s * 1.7, 0.08, 0.08), mat);
      bar.position.set(0, 0.6 + i * 1.3, s * 0.8); g.add(bar);
    }
    return g;
  }

  _applyProgress() {
    // building rises out of the ground as it's constructed
    const p = this.buildProgress;
    this.visual.position.y = -3.2 * (1 - p);
    this.visual.traverse(o => { if (o.isMesh && o.material) { o.material.transparent = p < 1; } });
    this.scaffold.visible = p < 1;
    // clip with a simple opacity fade-in near completion handled by material; keep simple
  }

  _showComplete() {
    this.complete = true; this.buildProgress = 1;
    this.visual.position.y = 0;
    this.scaffold.visible = false;
    this.visual.traverse(o => { if (o.isMesh && o.material) { o.material.transparent = false; o.material.opacity = 1; } });
  }

  addBuild(dt, rate) {
    if (this.complete) return false;
    this.buildProgress = Math.min(1, this.buildProgress + rate * dt);
    this.hp = Math.max(this.hp, this.maxHp * (0.05 + 0.95 * this.buildProgress));
    if (this.buildProgress >= 1) { this._showComplete(); return true; }
    this._applyProgress();
    return false;
  }

  setSelected(v) { this.selected = v; this.ring.material.opacity = v ? 0.9 : 0; }

  damage(d) {
    this.hp -= d;
    if (this.hp <= 0 && !this.dead) { this.dead = true; return true; }
    return false;
  }
}

// Ghost/preview mesh for placement.
export function makeGhost(key, terrain) {
  const g = new THREE.Group();
  const v = buildVisual(key, 0x66ff99);
  v.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.45, depthWrite: false }); } });
  g.add(v);
  const fp = BUILDING_DEFS[key].footprint;
  const ring = new THREE.Mesh(new THREE.RingGeometry(fp, fp + 0.25, 32), new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.6, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  g.userData.ring = ring;
  return g;
}
