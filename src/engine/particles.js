import * as THREE from 'three';

function softSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// One pooled additive/normal particle system driving all transient FX.
export class Particles {
  constructor(scene, capacity = 2400) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, capacity);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softSprite() }, uPx: { value: innerHeight } },
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
        varying vec3 vC; varying float vA; uniform float uPx;
        void main(){
          vC=aColor; vA=aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPx / max(-mv.z, 0.001);
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){
          float a = texture2D(uTex, gl_PointCoord).a * vA;
          if(a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  _emit(x, y, z, vx, vy, vz, color, size, life, grav, drag) {
    const i = this.head; this.head = (this.head + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(color);
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = 1;
  }

  burst(x, y, z, opts = {}) {
    const { count = 12, color = 0xcdbb99, speed = 2.5, up = 1.5, size = 0.5, life = 0.8, spread = 1, grav = -3, drag = 2 } = opts;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * 6.28, r = Math.random() * spread;
      this._emit(x, y, z,
        Math.cos(a) * r * speed, up + Math.random() * up, Math.sin(a) * r * speed,
        color, size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), grav, drag);
    }
  }

  update(dt) {
    const n = this.cap;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = true; g.aAlpha.needsUpdate = true; g.aColor.needsUpdate = true; g.aSize.needsUpdate = true;
  }

  resize() { this.points.material.uniforms.uPx.value = innerHeight; }
}
