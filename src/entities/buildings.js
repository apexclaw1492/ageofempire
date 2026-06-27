import * as THREE from 'three';
import { BUILDING_DEFS, TEAM_COLOR } from '../config.js';
import { assets } from '../engine/assets.js';

let _bid = 1;
const _box = new THREE.Box3();
const _sz = new THREE.Vector3();

// Scale a cloned model so its larger horizontal half-extent ≈ targetRadius, resting on y=0.
function normalize(obj, targetRadius) {
  _box.setFromObject(obj); _box.getSize(_sz);
  const horiz = Math.max(_sz.x, _sz.z) / 2 || 1;
  const s = targetRadius / horiz;
  obj.scale.multiplyScalar(s);
  _box.setFromObject(obj);
  obj.position.y -= _box.min.y;
  return s;
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
    this.dead = false; this.selected = false;
    this.rallyPoint = null; this.queue = []; this.trainTimer = 0; this.attackTimer = 0;
    this._stage = -1;

    const y = terrain.heightAt(x, z);
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = ((x * 13 + z * 7) % 6.28);
    this.mesh.userData.building = this;

    // final model (hidden until complete), normalized to footprint
    this.finalModel = assets.makeBuilding(key, team);
    this._radius = this.footprint * 1.15;
    normalize(this.finalModel, this._radius);
    this.mesh.add(this.finalModel);

    // construction stand-ins
    this.stageModels = ['building_stage_A', 'building_stage_B', 'building_stage_C'].map(n => {
      const m = assets.makeNeutral(n); normalize(m, this._radius * 0.95); m.visible = false; this.mesh.add(m); return m;
    });
    this.scaffold = assets.makeNeutral('building_scaffolding');
    normalize(this.scaffold, this._radius * 1.05); this.mesh.add(this.scaffold);

    if (complete) this._showComplete(); else this._applyProgress();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.footprint, this.footprint + 0.22, 36),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; this.mesh.add(ring); this.ring = ring;

    this.mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.building = this; } });
  }

  get pos() { return this.mesh.position; }

  _applyProgress() {
    const p = this.buildProgress;
    const stage = p >= 1 ? 3 : p > 0.66 ? 2 : p > 0.33 ? 1 : 0;
    if (stage !== this._stage) {
      this._stage = stage;
      this.stageModels.forEach((m, i) => m.visible = (i === stage && stage < 3));
      this.finalModel.visible = stage >= 3;
    }
    this.scaffold.visible = p < 1;
    // gentle rise as it nears completion
    const rise = -1.2 * (1 - p);
    this.finalModel.position.y = Math.max(rise, -1.2) + this._restY();
  }
  _restY() { return 0; }

  _showComplete() {
    this.complete = true; this.buildProgress = 1; this._stage = 3;
    this.stageModels.forEach(m => m.visible = false);
    this.scaffold.visible = false;
    this.finalModel.visible = true; this.finalModel.position.y = 0;
  }

  addBuild(dt, rate) {
    if (this.complete) return false;
    this.buildProgress = Math.min(1, this.buildProgress + rate * dt);
    this.hp = Math.max(this.hp, this.maxHp * (0.05 + 0.95 * this.buildProgress));
    if (this.buildProgress >= 1) { this._showComplete(); return true; }
    this._applyProgress();
    return false;
  }

  setSelected(v) { this.selected = v; this.ring.material.opacity = v ? 0.95 : 0; }

  damage(d) {
    this.hp -= d;
    if (this.hp <= 0 && !this.dead) { this.dead = true; return true; }
    return false;
  }

  // swap to rubble model on destruction
  showDestroyed() {
    this.finalModel.visible = false;
    this.stageModels.forEach(m => m.visible = false);
    this.scaffold.visible = false;
    if (!this._rubble) {
      this._rubble = assets.makeNeutral('building_destroyed');
      normalize(this._rubble, this._radius); this.mesh.add(this._rubble);
    }
  }
}

export function makeGhost(key, team, terrain) {
  const g = new THREE.Group();
  const model = assets.makeBuilding(key, team);
  const fp = BUILDING_DEFS[key].footprint;
  normalize(model, fp * 1.15);
  model.traverse(o => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = false;
      o.castShadow = false;
    }
  });
  g.add(model);
  const ring = new THREE.Mesh(new THREE.RingGeometry(fp, fp + 0.25, 36),
    new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.6, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
  g.userData.ring = ring; g.userData.model = model;
  return g;
}
