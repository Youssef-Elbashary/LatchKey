// ---------------------------------------------------------------------------
// player: a kid. eye height 1.18 m, a flashlight, eyelids and a held breath.
// ---------------------------------------------------------------------------
const FLASH_CD = 8; // beam intensity at range; up close it is capped per surface (Beam)

// ---------------------------------------------------------------------------
// beam cap: five rays down the cone find what the light actually lands on (three-mesh-bvh), and the candela
// is capped so the brightest lit spot stays under white whatever the surface: the fridge, the tub, a door at 20 cm.
// ---------------------------------------------------------------------------
const Beam = {
  ok: false, ray: null, cap: FLASH_CD, center: 2,
  // [right, up, weight]: the off-axis rays sit where the cookie has fallen to ~70%
  taps: [[0, 0, 1], [0.21, 0, 0.72], [-0.21, 0, 0.72], [0, 0.21, 0.72], [0, -0.21, 0.72]],
  L_MAX: 0.55, // target radiance at the spot (linear, before exposure): ~0.85 on screen after ACES
  async init() {
    try {
      const bvh = await Promise.race([import('three-mesh-bvh'), sleep(8000).then(() => null)]);
      if (!bvh || !W.rayMeshes) return;
      THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
      THREE.Mesh.prototype.raycast = bvh.acceleratedRaycast;
      for (const m of W.rayMeshes) m.geometry.computeBoundsTree();
      this.ray = new THREE.Raycaster(); this.ray.firstHitOnly = true; this.ray.far = 7;
      this.ok = true;
    } catch (e) { console.warn('flashlight raycast unavailable', e); }
  },
  // how strongly a surface answers the beam: diffuse albedo/π plus the GGX peak at normal incidence
  reflectance(m) {
    if (m.userData.refl !== undefined) return m.userData.refl;
    const c = m.color || { r: 0.5, g: 0.5, b: 0.5 };
    let alb = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (m.map && m.map.image && m.map.image.width) alb *= texLuminance(m.map);
    if ((m.metalness || 0) > 0.5) alb = 0.25; // chrome taps are tiny: their glints are allowed
    const r = clamp(m.roughness ?? 1, 0.3, 1);
    return (m.userData.refl = alb / Math.PI + 0.01 / (Math.PI * r * r * r * r));
  },
  // the highest candela that keeps every tapped spot under L_MAX
  measure(pos, dir, cam) {
    const right = _v1.set(1, 0, 0).applyQuaternion(cam.quaternion), up = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    let cap = FLASH_CD, center = 7;
    for (const [rx, uy, w] of this.taps) {
      const d = _v3.copy(dir).addScaledVector(right, rx).addScaledVector(up, uy).normalize();
      this.ray.set(pos, d);
      const hit = this.ray.intersectObjects(W.rayMeshes, false)[0];
      if (!hit) continue;
      if (rx === 0 && uy === 0) center = hit.distance;
      const n = hit.face ? _nrm.copy(hit.face.normal).transformDirection(hit.object.matrixWorld) : null;
      const cosI = n ? Math.max(0.25, Math.abs(n.dot(d))) : 1;
      const I = this.L_MAX * Math.pow(Math.max(hit.distance, 0.08), 1.25) / (this.reflectance(hit.object.material) * cosI * w);
      if (I < cap) cap = I;
    }
    this.center = center;
    return Math.max(0.3, cap);
  },
};
const _nrm = new THREE.Vector3();
// mean linear luminance of a canvas texture (cached on the texture)
function texLuminance(tex) {
  if (tex.userData.lum !== undefined) return tex.userData.lum;
  let lum = 0.7;
  try {
    const c = makeCanvas(8, 8), x = ctx2d(c); x.drawImage(tex.image, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data; let s = 0;
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    lum = s / 64; // canvases are authored in sRGB either way
  } catch (e) { /* tainted or not a canvas: keep the guess */ }
  return (tex.userData.lum = lum);
}
const P = {
  pos: V3(3.0, 0, -3.2), yaw: 0, pitch: 0, roll: 0, vx: 0, vz: 0, eye: 1.18, radius: 0.22,
  headPos: V3(), stamina: 1, fear: 0, fearTarget: 0, fearKick: 0, eyesClosed: 0, holdingBreath: false, breath: 1,
  hasFlashlight: false, flashOn: false, flashLevel: 0, flashFlicker: 0, dyingBattery: false,
  mode: 'free', canClose: true, bob: 0, stepPhase: 0, moveDir: V3(0, 0, -1), speed2D: 0, stillTime: 0,
  shake: 0, hover: null, cine: null, lookCenter: 0, lookRange: Math.PI, pitchRange: 1.45, room: 'bedroom',
  flashDir: V3(0, 0, -1), noise: makeNoise1D(3), onGasp: null, onStep: null, viewPos: V3(), eyesScripted: false,

  init(cam) {
    this.cam = cam; cam.rotation.order = 'YXZ';
    // a flashlight body held low on the right, mostly out of frame
    const fl = this.flashModel = new THREE.Group();
    // flat materials: the bulb sits inside this model, so lit materials would glow from within
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 12), new THREE.MeshBasicMaterial({ color: 0x141a26 }));
    body.rotation.x = Math.PI / 2; body.position.z = 0.05; fl.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.05, 14), new THREE.MeshBasicMaterial({ color: 0x0b0b0c })); head.rotation.x = Math.PI / 2; head.position.z = -0.055; fl.add(head);
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0x333328 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), this.lensMat); lens.position.z = -0.081; lens.rotation.y = Math.PI; fl.add(lens);
    fl.position.set(0.19, -0.23, -0.3); fl.rotation.set(0.04, 0.06, 0); fl.scale.setScalar(0.92); fl.visible = false; cam.add(fl);
    // the kid's own body: never drawn for the player's eye, only by the TV camera and the mirror
    const kid = this.body = new THREE.Group(); kid.visible = false;
    const pj = new THREE.MeshStandardMaterial({ color: 0x7f98b8, roughness: 0.9, map: TEX.fabric.map });
    const skinK = new THREE.MeshStandardMaterial({ color: 0xd9b49a, roughness: 0.7 });
    const hairK = new THREE.MeshStandardMaterial({ color: 0x2e2018, roughness: 0.8 });
    const part = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; kid.add(o); return o; };
    part(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), pj, 0, 0.78, 0);
    part(new THREE.SphereGeometry(0.1, 16, 12), skinK, 0, 1.13, 0);
    part(new THREE.SphereGeometry(0.105, 16, 10, 0, TAU, 0, Math.PI * 0.6), hairK, 0, 1.15, 0.01);
    for (const s of [-1, 1]) { part(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), pj, s * 0.07, 0.28, 0); part(new THREE.CapsuleGeometry(0.04, 0.34, 4, 8), pj, s * 0.17, 0.8, -0.04, 0.35, s * 0.15); }
    kid.traverse(o => o.layers.set(2));
    G.scene.add(kid);
  },
  forward(out = _v1) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); },
  teleport(x, z, yaw = this.yaw, pitch = 0) { this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = pitch; this.vx = this.vz = 0; this.cine = null; },
  setMode(mode, opts = {}) {
    this.mode = mode;
    this.lookCenter = opts.center ?? this.yaw; this.lookRange = opts.range ?? Math.PI; this.pitchRange = opts.pitch ?? 1.45;
  },
  setFlash(on, silent = false) {
    if (!this.hasFlashlight) return;
    if (on !== this.flashOn && !silent) A.play('click', { gain: 0.4, reverb: 0.05 });
    this.flashOn = on;
  },
  kick(f) { this.fearKick = Math.max(this.fearKick, f); },
  addShake(a) { this.shake = Math.max(this.shake, a); },

  collide(px, pz) {
    const r = this.radius;
    for (let iter = 0; iter < 3; iter++) for (const c of COLLIDERS) {
      if (!c.on) continue;
      const cx = clamp(px, c.x0, c.x1), cz = clamp(pz, c.z0, c.z1), dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; px += dx * k; pz += dz * k; }
      else {
        const l = px - c.x0, rr = c.x1 - px, t = pz - c.z0, b = c.z1 - pz, m = Math.min(l, rr, t, b);
        if (m === l) px = c.x0 - r; else if (m === rr) px = c.x1 + r; else if (m === t) pz = c.z0 - r; else pz = c.z1 + r;
      }
    }
    return [px, pz];
  },

  update(dt) {
    const cam = this.cam, s = Settings.sensitivity;
    // ---- look
    const free = this.mode !== 'cine' && this.mode !== 'dead' && this.mode !== 'note';
    if (free) {
      this.yaw -= Input.dx * 0.0022 * s;
      this.pitch -= Input.dy * 0.0022 * s * (Settings.invertY ? -1 : 1);
      if (this.lookRange < Math.PI) { const d = wrapAngle(this.yaw - this.lookCenter); this.yaw = this.lookCenter + clamp(d, -this.lookRange, this.lookRange); }
      this.pitch = clamp(this.pitch, -this.pitchRange, this.pitchRange);
    }
    // ---- move
    let ix = 0, iz = 0;
    const canMove = this.mode === 'free';
    if (canMove) {
      if (Input.isDown('KeyW', 'ArrowUp')) iz += 1; if (Input.isDown('KeyS', 'ArrowDown')) iz -= 1;
      if (Input.isDown('KeyD', 'ArrowRight')) ix += 1; if (Input.isDown('KeyA', 'ArrowLeft')) ix -= 1;
    }
    const len = Math.hypot(ix, iz);
    const sprint = canMove && len > 0 && Input.isDown('ShiftLeft', 'ShiftRight') && this.stamina > 0.05 && iz > 0;
    const sp = (sprint ? 2.55 : 1.45) * (this.eyesClosed > 0.5 ? 0.45 : 1);
    let tx = 0, tz = 0;
    if (len > 0) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      tx = (fx * iz + rx * ix) / len * sp; tz = (fz * iz + rz * ix) / len * sp;
    }
    this.vx = damp(this.vx, tx, 9, dt); this.vz = damp(this.vz, tz, 9, dt);
    if (canMove) {
      const [nx, nz] = this.collide(this.pos.x + this.vx * dt, this.pos.z + this.vz * dt);
      const mvx = (nx - this.pos.x) / Math.max(dt, 1e-4), mvz = (nz - this.pos.z) / Math.max(dt, 1e-4);
      this.pos.x = nx; this.pos.z = nz;
      this.speed2D = Math.hypot(mvx, mvz);
      if (this.speed2D > 0.25) { _v2.set(mvx, 0, mvz).normalize(); this.moveDir.lerp(_v2, 1 - Math.exp(-6 * dt)).normalize(); }
    } else this.speed2D = 0;
    this.stillTime = this.speed2D < 0.2 ? this.stillTime + dt : 0;
    this.stamina = clamp(this.stamina + (sprint ? -dt / 3.2 : dt / 5), 0, 1);
    this.room = roomAt(this.pos.x, this.pos.z) || this.room;
    // ---- footsteps + bob
    const moving = this.speed2D > 0.2;
    if (moving) {
      const prev = Math.floor(this.stepPhase / Math.PI);
      this.stepPhase += dt * this.speed2D / 0.55 * Math.PI;
      if (Math.floor(this.stepPhase / Math.PI) !== prev) {
        const surf = surfaceAt(this.pos.x, this.pos.z);
        A.play('step_' + surf, { gain: (sprint ? 0.66 : 0.44) * (surf === 'carpet' ? 0.85 : 1), rate: rand(0.92, 1.08), reverb: surf === 'tile' ? 0.45 : 0.18, pos: _v1.set(this.pos.x, 0.05, this.pos.z), ref: 1.2 });
        if (surf === 'wood' && Math.random() < 0.12) A.play('creakFloor', { gain: 0.24, rate: rand(0.9, 1.2), pos: _v1.set(this.pos.x, 0.05, this.pos.z), reverb: 0.25 });
        if (this.onStep) this.onStep();
      }
    }
    const bobAmt = moving ? Math.min(1, this.speed2D / 1.45) : 0;
    this.bob = damp(this.bob, bobAmt, 8, dt);
    const by = Math.abs(Math.sin(this.stepPhase)) * 0.032 * this.bob * (sprint ? 1.5 : 1), bx = Math.sin(this.stepPhase) * 0.018 * this.bob;
    // ---- eyes + breath
    const wantClosed = this.canClose && Input.isDown('Space') && G.state === 'play' && this.mode !== 'note';
    if (!this.eyesScripted) this.eyesClosed = clamp(this.eyesClosed + (wantClosed ? dt * 7 : -dt * 4), 0, 1);
    const wantHold = this.mode === 'closet' && Input.isDown('ShiftLeft', 'ShiftRight');
    if (wantHold && this.breath > 0) { if (!this.holdingBreath) A.play('in', { gain: 0.18, rate: 1.3 }); this.holdingBreath = true; this.breath = Math.max(0, this.breath - dt / 9); }
    else if (this.holdingBreath) {
      this.holdingBreath = false;
      const gasp = this.breath <= 0.001 || this.breath < 0.2;
      A.play(gasp ? 'gasp' : 'sigh', { gain: gasp ? 0.6 : 0.25 });
      if (gasp && this.onGasp) this.onGasp();
      A.nextBreath = A.ctx ? A.ctx.currentTime + 1.2 : 0;
    }
    if (!this.holdingBreath) this.breath = Math.min(1, this.breath + dt / 3.5);
    // ---- fear
    this.fearKick = Math.max(0, this.fearKick - dt * 0.25);
    const target = Math.max(this.fearTarget, this.fearKick);
    this.fear = damp(this.fear, target, target > this.fear ? 3 : 0.35, dt);
    // ---- camera
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake, n = this.noise, t = G.time;
    const strafeTilt = damp(this.roll, -(this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw)) * 0.012, 6, dt);
    this.roll = strafeTilt;
    if (this.cine) {
      const c = this.cine;
      cam.position.lerp(c.pos, 1 - Math.exp(-(c.k || 3) * dt));
      if (c.look) { const m = new THREE.Matrix4().lookAt(cam.position, c.look, V3(0, 1, 0)); const q = new THREE.Quaternion().setFromRotationMatrix(m); cam.quaternion.slerp(q, 1 - Math.exp(-(c.k || 3) * dt)); }
      this.headPos.copy(cam.position);
    } else {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const eye = this.mode === 'peephole' ? 1.55 : this.eye;
      // fixed viewpoints: the peephole, the closet slats, under the bed (and a death that happens there)
      if (this.mode === 'peephole' || this.mode === 'closet' || this.mode === 'bed' || (this.mode === 'dead' && this.deadView)) cam.position.copy(this.viewPos);
      else cam.position.set(this.pos.x + rx * bx, eye + by - this.eyesClosed * 0.02, this.pos.z + rz * bx);
      cam.position.x += n(t * 13) * sh * 0.05; cam.position.y += n(t * 17 + 3) * sh * 0.05;
      cam.rotation.set(this.pitch + n(t * 19 + 5) * sh * 0.06, this.yaw + n(t * 15 + 9) * sh * 0.06, this.roll + n(t * 11 + 1) * sh * 0.04);
      this.headPos.copy(cam.position);
      void fx; void fz;
    }
    cam.updateMatrixWorld();
    this.body.visible = this.mode !== 'cine' && this.mode !== 'peephole' && this.mode !== 'closet' && this.mode !== 'bed' && !this.deadView;
    this.body.position.set(this.pos.x, 0, this.pos.z); this.body.rotation.y = this.yaw;
    // ---- flashlight
    this.updateFlash(dt);
    // ---- interaction ray
    this.hover = null;
    if ((this.mode === 'free' || this.mode === 'phone' || this.mode === 'closet' || this.mode === 'peephole') && this.eyesClosed < 0.3 && G.state === 'play') {
      cam.getWorldDirection(_v2);
      if (this.mode === 'free') this.hover = findInteract(cam.position, _v2);
    }
  },

  updateFlash(dt) {
    const cam = this.cam, on = this.hasFlashlight && this.flashOn;
    const hidden = this.mode === 'peephole' || this.mode === 'closet' || this.mode === 'bed';
    this.flashModel.visible = this.hasFlashlight && !hidden;
    let f = on && !hidden ? 1 : 0;
    if (f) {
      const t = G.time;
      if (this.dyingBattery) f *= (0.35 + 0.2 * Math.sin(t * 3)) * (Math.random() < 0.06 ? 0.1 : 1);
      if (this.fear > 0.55) f *= Math.random() < (this.fear - 0.5) * 0.18 ? rand(0.05, 0.4) : 1;
      if (this.flashFlicker > 0) { this.flashFlicker -= dt; f *= Math.random() < 0.5 ? 0.05 : 1; }
    }
    this.flashLevel = damp(this.flashLevel, f, f < this.flashLevel ? 40 : 18, dt);
    if (this.mode === 'dead') return; // the death sequence aims the light itself
    this.lensMat.color.setScalar(0.2 + this.flashLevel * 2.5);
    // hand lag + sway
    cam.getWorldDirection(_v2);
    const t = G.time, n = this.noise;
    _v2.x += n(t * 0.7 + 20) * 0.025; _v2.y += n(t * 0.9 + 40) * 0.02 - this.bob * Math.abs(Math.sin(this.stepPhase)) * 0.02;
    this.flashDir.lerp(_v2.normalize(), 1 - Math.exp(-13 * dt)).normalize();
    // the bulb sits just ahead of the lens, but never through a wall
    const fx = this.flashDir.x, fz = this.flashDir.z, fl = Math.hypot(fx, fz) || 1;
    const ahead = clamp(rayDist2D(cam.position.x, cam.position.z, fx / fl, fz / fl, 0.8, true) - 0.25, 0.02, 0.44);
    const off = _v3.set(0.17, -0.2, -ahead).applyQuaternion(cam.quaternion);
    L.flash.position.copy(cam.position).add(off);
    L.flash.target.position.copy(L.flash.position).addScaledVector(this.flashDir, 4);
    L.flash.target.updateMatrixWorld();
    W.dustU.lp.value.copy(L.flash.position); W.dustU.ld.value.copy(this.flashDir); W.dustU.inten.value = this.flashLevel;
    // never blow out what it lands on: drop fast, recover slowly (no pumping when sweeping past an edge)
    let want = FLASH_CD;
    if (Beam.ok && this.flashLevel > 0.01) want = Beam.measure(L.flash.position, this.flashDir, cam);
    else if (!Beam.ok) { // no raycaster: the old floor-plan estimate
      const near = rayDist2D(cam.position.x, cam.position.z, fx / fl, fz / fl, 1.2, true);
      want = FLASH_CD * Math.pow(clamp((near - 0.05) / 0.85, 0.18, 1), 1.3);
    }
    Beam.cap = damp(Beam.cap, want, want < Beam.cap ? 22 : 5, dt);
    L.flash.intensity = this.flashLevel * Beam.cap;
  },
};
