import * as THREE from 'three';
import { UNIT_DEFS, TEAM_COLOR } from '../config.js';

let _uid = 1;

function mat(color, rough = 0.7, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: false });
}

// Build a rigged humanoid with named limbs we can animate procedurally.
function buildHumanoid({ teamColor, skin = 0xc99a6a, cloth = 0x8a8f98, accent, weapon, mounted = false, scale = 1 }) {
  const g = new THREE.Group();
  const rig = {};
  const M = {
    skin: mat(skin, 0.6), cloth: mat(cloth, 0.85), team: mat(teamColor, 0.5, 0.1),
    metal: mat(0xb9c0c9, 0.35, 0.85), wood: mat(0x6b4a2a, 0.8), dark: mat(0x3a3f47, 0.7),
  };

  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.4, 4, 8), M.cloth);
  chest.position.y = 1.05; chest.scale.set(1, 1, 0.7); torso.add(chest);
  // team-color sash
  const sash = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.46), M.team);
  sash.position.y = 1.02; torso.add(sash);
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), M.skin);
  head.position.y = 1.5; torso.add(head);
  if (accent === 'helm') {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, 7, 0, 1.7), M.metal);
    helm.position.y = 1.54; torso.add(helm);
  } else if (accent === 'hat') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 8), M.team);
    hat.position.y = 1.66; torso.add(hat);
  }

  // arms (shoulders pivot)
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, 1.28, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.34, 3, 6), M.cloth);
    upper.position.y = -0.22; pivot.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.skin);
    hand.position.y = -0.46; pivot.add(hand);
    torso.add(pivot);
    return { pivot, hand };
  }
  const armL = makeArm(-1), armR = makeArm(1);
  rig.armL = armL.pivot; rig.armR = armR.pivot;

  // legs
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.78, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 6), M.dark);
    leg.position.y = -0.3; pivot.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), M.wood);
    foot.position.set(0, -0.58, 0.06); pivot.add(foot);
    torso.add(pivot);
    return pivot;
  }
  rig.legL = makeLeg(-1); rig.legR = makeLeg(1);

  // weapon/tool in right hand
  if (weapon) {
    const w = new THREE.Group();
    w.position.set(0, -0.46, 0);
    if (weapon === 'axe') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6), M.wood); handle.position.y = -0.2; w.add(handle);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.04), M.metal); blade.position.set(0.08, -0.42, 0); w.add(blade);
    } else if (weapon === 'pick') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55), M.wood); handle.position.y = -0.2; w.add(handle);
      const head2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.4), M.metal); head2.rotation.z = Math.PI / 2; head2.position.y = -0.42; w.add(head2);
    } else if (weapon === 'sword') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.02), M.metal); blade.position.y = -0.45; w.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), M.dark); guard.position.y = -0.12; w.add(guard);
      // shield on left arm
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), M.team);
      shield.rotation.x = Math.PI / 2; armL.pivot.add(shield); shield.position.set(-0.05, -0.4, 0.1);
    } else if (weapon === 'bow') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 12, Math.PI * 1.1), M.wood);
      bow.rotation.y = Math.PI / 2; bow.position.y = -0.3; w.add(bow);
    } else if (weapon === 'lance') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6), M.wood); shaft.rotation.x = Math.PI / 2.2; shaft.position.set(0, -0.3, 0.4); w.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), M.metal); tip.rotation.x = Math.PI / 2.2; tip.position.set(0, -0.0, 1.1); w.add(tip);
    }
    armR.pivot.add(w);
    rig.weapon = w;
  }

  let root = torso;
  if (mounted) {
    // horse
    const horse = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), mat(0x5b3f2a, 0.85));
    body.rotation.z = Math.PI / 2; body.position.y = 0.95; horse.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.6), mat(0x5b3f2a, 0.85));
    neck.position.set(0, 1.25, 0.6); neck.rotation.x = 0.6; horse.add(neck);
    const hhead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.42), mat(0x4a3220, 0.85));
    hhead.position.set(0, 1.5, 0.85); horse.add(hhead);
    for (const [sx, sz] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.95), mat(0x4a3220, 0.85));
      leg.position.set(sx, 0.47, sz); horse.add(leg);
    }
    horse.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    torso.position.y = 0.62; torso.position.z = -0.05;
    root = new THREE.Group(); root.add(horse); root.add(torso);
  }

  g.add(root);
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { group: g, rig };
}

const KIND_VISUAL = {
  villager: () => ({ cloth: 0x9a8b6f, accent: 'hat', weapon: 'axe', scale: 0.92 }),
  infantry: () => ({ cloth: 0x6f7681, accent: 'helm', weapon: 'sword', scale: 1.0 }),
  archer:   () => ({ cloth: 0x5f7a4a, accent: 'hat', weapon: 'bow', scale: 0.98 }),
  cavalry:  () => ({ cloth: 0x6f7681, accent: 'helm', weapon: 'lance', mounted: true, scale: 1.0 }),
};

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
    this.target = null;        // enemy entity
    this.gatherNode = null;
    this.dropTarget = null;
    this.buildTarget = null;
    this.carry = { type: null, amount: 0 };
    this.path = null; this.pathIdx = 0;
    this.goal = null;          // THREE.Vector3 final destination
    this.attackTimer = 0;
    this.walkPhase = Math.random() * 6.28;
    this.swing = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.selected = false;
    this.stuck = 0;

    const vis = KIND_VISUAL[this.kind]();
    const built = buildHumanoid({ teamColor: TEAM_COLOR[team], ...vis });
    this.mesh = built.group;
    this.rig = built.rig;
    this.mesh.position.set(x, terrain.heightAt(x, z), z);
    this.mesh.userData.unit = this;

    // selection ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 24),
      new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.0, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.mesh.add(ring); this.ring = ring;
  }

  get pos() { return this.mesh.position; }

  setSelected(v) {
    this.selected = v;
    this.ring.material.opacity = v ? 0.9 : 0.0;
  }

  animate(dt, moving) {
    const r = this.rig;
    if (this.dead) {
      // collapse
      this.mesh.rotation.z = Math.min(Math.PI / 2, this.mesh.rotation.z + dt * 3);
      return;
    }
    if (moving) {
      this.walkPhase += dt * (this.kind === 'cavalry' ? 14 : 10);
      const sw = Math.sin(this.walkPhase) * 0.7;
      if (r.legL) r.legL.rotation.x = sw;
      if (r.legR) r.legR.rotation.x = -sw;
      if (r.armL) r.armL.rotation.x = -sw * 0.6;
      if (r.armR && this.swing <= 0) r.armR.rotation.x = sw * 0.6;
      this.mesh.position.y += Math.abs(Math.sin(this.walkPhase * 2)) * 0.0; // subtle
    } else {
      // ease limbs to rest
      for (const k of ['legL', 'legR', 'armL']) if (r[k]) r[k].rotation.x *= (1 - dt * 8);
      if (r.armR && this.swing <= 0) r.armR.rotation.x *= (1 - dt * 8);
      // idle breathing
      this.walkPhase += dt * 2;
    }
    // attack / work swing on right arm
    if (this.swing > 0) {
      this.swing -= dt * 5;
      const s = Math.sin((1 - this.swing) * Math.PI);
      if (r.armR) r.armR.rotation.x = -1.6 * s;
    }
  }

  triggerSwing() { this.swing = 1.0; }

  faceTo(x, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-4) this.mesh.rotation.y = Math.atan2(dx, dz);
  }
}
