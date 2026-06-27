import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// Base path for bundled models (works in dev "/" and on GitHub Pages "/ageofempire/").
const BASE = (import.meta.env.BASE_URL || './').replace(/\/?$/, '/');
const url = (p) => BASE + 'models/' + p;

// ---- Manifest ---------------------------------------------------------------
const CHARACTERS = ['Knight', 'Rogue', 'Barbarian', 'Mage'];

// gameplay building key -> KayKit model base name (suffixed _blue / _red per team)
export const BUILDING_MODEL = {
  towncenter: 'building_castle',
  house: 'building_home_A',
  house_b: 'building_home_B',
  lumbercamp: 'building_lumbermill',
  mill: 'building_windmill',
  miningcamp: 'building_mine',
  barracks: 'building_barracks',
  archery: 'building_archeryrange',
  blacksmith: 'building_blacksmith',
  market: 'building_market',
  church: 'building_church',
  tower: 'building_tower_A',
  watchtower: 'building_tower_catapult',
};

// neutral construction / misc (no team color)
const NEUTRAL = ['building_scaffolding', 'building_stage_A', 'building_stage_B', 'building_stage_C',
  'building_destroyed', 'projectile_catapult', 'wall_straight', 'wall_corner_A_outside'];

const NATURE = ['tree_single_A', 'tree_single_B', 'trees_A_large', 'trees_A_medium', 'trees_A_small',
  'trees_B_large', 'trees_B_medium', 'trees_B_small', 'tree_single_A_cut', 'tree_single_B_cut',
  'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
  'mountain_A_grass', 'mountain_B_grass', 'mountain_C_grass'];

const PROPS = ['flag_blue', 'flag_red', 'barrel', 'bucket_arrows', 'crate_A_big', 'resource_stone'];

// Target sizes (world units) used to normalize wildly-varying source scales.
const CHAR_HEIGHT = 1.85;

export class AssetManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.char = {};       // name -> { scene(proto), animations, baseScale }
    this.building = {};   // "key_team" -> proto scene
    this.nature = {};     // name -> { scene, size }
    this.prop = {};
    this.neutral = {};
    this.clips = null;    // shared animation clips (from first character)
  }

  async loadAll(onProgress) {
    const jobs = [];
    const push = (label, p, fn) => jobs.push({ label, p, fn });

    for (const c of CHARACTERS) push(c, url(`characters/${c}.glb`), (g) => this._addChar(c, g));
    for (const [key, base] of Object.entries(BUILDING_MODEL)) {
      for (const team of ['blue', 'red']) {
        push(`${key}_${team}`, url(`medieval/buildings/${team}/${base}_${team}.gltf`),
          (g) => this._addBuilding(`${key}_${team}`, g));
      }
    }
    for (const n of NEUTRAL) push(n, url(`medieval/buildings/neutral/${n}.gltf`), (g) => this._addNeutral(n, g));
    for (const n of NATURE) push(n, url(`medieval/decoration/nature/${n}.gltf`), (g) => this._addNature(n, g));
    for (const n of PROPS) push(n, url(`medieval/decoration/props/${n}.gltf`), (g) => this._addProp(n, g));

    let done = 0;
    // load with limited concurrency for snappy progress
    const queue = jobs.slice();
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const job = queue.shift();
        try {
          const g = await this.loader.loadAsync(job.p);
          job.fn(g);
        } catch (e) {
          console.warn('asset load failed:', job.label, e.message);
        }
        done++;
        if (onProgress) onProgress(done / jobs.length, job.label);
      }
    });
    await Promise.all(workers);
    return this;
  }

  _prep(scene, { shadow = true } = {}) {
    scene.traverse(o => {
      if (o.isMesh) {
        o.castShadow = shadow;
        o.receiveShadow = shadow;
        if (o.material) {
          o.material.metalness = Math.min(o.material.metalness ?? 0, 0.1);
          o.material.roughness = Math.max(o.material.roughness ?? 1, 0.65);
        }
      }
    });
  }

  _addChar(name, g) {
    const scene = g.scene;
    this._prep(scene);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y || 1;
    const baseScale = CHAR_HEIGHT / h;
    if (!this.clips) this.clips = g.animations;          // shared rig — reuse across all chars
    this.char[name] = { scene, animations: g.animations, baseScale, minY: box.min.y };
  }

  _addBuilding(id, g) {
    const scene = g.scene;
    this._prep(scene);
    this.building[id] = scene;
  }
  _addNeutral(name, g) { this._prep(g.scene); this.neutral[name] = g.scene; }
  _addProp(name, g) { this._prep(g.scene); this.prop[name] = g.scene; }
  _addNature(name, g) {
    const scene = g.scene; this._prep(scene);
    const box = new THREE.Box3().setFromObject(scene);
    this.nature[name] = { scene, size: new THREE.Vector3().subVectors(box.max, box.min), minY: box.min.y };
  }

  // ---- instancing helpers --------------------------------------------------
  // Animated character clone (independent skeleton).
  makeCharacter(name) {
    const proto = this.char[name] || this.char.Knight;
    const root = skeletonClone(proto.scene);
    const wrap = new THREE.Group();
    root.scale.setScalar(proto.baseScale);
    root.position.y = -proto.minY * proto.baseScale;
    wrap.add(root);
    return { object: wrap, inner: root, animations: this.clips, scale: proto.baseScale };
  }

  // Static model clone (buildings, nature, props). Returns a Group with model centered on x/z, sitting on y=0.
  makeBuilding(key, team) {
    const id = `${key}_${team === 1 ? 'red' : 'blue'}`;
    const proto = this.building[id] || this.building[`barracks_${team === 1 ? 'red' : 'blue'}`];
    return proto ? proto.clone(true) : new THREE.Group();
  }
  makeNeutral(name) { const p = this.neutral[name]; return p ? p.clone(true) : new THREE.Group(); }
  makeProp(name) { const p = this.prop[name]; return p ? p.clone(true) : new THREE.Group(); }
  makeNature(name) {
    const p = this.nature[name]; if (!p) return { object: new THREE.Group(), size: new THREE.Vector3(1,1,1) };
    const o = p.scene.clone(true);
    o.position.y = -p.minY;
    return { object: o, size: p.size.clone() };
  }
  natureNames(filter) { return Object.keys(this.nature).filter(n => !filter || filter.test(n)); }

  // Bake a single-mesh model into a standalone geometry (+material) sized to a
  // target height, resting on y=0 — ready for InstancedMesh. `src` is 'nature'|'prop'.
  bakedModel(name, targetHeight, { tint = null, src = 'nature' } = {}) {
    const proto = (src === 'prop' ? this.prop[name] : (this.nature[name] && this.nature[name].scene));
    if (!proto) return null;
    proto.updateWorldMatrix(true, true);
    let mesh = null;
    proto.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    if (!mesh) return null;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const h = (geo.boundingBox.max.y - geo.boundingBox.min.y) || 1;
    const s = targetHeight / h;
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox.min.y, 0);
    geo.computeBoundingBox();
    const size = new THREE.Vector3(); geo.boundingBox.getSize(size);
    let mat = mesh.material;
    if (tint) { mat = mat.clone(); mat.color = new THREE.Color(tint); if (mat.emissive) { mat.emissive = new THREE.Color(tint).multiplyScalar(0.12); } }
    return { geometry: geo, material: mat, size };
  }

  // Find a clip by fuzzy name across the shared set.
  clip(name) {
    if (!this.clips) return null;
    return this.clips.find(c => c.name === name)
      || this.clips.find(c => c.name.toLowerCase().includes(name.toLowerCase()))
      || null;
  }
}

export const assets = new AssetManager();
