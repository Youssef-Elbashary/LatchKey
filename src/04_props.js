// ---------------------------------------------------------------------------
// the apartment itself: rooms, furniture, props, and the world-state API the story drives
// ---------------------------------------------------------------------------
const W = {
  doors: {}, curtains: [], photos: [], clocks: [], tapes: [], stars: null, dust: null,
  clock: { h: 3, m: 0, base: 0 }, hallMode: 'off', hallLevel: 0, hallTimer: 0,
  lightning: { t: 9, seq: null, level: 0, auto: true }, sky: 'night', skyBlend: 0,
  chainOn: true, underDoor: 1, feet: 0, tvMode: 'off', ghostInMirror: false,
  props: {}, anchors: {},
};

function rbox(B, m, cx, cy, cz, w, h, d, ry = 0, rx = 0, rz = 0) { B.geo(m, new THREE.BoxGeometry(w, h, d), TRS(cx, cy, cz, rx, ry, rz)); }
function rrbox(B, m, cx, cy, cz, w, h, d, r = 0.03, ry = 0) { B.geo(m, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), TRS(cx, cy, cz, 0, ry, 0)); }
function cyl(B, m, cx, cy, cz, r0, r1, h, seg = 14, rx = 0, rz = 0) { B.geo(m, new THREE.CylinderGeometry(r0, r1, h, seg), TRS(cx, cy, cz, rx, 0, rz)); }
function bakeGroup(B, group) {
  group.updateMatrixWorld(true);
  group.traverse(o => { if (o.isMesh) B.geo(o.material, o.geometry, o.matrixWorld); });
}
function plane(w, h, material, x, y, z, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.receiveShadow = true;
  return m;
}
function decalMat(map, extra = {}) { return new THREE.MeshStandardMaterial({ map, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, ...extra }); }

function table(B, x0, z0, x1, z1, h, top = M.woodMid, legs = top, lw = 0.045) {
  B.box(x0, h - 0.035, z0, x1, h, z1, top);
  for (const [lx, lz] of [[x0 + 0.03, z0 + 0.03], [x1 - 0.03 - lw, z0 + 0.03], [x0 + 0.03, z1 - 0.03 - lw], [x1 - 0.03 - lw, z1 - 0.03 - lw]]) B.box(lx, 0, lz, lx + lw, h - 0.035, lz + lw, legs);
  B.box(x0 + 0.05, h - 0.12, z0 + 0.04, x1 - 0.05, h - 0.035, z0 + 0.06, legs); B.box(x0 + 0.05, h - 0.12, z1 - 0.06, x1 - 0.05, h - 0.035, z1 - 0.04, legs);
}
function chair(B, x, z, ry, m = M.woodMid, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s);
  const part = (w, h, d, px, py, pz) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(px, py, pz); g.add(mesh); };
  part(0.42, 0.035, 0.42, 0, 0.45, 0);
  for (const [px, pz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) part(0.035, 0.45, 0.035, px, 0.225, pz);
  part(0.035, 0.5, 0.035, -0.18, 0.72, 0.18); part(0.035, 0.5, 0.035, 0.18, 0.72, 0.18);
  part(0.4, 0.08, 0.025, 0, 0.88, 0.18); part(0.4, 0.05, 0.025, 0, 0.68, 0.18);
  bakeGroup(B, g);
}
function hangingCoat(len, width, m, sleeveM = m) {
  const g = new THREE.Group();
  const prof = [[0.001, 0.02], [width * 0.16, 0.0], [width * 0.46, -0.06], [width * 0.5, -0.22], [width * 0.47, -len * 0.45], [width * 0.56, -len * 0.82], [width * 0.6, -len], [0.001, -len]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), m);
  body.scale.z = 0.36; g.add(body);
  for (const s of [-1, 1]) {
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, len * 0.6, 8), sleeveM);
    sl.position.set(s * width * 0.5, -len * 0.36, 0.02); sl.rotation.z = s * 0.06; g.add(sl);
  }
  const col = new THREE.Mesh(new THREE.TorusGeometry(width * 0.17, 0.02, 6, 16), m); col.rotation.x = Math.PI / 2; col.position.y = -0.01; col.scale.y = 0.5; g.add(col);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function frameOn(parent, x, y, z, ry, w, h, tex, depth = 0.025) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  const fm = M.woodDark, b = 0.03;
  const piece = (pw, ph, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, depth), fm); m.position.set(px, py, depth / 2); m.castShadow = true; g.add(m); };
  piece(w + b * 2, b, 0, h / 2 + b / 2); piece(w + b * 2, b, 0, -h / 2 - b / 2); piece(b, h, -w / 2 - b / 2, 0); piece(b, h, w / 2 + b / 2, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  back.position.z = 0.006; back.receiveShadow = true; g.add(back);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false }));
  glass.position.z = 0.018; g.add(glass);
  parent.add(g);
  return { group: g, photo: back };
}
function tapeDecal(parent, map, x, y, z, ry, w, h, rz = 0) {
  const m = plane(w, h, decalMat(map, { roughness: 0.9 }), x, y, z, ry, rz); parent.add(m);
  const tm = new THREE.MeshStandardMaterial({ color: 0xd8cca0, roughness: 0.8, transparent: true, opacity: 0.85 });
  for (const sx of [-1, 1]) { const t = plane(0.06, 0.022, tm, 0, 0, 0.001, 0, sx * 0.3); t.position.set(sx * w * 0.42, h * 0.48, 0.001); m.add(t); }
  return m;
}

// ---------------------------------------------------------------------------
function buildWorld(scene) {
  buildMaterials();
  buildLights(scene);
  const B = new Batch(), root = new THREE.Group(); scene.add(root);
  W.root = root;
  const R = ROOMS;
  const door = (a0, a1, y1 = 2.05) => ({ a0, a1, y0: 0, y1 });
  const win = (a0, a1, y0, y1) => ({ a0, a1, y0, y1 });

  // ---------------- rooms ----------------
  buildRoom(B, R.hall, {
    wall: { mat: M.wallpaper, low: M.beadboard, lowH: 0.9, crown: true },
    openings: { n: [door(0.85, 1.75), door(3.8, 4.65), door(7.6, 8.4)], s: [door(4.9, 6.5, 2.25)], w: [door(-0.45, 0.45)], e: [door(-0.42, 0.42)] },
    floor: M.floor, ceil: M.ceiling,
  });
  buildRoom(B, R.closet, { wall: { mat: M.paintPlain }, openings: { s: [{ ...door(0.85, 1.75), noCasing: true }] }, floor: M.floor, ceil: M.ceiling });
  buildRoom(B, R.bedroom, { wall: { mat: M.paintBlue }, openings: { s: [door(3.8, 4.65)], n: [win(3.6, 5.2, 0.85, 2.15)] }, floor: M.carpetBlue, ceil: M.ceiling });
  buildRoom(B, R.bath, { wall: { mat: M.paintMint, low: M.tileWall, lowH: 1.25, rail: true, base: false }, openings: { s: [door(7.6, 8.4)] }, floor: M.tileFloor, ceil: M.ceiling });
  buildRoom(B, R.living, {
    wall: { mat: M.paintWarm, crown: true },
    openings: { n: [door(4.9, 6.5, 2.25)], s: [win(3.2, 5.6, 0.8, 2.3), win(8.6, 10.0, 1.1, 2.2)] },
    floor: [{ x1: 7.6, mat: M.floor }, { x0: 7.6, mat: M.lino }], ceil: M.ceiling,
  });
  B.box(7.585, 0, R.living.z0, 7.615, 0.006, R.living.z1, M.steel);
  buildRoom(B, R.mom, { wall: { mat: M.paintMauve }, openings: { w: [door(-0.42, 0.42)], e: [win(-0.8, 0.8, 0.9, 2.2)] }, floor: M.carpetMom, ceil: M.ceiling });
  buildRoom(B, R.corridor, {
    wall: { mat: M.corrUpper, low: M.corrLower, lowH: 1.0, baseMat: M.corrLower },
    openings: { e: [door(-0.45, 0.45)], s: [win(-9.2, -8.2, 1.0, 2.2)] },
    floor: M.corrCarpet, ceil: M.dropCeiling,
  });
  // thresholds
  for (const [x0, x1] of [[3.8, 4.65], [7.6, 8.4], [0.85, 1.75]]) B.box(x0, 0, -0.71, x1, 0.008, -0.61, M.woodDark);
  B.box(-0.05, 0, -0.45, 0.05, 0.012, 0.45, M.brass);
  B.box(10.95, 0, -0.42, 11.05, 0.008, 0.42, M.woodDark);

  // ---------------- windows ----------------
  const wBed = buildWindow(B, root, R.bedroom, 'n', 3.6, 5.2, 0.85, 2.15, { curtain: M.fabCurtain, name: 'bed' });
  const wLiv = buildWindow(B, root, R.living, 's', 3.2, 5.6, 0.8, 2.3, { curtain: M.fabCurtainLiving, name: 'living' });
  const wKit = buildWindow(B, root, R.living, 's', 8.6, 10.0, 1.1, 2.2, {});
  const wMom = buildWindow(B, root, R.mom, 'e', -0.8, 0.8, 0.9, 2.2, { curtain: M.fabRed, name: 'mom' });
  const wCor = buildWindow(B, root, R.corridor, 's', -9.2, -8.2, 1.0, 2.2, {});
  W.windows = [wBed, wLiv, wKit, wMom, wCor];
  SKY_U.map.value = TEX.sky; SKY_U.dawn.value = TEX.skyDawn;
  // Mom keeps her curtains shut: an extra closed panel
  root.add(plane(1.7, 1.6, M.fabRed, 14.42, 1.55, 0, -Math.PI / 2));

  // ---------------- doors ----------------
  const D = W.doors;
  D.front = new Door({ hinge: [0, -0.45], base: -Math.PI / 2, swing: 1, width: 0.9, height: 2.04, style: 'front', mat: M.frontDoor, thick: 0.05, maxAngle: 1.35 });
  D.front.collider = addCollider(-0.06, -0.45, 0.06, 0.45, 'door');
  D.bed = new Door({ hinge: [3.8, -0.66], base: 0, swing: 1, width: 0.85 });
  D.bed.collider = addCollider(3.8, -0.72, 4.65, -0.6, 'door');
  D.bath = new Door({ hinge: [8.4, -0.66], base: Math.PI, swing: -1, width: 0.8 });
  D.bath.collider = addCollider(7.6, -0.72, 8.4, -0.6, 'door');
  D.mom = new Door({ hinge: [11, -0.42], base: -Math.PI / 2, swing: 1, width: 0.84 });
  D.mom.collider = addCollider(10.94, -0.42, 11.06, 0.42, 'door');
  D.closetL = new Door({ hinge: [0.86, -0.66], base: 0, swing: -1, width: 0.44, style: 'louver', thick: 0.03, maxAngle: 1.7 });
  D.closetR = new Door({ hinge: [1.74, -0.66], base: Math.PI, swing: 1, width: 0.44, style: 'louver', thick: 0.03, maxAngle: 1.7 });
  D.closetL.collider = addCollider(0.85, -0.72, 1.75, -0.6, 'door');
  D.wardrobe = new Door({ hinge: [5.8, -2.2], base: Math.PI / 2, swing: -1, width: 0.45, height: 1.8, knobs: false, mat: M.woodLight, maxAngle: 1.4 });
  for (const k in D) root.add(D[k].pivot);
  D.bed.set(0.92, true); D.bath.set(0.25, true); D.front.set(0, true); D.mom.set(0, true); D.closetL.set(0, true); D.closetR.set(0, true); D.wardrobe.set(0.08, true);

  // front door hardware on the leaf (local: x along the door, -z = hall side)
  {
    const leaf = D.front.leaf, th = 0.05;
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; leaf.add(mesh); return mesh; };
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), M.brass, 0.45, 1.55, s * (th / 2 + 0.005), Math.PI / 2);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.013, 12), M.dark, 0.45, 1.55, -(th / 2 + 0.008), Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.09, 0.012), M.brass, 0.83, 1.22, -(th / 2 + 0.006));
    W.props.thumbTurn = add(new THREE.BoxGeometry(0.014, 0.05, 0.02), M.brass, 0.83, 1.22, -(th / 2 + 0.02));
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 14), M.brass, 0.83, 1.22, th / 2 + 0.005, Math.PI / 2);
    add(new THREE.BoxGeometry(0.14, 0.03, 0.014), M.brass, 0.77, 1.48, -(th / 2 + 0.007));
    add(new THREE.BoxGeometry(0.82, 0.22, 0.004), M.brass, 0.45, 0.13, -(th / 2 + 0.003));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshStandardMaterial({ map: TEX.plates['2B'], metalness: 0.6, roughness: 0.4 }));
    plate.position.set(0.45, 1.78, th / 2 + 0.003); leaf.add(plate);
  }
  // signs on doors
  {
    const s1 = plane(0.28, 0.14, decalMat(genSign("BUG'S ROOM", 'KEEP OUT!')), 0.42, 1.42, -0.03, Math.PI); D.bed.leaf.add(s1);
    const s2 = plane(0.28, 0.14, decalMat(TEX.momSign), 0.42, 1.48, 0.03, 0); D.mom.leaf.add(s2);
  }

  // ---------------- chain lock ----------------
  {
    const links = new THREE.Group(); root.add(links);
    const lg = new THREE.TorusGeometry(0.011, 0.003, 6, 12);
    const chainMat = mat({ color: 0xc9ccd0, metalness: 0.45, roughness: 0.3 });
    for (let i = 0; i < 12; i++) { const l = new THREE.Mesh(lg, chainMat); l.castShadow = true; links.add(l); }
    W.chain = { links, anchor: V3(0.075, 1.48, 0.49), len: 0.2 };
    B.box(0.06, 1.44, 0.46, 0.072, 1.52, 0.52, M.chrome);
  }
  // under-door light strip (light from the building corridor)
  {
    W.doorStripU = { level: { value: 1 }, feet: { value: 0 }, feetZ: { value: 0 }, time: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: W.doorStripU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float level; uniform float feet; uniform float feetZ; uniform float time; varying vec2 vUv;
        void main(){
          float fall = pow(1.0 - vUv.x, 2.6);
          float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          float z = vUv.y - 0.5 - feetZ;
          float f1 = smoothstep(0.07, 0.04, abs(z + 0.12)); float f2 = smoothstep(0.07, 0.04, abs(z - 0.1));
          float shade = 1.0 - feet * max(f1, f2) * smoothstep(0.65, 0.0, vUv.x) * 0.95;
          vec3 c = vec3(0.75, 0.95, 0.8) * fall * edge * shade * level * 0.9;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.9), m);
    strip.rotation.x = -Math.PI / 2; strip.position.set(0.21 + 0.03, 0.004, 0); strip.renderOrder = 3; root.add(strip);
    W.doorStrip = strip;
  }

  // ---------------- hall props ----------------
  B.box(0.75, 0, -0.38, 10.25, 0.008, 0.38, { def: M.fabRed, py: M.rug });
  // coat rack + coats
  B.box(0.18, 1.5, -0.6, 0.74, 1.6, -0.575, M.woodDark);
  for (const hx of [0.28, 0.46, 0.64]) cyl(B, M.brass, hx, 1.56, -0.54, 0.008, 0.008, 0.08, 6, Math.PI / 2 - 0.4);
  W.props.momCoat = hangingCoat(1.05, 0.46, M.coat); W.props.momCoat.position.set(0.4, 1.56, -0.47); root.add(W.props.momCoat);
  const kidCoat = hangingCoat(0.6, 0.34, M.raincoat); kidCoat.position.set(0.64, 1.56, -0.48); bakeGroup(B, kidCoat);
  addCollider(0.06, -0.6, 0.78, -0.38, 'furniture');
  // umbrella + shoes + mat
  cyl(B, M.blackPlastic, 0.18, 0.45, 0.48, 0.035, 0.012, 0.9, 10); cyl(B, M.woodDark, 0.18, 0.95, 0.48, 0.012, 0.012, 0.12, 6);
  B.box(0.1, 0, -0.35, 0.62, 0.012, 0.3, M.fabGray);
  rrbox(B, M.fabRed, 0.3, 0.04, -0.12, 0.09, 0.07, 0.2, 0.03); rrbox(B, M.fabRed, 0.42, 0.04, -0.1, 0.09, 0.07, 0.2, 0.03);
  rrbox(B, M.raincoat, 0.33, 0.1, 0.12, 0.09, 0.2, 0.18, 0.03); rrbox(B, M.raincoat, 0.45, 0.1, 0.14, 0.09, 0.2, 0.18, 0.03);
  // step stool
  B.box(0.22, 0.24, 0.27, 0.56, 0.27, 0.56, M.woodLight); B.box(0.22, 0, 0.27, 0.25, 0.24, 0.56, M.woodLight); B.box(0.53, 0, 0.27, 0.56, 0.24, 0.56, M.woodLight);
  addCollider(0.22, 0.27, 0.56, 0.56, 'furniture');
  // key hooks (empty) + crayon on the wall
  B.box(0.22, 1.45, 0.585, 0.58, 1.53, 0.6, M.woodLight);
  for (const kx of [0.3, 0.4, 0.5]) cyl(B, M.brass, kx, 1.47, 0.575, 0.004, 0.004, 0.03, 6, Math.PI / 2);
  root.add(plane(0.84, 0.42, decalMat(TEX.scrawl, { roughness: 0.55 }), 0.56, 1.14, 0.598, Math.PI));
  // phone table
  table(B, 1.02, 0.26, 1.88, 0.6, 0.74, M.woodDark);
  B.box(1.12, 0.6, 0.255, 1.78, 0.68, 0.27, M.woodMid);
  addCollider(1.02, 0.26, 1.88, 0.6, 'furniture');
  {
    const ph = new THREE.Group(); ph.position.set(1.42, 0.74, 0.42); root.add(ph);
    const red = mat({ color: 0x6e1a15, roughness: 0.28 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = ph) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
    add(new RoundedBoxGeometry(0.21, 0.085, 0.22, 3, 0.025), red, 0, 0.042, 0);
    add(new THREE.CylinderGeometry(0.058, 0.058, 0.01, 28), M.whitePlastic, 0, 0.09, -0.045, -0.25);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 28), red, 0, 0.093, -0.046, -0.25);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 16), M.whitePlastic, 0, 0.096, -0.047, -0.25);
    for (let k = 0; k < 10; k++) { const a = -0.6 + k * 0.42; add(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), M.dark, Math.cos(a) * 0.036, 0.097 + Math.sin(a) * 0.006, -0.046 + Math.sin(a) * 0.033, -0.25); }
    add(new THREE.BoxGeometry(0.03, 0.03, 0.03), red, -0.07, 0.095, 0.05); add(new THREE.BoxGeometry(0.03, 0.03, 0.03), red, 0.07, 0.095, 0.05);
    const hs = new THREE.Group(); hs.position.set(0, 0.115, 0.05); ph.add(hs);
    add(new THREE.BoxGeometry(0.17, 0.022, 0.034), red, 0, 0.012, 0, 0, 0, 0, hs);
    add(new THREE.CylinderGeometry(0.03, 0.026, 0.035, 16), red, -0.085, -0.004, 0, 0, 0, 0, hs);
    add(new THREE.CylinderGeometry(0.03, 0.026, 0.035, 16), red, 0.085, -0.004, 0, 0, 0, 0, hs);
    W.props.handset = hs;
    const pts = []; for (let i = 0; i <= 300; i++) { const t = i / 300; const cx = lerp(0.1, 0.11, t), cy = lerp(0.1, 0.03, t) - Math.sin(t * Math.PI) * 0.05, cz = lerp(0.05, -0.02, t) + Math.sin(t * Math.PI) * 0.08; const a = t * TAU * 38; pts.push(V3(cx + Math.cos(a) * 0.008, cy + Math.sin(a) * 0.008, cz)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 900, 0.0022, 4), red, 0, 0, 0);
    W.anchors.phone = V3(1.42, 0.86, 0.42);
    // the answering machine: grey plastic, a cassette window, one red light
    const am = new THREE.Group(); am.position.set(1.615, 0.74, 0.335); am.rotation.y = 0.08; root.add(am);
    const amBody = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.045, 0.11, 2, 0.008), mat({ color: 0x2b2b2d, roughness: 0.5 })); amBody.position.y = 0.0225; amBody.castShadow = true; amBody.receiveShadow = true; am.add(amBody);
    const amWin = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.03), mat({ color: 0x0c0c0e, roughness: 0.15, metalness: 0.2 })); amWin.rotation.x = -Math.PI / 2; amWin.position.set(-0.025, 0.0455, 0.005); am.add(amWin);
    for (let k = 0; k < 2; k++) { const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, 10), M.whitePlastic); reel.position.set(-0.045 + k * 0.04, 0.046, 0.005); am.add(reel); }
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.01), M.blackPlastic); b.position.set(0.032 + (k % 2) * 0.02, 0.047, -0.025 + (k >> 1) * 0.02); am.add(b); }
    W.props.machineLed = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) }));
    W.props.machineLed.position.set(0.06, 0.047, 0.035); am.add(W.props.machineLed);
    W.anchors.machine = V3(1.615, 0.8, 0.335);
    W.handsetHome = { pos: hs.position.clone(), rot: hs.rotation.clone() };
    // notepad + dead lamp
    B.box(1.12, 0.74, 0.34, 1.27, 0.748, 0.52, M.paper); cyl(B, M.woodLight, 1.2, 0.752, 0.43, 0.004, 0.004, 0.15, 6, 0, Math.PI / 2 - 0.3);
    cyl(B, M.brass, 1.74, 0.76, 0.46, 0.06, 0.07, 0.03, 16); cyl(B, M.brass, 1.74, 0.95, 0.46, 0.008, 0.008, 0.36, 8); cyl(B, M.fabBeige, 1.74, 1.17, 0.46, 0.07, 0.13, 0.17, 16);
    cyl(B, M.blackPlastic, 1.75, 0.3, 0.59, 0.0025, 0.0025, 0.6, 4);
  }
  // light switches
  for (const [x, z, ry] of [[0.98, 0.598, Math.PI], [3.62, -0.598, 0], [8.52, -0.598, 0]]) {
    rbox(B, M.whitePlastic, x, 1.18, z, 0.07, 0.11, 0.008, ry); rbox(B, M.beigePlastic, x, 1.18, z + (z > 0 ? -0.006 : 0.006), 0.014, 0.03, 0.008, ry);
  }
  // wall clock
  {
    const g = new THREE.Group(); g.position.set(2.86, 1.95, -0.598); root.add(g);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshStandardMaterial({ map: TEX.clock, roughness: 0.6 }));
    face.position.z = 0.012; g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.018, 10, 40), M.woodDark); rim.position.z = 0.02; rim.castShadow = true; g.add(rim);
    const hand = (len, w, m, z) => { const p = new THREE.Group(); p.position.z = z; const h = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.003), m); h.position.y = len * 0.42; p.add(h); g.add(p); return p; };
    const blk = mat({ color: 0x111111, roughness: 0.4 });
    W.clocks.push({ hour: hand(0.09, 0.014, blk, 0.016), minute: hand(0.135, 0.009, blk, 0.019), second: hand(0.14, 0.003, mat({ color: 0x9b1b12 }), 0.022) });
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.06, depthWrite: false })); gl.position.z = 0.03; g.add(gl);
    W.anchors.clock = V3(2.86, 1.95, -0.58);
  }
  // photographs
  {
    const fN = frameOn(root, 5.55, 1.66, -0.6, 0, 0.26, 0.325, TEX.photos.nurse[0]);
    const fS = frameOn(root, 6.32, 1.28, -0.6, 0, 0.22, 0.275, TEX.photos.school[0]);
    const fB = frameOn(root, 8.72, 1.55, 0.6, Math.PI, 0.42, 0.336, TEX.photos.beach[0]);
    W.photos = [{ mesh: fN.photo, kind: 'nurse' }, { mesh: fS.photo, kind: 'school' }, { mesh: fB.photo, kind: 'beach' }];
  }
  // drawings taped beside the bedroom door
  W.props.drawHall = tapeDecal(root, TEX.drawings.meandmom, 3.26, 1.13, -0.597, 0, 0.36, 0.27, 0.04);
  W.props.drawHall2 = tapeDecal(root, TEX.drawings.momwork, 3.2, 0.62, -0.597, 0, 0.32, 0.24, -0.06);
  // ceiling lamps + smoke detector
  W.domes = [];
  for (const x of [2.4, 5.6, 9.0]) {
    cyl(B, M.brass, x, H - 0.015, 0, 0.09, 0.09, 0.03, 18);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0, transparent: true, opacity: 0.92 }));
    dome.position.set(x, H - 0.03, 0); root.add(dome); W.domes.push(dome);
  }
  cyl(B, M.whitePlastic, 4.0, H - 0.02, 0.0, 0.065, 0.07, 0.04, 20);
  W.props.led = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 })); W.props.led.position.set(4.03, H - 0.042, 0.03); root.add(W.props.led);
  W.anchors.smoke = V3(4.0, H - 0.05, 0);

  // ---------------- closet ----------------
  cyl(B, M.chrome, 1.3, 1.78, -1.3, 0.012, 0.012, 0.96, 8, 0, Math.PI / 2);
  B.box(0.81, 1.95, -1.44, 1.79, 1.975, -1.0, M.woodLight);
  for (const [x, l, w, m] of [[0.98, 1.1, 0.42, M.fabGray], [1.24, 1.3, 0.44, M.fabBlue], [1.55, 0.95, 0.4, M.coat]]) { const c = hangingCoat(l, w, m); c.position.set(x, 1.76, -1.3); c.scale.z = 0.8; bakeGroup(B, c); }
  rrbox(B, M.fabBeige, 1.05, 2.09, -1.22, 0.4, 0.22, 0.34, 0.01); rrbox(B, M.fabRed, 1.55, 2.06, -1.25, 0.3, 0.16, 0.3, 0.01);
  cyl(B, M.blackPlastic, 1.62, 0.25, -1.3, 0.11, 0.12, 0.5, 14); cyl(B, M.steel, 1.62, 0.8, -1.32, 0.012, 0.012, 0.6, 6);
  W.closetCam = V3(1.3, 1.08, -1.02);

  // ---------------- bedroom ----------------
  {
    B.box(2.52, 0, -4.12, 3.5, 0.95, -4.06, M.woodLight); B.box(2.52, 0, -2.24, 3.5, 0.58, -2.18, M.woodLight);
    B.box(2.52, 0.18, -4.06, 2.56, 0.3, -2.24, M.woodLight); B.box(3.46, 0.18, -4.06, 3.5, 0.3, -2.24, M.woodLight);
    rrbox(B, M.mattress, 3.01, 0.38, -3.15, 0.9, 0.18, 1.82, 0.04);
    rrbox(B, M.fabBlue, 3.01, 0.49, -2.85, 0.96, 0.08, 1.25, 0.04);
    rrbox(B, M.fabBlue, 3.01, 0.39, -2.24, 0.98, 0.25, 0.06, 0.03);
    rrbox(B, M.mattress, 3.0, 0.53, -3.8, 0.55, 0.12, 0.32, 0.06);
    // bunny
    const pink = mat({ color: 0xc89aa0, roughness: 1, map: TEX.fabric.map });
    B.geo(pink, new THREE.SphereGeometry(0.07, 12, 10), TRS(3.3, 0.6, -3.65, 0, 0, 0, 1, 1.15, 0.9));
    B.geo(pink, new THREE.SphereGeometry(0.05, 12, 10), TRS(3.3, 0.72, -3.65));
    for (const s of [-1, 1]) B.geo(pink, new THREE.CapsuleGeometry(0.016, 0.07, 4, 8), TRS(3.3 + s * 0.02, 0.8, -3.66, 0, 0, s * 0.25));
    addCollider(2.46, -4.14, 3.52, -2.16, 'furniture');
    // nightstand
    B.box(3.58, 0, -4.1, 4.02, 0.5, -3.66, M.woodLight); B.box(3.62, 0.3, -3.66, 3.98, 0.44, -3.655, M.woodMid); cyl(B, M.brass, 3.8, 0.37, -3.65, 0.012, 0.012, 0.02, 8, Math.PI / 2);
    addCollider(3.58, -4.1, 4.02, -3.66, 'furniture');
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf2ecd2, emissive: 0xbfd2ff, emissiveIntensity: 2.6, roughness: 0.8 }));
    moon.position.set(3.7, 0.57, -3.95); root.add(moon); W.props.moon = moon;
    L.night.position.set(3.75, 0.75, -3.7);
    // alarm clock
    rbox(B, M.blackPlastic, 3.88, 0.535, -3.82, 0.15, 0.07, 0.07);
    W.alarm = makeDigitDisplay(128, 48);
    const ad = plane(0.11, 0.04, new THREE.MeshBasicMaterial({ map: W.alarm.tex, color: new THREE.Color(1.6, 1.6, 1.6) }), 3.88, 0.537, -3.784); root.add(ad);
    // flashlight on the bed by the pillow
    const fl = new THREE.Group(); fl.position.set(3.25, 0.555, -3.45); fl.rotation.set(0, 0.6, Math.PI / 2); root.add(fl);
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12), mat({ color: 0x2e3a52, roughness: 0.5 })); fl.add(fb);
    const fh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.05, 14), M.blackPlastic); fh.position.y = 0.1; fl.add(fh);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 14), new THREE.MeshBasicMaterial({ color: 0x777766 })); lens.position.y = 0.126; lens.rotation.x = -Math.PI / 2; fl.add(lens);
    fl.traverse(o => { if (o.isMesh) o.castShadow = true; });
    W.props.flashlight = fl;
    // desk, chair, crayons
    B.box(5.72, 0.6, -3.45, 6.32, 0.64, -2.45, M.woodLight); B.box(6.28, 0, -3.45, 6.32, 0.6, -2.45, M.woodLight); B.box(5.72, 0, -3.45, 5.76, 0.6, -3.41, M.woodLight); B.box(5.72, 0, -2.49, 5.76, 0.6, -2.45, M.woodLight);
    addCollider(5.72, -3.45, 6.34, -2.45, 'furniture');
    chair(B, 5.45, -2.95, -Math.PI / 2, M.woodLight, 0.8);
    const cols = [0xc62020, 0x2f6fb5, 0xf2c12e, 0x3f9b3a, 0x7a2fa0, 0x111111];
    cols.forEach((c, i) => cyl(B, mat({ color: c, roughness: 0.6 }), 5.9 + i * 0.018, 0.65, -3.1, 0.005, 0.005, 0.09, 6, 0, Math.PI / 2));
    B.box(5.85, 0.64, -2.95, 6.12, 0.643, -2.62, M.paper);
    // wardrobe
    B.box(5.8, 0, -2.2, 6.34, 1.85, -1.25, { def: M.woodLight, nx: null });
    B.box(5.8, 0, -1.73, 5.83, 1.8, -1.25, M.woodLight);
    B.box(5.83, 0, -2.18, 6.3, 1.8, -2.17, M.dark);
    addCollider(5.8, -2.2, 6.34, -1.25, 'furniture');
    // toy box, toys, rug
    B.box(2.62, 0, -2.12, 3.32, 0.38, -1.78, M.paintBlue); B.box(2.6, 0.38, -2.14, 3.34, 0.42, -1.76, M.paintedWood);
    addCollider(2.6, -2.14, 3.34, -1.76, 'furniture');
    B.geo(mat({ color: 0xb22a22, roughness: 0.4 }), new THREE.SphereGeometry(0.09, 16, 12), TRS(4.9, 0.09, -1.9));
    for (const [x, z, c] of [[4.2, -2.2, 0xf2c12e], [4.32, -2.18, 0x2f6fb5], [4.25, -2.32, 0xc62020], [4.27, -2.25, 0x3f9b3a]]) rbox(B, mat({ color: c, roughness: 0.5 }), x, z === -2.25 ? 0.1 : 0.03, z, 0.06, 0.06, 0.06, x * 3);
    B.geo(M.fabBlue, new THREE.CylinderGeometry(0.9, 0.9, 0.01, 40), TRS(4.45, 0.005, -2.75));
    root.add(plane(0.36, 0.5, new THREE.MeshStandardMaterial({ map: TEX.posterDino, roughness: 0.7 }), 2.465, 1.55, -3.0, Math.PI / 2));
    root.add(plane(0.34, 0.48, new THREE.MeshStandardMaterial({ map: TEX.posterSpace, roughness: 0.7 }), 6.335, 1.5, -2.95, -Math.PI / 2));
    // glow-in-the-dark stars
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.4 : 1; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const sGeo = new THREE.ShapeGeometry(star), parts = [];
    const sr = mulberry32(5);
    for (let i = 0; i < 46; i++) { const g = sGeo.clone(); const s = 0.02 + sr() * 0.03; g.applyMatrix4(TRS(2.6 + sr() * 3.6, H - 0.003, -4.0 + sr() * 3.1, Math.PI / 2, 0, sr() * TAU, s, s, s)); parts.push(g.toNonIndexed()); }
    const moonS = new THREE.Shape(); moonS.absarc(0, 0, 1, Math.PI * 0.2, Math.PI * 1.8, false); moonS.absarc(0.45, 0, 0.8, Math.PI * 1.7, Math.PI * 0.3, true);
    const mg = new THREE.ShapeGeometry(moonS, 20); mg.applyMatrix4(TRS(4.6, H - 0.003, -3.0, Math.PI / 2, 0, 0.5, 0.11, 0.11, 0.11)); parts.push(mg.toNonIndexed());
    const merged = new THREE.BufferGeometry(); const all = []; parts.forEach(p => all.push(...p.attributes.position.array));
    merged.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
    W.stars = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 2.0, 1.05), side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    root.add(W.stars);
  }

  // ---------------- bathroom ----------------
  {
    const tx0 = 7.02, tx1 = 8.72, tz0 = -3.1, tz1 = -2.38;
    B.box(tx0, 0, tz0, tx1, 0.1, tz1, M.ceramic);
    B.box(tx0, 0.1, tz0, tx1, 0.56, tz0 + 0.07, M.ceramic); B.box(tx0, 0.1, tz1 - 0.07, tx1, 0.56, tz1, M.ceramic);
    B.box(tx0, 0.1, tz0, tx0 + 0.07, 0.56, tz1, M.ceramic); B.box(tx1 - 0.07, 0.1, tz0, tx1, 0.56, tz1, M.ceramic);
    addCollider(tx0, tz0, tx1, tz1, 'furniture');
    cyl(B, M.chrome, 7.12, 0.72, -2.74, 0.012, 0.012, 0.16, 8, 0, Math.PI / 2); cyl(B, M.chrome, 7.06, 0.66, -2.74, 0.014, 0.014, 0.14, 8);
    for (const dz of [-0.07, 0.07]) cyl(B, M.chrome, 7.06, 0.74, -2.74 + dz, 0.02, 0.02, 0.02, 10);
    // rubber duck
    const duck = mat({ color: 0xf2c12e, roughness: 0.4 });
    B.geo(duck, new THREE.SphereGeometry(0.045, 12, 10), TRS(8.3, 0.14, -2.6, 0, 0, 0, 1.25, 0.8, 1));
    B.geo(duck, new THREE.SphereGeometry(0.03, 12, 10), TRS(8.34, 0.19, -2.6));
    B.geo(mat({ color: 0xe06a1a }), new THREE.ConeGeometry(0.01, 0.025, 8), TRS(8.37, 0.19, -2.6, 0, 0, -Math.PI / 2));
    // shower curtain on a rod
    cyl(B, M.chrome, 7.86, 1.96, -2.36, 0.01, 0.01, 1.72, 8, 0, Math.PI / 2);
    const cg = new THREE.PlaneGeometry(1.68, 1.72, 40, 1); const P = cg.attributes.position;
    for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 22) * 0.025);
    cg.computeVertexNormals();
    const cm = new THREE.MeshStandardMaterial({ color: 0xcfe0d8, roughness: 0.45, transparent: true, opacity: 0.88, side: THREE.DoubleSide, map: TEX.paint.map });
    const curt = new THREE.Mesh(cg, cm); curt.position.set(7.86, 1.1, -2.35); curt.castShadow = true; root.add(curt);
    W.props.showerCurtain = curt; W.curtainOpen = 0; W.curtainTarget = 0;
    // sink + mirror (west wall)
    rrbox(B, M.ceramic, 7.24, 0.8, -1.65, 0.46, 0.14, 0.42, 0.04); cyl(B, M.ceramic, 7.18, 0.37, -1.65, 0.07, 0.11, 0.74, 14);
    cyl(B, M.chrome, 7.05, 0.93, -1.65, 0.012, 0.012, 0.12, 8); cyl(B, M.chrome, 7.1, 0.98, -1.65, 0.01, 0.01, 0.12, 8, 0, Math.PI / 2);
    addCollider(6.96, -1.9, 7.46, -1.4, 'furniture');
    W.anchors.drip = V3(7.15, 0.95, -1.65);
    rbox(B, M.whitePlastic, 7.36, 0.88, -1.48, 0.05, 0.08, 0.05); rbox(B, M.whitePlastic, 7.36, 0.88, -1.8, 0.04, 0.06, 0.04);
    cyl(B, mat({ color: 0x2f6fb5 }), 7.36, 0.95, -1.48, 0.004, 0.004, 0.12, 6, 0.2); cyl(B, mat({ color: 0xc62020 }), 7.36, 0.94, -1.8, 0.003, 0.003, 0.1, 6, -0.2);
    B.box(6.96, 0.96, -2.0, 6.99, 1.76, -1.3, M.woodDark);
    const mirror = new Reflector(new THREE.PlaneGeometry(0.62, 0.72), { clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0x9a9a92 });
    mirror.position.set(6.995, 1.36, -1.65); mirror.rotation.y = Math.PI / 2; root.add(mirror);
    W.mirror = mirror;
    const dirt = plane(0.62, 0.72, new THREE.MeshBasicMaterial({ map: TEX.mirrorDirt, transparent: true, depthWrite: false, color: 0x777066 }), 6.998, 1.36, -1.65, Math.PI / 2); root.add(dirt);
    // a stool for reaching the sink
    B.box(7.5, 0, -1.8, 7.75, 0.2, -1.5, M.paintBlue);
    // toilet
    rbox(B, M.ceramic, 9.42, 0.62, -2.15, 0.2, 0.36, 0.48); rrbox(B, M.ceramic, 9.2, 0.22, -2.15, 0.36, 0.44, 0.32, 0.08);
    rrbox(B, M.ceramic, 9.18, 0.45, -2.15, 0.44, 0.04, 0.38, 0.015);
    addCollider(8.95, -2.4, 9.54, -1.9, 'furniture');
    // towel + bath mat
    cyl(B, M.chrome, 9.0, 1.1, -0.73, 0.008, 0.008, 0.55, 6, 0, Math.PI / 2);
    rrbox(B, M.fabGreen, 9.0, 0.82, -0.745, 0.42, 0.56, 0.03, 0.01);
    B.box(7.4, 0, -2.3, 8.3, 0.012, -1.9, M.fabGreen);
  }

  // ---------------- music box ----------------
  {
    const mb = new THREE.Group(); root.add(mb);
    const wood = mat({ color: 0xc98fa0, roughness: 0.45, map: TEX.grain.map });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.065, 0.09), wood); box.position.y = 0.0325; box.castShadow = true; mb.add(box);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), mat({ color: 0x7a1828, roughness: 1 })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.066; mb.add(inner);
    const lidP = new THREE.Group(); lidP.position.set(0, 0.065, -0.045); mb.add(lidP);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.09), wood); lid.position.set(0, 0.006, 0.045); lid.castShadow = true; lidP.add(lid);
    const mirrorIn = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.07), M.chrome); mirrorIn.position.set(0, -0.001, 0.045); mirrorIn.rotation.x = Math.PI / 2; lidP.add(mirrorIn);
    const dancer = new THREE.Group(); dancer.position.set(0, 0.066, 0.005); mb.add(dancer);
    const tutu = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.012, 12, 1, true), mat({ color: 0xf2d6dc, side: THREE.DoubleSide })); tutu.position.y = 0.022; dancer.add(tutu);
    const bodyD = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 6), mat({ color: 0xf0e0d0 })); bodyD.position.y = 0.032; dancer.add(bodyD);
    const headD = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), mat({ color: 0xf0e0d0 })); headD.position.y = 0.05; dancer.add(headD);
    const legD = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.018, 4), mat({ color: 0xf0e0d0 })); legD.position.y = 0.01; dancer.add(legD);
    W.musicBox = { group: mb, lid: lidP, dancer, open: 0, target: 0 };
  }

  // ---------------- living room ----------------
  {
    // TV stand + CRT
    B.box(2.3, 0, 0.74, 3.5, 0.48, 1.22, M.woodDark); B.box(2.34, 0.06, 1.22, 3.46, 0.42, 1.225, M.dark);
    addCollider(2.3, 0.72, 3.5, 1.24, 'furniture');
    rrbox(B, M.blackPlastic, 2.9, 0.78, 0.98, 0.66, 0.56, 0.5, 0.04);
    rrbox(B, M.blackPlastic, 2.9, 0.78, 0.82, 0.46, 0.4, 0.3, 0.06);
    for (const s of [-1, 1]) cyl(B, M.chrome, 2.9 + s * 0.12, 1.25, 0.95, 0.004, 0.004, 0.42, 6, 0, s * 0.5);
    cyl(B, M.blackPlastic, 2.9, 1.07, 0.95, 0.04, 0.05, 0.03, 12);
    W.tvTex = (() => { const c = makeCanvas(160, 120); return { c, x: ctx2d(c), tex: canvasTex(c, { wrap: false, aniso: false }) }; })();
    W.tvScreenStd = new THREE.MeshStandardMaterial({ color: 0x0a0c0b, roughness: 0.12, metalness: 0.2, emissive: 0xffffff, emissiveMap: W.tvTex.tex, emissiveIntensity: 0 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38, 8, 6), W.tvScreenStd);
    const sp = scr.geometry.attributes.position; for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i); sp.setZ(i, 0.03 - (x * x + y * y) * 0.18); }
    scr.position.set(2.9, 0.79, 1.232); root.add(scr); W.tvScreen = scr;
    L.tv.position.set(2.9, 0.8, 1.6);
    // couch facing the TV, under the window
    const cm = M.fabGreen;
    rrbox(B, cm, 3.3, 0.22, 5.35, 2.2, 0.3, 0.9, 0.06); rrbox(B, cm, 3.3, 0.6, 5.78, 2.2, 0.62, 0.22, 0.08);
    rrbox(B, cm, 2.24, 0.42, 5.35, 0.2, 0.42, 0.9, 0.08); rrbox(B, cm, 4.36, 0.42, 5.35, 0.2, 0.42, 0.9, 0.08);
    for (const x of [2.72, 3.3, 3.88]) rrbox(B, cm, x, 0.43, 5.28, 0.56, 0.14, 0.7, 0.06);
    rrbox(B, M.fabRed, 2.55, 0.62, 5.55, 0.4, 0.36, 0.12, 0.05);
    addCollider(2.14, 4.9, 4.46, 6.14, 'furniture');
    // coffee table + bits
    table(B, 2.65, 2.9, 3.95, 3.55, 0.42, M.woodMid);
    addCollider(2.65, 2.9, 3.95, 3.55, 'furniture');
    cyl(B, M.ceramic, 3.1, 0.47, 3.2, 0.04, 0.035, 0.09, 14); B.box(3.4, 0.42, 3.05, 3.75, 0.43, 3.35, mat({ color: 0x8a2d2d, roughness: 0.6 }));
    rbox(B, M.blackPlastic, 3.55, 0.435, 3.42, 0.05, 0.02, 0.17, 0.4);
    B.box(2.0, 0, 2.2, 4.6, 0.01, 4.3, { def: M.fabRed, py: mat({ map: TEX.rug.map, roughness: 1 }, { su: 2.6, sv: 2.1, ou: 0, ov: 0.5 }) });
    // armchair
    rrbox(B, M.fabBeige, 2.05, 0.23, 2.3, 0.75, 0.32, 0.72, 0.06); rrbox(B, M.fabBeige, 1.78, 0.62, 2.3, 0.2, 0.62, 0.72, 0.07);
    rrbox(B, M.fabBeige, 2.05, 0.45, 1.98, 0.75, 0.3, 0.16, 0.06); rrbox(B, M.fabBeige, 2.05, 0.45, 2.62, 0.75, 0.3, 0.16, 0.06);
    addCollider(1.66, 1.9, 2.45, 2.72, 'furniture');
    // bookshelf
    B.box(1.67, 0, 3.4, 1.98, 1.85, 4.5, { def: M.woodDark, px: null });
    for (const y of [0.02, 0.45, 0.9, 1.35, 1.8]) B.box(1.67, y, 3.42, 1.97, y + 0.025, 4.48, M.woodDark);
    B.box(1.67, 0, 3.4, 1.98, 1.85, 3.42, M.woodDark); B.box(1.67, 0, 4.48, 1.98, 1.85, 4.5, M.woodDark);
    const bk = [M.fabRed, M.fabBlue, M.fabGreen, M.fabBeige, M.fabGray]; const br = mulberry32(9);
    for (const y of [0.045, 0.475, 0.925, 1.375]) { let z = 3.44; while (z < 4.42) { const w = 0.025 + br() * 0.035, h = 0.24 + br() * 0.14; if (br() > 0.1) B.box(1.7, y, z, 1.94, y + h, z + w, bk[(br() * 5) | 0]); z += w + 0.003; } }
    addCollider(1.66, 3.4, 1.98, 4.5, 'furniture');
    // floor lamp + dead plant
    cyl(B, M.brass, 1.95, 0.015, 5.75, 0.14, 0.14, 0.03, 18); cyl(B, M.brass, 1.95, 0.8, 5.75, 0.012, 0.012, 1.55, 8); cyl(B, M.fabBeige, 1.95, 1.62, 5.75, 0.13, 0.22, 0.28, 18);
    cyl(B, mat({ color: 0x8a4a2a, roughness: 0.8 }), 5.95, 0.17, 5.85, 0.16, 0.12, 0.34, 14);
    const leaf = mat({ color: 0x4a4a2a, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; B.geo(leaf, new THREE.PlaneGeometry(0.06, 0.4), TRS(5.95 + Math.cos(a) * 0.08, 0.55, 5.85 + Math.sin(a) * 0.08, Math.cos(a) * 0.6, a, Math.sin(a) * 0.6)); }
    // calendar
    const cal = (() => {
      const c = makeCanvas(256, 360), x2 = ctx2d(c);
      x2.fillStyle = '#efe9da'; x2.fillRect(0, 0, 256, 360); x2.fillStyle = '#3c5a7a'; x2.fillRect(0, 0, 256, 120);
      x2.fillStyle = '#efe9da'; x2.font = 'bold 26px Georgia, serif'; x2.textAlign = 'center'; x2.fillText('OCTOBER', 128, 70);
      x2.strokeStyle = '#999'; x2.lineWidth = 1;
      for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) { x2.strokeRect(10 + k * 34, 130 + r * 36, 34, 36); x2.fillStyle = '#444'; x2.font = '10px Georgia'; x2.textAlign = 'left'; x2.fillText(String(r * 7 + k + 1).slice(0, 2), 13 + k * 34, 141 + r * 36); }
      x2.font = '15px "Caveat", cursive'; x2.fillStyle = '#b3261e';
      for (const [r, k] of [[1, 1], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 4]]) x2.fillText('NIGHT', 12 + k * 34, 162 + r * 36);
      return canvasTex(c, { wrap: false });
    })();
    root.add(plane(0.3, 0.42, new THREE.MeshStandardMaterial({ map: cal, roughness: 0.8 }), 7.2, 1.45, 0.722, 0));
  }

  // ---------------- kitchen ----------------
  {
    // fridge
    B.box(7.75, 0, 0.74, 8.45, 1.74, 1.38, { def: M.whitePlastic });
    B.box(7.76, 1.22, 1.38, 8.44, 1.73, 1.4, M.whitePlastic); B.box(7.76, 0.02, 1.38, 8.44, 1.2, 1.4, M.whitePlastic);
    cyl(B, M.chrome, 7.83, 1.4, 1.43, 0.012, 0.012, 0.25, 8); cyl(B, M.chrome, 7.83, 0.92, 1.43, 0.012, 0.012, 0.32, 8);
    addCollider(7.75, 0.72, 8.45, 1.42, 'furniture');
    W.props.fridgeNote = plane(0.2, 0.25, new THREE.MeshStandardMaterial({ map: TEX.noteThumb, roughness: 0.85 }), 8.16, 1.16, 1.404, 0); root.add(W.props.fridgeNote);
    const mag = mat({ color: 0xd8382c, roughness: 0.3 });
    B.geo(mag, new THREE.CylinderGeometry(0.018, 0.018, 0.012, 14), TRS(8.16, 1.27, 1.41, Math.PI / 2));
    W.props.fridgeDrawing = plane(0.3, 0.225, decalMat(TEX.drawings.lady), 8.12, 0.78, 1.404, 0, 0.03); root.add(W.props.fridgeDrawing);
    for (const [x, y, c] of [[8.0, 0.92, 0x2f6fb5], [8.3, 0.9, 0xf2c12e], [7.9, 1.5, 0x3f9b3a], [8.3, 1.6, 0xc62020]]) B.geo(mat({ color: c, roughness: 0.4 }), new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), TRS(x, y, 1.41, Math.PI / 2));
    // east counter with drawers
    const cx0 = 10.32, cx1 = 10.94;
    B.box(cx0 + 0.04, 0, 1.6, cx1, 0.1, 5.0, M.dark);
    B.box(cx0, 0.1, 1.6, cx1, 0.88, 5.0, { def: M.paintedWood });
    for (let z = 1.6; z < 4.95; z += 0.5) { B.box(cx0 - 0.012, 0.12, z + 0.02, cx0, 0.7, z + 0.48, M.paintedWood); B.box(cx0 - 0.012, 0.72, z + 0.02, cx0, 0.86, z + 0.48, M.paintedWood); cyl(B, M.steel, cx0 - 0.03, 0.79, z + 0.25, 0.008, 0.008, 0.1, 6, Math.PI / 2); }
    B.box(cx0 - 0.03, 0.88, 1.58, cx1, 0.92, 5.02, mat({ color: 0x6d6a5e, roughness: 0.35 }));
    B.box(10.6, 1.45, 1.6, cx1, 2.15, 5.0, M.paintedWood);
    for (let z = 1.6; z < 4.95; z += 0.5) B.box(10.588, 1.47, z + 0.02, 10.6, 2.13, z + 0.48, M.paintedWood);
    addCollider(cx0 - 0.03, 1.58, cx1, 5.02, 'furniture');
    // the battery drawer (dynamic)
    const dr = new THREE.Group(); root.add(dr);
    const dm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.46), M.paintedWood); dm.position.set(0, 0, 0); dr.add(dm);
    const dbody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), M.woodLight); dbody.position.set(0.21, -0.01, 0); dr.add(dbody);
    const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), M.steel); kn.rotation.x = Math.PI / 2; kn.position.set(-0.025, 0, 0); dr.add(kn);
    const batt = mat({ color: 0x1d1d1d, roughness: 0.4 }), bcap = mat({ color: 0xc8963c, metalness: 0.7, roughness: 0.3 });
    for (const dz of [-0.03, 0.0]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.05, 10), batt); b.rotation.x = Math.PI / 2; b.position.set(0.12, 0.05, dz); dr.add(b); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.012, 10), bcap); c.rotation.x = Math.PI / 2; c.position.set(0.12, 0.05, dz + 0.02); dr.add(c); W.props['battery' + (dz ? 0 : 1)] = [b, c]; }
    for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.004, 0.16), M.steel); sp.position.set(0.25 + i * 0.03, 0.045, 0.06); dr.add(sp); }
    // a box of matches and Mom's spare key (taken at 3:09 and 4:05)
    W.props.matchbox = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.036), mat({ color: 0xa8322a, roughness: 0.7 })); W.props.matchbox.position.set(0.3, 0.048, 0.12); dr.add(W.props.matchbox);
    W.props.spareKey = new THREE.Group(); W.props.spareKey.position.set(0.33, 0.042, -0.1); dr.add(W.props.spareKey);
    { const bow = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 14), M.brass); bow.rotation.x = Math.PI / 2; W.props.spareKey.add(bow); const shank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.003, 0.006), M.brass); shank.position.x = 0.03; W.props.spareKey.add(shank); }
    dr.position.set(cx0 - 0.006, 0.79, 2.35); W.drawer = { group: dr, base: dr.position.x, open: 0, target: 0 };
    dr.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // stove top, microwave
    B.box(cx0 - 0.03, 0.92, 3.0, cx1, 0.95, 3.62, M.blackPlastic);
    for (const [dx, dz] of [[0.15, 3.15], [0.45, 3.15], [0.15, 3.47], [0.45, 3.47]]) B.geo(M.steel, new THREE.TorusGeometry(0.06, 0.008, 6, 20), TRS(cx0 + dx, 0.955, dz, Math.PI / 2));
    rbox(B, M.whitePlastic, 10.68, 1.07, 4.55, 0.36, 0.28, 0.48);
    rbox(B, M.dark, 10.497, 1.07, 4.5, 0.004, 0.2, 0.3);
    W.micro = makeDigitDisplay(128, 48);
    W.props.microDisp = plane(0.09, 0.034, new THREE.MeshBasicMaterial({ map: W.micro.tex, color: new THREE.Color(1.8, 1.8, 1.8) }), 10.496, 1.12, 4.73, -Math.PI / 2); root.add(W.props.microDisp);
    // south counter + sink under the window
    B.box(7.9, 0.1, 5.52, cx0, 0.88, 6.14, { def: M.paintedWood });
    B.box(7.9, 0.88, 5.5, cx0, 0.92, 6.14, mat({ color: 0x6d6a5e, roughness: 0.35 }));
    B.box(9.0, 0.921, 5.62, 9.6, 0.925, 6.02, M.steel);
    cyl(B, M.chrome, 9.3, 1.02, 6.06, 0.012, 0.012, 0.2, 8); cyl(B, M.chrome, 9.3, 1.11, 5.98, 0.01, 0.01, 0.16, 8, Math.PI / 2);
    for (let x = 7.9; x < cx0 - 0.1; x += 0.5) B.box(x + 0.02, 0.12, 5.508, x + 0.48, 0.86, 5.52, M.paintedWood);
    addCollider(7.9, 5.5, cx0, 6.14, 'furniture');
    // table + chairs
    table(B, 8.5, 2.6, 9.5, 3.4, 0.74, M.woodMid);
    addCollider(8.5, 2.6, 9.5, 3.4, 'furniture');
    chair(B, 9.0, 2.35, Math.PI, M.woodMid); chair(B, 9.0, 3.65, 0, M.woodMid);
    cyl(B, M.ceramic, 8.9, 0.79, 3.0, 0.1, 0.06, 0.05, 18);
    cyl(B, mat({ color: 0x8a8a80, metalness: 0.5, roughness: 0.5 }), 7.85, 0.32, 5.85, 0.16, 0.14, 0.64, 16);
  }

  // ---------------- Mom's room (mostly darkness) ----------------
  {
    B.box(12.6, 0, -1.0, 14.5, 0.45, 1.0, { def: M.woodDark }); rrbox(B, M.mattress, 13.55, 0.52, 0, 1.85, 0.16, 1.9, 0.05);
    rrbox(B, M.fabRed, 13.4, 0.62, 0, 1.7, 0.1, 1.95, 0.05); B.box(14.45, 0, -1.0, 14.54, 1.1, 1.0, M.woodDark);
    addCollider(12.6, -1.0, 14.54, 1.0, 'furniture');
    B.box(11.1, 0, 1.6, 11.6, 1.1, 2.5, M.woodDark); B.box(11.07, 1.2, 1.7, 11.09, 1.9, 2.4, M.mirrorBack);
    const scrubs = hangingCoat(0.9, 0.42, mat({ color: 0x3f7c78, roughness: 0.9, map: TEX.fabric.map })); scrubs.position.set(12.0, 1.85, -2.4); bakeGroup(B, scrubs);
    // someone lying under a sheet, head on Mom's pillow. Only there at 4:05.
    const sheetM = new THREE.MeshStandardMaterial({ map: TEX.sheet, color: 0xd8d2c4, roughness: 0.95, side: THREE.DoubleSide });
    const sg = new THREE.Group(); sg.position.set(13.5, 0.7, 0.1); sg.visible = false; root.add(sg);
    const part = (parent, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, sheetM); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    // lying down it is a long lump; sitting up it is a sheet hanging off a head and shoulders
    const lump = new THREE.CapsuleGeometry(0.15, 0.62, 6, 14); { const p = lump.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * 0.012); lump.computeVertexNormals(); }
    part(sg, lump, -0.42, -0.03, 0, 0, 0, Math.PI / 2, 1, 0.62, 1.15);                                            // legs under the sheet
    const upper = new THREE.Group(); upper.position.set(0.0, 0.02, 0); sg.add(upper);                             // hips: it sits up around here
    // torso: neck, sloping shoulders, the sheet falling wide over the arms (a lathe, wrinkled)
    const prof = [[0.075, 0.74], [0.09, 0.69], [0.19, 0.64], [0.25, 0.58], [0.27, 0.46], [0.29, 0.3], [0.33, 0.12], [0.37, 0.0]];
    const drape = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24); { const p = drape.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + Math.sin(a * 6 + y * 4) * 0.06 * (0.75 - y); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } drape.computeVertexNormals(); }
    part(upper, drape, 0.0, 0.0, 0, 0, 0, -Math.PI / 2, 1, 1, 0.72);                                                // the lathe's y axis lies along +x
    const neck = new THREE.Group(); neck.position.set(0.72, 0.0, 0); upper.add(neck);
    const headS = part(neck, new THREE.SphereGeometry(0.115, 18, 14), 0.11, 0.0, 0, 0, 0, 0, 1.15, 1, 0.95);         // head, the cloth pulled tight over the face
    W.sheet = { group: sg, upper, neck, head: headS, t: 0, target: 0 };
    W.anchors.momBed = V3(13.4, 0.85, 0.1);
  }

  // ---------------- what she leaves behind (blood; shown hour by hour) ----------------
  {
    // a little self-light so wet red still reads when the beam is elsewhere
    const deco = (tex, w, h, parent, x, y, z, ry, extra = {}) => { const m = plane(w, h, decalMat(tex, { roughness: 0.35, metalness: 0.05, emissive: 0x4a0606, ...extra }), x, y, z, ry); m.visible = false; parent.add(m); return m; };
    W.blood = {
      mirror: deco(TEX.blood.mirror, 0.55, 0.55, root, 7.001, 1.38, -1.65, Math.PI / 2, { roughness: 0.25 }),
      momDoor: deco(TEX.blood.hands, 0.62, 0.62, D.mom.leaf, 0.45, 1.08, 0.033, 0),
      hall: deco(TEX.blood.letmein, 1.45, 0.72, root, 2.75, 1.55, 0.597, Math.PI),
      bedDoor: deco(TEX.blood.hands, 0.55, 0.55, D.bed.leaf, 0.6, 1.05, 0.034, 0), // hall side
      drag: (() => { const m = plane(0.5, 1.5, decalMat(TEX.blood.drag, { roughness: 0.3, emissive: 0x2a0303 }), 9.2, 0.012, 0.0, 0, 0); m.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.06); m.scale.set(1, 2.6, 1); m.visible = false; root.add(m); return m; })(),
    };
  }

  // ---------------- the building corridor outside ----------------
  {
    const R2 = R.corridor;
    const outerDoor = (x, side, label) => {
      const z = side < 0 ? R2.z0 : R2.z1, dz = side < 0 ? 1 : -1;
      B.box(x - 0.45, 0, z, x + 0.45, 2.04, z + dz * 0.035, M.corrDoor);
      B.box(x - 0.52, 0, z, x - 0.45, 2.1, z + dz * 0.02, M.trim); B.box(x + 0.45, 0, z, x + 0.52, 2.1, z + dz * 0.02, M.trim); B.box(x - 0.52, 2.04, z, x + 0.52, 2.12, z + dz * 0.02, M.trim);
      B.geo(M.brass, new THREE.SphereGeometry(0.028, 12, 8), TRS(x + 0.36, 0.98, z + dz * 0.07));
      const pl = plane(0.1, 0.05, new THREE.MeshStandardMaterial({ map: TEX.plates[label], metalness: 0.6, roughness: 0.4 }), x, 1.72, z + dz * 0.037, side < 0 ? 0 : Math.PI); root.add(pl);
    };
    outerDoor(-2.7, 1, '2A'); outerDoor(-4.9, -1, '2C'); outerDoor(-7.1, 1, '2D'); outerDoor(-7.9, -1, '2E');
    B.box(-9.94, 0, -0.45, -9.9, 2.04, 0.45, M.corrDoor); B.box(-9.9, 1.3, -0.12, -9.895, 1.75, 0.12, mat({ color: 0x223038, roughness: 0.1 }));
    const exit = plane(0.36, 0.16, new THREE.MeshBasicMaterial({ map: TEX.exit, color: new THREE.Color(3.2, 3.2, 3.2) }), -9.88, 2.25, 0, Math.PI / 2); root.add(exit);
    W.corrFixtures = [];
    for (const x of [-2.2, -6.6]) {
      B.box(x - 0.6, H - 0.06, -0.16, x + 0.6, H, 0.16, M.steel);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.2, 2.1) }));
      p.rotation.x = Math.PI / 2; p.position.set(x, H - 0.061, 0); root.add(p); W.corrFixtures.push(p);
    }
    // outer face of our door frame
    B.box(-0.075, 0, -0.52, -0.06, 2.12, -0.45, M.trim); B.box(-0.075, 0, 0.45, -0.06, 2.12, 0.52, M.trim); B.box(-0.075, 2.04, -0.52, -0.06, 2.12, 0.52, M.trim);
    // a mat outside our door
    B.box(-0.75, 0, -0.4, -0.08, 0.012, 0.4, mat({ color: 0x5a4a3a, roughness: 1, map: TEX.carpet.map }));
  }

  // ---------------- reaching arm (front door gap) + fingers under the door ----------------
  {
    const skin = mat({ map: TEX.skin.map, normalMap: TEX.skin.normalMap, color: 0xd8d0c8, roughness: 0.55 });
    M.skin = skin;
    const finger = (len, r) => { const g = new THREE.Group(); const seg = len / 3; let p = g; const joints = [];
      for (let k = 0; k < 3; k++) { const j = new THREE.Group(); j.position.x = k ? seg : 0; p.add(j); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - k * 0.15), seg, 4, 8), skin); m.rotation.z = -Math.PI / 2; m.position.x = seg / 2; m.castShadow = true; j.add(m); joints.push(j); p = j; }
      g.userData.joints = joints; return g; };
    const under = new THREE.Group(); under.visible = false; root.add(under);
    const fingers = [];
    for (let i = 0; i < 4; i++) { const f = finger(0.2 + (i === 1 || i === 2 ? 0.04 : 0), 0.0075); f.position.set(-0.05, 0.008, -0.07 + i * 0.045); f.rotation.y = (i - 1.5) * -0.12; under.add(f); fingers.push(f); }
    for (let i = 0; i < 4; i++) { const f = finger(0.19, 0.007); f.position.set(-0.05, 0.008, 0.16 + i * 0.04); f.rotation.y = (i - 1.5) * -0.1; under.add(f); fingers.push(f); }
    W.under = { group: under, fingers, t: 0, show: 0 };
    const arm = new THREE.Group(); arm.visible = false; root.add(arm);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.55, 4, 10), skin); fore.rotation.z = -Math.PI / 2; fore.position.x = 0.0; fore.castShadow = true; arm.add(fore);
    const hand = new THREE.Group(); hand.position.x = 0.32; arm.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.07), skin); palm.position.x = 0.05; hand.add(palm);
    const afing = [];
    for (let i = 0; i < 4; i++) { const f = finger(0.17, 0.0075); f.position.set(0.1, 0, -0.03 + i * 0.02); hand.add(f); afing.push(f); }
    const th = finger(0.11, 0.008); th.position.set(0.03, 0, -0.045); th.rotation.y = 0.8; hand.add(th); afing.push(th);
    W.reach = { group: arm, hand, fingers: afing, t: 0, show: 0 };
    // fingers through the closet louvers (4:44) and around the edge of your bedroom door (5:13)
    const rig = (n, len, at, ry, rz, spread, r = 0.0072) => {
      const g = new THREE.Group(); g.position.copy(at); g.rotation.set(0, ry, rz); g.visible = false; root.add(g);
      const fs = [];
      for (let i = 0; i < n; i++) { const f = finger(len * (i === 1 || i === 2 ? 1.12 : 1), r); f.position.set(0, (i - (n - 1) / 2) * spread, 0); g.add(f); fs.push(f); }
      return { group: g, fingers: fs, t: 0, show: 0, base: at.clone() };
    };
    W.slatFingers = rig(4, 0.19, V3(1.5, 0.96, -0.6), Math.PI / 2, 0.08, 0.052, 0.009); // one finger through each gap, under her face
    W.edgeFingers = rig(4, 0.26, V3(4.7, 1.14, -0.58), 1.93, 0, 0.026, 0.011); // round the latch edge, into the room
  }

  // ---------------- Mom, backlit, for the ending ----------------
  {
    // she kneels in the doorway with her arms open; seen only against the daylight behind her
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.85 });
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, dark); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
    const coat = [[0.001, 1.18], [0.1, 1.18], [0.2, 1.12], [0.2, 0.95], [0.16, 0.75], [0.22, 0.5], [0.3, 0.3], [0.001, 0.3]];
    add(new THREE.LatheGeometry(coat.map(([r, y]) => new THREE.Vector2(r, y)), 20)).scale.z = 0.7;
    add(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), 0, 1.24, 0);
    add(new THREE.SphereGeometry(0.105, 16, 12), 0.02, 1.36, 0).scale.set(1, 1.15, 1);
    const hair = add(new THREE.SphereGeometry(0.125, 16, 12, 0, TAU, 0, Math.PI * 0.62), -0.01, 1.38, 0); hair.scale.set(1, 1.1, 1.05);
    add(new THREE.CylinderGeometry(0.12, 0.17, 0.32, 16, 1, true), -0.025, 1.22, 0).scale.z = 0.95;
    add(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), 0.17, 0.33, -0.1, 0, 0, Math.PI / 2 - 0.15); // thigh, knee forward
    add(new THREE.CapsuleGeometry(0.065, 0.38, 4, 8), -0.08, 0.12, 0.12, 0, 0, Math.PI / 2 + 0.05); // shin on the floor
    // a capsule from point a to point b
    const limb = (a, b, r) => {
      const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r), 4, 8), dark);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m); return m;
    };
    for (const s of [-1, 1]) {
      const sh = [0.0, 1.12, s * 0.15], el = [0.2, 1.0, s * 0.38], hd = [0.46, 1.02, s * 0.36];
      limb(sh, el, 0.05); limb(el, hd, 0.043);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark); hand.position.set(...hd); hand.scale.set(1.3, 0.7, 1); g.add(hand);
    }
    g.position.set(-0.7, 0, 0);
    W.momFigure = g;
  }

  // ---------------- candles Mom set out (lit at 3:09, blown out at 3:51) ----------------
  {
    const wax = mat({ color: 0xe6dcc3, roughness: 0.72 });
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.55), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    const spots = [V3(1.12, 0.745, 0.3), V3(2.86, 0.425, 3.4), V3(9.2, 0.745, 2.82)]; // hall phone table, coffee table, kitchen table
    W.candles = spots.map((p, i) => {
      const g = new THREE.Group(); g.position.copy(p); root.add(g);
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, 0.012, 18), M.ceramic); saucer.position.y = 0.006; saucer.receiveShadow = true; g.add(saucer);
      const h = 0.1 + i * 0.025;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, h, 14), wax); body.position.y = 0.012 + h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.012, 4), M.dark); wick.position.y = 0.012 + h + 0.006; g.add(wick);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 10, 8), flameMat); flame.position.y = 0.012 + h + 0.021; flame.visible = false; g.add(flame);
      return { group: g, flame, top: V3(p.x, p.y + 0.012 + h + 0.03, p.z), lit: false, seed: Math.random() * 10, flicker: 1 };
    });
  }

  // ---------------- dust in the flashlight beam ----------------
  {
    const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = rand(-3, 3); pos[i * 3 + 1] = rand(0.1, 2.6); pos[i * 3 + 2] = rand(-3, 3); seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    W.dustU = { lp: { value: V3() }, ld: { value: V3(0, 0, -1) }, cosA: { value: Math.cos(0.46) }, inten: { value: 0 }, map: { value: TEX.dot }, time: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: W.dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform vec3 lp; uniform vec3 ld; uniform float cosA; uniform float inten; uniform float time; varying float vA;
        void main(){ vec3 p = position; p.y += sin(time * 0.3 + seed * 40.0) * 0.05; p.x += sin(time * 0.21 + seed * 17.0) * 0.06;
          vec4 wp = modelMatrix * vec4(p, 1.0); vec3 d = wp.xyz - lp; float dist = length(d);
          float cone = smoothstep(cosA, cosA + 0.08, dot(d / max(dist, 1e-4), ld));
          vec4 mv = viewMatrix * wp;
          vA = cone * inten * smoothstep(5.0, 0.3, dist) * smoothstep(0.45, 1.1, -mv.z) * (0.4 + 0.6 * fract(seed * 13.7));
          gl_Position = projectionMatrix * mv; gl_PointSize = min(14.0, (1.5 + seed * 2.5) * (300.0 / -mv.z) * 0.01); }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).r * vA; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * 0.55, 1.0); }`,
    });
    W.dust = new THREE.Points(geo, m); W.dust.frustumCulled = false; root.add(W.dust);
  }

  // ---------------- interactables ----------------
  const hot = (id, x, y, z, hx, hy, hz, range) => addInteract({ id, pos: V3(x, y, z), half: V3(hx, hy, hz), range, label: () => Story.label(id), use: () => Story.use(id) });
  hot('flashlight', 3.25, 0.56, -3.45, 0.12, 0.08, 0.12);
  hot('musicboxNight', 3.88, 0.56, -3.98, 0.1, 0.06, 0.08);
  hot('alarm', 3.88, 0.54, -3.82, 0.09, 0.05, 0.05);
  hot('bed', 3.0, 0.5, -3.1, 0.45, 0.12, 0.8);
  hot('bedWindow', 4.4, 1.5, -4.13, 0.8, 0.65, 0.08, 2.2);
  hot('phone', 1.42, 0.82, 0.42, 0.13, 0.08, 0.13);
  hot('note', 8.16, 1.16, 1.41, 0.12, 0.14, 0.05);
  hot('fridgeDrawing', 8.12, 0.78, 1.41, 0.16, 0.12, 0.05);
  hot('peephole', 0.05, 1.55, 0.0, 0.08, 0.1, 0.12, 1.9);
  hot('chain', 0.09, 1.44, 0.38, 0.09, 0.13, 0.16, 2.0);
  hot('frontknob', 0.06, 0.98, 0.38, 0.06, 0.08, 0.06);
  hot('switch', 0.98, 1.18, 0.59, 0.05, 0.07, 0.03); hot('switch', 3.62, 1.18, -0.59, 0.05, 0.07, 0.03); hot('switch', 8.52, 1.18, -0.59, 0.05, 0.07, 0.03);
  hot('scrawl', 0.56, 1.14, 0.59, 0.4, 0.2, 0.04);
  hot('keyhooks', 0.4, 1.49, 0.59, 0.18, 0.05, 0.03);
  hot('coat', 0.4, 1.1, -0.47, 0.18, 0.45, 0.1);
  hot('clock', 2.86, 1.95, -0.59, 0.17, 0.17, 0.04, 2.6);
  hot('photoNurse', 5.55, 1.66, -0.59, 0.16, 0.19, 0.04, 2.2); hot('photoSchool', 6.32, 1.28, -0.59, 0.14, 0.17, 0.04); hot('photoBeach', 8.72, 1.55, 0.59, 0.24, 0.2, 0.04, 2.2);
  hot('drawingHall', 3.26, 1.13, -0.59, 0.18, 0.14, 0.04); hot('drawingHall2', 3.2, 0.62, -0.59, 0.16, 0.12, 0.04);
  hot('closet', 1.3, 1.1, -0.64, 0.45, 0.6, 0.06);
  hot('bedDoor', 4.22, 1.1, -0.66, 0.42, 0.6, 0.08);
  hot('bathDoor', 8.0, 1.1, -0.66, 0.4, 0.6, 0.08);
  hot('momDoor', 10.98, 1.1, 0, 0.08, 0.6, 0.42);
  hot('curtain', 7.86, 1.1, -2.34, 0.85, 0.6, 0.05, 1.9);
  hot('musicboxTub', 8.0, 0.16, -2.75, 0.12, 0.08, 0.12, 2.0);
  hot('mirror', 6.99, 1.36, -1.65, 0.04, 0.36, 0.31, 2.0);
  hot('duck', 8.32, 0.16, -2.6, 0.06, 0.06, 0.06);
  hot('drawer', 10.3, 0.79, 2.35, 0.05, 0.07, 0.24);
  hot('microwave', 10.5, 1.07, 4.55, 0.04, 0.14, 0.24);
  hot('tv', 2.9, 0.79, 1.24, 0.3, 0.24, 0.05, 2.4);
  hot('calendar', 7.2, 1.45, 0.73, 0.16, 0.22, 0.03);
  hot('livingWindow', 4.4, 1.5, 6.12, 1.2, 0.7, 0.08, 2.2);
  hot('wardrobe', 5.8, 1.0, -1.72, 0.05, 0.8, 0.46);
  hot('couch', 3.3, 0.5, 5.35, 1.1, 0.3, 0.45);
  hot('stove', 10.6, 0.95, 3.3, 0.3, 0.05, 0.3);
  W.candles.forEach((c, i) => hot('candle' + i, c.group.position.x, c.group.position.y + 0.08, c.group.position.z, 0.07, 0.1, 0.07));
  hot('kitchenWindow', 9.3, 1.65, 6.12, 0.7, 0.55, 0.08, 2.2);
  hot('bathSink', 7.24, 0.9, -1.65, 0.24, 0.1, 0.22);

  // ---------------- finish ----------------
  // the static batches + door leaves are what the flashlight beam can land on (see Beam in 06_player)
  W.rayMeshes = B.build(root).concat(...Object.values(D).map(d => d.meshes)).filter(m => !m.material.transparent)
    .concat(W.props.showerCurtain, W.curtains.map(c => c.mesh)); // cloth the beam can't pass through
  W.anchors.windows = [V3(4.4, 1.5, -4.2), V3(4.4, 1.5, 6.2), V3(9.3, 1.6, 6.2)];
  W.anchors.street = V3(6, 0, 16);
  W.anchors.fridge = V3(8.1, 0.35, 0.95); // the compressor, low at the back
  W.anchors.frontOut = V3(-0.35, 1.5, 0);
  W.anchors.frontIn = V3(0.25, 1.4, 0);
  W.anchors.momDoor = V3(10.9, 1.4, 0);
  W.anchors.tub = V3(7.95, 0.2, -2.75);
  W.anchors.bathDoor = V3(8.0, 1.3, -0.7);
  W.anchors.hallLamp = V3(5.6, 2.5, 0);
  A.anchors = W.anchors;
  // TV security camera (render target shown on the TV in chapter 5)
  W.tvCam = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 30);
  W.tvCam.position.set(10.75, 2.5, 5.95); W.tvCam.lookAt(7.3, 0.85, 1.75); W.tvCam.layers.enable(2);
  W.tvRT = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType });
  W.tvCamMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: W.tvRT.texture }, time: { value: 0 }, label: { value: W.tvTex.tex } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tex; uniform sampler2D label; uniform float time; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv; uv.x += (h(vec2(floor(uv.y * 90.0), floor(time * 24.0))) - 0.5) * 0.006;
        vec3 c = texture2D(tex, uv).rgb; float l = dot(c, vec3(0.3, 0.59, 0.11));
        l = pow(clamp(l * 2.4, 0.0, 1.0), 0.75);
        l += (h(uv * 300.0 + time) - 0.5) * 0.18; l *= 0.85 + 0.15 * sin(uv.y * 380.0);
        l *= smoothstep(0.85, 0.3, length(vUv - 0.5));
        float lab = texture2D(label, vUv).r;
        vec3 col = vec3(l * 0.9, l, l * 0.92) + lab * 0.8;
        gl_FragColor = vec4(col * 1.3, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // initial state
  W.reset();
}

// ---------------------------------------------------------------------------
// world-state API
// ---------------------------------------------------------------------------
W.reset = function () {
  this.alarmText = null;
  for (const k in this.doors) { const d = this.doors[k]; d.speed = 2.2; d.jitter = 0; d._slam = false; }
  this.setPhotos(0); this.setDrawings('normal'); this.setCoat(true);
  this.setMusicBox('nightstand', false); this.setHall('off'); this.setSky('night'); this.setRain(1);
  this.setClock(3, 0); this.setTV('off'); this.setUnderDoor(1, 0); this.setShowerCurtain(false, true);
  this.setDrawer(false, true); this.setMicrowave(null); this.setAlarm(true);
  this.setFlashlightProp(true); this.setHandset(true); this.setChain(true);
  this.doors.front.set(0, true); this.doors.bed.set(0.92, true); this.doors.bath.set(0.25, true); this.doors.mom.set(0, true);
  this.doors.closetL.set(0, true); this.doors.closetR.set(0, true); this.doors.wardrobe.set(0.08, true);
  this.under.show = 0; this.under.group.visible = false; this.reach.show = 0; this.reach.group.visible = false;
  this.momFigure.visible = false; this.ghostInMirror = false; this.lightning.auto = true; this.lightning.seq = null;
  this.corridorDay = false; this.corrFlicker = 0.02; this.sunT = 0; L.hall.position.set(5.6, 2.45, 0);
  for (const b of [0, 1]) this.props['battery' + b].forEach(m => (m.visible = true));
  L.warm.intensity = 0; L.warm.distance = 6; L.warm.color.set(0xffc890); L.hemi.intensity = 0.3; L.hemi.color.set(0x2a3a4e);
  L.sky.color.set(0xbfd4ff); L.sky.intensity = 0; L.sky.position.set(1.3, 7.5, 16); L.sky.shadow.needsUpdate = true;
  L.corr1.color.set(0xe6f4ee); L.corr2.color.set(0xe6f4ee); L.corr1.intensity = 4; L.corr2.intensity = 2.5;
  this.props.moon.material.emissiveIntensity = 2.6; L.night.intensity = 1.8;
  this.setBlood(0); this.machineMode = 'idle'; this.setHandsetOff(false);
  this.setCandles('unlit'); this.props.matchbox.visible = true; this.props.spareKey.visible = true;
  for (const c of this.curtains) { c.open = c.target = 0; c.mesh.position.copy(c.base); c.mesh.scale.x = 1; }
  const s = this.sheet; s.group.visible = false; s.t = s.target = 0;
  for (const r of [this.slatFingers, this.edgeFingers]) { r.show = 0; r.group.visible = false; }
};
// blood, hour by hour: 1 the mirror, 2 + her door, 3 + the hall wall, 4 + your door and the drag marks
W.setBlood = function (level) {
  const b = this.blood; this.bloodLevel = level;
  b.mirror.visible = level >= 1; b.momDoor.visible = level >= 2; b.hall.visible = level >= 3; b.bedDoor.visible = level >= 4; b.drag.visible = level >= 4;
};
// candles: 'unlit' (set out, waiting), 'lit', 'out' (blown out, cold)
W.setCandles = function (mode, mask = null) { // mask: which ones you actually lit
  this.candleMode = mode;
  this.candles.forEach((c, i) => { c.lit = mode === 'lit' && (!mask || !!mask[i]); c.flame.visible = c.lit; });
};
W.lightCandle = function (i) { const c = this.candles[i]; if (!c || c.lit) return false; c.lit = true; c.flame.visible = true; return true; };
W.litCount = function () { return this.candles.filter(c => c.lit).length; };
W.openCurtains = function (name, open = true) { let n = 0; for (const c of this.curtains) if (c.win === name) { c.target = open ? 1 : 0; n++; } return n; };
W.curtainsOpen = function (name) { return this.curtains.some(c => c.win === name && c.target > 0); };
W.setHandsetOff = function (off) {
  const hs = this.props.handset, h = this.handsetHome; this.handsetOff = off; hs.visible = true;
  if (off) { hs.position.set(0.03, 0.026, -0.13); hs.rotation.set(Math.PI, 0.4, 0); }
  else { hs.position.copy(h.pos); hs.rotation.copy(h.rot); }
};
W.setPhotos = function (v) { this.photoVariant = v; for (const p of this.photos) { p.mesh.material.map = TEX.photos[p.kind][v]; p.mesh.material.needsUpdate = true; } };
W.setDrawings = function (set) {
  const late = set === 'late';
  this.props.drawHall.material.map = late ? TEX.drawings.wantsmom : TEX.drawings.meandmom; this.props.drawHall.material.needsUpdate = true;
  this.drawingSet = set;
};
W.setCoat = function (on) { this.props.momCoat.visible = on; this.coatOn = on; };
W.setMusicBox = function (where, open) {
  const mb = this.musicBox; mb.where = where; mb.group.visible = where !== 'none';
  if (where === 'nightstand') { mb.group.position.set(3.86, 0.5, -3.99); mb.group.rotation.y = 0.3; }
  else if (where === 'tub') { mb.group.position.set(7.98, 0.1, -2.74); mb.group.rotation.y = 2.6; }
  mb.target = open ? 1 : 0; mb.open = mb.target;
};
W.setHall = function (mode) { this.hallMode = mode; };
W.setRain = function (v) { this.rain = v; RAIN_U.rain.value = v; A.setRain(v); };
W.setSky = function (mode) {
  this.sky = mode;
  if (mode === 'night') { SKY_U.mixDawn.value = 0; SKY_U.bright.value = 0.55; }
  if (mode === 'predawn') { SKY_U.mixDawn.value = 0.25; SKY_U.bright.value = 0.45; }
};
W.setClock = function (h, m) { this.clock.h = h; this.clock.m = m; this.clock.base = G.time; this.updateAlarm(); };
W.clockMinutes = function () { return this.clock.h * 60 + this.clock.m + Math.floor((G.time - this.clock.base) / 60); };
W.timeText = function () { const t = this.clockMinutes(); return `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, '0')}`; };
W.setAlarm = function (on) { this.alarmOn = on; this.updateAlarm(); };
W.updateAlarm = function () { if (!this.alarm) return; this.alarm.set(this.alarmText || this.timeText(), '#ff3a2a', this.alarmOn !== false); this._alarmShown = this.alarmText || this.timeText(); };
W.setMicrowave = function (text) { this.micro.set(text || '', '#5dff7a', !!text); this.props.microDisp.visible = true; };
W.setTV = function (mode) {
  this.tvMode = mode;
  this.tvScreen.material = mode === 'cam' ? this.tvCamMat : this.tvScreenStd;
  this.tvScreenStd.emissiveIntensity = mode === 'off' ? 0 : 1.2;
  if (mode === 'off') L.tv.intensity = 0;
};
W.setUnderDoor = function (level, feet) { this.underDoor = level; this.feet = feet; };
W.setShowerCurtain = function (open, instant) { this.curtainTarget = open ? 1 : 0; if (instant) this.curtainOpen = this.curtainTarget; };
W.setDrawer = function (open, instant) { this.drawer.target = open ? 1 : 0; if (instant) this.drawer.open = this.drawer.target; };
W.setFlashlightProp = function (v) { this.props.flashlight.visible = v; };
W.setHandset = function (onCradle) { this.props.handset.visible = onCradle; };
W.setChain = function (on) { this.chainOn = on; };
W.lightningNow = function (strength = 1, thunderDelay = 1.2) {
  const s = Settings.reduceFlashing ? Math.min(strength, 0.35) : strength;
  this.lightning.seq = Settings.reduceFlashing ? [[0, s * 0.6], [0.25, s], [0.6, 0]] : [[0, s], [0.06, s * 0.15], [0.11, s * 0.85], [0.2, s * 0.3], [0.28, s * 0.6], [0.45, 0]];
  this.lightning.t0 = G.time; this.lightning.t = rand(30, 70); // rare: the storm is moving off, the flat is quiet
  A.thunder(strength > 0.8 ? 0.8 : 0.4, thunderDelay);
};
W.sunrise = function () { this.sky = 'sunrise'; this.sunT = 0.0001; };
W.setCorridorDay = function (on) {
  this.corridorDay = on;
  if (on) { L.corr1.color.set(0xffe2b8); L.corr2.color.set(0xffe2b8); L.corr1.intensity = 9; L.corr2.intensity = 6; }
};

// chain links: hang between the frame anchor and the track on the door
W.updateChain = function () {
  const c = this.chain, d = this.doors.front;
  const ang = d.base + d.swing * d.maxAngle * d.t;
  const lx = 0.76, lz = -0.04; // track slot in door-local coords (hall side)
  const tx = d.pivot.position.x + Math.cos(ang) * lx + Math.sin(ang) * lz;
  const tz = d.pivot.position.z - Math.sin(ang) * lx + Math.cos(ang) * lz;
  const A0 = c.anchor, B0 = this.chainOn ? V3(tx, 1.48, tz) : V3(A0.x + 0.01, A0.y - 0.2, A0.z - 0.01);
  const span = A0.distanceTo(B0), sag = this.chainOn ? Math.max(0, (c.len - span)) * 0.55 : 0;
  c.links.children.forEach((l, i) => {
    const t = (i + 0.5) / c.links.children.length;
    l.position.lerpVectors(A0, B0, t); l.position.y -= Math.sin(t * Math.PI) * sag;
    l.lookAt(B0); l.rotateZ(i % 2 ? Math.PI / 2 : 0);
  });
};

W.update = function (dt, playerRoom, headPos) {
  const t = G.time;
  for (const k in this.doors) this.doors[k].update(dt);
  // the chain stops the front door at a crack
  const fd = this.doors.front;
  if (this.chainOn && fd.t > 0.075) { fd.t = 0.075; fd.apply(); }
  this.updateChain();
  // clocks
  const mins = this.clock.h * 60 + this.clock.m + (t - this.clock.base) / 60;
  for (const c of this.clocks) {
    c.second.rotation.z = -Math.floor(t % 60) / 60 * TAU;
    c.minute.rotation.z = -(mins % 60) / 60 * TAU;
    c.hour.rotation.z = -((mins / 60) % 12) / 12 * TAU;
  }
  if ((this.alarmText || this.timeText()) !== this._alarmShown) this.updateAlarm();
  // smoke detector LED blink
  this.props.led.visible = (t % 3) < 0.08;
  // hall lamp
  let target = 0;
  if (this.hallMode === 'on') target = 0.85 + Math.sin(t * 37) * 0.04;
  else if (this.hallMode === 'flicker') { const n = Math.sin(t * 13.1) + Math.sin(t * 29.7 + 1.3) + Math.sin(t * 5.3); target = n > 0.6 ? 1 : n > -0.4 ? 0.05 : 0.6; }
  else if (this.hallMode === 'dying') target = Math.random() < 0.025 ? 0.9 : 0;
  this.hallLevel = this.hallMode === 'flicker' || this.hallMode === 'dying' ? target : damp(this.hallLevel, target, 12, dt);
  L.hall.intensity = this.hallLevel * 4.2;
  for (const d of this.domes) d.material.emissiveIntensity = this.hallLevel * 2.2;
  A.setBuzz(this.hallLevel > 0.02 ? 0.4 + this.hallLevel * 0.6 : 0, this.anchors.hallLamp);
  // lightning
  const lg = this.lightning;
  if (lg.auto && this.rain > 0.3 && G.state === 'play' && (lg.t -= dt) <= 0) this.lightningNow(rand(0.35, 1), rand(0.8, 3.5));
  let lv = 0;
  if (lg.seq) {
    const e = t - lg.t0; let i = 0;
    while (i < lg.seq.length - 1 && lg.seq[i + 1][0] <= e) i++;
    lv = i >= lg.seq.length - 1 ? 0 : lg.seq[i][1];
    if (e > lg.seq[lg.seq.length - 1][0]) lg.seq = null;
  }
  lg.level = lv;
  // sky light: lightning or sunrise
  if (this.sunT > 0) {
    this.sunT = Math.min(1, this.sunT + dt / 7);
    const s = smooth(0, 1, this.sunT);
    SKY_U.mixDawn.value = lerp(0.3, 1, s); SKY_U.bright.value = lerp(0.5, 1.5, s);
    L.sky.color.setRGB(1, lerp(0.75, 0.82, s), lerp(0.5, 0.62, s));
    L.sky.position.set(lerp(1.3, 16, s), lerp(7.5, 3.2, s), lerp(16, 14, s));
    L.sky.intensity = lerp(0.35, 4.2, s); L.hemi.intensity = lerp(0.3, 0.7, s); L.hemi.color.setRGB(lerp(0.16, 0.85, s), lerp(0.22, 0.7, s), lerp(0.3, 0.55, s));
    L.warm.position.set(4.5, 1.2, 4); L.warm.intensity = s * 2.5;
    L.sky.shadow.needsUpdate = true;
  } else {
    const moon = this.sky === 'predawn' ? 0.5 : 0.3;
    L.sky.intensity = moon + lv * 7; L.bedFlash.intensity = moon * 6 + lv * 45;
    if (lv > 0) L.sky.shadow.needsUpdate = true;
  }
  SKY_U.bright.value = this.sunT > 0 ? SKY_U.bright.value : (this.sky === 'predawn' ? 0.45 : 0.55) + lv * 4;
  RAIN_U.flash.value = lv; RAIN_U.time.value = t;
  // the building corridor's fluorescent tube stutters; the strip under our door follows it
  let corr = 1;
  if (!this.corridorDay && Math.random() < this.corrFlicker) this._corrBlink = rand(0.05, 0.4);
  if (this._corrBlink > 0) { this._corrBlink -= dt; corr = Math.random() < 0.5 ? 0.1 : 0.8; }
  L.corr1.intensity = (this.corridorDay ? 9 : 4) * corr;
  this.corrFixtures[0].material.color.setScalar(this.corridorDay ? 2.4 : 2.1 * corr);
  W.doorStripU.level.value = this.underDoor * corr * (this.corridorDay ? 1.6 : 1);
  W.doorStripU.feet.value = damp(W.doorStripU.feet.value, this.feet, 6, dt);
  W.doorStripU.feetZ.value = Math.sin(t * 0.7) * 0.02 * this.feet;
  L.door.intensity = this.underDoor * corr * 0.35;
  // music box lid + dancer
  const mb = this.musicBox;
  mb.open = damp(mb.open, mb.target, 8, dt);
  mb.lid.rotation.x = -mb.open * 1.75;
  if (A.musicBox && mb.open > 0.5) mb.dancer.rotation.y += dt * 2.2;
  // shower curtain: bunch toward the wall
  this.curtainOpen = damp(this.curtainOpen, this.curtainTarget, 5, dt);
  const sc = this.props.showerCurtain; sc.scale.x = 1 - this.curtainOpen * 0.78; sc.position.x = 7.86 - this.curtainOpen * 0.66;
  // drawer
  const dr = this.drawer; dr.open = damp(dr.open, dr.target, 7, dt); dr.group.position.x = dr.base - dr.open * 0.3;
  // curtains breathe in the draft; opened ones bunch up at the sides
  for (const c of this.curtains) {
    c.open = damp(c.open, c.target, 3, dt);
    c.mesh.position.y = c.base.y + Math.sin(t * 0.6 + c.phase) * 0.004;
    c.mesh.position[c.axis] = c.base[c.axis] + c.s * c.open * c.w * 0.5;
    c.mesh.scale.x = 1 - c.open * 0.5;
  }
  // candle flames, and the one light that follows the nearest of them
  let best = null, bd = 1e9;
  for (const c of this.candles) {
    if (!c.lit) continue;
    c.flicker = 0.82 + 0.18 * Math.sin(t * 13 + c.seed) * Math.sin(t * 7.3 + c.seed * 2) - (Math.random() < 0.03 ? 0.2 : 0);
    c.flame.scale.set(1, 2.1 + c.flicker * 0.7, 1);
    if (headPos) { const d = c.top.distanceTo(headPos); if (d < bd) { bd = d; best = c; } }
  }
  if (best && bd < 7) { L.candle.position.copy(best.top); L.candle.intensity = 1.25 * best.flicker; } else L.candle.intensity = 0;
  // fingers under the door / arm through the gap
  const u = this.under; u.t += dt;
  if (u.show > 0) {
    u.group.visible = true;
    u.fingers.forEach((f, i) => {
      const ext = clamp(u.show, 0, 1) * (0.7 + 0.3 * Math.sin(u.t * 1.3 + i));
      f.position.x = -0.05 + ext * 0.12;
      f.userData.joints.forEach((j, k) => (j.rotation.z = k ? -Math.max(0, Math.sin(u.t * 3 + i * 0.7)) * 0.4 : 0));
      f.userData.joints[0].rotation.y = Math.sin(u.t * 2 + i) * 0.1;
    });
  } else u.group.visible = false;
  const r = this.reach; r.t += dt;
  if (r.show > 0) {
    r.group.visible = true;
    const ang = fd.base + fd.swing * fd.maxAngle * fd.t;
    r.group.position.set(0.02 + Math.sin(r.t * 1.7) * 0.05 + r.show * 0.18, 1.05 + Math.sin(r.t * 2.3) * 0.08, 0.38 + Math.sin(ang) * 0.02);
    r.group.rotation.set(0, Math.sin(r.t * 1.1) * 0.3, -0.1 + Math.sin(r.t * 1.9) * 0.15);
    r.fingers.forEach((f, i) => f.userData.joints.forEach((j, k) => (j.rotation.z = -(0.2 + 0.5 * Math.max(0, Math.sin(r.t * 4 + i * 0.5))) * (k ? 1 : 0.5))));
  } else r.group.visible = false;
  // fingers through the slats / around the door edge: they reach in along their own axis and flex
  for (const fr of [this.slatFingers, this.edgeFingers]) {
    fr.t += dt;
    if (fr.show > 0) {
      fr.group.visible = true;
      const ext = clamp(fr.show, 0, 1), dir = _v1.set(1, 0, 0).applyEuler(fr.group.rotation);
      fr.group.position.copy(fr.base).addScaledVector(dir, (ext - 1) * 0.12 + Math.sin(fr.t * 1.7) * 0.012);
      fr.fingers.forEach((f, i) => f.userData.joints.forEach((j, k) => (j.rotation.z = -(0.15 + 0.55 * Math.max(0, Math.sin(fr.t * 2.6 + i * 0.8))) * (k ? 1 : 0.4))));
    } else fr.group.visible = false;
  }
  // the answering machine's light: slow blink idle, fast blink with a message, solid while recording
  const led = this.props.machineLed, mm = this.machineMode;
  led.visible = mm === 'rec' ? true : mm === 'msg' ? (t * 4) % 1 < 0.5 : (t * 0.5) % 1 < 0.08;
  // the sheet sits up in jerks
  const sh = this.sheet;
  if (sh.group.visible) {
    const want = sh.target * (1 - (Math.sin(t * 7.3) > 0.85 ? 0.08 : 0));
    sh.t = damp(sh.t, want, sh.target > sh.t ? 1.6 : 4, dt);
    sh.upper.rotation.z = sh.t * 1.32;
    sh.neck.rotation.z = -sh.t * 0.55 + Math.sin(t * 0.9) * 0.03 * sh.t;
    sh.neck.rotation.x = sh.t * (0.45 + Math.sin(t * 23) * 0.04);
  }
  // dust motes around the eye, lit only inside the flashlight cone
  if (headPos) {
    const P = this.dust.geometry.attributes.position, a = P.array;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] - headPos.x > 3) a[i] -= 6; else if (a[i] - headPos.x < -3) a[i] += 6;
      if (a[i + 2] - headPos.z > 3) a[i + 2] -= 6; else if (a[i + 2] - headPos.z < -3) a[i + 2] += 6;
    }
    P.needsUpdate = true;
    this.dustU.time.value = t;
  }
  // TV
  if (this.tvMode === 'static' || this.tvMode === '444' || this.tvMode === 'cam') this.drawTV(t);
  // mirror only renders when we might see it
  this.mirror.visible = playerRoom === 'bath' || (playerRoom === 'hall' && headPos && headPos.x > 6.6 && headPos.x < 9.4);
  // shower + bath anchors for audio
};
W.drawTV = function (t) {
  const tv = this.tvTex;
  if ((tv._next || 0) > t) return; tv._next = t + 0.05;
  const { c, x: x2 } = tv;
  if (this.tvMode === 'cam') {
    x2.clearRect(0, 0, c.width, c.height); x2.fillStyle = '#000'; x2.fillRect(0, 0, c.width, c.height);
    x2.fillStyle = '#fff'; x2.font = '10px "Courier New", monospace';
    x2.fillText('CAM 2  KITCHEN', 8, 14); x2.fillText(`04:${String(12 + Math.floor((t - this.clock.base) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 100, 112);
    if ((t * 2 | 0) % 2) { x2.fillStyle = '#f33'; x2.beginPath(); x2.arc(150, 10, 3, 0, TAU); x2.fill(); x2.fillStyle = '#fff'; x2.fillText('REC', 118, 14); }
    tv.tex.needsUpdate = true;
    this.tvCamMat.uniforms.time.value = t;
    L.tv.intensity = 0.8;
    return;
  }
  const img = x2.createImageData(c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 200; d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.05; d[i + 3] = 255; }
  x2.putImageData(img, 0, 0);
  if (this.tvMode === '444') { x2.fillStyle = 'rgba(0,0,0,0.75)'; x2.fillRect(30, 35, 100, 50); x2.fillStyle = '#e8e8e8'; x2.font = 'bold 36px "Courier New", monospace'; x2.textAlign = 'center'; x2.fillText('4:44', 80, 73); x2.textAlign = 'left'; }
  tv.tex.needsUpdate = true;
  L.tv.intensity = 1.6 + Math.random() * 1.2;
};
