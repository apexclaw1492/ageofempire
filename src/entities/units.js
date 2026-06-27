import * as THREE from 'three';
import { UNIT_DEFS, TEAM_COLOR } from '../config.js';
import { assets } from '../engine/assets.js';

let _uid = 1;

// typeKey -> visual config (character model + which clips to use)
const VIS = {
  villager:  { model: 'Rogue',     walk: 'Walking_C', attack: '1H_Melee_Attack_Chop',          gather: '1H_Melee_Attack_Chop', scale: 0.92, faceTo: true },
  militia:   { model: 'Knight',    walk: 'Walking_C', attack: '1H_Melee_Attack_Slice_Diagonal', scale: 1.0 },
  manatarms: { model: 'Knight',    walk: 'Walking_C', attack: '1H_Melee_Attack_Chop',           scale: 1.05 },
  archer:    { model: 'Rogue',     walk: 'Walking_C', attack: '1H_Ranged_Shoot', idle2: '1H_Ranged_Aiming', scale: 0.98, ranged: true },
  knight:    { model: 'Barbarian', walk: 'Running_A', attack: '2H_Melee_Attack_Chop',           scale: 1.12 },
  monk:      { model: 'Mage',      walk: 'Walking_C', attack: 'Spellcast_Shoot',                scale: 1.0, ranged: true },
};
const MODEL_FACING = Math.PI;   // KayKit chars face -Z; flip so faceTo (atan2(dx,dz)) aims correctly

// Plays/cross-fades animation clips for one character.
class AnimController {
  constructor(object, mixerRoot) {
    this.mixer = new THREE.AnimationMixer(mixerRoot);
    this.actions = {};
    this.current = null;
    this.locked = 0;            // seconds remaining on a one-shot (attack/death) lock
  }
  _action(clipName) {
    if (!clipName) return null;
    if (this.actions[clipName]) return this.actions[clipName];
    const clip = assets.clip(clipName);
    if (!clip) return null;
    const a = this.mixer.clipAction(clip);
    this.actions[clipName] = a;
    return a;
  }
  play(clipName, { loop = true, fade = 0.18, timeScale = 1 } = {}) {
    const a = this._action(clipName);
    if (!a || a === this.current) { if (a) a.timeScale = timeScale; return; }
    a.enabled = true; a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop; a.timeScale = timeScale; a.reset();
    a.fadeIn(fade); a.play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }
  once(clipName, dur, timeScale = 1) {
    const a = this._action(clipName);
    if (!a) return;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.timeScale = timeScale; a.enabled = true;
    a.fadeIn(0.08); a.play();
    if (this.current && this.current !== a) this.current.fadeOut(0.12);
    this.current = a;
    this.locked = dur;
  }
  update(dt) { this.locked = Math.max(0, this.locked - dt); this.mixer.update(dt); }
}

export class Unit {
  constructor(typeKey, team, x, z, terrain) {
    this.id = _uid++;
    this.typeKey = typeKey;
    this.def = UNIT_DEFS[typeKey];
    this.kind = this.def.kind;
    this.team = team;
    this.terrain = terrain;
    this.hp = this.def.hp; this.maxHp = this.def.hp;
    this.speed = this.def.speed;
    this.state = 'idle';
    this.target = null; this.gatherNode = null; this.dropTarget = null; this.buildTarget = null;
    this.carry = { type: null, amount: 0 };
    this.path = null; this.pathIdx = 0; this.goal = null;
    this.attackTimer = 0; this.dead = false; this.deadTimer = 0; this.selected = false;
    this.vis = VIS[typeKey] || VIS.militia;
    this._moving = false; this._lastClip = null; this._deathPlayed = false;

    const built = assets.makeCharacter(this.vis.model);
    this.mesh = built.object;
    this.inner = built.inner;
    this.inner.rotation.y = MODEL_FACING;
    this.mesh.scale.multiplyScalar(this.vis.scale);
    this.anim = new AnimController(this.mesh, built.inner);
    this.anim.play('Idle');

    this.mesh.position.set(x, terrain.heightAt(x, z), z);
    this.mesh.userData.unit = this;

    // team-colored ground ring (always faintly visible = player color ID; bright when selected)
    const col = TEAM_COLOR[team];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.56, 28),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.33, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    this.mesh.add(ring); this.ring = ring;

    // tiny carry indicator (shown when hauling resources)
    this.carryMesh = null;
  }

  get pos() { return this.mesh.position; }

  setSelected(v) { this.selected = v; this.ring.material.opacity = v ? 0.95 : 0.33; this.ring.material.color.setHex(v ? 0xffe08a : TEAM_COLOR[this.team]); }

  faceTo(x, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-4) this._targetYaw = Math.atan2(dx, dz);
  }

  triggerSwing() {
    const clip = this.vis.attack;
    const dur = this.def.attackCooldown ? Math.min(this.def.attackCooldown * 0.9, 0.9) : 0.7;
    const ts = assets.clip(clip) ? (assets.clip(clip).duration / dur) : 1;
    this.anim.once(clip, dur, Math.max(0.6, ts));
  }

  // called each frame by the game; `moving` true when translating this frame
  animate(dt, moving) {
    // smooth turn
    if (this._targetYaw !== undefined) {
      let cur = this.mesh.rotation.y, d = this._targetYaw - cur;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.mesh.rotation.y = cur + d * Math.min(1, dt * 12);
    }
    if (this.dead) {
      if (!this._deathPlayed) { this.anim.once('Death_A', 99); this._deathPlayed = true; }
      this.anim.update(dt);
      return;
    }
    if (this.anim.locked <= 0) {
      if (moving) this.anim.play(this.vis.walk, { timeScale: this.kind === 'cavalry' ? 1.0 : 1.15 });
      else this.anim.play(this.vis.idle2 && (this.state === 'attack') ? this.vis.idle2 : 'Idle');
    }
    this.anim.update(dt);
    this._updateCarry();
  }

  _updateCarry() {
    const hauling = this.carry.amount > 0.5;
    if (hauling && !this.carryMesh) {
      const col = this.carry.type === 'wood' ? 0x8a5a2b : this.carry.type === 'gold' ? 0xf2c84b : 0xc0492f;
      const geo = this.carry.type === 'wood'
        ? new THREE.BoxGeometry(0.5, 0.18, 0.18) : new THREE.SphereGeometry(0.16, 8, 6);
      this.carryMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
      this.carryMesh.castShadow = true;
      this.carryMesh.position.set(0, 1.55, -0.28);
      this.mesh.add(this.carryMesh);
    } else if (!hauling && this.carryMesh) {
      this.mesh.remove(this.carryMesh); this.carryMesh = null;
    }
  }
}
