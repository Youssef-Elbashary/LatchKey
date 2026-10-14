// ---------------------------------------------------------------------------
// her: a tall thing in Mom's coat wearing Mom's face cut from a photograph
// ---------------------------------------------------------------------------
const NAV = {
  nodes: {
    H0: [0.45, 0], H1: [1.3, 0], H2: [2.6, 0], H3: [4.2, 0], H4: [5.7, 0], H5: [8.0, 0], H6: [10.3, 0],
    BD: [4.2, -0.66], B1: [4.3, -1.6], B2: [4.6, -3.0], TD: [8.0, -0.66], T1: [8.0, -1.5], T2: [8.0, -2.05],
    AR: [5.7, 0.66], L1: [5.7, 1.8], L2: [3.6, 2.3], L3: [6.0, 4.2], K1: [8.0, 2.0], K2: [9.6, 4.4], K3: [9.8, 2.0],
    MD: [11, 0], M1: [12.0, 0],
  },
  edges: 'H0-H1 H1-H2 H2-H3 H3-H4 H4-H5 H5-H6 H6-MD MD-M1 H3-BD BD-B1 B1-B2 H5-TD TD-T1 T1-T2 H4-AR AR-L1 L1-L2 L1-L3 L1-K1 K1-K3 K1-K2 L3-K2'.split(' ').map(e => e.split('-')),
};
function navNearest(x, z) {
  let best = null, bd = 1e9;
  for (const [k, [nx, nz]] of Object.entries(NAV.nodes)) {
    const d = Math.hypot(nx - x, nz - z) + (segmentBlocked(x, z, nx, nz, 'door') ? 50 : 0);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
function navPath(fx, fz, tx, tz) {
  const a = navNearest(fx, fz), b = navNearest(tx, tz);
  const adj = {}; for (const [p, q] of NAV.edges) { (adj[p] ||= []).push(q); (adj[q] ||= []).push(p); }
  const dist = { [a]: 0 }, prev = {}, open = new Set([a]);
  while (open.size) {
    let u = null; for (const k of open) if (u === null || dist[k] < dist[u]) u = k;
    open.delete(u); if (u === b) break;
    for (const v of adj[u] || []) {
      const [ux, uz] = NAV.nodes[u], [vx, vz] = NAV.nodes[v], nd = dist[u] + Math.hypot(ux - vx, uz - vz);
      if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; open.add(v); }
    }
  }
  const chain = []; let c = b; while (c) { chain.unshift(c); c = prev[c]; }
  const pts = chain.map(k => V3(NAV.nodes[k][0], 0, NAV.nodes[k][1]));
  pts.push(V3(tx, 0, tz));
  // drop the first node if it doesn't help
  if (pts.length > 2 && !segmentBlocked(fx, fz, pts[1].x, pts[1].z, 'door')) pts.shift();
  return pts;
}

const Stalker = {
  group: null, mode: 'hidden', pos: V3(), yaw: 0, speed: 0, path: null, pathSpeed: 1, onArrive: null,
  stare: 0, phaseT: 0, step: 0, lastStep: 0, twitchT: 1, tilt: 0.45, look: null, pose: 'walk', poseK: 0,
  nextBreath: 0, nextCrack: 3, noise: makeNoise1D(7), data: {},
  headWorld: V3(), _frustum: new THREE.Frustum(), _pm: new THREE.Matrix4(),

  build(scene) {
    const g = this.group = new THREE.Group(); g.visible = false; scene.add(g);
    const skin = M.skin;
    const coatM = new THREE.MeshStandardMaterial({ map: TEX.wool.map, normalMap: TEX.wool.normalMap, color: 0x2f2925, roughness: 0.95, side: THREE.DoubleSide });
    const hairM = new THREE.MeshStandardMaterial({ map: TEX.hair.map, color: 0x0b0908, roughness: 0.6, alphaTest: 0.45, side: THREE.DoubleSide });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x050404, roughness: 1 });
    const paperM = this.paperM = new THREE.MeshStandardMaterial({ map: TEX.mask.map, normalMap: TEX.mask.normalMap, normalScale: V2(0.8), roughness: 0.75, alphaTest: 0.5, side: THREE.DoubleSide });
    const add = (parent, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
    const J = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
    const P = this.parts = {};
    P.hips = J(g, 0, 1.12, 0);
    // legs
    for (const s of [-1, 1]) {
      const thigh = J(P.hips, s * 0.09, 0, 0);
      add(thigh, new THREE.CapsuleGeometry(0.05, 0.5, 4, 8), skin, 0, -0.28, 0);
      const shin = J(thigh, 0, -0.56, 0);
      add(shin, new THREE.CapsuleGeometry(0.038, 0.5, 4, 8), skin, 0, -0.27, 0);
      const foot = J(shin, 0, -0.55, 0);
      add(foot, new THREE.BoxGeometry(0.07, 0.035, 0.26), skin, 0, -0.01, 0.07);
      add(foot, new THREE.BoxGeometry(0.06, 0.04, 0.06), darkM, 0, 0.0, -0.05); // heel of Mom's shoe
      P[s < 0 ? 'thighL' : 'thighR'] = thigh; P[s < 0 ? 'shinL' : 'shinR'] = shin;
    }
    // torso + coat
    P.spine = J(P.hips, 0, 0.02, 0);
    const prof = [[0.001, 0.72], [0.12, 0.72], [0.215, 0.66], [0.2, 0.42], [0.165, 0.16], [0.2, -0.1], [0.27, -0.38], [0.33, -0.56], [0.001, -0.56]];
    const coat = add(P.spine, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22), coatM);
    coat.scale.z = 0.62;
    add(P.spine, new THREE.TorusGeometry(0.12, 0.035, 8, 18), coatM, 0, 0.7, 0, Math.PI / 2).scale.set(1, 0.6, 1);
    P.chest = J(P.spine, 0, 0.66, 0);
    // arms (too long; sleeves stop halfway down the forearm)
    for (const s of [-1, 1]) {
      const sh = J(P.chest, s * 0.215, 0.02, 0);
      add(sh, new THREE.CylinderGeometry(0.06, 0.055, 0.44, 10), coatM, 0, -0.21, 0);
      const fore = J(sh, 0, -0.43, 0);
      add(fore, new THREE.CylinderGeometry(0.055, 0.05, 0.22, 10), coatM, 0, -0.1, 0);
      add(fore, new THREE.CapsuleGeometry(0.026, 0.42, 4, 8), skin, 0, -0.24, 0);
      const hand = J(fore, 0, -0.48, 0);
      add(hand, new THREE.BoxGeometry(0.075, 0.1, 0.022), skin, 0, -0.04, 0);
      const fingers = [];
      for (let i = 0; i < 4; i++) {
        let p = J(hand, (i - 1.5) * 0.019, -0.09, 0); const joints = [p];
        for (let k = 0; k < 3; k++) { add(p, new THREE.CapsuleGeometry(0.0075 - k * 0.001, 0.045, 3, 6), skin, 0, -0.03, 0); if (k < 2) { p = J(p, 0, -0.058, 0); joints.push(p); } }
        fingers.push(joints);
      }
      let tp = J(hand, -s * 0.04, -0.03, 0.01); const tj = [tp];
      add(tp, new THREE.CapsuleGeometry(0.008, 0.04, 3, 6), skin, 0, -0.025, 0); tp = J(tp, 0, -0.05, 0); tj.push(tp); add(tp, new THREE.CapsuleGeometry(0.007, 0.035, 3, 6), skin, 0, -0.02, 0);
      fingers.push(tj); tj[0].rotation.z = -s * 0.5;
      P[s < 0 ? 'shL' : 'shR'] = sh; P[s < 0 ? 'foreL' : 'foreR'] = fore; P[s < 0 ? 'handL' : 'handR'] = hand; P[s < 0 ? 'fingL' : 'fingR'] = fingers;
    }
    // neck + head
    P.neck = J(P.chest, 0, 0.06, 0.02);
    add(P.neck, new THREE.CapsuleGeometry(0.034, 0.2, 4, 8), skin, 0, 0.1, 0);
    P.head = J(P.neck, 0, 0.24, 0);
    add(P.head, new THREE.SphereGeometry(0.105, 18, 14), darkM, 0, 0.05, 0).scale.set(1, 1.22, 1);
    const face = new THREE.PlaneGeometry(0.235, 0.29, 8, 8), fp = face.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), y = fp.getY(i); fp.setZ(i, -x * x * 1.8 - y * y * 0.6); }
    face.computeVertexNormals();
    P.face = add(P.head, face, paperM, 0, 0.05, 0.118, -0.05, 0, 0.03);
    const glint = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 3.9, 3.5), fog: false });
    P.eyes = [-1, 1].map(s => add(P.head, new THREE.SphereGeometry(0.0058, 8, 6), glint, s * 0.029, 0.075, 0.095));
    P.eyes.forEach(e => (e.castShadow = false));
    const hair = new THREE.CylinderGeometry(0.115, 0.19, 0.72, 22, 4, true, Math.PI * 0.2, Math.PI * 1.6);
    const hp = hair.attributes.position; for (let i = 0; i < hp.count; i++) hp.setX(i, hp.getX(i) + Math.sin(hp.getY(i) * 9 + i) * 0.006);
    hair.computeVertexNormals();
    add(P.head, hair, hairM, 0, -0.2, -0.01);
    add(P.head, new THREE.SphereGeometry(0.118, 16, 10, 0, TAU, 0, Math.PI * 0.55), hairM, 0, 0.08, -0.005).scale.set(1, 1.15, 1.05);
    for (const s of [-1, 1]) add(P.head, new THREE.PlaneGeometry(0.05, 0.42), hairM, s * 0.125, -0.13, 0.045, 0, s * 0.55, 0);
    this.place(-50, 0, 0);
  },

  // ----- placement / control ---------------------------------------------------
  place(x, z, yaw = this.yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.syncHead(); },
  syncHead() {
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
    this.group.updateMatrixWorld(true);
    this.headWorld.setFromMatrixPosition(this.parts.head.matrixWorld);
  },
  faceTo(x, z) { this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z); },
  show(mode = 'idle') { this.group.visible = true; this.mode = mode; this.stare = 0; this.phaseT = 0; this.pose = 'walk'; this.data = {}; },
  hide() { this.group.visible = false; this.mode = 'hidden'; this.path = null; this.onArrive = null; this.look = null; this.data = {}; this.stopBreath(); },
  walk(points, speed = 0.9, onArrive = null) { this.path = points.map(p => p.clone()); this.pathSpeed = speed; this.onArrive = onArrive; },
  walkTo(x, z, speed, onArrive) { this.walk(navPath(this.pos.x, this.pos.z, x, z), speed, onArrive); },
  stopBreath() { this.nextBreath = 1e9; },
  // the paper face, or the paper face ripped open (deaths only)
  setMask(torn) { const m = this.paperM; if (!m) return; m.map = torn ? TEX.maskTorn.map : TEX.mask.map; m.needsUpdate = true; this.torn = torn; },

  // ----- perception ---------------------------------------------------------------
  // how much the player is looking at her: 0 = not at all, 1 = straight at her face
  seenBy(cam, eyesClosed) {
    if (!this.group.visible || eyesClosed > 0.6) return 0;
    this.syncHead();
    this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._frustum.setFromProjectionMatrix(this._pm);
    const pts = [this.headWorld, _v2.set(this.pos.x, 1.5, this.pos.z), _v3.set(this.pos.x, 0.9, this.pos.z)];
    let vis = 0;
    for (const p of pts) if (this._frustum.containsPoint(p) && !segmentBlocked(cam.position.x, cam.position.z, p.x, p.z)) vis++;
    if (!vis) return 0;
    cam.getWorldDirection(_v1);
    const dir = _v2.copy(this.headWorld).sub(cam.position).normalize();
    const center = smooth(0.55, 0.97, _v1.dot(dir));
    return (vis / 3) * (0.35 + 0.65 * center);
  },
  distTo(p) { return Math.hypot(this.pos.x - p.x, this.pos.z - p.z); },

  // ----- per-frame ---------------------------------------------------------------
  update(dt, P, cam) {
    if (this.mode === 'hidden' && !W.ghostInMirror) return;
    const t = G.time;
    // movement along a path
    let moving = 0;
    if (this.path && this.path.length) {
      const tgt = this.path[0], dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
      const stepLen = this.pathSpeed * dt;
      if (d <= stepLen) { this.pos.x = tgt.x; this.pos.z = tgt.z; this.path.shift(); }
      else { this.pos.x += dx / d * stepLen; this.pos.z += dz / d * stepLen; }
      if (d > 0.05) { const want = Math.atan2(dx, dz); this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 5); }
      moving = this.pathSpeed;
      if (!this.path.length) { this.path = null; const cb = this.onArrive; this.onArrive = null; if (cb) cb(); }
    }
    if (this.look && !moving) { const want = Math.atan2(this.look.x - this.pos.x, this.look.z - this.pos.z); this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * 2.5); }
    this.speed = damp(this.speed, moving, 6, dt);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    // footsteps: slow heels, sometimes dragging
    if (this.speed > 0.1 && this.mode !== 'lunge') {
      this.step += this.speed * dt / 0.62;
      if (this.step - this.lastStep >= 1) {
        this.lastStep = Math.floor(this.step);
        const surf = surfaceAt(this.pos.x, this.pos.z), carpet = surf === 'carpet';
        const run = this.pathSpeed > 1.8;
        A.play(carpet ? 'step_carpet' : 'heel', { pos: _v1.set(this.pos.x, 0.05, this.pos.z), gain: (carpet ? 0.8 : 1.05) * (run ? 1.3 : 1), rate: rand(0.85, 1.0) * (run ? 0.85 : 1), reverb: 0.35, muffle: this.data.muffle || 0, ref: 1.4 });
        if (!run && Math.random() < 0.25) A.play('drag', { pos: _v1.set(this.pos.x, 0.05, this.pos.z), gain: 0.35, reverb: 0.3, when: 0.2 });
        if (!carpet && Math.random() < 0.15) A.play('creakFloor', { pos: _v1.set(this.pos.x, 0.05, this.pos.z), gain: 0.4, reverb: 0.3 });
      }
    }
    this.animate(dt, t, moving);
    this.parts.head.updateWorldMatrix(true, false);
    this.headWorld.setFromMatrixPosition(this.parts.head.matrixWorld);
    // breathing + joints, audible only up close
    if (this.group.visible && this.mode !== 'lunge') {
      if (t >= this.nextBreath) { const inh = !this.data.inh; this.data.inh = inh; A.play(inh ? 'gIn' : 'gOut', { pos: this.headWorld, gain: 0.36, ref: 0.6, roll: 1.8, reverb: 0.2, muffle: this.data.muffle || 0 }); this.nextBreath = t + (inh ? 2.1 : 2.6) + rand(0, 0.6); }
      if ((this.nextCrack -= dt) <= 0) { this.nextCrack = rand(2.5, 7); A.play('crack', { pos: this.headWorld, gain: 0.5, ref: 0.6, roll: 1.6, reverb: 0.2 }); this.twitchT = 0; }
    }
  },

  animate(dt, t, moving) {
    const P = this.parts, n = this.noise;
    const w = this.speed > 0.05 ? 1 : 0;
    const ph = this.step * Math.PI;
    const pk = this.pose;
    this.poseK = damp(this.poseK, pk === 'walk' ? 0 : 1, 5, dt);
    // twitching: rare sharp jerks of the head, settling slowly
    this.twitchT += dt;
    if (this.twitchT > rand(1.5, 4.5) || !this._tw) { this.twitchT = 0; this._tw = { x: rand(-0.25, 0.25), y: rand(-0.5, 0.5), z: rand(-0.35, 0.35) }; }
    const snap = Math.min(1, this.twitchT * 18), tw = this._tw;
    // legs
    const swing = Math.sin(ph) * 0.42 * w;
    P.thighL.rotation.x = swing; P.thighR.rotation.x = -swing;
    P.shinL.rotation.x = Math.max(0, -Math.sin(ph)) * 0.6 * w + 0.05; P.shinR.rotation.x = Math.max(0, Math.sin(ph)) * 0.6 * w + 0.05;
    P.hips.position.y = 1.12 + Math.abs(Math.cos(ph)) * 0.03 * w - this.poseK * (pk === 'peer' ? 0.15 : pk === 'fold' ? 0.08 : 0);
    P.hips.rotation.z = Math.sin(ph) * 0.04 * w;
    // posture
    let spineX = 0.28 + Math.sin(t * 0.9) * 0.02, neckX = 0.1, headZ = this.tilt + tw.z * snap;
    let shX = Math.sin(ph) * 0.12 * w, foreX = -0.25, handX = 0.1, splay = 0.2;
    if (pk === 'peer') { spineX = lerp(spineX, 0.95, this.poseK); neckX = lerp(neckX, -0.55, this.poseK); headZ = lerp(headZ, 0.15, this.poseK); }
    if (pk === 'lunge') { spineX = 0.55 + n(t * 9) * 0.1; shX = -1.45; foreX = -0.15; handX = -0.3; splay = 0.9; headZ = 0.25 + n(t * 23) * 0.25; }
    if (pk === 'reach') { shX = -1.1; foreX = -0.5; splay = 0.6; }
    // folded in half to look under a bed: the head hangs at the floor, turned up to face you
    if (pk === 'fold') { const k = this.poseK; spineX = lerp(spineX, 2.25, k); neckX = lerp(neckX, -2.3, k); headZ = lerp(headZ, 1.0 + n(t * 3) * 0.08, k); shX = lerp(shX, 0.35, k); foreX = -0.05; handX = -0.7; splay = 0.85; }
    P.spine.rotation.x = spineX;
    P.neck.rotation.x = neckX;
    P.head.rotation.set(tw.x * snap * 0.5 + (pk === 'lunge' ? n(t * 31) * 0.15 : 0), tw.y * snap * 0.4, headZ);
    // head looks toward a target if set (only yaw, limited)
    if (this.look && pk !== 'lunge') {
      const want = wrapAngle(Math.atan2(this.look.x - this.pos.x, this.look.z - this.pos.z) - this.yaw);
      P.neck.rotation.y = clamp(want, -1.1, 1.1);
    } else P.neck.rotation.y = 0;
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      P['sh' + s].rotation.x = (pk === 'lunge' || pk === 'reach' || pk === 'fold') ? shX : shX * sg;
      P['sh' + s].rotation.z = sg * (pk === 'lunge' ? 0.35 : 0.08);
      P['fore' + s].rotation.x = foreX + n(t * 0.7 + sg) * 0.08;
      P['hand' + s].rotation.x = handX;
      P['fing' + s].forEach((f, i) => f.forEach((j, k) => {
        const curl = 0.25 + 0.35 * Math.max(0, n(t * 1.3 + i * 0.9 + sg * 3)) + (this.twitchT < 0.2 ? 0.4 : 0);
        j.rotation.x = k === 0 ? -curl * 0.6 : -curl;
        if (k === 0 && i < 4) j.rotation.z = (i - 1.5) * 0.08 * splay * 3;
      }));
    }
  },
};
