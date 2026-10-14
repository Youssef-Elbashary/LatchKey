// ---------------------------------------------------------------------------
// audio: every sound is synthesized. Offline recipes render AudioBuffers once;
// continuous layers (drones, voices, music box, rain) run as live node graphs.
// ---------------------------------------------------------------------------
const white = () => Math.random() * 2 - 1;

// RBJ biquad for offline rendering. Returns process(x) with .set(f, q)
function BQ(type, f, q, sr) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (fr, qq) => {
    const w0 = TAU * clamp(fr, 10, sr * 0.45) / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * qq);
    let B0, B1, B2;
    if (type === 'lp') { B0 = (1 - cs) / 2; B1 = 1 - cs; B2 = B0; }
    else if (type === 'hp') { B0 = (1 + cs) / 2; B1 = -(1 + cs); B2 = B0; }
    else { B0 = al; B1 = 0; B2 = -al; }
    const A0 = 1 + al;
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * cs) / A0; a2 = (1 - al) / A0;
  };
  set(f, q);
  const fn = x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  fn.set = set;
  return fn;
}

// sprinkle short metallic "tink"s into a buffer
function tinks(d, sr, events) {
  for (const e of events) {
    const i0 = Math.floor(e.t * sr), n = Math.min(d.length - i0, Math.floor(e.decay * 7 * sr));
    for (let j = 0; j < n; j++) {
      const tt = j / sr; let v = 0;
      for (let k = 0; k < e.f.length; k++) v += Math.sin(TAU * e.f[k] * tt) / (k + 1);
      d[i0 + j] += v * e.amp * Math.exp(-tt / e.decay) + (j < 24 ? white() * e.amp * 0.4 : 0);
    }
  }
}

const RECIPES = {
  knock: (pitch = 1, hard = 0) => (d, sr) => {
    const bp1 = BQ('bp', 170 * pitch, 1.3, sr), bp2 = BQ('bp', 900 * pitch, 2.2, sr), lp = BQ('lp', 2600, 0.7, sr);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = white(), e = Math.exp(-t / (0.004 + hard * 0.005));
      p1 += TAU * 104 * pitch / sr; p2 += TAU * 213 * pitch / sr;
      const body = Math.sin(p1) * Math.exp(-t / (0.05 + hard * 0.05)) + 0.35 * Math.sin(p2) * Math.exp(-t / 0.03);
      d[i] = Math.tanh(lp(bp1(n * e) * 3.2 + bp2(n * e) * 0.9 + body * 0.7) * (1.4 + hard));
    }
    if (hard > 0.5) tinks(d, sr, Array.from({ length: 7 }, () => ({ t: 0.01 + Math.random() * 0.14, f: [2600, 3900, 5400].map(f => f * rand(0.9, 1.1)), decay: 0.02, amp: rand(0.05, 0.2) })));
  },
  step: surface => (d, sr) => {
    const v = rand(0.85, 1.15), carpet = surface === 'carpet', tile = surface === 'tile';
    const lp = BQ('lp', carpet ? 380 : 900, 0.7, sr);
    const heelBp = BQ('bp', (tile ? 2600 : surface === 'lino' ? 1700 : 1150) * v, tile ? 1.6 : 1.0, sr);
    const body = BQ('bp', 140 * v, 1.0, sr);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = white();
      ph += TAU * (78 - 22 * Math.min(1, t / 0.05)) * v / sr;
      const heel = carpet ? 0 : heelBp(n) * Math.exp(-t / (tile ? 0.0035 : 0.006)) * (tile ? 1.1 : 0.7);
      d[i] = heel + lp(n) * Math.exp(-t / 0.025) * (carpet ? 1.2 : 0.6) + Math.sin(ph) * Math.exp(-t / 0.035) * (carpet ? 0.5 : 0.75) + body(n) * Math.exp(-t / 0.02) * 0.4;
    }
  },
  heel: () => (d, sr) => {
    const a = BQ('bp', rand(2900, 3500), 2.2, sr), b = BQ('bp', rand(1200, 1500), 3, sr), lp = BQ('lp', 500, 0.7, sr);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = white(); ph += TAU * 95 / sr;
      d[i] = a(n) * Math.exp(-t / 0.0025) * 1.4 + b(n) * Math.exp(-t / 0.009) * 0.7 + Math.sin(ph) * Math.exp(-t / 0.05) * 0.4 + lp(n) * Math.exp(-t / 0.015) * 0.4;
    }
  },
  drag: () => (d, sr) => {
    const bp = BQ('bp', 700, 0.9, sr), dur = d.length / sr;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / dur; if (i % 64 === 0) bp.set(lerp(850, 450, u), 0.9);
      d[i] = bp(white()) * Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(t * TAU * 17));
    }
  },
  creak: (f0, f1, res = [640, 1250, 2350], q = 22) => (d, sr) => {
    const fl = res.map(f => BQ('bp', f * rand(0.92, 1.08), q, sr)), dur = d.length / sr;
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / dur, env = smooth(0, 0.08, u) * smooth(1, 0.8, u);
      phase += lerp(f0, f1, u) * (1 + 0.3 * Math.sin(t * 9.1) + 0.15 * Math.sin(t * 23.7)) / sr;
      let x = white() * 0.015 * env;
      if (phase >= 1) { phase -= 1; x += (0.6 + Math.random() * 0.4) * env; }
      let y = 0; for (let k = 0; k < fl.length; k++) y += fl[k](x) * (1 - k * 0.25);
      d[i] = Math.tanh(y * 6);
    }
  },
  click: () => (d, sr) => {
    const a = BQ('bp', 3600, 1.4, sr), b = BQ('bp', 1500, 1.2, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let x = 0;
      for (const t0 of [0, 0.045]) if (t >= t0) { const tt = t - t0; x += white() * (Math.exp(-tt / 0.0015) + Math.exp(-tt / 0.004) * 0.3); }
      d[i] = a(x) + b(x) * 0.5;
    }
  },
  chain: () => (d, sr) => {
    const n = 10 + (Math.random() * 6 | 0), ev = [];
    for (let k = 0; k < n; k++) ev.push({ t: Math.pow(Math.random(), 1.6) * 0.5, f: [2600, 3900, 5400, 7200].map(f => f * rand(0.9, 1.1)), decay: rand(0.012, 0.035), amp: rand(0.3, 1) });
    tinks(d, sr, ev);
  },
  keys: () => (d, sr) => {
    const ev = [];
    for (const c0 of [0.02, 0.42, 0.85]) for (let k = 0; k < 10; k++) ev.push({ t: c0 + Math.random() * 0.22, f: [3100, 4700, 6600].map(f => f * rand(0.85, 1.2)), decay: rand(0.04, 0.12), amp: rand(0.2, 0.8) });
    tinks(d, sr, ev);
  },
  lock: () => (d, sr) => {
    const bp = BQ('bp', 4200, 2, sr), bc = BQ('bp', 1100, 2, sr);
    let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let x = 0;
      if (t < 0.28) x += bp(white()) * (0.5 + 0.5 * Math.sin(t * TAU * 31)) * smooth(0, 0.03, t) * smooth(0.28, 0.22, t) * 0.8;
      if (t > 0.38) { const tt = t - 0.38; ph += TAU * 140 / sr; x += Math.sin(ph) * Math.exp(-tt / 0.03) * 0.9 + bc(white()) * Math.exp(-tt / 0.01) * 1.2; }
      d[i] = x;
    }
    tinks(d, sr, [{ t: 0.385, f: [2100, 3300], decay: 0.06, amp: 0.3 }]);
  },
  slam: (big = 0.5) => (d, sr) => {
    const lp = BQ('lp', 650, 0.8, sr), bp = BQ('bp', 230, 1.2, sr), cr = BQ('bp', 2200, 1.5, sr);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, n = white(); p1 += TAU * 50 / sr; p2 += TAU * 96 / sr;
      d[i] = Math.tanh((lp(n) * Math.exp(-t / 0.06) * 1.6 + Math.sin(p1) * Math.exp(-t / 0.2) * 1.1 + Math.sin(p2) * Math.exp(-t / 0.08) * 0.5
        + bp(n) * Math.exp(-t / 0.16) * 0.7 + cr(n) * Math.exp(-t / 0.012) * big) * 1.5);
    }
    tinks(d, sr, Array.from({ length: 9 }, () => ({ t: 0.01 + Math.random() * 0.25, f: [900, 1500, 2300].map(f => f * rand(0.8, 1.2)), decay: 0.03, amp: rand(0.05, 0.2) })));
  },
  bell: () => (d, sr) => {
    const bells = [1180, 1440], ratios = [1, 2.32, 3.06, 4.52], wts = [1, 0.55, 0.4, 0.22], decs = [0.35, 0.22, 0.16, 0.1];
    const f = [], w = [], dec = [], amp = [], ph = [];
    for (let b = 0; b < 2; b++) for (let k = 0; k < 4; k++) { f.push(bells[b] * ratios[k]); w.push(wts[k]); dec.push(Math.exp(-1 / (decs[k] * sr))); amp.push(0); ph.push(0); }
    const every = sr / 40; let next = 0, which = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (t < 1.9 && i >= next) { for (let k = 0; k < 4; k++) amp[which * 4 + k] += w[k] * 0.3; which ^= 1; next += every; }
      let v = 0;
      for (let j = 0; j < 8; j++) { ph[j] += TAU * f[j] / sr; amp[j] *= dec[j]; v += Math.sin(ph[j]) * amp[j]; }
      d[i] = v;
    }
  },
  drip: () => (d, sr) => {
    let ph = 0; const f0 = rand(700, 1000);
    for (let i = 0; i < d.length; i++) { const t = i / sr; ph += TAU * (f0 + 2400 * Math.min(1, t / 0.018)) / sr; d[i] = Math.sin(ph) * Math.exp(-t / 0.022) * 0.8 + (t < 0.002 ? white() * 0.3 : 0); }
  },
  thunder: (close = 0.5) => (d, sr) => {
    const dur = d.length / sr, lp = BQ('lp', 900, 0.7, sr), hp = BQ('hp', 1500, 0.7, sr);
    let brown = 0;
    const sw = []; const n = 6 + (Math.random() * 4 | 0);
    for (let k = 0; k < n; k++) sw.push({ t: 0.1 + Math.pow(Math.random(), 1.4) * dur * 0.6, w: rand(0.25, 1.1), a: rand(0.3, 1) });
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      brown = (brown + white() * 0.06) * 0.996;
      if (i % 64 === 0) lp.set(lerp(900, 140, Math.min(1, t / (dur * 0.7))), 0.7);
      let env = 0; for (const s of sw) { const z = (t - s.t) / s.w; env += s.a * Math.exp(-z * z); }
      env *= Math.exp(-t / (dur * 0.45));
      d[i] = lp(brown) * env * 4 + hp(white()) * Math.exp(-t / 0.08) * close * 0.8;
    }
  },
  rain: (glass = false) => (d, sr) => {
    const hp = BQ('hp', glass ? 1200 : 450, 0.7, sr), lp = BQ('lp', glass ? 9000 : 5500, 0.7, sr), bp = BQ('bp', glass ? 4200 : 3000, 1.5, sr);
    let b0 = 0, b1 = 0, b2 = 0, drop = 0;
    for (let i = 0; i < d.length; i++) {
      const w = white();
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      let x = lp(hp(b0 + b1 + b2 + w * 0.1848)) * 0.25;
      if (Math.random() < (glass ? 70 : 120) / sr) drop = rand(0.3, 1);
      x += bp(white() * drop) * (glass ? 1.4 : 0.6); drop *= 0.995;
      d[i] = x;
    }
  },
  heart: () => (d, sr) => {
    const lp = BQ('lp', 160, 0.7, sr); let pa = 0, pb = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let v = 0;
      pa += TAU * 62 * (0.65 + 0.35 * Math.exp(-t / 0.04)) / sr;
      v += Math.sin(pa) * Math.exp(-t / 0.07);
      if (t > 0.24) { const tt = t - 0.24; pb += TAU * 74 * (0.65 + 0.35 * Math.exp(-tt / 0.04)) / sr; v += Math.sin(pb) * Math.exp(-tt / 0.06) * 0.7; }
      d[i] = lp(v * 1.5 + white() * 0.05 * Math.exp(-t / 0.03));
    }
  },
  breath: kind => (d, sr) => {
    const dur = d.length / sr, inhale = kind.startsWith('in') || kind === 'gasp', f1 = inhale ? 1500 : 950;
    const b1 = BQ('bp', f1, 0.9, sr), b2 = BQ('bp', f1 * 1.9, 1.3, sr), hp = BQ('hp', 300, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / dur;
      let env = kind === 'gasp' ? smooth(0, 0.12, u) * smooth(1, 0.35, u) : inhale ? Math.pow(Math.sin(Math.PI * u), 1.5) : smooth(0, 0.12, u) * Math.pow(1 - u, 1.4);
      if (kind.endsWith('Shaky')) env *= 0.72 + 0.28 * Math.sin(t * TAU * 9 + Math.sin(t * 31) * 2);
      if (i % 64 === 0) { const s = inhale ? lerp(0.85, 1.15, u) : lerp(1.05, 0.9, u); b1.set(f1 * s, 0.9); b2.set(f1 * 1.9 * s, 1.3); }
      const n = white();
      let v = (b1(n) + b2(n) * 0.45) * env;
      if (kind === 'gasp') v += Math.sin(TAU * 330 * t) * env * 0.12 * smooth(0.4, 0, u);
      d[i] = hp(v);
    }
  },
  ghoulBreath: inhale => (d, sr) => {
    const dur = d.length / sr, b1 = BQ('bp', inhale ? 520 : 360, 2.2, sr), b2 = BQ('bp', inhale ? 1350 : 900, 4, sr), b3 = BQ('bp', 2600, 3, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, env = Math.pow(Math.sin(Math.PI * t / dur), 1.2), rattle = 0.4 + 0.6 * Math.abs(Math.sin(t * TAU * (inhale ? 17 : 13)));
      const n = white(); d[i] = (b1(n) + b2(n) * 0.7 + b3(n) * 0.25) * env * rattle;
    }
  },
  crack: () => (d, sr) => {
    const ev = []; let t0 = 0; const n = 3 + (Math.random() * 4 | 0);
    for (let k = 0; k < n; k++) { ev.push(t0); t0 += rand(0.015, 0.05); }
    const bp = BQ('bp', rand(2400, 4200), 5, sr), bp2 = BQ('bp', 700, 2, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let x = 0;
      for (const e of ev) if (t >= e && t - e < 0.01) x += white() * Math.exp(-(t - e) / 0.0012);
      d[i] = bp(x) * 2 + bp2(x) * 0.6;
    }
  },
  shriek: () => (d, sr) => {
    const dur = d.length / sr, base = [610, 648, 912, 1225, 1293, 455], ph = base.map(() => Math.random());
    const f1 = BQ('bp', 1100, 1.8, sr), f2 = BQ('bp', 2700, 2.5, sr), f3 = BQ('bp', 3900, 3, sr), hp = BQ('hp', 2000, 0.7, sr);
    let sub = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const pitch = (t < 0.12 ? lerp(0.85, 1.18, t / 0.12) : lerp(1.18, 0.72, Math.pow((t - 0.12) / (dur - 0.12), 0.8))) * (1 + 0.035 * Math.sin(t * TAU * 9.5) + 0.01 * white());
      let s = 0;
      for (let k = 0; k < base.length; k++) { ph[k] += base[k] * pitch / sr; ph[k] -= Math.floor(ph[k]); s += (ph[k] * 2 - 1) * (k === 5 ? 0.6 : 1); }
      s /= base.length;
      const env = smooth(0, 0.015, t) * smooth(dur, dur - 0.5, t);
      let v = Math.tanh((f1(s) * 1.2 + f2(s) + f3(s) * 0.6 + hp(white()) * 0.25) * 5) * env;
      sub += TAU * 48 / sr; v += Math.sin(sub) * Math.exp(-t / 0.35) * 0.9;
      d[i] = v;
    }
  },
  stingHard: () => (d, sr) => {
    const fr = [110, 116.54, 155.56, 233.08, 246.94, 349.23, 466.16], ph = fr.map(() => Math.random()), lp = BQ('lp', 6000, 0.8, sr);
    let sub = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; if (i % 64 === 0) lp.set(lerp(7000, 700, Math.min(1, t / 1.2)), 0.8);
      let s = 0; for (let k = 0; k < fr.length; k++) { ph[k] += fr[k] * (1 + 0.003 * k) / sr; ph[k] -= Math.floor(ph[k]); s += ph[k] * 2 - 1; }
      s /= fr.length; sub += TAU * 44 / sr;
      d[i] = Math.tanh((lp(s) * 2.2 * smooth(0, 0.004, t) * Math.exp(-t / 0.55) + white() * Math.exp(-t / 0.04) * 0.6 + Math.sin(sub) * Math.exp(-t / 0.5) * 0.8) * 1.4);
    }
  },
  stingSoft: () => (d, sr) => {
    const notes = [65.41, 69.3, 98, 103.83, 130.81];
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let v = 0;
      for (const f of notes) v += (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2.003 * f * t) * Math.exp(-t / 0.8) + 0.25 * Math.sin(TAU * 3.01 * f * t) * Math.exp(-t / 0.4)) * Math.exp(-t / 1.8);
      d[i] = v * smooth(0, 0.006, t) / notes.length;
    }
  },
  whoomp: () => (d, sr) => {
    const lp = BQ('lp', 220, 0.8, sr); let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; ph += TAU * (28 + 50 * Math.exp(-t / 0.4)) / sr; d[i] = Math.sin(ph) * smooth(0, 0.02, t) * Math.exp(-t / 0.9) + lp(white()) * Math.exp(-t / 0.25) * 0.6; }
  },
  static: () => (d, sr) => {
    const bp = BQ('bp', 3500, 0.5, sr), dur = d.length / sr; let p = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; p += TAU * 60 / sr; d[i] = (bp(white()) * (0.7 + 0.3 * Math.random()) + Math.sin(p) * 0.08) * smooth(0, 0.01, t) * smooth(dur, dur - 0.05, t); }
  },
  beep: (f, dur = 0.06) => (d, sr) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr, env = smooth(0, 0.004, t) * smooth(dur, dur - 0.01, t); d[i] = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 3 * f * t)) * env; }
  },
  curtain: () => (d, sr) => {
    const bp = BQ('bp', 3400, 1.8, sr), lp = BQ('lp', 1200, 0.7, sr), dur = d.length / sr;
    for (let i = 0; i < d.length; i++) { const t = i / sr, u = t / dur, env = smooth(0, 0.05, u) * smooth(1, 0.6, u); d[i] = bp(white()) * env * (0.6 + 0.4 * Math.sin(t * TAU * 23)) + lp(white()) * env * 0.4; }
    tinks(d, sr, Array.from({ length: 14 }, () => ({ t: Math.random() * dur * 0.8, f: [2400, 3700, 5100].map(f => f * rand(0.9, 1.1)), decay: 0.03, amp: rand(0.1, 0.35) })));
  },
  drawer: () => (d, sr) => {
    const bp = BQ('bp', 600, 1.5, sr);
    for (let i = 0; i < d.length; i++) { const t = i / sr, env = smooth(0, 0.05, t) * smooth(0.45, 0.3, t); d[i] = bp(white()) * env * (0.5 + 0.5 * Math.sin(t * TAU * 38)) * 1.2; }
    tinks(d, sr, Array.from({ length: 16 }, () => ({ t: 0.35 + Math.random() * 0.35, f: [2800, 4100, 6000].map(f => f * rand(0.8, 1.2)), decay: rand(0.03, 0.08), amp: rand(0.1, 0.4) })));
  },
  paper: () => (d, sr) => {
    const bp = BQ('bp', 4200, 0.6, sr), dur = d.length / sr; let a = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; if (Math.random() < 0.002) a = rand(0.2, 1); a *= 0.9995; d[i] = bp(white()) * a * smooth(0, 0.03, t) * smooth(dur, dur - 0.1, t); }
  },
  rustle: () => (d, sr) => {
    const bp = BQ('bp', 2400, 0.7, sr), dur = d.length / sr; let a = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; if (Math.random() < 0.003) a = rand(0.2, 1); a *= 0.9993; d[i] = bp(white()) * a * Math.sin(Math.PI * t / dur); }
  },
  sniff: () => (d, sr) => {
    const bp = BQ('bp', 2600, 1.1, sr), bp2 = BQ('bp', 900, 1, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let env = 0;
      for (const t0 of [0, 0.14, 0.27, 0.48]) { const tt = t - t0; if (tt > 0 && tt < 0.1) env += Math.sin(Math.PI * tt / 0.1); }
      const n = white(); d[i] = (bp(n) + bp2(n) * 0.5) * env;
    }
  },
  scratch: () => (d, sr) => {
    const dur = d.length / sr, bp = BQ('bp', 2300, 3, sr), bp2 = BQ('bp', 900, 2, sr); let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, env = Math.sin(Math.PI * ((t % 0.55) / 0.55)) * (t < dur - 0.1 ? 1 : 0);
      ph += (60 + 40 * Math.sin(t * 7)) / sr; let x = white() * 0.2; if (ph >= 1) { ph -= 1; x += 1; }
      d[i] = (bp(x) * 1.5 + bp2(x) * 0.6) * env;
    }
  },
  bird: () => (d, sr) => {
    const dur = d.length / sr, notes = 2 + (Math.random() * 4 | 0), f0 = rand(3200, 4800); let ph = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, seg = dur / notes, k = Math.floor(t / seg), u = (t % seg) / seg;
      ph += TAU * f0 * (1 + 0.25 * Math.sin(u * Math.PI)) * (k % 2 ? 0.9 : 1.05) / sr;
      d[i] = Math.sin(ph) * Math.pow(Math.sin(Math.PI * u), 2) * 0.6;
    }
  },
  car: () => (d, sr) => {
    const lp = BQ('lp', 420, 0.7, sr), hiss = BQ('bp', 1800, 0.6, sr), dur = d.length / sr; let br = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr, env = Math.pow(Math.sin(Math.PI * t / dur), 2); br = (br + white() * 0.05) * 0.995; d[i] = (lp(br) * 3 + hiss(white()) * 0.3) * env; }
  },
  thump: () => (d, sr) => {
    const lp = BQ('lp', 130, 0.8, sr); let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; ph += TAU * 58 / sr; d[i] = lp(white()) * Math.exp(-t / 0.05) * 2 + Math.sin(ph) * Math.exp(-t / 0.07); }
  },
  clack: () => (d, sr) => {
    const bp = BQ('bp', 1600, 1.4, sr); let ph = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr; ph += TAU * 300 / sr; d[i] = bp(white()) * Math.exp(-t / 0.006) * 2 + Math.sin(ph) * Math.exp(-t / 0.02) * 0.5 + Math.sin(TAU * 2900 * t) * Math.exp(-t / 0.3) * 0.12; }
  },
  tick: hi => (d, sr) => {
    const bp = BQ('bp', hi ? 3600 : 2900, 4, sr);
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = bp(white()) * Math.exp(-t / 0.002) * 2; }
  },
  // a match: a rough scrape, then the head catches with a soft roar
  match: () => (d, sr) => {
    const bp = BQ('bp', 3200, 0.9, sr), lp = BQ('lp', 900, 0.7, sr), crk = BQ('bp', 5200, 3, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr; let x = 0;
      if (t < 0.14) x += bp(white()) * (0.5 + 0.5 * Math.random()) * smooth(0, 0.01, t) * 0.9;
      if (t > 0.1) { const tt = t - 0.1; x += lp(white()) * Math.exp(-tt / 0.3) * 1.6 + crk(white() * (Math.random() < 0.004 ? 6 : 0.05)) * Math.exp(-tt / 0.5); }
      d[i] = x;
    }
  },
  // water into a glass: the note rises as it fills
  pour: () => (d, sr) => {
    const dur = d.length / sr, bp = BQ('bp', 500, 3, sr), lp = BQ('lp', 2500, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / dur; if (i % 64 === 0) bp.set(450 + 1500 * u, 3);
      const env = smooth(0, 0.04, u) * smooth(1, 0.86, u);
      d[i] = (bp(white()) * (0.65 + 0.35 * Math.sin(t * TAU * 9 + Math.sin(t * 31) * 2)) + lp(white()) * 0.12) * env;
    }
  },
  // every flame in the flat, out at once
  blowout: () => (d, sr) => {
    const dur = d.length / sr, lp = BQ('lp', 700, 0.8, sr), bp = BQ('bp', 1800, 0.7, sr);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / dur, env = smooth(0, 0.08, u) * Math.pow(1 - u, 1.6);
      if (i % 64 === 0) lp.set(lerp(1400, 300, u), 0.8);
      d[i] = (lp(white()) * 1.6 + bp(white()) * 0.35) * env;
    }
  },
};

function makeIR(ctx, dur = 1.7, decay = 3.2) {
  const sr = ctx.sampleRate, n = Math.floor(dur * sr), b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n, k = 0.15 + u * 0.8;
      lp = lp * k + white() * (1 - k);
      d[i] = lp * Math.pow(1 - u, decay) * 1.6;
    }
    for (let e = 0; e < 8; e++) d[Math.floor(rand(0.003, 0.035) * sr)] += rand(-0.6, 0.6);
  }
  return b;
}

// Brahms' lullaby (public domain): [note, beats]
const LULLABY = [
  ['E', .5], ['E', .5], ['G', 1.5], ['E', .5], ['E', 1], ['G', 2], ['E', .5], ['G', .5],
  ['C2', 1], ['B', 1.5], ['A', .5], ['A', 1], ['G', 1], ['D', .5], ['E', .5],
  ['F', 1], ['D', 1], ['D', .5], ['E', .5], ['F', 2], ['D', .5], ['F', .5],
  ['B', .5], ['A', .5], ['G', 1], ['B', 1], ['C2', 2], ['C', .5], ['C', .5],
  ['C2', 2], ['A', .5], ['F', .5], ['G', 2], ['E', .5], ['C', .5], ['F', 1], ['G', 1], ['A', 1],
  ['G', 2], ['C', .5], ['C', .5], ['C2', 2], ['A', .5], ['F', .5], ['G', 2], ['E', .5], ['C', .5],
  ['F', 1], ['E', 1], ['D', 1], ['C', 3],
];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, C2: 12 };

// female vowel formants (Peterson & Barney averages)
const VOWELS = [[310, 2790, 3310], [430, 2480, 3070], [610, 2330, 2990], [860, 2050, 2850], [850, 1220, 2810], [590, 920, 2710], [470, 1160, 2680], [370, 950, 2670], [760, 1400, 2780], [500, 1640, 1960]];

// recorded lines (ElevenLabs). kind: mom = the real one, mimic = her voice in the wrong mouth, evil = what's under the face.
// sub scales the pitched-down layer; swell puts a reversed reverb in front of the line.
const LINES = {
  m_call1: { kind: 'mom', text: "Bug? Bug, it's Mom... Are you awake?" },
  m_call2: { kind: 'mom', text: "Listen to me. Don't talk... just listen, okay?" },
  m_call3: { kind: 'mom', text: "The storm closed the bridge. I can't get home until the sun comes up." },
  m_call4: { kind: 'mom', text: 'I left a note on the fridge. The rules. Same as last time.' },
  m_call5: { kind: 'mom', text: 'Read it... and do every single thing it says.' },
  m_call6: { kind: 'mom', text: "And bug... if somebody knocks on that door... it isn't me." },
  m_call7: { kind: 'mom', text: 'I never knock. I have my key.' },
  m_call8: { kind: 'mom', text: 'I love you. Keep the chain on.' },
  m_real4: { kind: 'mom', text: 'Oh, bug. Come here... come here.' },
  m_real1: { kind: 'mom', text: "Bug? Baby... it's me." },
  m_real2: { kind: 'mom', text: "I'm home. It's over. You can take the chain off now." },
  m_real3: { kind: 'mom', text: "It's okay. I didn't knock, see? I have my key." },
  m_machine: { kind: 'mom', text: "Hi, you've reached us! We can't come to the phone right now. Leave a message after the beep!" },
  x_machine: { kind: 'mimic', text: "Bug... pick up the phone. It's Mom. ...Pick up. ...I can see you standing there." },
  x_room2: { kind: 'mimic', text: "I came home early... I fell. I can't get up." },
  x_follow1: { kind: 'mimic', text: '...bug?' },
  x_follow3: { kind: 'mimic', text: "Why won't you look at me, bug?" },
  x_follow5: { kind: 'mimic', text: 'LOOK AT ME!' },
  x_chase: { kind: 'mimic', text: 'LET ME IN, BUG!' },
  x_dawn3: { kind: 'mimic', text: 'Bug? Take the chain off for me. Quick, before she comes back.' },
  x_dawn6: { kind: 'mimic', text: 'TAKE. IT. OFF!' },
  x_door1: { kind: 'mimic', text: "Bug, please... it's Mom. Let me in. Please let me in." },
  e_song: { kind: 'evil', text: 'You stopped my song...', sub: 0.6 },
  e_room_laugh: { kind: 'evil', text: 'heh... heh heh heh...', sub: 0.8 },
  e_ceiling: { kind: 'evil', text: "I'm right above you...", swell: true, sub: 0.7 },
  x_knock1: { kind: 'mimic', text: "Sweetie? It's Mom." },
  x_knock2: { kind: 'mimic', text: 'I forgot my keys, honey. Can you open the door for me?' },
  x_knock3: { kind: 'mimic', text: "Sweetie, it's so cold out here... Open the door." },
  x_peep: { kind: 'mimic', text: 'Why are you looking at me through the little hole, sweetie?' },
  x_room1: { kind: 'mimic', text: 'Bug? Bug, baby... is that you?' },
  x_room3: { kind: 'mimic', text: 'Please come in here... it hurts so much.' },
  x_room4: { kind: 'mimic', text: "Bug, please! I'm your MOTHER!" },
  x_follow2: { kind: 'mimic', text: "Bug... it's Mom. I'm right here." },
  x_follow6: { kind: 'mimic', text: 'Stay with me, bug.' },
  x_dawn1: { kind: 'mimic', text: "Bug? Bug, it's me. It's Mom." },
  x_dawn2: { kind: 'mimic', text: "The bridge opened, baby. Hold on... I've got my key." },
  x_dawn5: { kind: 'mimic', text: 'Why are you just standing there? Take it off.' },
  e_machine_laugh: { kind: 'evil', text: 'heh... heh heh... pick... up...' },
  e_knock4: { kind: 'evil', text: 'OPEN THE DOOR!', sub: 1.2 },
  e_mirror: { kind: 'evil', text: '...sweetie...', swell: true, sub: 0.6 },
  e_room5: { kind: 'evil', text: 'Come... in... here...', swell: true },
  e_follow5: { kind: 'evil', text: 'LOOK AT ME!', sub: 1.2 },
  e_bed1: { kind: 'evil', text: 'There you are...', swell: true, sub: 0.6 },
  e_bed2: { kind: 'evil', text: 'Open your eyes, bug...', sub: 0.6 },
  e_closet1: { kind: 'evil', text: 'I can hear your heart.', sub: 0.6 },
  e_closet2: { kind: 'evil', text: 'Little bug... little bug...', sub: 0.6 },
  e_chase: { kind: 'evil', text: 'LET ME IN, BUG!', sub: 1.2 },
  e_soon: { kind: 'evil', text: 'Soon...', swell: true, sub: 0.6 },
  e_dawn6: { kind: 'evil', text: 'TAKE. IT. OFF!', sub: 1.2 },
  e_thursday: { kind: 'evil', text: 'See you Thursday.', swell: true, sub: 0.5 },
  e_name: { kind: 'evil', text: 'bug... bug... bug... bug...', sub: 0.6 },
};
// per-style loudness (voice bus)
const VOICE_STYLE_GAIN = { phone: 0.75, machine: 0.85, door: 1.2, room: 1.0, near: 0.85, clean: 1.0 };

const b64ToArrayBuffer = b64 => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };

// loudness match: scale so the voiced parts sit at a common RMS, then fade the edges
function normalizeBuffer(b, targetRms = 0.12, peakMax = 0.97) {
  const d = b.getChannelData(0), sr = b.sampleRate, win = Math.max(1, Math.floor(sr * 0.02));
  let pow = 0, cnt = 0, peak = 0;
  for (let i = 0; i < d.length; i += win) {
    let e = 0; const end = Math.min(d.length, i + win);
    for (let j = i; j < end; j++) { const v = d[j]; e += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    e /= end - i;
    if (e > 1e-4) { pow += e; cnt++; } // -40 dBFS gate
  }
  const rms = cnt ? Math.sqrt(pow / cnt) : 0;
  const s = rms > 0 ? Math.min(targetRms / rms, peakMax / Math.max(peak, 1e-4)) : 1;
  const fade = Math.min(d.length >> 1, Math.floor(sr * 0.004));
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const c = b.getChannelData(ch);
    for (let i = 0; i < c.length; i++) c[i] *= s;
    for (let i = 0; i < fade; i++) { const k = i / fade; c[i] *= k; c[c.length - 1 - i] *= k; }
  }
  return b;
}

// granular pitch shift that keeps the timing: the thing under the face speaks an octave below her
function pitchShiftBuffer(ctx, b, ratio, grainSec = 0.05) {
  const sr = b.sampleRate, inp = b.getChannelData(0), n = inp.length, out = new Float32Array(n);
  const G = Math.max(64, Math.floor(grainSec * sr)), hop = G >> 2, win = new Float32Array(G);
  for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU * i / (G - 1));
  for (let start = -G; start < n; start += hop) {
    for (let i = 0; i < G; i++) {
      const o = start + i; if (o < 0 || o >= n) continue;
      const s = start + G * 0.5 * (1 - ratio) + i * ratio, i0 = Math.floor(s);
      if (i0 < 0 || i0 + 1 >= n) continue;
      const f = s - i0; out[o] += (inp[i0] + (inp[i0 + 1] - inp[i0]) * f) * win[i];
    }
  }
  const nb = ctx.createBuffer(1, n, sr), d = nb.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = out[i] * 0.5; // four Hann windows overlap to 2
  return nb;
}

const A = {
  ctx: null, ready: false, master: null, bus: {}, buf: {}, reverbIn: null, vbuf: {}, vsubs: {}, vswell: {},
  anchors: {}, loops: {}, tension: 0, tensionTarget: 0, fear: 0,
  nextBeat: 0, nextBreath: 0, breathIn: true, breathSuppressed: false,
  nextTick: 0, tickHi: false, nextDrip: 3, nextCreak: 8, nextCar: 25, nextBird: 0, birds: false,
  musicBox: null, riser: null, ring: null, dial: null, buzz: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = Settings.volume;
    // gentle glue only: the night is quiet and the scares are allowed to be loud (the limiter catches peaks)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2; comp.attack.value = 0.005; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    this.duck = ctx.createGain();
    this.master.connect(comp); comp.connect(lim); lim.connect(this.duck); this.duck.connect(ctx.destination);
    // the bed of the night (rain, wind, drone) sits far under everything; steps, doors and voices carry the scares
    this.busBase = { sfx: 1, amb: 0.2, music: 0.26, voice: 1.35, ui: 0.6 };
    for (const [k, v] of Object.entries(this.busBase)) { const g = ctx.createGain(); g.gain.value = v; g.connect(this.master); this.bus[k] = g; }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = makeIR(ctx);
    this.reverbIn = ctx.createGain(); this.reverbIn.gain.value = 1;
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb); this.reverb.connect(rvOut); rvOut.connect(this.master);
    this.makeBuffers();
    this.ready = true;
  },

  makeBuffers() {
    const ctx = this.ctx, R = RECIPES;
    const mk = (dur, fill, opts = {}) => {
      const sr = ctx.sampleRate, n = Math.max(1, Math.ceil(dur * sr)), b = ctx.createBuffer(opts.stereo ? 2 : 1, n, sr);
      let m = 0;
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); fill(d, sr, ch); for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); }
      const s = m > 0 ? (opts.norm ?? 0.9) / m : 1, fade = Math.min(n, Math.floor(sr * 0.004));
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= s; if (!opts.loop) for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade; }
      return b;
    };
    const many = (k, dur, fn) => Array.from({ length: k }, () => mk(dur, fn()));
    const B = this.buf;
    B.knock = many(4, 0.35, () => R.knock(rand(0.95, 1.05), 0));
    B.pound = many(3, 0.5, () => R.knock(rand(0.72, 0.8), 1));
    for (const s of ['wood', 'carpet', 'tile', 'lino']) B['step_' + s] = many(5, 0.22, () => R.step(s));
    B.heel = many(4, 0.3, () => R.heel());
    B.drag = [mk(0.5, R.drag())];
    B.creakFloor = many(3, 0.7, () => R.creak(rand(25, 40), rand(60, 90)));
    B.creakDoor = many(2, 1.8, () => R.creak(18, 70, [480, 980, 1900], 26));
    B.creakLong = [mk(3.2, R.creak(12, 55, [420, 880, 1700], 28))];
    B.click = mk(0.12, R.click());
    B.chain = many(3, 0.7, () => R.chain());
    B.keys = mk(1.4, R.keys());
    B.lock = mk(0.65, R.lock());
    B.slam = mk(1.3, R.slam(0.5));
    B.bang = mk(1.8, R.slam(1.4));
    B.bell = mk(2.4, R.bell());
    B.drip = many(3, 0.12, () => R.drip());
    B.thunder = [mk(7, R.thunder(0.7)), mk(6, R.thunder(0.25)), mk(8, R.thunder(0.5))];
    B.rain = mk(4, R.rain(false), { stereo: true, loop: true, norm: 0.7 });
    B.rainGlass = mk(3, R.rain(true), { loop: true, norm: 0.7 });
    B.heart = mk(0.6, R.heart());
    B.in = mk(1.0, R.breath('in')); B.out = mk(1.2, R.breath('out'));
    B.inShaky = mk(0.8, R.breath('inShaky')); B.outShaky = mk(0.9, R.breath('outShaky'));
    B.gasp = mk(0.5, R.breath('gasp')); B.sigh = mk(1.6, R.breath('out'));
    B.gIn = mk(2.2, R.ghoulBreath(true)); B.gOut = mk(2.6, R.ghoulBreath(false));
    B.crack = many(3, 0.25, () => R.crack());
    B.shriek = mk(2.2, R.shriek());
    B.stingHard = mk(1.8, R.stingHard()); B.stingSoft = mk(4.5, R.stingSoft()); B.whoomp = mk(2.6, R.whoomp());
    B.static = mk(0.6, R.static()); B.staticLoop = mk(2, R.static(), { loop: true });
    B.chirp = mk(0.07, R.beep(3200, 0.06)); B.alarm = mk(0.09, R.beep(2400, 0.08)); B.mwBeep = mk(0.26, R.beep(1900, 0.25));
    B.curtain = mk(0.8, R.curtain()); B.drawer = mk(0.9, R.drawer()); B.paper = mk(0.6, R.paper()); B.rustle = many(2, 0.6, () => R.rustle());
    B.sniff = mk(0.62, R.sniff()); B.scratch = mk(1.7, R.scratch());
    B.bird = many(5, 0.35, () => R.bird()); B.car = mk(5, R.car()); B.thump = mk(0.25, R.thump()); B.clack = mk(0.5, R.clack());
    B.tick = mk(0.03, R.tick(true)); B.tock = mk(0.03, R.tick(false));
    B.match = mk(1.1, R.match()); B.pour = mk(2.4, R.pour()); B.blowout = mk(1.4, R.blowout());
    B.white = mk(2, d => { for (let i = 0; i < d.length; i++) d[i] = white(); }, { loop: true, norm: 1 });
  },

  // decode the recorded clips (voices → vbuf, effects → buf.sfx_*). Never blocks the game for long.
  async loadClips() {
    if (!this.ctx || typeof AUDIO_DATA === 'undefined') return 0;
    const ctx = this.ctx, jobs = [];
    for (const [id, b64] of Object.entries(AUDIO_DATA)) {
      jobs.push(new Promise(res => {
        try {
          const p = ctx.decodeAudioData(b64ToArrayBuffer(b64), b => res([id, b]), () => res([id, null]));
          if (p && p.catch) p.catch(() => res([id, null]));
        } catch (e) { res([id, null]); }
      }));
    }
    const done = await Promise.all(jobs);
    let n = 0;
    for (const [id, b] of done) {
      if (!b) continue; n++;
      if (id.startsWith('sfx_')) this.buf[id] = normalizeBuffer(b, 0.16, 0.95);
      else this.vbuf[id] = normalizeBuffer(b, 0.13, 0.97);
    }
    this.prepareEvil();
    return n;
  },
  // the pitched-down layers and reversed swells are rendered in the background
  prepareEvil() {
    const ids = Object.keys(this.vbuf).filter(id => LINES[id] && LINES[id].kind !== 'mom');
    const step = () => {
      const id = ids.shift(); if (!id) return;
      this.vsub(id);
      if (LINES[id].swell) this.renderSwell(id);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  },
  vsub(id) {
    if (this.vsubs[id] === undefined) {
      const b = this.vbuf[id], L0 = LINES[id];
      this.vsubs[id] = b ? pitchShiftBuffer(this.ctx, b, L0 && L0.kind === 'evil' ? 0.62 : 0.5) : null;
    }
    return this.vsubs[id];
  },
  async renderSwell(id) {
    const b = this.vbuf[id], OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!b || !OAC || this.vswell[id]) return;
    try {
      const sr = b.sampleRate, tail = 1.6, off = new OAC(1, Math.ceil((b.duration + tail) * sr), sr);
      const rev = off.createBuffer(1, b.length, sr), s = b.getChannelData(0), r = rev.getChannelData(0);
      for (let i = 0; i < b.length; i++) r[i] = s[b.length - 1 - i];
      const src = off.createBufferSource(); src.buffer = rev;
      const conv = off.createConvolver(); conv.buffer = makeIR(off, tail, 2.4);
      src.connect(conv); conv.connect(off.destination); src.start();
      const out = await off.startRendering(), d = out.getChannelData(0);
      d.reverse();
      this.vswell[id] = normalizeBuffer(out, 0.08, 0.6);
    } catch (e) { /* no swell then */ }
  },

  // play a recorded line. Returns { dur, lead } (seconds); lead = time before the words start.
  // style: phone | machine | door | room | near | clean. wrong (0..1) bends a mimic further from Mom.
  line(id, o = {}) {
    const L0 = LINES[id] || { kind: 'mimic', text: String(id) };
    const b = this.ready ? this.vbuf[id] : null;
    const kind = o.kind || L0.kind, style = o.style || 'room';
    if (!b) { // no recording: the old formant babble keeps the scene going
      const d = this.voice(L0.text, { style: style === 'near' ? 'whisper' : style === 'machine' ? 'phone' : style === 'clean' ? 'near' : style, pos: o.pos, wrong: o.wrong ?? (kind === 'mom' ? 0 : kind === 'evil' ? 0.8 : 0.3), gain: o.gain, open: o.open, rate: kind === 'evil' ? 0.8 : 1 });
      return { dur: d, lead: 0 };
    }
    const ctx = this.ctx, t0 = ctx.currentTime + 0.04 + (o.delay || 0);
    const wrong = o.wrong ?? (kind === 'evil' ? 1 : kind === 'mimic' ? 0.25 : 0);
    const input = ctx.createGain();
    let tail = input;
    const chain = n => { tail.connect(n); tail = n; return n; };
    const filt = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    // the mimic's mouth doesn't quite fit: a slow ring-mod wobble once she stops pretending
    if (kind === 'mimic' && wrong > 0.35) {
      const rm = chain(ctx.createGain()); rm.gain.value = 1 - wrong * 0.35;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 28 + wrong * 30; const lg = ctx.createGain(); lg.gain.value = wrong * 0.35;
      lfo.connect(lg); lg.connect(rm.gain); lfo.start(t0); lfo.stop(t0 + b.duration + 4);
    }
    if (kind === 'evil') { const lo = chain(filt('lowshelf', 160)); lo.gain.value = 5; }
    if (style === 'phone') { chain(filt('highpass', 420)); chain(filt('lowpass', 3100)); const ws = chain(ctx.createWaveShaper()); ws.curve = this.curve(1.8); }
    else if (style === 'machine') { chain(filt('highpass', 600)); chain(filt('lowpass', 2500)); const ws = chain(ctx.createWaveShaper()); ws.curve = this.curve(3); }
    else if (style === 'door') chain(filt('lowpass', o.open ? 5200 : 1700, 0.6));
    if (o.muffle) chain(filt('lowpass', o.muffle));
    const level = chain(ctx.createGain()); level.gain.value = (o.gain ?? 1) * (VOICE_STYLE_GAIN[style] ?? 1);
    if (o.pos) chain(this.panner(o.pos, o.ref ?? (style === 'door' ? 2.6 : style === 'near' ? 0.7 : 1.4), o.roll ?? (style === 'door' ? 0.8 : 1.1)));
    else if (style === 'phone') { const p = chain(ctx.createStereoPanner()); p.pan.value = -0.5; }
    tail.connect(this.bus.voice);
    const rv = o.reverb ?? { door: 0.4, room: 0.38, near: 0.1, phone: 0, machine: 0.2, clean: 0.25 }[style] ?? 0.3;
    if (rv > 0) { const s = ctx.createGain(); s.gain.value = rv; tail.connect(s); s.connect(this.reverbIn); }
    // sync: layers that share the clip's timeline also share its offset/length (a slice of a line)
    const src = (buf, rate, gain, when, sync = true) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(input);
      if (!sync) s.start(when);
      else if (o.length != null) s.start(when, o.offset || 0, o.length);
      else s.start(when, o.offset || 0);
      return s;
    };
    let lead = 0;
    const sw = this.vswell[id];
    if (kind === 'evil' && L0.swell && sw && o.swell !== false && !o.offset && o.length == null) { lead = sw.duration - b.duration; src(sw, 1, 0.7, t0, false); }
    const tm = t0 + lead, rate = o.rate ?? (kind === 'mimic' ? 1 - wrong * 0.05 : 1);
    src(b, rate, 1, tm);
    if (kind !== 'mom' && wrong > 0.05) {
      const sub = this.vsub(id);
      if (sub) src(sub, rate, (kind === 'evil' ? 0.6 : 0.65 * wrong) * (L0.sub ?? 1), tm);
      if (kind === 'evil') src(b, rate * 1.006, 0.32, tm + 0.021); // a second mouth, a beat behind
    }
    this.lastLine = { id, at: tm, dur: lead + (o.length ?? (b.duration - (o.offset || 0))) / rate }; // for tests
    const len = o.length ?? (b.duration - (o.offset || 0));
    return { dur: lead + len / rate, lead };
  },
  curve(drive) {
    const k = Math.round(drive * 10); this._curves ||= {};
    if (!this._curves[k]) { const c = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } this._curves[k] = c; }
    return this._curves[k];
  },

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
  setVolume(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); },
  // the room goes quiet right before something happens: rain and drone dip, then creep back
  hush(seconds = 1.5, level = 0.12) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const k of ['amb', 'music']) {
      const g = this.bus[k].gain, base = this.busBase[k];
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(base * level, t + 0.3); g.setValueAtTime(base * level, t + 0.3 + seconds);
      g.linearRampToValueAtTime(base, t + 0.3 + seconds + 3);
    }
  },
  // hard cut used right after a jump scare (silence is part of the scare)
  cut(seconds = 1.2) {
    if (!this.ready) return;
    const g = this.duck.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.setValueAtTime(0, t + seconds); g.linearRampToValueAtTime(1, t + seconds + 1.5);
  },

  panner(pos, ref = 1, roll = 1.25) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 40;
    this.setPos(p, pos);
    return p;
  },
  setPos(p, pos) {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
  },

  // one-shot or looping buffer playback. Returns a handle {gain, panner, src, stop(), setPos()}
  play(name, o = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx, b0 = typeof name === 'string' ? this.buf[name] : name;
    if (!b0) return null;
    const b = Array.isArray(b0) ? pick(b0) : b0;
    const src = ctx.createBufferSource(); src.buffer = b; src.loop = !!o.loop;
    src.playbackRate.value = o.rate ?? 1; if (o.detune) src.detune.value = o.detune;
    let node = src;
    if (o.muffle) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.muffle; f.Q.value = 0.7; node.connect(f); node = f; }
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1; node.connect(g); node = g;
    let panner = null;
    if (o.pos) { panner = this.panner(o.pos, o.ref, o.roll); node.connect(panner); node = panner; }
    else if (o.pan != null) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
    node.connect(this.bus[o.bus || 'sfx']);
    const rv = o.reverb ?? 0.22;
    if (rv > 0) { const s = ctx.createGain(); s.gain.value = rv; node.connect(s); s.connect(this.reverbIn); }
    src.start(ctx.currentTime + (o.when || 0), o.offset || 0);
    return {
      src, gain: g, panner,
      stop: (fade = 0.05) => {
        const t = ctx.currentTime;
        try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.02); } catch (e) { /* already stopped */ }
      },
      setPos: pos => panner && this.setPos(panner, pos),
      setGain: (v, tc = 0.1) => g.gain.setTargetAtTime(v, ctx.currentTime, tc),
    };
  },

  // listener follows the camera
  setListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    cam.getWorldPosition(_v1); cam.getWorldDirection(_v2); _v3.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (l.positionX) {
      l.positionX.value = _v1.x; l.positionY.value = _v1.y; l.positionZ.value = _v1.z;
      l.forwardX.value = _v2.x; l.forwardY.value = _v2.y; l.forwardZ.value = _v2.z;
      l.upX.value = _v3.x; l.upY.value = _v3.y; l.upZ.value = _v3.z;
    } else { l.setPosition(_v1.x, _v1.y, _v1.z); l.setOrientation(_v2.x, _v2.y, _v2.z, _v3.x, _v3.y, _v3.z); }
  },

  // ----- ambience -----------------------------------------------------------
  startAmbience() {
    if (!this.ready || this.loops.rain) return;
    const ctx = this.ctx;
    this.loops.rain = this.play('rain', { loop: true, gain: 0.0, bus: 'amb', reverb: 0 });
    this.loops.rain.setGain(0.2, 2);
    this.loops.glass = (this.anchors.windows || []).map(p => { const h = this.play('rainGlass', { loop: true, gain: 0, pos: p, bus: 'amb', reverb: 0.1, roll: 1.6, offset: Math.random() * 2 }); h.setGain(0.26, 2); return h; });
    // wind: noise through a slowly wandering bandpass
    const src = ctx.createBufferSource(); src.buffer = this.buf.white; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 1.2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(bp.frequency);
    const g = ctx.createGain(); g.gain.value = 0.04;
    src.connect(bp); bp.connect(g); g.connect(this.bus.amb); src.start(); lfo.start();
    this.loops.wind = { gain: g, src, lfo };
    // score: low drone + high cluster driven by tension
    const dr = ctx.createGain(); dr.gain.value = 0; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 1.4;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.05; const l2 = ctx.createGain(); l2.gain.value = 50; lfo2.connect(l2); l2.connect(lp.frequency); lfo2.start();
    for (const f of [55, 58.27, 82.41]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = rand(-6, 6); o.connect(lp); o.start(); }
    lp.connect(dr); dr.connect(this.bus.music);
    const hi = ctx.createGain(); hi.gain.value = 0;
    for (const f of [1318.5, 1396.9, 1480]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const tr = ctx.createGain(); tr.gain.value = 0.5; const tl = ctx.createOscillator(); tl.frequency.value = rand(3, 6); const tg = ctx.createGain(); tg.gain.value = 0.5; tl.connect(tg); tg.connect(tr.gain); tl.start(); o.connect(tr); tr.connect(hi); o.start(); }
    const hs = ctx.createGain(); hs.gain.value = 0.8; hi.connect(this.bus.music); hi.connect(hs); hs.connect(this.reverbIn);
    this.loops.drone = dr; this.loops.hi = hi;
  },
  setRain(level, tc = 2) {
    if (!this.loops.rain) return;
    this.loops.rain.setGain(0.2 * level, tc);
    for (const h of this.loops.glass) h.setGain(0.26 * level, tc);
  },
  setTension(v) { this.tensionTarget = v; },

  thunder(close = 0.5, delay = 0) {
    const b = this.buf.thunder[close > 0.6 ? 0 : close < 0.35 ? 1 : 2];
    const w = this.anchors.windows?.[0];
    return this.play(b, { gain: 0.45 + close * 0.5, pos: w ? V3(w.x, w.y, w.z + 6) : null, ref: 6, roll: 0.5, bus: 'amb', reverb: 0.5, when: delay });
  },

  // ----- music box ------------------------------------------------------------
  startMusicBox(pos, { warp = 0, muffle = 0, gain = 0.5 } = {}) {
    if (!this.ready) return;
    this.stopMusicBox(false);
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = gain;
    let node = out;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = muffle || 18000; out.connect(filt); node = filt;
    const p = this.panner(pos, 0.7, 1.4); node.connect(p); p.connect(this.bus.sfx);
    const s = ctx.createGain(); s.gain.value = 0.45; p.connect(s); s.connect(this.reverbIn);
    this.musicBox = { out, filt, p, idx: 0, t: ctx.currentTime + 0.1, warp, beat: 0.4 + warp * 0.18, slow: 0 };
  },
  setMusicBoxMuffle(f) { if (this.musicBox) this.musicBox.filt.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.15); },
  stopMusicBox(windDown = true) {
    const m = this.musicBox; if (!m) return;
    this.musicBox = null;
    const t = this.ctx.currentTime;
    if (windDown) { // the last notes drag and sag, then silence
      for (let k = 0; k < 3; k++) this.mbNote(m, t + 0.25 + k * (0.5 + k * 0.4), 523.25 * Math.pow(2, (7 - k * 3) / 12) * (1 - k * 0.04), 0.5 - k * 0.12);
      m.out.gain.setTargetAtTime(0, t + 2.6, 0.3);
    } else m.out.gain.setTargetAtTime(0, t, 0.05);
  },
  mbNote(m, t, f, vel) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
    g.connect(m.out);
    for (const [mul, amp] of [[1, 1], [6.27, 0.08], [2, 0.12]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = amp;
      if (mul > 2) { og.gain.setValueAtTime(amp, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); }
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.9);
    }
  },
  updateMusicBox() {
    const m = this.musicBox; if (!m) return;
    const now = this.ctx.currentTime;
    while (m.t < now + 0.35) {
      const [n, beats] = LULLABY[m.idx % LULLABY.length];
      let f = 523.25 * Math.pow(2, SEMI[n] / 12);
      if (m.warp > 0) { f *= 1 - m.warp * (0.03 + 0.05 * Math.sin(m.idx * 0.9)) - m.slow * 0.06; }
      this.mbNote(m, m.t, f, 0.42 + Math.random() * 0.12);
      if (m.idx % 8 === 0) this.mbNote(m, m.t, f / 2, 0.18);
      m.t += beats * m.beat * (1 + (m.warp ? (Math.random() - 0.3) * 0.25 * m.warp : 0));
      m.idx++;
      if (m.warp) { m.slow = Math.min(1, m.slow + 0.01); m.beat += 0.004 * m.warp; }
    }
  },

  // ----- formant voice -----------------------------------------------------
  // Unintelligible speech-like babble under subtitles. style: phone | door | whisper | near | real
  voice(text, o = {}) {
    if (!this.ready) return 0.06 * text.length + 0.8;
    const ctx = this.ctx, style = o.style || 'door', wrong = o.wrong || 0, rate = o.rate || 1;
    const t0 = ctx.currentTime + 0.06;
    const whisper = style === 'whisper';
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'sawtooth';
    const nz = ctx.createBufferSource(); nz.buffer = this.buf.white; nz.loop = true;
    const nz2 = ctx.createBufferSource(); nz2.buffer = this.buf.white; nz2.loop = true;
    const vG = ctx.createGain(), sG = ctx.createGain(), aG = ctx.createGain(), cG = ctx.createGain();
    vG.gain.value = 0; sG.gain.value = 0; aG.gain.value = 0; cG.gain.value = 0;
    const mix = ctx.createGain();
    src.connect(vG); vG.connect(mix); sub.connect(sG); sG.connect(mix); nz.connect(aG); aG.connect(mix);
    const out = ctx.createGain(); out.gain.value = 1;
    const F = [0, 1, 2].map(k => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = whisper ? [4, 6, 8][k] : [7, 10, 13][k]; f.frequency.value = VOWELS[4][k]; const g = ctx.createGain(); g.gain.value = [1, 0.55, 0.28][k] * (whisper ? 2.2 : 3.2); mix.connect(f); f.connect(g); g.connect(out); return f; });
    const cB = ctx.createBiquadFilter(); cB.type = 'bandpass'; cB.frequency.value = 3800; cB.Q.value = 1.4;
    nz2.connect(cB); cB.connect(cG); cG.connect(out);
    // style chain
    let tail = out;
    const chain = (...nodes) => { for (const n of nodes) { tail.connect(n); tail = n; } };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    if (style === 'phone') {
      const ws = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); } ws.curve = curve;
      chain(filt('highpass', 480), filt('lowpass', 2700), ws);
    } else if (style === 'door') chain(filt('lowpass', 700 + (o.open || 0) * 1500, 0.8));
    else if (style === 'real') chain(filt('lowpass', 1600, 0.7));
    else chain(filt('highpass', 320));
    if (wrong > 0) { // ring-mod wobble: sounds like the voice is being worn by something else
      const rm = ctx.createGain(); rm.gain.value = 1 - wrong * 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 38 + wrong * 30; const lg = ctx.createGain(); lg.gain.value = wrong * 0.5;
      lfo.connect(lg); lg.connect(rm.gain); lfo.start(t0); lfo.stop(t0 + 30);
      chain(rm);
    }
    const level = ctx.createGain(); level.gain.value = (o.gain ?? 1) * (style === 'phone' ? 0.55 : style === 'whisper' ? 1.1 : 0.8);
    chain(level);
    if (o.pos) { const p = this.panner(o.pos, o.ref ?? 0.8, 1.3); chain(p); }
    else if (style === 'phone') { const p = ctx.createStereoPanner(); p.pan.value = -0.55; chain(p); }
    tail.connect(this.bus.voice);
    if (style !== 'phone') { const s = ctx.createGain(); s.gain.value = style === 'door' ? 0.35 : 0.2; tail.connect(s); s.connect(this.reverbIn); }

    // plan syllables from the text
    const f0 = (o.f0 || 205) * (1 - wrong * 0.25);
    let t = t0;
    const words = text.split(/\s+/).filter(Boolean);
    words.forEach((w, wi) => {
      const syl = Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
      for (let s = 0; s < syl; s++) {
        const dur = rand(0.12, 0.2) / rate * (1 + wrong * 0.4);
        const v = VOWELS[(Math.random() * VOWELS.length) | 0];
        const prog = (wi + s / syl) / Math.max(1, words.length);
        const pitch = f0 * (1.08 - prog * 0.16) * rand(0.94, 1.06) * (1 - wrong * prog * 0.3);
        for (let k = 0; k < 3; k++) F[k].frequency.setTargetAtTime(v[k] * (1 - wrong * 0.12), t, 0.025);
        src.frequency.setTargetAtTime(pitch, t, 0.04); sub.frequency.setTargetAtTime(pitch * 0.5, t, 0.04);
        const amp = whisper ? 0 : rand(0.55, 0.8);
        vG.gain.setTargetAtTime(amp, t, 0.02); vG.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.02);
        sG.gain.setTargetAtTime(amp * wrong * 0.9, t, 0.02); sG.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.02);
        aG.gain.setTargetAtTime(whisper ? 0.55 : 0.09, t, 0.02); aG.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.03);
        if (Math.random() < 0.6) { cG.gain.setValueAtTime(0, t); cG.gain.linearRampToValueAtTime(whisper ? 0.5 : 0.28, t + 0.012); cG.gain.linearRampToValueAtTime(0, t + 0.05); }
        t += dur;
      }
      t += /[,;]$/.test(w) ? 0.2 : /[.!?…]$/.test(w) ? 0.34 : 0.035;
    });
    if (/\?\s*$/.test(text)) src.frequency.setTargetAtTime(f0 * 1.25, t - 0.25, 0.06);
    for (const s of [src, sub, nz, nz2]) { s.start(t0); s.stop(t + 0.3); }
    return t - t0 + 0.15;
  },

  // ----- simple continuous emitters ---------------------------------------
  startRing(pos) {
    this.stopRing();
    this.ring = { pos, next: this.ctx ? this.ctx.currentTime + 0.1 : 0, h: [] };
  },
  stopRing() { if (this.ring) { this.ring.h.forEach(h => h.stop(0.03)); this.ring = null; } },
  startDial() { if (!this.ready || this.dial) return; const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0.05; const p = ctx.createStereoPanner(); p.pan.value = -0.55; const oscs = [350, 440].map(f => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); return o; }); g.connect(p); p.connect(this.bus.sfx); this.dial = { g, oscs }; },
  stopDial() { if (!this.dial) return; const t = this.ctx.currentTime; this.dial.g.gain.setTargetAtTime(0, t, 0.02); this.dial.oscs.forEach(o => o.stop(t + 0.2)); this.dial = null; },
  setBuzz(level, pos) {
    if (!this.ready) return;
    if (!this.buzz && level > 0) {
      const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.value = 0; const p = this.panner(pos, 1, 1.2);
      o.connect(bp); bp.connect(g); g.connect(p); p.connect(this.bus.sfx); o.start();
      this.buzz = { o, g };
    }
    if (this.buzz) this.buzz.g.gain.setTargetAtTime(level * 0.09, this.ctx.currentTime, 0.02);
  },
  startRiser() {
    if (!this.ready || this.riser) return;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0; g.connect(this.bus.music);
    const oscs = Array.from({ length: 6 }, () => { const o = ctx.createOscillator(); o.type = 'triangle'; const og = ctx.createGain(); og.gain.value = 0; o.connect(og); og.connect(g); o.start(); return { o, og }; });
    g.gain.setTargetAtTime(0.06, ctx.currentTime, 1.5);
    this.riser = { g, oscs, p: 0 };
  },
  stopRiser(tc = 0.6) { if (!this.riser) return; const r = this.riser; this.riser = null; const t = this.ctx.currentTime; r.g.gain.setTargetAtTime(0, t, tc); r.oscs.forEach(x => x.o.stop(t + tc * 6)); },

  // ----- per-frame ------------------------------------------------------------
  update(dt, ctxInfo) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime, P = ctxInfo.player;
    // tension score
    this.tension = damp(this.tension, this.tensionTarget, 0.6, dt);
    if (this.loops.drone) { this.loops.drone.gain.setTargetAtTime(0.018 + this.tension * 0.12, now, 0.3); this.loops.hi.gain.setTargetAtTime(Math.pow(this.tension, 2) * 0.016, now, 0.3); }
    this.updateMusicBox();
    // shepard riser
    if (this.riser) {
      const r = this.riser; r.p = (r.p + dt * 0.08) % 1;
      r.oscs.forEach((x, k) => {
        const pos = (k + r.p) / 6, f = 55 * Math.pow(2, pos * 6);
        x.o.frequency.setTargetAtTime(f, now, 0.05);
        x.og.gain.setTargetAtTime(Math.pow(Math.sin(Math.PI * pos), 2) * 0.5, now, 0.05);
      });
    }
    // phone bell: 2 s ring, 4 s silence
    if (this.ring && now >= this.ring.next) {
      this.ring.h = [this.play('bell', { pos: this.ring.pos, gain: 0.55, reverb: 0.3, ref: 1.2 })];
      this.ring.next = now + 6;
    }
    if (G.state !== 'play') return;
    const fear = this.fear = P.fear;
    // heartbeat: only when it's really bad
    if (fear > 0.32 && now >= this.nextBeat) {
      const bpm = 64 + fear * 96;
      this.play('heart', { gain: Math.min(1, (fear - 0.32) * 1.5) * 0.6, bus: 'sfx', reverb: 0 });
      this.nextBeat = now + 60 / bpm;
    }
    // breathing (player): barely there until you're scared or out of breath
    if (!P.holdingBreath && !this.breathSuppressed && now >= this.nextBreath) {
      const scared = fear > 0.45 || P.stamina < 0.4;
      const name = this.breathIn ? (scared ? 'inShaky' : 'in') : (scared ? 'outShaky' : 'out');
      const g = (0.018 + fear * 0.12 + (1 - P.stamina) * 0.12) * (P.eyesClosed > 0.8 ? 1.3 : 1);
      this.play(name, { gain: g, bus: 'sfx', reverb: 0.05, rate: 1 + fear * 0.25 });
      const len = this.buf[name].duration / (1 + fear * 0.25);
      this.nextBreath = now + len + (this.breathIn ? 0.15 : rand(0.6, 1.6) * (1 - fear * 0.7));
      this.breathIn = !this.breathIn;
    }
    const a = this.anchors;
    // clock ticking near the hall clock
    if (a.clock && now >= this.nextTick) {
      this.nextTick = Math.ceil(now + 0.001);
      const d = _v1.copy(a.clock).distanceTo(P.headPos);
      if (d < 7) this.play(this.tickHi ? 'tick' : 'tock', { pos: a.clock, gain: 0.16, reverb: 0.15, when: this.nextTick - now, ref: 0.6 });
      this.tickHi = !this.tickHi;
    }
    // bathroom faucet drip
    if (a.drip && (this.nextDrip -= dt) <= 0) {
      this.nextDrip = rand(1.6, 3.4);
      if (_v1.copy(a.drip).distanceTo(P.headPos) < 9) this.play('drip', { pos: a.drip, gain: 0.24, reverb: 0.6, rate: rand(0.9, 1.1) });
    }
    // the building settles
    if ((this.nextCreak -= dt) <= 0) {
      this.nextCreak = rand(9, 26);
      const spot = V3(P.headPos.x + rand(-5, 5), rand(0.2, 2.6), P.headPos.z + rand(-4, 4));
      this.play(Math.random() < 0.7 ? 'creakFloor' : 'thump', { pos: spot, gain: rand(0.08, 0.2), muffle: 1800, reverb: 0.4 });
    }
    if (a.street && (this.nextCar -= dt) <= 0) {
      this.nextCar = rand(40, 90);
      const h = this.play('car', { pos: V3(a.street.x - 20, a.street.y, a.street.z), gain: 0.3, bus: 'amb', muffle: 900, reverb: 0.1, ref: 6, roll: 0.6 });
      if (h?.panner?.positionX) { h.panner.positionX.setValueAtTime(a.street.x - 20, now); h.panner.positionX.linearRampToValueAtTime(a.street.x + 20, now + 5); }
    }
    if (this.birds && a.windows && (this.nextBird -= dt) <= 0) {
      this.nextBird = rand(0.4, 2.2);
      const w = pick(a.windows);
      this.play('bird', { pos: V3(w.x + rand(-4, 4), w.y + rand(0, 3), w.z + (w.z > 0 ? 4 : -4)), gain: rand(0.08, 0.2), bus: 'amb', reverb: 0.1, rate: rand(0.9, 1.15) });
    }
  },
};
