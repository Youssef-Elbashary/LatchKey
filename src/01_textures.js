// ---------------------------------------------------------------------------
// procedural textures (canvas → THREE.CanvasTexture). Everything is generated at load.
// ---------------------------------------------------------------------------
const TEX = {};
let MAX_ANISO = 8;

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }

function canvasTex(c, { srgb = true, wrap = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? MAX_ANISO : 1;
  t.needsUpdate = true;
  return t;
}

// tileable value-noise fBm, returns Float32Array in [0,1]
function noise2(w, h, cellsX, cellsY, octaves, seed, persist = 0.5) {
  const out = new Float32Array(w * h);
  const r = mulberry32(seed);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = Math.max(1, Math.round(cellsX * 2 ** o)), cy = Math.max(1, Math.round(cellsY * 2 ** o));
    const g = new Float32Array(cx * cy);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < h; y++) {
      const gy = y / h * cy, y0 = gy | 0, fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % cy) * cx, r1 = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < w; x++) {
        const gx = x / w * cx, x0 = gx | 0, fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % cx, c1 = (x0 + 1) % cx;
        const a = g[r0 + c0], b = g[r0 + c1], c = g[r1 + c0], d = g[r1 + c1];
        const top = a + (b - a) * sx;
        out[y * w + x] += (top + (c + (d - c) * sx - top) * sy) * amp;
      }
    }
    norm += amp; amp *= persist;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

// height field → tangent-space normal map (OpenGL convention, canvas is flipped on upload)
function normalTex(hf, w, h, strength) {
  const c = makeCanvas(w, h), x2 = ctx2d(c), img = x2.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w, yd = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const dx = (hf[yr + (x + 1) % w] - hf[yr + (x - 1 + w) % w]) * strength;
      const dy = (hf[yd + x] - hf[yu + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = 1 / Math.hypot(nx, ny, nz);
      const i = (yr + x) * 4;
      d[i] = (nx * l * 0.5 + 0.5) * 255; d[i + 1] = (ny * l * 0.5 + 0.5) * 255; d[i + 2] = (nz * l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  x2.putImageData(img, 0, 0);
  return canvasTex(c, { srgb: false });
}

function grayTex(values, w, h) {
  const c = makeCanvas(w, h), x2 = ctx2d(c), img = x2.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) { const v = clamp(values[i], 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x2.putImageData(img, 0, 0);
  return canvasTex(c, { srgb: false });
}

function heightFromCanvas(c) {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data, hf = new Float32Array(c.width * c.height);
  for (let i = 0; i < hf.length; i++) hf[i] = d[i * 4] / 255;
  return hf;
}

// per-pixel painter: fn(x, y, i, out[3]) with values 0..1 (sRGB)
function paintPixels(c, fn) {
  const x2 = ctx2d(c), w = c.width, h = c.height, img = x2.createImageData(w, h), d = img.data, o = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; fn(x, y, i, o);
    d[i * 4] = clamp(o[0], 0, 1) * 255; d[i * 4 + 1] = clamp(o[1], 0, 1) * 255; d[i * 4 + 2] = clamp(o[2], 0, 1) * 255; d[i * 4 + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
}

// overlay grain + vignette on an existing canvas (for photos)
function filmify(c, amount = 0.12, warm = true) {
  const x2 = ctx2d(c), w = c.width, h = c.height, img = x2.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (d[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * amount * 255;
    const vx = x / w - 0.5, vy = y / h - 0.5, v = 1 - (vx * vx + vy * vy) * 0.9;
    let r = d[i] * v + n, g = d[i + 1] * v + n, b = d[i + 2] * v + n;
    if (warm) { r = r * 0.92 + 22; g = g * 0.9 + 14; b = b * 0.78 + 4; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  x2.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------
function genWoodFloor({ seed = 11, size = 1024, planks = 8, base = [0.44, 0.27, 0.15] } = {}) {
  const w = size, h = size, ph = h / planks, r = mulberry32(seed);
  const grain = noise2(w, h, 2, 64, 4, seed + 1, 0.55);
  const fine = noise2(w, h, 48, 160, 2, seed + 2, 0.5);
  const wear = noise2(w, h, 3, 3, 3, seed + 3, 0.5);
  const rows = [];
  for (let i = 0; i < planks; i++) rows.push({ j0: r() * w, split: w * (0.35 + r() * 0.3), t: [r(), r()] });
  const map = makeCanvas(w, h), rough = new Float32Array(w * h), hf = new Float32Array(w * h);
  paintPixels(map, (x, y, i, o) => {
    const row = Math.min(planks - 1, (y / ph) | 0), yIn = y - row * ph, R = rows[row];
    const rel = (((x - R.j0) % w) + w) % w;
    const board = rel < R.split ? 0 : 1, tone = R.t[board];
    const dj = Math.min(rel, Math.abs(rel - R.split), w - rel);
    const g = grain[y * w + ((x + board * 331 + row * 97) % w)];
    const ring = Math.sin((g * 9 + yIn / ph * 2.2 + tone * 6) * TAU) * 0.5 + 0.5;
    const lum = 0.6 + tone * 0.32 + (g - 0.5) * 0.6 + ring * 0.12 + (fine[i] - 0.5) * 0.14;
    const edge = Math.min(yIn, ph - 1 - yIn);
    let gap = edge < 1.5 ? 1 : edge < 4 ? 0.45 * (1 - (edge - 1.5) / 2.5) : 0;
    if (dj < 1.5) gap = 1; else if (dj < 3.5) gap = Math.max(gap, 0.45 * (1 - (dj - 1.5) / 2));
    const wr = smooth(0.48, 0.78, wear[i]);
    let cr = base[0] * lum, cg = base[1] * lum, cb = base[2] * lum;
    cr = lerp(cr, 0.52 * lum, wr * 0.35); cg = lerp(cg, 0.38 * lum, wr * 0.35); cb = lerp(cb, 0.27 * lum, wr * 0.35);
    const k = 1 - gap * 0.82;
    o[0] = cr * k; o[1] = cg * k; o[2] = cb * k;
    rough[i] = 0.36 + wr * 0.34 + (fine[i] - 0.5) * 0.12 + gap * 0.6;
    hf[i] = 1 - gap * 0.9 + (g - 0.5) * 0.08;
  });
  return { map: canvasTex(map), roughnessMap: grayTex(rough, w, h), normalMap: normalTex(hf, w, h, 2.5) };
}

function drawFleur(x2, x, y, s, col, alpha = 0.6) {
  x2.save(); x2.translate(x, y); x2.fillStyle = col; x2.globalAlpha = alpha;
  x2.beginPath(); x2.moveTo(0, -s);
  x2.bezierCurveTo(s * 0.35, -s * 0.5, s * 0.25, -s * 0.02, 0, s * 0.15);
  x2.bezierCurveTo(-s * 0.25, -s * 0.02, -s * 0.35, -s * 0.5, 0, -s); x2.fill();
  for (const k of [-1, 1]) {
    x2.beginPath(); x2.moveTo(0, s * 0.08);
    x2.bezierCurveTo(k * s * 0.62, -s * 0.08, k * s * 0.9, -s * 0.58, k * s * 0.46, -s * 0.64);
    x2.bezierCurveTo(k * s * 0.74, -s * 0.36, k * s * 0.42, -s * 0.02, 0, s * 0.22); x2.fill();
    x2.beginPath(); x2.arc(k * s * 0.58, s * 0.5, s * 0.07, 0, TAU); x2.fill();
  }
  x2.fillRect(-s * 0.32, s * 0.2, s * 0.64, s * 0.07);
  x2.beginPath(); x2.moveTo(-s * 0.12, s * 0.27); x2.quadraticCurveTo(0, s * 0.8, s * 0.12, s * 0.27); x2.fill();
  x2.restore();
}

function genWallpaper(seed = 21) {
  const w = 512, h = 1024, c = makeCanvas(w, h), x2 = ctx2d(c);
  const stripes = 6, sw = w / stripes;
  for (let s = 0; s < stripes; s++) { x2.fillStyle = s % 2 ? '#8b9478' : '#a5a789'; x2.fillRect(s * sw, 0, sw, h); }
  x2.fillStyle = '#c4bf9d'; for (let s = 0; s <= stripes; s++) x2.fillRect(s * sw - 1.5, 0, 3, h);
  const rows = 14, mh = h / rows;
  for (let s = 1; s < stripes; s += 2) for (let m = -1; m <= rows; m++) drawFleur(x2, s * sw + sw / 2, m * mh + mh / 2 + (s % 4 === 1 ? 0 : mh / 2), sw * 0.3, '#727b5f');
  for (let s = 0; s < stripes; s += 2) for (let m = 0; m <= rows * 2; m++) { x2.fillStyle = '#b9b796'; x2.globalAlpha = 0.5; x2.beginPath(); x2.arc(s * sw + sw / 2, m * mh / 2, 2.2, 0, TAU); x2.fill(); }
  x2.globalAlpha = 1;
  const img = x2.getImageData(0, 0, w, h), d = img.data;
  const n = noise2(w, h, 4, 8, 5, seed, 0.55), n2 = noise2(w, h, 24, 48, 3, seed + 1, 0.5), st = noise2(w, h, 3, 5, 4, seed + 2, 0.55);
  const hf = new Float32Array(w * h), rough = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, p = i * 4, v = y / h;
    let r = d[p] / 255, g = d[p + 1] / 255, b = d[p + 2] / 255;
    hf[i] = (r + g + b) / 3 * 0.25;
    const age = 0.86 + n[i] * 0.16 + (n2[i] - 0.5) * 0.08;
    r = lerp(r, 0.78, 0.18) * age; g = lerp(g, 0.72, 0.18) * age; b = lerp(b, 0.55, 0.22) * age;
    const mask = st[i] + (1 - v / 0.42) * 0.5;               // water stain creeping from the ceiling
    if (mask > 0.74) {
      const tide = mask < 0.77 ? 0.62 : 0.8;
      r *= tide + 0.06; g *= tide - 0.02; b *= tide - 0.14;
    }
    const grime = smooth(0.62, 1.0, v) * 0.22 + smooth(0.3, 0.0, v) * 0.12;
    r *= 1 - grime; g *= 1 - grime; b *= 1 - grime * 1.1;
    const seam = x < 2 || x > w - 3 ? 0.78 : (x < 4 ? 1.08 : 1);
    d[p] = clamp(r * seam, 0, 1) * 255; d[p + 1] = clamp(g * seam, 0, 1) * 255; d[p + 2] = clamp(b * seam, 0, 1) * 255;
    hf[i] += seam < 1 ? -0.2 : 0;
    rough[i] = 0.82 + (n2[i] - 0.5) * 0.1;
  }
  x2.putImageData(img, 0, 0);
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 1.6), roughnessMap: grayTex(rough, w, h) };
}

function genBeadboard(seed = 31) {
  const w = 512, h = 512, boards = 8, bw = w / boards;
  const n = noise2(w, h, 6, 6, 4, seed), chip = noise2(w, h, 12, 12, 4, seed + 1, 0.6), fine = noise2(w, h, 64, 64, 2, seed + 2);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h), rough = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const xb = x % bw, edge = Math.min(xb, bw - 1 - xb), v = y / h;
    const groove = edge < 2 ? 1 : edge < 5 ? (5 - edge) / 3 * 0.5 : 0;
    const bead = xb > bw * 0.1 && xb < bw * 0.2 ? Math.sin((xb - bw * 0.1) / (bw * 0.1) * Math.PI) : 0;
    const chipped = chip[i] > 0.72 ? 1 : 0;
    let r = 0.8, g = 0.76, b = 0.66;
    r *= 0.92 + n[i] * 0.12; g *= 0.92 + n[i] * 0.12; b *= 0.9 + n[i] * 0.1;
    if (chipped) { r = 0.32 + fine[i] * 0.1; g = 0.22 + fine[i] * 0.08; b = 0.14; }
    const grime = smooth(0.55, 1, v) * 0.3;
    const k = (1 - groove * 0.55) * (1 - grime);
    o[0] = r * k; o[1] = g * k; o[2] = b * k * 0.96;
    hf[i] = 1 - groove * 0.8 + bead * 0.25 - chipped * 0.15;
    rough[i] = chipped ? 0.85 : 0.42 + fine[i] * 0.12 + grime * 0.4;
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 3), roughnessMap: grayTex(rough, w, h) };
}

function genPlaster(seed = 41, tint = [0.74, 0.72, 0.66]) {
  const w = 512, h = 512, n = noise2(w, h, 6, 6, 5, seed, 0.55), f = noise2(w, h, 64, 64, 2, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const k = 0.9 + n[i] * 0.14 + (f[i] - 0.5) * 0.05;
    o[0] = tint[0] * k; o[1] = tint[1] * k; o[2] = tint[2] * k;
    hf[i] = n[i] * 0.6 + f[i] * 0.4;
  });
  const x2 = ctx2d(c), r = mulberry32(seed + 9);
  x2.strokeStyle = 'rgba(40,36,30,0.55)';
  for (let k = 0; k < 5; k++) {
    let x = r() * w, y = r() * h, a = r() * TAU;
    x2.lineWidth = 0.8 + r() * 0.8; x2.beginPath(); x2.moveTo(x, y);
    for (let s = 0; s < 40; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 6; y += Math.sin(a) * 6; x2.lineTo(x, y); }
    x2.stroke();
  }
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 1.2) };
}

function genPaint(seed = 51) {
  const w = 512, h = 512, n = noise2(w, h, 5, 5, 5, seed, 0.55), roll = noise2(w, h, 32, 2, 2, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h), rough = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const k = 0.88 + n[i] * 0.16 + (roll[i] - 0.5) * 0.04;
    o[0] = o[1] = o[2] = k;
    hf[i] = roll[i] * 0.4 + n[i] * 0.2;
    rough[i] = 0.8 + (n[i] - 0.5) * 0.15;
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 0.8), roughnessMap: grayTex(rough, w, h) };
}

function genCarpet(seed = 61) {
  const w = 512, h = 512, a = noise2(w, h, 128, 128, 2, seed), b = noise2(w, h, 6, 6, 4, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const k = 0.62 + a[i] * 0.42 + (b[i] - 0.5) * 0.3;
    o[0] = o[1] = o[2] = k;
    hf[i] = a[i];
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 2) };
}

function genTiles({ seed = 71, n = 6, base = [0.84, 0.83, 0.79], grout = [0.36, 0.35, 0.32], gloss = 0.18, cracks = 2 } = {}) {
  const w = 512, h = 512, ts = w / n, gw = 3.5;
  const v = noise2(w, h, 8, 8, 4, seed), dirt = noise2(w, h, 16, 16, 3, seed + 1, 0.6), r = mulberry32(seed + 2);
  const tone = []; for (let i = 0; i < n * n; i++) tone.push(0.94 + r() * 0.1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h), rough = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const tx = x % ts, ty = y % ts, e = Math.min(tx, ts - tx, ty, ts - ty);
    const gr = e < gw ? 1 : 0, bevel = e < gw + 3 ? 1 - (e - gw) / 3 : 0;
    const t = tone[((y / ts) | 0) * n + ((x / ts) | 0)];
    if (gr) { const k = 0.8 + dirt[i] * 0.4; o[0] = grout[0] * k; o[1] = grout[1] * k; o[2] = grout[2] * k * 0.95; }
    else { const k = t * (0.95 + v[i] * 0.08) * (1 - bevel * 0.08); o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k; }
    hf[i] = gr ? 0 : 1 - Math.max(0, bevel) * 0.3;
    rough[i] = gr ? 0.9 : gloss + dirt[i] * 0.15;
  });
  const x2 = ctx2d(c); x2.strokeStyle = 'rgba(30,28,25,0.7)'; x2.lineWidth = 1;
  for (let k = 0; k < cracks; k++) {
    const tx = ((r() * n) | 0) * ts, ty = ((r() * n) | 0) * ts;
    let x = tx + r() * ts, y = ty; x2.beginPath(); x2.moveTo(x, y);
    while (y < ty + ts) { x += (r() - 0.5) * 10; y += 6 + r() * 6; x2.lineTo(x, y); }
    x2.stroke();
  }
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 3), roughnessMap: grayTex(rough, w, h) };
}

function genLinoleum(seed = 81) {
  const w = 512, h = 512, half = w / 2, n = noise2(w, h, 8, 8, 4, seed), s = noise2(w, h, 3, 40, 3, seed + 1);
  const c = makeCanvas(w, h), rough = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const chk = ((x / half | 0) + (y / half | 0)) % 2;
    const base = chk ? [0.78, 0.74, 0.62] : [0.5, 0.27, 0.21];
    const scuff = s[i] > 0.7 ? 0.82 : 1, k = (0.9 + n[i] * 0.14) * scuff;
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
    rough[i] = 0.42 + n[i] * 0.2 + (scuff < 1 ? 0.2 : 0);
  });
  return { map: canvasTex(c), roughnessMap: grayTex(rough, w, h) };
}

function genGrain(seed = 91) {
  const w = 512, h = 512, g = noise2(w, h, 2, 48, 4, seed, 0.55), f = noise2(w, h, 32, 128, 2, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const ring = Math.sin((g[i] * 10 + y / h * 3) * TAU) * 0.5 + 0.5;
    const k = 0.7 + (g[i] - 0.5) * 0.5 + ring * 0.12 + (f[i] - 0.5) * 0.12;
    o[0] = k; o[1] = k * 0.86; o[2] = k * 0.74;
    hf[i] = g[i] * 0.5 + f[i] * 0.2;
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 1.5) };
}

function genFabric(seed = 101) {
  const w = 256, h = 256, n = noise2(w, h, 6, 6, 4, seed), f = noise2(w, h, 64, 64, 1, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
    const k = 0.72 + weave * 0.12 + (n[i] - 0.5) * 0.22 + (f[i] - 0.5) * 0.08;
    o[0] = o[1] = o[2] = k; hf[i] = weave;
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 1.5) };
}

function genRug(seed = 111) {
  const w = 512, h = 512, n = noise2(w, h, 8, 8, 4, seed), f = noise2(w, h, 96, 96, 2, seed + 1), wear = noise2(w, h, 2, 6, 3, seed + 2);
  const c = makeCanvas(w, h);
  const red = [0.42, 0.13, 0.12], navy = [0.13, 0.17, 0.27], cream = [0.74, 0.65, 0.48], gold = [0.6, 0.45, 0.2];
  paintPixels(c, (x, y, i, o) => {
    const v = y / h, u = x / w;
    let col = red;
    const dv = Math.min(v, 1 - v);
    if (dv < 0.08) col = navy; else if (dv < 0.1) col = cream; else if (dv < 0.17) col = (((u * 18) | 0) % 2) ? gold : navy; else if (dv < 0.19) col = cream;
    else {
      const cu = Math.abs((u * 2) % 1 - 0.5), cv = Math.abs(v - 0.5);
      const dia = cu + cv * 1.4;
      if (dia < 0.12) col = cream; else if (dia < 0.2) col = navy; else if (dia < 0.23) col = gold;
      else if (Math.abs(dia - 0.42) < 0.02) col = navy;
    }
    const wv = smooth(0.25, 0.0, Math.abs(v - 0.5)) * smooth(0.4, 0.7, wear[i]) * 0.35;
    const k = (0.85 + n[i] * 0.2 + (f[i] - 0.5) * 0.2) * (1 + wv * 0.4);
    o[0] = lerp(col[0], 0.5, wv) * k; o[1] = lerp(col[1], 0.42, wv) * k; o[2] = lerp(col[2], 0.36, wv) * k;
  });
  return { map: canvasTex(c) };
}

function genWool(seed = 121) {
  const w = 256, h = 256, n = noise2(w, h, 8, 8, 4, seed), f = noise2(w, h, 128, 128, 1, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => { const k = 0.6 + n[i] * 0.3 + (f[i] - 0.5) * 0.3; o[0] = o[1] = o[2] = k; hf[i] = f[i]; });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 2) };
}

function genSkin(seed = 131) {
  const w = 512, h = 512, n = noise2(w, h, 6, 6, 5, seed, 0.55), f = noise2(w, h, 48, 48, 3, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const k = 0.84 + n[i] * 0.14;
    o[0] = 0.8 * k; o[1] = 0.76 * k; o[2] = 0.74 * k;
    if (n[i] > 0.66) { o[0] *= 0.93; o[1] *= 0.9; o[2] *= 0.95; }
    hf[i] = f[i] * 0.6 + n[i] * 0.4;
  });
  const x2 = ctx2d(c), r = mulberry32(seed + 5);
  x2.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = r() * w, y = r() * h, a = r() * TAU, wd = 1.6 + r() * 1.6;
    x2.strokeStyle = `rgba(${70 + r() * 30 | 0},${70 + r() * 20 | 0},${110 + r() * 30 | 0},0.28)`;
    for (let s = 0; s < 30; s++) {
      x2.lineWidth = wd; x2.beginPath(); x2.moveTo(x, y);
      a += (r() - 0.5) * 0.7; x += Math.cos(a) * 7; y += Math.sin(a) * 7; x2.lineTo(x, y); x2.stroke();
      wd *= 0.97;
      if (r() < 0.08) { const bx = x, by = y, ba = a + (r() < 0.5 ? 0.8 : -0.8); x2.lineWidth = wd * 0.6; x2.beginPath(); x2.moveTo(bx, by); x2.lineTo(bx + Math.cos(ba) * 30, by + Math.sin(ba) * 30); x2.stroke(); }
    }
  }
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 1.4) };
}

function genHair(seed = 141) {
  const w = 256, h = 512, c = makeCanvas(w, h), x2 = ctx2d(c), r = mulberry32(seed);
  x2.clearRect(0, 0, w, h); x2.lineCap = 'round';
  for (let k = 0; k < 420; k++) {
    const x0 = r() * w, len = h * (0.55 + r() * 0.45), sway = (r() - 0.5) * 18, l = 8 + r() * 20;
    x2.strokeStyle = `rgba(${l | 0},${(l * 0.85) | 0},${(l * 0.75) | 0},${0.75 + r() * 0.25})`;
    x2.lineWidth = 1 + r() * 2.2;
    x2.beginPath(); x2.moveTo(x0, 0);
    x2.bezierCurveTo(x0 + sway, len * 0.35, x0 - sway, len * 0.7, x0 + sway * 0.5, len); x2.stroke();
  }
  return { map: canvasTex(c, { wrap: false }) };
}

function genCrumple(seed = 151) {
  const w = 256, h = 256, a = noise2(w, h, 3, 3, 3, seed), b = noise2(w, h, 7, 7, 2, seed + 1);
  const hf = new Float32Array(w * h);
  for (let i = 0; i < hf.length; i++) hf[i] = Math.abs(a[i] - 0.5) * 1.4 + Math.abs(b[i] - 0.5) * 0.6;
  return normalTex(hf, w, h, 6);
}

// ---------------------------------------------------------------------------
// faces + photos
// ---------------------------------------------------------------------------
// Mom's face as in an old flash photo. (cx, cy) = face centre, s = face height.
function paintMomFace(x2, cx, cy, s, { cutEyes = false } = {}) {
  x2.save();
  const X = dx => cx + dx * s, Y = dy => cy + dy * s;
  const rg = (x, y, r0, r1, stops) => { const g = x2.createRadialGradient(X(x), Y(y), r0 * s, X(x), Y(y), r1 * s); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  // long hair behind, falling past the shoulders
  let g = x2.createLinearGradient(cx, Y(-0.62), cx, Y(0.8)); g.addColorStop(0, '#3b2619'); g.addColorStop(0.5, '#2a1a10'); g.addColorStop(1, '#1a100a');
  x2.fillStyle = g;
  x2.beginPath(); x2.moveTo(X(0.02), Y(-0.6));
  x2.bezierCurveTo(X(-0.56), Y(-0.6), X(-0.6), Y(0.05), X(-0.55), Y(0.8)); x2.lineTo(X(0.55), Y(0.8));
  x2.bezierCurveTo(X(0.62), Y(0.05), X(0.56), Y(-0.6), X(0.02), Y(-0.6)); x2.fill();
  // neck + a sliver of collar
  g = x2.createLinearGradient(cx, Y(0.34), cx, Y(0.8)); g.addColorStop(0, '#8e5a42'); g.addColorStop(0.25, '#c48c6c'); g.addColorStop(1, '#b07a5c');
  x2.fillStyle = g; x2.beginPath(); x2.moveTo(X(-0.13), Y(0.3)); x2.lineTo(X(0.13), Y(0.3)); x2.lineTo(X(0.16), Y(0.8)); x2.lineTo(X(-0.16), Y(0.8)); x2.fill();
  x2.fillStyle = '#3f7c78'; x2.beginPath(); x2.moveTo(X(-0.5), Y(0.8)); x2.lineTo(X(-0.16), Y(0.66)); x2.lineTo(cx, Y(0.78)); x2.lineTo(X(0.16), Y(0.66)); x2.lineTo(X(0.5), Y(0.8)); x2.fill();
  // face: wider cheekbones, tapering jaw
  const face = new Path2D();
  face.moveTo(cx, Y(-0.5));
  face.bezierCurveTo(X(0.27), Y(-0.5), X(0.36), Y(-0.3), X(0.355), Y(-0.06));
  face.bezierCurveTo(X(0.35), Y(0.16), X(0.29), Y(0.32), X(0.16), Y(0.42));
  face.bezierCurveTo(X(0.09), Y(0.48), X(-0.09), Y(0.48), X(-0.16), Y(0.42));
  face.bezierCurveTo(X(-0.29), Y(0.32), X(-0.35), Y(0.16), X(-0.355), Y(-0.06));
  face.bezierCurveTo(X(-0.36), Y(-0.3), X(-0.27), Y(-0.5), cx, Y(-0.5));
  x2.fillStyle = rg(-0.05, -0.1, 0.04, 0.6, [[0, '#f6dcc4'], [0.5, '#e6b897'], [1, '#a9735a']]);
  x2.fill(face);
  x2.save(); x2.clip(face);
  x2.fillStyle = rg(0, 0, 0.22, 0.56, [[0, 'rgba(90,45,30,0)'], [1, 'rgba(90,45,30,0.45)']]); x2.fillRect(X(-0.5), Y(-0.6), s, s * 1.2);
  for (const k of [-1, 1]) {
    x2.fillStyle = rg(k * 0.16, -0.06, 0.02, 0.13, [[0, 'rgba(110,60,45,0.32)'], [1, 'rgba(110,60,45,0)']]); x2.fillRect(X(-0.5), Y(-0.4), s, s * 0.7);
    x2.fillStyle = rg(k * 0.21, 0.12, 0.0, 0.13, [[0, 'rgba(225,120,105,0.32)'], [1, 'rgba(225,120,105,0)']]); x2.fillRect(X(-0.5), Y(-0.2), s, s * 0.6);
    x2.fillStyle = rg(k * 0.2, -0.0, 0.0, 0.06, [[0, 'rgba(255,240,225,0.35)'], [1, 'rgba(255,240,225,0)']]); x2.fillRect(X(-0.5), Y(-0.2), s, s * 0.5);
  }
  x2.fillStyle = 'rgba(255,245,230,0.3)'; x2.beginPath(); x2.ellipse(X(-0.005), Y(0.02), s * 0.022, s * 0.12, 0, 0, TAU); x2.fill();
  x2.fillStyle = rg(0.05, 0.04, 0.0, 0.08, [[0, 'rgba(120,70,50,0.35)'], [1, 'rgba(120,70,50,0)']]); x2.fillRect(X(-0.2), Y(-0.1), s * 0.4, s * 0.3);
  x2.strokeStyle = 'rgba(120,65,50,0.28)'; x2.lineWidth = s * 0.012;
  for (const k of [-1, 1]) { x2.beginPath(); x2.moveTo(X(k * 0.075), Y(0.12)); x2.quadraticCurveTo(X(k * 0.16), Y(0.2), X(k * 0.15), Y(0.3)); x2.stroke(); }
  x2.restore();
  // ears + earrings
  for (const k of [-1, 1]) {
    x2.fillStyle = '#c98e70'; x2.beginPath(); x2.ellipse(X(k * 0.36), Y(0.0), s * 0.035, s * 0.07, 0, 0, TAU); x2.fill();
    x2.fillStyle = '#e8c56a'; x2.beginPath(); x2.arc(X(k * 0.365), Y(0.085), s * 0.012, 0, TAU); x2.fill();
  }
  // brows
  x2.fillStyle = '#3a2418';
  for (const k of [-1, 1]) {
    x2.beginPath(); x2.moveTo(X(k * 0.06), Y(-0.14)); x2.quadraticCurveTo(X(k * 0.16), Y(-0.22), X(k * 0.27), Y(-0.16));
    x2.quadraticCurveTo(X(k * 0.16), Y(-0.19), X(k * 0.06), Y(-0.115)); x2.fill();
  }
  // eyes (kept even when cut: the hole is cut through them)
  for (const k of [-1, 1]) {
    const ex = X(k * 0.16), ey = Y(-0.06);
    x2.fillStyle = '#f1ebe4'; x2.beginPath(); x2.ellipse(ex, ey, s * 0.072, s * 0.032, 0, 0, TAU); x2.fill();
    x2.fillStyle = '#4a2f1c'; x2.beginPath(); x2.arc(ex + k * s * 0.004, ey, s * 0.027, 0, TAU); x2.fill();
    x2.fillStyle = '#111'; x2.beginPath(); x2.arc(ex + k * s * 0.004, ey, s * 0.012, 0, TAU); x2.fill();
    x2.fillStyle = '#fff'; x2.beginPath(); x2.arc(ex - s * 0.008, ey - s * 0.01, s * 0.006, 0, TAU); x2.fill();
    x2.strokeStyle = '#2b1a10'; x2.lineWidth = s * 0.013; x2.beginPath(); x2.ellipse(ex, ey + s * 0.004, s * 0.077, s * 0.038, 0, Math.PI * 1.02, Math.PI * 1.98); x2.stroke();
    x2.strokeStyle = 'rgba(120,70,55,0.35)'; x2.lineWidth = s * 0.008; x2.beginPath(); x2.ellipse(ex, ey + s * 0.012, s * 0.07, s * 0.04, 0, Math.PI * 0.15, Math.PI * 0.85); x2.stroke();
  }
  // nose tip + nostrils
  x2.fillStyle = 'rgba(105,55,42,0.55)';
  for (const k of [-1, 1]) { x2.beginPath(); x2.ellipse(X(k * 0.032), Y(0.13), s * 0.017, s * 0.009, k * 0.3, 0, TAU); x2.fill(); }
  x2.fillStyle = 'rgba(255,240,225,0.4)'; x2.beginPath(); x2.arc(X(0.0), Y(0.095), s * 0.018, 0, TAU); x2.fill();
  // mouth: a wide photographed smile
  const my = Y(0.245), mw = 0.15;
  x2.fillStyle = '#8f3a3e';
  x2.beginPath(); x2.moveTo(X(-mw), my - s * 0.01);
  x2.bezierCurveTo(X(-mw * 0.5), my - s * 0.04, X(-0.02), my - s * 0.03, cx, my - s * 0.02);
  x2.bezierCurveTo(X(0.02), my - s * 0.03, X(mw * 0.5), my - s * 0.04, X(mw), my - s * 0.01);
  x2.bezierCurveTo(X(mw * 0.6), my + s * 0.1, X(-mw * 0.6), my + s * 0.1, X(-mw), my - s * 0.01); x2.fill();
  x2.fillStyle = '#f0e7da';
  x2.beginPath(); x2.moveTo(X(-mw * 0.82), my); x2.quadraticCurveTo(cx, my + s * 0.012, X(mw * 0.82), my);
  x2.quadraticCurveTo(cx, my + s * 0.06, X(-mw * 0.82), my); x2.fill();
  x2.strokeStyle = 'rgba(160,140,120,0.5)'; x2.lineWidth = Math.max(0.5, s * 0.004);
  for (let k = -3; k <= 3; k++) { x2.beginPath(); x2.moveTo(X(k * 0.022), my + s * 0.002); x2.lineTo(X(k * 0.021), my + s * 0.03); x2.stroke(); }
  x2.fillStyle = 'rgba(255,220,220,0.35)'; x2.beginPath(); x2.ellipse(cx, my + s * 0.072, s * 0.05, s * 0.012, 0, 0, TAU); x2.fill();
  x2.strokeStyle = 'rgba(70,25,25,0.55)'; x2.lineWidth = s * 0.008;
  x2.beginPath(); x2.moveTo(X(-mw - 0.01), my - s * 0.02); x2.quadraticCurveTo(X(-mw - 0.02), my, X(-mw - 0.005), my + s * 0.01); x2.stroke();
  x2.beginPath(); x2.moveTo(X(mw + 0.01), my - s * 0.02); x2.quadraticCurveTo(X(mw + 0.02), my, X(mw + 0.005), my + s * 0.01); x2.stroke();
  // bangs swept to one side
  g = x2.createLinearGradient(cx, Y(-0.55), cx, Y(-0.25)); g.addColorStop(0, '#2c1b11'); g.addColorStop(1, '#3d281b');
  x2.fillStyle = g;
  x2.beginPath(); x2.moveTo(X(-0.4), Y(-0.05));
  x2.bezierCurveTo(X(-0.42), Y(-0.5), X(-0.1), Y(-0.62), X(0.18), Y(-0.55));
  x2.bezierCurveTo(X(0.36), Y(-0.5), X(0.42), Y(-0.3), X(0.38), Y(-0.05));
  x2.bezierCurveTo(X(0.33), Y(-0.24), X(0.24), Y(-0.33), X(0.1), Y(-0.36));
  x2.bezierCurveTo(X(-0.05), Y(-0.38), X(-0.2), Y(-0.33), X(-0.27), Y(-0.24));
  x2.bezierCurveTo(X(-0.33), Y(-0.16), X(-0.36), Y(-0.1), X(-0.4), Y(-0.05)); x2.fill();
  x2.strokeStyle = 'rgba(120,85,60,0.35)'; x2.lineWidth = Math.max(0.6, s * 0.006);
  for (let k = 0; k < 14; k++) { const t = k / 13; x2.beginPath(); x2.moveTo(X(-0.3 + t * 0.6), Y(-0.55 + Math.abs(t - 0.45) * 0.1)); x2.quadraticCurveTo(X(-0.25 + t * 0.55), Y(-0.45), X(-0.32 + t * 0.66), Y(-0.3 - Math.sin(t * Math.PI) * 0.05)); x2.stroke(); }
  if (cutEyes) { // scissored holes, a little uneven
    x2.globalCompositeOperation = 'destination-out';
    const r = mulberry32(31);
    for (const k of [-1, 1]) {
      x2.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = i / 14 * TAU, rx = s * (0.088 + (k > 0 ? 0.006 : 0)) * (0.9 + r() * 0.2), ry = s * 0.052 * (0.85 + r() * 0.3);
        const px = X(k * 0.16) + Math.cos(a) * rx, py = Y(-0.06) + Math.sin(a) * ry + (k > 0 ? s * 0.006 : 0);
        i ? x2.lineTo(px, py) : x2.moveTo(px, py);
      }
      x2.fill();
    }
  }
  x2.restore();
}

function paintKidFace(x2, cx, cy, s) {
  x2.save();
  x2.fillStyle = '#3d2a1c'; x2.beginPath(); x2.ellipse(cx, cy - s * 0.12, s * 0.46, s * 0.42, 0, 0, TAU); x2.fill();
  const g = x2.createRadialGradient(cx - s * 0.06, cy - s * 0.06, s * 0.04, cx, cy, s * 0.5);
  g.addColorStop(0, '#f0cdb0'); g.addColorStop(1, '#b98466');
  x2.fillStyle = g; x2.beginPath(); x2.ellipse(cx, cy + s * 0.02, s * 0.36, s * 0.42, 0, 0, TAU); x2.fill();
  x2.fillStyle = '#3d2a1c'; x2.beginPath(); x2.ellipse(cx, cy - s * 0.3, s * 0.38, s * 0.16, 0, Math.PI, TAU); x2.fill();
  x2.fillRect(cx - s * 0.38, cy - s * 0.32, s * 0.76, s * 0.1);
  for (const k of [-1, 1]) { x2.fillStyle = '#2a1c12'; x2.beginPath(); x2.arc(cx + k * s * 0.13, cy - s * 0.02, s * 0.035, 0, TAU); x2.fill(); }
  x2.strokeStyle = '#8e3d3b'; x2.lineWidth = s * 0.03; x2.beginPath(); x2.arc(cx, cy + s * 0.14, s * 0.12, 0.15 * Math.PI, 0.85 * Math.PI); x2.stroke();
  x2.restore();
}

// what the paper hides: wet grey skin and a mouth that opens the wrong way
function paintTear(x2, w, h) {
  const r = mulberry32(977);
  // the rip: from the left cheek, under the nose, down through the chin
  const tear = new Path2D(), pts = [];
  const ring = [[0.2, 0.43], [0.36, 0.47], [0.5, 0.45], [0.66, 0.49], [0.83, 0.47], [0.8, 0.6], [0.72, 0.74], [0.62, 0.86], [0.5, 0.93], [0.37, 0.85], [0.27, 0.72], [0.18, 0.58]];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    for (let k = 0; k < 5; k++) { const t = k / 5; pts.push([(ax + (bx - ax) * t) * w + (r() - 0.5) * 9, (ay + (by - ay) * t) * h + (r() - 0.5) * 9]); }
  }
  pts.forEach(([x, y], i) => (i ? tear.lineTo(x, y) : tear.moveTo(x, y))); tear.closePath();
  x2.save(); x2.clip(tear);
  let g = x2.createRadialGradient(w * 0.5, h * 0.66, 4, w * 0.5, h * 0.66, w * 0.45);
  g.addColorStop(0, '#2a1d1f'); g.addColorStop(0.45, '#6b5d5c'); g.addColorStop(1, '#3d3434');
  x2.fillStyle = g; x2.fillRect(0, 0, w, h);
  // veins
  x2.strokeStyle = 'rgba(70,10,20,0.55)'; x2.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) { x2.beginPath(); let x = w * (0.2 + r() * 0.6), y = h * (0.45 + r() * 0.45); x2.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; x2.lineTo(x, y); } x2.stroke(); }
  // the mouth: a tall split, gums, far too many teeth
  const mx = w * 0.5, my = h * 0.68, mw = w * 0.17, mh = h * 0.2;
  // a split that tears further down one side; ragged gums; teeth of every length, some broken, none even
  const lip = (s, j) => { x2.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, k = s * (1 + (r() - 0.5) * j); const yy = my + Math.sin(a) * mh * k * (Math.sin(a) > 0 ? 1.12 : 1); i ? x2.lineTo(mx + Math.cos(a) * mw * k, yy) : x2.moveTo(mx + Math.cos(a) * mw * k, yy); } x2.closePath(); };
  x2.save(); x2.translate(mx, my); x2.rotate(-0.12); x2.translate(-mx, -my);
  x2.fillStyle = '#4e080d'; lip(1.22, 0.14); x2.fill();
  x2.fillStyle = '#030001'; lip(1.0, 0.1); x2.fill();
  for (let i = 0; i < 27; i++) {
    if (r() < 0.12) continue; // a gap where one is missing
    const a = (i + (r() - 0.5) * 0.6) / 27 * TAU, ex = mx + Math.cos(a) * mw * 1.03, ey = my + Math.sin(a) * mh * 1.05;
    const len = (0.18 + Math.pow(r(), 1.5) * 0.75) * Math.min(mw, mh) * (r() < 0.15 ? 0.35 : 0.8);
    const bend = (r() - 0.5) * 0.5, tx = mx + Math.cos(a + bend) * (mw - len), ty = my + Math.sin(a + bend) * (mh - len);
    const wdt = 1.6 + r() * 2.6, nx = -Math.sin(a) * wdt, ny = Math.cos(a) * wdt;
    x2.fillStyle = r() < 0.4 ? '#c9bd93' : r() < 0.5 ? '#ddd3b6' : '#a99b6e';
    x2.beginPath(); x2.moveTo(ex + nx, ey + ny); x2.lineTo(tx, ty); x2.lineTo(ex - nx, ey - ny); x2.fill();
  }
  x2.restore();
  x2.fillStyle = 'rgba(150,10,20,0.6)'; for (let i = 0; i < 6; i++) { x2.beginPath(); x2.ellipse(mx + (r() - 0.5) * mw, my + mh * (0.4 + r() * 0.5), 3 + r() * 4, 2 + r() * 3, 0, 0, TAU); x2.fill(); }
  x2.restore();
  // torn paper edge: white fibres, curled flaps, blood running from the rip
  x2.strokeStyle = 'rgba(245,238,225,0.95)'; x2.lineWidth = 2.6; x2.stroke(tear);
  x2.strokeStyle = 'rgba(60,30,20,0.45)'; x2.lineWidth = 1; x2.save(); x2.translate(1.5, 1.5); x2.stroke(tear); x2.restore();
  x2.strokeStyle = 'rgba(120,5,12,0.85)'; x2.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const [px, py] = pts[(r() * pts.length) | 0]; if (py < h * 0.55) continue;
    x2.lineWidth = 1.5 + r() * 2.5; x2.beginPath(); x2.moveTo(px, py); x2.lineTo(px + (r() - 0.5) * 3, py + 10 + r() * 40); x2.stroke();
  }
}

// the paper mask the creature wears: Mom's face scissored out of a photo. torn: what the deaths show.
function genMomMask(torn = false) {
  const w = 256, h = 320, c = makeCanvas(w, h), x2 = ctx2d(c);
  x2.clearRect(0, 0, w, h);
  paintMomFace(x2, w / 2, h * 0.46, h * 0.62, { cutEyes: true });
  filmify(c, 0.1);
  if (torn) paintTear(x2, w, h);
  // scissor outline: keep an irregular polygon around the head
  const cut = makeCanvas(w, h), cx = ctx2d(cut), r = mulberry32(161);
  cx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = i / 28 * TAU, rx = w * 0.43 + (r() - 0.5) * 12, ry = h * 0.45 + (r() - 0.5) * 12;
    const x = w / 2 + Math.cos(a) * rx, y = h * 0.47 + Math.sin(a) * ry;
    i ? cx.lineTo(x, y) : cx.moveTo(x, y);
  }
  cx.fillStyle = '#fff'; cx.fill();
  x2.globalCompositeOperation = 'destination-in'; x2.drawImage(cut, 0, 0);
  x2.globalCompositeOperation = 'source-over';
  // creases
  x2.strokeStyle = 'rgba(255,255,255,0.25)'; x2.lineWidth = 1.5;
  x2.beginPath(); x2.moveTo(0, h * 0.62); x2.lineTo(w, h * 0.55); x2.stroke();
  x2.beginPath(); x2.moveTo(w * 0.62, 0); x2.lineTo(w * 0.55, h); x2.stroke();
  return { map: canvasTex(c, { wrap: false }), normalMap: genCrumple() };
}

// blood: handprints, a drag, finger-writing. Transparent canvases for decals.
function bloodStroke(x2, pts, width, r) {
  x2.lineCap = 'round'; x2.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    x2.strokeStyle = pass === 0 ? 'rgba(40,0,2,0.7)' : pass === 1 ? 'rgba(110,6,10,0.85)' : 'rgba(170,30,30,0.35)';
    x2.lineWidth = width * (pass === 0 ? 1.15 : pass === 1 ? 0.9 : 0.3);
    x2.beginPath(); pts.forEach(([x, y], i) => { const j = pass === 2 ? -width * 0.15 : 0; i ? x2.lineTo(x + j, y + j) : x2.moveTo(x + j, y + j); }); x2.stroke();
  }
  // drips from the low points of the stroke
  for (const [x, y] of pts) if (r() < 0.22) {
    const len = 8 + r() * 46; x2.strokeStyle = 'rgba(100,4,8,0.85)'; x2.lineWidth = width * (0.18 + r() * 0.2);
    x2.beginPath(); x2.moveTo(x, y); x2.lineTo(x + (r() - 0.5) * 2, y + len); x2.stroke();
    x2.fillStyle = 'rgba(100,4,8,0.9)'; x2.beginPath(); x2.arc(x, y + len, x2.lineWidth * 0.75, 0, TAU); x2.fill();
  }
}
function bloodHand(x2, cx, cy, s, rot, r, smear = 0) {
  x2.save(); x2.translate(cx, cy); x2.rotate(rot);
  const fill = a => (x2.fillStyle = `rgba(${95 + r() * 30},${4 + r() * 6},8,${a})`);
  fill(0.85); x2.beginPath(); x2.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, TAU); x2.fill();
  // long fingers: hers are too long
  for (let i = 0; i < 4; i++) {
    const fx = (i - 1.5) * s * 0.22, len = s * (0.95 + (i === 1 || i === 2 ? 0.25 : 0));
    fill(0.8); x2.beginPath(); x2.ellipse(fx, -s * 0.45 - len * 0.5, s * 0.08, len * 0.5, (i - 1.5) * 0.08, 0, TAU); x2.fill();
  }
  fill(0.75); x2.beginPath(); x2.ellipse(s * 0.5, -s * 0.05, s * 0.08, s * 0.32, -0.7, 0, TAU); x2.fill();
  if (smear) { x2.globalAlpha = 0.55; for (let k = 1; k < 8; k++) { fill(0.35 - k * 0.04); x2.beginPath(); x2.ellipse(0, k * smear * s * 0.18, s * 0.4, s * 0.45, 0, 0, TAU); x2.fill(); } }
  x2.restore();
}
function genBlood(kind) {
  const r = mulberry32(kind.length * 977 + 13);
  const W0 = kind === 'drag' ? 256 : 512, H0 = kind === 'drag' ? 768 : kind === 'letmein' ? 256 : 512;
  const c = makeCanvas(W0, H0), x2 = ctx2d(c); x2.clearRect(0, 0, W0, H0);
  if (kind === 'hands') {
    bloodHand(x2, 160, 170, 70, -0.25, r, 1.2); bloodHand(x2, 330, 120, 66, 0.15, r, 0.6); bloodHand(x2, 250, 330, 74, 0.05, r, 2.2);
    // the lowest hand dragged down the door as she slid
    for (let k = 0; k < 4; k++) bloodStroke(x2, [[222 + k * 20, 380], [220 + k * 21, 440], [226 + k * 19, 505]], 9 + r() * 5, r);
  } else if (kind === 'letmein') {
    x2.font = 'bold 132px "Gochi Hand", "Caveat", cursive'; x2.textBaseline = 'middle';
    // trace the letters as a finger would: thick, uneven, then let them run
    x2.lineJoin = 'round'; x2.strokeStyle = 'rgba(105,5,10,0.92)'; x2.lineWidth = 14;
    x2.save(); x2.translate(14, 130); x2.rotate(-0.04);
    x2.strokeText('LET ME IN', 0, 0);
    x2.fillStyle = 'rgba(70,0,4,0.55)'; x2.fillText('LET ME IN', 0, 0);
    x2.restore();
    for (let i = 0; i < 22; i++) { const x = 30 + r() * 450, y = 150 + r() * 40, len = 15 + r() * 80; x2.strokeStyle = 'rgba(100,4,8,0.85)'; x2.lineWidth = 2 + r() * 4; x2.beginPath(); x2.moveTo(x, y); x2.lineTo(x + (r() - 0.5) * 2, y + len); x2.stroke(); }
  } else if (kind === 'mirror') {
    x2.font = 'bold 108px "Gochi Hand", "Caveat", cursive'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    x2.lineJoin = 'round'; x2.strokeStyle = 'rgba(115,8,12,0.9)'; x2.lineWidth = 10;
    x2.save(); x2.translate(256, 190); x2.rotate(0.05); x2.strokeText("MOMMY'S", 0, -55); x2.strokeText('HOME', 0, 60); x2.restore();
    for (let i = 0; i < 18; i++) { const x = 80 + r() * 350, y = 200 + r() * 90, len = 20 + r() * 120; x2.strokeStyle = 'rgba(105,5,10,0.8)'; x2.lineWidth = 2 + r() * 3; x2.beginPath(); x2.moveTo(x, y); x2.lineTo(x, y + len); x2.stroke(); }
  } else if (kind === 'drag') { // something dragged down the hall floor, fingers trailing
    for (let k = 0; k < 4; k++) { const x0 = 70 + k * 36 + (r() - 0.5) * 10; const pts = []; for (let y = 10; y < H0 - 10; y += 24) pts.push([x0 + Math.sin(y * 0.01 + k) * 14 + (r() - 0.5) * 6, y]); bloodStroke(x2, pts, 10 + r() * 6, () => 1); }
    x2.globalAlpha = 0.4; bloodStroke(x2, [[128, 20], [120, 300], [135, 560], [126, 750]], 70, () => 1); x2.globalAlpha = 1;
  }
  return canvasTex(c, { wrap: false });
}
// an old bedsheet: off-white, yellowed, stained
function genSheet() {
  const w = 256, h = 256, c = makeCanvas(w, h), x2 = ctx2d(c), n = noise2(w, h, 6, 6, 4, 461), r = mulberry32(462);
  paintPixels(c, (x, y, i, o) => { const k = 0.82 + n[i] * 0.12; o[0] = 0.86 * k; o[1] = 0.83 * k; o[2] = 0.76 * k; });
  for (let i = 0; i < 9; i++) { const g = x2.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(150,120,60,0.22)'); g.addColorStop(1, 'rgba(150,120,60,0)'); x2.save(); x2.translate(r() * w, r() * h); x2.scale(20 + r() * 40, 15 + r() * 30); x2.fillStyle = g; x2.fillRect(-1, -1, 2, 2); x2.restore(); }
  for (let i = 0; i < 4; i++) { const g = x2.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(90,15,12,0.55)'); g.addColorStop(0.6, 'rgba(90,15,12,0.25)'); g.addColorStop(1, 'rgba(90,15,12,0)'); x2.save(); x2.translate(r() * w, r() * h); x2.scale(8 + r() * 16, 6 + r() * 12); x2.fillStyle = g; x2.fillRect(-1, -1, 2, 2); x2.restore(); }
  return canvasTex(c);
}

// framed family photos. variant: 0 normal, 1 Mom's face cut out, 2 she is in the picture
function genPhoto(kind, variant) {
  const land = kind === 'beach';
  const w = land ? 320 : 256, h = land ? 256 : 320, c = makeCanvas(w, h), x2 = ctx2d(c);
  const holeAt = []; // [cx, cy, s] where Mom's face is
  if (kind === 'nurse') {
    const g = x2.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#8fa3ad'); g.addColorStop(1, '#53656f');
    x2.fillStyle = g; x2.fillRect(0, 0, w, h);
    x2.fillStyle = '#3f7c78'; x2.beginPath(); x2.moveTo(w * 0.12, h); x2.lineTo(w * 0.24, h * 0.7); x2.lineTo(w * 0.76, h * 0.7); x2.lineTo(w * 0.88, h); x2.fill();
    x2.fillStyle = '#c99476'; x2.beginPath(); x2.moveTo(w * 0.42, h * 0.7); x2.lineTo(w * 0.5, h * 0.8); x2.lineTo(w * 0.58, h * 0.7); x2.fill();
    x2.fillStyle = '#e8e8e2'; x2.fillRect(w * 0.6, h * 0.8, w * 0.14, h * 0.06);
    paintMomFace(x2, w / 2, h * 0.42, h * 0.5);
    holeAt.push([w / 2, h * 0.42, h * 0.5]);
  } else if (kind === 'beach') {
    let g = x2.createLinearGradient(0, 0, 0, h * 0.5); g.addColorStop(0, '#7fb2d6'); g.addColorStop(1, '#cfe2e8');
    x2.fillStyle = g; x2.fillRect(0, 0, w, h * 0.5);
    g = x2.createLinearGradient(0, h * 0.5, 0, h * 0.68); g.addColorStop(0, '#3f7393'); g.addColorStop(1, '#78a8b5');
    x2.fillStyle = g; x2.fillRect(0, h * 0.5, w, h * 0.18);
    x2.fillStyle = '#d9c7a0'; x2.fillRect(0, h * 0.68, w, h * 0.32);
    if (variant === 2) { // something tall standing in the water behind them
      const fx = w * 0.84, top = h * 0.1;
      x2.fillStyle = 'rgba(18,14,12,0.92)';
      x2.beginPath(); x2.moveTo(fx - w * 0.02, top + h * 0.09); x2.lineTo(fx + w * 0.02, top + h * 0.09); x2.lineTo(fx + w * 0.035, top + h * 0.42); x2.lineTo(fx - w * 0.035, top + h * 0.42); x2.fill();
      x2.fillRect(fx - w * 0.008, top + h * 0.42, w * 0.006, h * 0.12); x2.fillRect(fx + w * 0.003, top + h * 0.42, w * 0.006, h * 0.12);
      x2.lineWidth = w * 0.007; x2.strokeStyle = 'rgba(200,190,180,0.85)';
      for (const k of [-1, 1]) { x2.beginPath(); x2.moveTo(fx + k * w * 0.022, top + h * 0.11); x2.quadraticCurveTo(fx + k * w * 0.04, top + h * 0.3, fx + k * w * 0.034, top + h * 0.47); x2.stroke(); }
      x2.fillStyle = '#15100d'; x2.beginPath(); x2.ellipse(fx, top + h * 0.05, w * 0.02, h * 0.06, 0.35, 0, TAU); x2.fill();
      x2.fillStyle = '#e2c2a6'; x2.save(); x2.translate(fx + w * 0.004, top + h * 0.045); x2.rotate(0.35); x2.fillRect(-w * 0.013, -h * 0.025, w * 0.026, h * 0.05); x2.restore();
    }
    // Mom
    x2.fillStyle = '#a33f3a'; x2.fillRect(w * 0.3, h * 0.42, w * 0.16, h * 0.34);
    x2.fillStyle = '#c99476'; x2.fillRect(w * 0.31, h * 0.76, w * 0.05, h * 0.2); x2.fillRect(w * 0.4, h * 0.76, w * 0.05, h * 0.2);
    paintMomFace(x2, w * 0.38, h * 0.33, h * 0.17);
    holeAt.push([w * 0.38, h * 0.33, h * 0.17]);
    // kid
    x2.fillStyle = '#e1b737'; x2.fillRect(w * 0.5, h * 0.6, w * 0.11, h * 0.2);
    x2.fillStyle = '#c99476'; x2.fillRect(w * 0.51, h * 0.8, w * 0.035, h * 0.13); x2.fillRect(w * 0.57, h * 0.8, w * 0.035, h * 0.13);
    paintKidFace(x2, w * 0.555, h * 0.53, h * 0.12);
    x2.fillStyle = 'rgba(255,240,200,0.25)'; x2.beginPath(); x2.arc(w * 0.9, h * 0.08, w * 0.2, 0, TAU); x2.fill();
  } else { // school portrait
    const g = x2.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, w * 0.8); g.addColorStop(0, '#6f8fb8'); g.addColorStop(1, '#25385a');
    x2.fillStyle = g; x2.fillRect(0, 0, w, h);
    if (variant === 2) { x2.fillStyle = 'rgba(10,8,8,0.85)'; x2.fillRect(w * 0.68, 0, w * 0.2, h * 0.75); x2.fillStyle = '#d8b9a0'; x2.fillRect(w * 0.72, h * 0.02, w * 0.12, h * 0.1); }
    x2.fillStyle = '#b84a3a'; x2.fillRect(w * 0.2, h * 0.72, w * 0.6, h * 0.3);
    x2.fillStyle = '#e6e0d0'; for (let k = 0; k < 4; k++) x2.fillRect(w * 0.2, h * (0.76 + k * 0.06), w * 0.6, h * 0.02);
    paintKidFace(x2, w / 2, h * 0.45, h * 0.44);
  }
  filmify(c, 0.14);
  if (variant >= 1) for (const [cx, cy, s] of holeAt) { // scissored hole showing the cardboard backing
    x2.fillStyle = '#2b2118';
    x2.beginPath(); const r = mulberry32((cx * 7) | 0);
    for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, x = cx + Math.cos(a) * s * (0.34 + r() * 0.04), y = cy + s * 0.01 + Math.sin(a) * s * (0.47 + r() * 0.05); i ? x2.lineTo(x, y) : x2.moveTo(x, y); }
    x2.fill();
    x2.strokeStyle = 'rgba(240,230,210,0.5)'; x2.lineWidth = 1.5; x2.stroke();
  }
  return canvasTex(c, { wrap: false });
}

// ---------------------------------------------------------------------------
// kid drawings (crayon)
// ---------------------------------------------------------------------------
function crayonPath(x2, pts, color, width, passes = 3) {
  x2.save(); x2.strokeStyle = color; x2.lineCap = 'round'; x2.lineJoin = 'round';
  for (let p = 0; p < passes; p++) {
    x2.globalAlpha = 0.5; x2.lineWidth = width * (0.7 + Math.random() * 0.5);
    x2.beginPath();
    pts.forEach(([x, y], i) => { const jx = x + (Math.random() - 0.5) * width * 0.7, jy = y + (Math.random() - 0.5) * width * 0.7; i ? x2.lineTo(jx, jy) : x2.moveTo(jx, jy); });
    x2.stroke();
  }
  x2.restore();
}
function crayonCircle(x2, cx, cy, rx, ry, color, width) {
  const pts = []; for (let i = 0; i <= 26; i++) { const a = i / 24 * TAU; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  crayonPath(x2, pts, color, width);
}
function crayonFill(x2, x, y, w, h, color, step = 5) {
  const pts = []; for (let yy = y; yy < y + h; yy += step) { pts.push([x, yy]); pts.push([x + w, yy + step * 0.5]); }
  crayonPath(x2, pts, color, step * 1.3, 2);
}
function crayonText(x2, text, x, y, size, color, rot = 0) {
  x2.save(); x2.translate(x, y); x2.rotate(rot); x2.font = `${size}px "Gochi Hand", "Comic Sans MS", cursive`; x2.fillStyle = color;
  for (let p = 0; p < 3; p++) { x2.globalAlpha = 0.55; x2.fillText(text, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2); }
  x2.restore();
}
function stickKid(x2, x, y, s, col = '#333') {
  crayonCircle(x2, x, y - s * 0.85, s * 0.13, s * 0.14, col, 4);
  crayonPath(x2, [[x, y - s * 0.7], [x, y - s * 0.3]], col, 4);
  crayonPath(x2, [[x - s * 0.18, y], [x, y - s * 0.3], [x + s * 0.18, y]], col, 4);
  crayonPath(x2, [[x - s * 0.22, y - s * 0.55], [x, y - s * 0.6], [x + s * 0.22, y - s * 0.55]], col, 4);
}
function drawingPaper(w = 512, h = 384, seed = 1) {
  const c = makeCanvas(w, h), x2 = ctx2d(c), n = noise2(w, h, 6, 6, 3, seed);
  paintPixels(c, (x, y, i, o) => { const k = 0.9 + n[i] * 0.08; o[0] = 0.95 * k; o[1] = 0.93 * k; o[2] = 0.86 * k; });
  return [c, x2];
}

function genDrawing(kind) {
  const [c, x2] = drawingPaper(512, 384, kind.length * 7);
  if (kind === 'meandmom') {
    crayonText(x2, 'ME AND MOM', 24, 52, 44, '#2d55b8', -0.04);
    crayonCircle(x2, 430, 70, 34, 34, '#f0b81c', 6); crayonFill(x2, 404, 46, 52, 48, '#f6c932', 6);
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; crayonPath(x2, [[430 + Math.cos(a) * 44, 70 + Math.sin(a) * 44], [430 + Math.cos(a) * 64, 70 + Math.sin(a) * 64]], '#f0b81c', 4); }
    crayonPath(x2, [[60, 230], [140, 160], [220, 230]], '#c0392b', 6); crayonPath(x2, [[70, 230], [70, 330], [210, 330], [210, 230]], '#8e5b2e', 6);
    crayonFill(x2, 120, 270, 40, 60, '#8e5b2e');
    crayonPath(x2, [[300, 200], [280, 300], [350, 300], [330, 200]], '#3a8f7c', 6); crayonFill(x2, 290, 210, 50, 88, '#4aa58e');
    stickKid(x2, 315, 330, 160, '#333'); crayonPath(x2, [[300, 170], [292, 220]], '#4b2e1a', 5); crayonPath(x2, [[330, 170], [338, 220]], '#4b2e1a', 5);
    stickKid(x2, 400, 330, 100, '#333');
    crayonPath(x2, [[337, 245], [378, 270]], '#333', 4);
    crayonPath(x2, [[0, 350], [40, 336], [80, 352], [120, 334], [160, 352], [200, 336], [240, 352], [280, 334], [320, 352], [360, 336], [400, 352], [440, 334], [512, 350]], '#3f9b3a', 7);
  } else if (kind === 'momwork') {
    crayonText(x2, 'MOM WERKS AT NITE', 20, 50, 40, '#6b2fa0', -0.03);
    crayonFill(x2, 40, 120, 180, 220, '#9aa9b8', 7); crayonPath(x2, [[40, 120], [220, 120], [220, 340], [40, 340], [40, 120]], '#555', 5);
    crayonFill(x2, 110, 160, 40, 14, '#d62c2c', 5); crayonFill(x2, 123, 146, 14, 42, '#d62c2c', 5);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) crayonFill(x2, 60 + k * 54, 220 + r * 40, 28, 22, '#f2d34d', 5);
    crayonCircle(x2, 420, 80, 36, 36, '#c8c8a0', 5); crayonFill(x2, 396, 54, 46, 54, '#e8e6c2', 6);
    for (const [sx, sy] of [[300, 60], [350, 120], [470, 150], [260, 120]]) crayonText(x2, '*', sx, sy, 40, '#e0c03a');
    crayonFill(x2, 330, 220, 60, 90, '#2f6fb5'); stickKid(x2, 360, 340, 170, '#333');
    crayonText(x2, '<3', 410, 250, 44, '#d62c2c');
  } else if (kind === 'lady') {
    crayonText(x2, 'DONT LOOK AT HER', 26, 52, 42, '#c62020', -0.02);
    crayonFill(x2, 290, 90, 46, 220, '#151515', 6);                                  // body
    crayonPath(x2, [[292, 100], [250, 230], [236, 350]], '#151515', 6);               // long arms
    crayonPath(x2, [[334, 100], [376, 230], [392, 350]], '#151515', 6);
    for (let k = -2; k <= 2; k++) { crayonPath(x2, [[236, 350], [230 + k * 6, 372]], '#151515', 3); crayonPath(x2, [[392, 350], [398 + k * 6, 372]], '#151515', 3); }
    crayonPath(x2, [[300, 310], [296, 370]], '#151515', 6); crayonPath(x2, [[326, 310], [330, 370]], '#151515', 6);
    for (let k = 0; k < 14; k++) crayonPath(x2, [[290 + k * 3.5, 40], [282 + k * 4.5, 140 + Math.random() * 30]], '#151515', 3);
    crayonFill(x2, 293, 46, 40, 44, '#f1cfa8', 4);                                     // the paper face
    crayonPath(x2, [[293, 46], [333, 46], [333, 90], [293, 90], [293, 46]], '#7a5a3a', 2);
    crayonCircle(x2, 305, 62, 4, 4, '#000', 4); crayonCircle(x2, 321, 62, 4, 4, '#000', 4);
    crayonPath(x2, [[302, 76], [313, 82], [324, 76]], '#c62020', 3);
    crayonPath(x2, [[40, 330], [170, 330], [170, 300], [40, 300], [40, 330]], '#3d6bb3', 5); crayonFill(x2, 42, 302, 126, 26, '#7aa6e6', 5);
    crayonCircle(x2, 60, 288, 16, 16, '#333', 4);
    crayonPath(x2, [[51, 287], [57, 291], [63, 287]], '#333', 2); crayonPath(x2, [[60, 287], [66, 291], [70, 287]], '#333', 2);
  } else if (kind === 'wantsmom') {
    crayonText(x2, 'SHE WANTS TO BE MY MOM', 18, 48, 36, '#151515', -0.03);
    crayonPath(x2, [[110, 170], [250, 90], [390, 170]], '#151515', 6); crayonPath(x2, [[130, 170], [130, 350], [370, 350], [370, 170]], '#151515', 6);
    crayonFill(x2, 170, 200, 70, 70, '#f2d34d', 6); crayonFill(x2, 270, 200, 70, 70, '#151515', 6);
    crayonFill(x2, 296, 210, 18, 18, '#f1cfa8', 3);
    crayonFill(x2, 220, 280, 50, 70, '#8e5b2e', 6);
    stickKid(x2, 450, 350, 140, '#2f6fb5'); crayonPath(x2, [[440, 225], [436, 260]], '#4b2e1a', 4);
    crayonText(x2, 'MOM', 420, 190, 26, '#2f6fb5');
  }
  return canvasTex(c, { wrap: false });
}

function genScrawl() { // written on the wall next to the front door, at kid height
  const w = 512, h = 256, c = makeCanvas(w, h), x2 = ctx2d(c);
  x2.clearRect(0, 0, w, h);
  crayonText(x2, 'MOM HAS A KEY', 18, 92, 64, '#b3261e', -0.05);
  crayonText(x2, 'MOM NEVER KNOCKS', 12, 182, 64, '#23479a', -0.03);
  crayonPath(x2, [[20, 200], [140, 206], [300, 198], [440, 204]], '#23479a', 5);
  crayonText(x2, '<3', 440, 120, 50, '#b3261e', 0.2);
  return canvasTex(c, { wrap: false });
}

function genSign(text, sub) {
  const [c, x2] = drawingPaper(256, 128, 77);
  crayonText(x2, text, 16, 62, 44, '#7a2fa0', -0.04);
  if (sub) crayonText(x2, sub, 30, 110, 28, '#c62020', -0.02);
  return canvasTex(c, { wrap: false });
}

function genNoteThumb() {
  const c = makeCanvas(256, 320), x2 = ctx2d(c);
  x2.fillStyle = '#e8e0cb'; x2.fillRect(0, 0, 256, 320);
  x2.strokeStyle = 'rgba(111,135,168,0.4)'; for (let y = 40; y < 320; y += 18) { x2.beginPath(); x2.moveTo(0, y); x2.lineTo(256, y); x2.stroke(); }
  x2.fillStyle = '#2b2930'; x2.font = '600 34px "Caveat", cursive'; x2.fillText('Bug —', 20, 46);
  x2.font = '20px "Caveat", cursive';
  const lines = ['If I\'m not home when', 'you wake up, read this.', '1. chain stays on', '2. I never knock', '3. close your eyes', '4. don\'t turn around', '5. the music box', '6. 4:44 closet', '7. sun comes up'];
  lines.forEach((l, i) => x2.fillText(l, 20, 82 + i * 26));
  filmify(c, 0.05, false);
  return canvasTex(c, { wrap: false });
}

// ---------------------------------------------------------------------------
// small dynamic / utility textures
// ---------------------------------------------------------------------------
function genClockFace() {
  const s = 256, c = makeCanvas(s, s), x2 = ctx2d(c);
  const g = x2.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2); g.addColorStop(0, '#efe8d6'); g.addColorStop(1, '#cfc4a6');
  x2.fillStyle = g; x2.fillRect(0, 0, s, s);
  x2.fillStyle = '#1d1a16'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.font = '30px Georgia, serif';
  for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU - Math.PI / 2; x2.fillText(String(i), s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.36); }
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r0 = s * (i % 5 ? 0.45 : 0.43); x2.lineWidth = i % 5 ? 1.5 : 3; x2.beginPath(); x2.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0); x2.lineTo(s / 2 + Math.cos(a) * s * 0.475, s / 2 + Math.sin(a) * s * 0.475); x2.stroke(); }
  x2.font = '13px Georgia, serif'; x2.fillText('QUARTZ', s / 2, s * 0.66);
  filmify(c, 0.06);
  return canvasTex(c, { wrap: false });
}

// flashlight beam pattern, used as linear data: a broad even plateau, a soft hotspot, a faint ring, a dirty lens
function genCookie() {
  const s = 256, c = makeCanvas(s, s), n = noise2(s, s, 10, 10, 3, 171);
  paintPixels(c, (x, y, i, o) => {
    const dx = x / s - 0.5, dy = y / s - 0.5, r = Math.hypot(dx, dy) * 2;
    let v = (0.6 + 0.4 * Math.exp(-r * r * 7)) * smooth(1.0, 0.5, r);
    v += 0.06 * smooth(0.45, 0.58, r) * smooth(0.72, 0.58, r) + 0.07 * smooth(1.0, 0.75, r);
    v *= 0.92 + n[i] * 0.12;
    o[0] = o[1] = o[2] = v;
  });
  return canvasTex(c, { wrap: false, srgb: false });
}

function genSky(seed = 181) {
  const w = 1024, h = 512, c = makeCanvas(w, h), x2 = ctx2d(c), cl = noise2(w, h, 6, 3, 5, seed, 0.55);
  paintPixels(c, (x, y, i, o) => {
    const v = y / h, glow = smooth(0.3, 1, v);
    const k = 0.05 + glow * 0.11 + (cl[i] - 0.5) * 0.08 * (1 - v);
    o[0] = k * 0.9; o[1] = k * 0.95; o[2] = k * 1.15;
  });
  const r = mulberry32(seed + 1);
  let x = 0;
  while (x < w) {
    const bw = 40 + r() * 110, bh = h * (0.18 + r() * 0.35);
    x2.fillStyle = '#030405'; x2.fillRect(x, h - bh, bw, bh);
    for (let wy = h - bh + 10; wy < h - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
      if (r() < 0.07) { x2.fillStyle = r() < 0.5 ? '#c99a52' : '#8aa2b8'; x2.globalAlpha = 0.5 + r() * 0.5; x2.fillRect(wx, wy, 6, 8); x2.globalAlpha = 1; }
    }
    x += bw + r() * 6;
  }
  const g = x2.createRadialGradient(w * 0.3, h, 0, w * 0.3, h, h * 0.5); g.addColorStop(0, 'rgba(210,130,60,0.35)'); g.addColorStop(1, 'rgba(210,130,60,0)');
  x2.fillStyle = g; x2.fillRect(0, 0, w, h);
  return canvasTex(c, { wrap: false });
}

function genDawnSky() {
  const w = 1024, h = 512, c = makeCanvas(w, h), x2 = ctx2d(c);
  const g = x2.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5f7fa8'); g.addColorStop(0.55, '#e7b98a'); g.addColorStop(0.8, '#ffd9a0'); g.addColorStop(1, '#ffe8c0');
  x2.fillStyle = g; x2.fillRect(0, 0, w, h);
  const s = x2.createRadialGradient(w * 0.15, h * 0.85, 0, w * 0.15, h * 0.85, h * 0.6); s.addColorStop(0, 'rgba(255,240,200,1)'); s.addColorStop(1, 'rgba(255,240,200,0)');
  x2.fillStyle = s; x2.fillRect(0, 0, w, h);
  const r = mulberry32(182); let x = 0;
  while (x < w) { const bw = 40 + r() * 110, bh = h * (0.18 + r() * 0.35); x2.fillStyle = '#4a4a55'; x2.fillRect(x, h - bh, bw, bh); x += bw + r() * 6; }
  return canvasTex(c, { wrap: false });
}

function genPoster(kind) {
  const w = 256, h = 360, c = makeCanvas(w, h), x2 = ctx2d(c);
  if (kind === 'dino') {
    x2.fillStyle = '#3f7a46'; x2.fillRect(0, 0, w, h);
    x2.fillStyle = '#1d3b22';
    x2.beginPath(); x2.moveTo(40, 300); x2.lineTo(70, 200); x2.lineTo(60, 150); x2.lineTo(110, 110); x2.lineTo(170, 105); x2.lineTo(190, 130); x2.lineTo(150, 140);
    x2.lineTo(140, 180); x2.lineTo(200, 230); x2.lineTo(240, 300); x2.lineTo(170, 260); x2.lineTo(150, 300); x2.lineTo(130, 300); x2.lineTo(120, 250); x2.lineTo(95, 260); x2.lineTo(90, 300); x2.fill();
    x2.fillStyle = '#f0e6c0'; x2.font = 'bold 34px Georgia, serif'; x2.textAlign = 'center'; x2.fillText('DINOSAURS', w / 2, 60);
  } else {
    x2.fillStyle = '#0d1022'; x2.fillRect(0, 0, w, h);
    const r = mulberry32(3); for (let i = 0; i < 90; i++) { x2.fillStyle = `rgba(255,255,255,${r()})`; x2.fillRect(r() * w, r() * h, 1.5, 1.5); }
    const planets = [['#f4b740', 30, 90], ['#c2593b', 10, 150], ['#3d78c9', 13, 190], ['#d49b5c', 26, 250], ['#9fc9d9', 16, 310]];
    for (const [col, rad, y] of planets) { x2.fillStyle = col; x2.beginPath(); x2.arc(w / 2 + (y % 3 - 1) * 40, y, rad, 0, TAU); x2.fill(); }
    x2.fillStyle = '#e6e6f0'; x2.font = 'bold 26px Georgia, serif'; x2.textAlign = 'center'; x2.fillText('OUR SOLAR SYSTEM', w / 2, 40);
  }
  filmify(c, 0.06, false);
  return canvasTex(c, { wrap: false });
}

function genMirrorDirt() {
  const s = 256, c = makeCanvas(s, s), x2 = ctx2d(c), n = noise2(s, s, 5, 5, 4, 191), f = noise2(s, s, 40, 40, 2, 192);
  const img = x2.createImageData(s, s), d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, e = Math.min(x, y, s - 1 - x, s - 1 - y) / s;
    const edge = smooth(0.12, 0.0, e + (n[i] - 0.5) * 0.12);
    const spots = f[i] > 0.78 ? 0.5 : 0;
    const smudge = smooth(0.55, 0.8, n[i]) * 0.25;
    d[i * 4] = 40; d[i * 4 + 1] = 36; d[i * 4 + 2] = 30;
    d[i * 4 + 3] = clamp(edge * 0.95 + spots + smudge, 0, 1) * 255;
  }
  x2.putImageData(img, 0, 0);
  return canvasTex(c, { wrap: false });
}

function genSoftDot() {
  const s = 64, c = makeCanvas(s, s), x2 = ctx2d(c), g = x2.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x2.fillStyle = g; x2.fillRect(0, 0, s, s);
  return canvasTex(c, { wrap: false, srgb: false });
}

function genLabel(text, { w = 128, h = 64, bg = '#9c7a3c', fg = '#1a140c', font = 'bold 34px Georgia, serif' } = {}) {
  const c = makeCanvas(w, h), x2 = ctx2d(c);
  x2.fillStyle = bg; x2.fillRect(0, 0, w, h);
  x2.fillStyle = fg; x2.font = font; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(text, w / 2, h / 2 + 2);
  filmify(c, 0.05, false);
  return canvasTex(c, { wrap: false });
}

function genCorridorCarpet(seed = 201) {
  const w = 512, h = 512, n = noise2(w, h, 8, 8, 4, seed), f = noise2(w, h, 120, 120, 2, seed + 1), st = noise2(w, h, 4, 4, 4, seed + 2);
  const c = makeCanvas(w, h);
  paintPixels(c, (x, y, i, o) => {
    const u = (x / w * 4) % 1, v = (y / h * 4) % 1;
    const dia = Math.abs(u - 0.5) + Math.abs(v - 0.5);
    let col = [0.12, 0.22, 0.22];
    if (Math.abs(dia - 0.3) < 0.04) col = [0.32, 0.28, 0.16]; else if (dia < 0.1) col = [0.4, 0.16, 0.13];
    const k = (0.82 + n[i] * 0.25 + (f[i] - 0.5) * 0.25) * (st[i] > 0.68 ? 0.7 : 1);
    o[0] = col[0] * k; o[1] = col[1] * k; o[2] = col[2] * k;
  });
  return { map: canvasTex(c) };
}

function genDropCeiling(seed = 211) {
  const w = 512, h = 512, n = noise2(w, h, 96, 96, 2, seed), st = noise2(w, h, 3, 3, 4, seed + 1);
  const c = makeCanvas(w, h), hf = new Float32Array(w * h);
  paintPixels(c, (x, y, i, o) => {
    const e = Math.min(x % 256, 256 - x % 256, y % 256, 256 - y % 256);
    const grid = e < 4 ? 1 : 0, pit = n[i] > 0.78 ? 1 : 0;
    let k = grid ? 0.55 : 0.82 - pit * 0.25;
    if (st[i] > 0.7) k *= 0.8;
    o[0] = k; o[1] = k * 0.98; o[2] = k * 0.9;
    hf[i] = grid ? 0.2 : 1 - pit * 0.4;
  });
  return { map: canvasTex(c), normalMap: normalTex(hf, w, h, 2) };
}

// 7-segment style digit display (alarm clock / microwave). Returns {tex, set(text, color)}
function makeDigitDisplay(w = 128, h = 48) {
  const c = makeCanvas(w, h), x2 = ctx2d(c), tex = canvasTex(c, { wrap: false, aniso: false });
  return {
    tex,
    set(text, color = '#ff3a2a', on = true) {
      x2.fillStyle = '#060404'; x2.fillRect(0, 0, w, h);
      if (on) {
        x2.font = `bold ${h * 0.78}px "Courier New", monospace`; x2.textAlign = 'center'; x2.textBaseline = 'middle';
        x2.fillStyle = color; x2.shadowColor = color; x2.shadowBlur = 8; x2.fillText(text, w / 2, h / 2 + 2); x2.shadowBlur = 0;
      }
      tex.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
async function buildTextures(progress) {
  MAX_ANISO = Math.min(8, G.renderer.capabilities.getMaxAnisotropy());
  try {
    await Promise.race([
      Promise.all(['40px "Gochi Hand"', '34px "Caveat"', '20px "Special Elite"'].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fonts are optional */ }
  const jobs = [
    ['the floorboards', () => { TEX.floor = genWoodFloor(); }],
    ['the wallpaper', () => { TEX.wallpaper = genWallpaper(); TEX.beadboard = genBeadboard(); }],
    ['the ceiling', () => { TEX.plaster = genPlaster(); TEX.paint = genPaint(); }],
    ['the bathroom', () => { TEX.tileFloor = genTiles(); TEX.tileWall = genTiles({ seed: 72, n: 4, base: [0.62, 0.76, 0.68], grout: [0.5, 0.52, 0.48], gloss: 0.12, cracks: 1 }); }],
    ['the kitchen', () => { TEX.lino = genLinoleum(); TEX.carpet = genCarpet(); }],
    ['the furniture', () => { TEX.grain = genGrain(); TEX.fabric = genFabric(); TEX.rug = genRug(); TEX.wool = genWool(); }],
    ['her', () => { TEX.skin = genSkin(); TEX.hair = genHair(); TEX.mask = genMomMask(); TEX.maskTorn = { map: genMomMask(true).map, normalMap: TEX.mask.normalMap }; }],
    ['what she leaves behind', () => { TEX.blood = { hands: genBlood('hands'), letmein: genBlood('letmein'), mirror: genBlood('mirror'), drag: genBlood('drag') }; TEX.sheet = genSheet(); }],
    ['the photographs', () => {
      TEX.photos = {};
      for (const k of ['nurse', 'beach', 'school']) TEX.photos[k] = [0, 1, 2].map(v => genPhoto(k, v));
    }],
    ['the drawings', () => {
      TEX.drawings = { meandmom: genDrawing('meandmom'), momwork: genDrawing('momwork'), lady: genDrawing('lady'), wantsmom: genDrawing('wantsmom') };
      TEX.scrawl = genScrawl(); TEX.momSign = genSign("MOM'S ROOM", 'shhh sleeping'); TEX.noteThumb = genNoteThumb();
      TEX.posterDino = genPoster('dino'); TEX.posterSpace = genPoster('space');
    }],
    ['the night outside', () => {
      TEX.clock = genClockFace(); TEX.cookie = genCookie(); TEX.sky = genSky(); TEX.skyDawn = genDawnSky();
      TEX.mirrorDirt = genMirrorDirt(); TEX.dot = genSoftDot();
      TEX.corridorCarpet = genCorridorCarpet(); TEX.dropCeiling = genDropCeiling();
      TEX.exit = genLabel('EXIT', { w: 256, h: 112, bg: '#2a0505', fg: '#ff3b2f', font: 'bold 78px Arial, sans-serif' });
      TEX.plates = { '2A': genLabel('2A'), '2C': genLabel('2C'), '2D': genLabel('2D'), '2E': genLabel('2E'), '2B': genLabel('2B') };
    }],
  ];
  for (let i = 0; i < jobs.length; i++) {
    progress(i / jobs.length, `drawing ${jobs[i][0]}…`);
    await nextFrame();
    jobs[i][1]();
  }
  progress(1, 'listening…');
}
