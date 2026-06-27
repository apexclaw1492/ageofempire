import * as THREE from 'three';

// Deterministic value-noise so the world looks the same each load.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Generate a normal map from a height (grayscale) canvas via Sobel.
function heightToNormal(srcCanvas, strength = 2.0) {
  const size = srcCanvas.width;
  const sctx = srcCanvas.getContext('2d');
  const src = sctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const at = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    return src[(y * size + x) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const nz = 1.0;
      const len = Math.hypot(dx, dy, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function tex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function dataTex(c, repeat = 1) {
  const t = tex(c, repeat);
  t.colorSpace = THREE.NoColorSpace; // normal/rough maps are linear
  return t;
}

// ---- Grass ----
export function makeGrass(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(11);
  ctx.fillStyle = '#4f7a39'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const x = r() * size, y = r() * size;
    const g = 90 + r() * 70;
    ctx.fillStyle = `rgba(${g * 0.55 | 0},${g | 0},${g * 0.4 | 0},${0.18 + r() * 0.3})`;
    ctx.fillRect(x, y, 1 + r() * 1.5, 2 + r() * 3);
  }
  // patches
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${60 + r() * 30 | 0},${90 + r() * 40 | 0},40,0.12)`;
    ctx.beginPath(); ctx.arc(r() * size, r() * size, 10 + r() * 30, 0, 7); ctx.fill();
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const v = 80 + r() * 110;
    hctx.fillStyle = `rgb(${v},${v},${v})`;
    hctx.fillRect(r() * size, r() * size, 1, 2 + r() * 2);
  }
  return { map: tex(c), normal: dataTex(heightToNormal(h, 1.4)) };
}

// ---- Dirt / path ----
export function makeDirt(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(22);
  ctx.fillStyle = '#6b5235'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const v = 70 + r() * 70;
    ctx.fillStyle = `rgba(${v},${v * 0.78 | 0},${v * 0.5 | 0},${0.2 + r() * 0.4})`;
    ctx.beginPath(); ctx.arc(r() * size, r() * size, 1 + r() * 3, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(40,30,18,${0.1 + r() * 0.15})`;
    ctx.beginPath(); ctx.arc(r() * size, r() * size, 4 + r() * 14, 0, 7); ctx.fill();
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) { const v = 60 + r() * 130; hctx.fillStyle = `rgb(${v},${v},${v})`; hctx.beginPath(); hctx.arc(r() * size, r() * size, 1 + r() * 2.5, 0, 7); hctx.fill(); }
  return { map: tex(c), normal: dataTex(heightToNormal(h, 2.4)) };
}

// ---- Rock / cliff ----
export function makeRock(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(33);
  ctx.fillStyle = '#5d6066'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const v = 70 + r() * 90;
    ctx.fillStyle = `rgba(${v},${v + 4 | 0},${v + 10 | 0},${0.15 + r() * 0.4})`;
    ctx.beginPath(); ctx.arc(r() * size, r() * size, 1 + r() * 4, 0, 7); ctx.fill();
  }
  // cracks
  ctx.strokeStyle = 'rgba(25,28,32,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 30; i++) {
    ctx.beginPath(); let x = r() * size, y = r() * size; ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#7a7a7a'; hctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) { const v = 50 + r() * 150; hctx.fillStyle = `rgb(${v},${v},${v})`; hctx.beginPath(); hctx.arc(r() * size, r() * size, 1 + r() * 4, 0, 7); hctx.fill(); }
  return { map: tex(c), normal: dataTex(heightToNormal(h, 3.2)) };
}

// ---- Bark ----
export function makeBark(size = 128) {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(44);
  ctx.fillStyle = '#5a4129'; ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 2) {
    const v = 50 + r() * 50;
    ctx.fillStyle = `rgba(${v},${v * 0.7 | 0},${v * 0.45 | 0},0.5)`;
    ctx.fillRect(x + (r() - 0.5) * 3, 0, 1 + r() * 2, size);
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#808080'; hctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 2) { const v = 40 + r() * 150; hctx.fillStyle = `rgb(${v},${v},${v})`; hctx.fillRect(x, 0, 1 + r() * 2, size); }
  return { map: tex(c, 1), normal: dataTex(heightToNormal(h, 2.6), 1) };
}

// ---- Roof tiles ----
export function makeRoof(size = 128, base = '#8a3a2a') {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(55);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const rows = 8, step = size / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = -1; x < rows; x++) {
      const off = (y % 2) * step / 2;
      const px = x * step + off, py = y * step;
      const sh = 30 + r() * 40;
      ctx.fillStyle = `rgba(${sh + 90 | 0},${sh + 30 | 0},${sh | 0},0.5)`;
      ctx.beginPath(); ctx.ellipse(px + step / 2, py + step / 2, step * 0.52, step * 0.42, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    }
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#606060'; hctx.fillRect(0, 0, size, size);
  for (let y = 0; y < rows; y++) for (let x = -1; x < rows; x++) {
    const off = (y % 2) * step / 2;
    hctx.fillStyle = '#c8c8c8';
    hctx.beginPath(); hctx.ellipse(x * step + off + step / 2, y * step + step / 2, step * 0.5, step * 0.4, 0, 0, 7); hctx.fill();
  }
  return { map: tex(c, 1), normal: dataTex(heightToNormal(h, 2.2), 1) };
}

// ---- Plaster / wall ----
export function makePlaster(size = 128, base = '#cdbfa6') {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(66);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) { const v = r() * 40 - 20; ctx.fillStyle = `rgba(${110 + v | 0},${100 + v | 0},${80 + v | 0},0.15)`; ctx.fillRect(r() * size, r() * size, 2, 2); }
  for (let i = 0; i < 8; i++) { ctx.strokeStyle = 'rgba(60,50,40,0.2)'; ctx.beginPath(); let x = r() * size, y = r() * size; ctx.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; ctx.lineTo(x, y);} ctx.stroke(); }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#888'; hctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2000; i++) { const v = 100 + r() * 60; hctx.fillStyle = `rgb(${v},${v},${v})`; hctx.fillRect(r() * size, r() * size, 2, 2); }
  return { map: tex(c, 1), normal: dataTex(heightToNormal(h, 1.0), 1) };
}

// ---- Wood planks ----
export function makeWood(size = 128, base = '#7a5230') {
  const c = canvas(size), ctx = c.getContext('2d');
  const r = mulberry32(77);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  const planks = 5, pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const v = -15 + r() * 30;
    ctx.fillStyle = `rgb(${122 + v | 0},${82 + v | 0},${48 + v | 0})`;
    ctx.fillRect(p * pw, 0, pw - 1, size);
    for (let i = 0; i < 14; i++) { ctx.strokeStyle = `rgba(60,40,20,${0.1 + r() * 0.2})`; ctx.beginPath(); ctx.moveTo(p * pw, r() * size); ctx.bezierCurveTo(p * pw + pw * 0.3, r() * size, p * pw + pw * 0.7, r() * size, p * pw + pw, r() * size); ctx.stroke(); }
  }
  const h = canvas(size), hctx = h.getContext('2d');
  hctx.fillStyle = '#999'; hctx.fillRect(0, 0, size, size);
  for (let p = 1; p < planks; p++) { hctx.fillStyle = '#333'; hctx.fillRect(p * pw - 1, 0, 2, size); }
  return { map: tex(c, 1), normal: dataTex(heightToNormal(h, 1.8), 1) };
}

// Sky gradient texture for the scene background.
export function makeSky(size = 512) {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#9ec6e8');
  g.addColorStop(0.45, '#bcd8ec');
  g.addColorStop(0.7, '#dfe9ee');
  g.addColorStop(1, '#e9e2cf');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
