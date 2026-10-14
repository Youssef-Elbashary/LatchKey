// ---------------------------------------------------------------------------
// boot + main loop
// ---------------------------------------------------------------------------
let lastFrame = performance.now(), quality = 1, perfAcc = 0, perfN = 0, attractT = 0;

const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5) * quality;
function resize() {
  if (!G.renderer || !Post.composer) return;
  const w = innerWidth, h = innerHeight;
  if (w < 8 || h < 8) return; // a minimised/hidden window reports 0x0; keep the last good size
  G.renderer.setPixelRatio(pixelRatio()); G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  Post.resize(w, h, pixelRatio());
}

function lockPointer() {
  const c = G.renderer.domElement;
  if (Input.dragLook || document.pointerLockElement === c) return;
  try {
    const p = c.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = c.requestPointerLock(); if (q && q.catch) q.catch(() => { Input.dragLook = true; }); } catch (e) { Input.dragLook = true; } });
  } catch (e) { Input.dragLook = true; }
}

function pause(on) {
  if (on === G.paused || (on && G.state !== 'play')) return;
  G.paused = on;
  $('#pause').hidden = !on;
  if (on) {
    A.suspend(); UI.showHud(false);
    $('#pauseObjective').textContent = UI.currentObjective ? `now: ${UI.currentObjective}` : '';
    $('#btnNote').hidden = !(Story.flags.noteRead || Story.chapter >= 1);
    if (document.pointerLockElement) document.exitPointerLock();
  } else { A.resume(); UI.showHud(true); lockPointer(); }
}

function startGame(ch) {
  A.init(); A.resume(); A.startAmbience();
  $('#title').hidden = true; $('#ending').hidden = true; $('#credits').classList.remove('on');
  Stalker.setGlintsOnly(false); Stalker.hide();
  lockPointer();
  Story.startChapter(ch, { spawn: true, fade: 1.5 });
}

function toTitle() {
  Story.run++; for (const w of Story.waits) w.rej(new Abort()); Story.waits = []; Story.dying = null;
  G.paused = false; G.state = 'title'; attractT = 0;
  $('#pause').hidden = true; $('#ending').hidden = true; UI.hideDeath(); UI.showHud(false); UI.clearCaptions(); UI.showNote(false);
  A.stopMusicBox(false); A.stopRing(); A.stopDial(); A.stopRiser(); A.setTension(0.05);
  if (A.duck) { A.duck.gain.cancelScheduledValues(A.ctx.currentTime); A.duck.gain.setTargetAtTime(1, A.ctx.currentTime, 0.2); }
  if (document.pointerLockElement) document.exitPointerLock();
  W.reset(); P.setMode('free'); P.cine = null; G.camera.fov = 72; G.camera.updateProjectionMatrix(); G.camera.layers.disable(LAYER_OUTSIDE); Post.peep = 0;
  showTitle();
}

function showTitle() {
  const t = $('#title'); t.hidden = false;
  const ch = Save.chapter, cont = $('#btnContinue');
  cont.hidden = !(ch > 0 && ch < CHAPTERS.length);
  if (!cont.hidden) cont.querySelector('.sub').textContent = `${CHAPTERS[ch].clock[0]}:${String(CHAPTERS[ch].clock[1]).padStart(2, '0')} AM`;
  Post.fadeTo(0, 2.5);
  Stalker.show('idle'); Stalker.place(0.7, 0, Math.PI / 2); Stalker.setGlintsOnly(true); Stalker.tilt = 0.6;
  W.setHall('off'); P.hasFlashlight = true; P.flashOn = true;
}

// title screen: a slow drift down the dark hall. Two small lights at the far end.
function attract(dt) {
  attractT += dt;
  const cam = G.camera, t = attractT;
  cam.position.set(9.7 - Math.min(t * 0.05, 2.4), 1.2 + Math.sin(t * 0.8) * 0.01, 0.08);
  cam.lookAt(0.3, 1.18 + Math.sin(t * 0.21) * 0.06, Math.sin(t * 0.13) * 0.12);
  cam.updateMatrixWorld();
  cam.getWorldDirection(_v2);
  _v2.x += Math.sin(t * 0.37) * 0.09; _v2.y += Math.sin(t * 0.29) * 0.04 - 0.08; _v2.z += Math.sin(t * 0.23) * 0.16;
  L.flash.intensity = FLASH_CD;
  L.flash.position.copy(cam.position).add(_v3.set(0, -0.15, 0.1));
  L.flash.target.position.copy(L.flash.position).addScaledVector(_v2.normalize(), 4); L.flash.target.updateMatrixWorld();
  W.dustU.lp.value.copy(L.flash.position); W.dustU.ld.value.copy(_v2); W.dustU.inten.value = 1;
  P.flashModel.visible = false;
  const blink = (t % 9) > 8.82;
  Stalker.parts.eyes.forEach(e => (e.visible = !blink && t > 3));
  Stalker.animate(dt, t, 0); Stalker.group.position.copy(Stalker.pos); Stalker.group.rotation.y = Stalker.yaw;
}

Stalker.setGlintsOnly = function (on) {
  this.group.traverse(o => { if (o.isMesh) o.visible = !on || this.parts.eyes.includes(o); });
};

function warmup() {
  const r = G.renderer, s = G.scene, c = G.camera, hidden = [];
  s.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const tmp = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), W.tvCamMat); tmp.position.set(5, 1, 0); s.add(tmp);
  try { r.compile(s, c); c.layers.enable(LAYER_OUTSIDE); r.compile(s, c); c.layers.disable(LAYER_OUTSIDE); } catch (e) { console.warn('warmup', e); }
  s.remove(tmp); for (const o of hidden) o.visible = false;
}

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastFrame) / 1000; lastFrame = now;
  frame(Math.min(Math.max(dt, 0), 0.05));
}
function frame(dt, render = true) {
  const r = G.renderer;
  if (G.state === 'title') {
    G.time += dt;
    attract(dt);
    W.update(dt, 'hall', G.camera.position);
  } else if (!G.paused && G.state !== 'loading') {
    G.time += dt;
    if (G.state !== 'ending') P.update(dt);
    Story.update(dt);
    Stalker.update(dt, P, G.camera);
    W.update(dt, P.room, P.headPos);
    A.update(dt, { player: P });
    A.setListener(G.camera);
    // keep the frame rate up: trade resolution for smoothness
    perfAcc += dt; perfN++;
    if (perfN >= 75 && !G.lockQuality) {
      const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > 1 / 48 && quality > 0.6) { quality = Math.max(0.6, quality - 0.1); resize(); }
      else if (avg < 1 / 58 && quality < 1) { quality = Math.min(1, quality + 0.05); resize(); }
    }
  }
  if (G.state === 'loading') return;
  Post.update(dt);
  if (!render) { Input.endFrame(); return; }
  r.shadowMap.needsUpdate = true;
  if (W.tvMode === 'cam' && G.state === 'play') {
    // the camera sees in infrared: lift the ambient for its render only
    const h = L.hemi.intensity; L.hemi.intensity = 2.4;
    W.tvScreen.visible = false;
    r.setRenderTarget(W.tvRT); r.render(G.scene, W.tvCam); r.setRenderTarget(null);
    W.tvScreen.visible = true; L.hemi.intensity = h;
  }
  Post.render();
  Input.endFrame();
}

async function boot() {
  Settings.load();
  UI.init();
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('#touchNote').hidden = false;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { UI.loadError('This browser could not start WebGL, which the game needs. Try a current Chrome, Edge or Firefox with hardware acceleration on.'); throw e; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.domElement.className = 'gl';
  $('#app').prepend(renderer.domElement);
  G.renderer = renderer;
  const scene = G.scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x030405, 0.07);
  const camera = G.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 60);
  camera.layers.enable(0); scene.add(camera);

  await buildTextures((p, what) => UI.loading(p * 0.8, what));
  UI.loading(0.85, 'building the apartment…'); await nextFrame();
  buildWorld(scene);
  Stalker.build(scene);
  P.init(camera);
  Story.init();
  Post.init(renderer, scene, camera);
  resize();
  UI.loading(0.92, 'listening…'); await nextFrame();
  try { A.init(); } catch (e) { console.warn('audio unavailable', e); }
  try { await Promise.race([A.loadClips(), sleep(6000)]); } catch (e) { console.warn('voices unavailable', e); }
  UI.loading(0.97, 'turning off the lights…'); await nextFrame();
  warmup();
  UI.loading(1, ''); await nextFrame();
  $('#loading').hidden = true;
  G.state = 'title';
  showTitle();
  requestAnimationFrame(loop);
  Beam.init(); // flashlight raycasts come online in the background
}

// ----- wiring ---------------------------------------------------------------
addEventListener('resize', resize);
document.addEventListener('pointerlockchange', () => {
  Input.locked = !!G.renderer && document.pointerLockElement === G.renderer.domElement;
  if (!Input.locked && G.state === 'play' && !G.paused && !Input.dragLook) pause(true);
});
document.addEventListener('pointerlockerror', () => { Input.dragLook = true; });
addEventListener('keydown', e => {
  if (e.code === 'Escape' && Input.dragLook && G.state === 'play') pause(!G.paused);
  if (e.code === 'KeyP' && G.state === 'play' && !G.paused) pause(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') pause(true); });
$('#btnBegin').addEventListener('click', () => { Save.chapter = 0; startGame(0); });
$('#btnContinue').addEventListener('click', () => startGame(Save.chapter));
$('#btnResume').addEventListener('click', () => pause(false));
$('#btnNote').addEventListener('click', () => { $('#note').hidden = false; A.resume(); });
$('#note').addEventListener('click', () => { if (G.paused) { $('#note').hidden = true; A.suspend(); } });
$('#btnRestart').addEventListener('click', () => { pause(false); Story.startChapter(Story.chapter, { spawn: true, fade: 1 }); });
$('#btnQuit').addEventListener('click', () => toTitle());
$('#btnAgain').addEventListener('click', () => { Save.chapter = 0; startGame(0); });
$('#btnTitle').addEventListener('click', () => toTitle());
$('#death').addEventListener('click', () => { if (G.state === 'dead') { lockPointer(); Story.retry(); } });
addEventListener('mousedown', e => {
  if (G.state === 'play' && !G.paused && !Input.locked && !Input.dragLook && e.target === G.renderer?.domElement) lockPointer();
});
// a real player touching the page clears any debug snapshot left on screen
for (const ev of ['keydown', 'mousedown', 'pointerdown']) addEventListener(ev, e => { if (e.isTrusted) document.getElementById('__snap')?.remove(); }, true);

window.__lk = {
  G, P, W, A, Story, Stalker, Post, L, M, TEX, Input, UI, Beam, LINES, goto: ch => startGame(ch),
  setQuality(q) { quality = q; perfAcc = 0; perfN = 0; G.lockQuality = true; resize(); return pixelRatio(); },
  // test helpers: step until fn() (or death), walk a polyline, log every recorded line that plays
  async until(fn, maxFrames = 6000, each = null) { let n = 0; while (!fn() && n < maxFrames && G.state !== 'dead' && G.state !== 'dying') { if (each) each(); await this.step(5); n += 5; } return fn(); },
  async walk(pts, maxFrames = 3000) {
    for (const [tx, tz] of pts) {
      let n = 0;
      while (Math.hypot(P.pos.x - tx, P.pos.z - tz) > 0.12 && n < maxFrames) {
        P.yaw = Math.atan2(-(tx - P.pos.x), -(tz - P.pos.z)); Input.down.add('KeyW'); await this.step(2); n += 2;
        if (G.state !== 'play') { Input.down.delete('KeyW'); return false; }
      }
    }
    Input.down.delete('KeyW'); return true;
  },
  lines: [],
  trace() {
    if (!this._traced) { const orig = A.line.bind(A); A.line = (id, o = {}) => { this.lines.push(id + ':' + (o.style || 'room') + (A.vbuf[id] ? '' : '(MISSING)')); return orig(id, o); }; this._traced = true; }
    return this.lines;
  }, kill: r => Story.kill(r), tp: (x, z, yaw) => P.teleport(x, z, yaw),
  // drive the game by hand (automation, hidden tabs): n frames of dt seconds, render the last one
  async step(n = 1, dt = 1 / 60) {
    if (!G.debug) return 'debug only (#debug)';
    const yieldTask = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    for (let i = 0; i < n; i++) { G.paused = false; $('#pause').hidden = true; frame(dt, i === n - 1); await yieldTask(); }
    return { t: +G.time.toFixed(2), state: G.state, mode: P.mode };
  },
  // render now and pin the frame into an <img> overlay (hidden tabs never present WebGL frames)
  snap(show = true) {
    if (!G.debug) return 0;
    frame(1 / 60, true);
    const url = G.renderer.domElement.toDataURL('image/jpeg', 0.85);
    // a fresh element each time: a hidden pane only repaints for new layers
    document.getElementById('__snap')?.remove();
    const im = document.createElement('img'); im.id = '__snap'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2;pointer-events:none'; $('#app').appendChild(im);
    im.src = url; im.hidden = !show;
    return Promise.race([im.decode().catch(() => {}), sleep(400)]).then(() => url.length);
  },
};
window.claude?.hot?.snapshot?.(() => ({ chapter: Story.chapter }));

function start(data = {}) {
  if (data && data.chapter) Save.chapter = data.chapter;
  boot().catch(e => { console.error(e); UI.loadError(`Something went wrong while starting: ${e.message || e}. Reloading the page usually fixes it.`); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
