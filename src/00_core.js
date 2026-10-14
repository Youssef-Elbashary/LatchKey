import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// math + random
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
const pick = arr => arr[(Math.random() * arr.length) | 0];
const $ = (s, r = document) => r.querySelector(s);
// resolves on the next frame, or shortly after if the tab is hidden and frames are paused
const nextFrame = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// smooth 1D noise for twitchy procedural motion
function makeNoise1D(seed = 1) {
  const r = mulberry32(seed), n = 256, v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = r() * 2 - 1;
  return x => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    return lerp(v[((i % n) + n) % n], v[(((i + 1) % n) + n) % n], s);
  };
}

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// settings + checkpoint storage (storage may be unavailable: always guarded)
// ---------------------------------------------------------------------------
const Settings = {
  sensitivity: 1, brightness: 1, volume: 0.85, reduceFlashing: false, invertY: false,
  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('latchkey.settings') || '{}')); } catch (e) { /* private mode */ }
  },
  save() {
    try {
      const { sensitivity, brightness, volume, reduceFlashing, invertY } = this;
      localStorage.setItem('latchkey.settings', JSON.stringify({ sensitivity, brightness, volume, reduceFlashing, invertY }));
    } catch (e) { /* ignore */ }
  },
};
const Save = {
  get chapter() { try { return +(localStorage.getItem('latchkey.chapter') || 0); } catch (e) { return 0; } },
  set chapter(v) { try { localStorage.setItem('latchkey.chapter', String(v)); } catch (e) { /* ignore */ } },
};

// ---------------------------------------------------------------------------
// global game handle
// ---------------------------------------------------------------------------
const G = {
  state: 'loading',     // loading | title | play | dying | dead | ending
  paused: false,
  time: 0,              // game seconds (stops while paused)
  debug: /debug/.test(location.hash),
  renderer: null, scene: null, camera: null,
};

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
const Input = {
  down: new Set(), hit: new Set(), mouseDown: new Set(), mouseHit: new Set(),
  dx: 0, dy: 0, locked: false, dragLook: false,
  isDown(...codes) { return codes.some(c => this.down.has(c)); },
  wasHit(...codes) { return codes.some(c => this.hit.has(c)); },
  endFrame() { this.hit.clear(); this.mouseHit.clear(); this.dx = 0; this.dy = 0; },
};
addEventListener('keydown', e => {
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (!e.repeat) Input.hit.add(e.code);
  Input.down.add(e.code);
});
addEventListener('keyup', e => Input.down.delete(e.code));
addEventListener('blur', () => { Input.down.clear(); Input.mouseDown.clear(); });
addEventListener('mousedown', e => { Input.mouseDown.add(e.button); Input.mouseHit.add(e.button); });
addEventListener('mouseup', e => Input.mouseDown.delete(e.button));
addEventListener('contextmenu', e => { if (G.state === 'play') e.preventDefault(); });
addEventListener('mousemove', e => {
  if (Input.locked || (Input.dragLook && Input.mouseDown.has(0))) { Input.dx += e.movementX || 0; Input.dy += e.movementY || 0; }
});
