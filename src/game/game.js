import * as THREE from 'three';
import {
  MAP, TEAM, TEAM_COLOR, AGES, UNIT_DEFS, BUILDING_DEFS, GATHER_RATE, CARRY_CAP,
  POP_PER_HOUSE, START_POP_CAP, MAX_POP, COMBAT,
} from '../config.js';
import { makeSky } from '../engine/textures.js';
import { Terrain } from '../world/terrain.js';
import { ResourceField } from '../world/resources.js';
import { FogOfWar } from '../world/fog.js';
import { Unit } from '../entities/units.js';
import { Building, makeGhost } from '../entities/buildings.js';
import { Grid } from './pathfind.js';
import { EnemyAI } from './ai.js';
import { HUD } from '../ui/hud.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.rng = rng(MAP.seed);
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.corpses = [];
    this.resources = [{ wood: 200, food: 200, gold: 100 }, { wood: 200, food: 200, gold: 100 }];
    this.age = [0, 0];
    this.timeNow = 0;
    this.selected = [];
    this.selectedBuilding = null;
    this.buildMode = null;       // building key while placing
    this.over = false;

    this._initRenderer();
    this._initScene();
  }

  // ---------------------------------------------------------------- bootstrap
  async build(hud) {
    this.hud = hud;
    const steps = [
      ['Raising the land…', () => { this.terrain = new Terrain(MAP.seed); this.scene.add(this.terrain.mesh); }],
      ['Planting forests & veins…', () => { this.resField = new ResourceField(this.terrain, this.rng); this.scene.add(this.resField.group); }],
      ['Drawing the shroud…', () => { this.fog = new FogOfWar(this.terrain); this.scene.add(this.fog.mesh); }],
      ['Surveying the grid…', () => { this._initGrid(); }],
      ['Founding settlements…', () => { this._initBases(); }],
      ['Mustering the enemy…', () => { this.ai = new EnemyAI(this, TEAM.ENEMY); }],
      ['Binding controls…', () => { this._initInput(); this._initMinimap(); }],
    ];
    for (let i = 0; i < steps.length; i++) {
      hud.setLoadingProgress(i / steps.length, steps[i][0]);
      steps[i][1]();
      await new Promise(r => setTimeout(r, 60));
    }
    hud.setLoadingProgress(1, 'Ready');
    hud.hideLoading();
    hud.showGame();
    hud.toast('Build your economy. Destroy the enemy Town Center.');
    this._refreshHUD();
  }

  // ---------------------------------------------------------------- renderer
  _initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    addEventListener('resize', () => this._onResize());
  }

  _initScene() {
    const scene = new THREE.Scene();
    const sky = makeSky();
    scene.background = sky;
    scene.environment = sky;
    scene.fog = new THREE.Fog(0xcfd9dc, 90, 240);
    this.scene = scene;

    // sun
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 130;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4030, 0.7);
    scene.add(hemi);
    const fill = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(fill);

    // camera
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 1000);
    this.camTarget = new THREE.Vector3(-68, 0, -68);
    this.camDist = 58;
    this.camYaw = Math.PI * 0.25;
    this.camPitch = 0.92;        // radians from horizontal-ish
    this._updateCamera();

    // selection box (DOM-less): use a screen-space rect via CSS overlay
    this._boxEl = document.createElement('div');
    Object.assign(this._boxEl.style, {
      position: 'absolute', border: '1.5px solid #8fd3ff', background: 'rgba(143,211,255,0.12)',
      pointerEvents: 'none', zIndex: 15, display: 'none',
    });
    document.getElementById('app').appendChild(this._boxEl);

    // move marker pool
    this.marker = this._makeMarker();
    scene.add(this.marker);
  }

  _makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 24), new THREE.MeshBasicMaterial({ color: 0x8ef0a8, transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    g.visible = false; g.userData.t = 0;
    return g;
  }
  _pingMarker(x, z, color = 0x8ef0a8) {
    this.marker.position.set(x, this.terrain.heightAt(x, z) + 0.1, z);
    this.marker.children[0].material.color.setHex(color);
    this.marker.visible = true; this.marker.userData.t = 0.6; this.marker.scale.setScalar(1);
  }

  _updateCamera() {
    const t = this.camTarget;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const off = new THREE.Vector3(Math.sin(this.camYaw) * cp, sp, Math.cos(this.camYaw) * cp).multiplyScalar(this.camDist);
    this.camera.position.copy(t).add(off);
    this.camera.lookAt(t.x, t.y + 2, t.z);
  }

  _initGrid() {
    this.grid = new Grid();
    // block resource nodes so units path around forests/mines
    for (const n of this.resField.nodes) {
      this.grid.setBlockedCircle(n.pos.x, n.pos.z, n.kind === 'tree' ? 0.7 : 0.8);
    }
  }

  _initBases() {
    const s = MAP.size;
    const toWorld = (nx, nz) => [(nx - 0.5) * s, (nz - 0.5) * s];
    const bases = [
      { team: TEAM.PLAYER, n: [0.16, 0.16] },
      { team: TEAM.ENEMY, n: [0.84, 0.84] },
    ];
    for (const b of bases) {
      const [bx, bz] = toWorld(b.n[0], b.n[1]);
      const tc = this.addBuilding('towncenter', b.team, bx, bz, true);
      // villagers around TC
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        this.spawnUnit('villager', b.team, bx + Math.cos(a) * 6, bz + Math.sin(a) * 6);
      }
    }
    // center camera on player base
    const [px, pz] = toWorld(0.16, 0.16);
    this.camTarget.set(px + 6, 0, pz + 6);
    this._updateCamera();
  }

  // ---------------------------------------------------------------- entities
  addBuilding(key, team, x, z, complete = false) {
    const b = new Building(key, team, x, z, this.terrain, { complete });
    this.buildings.push(b);
    this.scene.add(b.mesh);
    if (complete || true) this.grid.setBlockedCircle(x, z, b.footprint + 0.2);
    return b;
  }

  spawnUnit(key, team, x, z) {
    // find open-ish spot
    x = THREE.MathUtils.clamp(x, -MAP.size / 2 + 4, MAP.size / 2 - 4);
    z = THREE.MathUtils.clamp(z, -MAP.size / 2 + 4, MAP.size / 2 - 4);
    const u = new Unit(key, team, x, z, this.terrain);
    this.units.push(u);
    this.scene.add(u.mesh);
    return u;
  }

  // ---------------------------------------------------------------- economy API
  canAfford(team, cost) {
    const r = this.resources[team];
    return (r.wood >= (cost.wood || 0)) && (r.food >= (cost.food || 0)) && (r.gold >= (cost.gold || 0));
  }
  spend(team, cost) {
    const r = this.resources[team];
    r.wood -= cost.wood || 0; r.food -= cost.food || 0; r.gold -= cost.gold || 0;
  }
  buildCost(key) { return BUILDING_DEFS[key].cost; }
  unitCost(key) { return UNIT_DEFS[key].cost; }
  ageCost(age) { return AGES[age].advanceCost; }

  pop(team) { return this.units.reduce((a, u) => a + (!u.dead && u.team === team ? (u.def.pop || 1) : 0), 0); }
  popCap(team) {
    let cap = 0;
    for (const b of this.buildings) if (b.team === team && !b.dead && b.complete && b.def.popCap) cap += b.def.popCap;
    return Math.min(MAX_POP, cap);
  }

  unitsOf(team) { return this.units.filter(u => u.team === team); }
  buildingsOf(team) { return this.buildings.filter(b => b.team === team); }

  // ---------------------------------------------------------------- training
  queueTrain(building, unitKey) {
    const def = UNIT_DEFS[unitKey];
    const team = building.team;
    if (def.minAge > this.age[team]) return false;
    if (!this.canAfford(team, def.cost)) { if (team === TEAM.PLAYER) this._flashCost(def.cost); return false; }
    if (this.pop(team) + this._queuedPop(team) >= this.popCap(team)) {
      if (team === TEAM.PLAYER) this.hud.alert('Need more houses (population cap).');
      return false;
    }
    this.spend(team, def.cost);
    building.queue.push({ unitKey, progress: 0, time: def.trainTime });
    return true;
  }
  _queuedPop(team) {
    let p = 0;
    for (const b of this.buildings) if (b.team === team) p += b.queue.length;
    return p;
  }

  _advanceTraining(b, dt) {
    if (!b.queue.length) return;
    const q = b.queue[0];
    q.progress += dt / q.time;
    if (q.progress >= 1) {
      b.queue.shift();
      // spawn near building toward rally/center
      const dir = b.rallyPoint ? _v.copy(b.rallyPoint).sub(b.pos) : _v.set(0, 0, 0);
      if (dir.lengthSq() < 0.01) dir.set((this.rng() - 0.5), 0, (this.rng() - 0.5));
      dir.y = 0; dir.normalize();
      const sx = b.pos.x + dir.x * (b.footprint + 1.5);
      const sz = b.pos.z + dir.z * (b.footprint + 1.5);
      const u = this.spawnUnit(q.unitKey, b.team, sx, sz);
      if (b.rallyPoint) this._orderTo([u], b.rallyPoint.x, b.rallyPoint.z, false);
      else if (u.kind === 'villager') this._autoGather(u);
    }
  }

  advanceAge(team) {
    if (this.age[team] >= AGES.length - 1) return false;
    const cost = AGES[this.age[team] + 1].advanceCost;
    if (!this.canAfford(team, cost)) { if (team === TEAM.PLAYER) this._flashCost(cost); return false; }
    this.spend(team, cost);
    this.age[team]++;
    const name = AGES[this.age[team]].name;
    if (team === TEAM.PLAYER) this.hud.toast(`Advanced to ${name}!`);
    else this.hud.alert(`Enemy reached ${name}.`);
    return true;
  }

  _flashCost(cost) {
    const r = this.resources[TEAM.PLAYER];
    if ((cost.wood || 0) > r.wood) this.hud.flashResource('wood');
    if ((cost.food || 0) > r.food) this.hud.flashResource('food');
    if ((cost.gold || 0) > r.gold) this.hud.flashResource('gold');
  }

  // ---------------------------------------------------------------- commands
  _orderTo(units, x, z, queueGather) {
    for (const u of units) {
      if (u.dead || u.team !== TEAM.PLAYER) continue;
      u.target = null; u.gatherNode = null; u.buildTarget = null; u.attackMove = null; u.holding = false;
      this._pathTo(u, x, z);
      u.state = 'move';
    }
  }

  _pathTo(u, x, z) {
    const path = this.grid.findPath(u.pos.x, u.pos.z, x, z);
    if (path && path.length) { u.path = path; u.pathIdx = 0; u.goal = path[path.length - 1].clone(); }
    else { u.path = [new THREE.Vector3(x, 0, z)]; u.pathIdx = 0; u.goal = new THREE.Vector3(x, 0, z); }
  }

  commandRightClick(worldPoint, picked) {
    if (!this.selected.length && !this.selectedBuilding) return;
    // building rally set
    if (this.selectedBuilding && this.selectedBuilding.team === TEAM.PLAYER && !this.selected.length) {
      this.selectedBuilding.rallyPoint = worldPoint.clone();
      this._pingMarker(worldPoint.x, worldPoint.z, 0xe8c879);
      return;
    }
    const mine = this.selected.filter(u => u.team === TEAM.PLAYER && !u.dead);
    if (!mine.length) return;

    if (picked && picked.enemy) {
      // attack
      for (const u of mine) { u.gatherNode = null; u.buildTarget = null; u.holding = false; u.target = picked.entity; u.attackMove = null; u.state = u.kind === 'villager' ? 'attack' : 'attack'; }
      this._pingMarker(picked.entity.pos.x, picked.entity.pos.z, 0xef5350);
      return;
    }
    if (picked && picked.node) {
      // gather
      const villagers = mine.filter(u => u.kind === 'villager');
      for (const u of villagers) this._assignNode(u, picked.node);
      // non-villagers just move there
      const others = mine.filter(u => u.kind !== 'villager');
      if (others.length) this._formationMove(others, picked.node.pos.x, picked.node.pos.z);
      this._pingMarker(picked.node.pos.x, picked.node.pos.z, 0xe8c879);
      return;
    }
    if (picked && picked.building && picked.building.team === TEAM.PLAYER && !picked.building.complete) {
      // assist construction
      const villagers = mine.filter(u => u.kind === 'villager');
      for (const u of villagers) { u.gatherNode = null; u.target = null; u.holding = false; u.buildTarget = picked.building; u.state = 'tobuild'; this._pathTo(u, picked.building.pos.x, picked.building.pos.z); }
      this._pingMarker(picked.building.pos.x, picked.building.pos.z, 0x8ef0a8);
      return;
    }
    // plain move (formation)
    this._formationMove(mine, worldPoint.x, worldPoint.z);
    this._pingMarker(worldPoint.x, worldPoint.z);
  }

  _formationMove(units, x, z) {
    const n = units.length;
    const cols = Math.ceil(Math.sqrt(n));
    const spacing = 2.2;
    let i = 0;
    for (const u of units) {
      const r = Math.floor(i / cols), c = i % cols;
      const ox = (c - (cols - 1) / 2) * spacing;
      const oz = (r - (cols - 1) / 2) * spacing;
      this._orderTo([u], x + ox, z + oz, false);
      i++;
    }
  }

  _assignNode(u, node) {
    u.target = null; u.buildTarget = null; u.holding = false; u.attackMove = null;
    u.gatherNode = node;
    if (u.carry.amount > 0 && u.carry.type !== node.type) { u.carry.amount = 0; u.carry.type = null; }
    u.state = 'togather';
    this._pathTo(u, node.pos.x, node.pos.z);
  }

  _autoGather(u) {
    // pick nearest resource, prefer food/wood balance
    const node = this.resField.nearestNode(u.pos, null, 80);
    if (node) this._assignNode(u, node);
  }

  // ---------------------------------------------------------------- placement
  enterBuildMode(key) {
    if (this.buildMode === key) { this.exitBuildMode(); return; }
    if (BUILDING_DEFS[key].minAge > this.age[TEAM.PLAYER]) return;
    if (!this.canAfford(TEAM.PLAYER, BUILDING_DEFS[key].cost)) { this._flashCost(BUILDING_DEFS[key].cost); return; }
    this.exitBuildMode();
    this.buildMode = key;
    this.ghost = makeGhost(key, this.terrain);
    this.scene.add(this.ghost);
    this.canvas.classList.add('cmd-build');
    this._refreshHUD();
  }
  exitBuildMode() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    this.buildMode = null;
    this.canvas.classList.remove('cmd-build');
  }

  _placeBuilding(x, z) {
    const key = this.buildMode;
    if (!this._canPlace(key, x, z)) { this.hud.alert('Cannot build there.'); return; }
    if (!this.canAfford(TEAM.PLAYER, BUILDING_DEFS[key].cost)) { this._flashCost(BUILDING_DEFS[key].cost); this.exitBuildMode(); return; }
    this.spend(TEAM.PLAYER, BUILDING_DEFS[key].cost);
    const b = this.addBuilding(key, TEAM.PLAYER, x, z, false);
    // assign selected villagers to build
    const villagers = this.selected.filter(u => u.kind === 'villager' && !u.dead && u.team === TEAM.PLAYER);
    for (const u of villagers) { u.gatherNode = null; u.target = null; u.buildTarget = b; u.holding = false; u.state = 'tobuild'; this._pathTo(u, x, z); }
    this.exitBuildMode();
    this._refreshHUD();
  }

  _canPlace(key, x, z) {
    const fp = BUILDING_DEFS[key].footprint;
    const half = MAP.size / 2 - fp - 2;
    if (Math.abs(x) > half || Math.abs(z) > half) return false;
    for (const b of this.buildings) if (!b.dead) {
      if (b.pos.distanceTo(_v.set(x, b.pos.y, z)) < fp + b.footprint + 0.5) return false;
    }
    for (const n of this.resField.nodes) if (n.alive) {
      if (Math.hypot(n.pos.x - x, n.pos.z - z) < fp + 1.0) return false;
    }
    // slope check
    const h0 = this.terrain.heightAt(x, z);
    const hs = [this.terrain.heightAt(x + fp, z), this.terrain.heightAt(x - fp, z), this.terrain.heightAt(x, z + fp), this.terrain.heightAt(x, z - fp)];
    for (const h of hs) if (Math.abs(h - h0) > 2.2) return false;
    return true;
  }

  // ================================================================ UPDATE
  update(dt) {
    if (this.over) { this._render(); return; }
    dt = Math.min(dt, 0.05);
    this.timeNow += dt;

    this._handleCameraKeys(dt);
    this.ai.update(dt);

    // training & construction & tower fire
    for (const b of this.buildings) {
      if (b.dead) continue;
      this._advanceTraining(b, dt);
      if (b.complete && (b.key === 'tower' || b.key === 'towncenter')) this._buildingFire(b, dt);
    }

    // units
    this._stepUnits(dt);
    this._stepProjectiles(dt);
    this._stepCorpses(dt);

    // fog
    this.fog.beginFrame();
    for (const u of this.units) if (!u.dead && u.team === TEAM.PLAYER) this.fog.reveal(u.pos.x, u.pos.z, 16);
    for (const b of this.buildings) if (!b.dead && b.team === TEAM.PLAYER) this.fog.reveal(b.pos.x, b.pos.z, b.key === 'tower' ? 22 : 20);
    this.fog.endFrame();
    this._applyFogVisibility();

    // marker fade
    if (this.marker.visible) { this.marker.userData.t -= dt; this.marker.scale.multiplyScalar(1 + dt * 2); this.marker.children[0].material.opacity = Math.max(0, this.marker.userData.t); if (this.marker.userData.t <= 0) this.marker.visible = false; }

    // cleanup dead
    this._cleanup();

    // win/lose check (cheap, every frame is fine)
    this._checkEnd();

    // HUD
    this._refreshHUD();
    this.hud.setClock(this.timeNow);
    this._drawMinimap();

    this._render();
  }

  _render() {
    this.sun.target.position.copy(this.camTarget);
    this.sun.position.set(this.camTarget.x + 60, 90, this.camTarget.z + 40);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- unit sim
  _stepUnits(dt) {
    const units = this.units;
    for (const u of units) {
      if (u.dead) { u.animate(dt, false); continue; }
      let moving = false;
      switch (u.state) {
        case 'idle': moving = this._idle(u, dt); break;
        case 'move': moving = this._move(u, dt); break;
        case 'togather': moving = this._toGather(u, dt); break;
        case 'gather': moving = this._gather(u, dt); break;
        case 'returning': moving = this._returning(u, dt); break;
        case 'tobuild': moving = this._toBuild(u, dt); break;
        case 'build': moving = this._build(u, dt); break;
        case 'attack': moving = this._attack(u, dt); break;
      }
      if (u.attackTimer > 0) u.attackTimer -= dt;
      // aggro scan for military
      if (u.kind !== 'villager' && !u.holding && (u.state === 'idle' || u.state === 'move')) {
        u.aggroTimer = (u.aggroTimer || 0) - dt;
        if (u.aggroTimer <= 0) {
          u.aggroTimer = 0.5;
          const e = this._nearestEnemy(u, 12);
          if (e) { u.target = e; u.attackMove = u.state === 'move' ? u.goal.clone() : null; u.state = 'attack'; }
        }
      }
      // keep on terrain
      u.pos.y = this.terrain.heightAt(u.pos.x, u.pos.z) + (u.kind === 'cavalry' ? 0.0 : 0.0);
      u.animate(dt, moving);
    }
    // separation
    this._separate(dt);
  }

  _idle(u, dt) {
    // villagers auto-resume gathering if assigned node still alive handled elsewhere
    return false;
  }

  _move(u, dt) {
    return this._followPath(u, dt, () => { u.state = 'idle'; });
  }

  _followPath(u, dt, onArrive) {
    if (!u.path || u.pathIdx >= u.path.length) { onArrive && onArrive(); return false; }
    const wp = u.path[u.pathIdx];
    const dx = wp.x - u.pos.x, dz = wp.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    const arrive = (u.pathIdx === u.path.length - 1) ? 0.5 : 1.0;
    if (dist < arrive) { u.pathIdx++; if (u.pathIdx >= u.path.length) { onArrive && onArrive(); return false; } return true; }
    const step = u.speed * dt;
    const nx = u.pos.x + (dx / dist) * Math.min(step, dist);
    const nz = u.pos.z + (dz / dist) * Math.min(step, dist);
    u.pos.x = nx; u.pos.z = nz;
    u.faceTo(wp.x, wp.z);
    return true;
  }

  _toGather(u, dt) {
    const node = u.gatherNode;
    if (!node || !node.alive) { const nn = this.resField.nearestNode(u.pos, node ? node.type : null, 60); if (nn) { u.gatherNode = nn; this._pathTo(u, nn.pos.x, nn.pos.z); } else { u.state = 'idle'; } return false; }
    const d = Math.hypot(node.pos.x - u.pos.x, node.pos.z - u.pos.z);
    if (d < 1.7) { u.state = 'gather'; u.gatherTick = 0; u.faceTo(node.pos.x, node.pos.z); return false; }
    return this._followPath(u, dt, () => { u.state = 'gather'; u.gatherTick = 0; });
  }

  _gather(u, dt) {
    const node = u.gatherNode;
    if (!node || !node.alive) { u.state = 'returning'; return this._startReturn(u); }
    u.gatherTick = (u.gatherTick || 0) + dt;
    if (u.gatherTick > 0.5) { u.gatherTick = 0; u.triggerSwing(); }
    const got = this.resField.harvest(node, GATHER_RATE * dt);
    u.carry.type = node.type; u.carry.amount += got;
    u.faceTo(node.pos.x, node.pos.z);
    if (u.carry.amount >= CARRY_CAP || !node.alive) { this._startReturn(u); }
    return false;
  }

  _startReturn(u) {
    const drop = this._nearestDropoff(u.team, u.carry.type, u.pos);
    if (!drop) { u.state = 'idle'; return false; }
    u.dropTarget = drop; u.state = 'returning';
    this._pathTo(u, drop.pos.x, drop.pos.z);
    return false;
  }

  _returning(u, dt) {
    const drop = u.dropTarget;
    if (!drop || drop.dead) { const nd = this._nearestDropoff(u.team, u.carry.type, u.pos); if (nd) { u.dropTarget = nd; this._pathTo(u, nd.pos.x, nd.pos.z); } else { u.state = 'idle'; } return false; }
    const d = Math.hypot(drop.pos.x - u.pos.x, drop.pos.z - u.pos.z);
    if (d < drop.footprint + 1.4) {
      // deposit
      this.resources[u.team][u.carry.type] += u.carry.amount;
      u.carry.amount = 0;
      // back to node
      if (u.gatherNode && u.gatherNode.alive) { u.state = 'togather'; this._pathTo(u, u.gatherNode.pos.x, u.gatherNode.pos.z); }
      else { const nn = this.resField.nearestNode(u.pos, u.carry.type, 60); if (nn) { u.gatherNode = nn; u.state = 'togather'; this._pathTo(u, nn.pos.x, nn.pos.z); } else u.state = 'idle'; }
      return false;
    }
    return this._followPath(u, dt, () => {});
  }

  _nearestDropoff(team, type, pos) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.team !== team || b.dead || !b.complete || !b.def.dropoff) continue;
      if (!b.def.dropoff.includes(type)) continue;
      const d = b.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _toBuild(u, dt) {
    const b = u.buildTarget;
    if (!b || b.dead || b.complete) { u.state = 'idle'; u.buildTarget = null; return false; }
    const d = Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z);
    if (d < b.footprint + 1.6) { u.state = 'build'; u.faceTo(b.pos.x, b.pos.z); return false; }
    return this._followPath(u, dt, () => { u.state = 'build'; });
  }

  _build(u, dt) {
    const b = u.buildTarget;
    if (!b || b.dead || b.complete) { u.state = 'idle'; u.buildTarget = null; if (u.kind === 'villager') this._autoGather(u); return false; }
    u.gatherTick = (u.gatherTick || 0) + dt;
    if (u.gatherTick > 0.45) { u.gatherTick = 0; u.triggerSwing(); }
    const rate = 1 / Math.max(1, b.def.buildTime) * 1.0; // one villager builds in buildTime sec
    const done = b.addBuild(dt, rate);
    u.faceTo(b.pos.x, b.pos.z);
    if (done) {
      this.grid.setBlockedCircle(b.pos.x, b.pos.z, b.footprint + 0.2);
      if (u.team === TEAM.PLAYER) this.hud.toast(`${b.def.name} complete.`);
      u.state = 'idle'; u.buildTarget = null;
      if (u.kind === 'villager') this._autoGather(u);
    }
    return false;
  }

  _attack(u, dt) {
    let tgt = u.target;
    if (!tgt || tgt.dead) {
      u.target = null;
      // resume attack-move or look for new target
      const e = this._nearestEnemy(u, 12);
      if (e) { u.target = e; }
      else if (u.attackMove) { this._pathTo(u, u.attackMove.x, u.attackMove.z); u.attackMove2 = u.attackMove; u.attackMove = null; u.state = 'move'; u.goal = new THREE.Vector3(u.attackMove2.x, 0, u.attackMove2.z); return this._move(u, dt); }
      else { u.state = 'idle'; return false; }
      tgt = u.target;
    }
    const tp = tgt.pos;
    const reach = (u.def.range || 1) + (tgt.footprint ? tgt.footprint : 0.4);
    const d = Math.hypot(tp.x - u.pos.x, tp.z - u.pos.z);
    if (d > reach) {
      // move toward target
      const dx = tp.x - u.pos.x, dz = tp.z - u.pos.z;
      const step = u.speed * dt;
      u.pos.x += (dx / d) * Math.min(step, d - reach * 0.8);
      u.pos.z += (dz / d) * Math.min(step, d - reach * 0.8);
      u.faceTo(tp.x, tp.z);
      return true;
    }
    // in range: attack
    u.faceTo(tp.x, tp.z);
    if (u.attackTimer <= 0) {
      u.attackTimer = u.def.attackCooldown;
      u.triggerSwing();
      if (u.def.ranged) this._spawnProjectile(u, tgt);
      else this._applyDamage(tgt, Math.max(1, u.def.dmg - (tgt.def && tgt.def.armor ? tgt.def.armor : 0)), u.team);
    }
    return false;
  }

  _buildingFire(b, dt) {
    b.attackTimer -= dt;
    if (b.attackTimer > 0) return;
    const range = b.def.range || (b.key === 'towncenter' ? 12 : 13);
    const dmg = b.def.dmg || (b.key === 'towncenter' ? 10 : 16);
    let target = null, bd = range * range;
    for (const u of this.units) {
      if (u.dead || u.team === b.team) continue;
      const d = u.pos.distanceToSquared(b.pos);
      if (d < bd) { bd = d; target = u; }
    }
    if (target) {
      b.attackTimer = b.def.attackCooldown || 1.5;
      this._spawnProjectileFrom(b.pos.clone().add(_v.set(0, 5, 0)), target, dmg, b.team);
    }
  }

  _nearestEnemy(u, radius) {
    let best = null, bd = radius * radius;
    for (const o of this.units) {
      if (o.dead || o.team === u.team) continue;
      if (u.team === TEAM.PLAYER ? false : !this._aiCanSee(o)) {}
      const d = o.pos.distanceToSquared(u.pos);
      if (d < bd) { bd = d; best = o; }
    }
    // also target nearby enemy buildings if no unit
    if (!best) {
      for (const b of this.buildings) {
        if (b.dead || b.team === u.team) continue;
        const d = b.pos.distanceToSquared(u.pos);
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best;
  }
  _aiCanSee() { return true; }

  _applyDamage(target, dmg, fromTeam) {
    if (target.dead) return;
    if (target.maxHp !== undefined && target.def && target.def.kind) {
      // unit
      target.hp -= dmg;
      if (target.hp <= 0) this._killUnit(target);
    } else if (target.key !== undefined) {
      // building
      const destroyed = target.damage(dmg);
      if (destroyed) this._destroyBuilding(target);
      else if (target.team === TEAM.PLAYER && !target._warned && this.timeNow - (target._lastWarn || -99) > 8) {
        target._lastWarn = this.timeNow;
        this.hud.alert(`${target.def.name} under attack!`);
        this._pingMarker(target.pos.x, target.pos.z, 0xef5350);
      }
    }
  }

  _killUnit(u) {
    u.dead = true; u.hp = 0; u.state = 'dead'; u.deadTimer = COMBAT.corpseFade;
    u.setSelected(false);
    const i = this.selected.indexOf(u); if (i >= 0) this.selected.splice(i, 1);
    this.corpses.push(u);
  }

  _destroyBuilding(b) {
    b.dead = true;
    this.grid.setBlockedCircle(b.pos.x, b.pos.z, b.footprint + 0.2, 0);
    // small debris flash: scale down
    b._fade = 1.0;
    if (this.selectedBuilding === b) { this.selectedBuilding = null; }
    if (b.team === TEAM.ENEMY && b.key === 'towncenter') this.hud.toast('Enemy Town Center destroyed!');
  }

  // ---------------------------------------------------------------- projectiles
  _spawnProjectile(u, target) {
    this._spawnProjectileFrom(u.pos.clone().add(_v.set(0, 1.2, 0)), target, Math.max(1, u.def.dmg - (target.def && target.def.armor ? target.def.armor : 0)), u.team);
  }
  _spawnProjectileFrom(from, target, dmg, team) {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a3a26 }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, target, dmg, team, from, speed: COMBAT.projectileSpeed });
  }

  _stepProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.target || p.target.dead) { p.dead = true; continue; }
      const tp = _v.copy(p.target.pos); tp.y += 1.0;
      const dir = _v2.copy(tp).sub(p.mesh.position);
      const d = dir.length();
      if (d < 0.8) {
        this._applyDamage(p.target, p.dmg, p.team);
        p.dead = true;
        continue;
      }
      dir.multiplyScalar(Math.min(p.speed * dt, d) / d);
      p.mesh.position.add(dir);
      p.mesh.lookAt(tp);
      p.mesh.rotateX(Math.PI / 2);
    }
    this.projectiles = this.projectiles.filter(p => { if (p.dead) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); return false; } return true; });
  }

  _stepCorpses(dt) {
    for (const u of this.corpses) {
      u.deadTimer -= dt;
      u.mesh.position.y = this.terrain.heightAt(u.pos.x, u.pos.z) - (1 - u.deadTimer / COMBAT.corpseFade) * 0.4;
      const s = Math.max(0.01, u.deadTimer / COMBAT.corpseFade);
      if (u.deadTimer < 0.8) u.mesh.scale.setScalar(u.mesh.scale.x * (1 - dt * 2));
    }
  }

  _separate(dt) {
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const a = units[i]; if (a.dead) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j]; if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const minD = 1.1;
        if (d2 > 1e-4 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = (minD - d) * 0.5;
          const px = (dx / d) * push, pz = (dz / d) * push;
          a.pos.x -= px; a.pos.z -= pz; b.pos.x += px; b.pos.z += pz;
        }
      }
    }
  }

  _cleanup() {
    // remove faded corpses
    this.corpses = this.corpses.filter(u => {
      if (u.deadTimer <= 0) { this.scene.remove(u.mesh); return false; }
      return true;
    });
    this.units = this.units.filter(u => !(u.dead && u.deadTimer <= 0));
    // remove dead buildings after fade
    for (const b of this.buildings) {
      if (b.dead && b._fade !== undefined) {
        b._fade -= 0.03;
        b.mesh.scale.setScalar(Math.max(0.001, b._fade));
        b.mesh.position.y -= 0.05;
        if (b._fade <= 0) { this.scene.remove(b.mesh); b._removed = true; }
      }
    }
    this.buildings = this.buildings.filter(b => !b._removed);
  }

  _applyFogVisibility() {
    for (const u of this.units) {
      if (u.team === TEAM.PLAYER) { u.mesh.visible = true; continue; }
      u.mesh.visible = this.fog.isVisibleWorld(u.pos.x, u.pos.z);
    }
    for (const b of this.buildings) {
      if (b.team === TEAM.PLAYER) { b.mesh.visible = true; continue; }
      b.mesh.visible = this.fog.isExploredWorld(b.pos.x, b.pos.z);
    }
  }

  _checkEnd() {
    const playerTC = this.buildings.some(b => b.team === TEAM.PLAYER && b.key === 'towncenter' && !b.dead);
    const enemyTC = this.buildings.some(b => b.team === TEAM.ENEMY && b.key === 'towncenter' && !b.dead);
    if (!enemyTC) { this._end(true); }
    else if (!playerTC) { this._end(false); }
  }
  _end(win) {
    if (this.over) return;
    this.over = true;
    const sub = win ? `You crushed the enemy in ${this._fmt(this.timeNow)}.` : `Your town center fell after ${this._fmt(this.timeNow)}.`;
    this.hud.showEnd(win, sub);
  }
  _fmt(s) { const m = Math.floor(s / 60); return `${m}m ${Math.floor(s % 60)}s`; }

  // ================================================================ AI hooks
  aiAssignGather(v) { this._autoGather(v); }
  aiTrain(b, key) { return this.queueTrain(b, key); }
  aiAdvance() { return this.advanceAge(TEAM.ENEMY); }
  aiAttackMove(units, pos) {
    for (const u of units) {
      if (u.dead) continue;
      u.holding = false; u.target = null; u.gatherNode = null;
      u.attackMove = pos.clone();
      this._pathTo(u, pos.x, pos.z);
      u.goal = new THREE.Vector3(pos.x, 0, pos.z);
      u.state = 'move';
    }
  }
  enemyMainPos(team) {
    const tc = this.buildings.find(b => b.team === (1 - team) && b.key === 'towncenter' && !b.dead);
    if (tc) return tc.pos.clone();
    const any = this.buildings.find(b => b.team === (1 - team) && !b.dead);
    return any ? any.pos.clone() : new THREE.Vector3();
  }
  aiPlaceBuilding(key) {
    const tc = this.buildings.find(b => b.team === TEAM.ENEMY && b.key === 'towncenter' && !b.dead);
    if (!tc) return false;
    for (let tries = 0; tries < 24; tries++) {
      const a = this.rng() * Math.PI * 2;
      const r = 8 + this.rng() * 16;
      const x = tc.pos.x + Math.cos(a) * r, z = tc.pos.z + Math.sin(a) * r;
      if (!this.canAfford(TEAM.ENEMY, BUILDING_DEFS[key].cost)) return false;
      if (this._canPlace(key, x, z)) {
        this.spend(TEAM.ENEMY, BUILDING_DEFS[key].cost);
        const b = this.addBuilding(key, TEAM.ENEMY, x, z, false);
        // assign 1-2 idle enemy villagers
        const vills = this.unitsOf(TEAM.ENEMY).filter(u => u.kind === 'villager' && !u.dead).slice(0, 2);
        for (const u of vills) { u.gatherNode = null; u.buildTarget = b; u.state = 'tobuild'; this._pathTo(u, x, z); }
        return true;
      }
    }
    return false;
  }
  toast(m) { this.hud.alert(m); }

  // ================================================================ INPUT
  _initInput() {
    const c = this.canvas;
    this.keys = {};
    this.mouse = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this._drag = null;
    this._panDrag = null;

    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') { this.exitBuildMode(); this._clearSelection(); } if (e.key === 'Delete') this._deleteSelected(); });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());

    c.addEventListener('mousedown', e => this._onMouseDown(e));
    addEventListener('mousemove', e => this._onMouseMove(e));
    addEventListener('mouseup', e => this._onMouseUp(e));
    c.addEventListener('wheel', e => { e.preventDefault(); this.camDist = THREE.MathUtils.clamp(this.camDist * (1 + Math.sign(e.deltaY) * 0.1), 20, 110); this._updateCamera(); }, { passive: false });
  }

  _ndc(e) { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }

  _groundPoint(e) {
    this._ndc(e);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObject(this.terrain.mesh, false)[0];
    return hit ? hit.point : null;
  }

  _pickEntity(e) {
    this._ndc(e);
    this.ray.setFromCamera(this.mouse, this.camera);
    // units & buildings
    const targets = [];
    for (const u of this.units) if (!u.dead && u.mesh.visible) targets.push(u.mesh);
    for (const b of this.buildings) if (!b.dead && b.mesh.visible) targets.push(b.mesh);
    const hits = this.ray.intersectObjects(targets, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o) { if (o.userData.unit) return { entity: o.userData.unit, kind: 'unit' }; if (o.userData.building) return { entity: o.userData.building, kind: 'building' }; o = o.parent; }
    }
    // resource nodes (instanced)
    const rHits = this.ray.intersectObjects(this.resField.pickMeshes(), false);
    if (rHits.length && rHits[0].instanceId !== undefined) {
      const node = this.resField.nodeFromIntersect(rHits[0].object, rHits[0].instanceId);
      if (node) return { node, kind: 'node' };
    }
    return null;
  }

  _onMouseDown(e) {
    if (e.button === 1) { this._panDrag = { x: e.clientX, yaw: this.camYaw }; e.preventDefault(); return; }
    if (e.button === 2) { this._rightClick(e); return; }
    if (e.button === 0) {
      if (this.buildMode) { const g = this._groundPoint(e); if (g) this._placeBuilding(g.x, g.z); return; }
      this._drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, add: e.shiftKey };
    }
  }

  _onMouseMove(e) {
    this._lastMouse = e;
    if (this._panDrag) { const dx = e.clientX - this._panDrag.x; this.camYaw = this._panDrag.yaw - dx * 0.005; this._updateCamera(); return; }
    if (this.buildMode && this.ghost) {
      const g = this._groundPoint(e);
      if (g) { this.ghost.position.set(g.x, this.terrain.heightAt(g.x, g.z), g.z); const ok = this._canPlace(this.buildMode, g.x, g.z); const col = ok ? 0x66ff99 : 0xff5b5b; this.ghost.traverse(o => { if (o.material && o.material.color) o.material.color.setHex(col); }); }
    }
    if (this._drag) {
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (Math.hypot(e.clientX - this._drag.x0, e.clientY - this._drag.y0) > 5) {
        this._drag.moved = true;
        const x = Math.min(this._drag.x0, e.clientX), y = Math.min(this._drag.y0, e.clientY);
        Object.assign(this._boxEl.style, { display: 'block', left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - this._drag.x0) + 'px', height: Math.abs(e.clientY - this._drag.y0) + 'px' });
      }
    }
  }

  _onMouseUp(e) {
    if (e.button === 1) { this._panDrag = null; return; }
    if (e.button !== 0 || !this._drag) return;
    this._boxEl.style.display = 'none';
    if (this._drag.moved) this._boxSelect(this._drag.x0, this._drag.y0, e.clientX, e.clientY, this._drag.add);
    else this._clickSelect(e, this._drag.add);
    this._drag = null;
  }

  _rightClick(e) {
    if (this.buildMode) { this.exitBuildMode(); return; }
    const picked = this._pickEntity(e);
    const g = this._groundPoint(e);
    let info = null;
    if (picked) {
      if (picked.kind === 'unit') info = { enemy: picked.entity.team !== TEAM.PLAYER, entity: picked.entity };
      else if (picked.kind === 'building') { if (picked.entity.team !== TEAM.PLAYER) info = { enemy: true, entity: picked.entity }; else info = { building: picked.entity }; }
      else if (picked.kind === 'node') info = { node: picked.node };
    }
    if (g || info) this.commandRightClick(g || (info.entity ? info.entity.pos : info.node.pos), info);
  }

  _clickSelect(e, add) {
    const picked = this._pickEntity(e);
    if (!add) this._clearSelection();
    if (!picked) { if (!add) this._refreshHUD(); return; }
    if (picked.kind === 'unit' && picked.entity.team === TEAM.PLAYER) {
      this._select([picked.entity], add);
    } else if (picked.kind === 'building') {
      this.selectedBuilding = picked.entity;
      if (!add) this.selected.forEach(u => u.setSelected(false)), this.selected = [];
    } else if (picked.kind === 'unit') {
      // enemy unit — just focus selection panel (read-only)
      this.selectedBuilding = null; this._select([picked.entity], false, true);
    }
    this._refreshHUD();
  }

  _boxSelect(x0, y0, x1, y1, add) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    if (!add) this._clearSelection();
    const picked = [];
    for (const u of this.units) {
      if (u.dead || u.team !== TEAM.PLAYER) continue;
      _v.copy(u.pos); _v.y += 1; _v.project(this.camera);
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY && _v.z < 1) picked.push(u);
    }
    // prefer military if mixed and many
    if (picked.length) this._select(picked, add);
    this._refreshHUD();
  }

  _select(units, add, readonly = false) {
    if (!add) this._clearSelection();
    this.selectedBuilding = null;
    for (const u of units) { if (!this.selected.includes(u)) { this.selected.push(u); u.setSelected(true); } }
    this._readonlySel = readonly && units[0] && units[0].team !== TEAM.PLAYER;
  }

  _clearSelection() {
    for (const u of this.selected) u.setSelected(false);
    this.selected = [];
    this.selectedBuilding = null;
    this._readonlySel = false;
  }

  _deleteSelected() {
    for (const u of this.selected.slice()) if (u.team === TEAM.PLAYER) this._killUnit(u);
    this._clearSelection();
  }

  _handleCameraKeys(dt) {
    const sp = 38 * dt * (this.camDist / 50);
    const fwd = _v.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = _v2.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    let mx = 0, mz = 0;
    if (this.keys['w'] || this.keys['arrowup']) mz -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) mz += 1;
    if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) mx += 1;
    if (this.keys['q']) this.camYaw += dt * 1.2;
    if (this.keys['e']) this.camYaw -= dt * 1.2;
    // edge scroll
    if (this._lastMouse) {
      const m = this._lastMouse, edge = 8;
      if (m.clientX < edge) mx -= 1; else if (m.clientX > innerWidth - edge) mx += 1;
      if (m.clientY < edge) mz -= 1; else if (m.clientY > innerHeight - edge) mz += 1;
    }
    if (mx || mz) {
      this.camTarget.add(fwd.multiplyScalar(-mz * sp));
      this.camTarget.add(right.multiplyScalar(mx * sp));
      const lim = MAP.size / 2;
      this.camTarget.x = THREE.MathUtils.clamp(this.camTarget.x, -lim, lim);
      this.camTarget.z = THREE.MathUtils.clamp(this.camTarget.z, -lim, lim);
    }
    if (mx || mz || this.keys['q'] || this.keys['e']) this._updateCamera();
  }

  // ================================================================ HUD/minimap
  _refreshHUD() {
    if (!this.hud) return;
    const team = TEAM.PLAYER;
    this.hud.setResources(this.resources[team], this.pop(team), this.popCap(team), this.age[team]);
    const ctx = {
      age: this.age[team],
      res: this.resources[team],
      buildMode: this.buildMode,
      afford: cost => this.canAfford(team, cost),
    };
    const sel = this._selectionData();
    this.hud.renderSelection(sel, ctx);
  }

  _selectionData() {
    if (this.selectedBuilding) {
      return { kind: 'building', b: this.selectedBuilding, sig: 'b' + this.selectedBuilding.id + this.selectedBuilding.complete };
    }
    const mine = this.selected.filter(u => !u.dead);
    if (!mine.length) return { kind: 'none', sig: 'none' };
    const lead = mine[0];
    const canBuild = mine.some(u => u.kind === 'villager') && lead.team === TEAM.PLAYER && !this._readonlySel;
    const avgHp = mine.reduce((a, u) => a + u.hp / u.maxHp * 100, 0) / mine.length;
    const kinds = [...new Set(mine.map(u => u.typeKey))].sort().join(',');
    return { kind: 'units', lead, count: mine.length, canBuild, avgHp, sig: 'u' + kinds + mine.length + canBuild };
  }

  _initMinimap() {
    this.mm = document.getElementById('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.mm.addEventListener('mousedown', e => this._minimapTo(e));
    this.mm.addEventListener('mousemove', e => { if (e.buttons & 1) this._minimapTo(e); });
    // precompute terrain colour map
    this._mmTerrain = this._renderMinimapTerrain();
  }

  _renderMinimapTerrain() {
    const N = 96, s = MAP.size, c = document.createElement('canvas'); c.width = c.height = N;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const wx = (i / N - 0.5) * s, wz = (j / N - 0.5) * s;
      const h = this.terrain.heightAt(wx, wz);
      let r, g, b;
      if (h > 4.5) { r = 120; g = 116; b = 108; }
      else if (h < -1) { r = 90; g = 78; b = 54; }
      else { const t = THREE.MathUtils.clamp((h + 2) / 8, 0, 1); r = 60 + t * 30; g = 100 + t * 40; b = 50 + t * 20; }
      const k = (j * N + i) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  _drawMinimap() {
    const ctx = this.mmCtx, W = this.mm.width, s = MAP.size;
    ctx.drawImage(this._mmTerrain, 0, 0, W, W);
    const toMM = (x, z) => [((x + s / 2) / s) * W, ((z + s / 2) / s) * W];
    // fog overlay
    ctx.save();
    for (let j = 0; j < this.fog.n; j += 1) {
      for (let i = 0; i < this.fog.n; i += 1) {
        const idx = j * this.fog.n + i;
        if (!this.fog.explored[idx]) { ctx.fillStyle = 'rgba(6,8,12,0.92)'; ctx.fillRect(i / this.fog.n * W, j / this.fog.n * W, W / this.fog.n + 1, W / this.fog.n + 1); }
        else if (!this.fog.visible[idx]) { ctx.fillStyle = 'rgba(6,8,12,0.4)'; ctx.fillRect(i / this.fog.n * W, j / this.fog.n * W, W / this.fog.n + 1, W / this.fog.n + 1); }
      }
    }
    ctx.restore();
    // resources
    ctx.fillStyle = '#2f5d33';
    for (const n of this.resField.nodes) { if (!n.alive) continue; if (n.kind !== 'tree') continue; const [mx, my] = toMM(n.pos.x, n.pos.z); ctx.fillRect(mx, my, 1.5, 1.5); }
    ctx.fillStyle = '#f2c84b';
    for (const n of this.resField.nodes) { if (!n.alive || n.kind !== 'gold') continue; const [mx, my] = toMM(n.pos.x, n.pos.z); ctx.fillRect(mx - 1, my - 1, 2.5, 2.5); }
    // buildings
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (b.team === TEAM.ENEMY && !this.fog.isExploredWorld(b.pos.x, b.pos.z)) continue;
      const [mx, my] = toMM(b.pos.x, b.pos.z);
      ctx.fillStyle = b.team === TEAM.PLAYER ? '#3da9fc' : '#ef5350';
      const sz = b.key === 'towncenter' ? 5 : 3;
      ctx.fillRect(mx - sz / 2, my - sz / 2, sz, sz);
    }
    // units
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.team === TEAM.ENEMY && !this.fog.isVisibleWorld(u.pos.x, u.pos.z)) continue;
      const [mx, my] = toMM(u.pos.x, u.pos.z);
      ctx.fillStyle = u.team === TEAM.PLAYER ? (u.kind === 'villager' ? '#8fd3ff' : '#3da9fc') : '#ef5350';
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    // camera view box
    const [cx, cy] = toMM(this.camTarget.x, this.camTarget.z);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
    const vw = (this.camDist / s) * W * 1.4;
    ctx.strokeRect(cx - vw / 2, cy - vw / 2, vw, vw);
  }

  _minimapTo(e) {
    const rect = this.mm.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fz = (e.clientY - rect.top) / rect.height;
    this.camTarget.x = THREE.MathUtils.clamp((fx - 0.5) * MAP.size, -MAP.size / 2, MAP.size / 2);
    this.camTarget.z = THREE.MathUtils.clamp((fz - 0.5) * MAP.size, -MAP.size / 2, MAP.size / 2);
    this._updateCamera();
  }

  // ---------------------------------------------------------------- player-facing button handlers
  onTrain(unitKey) { if (this.selectedBuilding) this.queueTrain(this.selectedBuilding, unitKey); }
  onBuild(key) { this.enterBuildMode(key); }
  onAdvance() { this.advanceAge(TEAM.PLAYER); }
  onAction(name) {
    if (name === 'stop') for (const u of this.selected) { u.path = null; u.target = null; u.gatherNode = null; u.buildTarget = null; u.attackMove = null; u.state = 'idle'; }
    if (name === 'hold') for (const u of this.selected) { u.holding = true; u.path = null; u.target = null; u.state = 'idle'; }
    if (name === 'rally' && this.selectedBuilding) this.hud.alert('Right-click the map to set a rally point.');
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
