// ---------------------------------------------------------------------------
// world: materials, static batching, rooms, doors, windows, lights, collision
// ---------------------------------------------------------------------------
const H = 2.7;          // ceiling height
const T2 = 0.06;        // half wall thickness (each room owns a 6 cm skin)
const LAYER_OUTSIDE = 1; // lights only rendered for the peephole / open front door

const ROOMS = {
  hall: { x0: 0.06, x1: 10.94, z0: -0.6, z1: 0.6 },
  closet: { x0: 0.81, x1: 1.79, z0: -1.44, z1: -0.72 },
  bedroom: { x0: 2.46, x1: 6.34, z0: -4.14, z1: -0.72 },
  bath: { x0: 6.96, x1: 9.54, z0: -3.14, z1: -0.72 },
  living: { x0: 1.66, x1: 10.94, z0: 0.72, z1: 6.14 },
  mom: { x0: 11.06, x1: 14.54, z0: -2.54, z1: 2.54 },
  corridor: { x0: -9.94, x1: -0.06, z0: -0.6, z1: 0.6 },
};

function roomAt(x, z) {
  for (const k in ROOMS) { const r = ROOMS[k]; if (x >= r.x0 - 0.03 && x <= r.x1 + 0.03 && z >= r.z0 - 0.03 && z <= r.z1 + 0.03) return k === 'living' && x > 7.6 ? 'kitchen' : k; }
  return null;
}
function surfaceAt(x, z) {
  const r = roomAt(x, z);
  return r === 'bedroom' || r === 'mom' || r === 'corridor' ? 'carpet' : r === 'bath' ? 'tile' : r === 'kitchen' ? 'lino' : 'wood';
}

// ---------------------------------------------------------------------------
const M = {};
function mat(params, uv = { su: 1, sv: 1 }) { const m = new THREE.MeshStandardMaterial(params); m.userData.uv = uv; return m; }
const V2 = (x, y = x) => new THREE.Vector2(x, y);

function buildMaterials() {
  const T = TEX;
  const paint = (color, extra = {}, uv = { su: 1.5, sv: 1.5 }) => mat({ map: T.paint.map, normalMap: T.paint.normalMap, roughnessMap: T.paint.roughnessMap, normalScale: V2(0.4), color, ...extra }, uv);
  M.floor = mat({ map: T.floor.map, normalMap: T.floor.normalMap, roughnessMap: T.floor.roughnessMap, normalScale: V2(0.55) }, { su: 1.2, sv: 1.2 });
  M.wallpaper = mat({ map: T.wallpaper.map, normalMap: T.wallpaper.normalMap, roughnessMap: T.wallpaper.roughnessMap, normalScale: V2(0.6) }, { su: 0.9, sv: 2.7 });
  M.beadboard = mat({ map: T.beadboard.map, normalMap: T.beadboard.normalMap, roughnessMap: T.beadboard.roughnessMap, normalScale: V2(0.8) }, { su: 0.64, sv: 0.9 });
  M.trim = paint(0xc6bea9, { roughness: 0.55, roughnessMap: null });
  M.ceiling = mat({ map: T.plaster.map, normalMap: T.plaster.normalMap, normalScale: V2(0.5), roughness: 0.95 }, { su: 2, sv: 2 });
  M.paintBlue = paint(0x92a8bb);
  M.paintWarm = paint(0xc4b48c);
  M.paintMint = paint(0xc9d8cd);
  M.paintMauve = paint(0x8e7884);
  M.paintPlain = paint(0xb3ad9d);
  M.corrUpper = paint(0xb3a684);
  M.corrLower = paint(0x34473f, { roughness: 0.55, roughnessMap: null });
  M.carpetBlue = mat({ map: T.carpet.map, normalMap: T.carpet.normalMap, normalScale: V2(0.5), color: 0x5f6f82, roughness: 1 }, { su: 1, sv: 1 });
  M.carpetMom = mat({ map: T.carpet.map, normalMap: T.carpet.normalMap, normalScale: V2(0.5), color: 0x6e5c62, roughness: 1 }, { su: 1, sv: 1 });
  M.tileFloor = mat({ map: T.tileFloor.map, normalMap: T.tileFloor.normalMap, roughnessMap: T.tileFloor.roughnessMap }, { su: 0.6, sv: 0.6 });
  M.tileWall = mat({ map: T.tileWall.map, normalMap: T.tileWall.normalMap, roughnessMap: T.tileWall.roughnessMap }, { su: 0.6, sv: 0.6 });
  M.lino = mat({ map: T.lino.map, roughnessMap: T.lino.roughnessMap }, { su: 0.6, sv: 0.6 });
  M.corrCarpet = mat({ map: T.corridorCarpet.map, roughness: 1 }, { su: 1.2, sv: 1.2 });
  M.dropCeiling = mat({ map: T.dropCeiling.map, normalMap: T.dropCeiling.normalMap, roughness: 0.95 }, { su: 1.2, sv: 1.2 });
  const wood = (color, rough = 0.55, su = 0.8) => mat({ map: T.grain.map, normalMap: T.grain.normalMap, normalScale: V2(0.4), color, roughness: rough }, { su, sv: su });
  M.woodDark = wood(0x6a4a33);
  M.woodMid = wood(0x9a7150);
  M.woodLight = wood(0xc8aa80, 0.6);
  M.paintedWood = paint(0xcfc6b0, { roughness: 0.52, roughnessMap: null }, { su: 0.8, sv: 0.8 });
  M.doorPaint = paint(0xc8c0aa, { roughness: 0.5, roughnessMap: null }, { su: 1, sv: 2 });
  M.frontDoor = paint(0x5a2a22, { roughness: 0.38, roughnessMap: null }, { su: 1, sv: 2 });
  M.corrDoor = paint(0x4b5560, { roughness: 0.4, roughnessMap: null }, { su: 1, sv: 2 });
  M.brass = mat({ color: 0xb48f55, metalness: 0.85, roughness: 0.32 });
  M.chrome = mat({ color: 0xd0d4d8, metalness: 0.95, roughness: 0.16 });
  M.steel = mat({ color: 0x8b9095, metalness: 0.7, roughness: 0.42 });
  M.blackPlastic = mat({ color: 0x141414, roughness: 0.42 });
  // whites are a little dirty and a little matte: under a flashlight at arm's length they must not read as pure white
  M.whitePlastic = mat({ color: 0xc9c4b5, roughness: 0.56 });
  M.beigePlastic = mat({ color: 0xbdb193, roughness: 0.52 });
  M.ceramic = mat({ color: 0xd8d5cb, roughness: 0.3 });
  const fabric = (color, su = 0.5) => mat({ map: T.fabric.map, normalMap: T.fabric.normalMap, normalScale: V2(0.6), color, roughness: 0.96 }, { su, sv: su });
  M.fabRed = fabric(0x7b2f2a); M.fabGreen = fabric(0x4f5e45); M.fabBeige = fabric(0xb3a487); M.fabBlue = fabric(0x3c557f); M.fabGray = fabric(0x77746d);
  M.fabCurtain = fabric(0x6d7f8f); M.fabCurtainLiving = fabric(0x8a6a4a);
  M.mattress = fabric(0xe2ddcf, 0.3);
  M.coat = mat({ map: T.wool.map, normalMap: T.wool.normalMap, color: 0x3a332e, roughness: 0.95 }, { su: 0.4, sv: 0.4 });
  M.raincoat = mat({ color: 0xd9a51f, roughness: 0.35 });
  M.rug = mat({ map: T.rug.map, roughness: 1 }, { su: 1.2, sv: 0.76, ov: 0.5 });
  M.paper = mat({ color: 0xd9d1bd, roughness: 0.9 });
  M.dark = mat({ color: 0x0a0a0a, roughness: 0.9 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x8aa0b0, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false });
  M.mirrorBack = mat({ color: 0x222222, roughness: 0.4, metalness: 0.4 });
  M.bulbOff = mat({ color: 0xe8e2d0, roughness: 0.2, transparent: true, opacity: 0.85 });
  for (const k in M) M[k].userData.name = k;
}

// ---------------------------------------------------------------------------
// static geometry batching: one merged mesh per material, world-space UVs
// ---------------------------------------------------------------------------
function projUV(x, y, z, nx, ny, nz, uv) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  let u, v;
  if (ay >= ax && ay >= az) { u = x; v = ny > 0 ? -z : z; }
  else if (ax >= az) { u = nx > 0 ? -z : z; v = y; }
  else { u = nz > 0 ? x : -x; v = y; }
  return [u / uv.su + (uv.ou || 0), v / uv.sv + (uv.ov || 0)];
}

class Batch {
  constructor() { this.groups = new Map(); }
  arr(m) { let g = this.groups.get(m); if (!g) { g = { p: [], n: [], u: [] }; this.groups.set(m, g); } return g; }
  quad(m, a, b, c, d, n) {
    if (!m) return;
    const g = this.arr(m), uv = m.userData.uv || { su: 1, sv: 1 };
    for (const p of [a, b, c, a, c, d]) {
      g.p.push(p[0], p[1], p[2]); g.n.push(n[0], n[1], n[2]);
      const [u, v] = projUV(p[0], p[1], p[2], n[0], n[1], n[2], uv); g.u.push(u, v);
    }
  }
  // axis-aligned box; mats = material or {px,nx,py,ny,pz,nz,def}
  box(x0, y0, z0, x1, y1, z1, mats) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const f = k => (mats && mats.isMaterial) ? mats : (mats[k] !== undefined ? mats[k] : mats.def);
    this.quad(f('px'), [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad(f('nx'), [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad(f('py'), [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    this.quad(f('ny'), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    this.quad(f('pz'), [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad(f('nz'), [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }
  // any geometry, transformed; uv 'keep' uses the geometry's own uvs
  geo(m, geometry, matrix, keepUV = false) {
    const g2 = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g2.applyMatrix4(matrix);
    if (!g2.attributes.normal) g2.computeVertexNormals();
    const P = g2.attributes.position.array, N = g2.attributes.normal.array, U = g2.attributes.uv?.array;
    const g = this.arr(m), uv = m.userData.uv || { su: 1, sv: 1 };
    for (let i = 0; i < P.length / 3; i++) {
      g.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); g.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      if (keepUV && U) g.u.push(U[i * 2], U[i * 2 + 1]);
      else { const [u, v] = projUV(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], uv); g.u.push(u, v); }
    }
    g2.dispose();
  }
  build(parent, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [m, g] of this.groups) {
      if (!g.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = cast && !m.transparent; mesh.receiveShadow = receive;
      parent.add(mesh); meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
function TRS(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), V3(sx, sy, sz));
}

// ---------------------------------------------------------------------------
// collision (2D AABBs on the floor plane)
// ---------------------------------------------------------------------------
const COLLIDERS = [];
function addCollider(x0, z0, x1, z1, tag) {
  const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), on: true, tag };
  COLLIDERS.push(c); return c;
}
// does the segment (ax,az)->(bx,bz) cross a solid collider? (used for sight lines)
function segmentBlocked(ax, az, bx, bz, ignoreTag) {
  const dx = bx - ax, dz = bz - az;
  for (const c of COLLIDERS) {
    if (!c.on || c.tag === 'furniture' || (ignoreTag && c.tag === ignoreTag)) continue;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, dx, c.x0, c.x1], [az, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1 && t1 > 0) return true;
  }
  return false;
}

// distance along a 2D ray to the first wall/door (Infinity if none within maxD)
function rayDist2D(ox, oz, dx, dz, maxD = 2, furniture = false) {
  let best = maxD;
  for (const c of COLLIDERS) {
    if (!c.on || (c.tag === 'furniture' && !furniture)) continue;
    let t0 = 0, t1 = best;
    let hit = true;
    for (const [p, d, lo, hi] of [[ox, dx, c.x0, c.x1], [oz, dz, c.z0, c.z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
      let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { hit = false; break; }
    }
    if (hit && t0 < best) best = t0;
  }
  return best;
}

// ---------------------------------------------------------------------------
// interactables: invisible boxes hit by a ray from the eye
// ---------------------------------------------------------------------------
const INTERACT = [];
function addInteract(o) { o.half = o.half || V3(0.15, 0.15, 0.15); o.range = o.range || 1.75; INTERACT.push(o); return o; }
function rayBox(o, d, c, h) {
  let t0 = 0, t1 = 1e9;
  for (const k of ['x', 'y', 'z']) {
    const inv = 1 / (d[k] || 1e-9);
    let a = (c[k] - h[k] - o[k]) * inv, b = (c[k] + h[k] - o[k]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}
function findInteract(origin, dir) {
  let best = null, bt = 1e9;
  for (const o of INTERACT) {
    if (o.enabled === false) continue;
    const t = rayBox(origin, dir, o.pos, o.half);
    if (t < 0 || t > o.range || t >= bt) continue;
    const label = o.label();
    if (!label) continue;
    if (segmentBlocked(origin.x, origin.z, origin.x + dir.x * t * 0.85, origin.z + dir.z * t * 0.85)) continue;
    best = o; bt = t;
  }
  return best;
}

// ---------------------------------------------------------------------------
// rooms: each room owns inward-facing wall skins with openings + trims
// ---------------------------------------------------------------------------
function sideBox(B, r, side, a, b, ya, yb, d0, d1, mats) {
  switch (side) {
    case 'n': return B.box(a, ya, r.z0 + d0, b, yb, r.z0 + d1, mats);
    case 's': return B.box(a, ya, r.z1 - d1, b, yb, r.z1 - d0, mats);
    case 'w': return B.box(r.x0 + d0, ya, a, r.x0 + d1, yb, b, mats);
    case 'e': return B.box(r.x1 - d1, ya, a, r.x1 - d0, yb, b, mats);
  }
}
const INNER_FACE = { n: 'pz', s: 'nz', w: 'px', e: 'nx' };

function buildRoom(B, r, cfg) {
  for (const side of ['n', 's', 'w', 'e']) {
    const wc = { ...cfg.wall, ...(cfg.sides?.[side] || {}) };
    if (wc.skip) continue;
    const ops = (cfg.openings?.[side] || []).slice().sort((p, q) => p.a0 - q.a0);
    const ns = side === 'n' || side === 's';
    const A0 = ns ? r.x0 - T2 : r.z0, A1 = ns ? r.x1 + T2 : r.z1;
    const I0 = ns ? r.x0 : r.z0, I1 = ns ? r.x1 : r.z1;
    const pieces = [];
    let cur = A0;
    for (const o of ops) {
      if (o.a0 > cur) pieces.push([cur, o.a0, 0, H]);
      if (o.y0 > 0) pieces.push([o.a0, o.a1, 0, o.y0]);
      if (o.y1 < H) pieces.push([o.a0, o.a1, o.y1, H]);
      cur = o.a1;
    }
    if (cur < A1) pieces.push([cur, A1, 0, H]);
    for (const [a, b, y0, y1] of pieces) {
      const ys = [y0];
      if (wc.low && wc.lowH > y0 + 1e-4 && wc.lowH < y1 - 1e-4) ys.push(wc.lowH);
      ys.push(y1);
      for (let k = 0; k < ys.length - 1; k++) {
        const face = wc.low && ys[k + 1] <= wc.lowH + 1e-4 ? wc.low : wc.mat;
        sideBox(B, r, side, a, b, ys[k], ys[k + 1], -T2, 0, { def: M.trim, [INNER_FACE[side]]: face });
      }
    }
    // collision
    let c0 = A0;
    const col = (a, b) => {
      if (b - a < 0.01) return;
      if (side === 'n') addCollider(a, r.z0 - T2, b, r.z0, 'wall');
      else if (side === 's') addCollider(a, r.z1, b, r.z1 + T2, 'wall');
      else if (side === 'w') addCollider(r.x0 - T2, a, r.x0, b, 'wall');
      else addCollider(r.x1, a, r.x1 + T2, b, 'wall');
    };
    for (const o of ops) { if (o.y0 > 0.01) continue; col(c0, o.a0); c0 = o.a1; }
    col(c0, A1);
    // trims: baseboard / chair rail / crown + casings
    const runs = (exclude) => {
      const out = []; let s = I0;
      for (const o of ops) { if (!exclude(o)) continue; const e0 = o.a0 - (o.y0 < 0.01 ? 0.07 : 0.1); if (e0 > s) out.push([s, e0]); s = Math.max(s, o.a1 + (o.y0 < 0.01 ? 0.07 : 0.1)); }
      if (s < I1) out.push([s, I1]);
      return out;
    };
    if (wc.base !== false) for (const [a, b] of runs(o => o.y0 < 0.01)) sideBox(B, r, side, a, b, 0, 0.11, 0, 0.014, wc.baseMat || M.trim);
    if (wc.low && wc.rail !== false) for (const [a, b] of runs(o => o.y0 < wc.lowH)) sideBox(B, r, side, a, b, wc.lowH - 0.03, wc.lowH + 0.025, 0, 0.022, M.trim);
    if (wc.crown) for (const [a, b] of runs(() => false)) { sideBox(B, r, side, a, b, H - 0.07, H, 0, 0.022, M.trim); sideBox(B, r, side, a, b, H - 0.035, H, 0.022, 0.034, M.trim); }
    for (const o of ops) {
      if (o.noCasing) continue;
      const cw = 0.07, cd = 0.018;
      if (o.y0 < 0.01) {
        sideBox(B, r, side, o.a0 - cw, o.a0, 0, o.y1 + 0.07, 0, cd, M.trim);
        sideBox(B, r, side, o.a1, o.a1 + cw, 0, o.y1 + 0.07, 0, cd, M.trim);
        sideBox(B, r, side, o.a0 - cw, o.a1 + cw, o.y1, o.y1 + 0.085, 0, cd + 0.006, M.trim);
      } else {
        sideBox(B, r, side, o.a0 - cw, o.a0, o.y0 - 0.06, o.y1 + 0.07, 0, cd, M.trim);
        sideBox(B, r, side, o.a1, o.a1 + cw, o.y0 - 0.06, o.y1 + 0.07, 0, cd, M.trim);
        sideBox(B, r, side, o.a0 - cw, o.a1 + cw, o.y1, o.y1 + 0.085, 0, cd + 0.006, M.trim);
        sideBox(B, r, side, o.a0 - 0.1, o.a1 + 0.1, o.y0 - 0.03, o.y0, -T2, 0.075, M.trim);   // stool
        sideBox(B, r, side, o.a0 - 0.06, o.a1 + 0.06, o.y0 - 0.12, o.y0 - 0.03, 0, 0.016, M.trim); // apron
      }
    }
  }
  if (cfg.floor) for (const f of [].concat(cfg.floor)) {
    const fx0 = f.x0 ?? (r.x0 - T2), fx1 = f.x1 ?? (r.x1 + T2);
    B.box(fx0, -0.1, r.z0 - T2, fx1, 0, r.z1 + T2, { def: null, py: f.mat || f });
  }
  if (cfg.ceil) B.box(r.x0 - T2, H, r.z0 - T2, r.x1 + T2, H + 0.1, r.z1 + T2, { def: null, ny: cfg.ceil });
}

// ---------------------------------------------------------------------------
// doors (dynamic): pivot at the hinge; t=0 closed, t=1 open
// ---------------------------------------------------------------------------
class Door {
  constructor(o) {
    // o: { hinge:[x,z], base (rad, slab direction when closed), swing (+1/-1), width, height, style, mat, thick }
    Object.assign(this, { height: 2.03, thick: 0.042, style: 'panel', maxAngle: 1.55, t: 0, target: 0, speed: 2.2, locked: false }, o);
    this.pivot = new THREE.Group();
    this.pivot.position.set(o.hinge[0], 0, o.hinge[1]);
    this.pivot.rotation.y = this.base;
    this.leaf = new THREE.Group(); this.pivot.add(this.leaf);
    const B = new Batch(), w = this.width, h = this.height, th = this.thick, m = this.mat || M.doorPaint;
    if (this.style === 'louver') {
      B.box(0, 0.02, -th / 2, 0.06, h, th / 2, m); B.box(w - 0.06, 0.02, -th / 2, w, h, th / 2, m);
      B.box(0.06, h - 0.08, -th / 2, w - 0.06, h, th / 2, m); B.box(0.06, 0.02, -th / 2, w - 0.06, 0.16, th / 2, m);
      B.box(0.06, h * 0.52, -th / 2, w - 0.06, h * 0.52 + 0.06, th / 2, m);
      const slat = new THREE.BoxGeometry(w - 0.12, 0.05, 0.006);
      for (let y = 0.2; y < h - 0.1; y += 0.052) { if (Math.abs(y - h * 0.54) < 0.06) continue; B.geo(m, slat, TRS(w / 2, y, 0, -1.05)); }
    } else {
      B.box(0, 0.012, -th / 2, w, h, th / 2, m);
      const panels = this.style === 'front' ? [[0.1, 0.12, 0.45, 0.62], [0.55, 0.12, 0.9, 0.62], [0.1, 0.72, 0.45, 1.3], [0.55, 0.72, 0.9, 1.3], [0.1, 1.42, 0.45, 1.92], [0.55, 1.42, 0.9, 1.92]]
        : [[0.12, 0.14, 0.88, 0.95], [0.12, 1.08, 0.88, 1.9]];
      for (const [u0, v0, u1, v1] of panels) for (const s of [-1, 1]) {
        const x0 = u0 * w, x1 = u1 * w, y0 = v0, y1 = Math.min(v1, h - 0.1);
        B.box(x0, y0, s * th / 2, x1, y1, s * (th / 2 + 0.008), m);
        B.box(x0 + 0.03, y0 + 0.03, s * (th / 2 + 0.008), x1 - 0.03, y1 - 0.03, s * (th / 2 + 0.013), m);
      }
      if (this.knobs !== false) {
        const kx = w - 0.07, ky = 0.98, sph = new THREE.SphereGeometry(0.03, 14, 10), neck = new THREE.CylinderGeometry(0.012, 0.022, 0.05, 10);
        for (const s of [-1, 1]) {
          B.geo(M.brass, neck, TRS(kx, ky, s * (th / 2 + 0.025), Math.PI / 2));
          B.geo(M.brass, sph, TRS(kx, ky, s * (th / 2 + 0.06)));
          B.geo(M.brass, new THREE.CylinderGeometry(0.035, 0.035, 0.006, 16), TRS(kx, ky, s * (th / 2 + 0.003), Math.PI / 2));
        }
      }
      for (const y of [0.22, 1.0, h - 0.24]) B.box(-0.006, y, -th / 2 - 0.002, 0.012, y + 0.09, th / 2 + 0.002, M.brass);
    }
    this.meshes = B.build(this.leaf);
    this.collider = null;
  }
  set(t, instant = false) { this.target = clamp(t, 0, 1); if (instant) { this.t = this.target; this.apply(); } }
  slam() { this.target = 0; this.speed = 9; this._slam = true; }
  apply() {
    this.pivot.rotation.y = this.base + this.swing * this.maxAngle * this.t;
    if (this.collider) this.collider.on = this.t < 0.2;
  }
  update(dt) {
    if (this.jitter > 0) { this.jitter -= dt; this.pivot.rotation.y = this.base + this.swing * this.maxAngle * this.t + Math.sin(G.time * 70) * 0.004; return; }
    if (Math.abs(this.t - this.target) < 1e-4) return;
    const d = this.target - this.t, step = this.speed * dt;
    this.t = Math.abs(d) <= step ? this.target : this.t + Math.sign(d) * step * (0.35 + 0.65 * Math.min(1, Math.abs(d) * 3));
    if (this._slam && this.t === 0) { this._slam = false; this.speed = 2.2; this.jitter = 0.15; }
    this.apply();
  }
}

// ---------------------------------------------------------------------------
// shared shader materials: sky backdrop (lightning / dawn) + rain on glass
// ---------------------------------------------------------------------------
const SKY_U = { map: { value: null }, dawn: { value: null }, mixDawn: { value: 0 }, bright: { value: 0.55 } };
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SKY_U, fog: false, depthWrite: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D map; uniform sampler2D dawn; uniform float mixDawn; uniform float bright; varying vec2 vUv;
      void main(){
        vec3 a = texture2D(map, vUv).rgb; vec3 b = texture2D(dawn, vUv).rgb; vec3 c = mix(a, b, mixDawn) * bright;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
const RAIN_U = { time: { value: 0 }, rain: { value: 1 }, flash: { value: 0 } };
function rainGlassMaterial(aspect) {
  return new THREE.ShaderMaterial({
    uniforms: { ...RAIN_U, aspect: { value: aspect } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform float rain; uniform float flash; uniform float aspect; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv * vec2(aspect, 1.0) * 7.0;
        vec2 g = floor(uv); vec2 f = fract(uv) - 0.5;
        vec2 o = vec2(h(g), h(g + 3.1)) - 0.5;
        float d = length((f - o * 0.6) * vec2(1.0, 0.8));
        float stat = smoothstep(0.11, 0.04, d) * step(0.45, h(g + 7.7));
        float col = floor(uv.x * 1.6); float sp = 0.35 + h(vec2(col, 1.0));
        float y = fract(vUv.y * 1.3 + time * sp * 0.12 + h(vec2(col, 2.0)));
        float xin = fract(uv.x * 1.6) - 0.5 - (h(vec2(col, 3.0)) - 0.5) * 0.5;
        float run = smoothstep(0.07, 0.0, abs(xin)) * smoothstep(0.0, 0.02, y) * smoothstep(0.06, 0.02, y);
        float trail = smoothstep(0.035, 0.0, abs(xin)) * smoothstep(0.06, 0.6, y) * 0.35 * step(0.5, h(vec2(col, 4.0)));
        float a = (stat + run + trail) * rain;
        vec3 c = vec3(0.55, 0.62, 0.7) * (0.25 + flash * 3.0);
        gl_FragColor = vec4(c, a * 0.4);
        #include <colorspace_fragment>
      }`,
  });
}

// window in a room side; adds frame, glass, rain, curtains and a sky backdrop outside
function buildWindow(B, parent, r, side, a0, a1, y0, y1, o = {}) {
  const ns = side === 'n' || side === 's';
  const wall = side === 'n' ? r.z0 - T2 : side === 's' ? r.z1 + T2 : side === 'w' ? r.x0 - T2 : r.x1 + T2; // outer face
  const inner = side === 'n' ? r.z0 : side === 's' ? r.z1 : side === 'w' ? r.x0 : r.x1;
  const mid = (wall + inner) / 2, wdt = a1 - a0, hgt = y1 - y0, fw = 0.045;
  const at = (a, y, d) => ns ? [a, y, d] : [d, y, a];
  const bx = (a, ya, d0, b, yb, d1, m) => { const p = at(a, ya, d0), q = at(b, yb, d1); B.box(p[0], p[1], p[2], q[0], q[1], q[2], m); };
  // frame + sashes
  bx(a0, y0, wall, a0 + fw, y1, inner, M.paintedWood); bx(a1 - fw, y0, wall, a1, y1, inner, M.paintedWood);
  bx(a0, y1 - fw, wall, a1, y1, inner, M.paintedWood); bx(a0, y0, wall, a1, y0 + fw, inner, M.paintedWood);
  const ym = y0 + hgt * 0.5;
  bx(a0, ym - 0.025, mid - 0.025, a1, ym + 0.025, mid + 0.02, M.paintedWood);
  const am = (a0 + a1) / 2;
  bx(am - 0.012, y0, mid - 0.012, am + 0.012, y1, mid + 0.012, M.paintedWood);
  bx(a0, y0 + hgt * 0.25 - 0.01, mid - 0.01, a1, y0 + hgt * 0.25 + 0.01, mid + 0.01, M.paintedWood);
  bx(a0, y0 + hgt * 0.75 - 0.01, mid - 0.01, a1, y0 + hgt * 0.75 + 0.01, mid + 0.01, M.paintedWood);
  // glass + rain
  const gGeo = new THREE.PlaneGeometry(wdt - fw * 2, hgt - fw * 2);
  const rot = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'w' ? Math.PI / 2 : -Math.PI / 2;
  const cx = ns ? am : mid, cz = ns ? mid : am, cy = (y0 + y1) / 2;
  const glass = new THREE.Mesh(gGeo, M.glass); glass.position.set(cx, cy, cz); glass.rotation.y = rot; parent.add(glass);
  const rain = new THREE.Mesh(gGeo, rainGlassMaterial(wdt / hgt)); rain.position.copy(glass.position); rain.rotation.y = rot;
  const inward = side === 'n' ? V3(0, 0, 1) : side === 's' ? V3(0, 0, -1) : side === 'w' ? V3(1, 0, 0) : V3(-1, 0, 0);
  rain.position.addScaledVector(inward, 0.004); rain.renderOrder = 2; parent.add(rain);
  // sky backdrop far outside
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(o.skyW || 36, 16), skyMaterial());
  const outDist = o.skyDist || 9;
  sky.position.set(cx - inward.x * outDist, 3.2, cz - inward.z * outDist);
  sky.rotation.y = rot; parent.add(sky);
  // curtains
  if (o.curtain) {
    const cm = o.curtain, rodY = y1 + 0.16, rodD = inner + (side === 'n' || side === 'w' ? 0.12 : -0.12);
    const rodLen = wdt + 0.5;
    const rod = new THREE.CylinderGeometry(0.012, 0.012, rodLen, 8);
    B.geo(M.brass, rod, ns ? TRS(am, rodY, rodD, 0, 0, Math.PI / 2) : TRS(rodD, rodY, am, Math.PI / 2, 0, 0));
    for (const s of [-1, 1]) {
      const cwid = wdt * 0.36, ch = rodY - y0 + 0.25, cgeo = new THREE.PlaneGeometry(cwid, ch, 18, 1);
      const P = cgeo.attributes.position, UV = cgeo.attributes.uv;
      for (let i = 0; i < P.count; i++) { P.setZ(i, Math.sin(P.getX(i) / cwid * 9 * Math.PI) * 0.025); UV.setXY(i, UV.getX(i) * cwid / 0.4, UV.getY(i) * ch / 0.4); }
      cgeo.computeVertexNormals();
      const cmesh = new THREE.Mesh(cgeo, cm); cmesh.material.side = THREE.DoubleSide;
      const ca = s < 0 ? a0 + cwid / 2 - 0.15 : a1 - cwid / 2 + 0.15;
      cmesh.position.set(ns ? ca : rodD, (rodY + y0 - 0.25) / 2, ns ? rodD : ca);
      cmesh.rotation.y = rot; cmesh.castShadow = true; cmesh.receiveShadow = true;
      parent.add(cmesh);
      (W.curtains ||= []).push({ mesh: cmesh, base: cmesh.position.clone(), phase: Math.random() * 10, win: o.name, s, axis: ns ? 'x' : 'z', w: cwid, open: 0, target: 0 });
    }
  }
  return { center: V3(cx, cy, cz), inward, glass, rain, sky };
}

// ---------------------------------------------------------------------------
// lights
// ---------------------------------------------------------------------------
const L = {};
function buildLights(scene) {
  L.hemi = new THREE.HemisphereLight(0x2a3a4e, 0x0e0b09, 0.3); scene.add(L.hemi);
  // flashlight (owned by the player rig, created here so shaders compile once)
  L.flash = new THREE.SpotLight(0xffeccc, 0, 16, 0.5, 0.55, 1.25);
  L.flash.map = TEX.cookie; L.flash.castShadow = true;
  L.flash.shadow.mapSize.set(1024, 1024); L.flash.shadow.camera.near = 0.08; L.flash.shadow.camera.far = 15; L.flash.shadow.bias = -0.0004; L.flash.shadow.normalBias = 0.025;
  scene.add(L.flash, L.flash.target);
  // sky light through the south windows: lightning, then sunrise
  L.sky = new THREE.DirectionalLight(0xbfd4ff, 0);
  L.sky.position.set(1.3, 7.5, 16); L.sky.target.position.set(2.3, 0, 2);
  L.sky.castShadow = true; L.sky.shadow.mapSize.set(2048, 2048);
  const sc = L.sky.shadow.camera; sc.left = -13.5; sc.right = 13.5; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 45;
  L.sky.shadow.bias = -0.0006; L.sky.shadow.normalBias = 0.03; L.sky.shadow.autoUpdate = false; L.sky.shadow.needsUpdate = true;
  scene.add(L.sky, L.sky.target);
  L.bedFlash = new THREE.PointLight(0xbfd4ff, 0, 5.5, 1.5); L.bedFlash.position.set(4.4, 1.9, -4.9); scene.add(L.bedFlash);
  L.night = new THREE.PointLight(0xa8c4ff, 1.8, 5, 1.6); scene.add(L.night);
  L.hall = new THREE.PointLight(0xffd29a, 0, 7.5, 1.6); L.hall.position.set(5.6, 2.45, 0); scene.add(L.hall);
  L.door = new THREE.PointLight(0xd6f0d4, 0.0, 1.4, 1.5); L.door.position.set(0.16, 0.05, 0); scene.add(L.door);
  L.tv = new THREE.PointLight(0x9fb6ff, 0, 5, 1.6); scene.add(L.tv);
  L.warm = new THREE.PointLight(0xffc890, 0, 6, 1.5); scene.add(L.warm); // used for dawn bounce / ending
  L.candle = new THREE.PointLight(0xffa24a, 0, 3.4, 2); scene.add(L.candle); // follows the nearest lit candle
  L.corr1 = new THREE.PointLight(0xe6f4ee, 4, 6, 1.4); L.corr1.position.set(-2.2, 2.35, 0);
  L.corr2 = new THREE.PointLight(0xe6f4ee, 2.5, 6, 1.4); L.corr2.position.set(-6.6, 2.35, 0);
  L.exit = new THREE.PointLight(0xff2a20, 0.6, 2.5, 1.5); L.exit.position.set(-9.6, 2.2, 0);
  for (const l of [L.corr1, L.corr2, L.exit]) { l.layers.set(LAYER_OUTSIDE); scene.add(l); }
}
