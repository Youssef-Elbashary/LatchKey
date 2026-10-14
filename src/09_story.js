// ---------------------------------------------------------------------------
// story: one night, eleven hours of it. Each hour is an abortable async script
// plus a per-frame tick that enforces Mom's rules.
// ---------------------------------------------------------------------------
class Abort extends Error {}
const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const sfx = (name, fallback) => (A.buf[name] ? name : fallback); // the recorded effect, or the synthesized one

const DEATHS = {
  chain: ['you let her in.', '1. keep the chain on until the sun is up.'],
  knocked: ['mom never knocks.', '2. I never knock. I have my key.'],
  look: ['you looked at her face.', '3. if you see her in the hall, close your eyes.'],
  opened: ['you opened your eyes too soon.', "3. don't look at her face. let her pass."],
  behind: ['she was right there.', '3. close your eyes. let her walk past you.'],
  turned: ['you turned around.', "4. if she says your name behind you, don't turn around."],
  stopped: ['you stopped walking.', '4. keep walking.'],
  song: ['you let it play.', '5. if the music box plays, close it.'],
  answered: ['you answered.', "6. if the phone rings again, don't answer it. I won't call twice."],
  entered: ['you went into her room.', '7. never go into my room. not even if it sounds like me.'],
  ceiling: ['she came down.', '8. if you hear her on the ceiling, get under your bed.'],
  peeked: ['you opened your eyes.', '8. ...and keep your eyes shut.'],
  found: ['she found you.', '9. at 4:44, hide in the hall closet.'],
  heard: ['she heard you breathing.', "9. hold your breath when she's close."],
  caught: ['she caught you.', '10. if she runs, run to your room.'],
  door: ['you let go.', "10. hold the door. don't let go."],
  grabbed: ['you got too close.', "1. keep the chain on. don't go near the door."],
};

// the apartment as the night has left it by hour h (a restarted hour must look the same as one walked into)
function nightState(h) {
  P.hasFlashlight = true; P.flashOn = true; W.setFlashlightProp(false);
  if (h >= 3) { W.setPhotos(1); W.setCoat(false); }
  if (h >= 4) { W.setMusicBox('tub', false); W.setShowerCurtain(true, true); W.doors.bath.set(0.92, true); }
  if (h >= 8) { W.setPhotos(2); W.setDrawings('late'); }
  W.setBlood(h >= 10 ? 4 : h >= 9 ? 3 : h >= 5 ? 2 : h >= 4 ? 1 : 0);
  // the candles: lit at 3:09, blown out at 3:51. The matches and the spare key leave the drawer when you take them.
  W.setCandles(h >= 5 ? 'out' : h >= 2 ? 'lit' : 'unlit', Story.litMask);
  if (h >= 2) W.props.matchbox.visible = false;
  if (h >= 6) W.props.spareKey.visible = false;
}
const WINDOWS = { bedWindow: ['bed', V3(4.4, 1.5, -4.1)], livingWindow: ['living', V3(4.4, 1.5, 6.1)], kitchenWindow: ['kitchen', V3(9.3, 1.6, 6.1)] };

const Story = {
  chapter: 0, run: 0, waits: [], flags: {}, t0: 0, dying: null, peepLocked: false, handShow: 0, baseFear: 0.05, sounds: [], hold: null, litMask: null,

  init() {
    // Mom's long fingers on your shoulder (4:12)
    const hand = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ map: TEX.skin.map, normalMap: TEX.skin.normalMap, color: 0xd8d0c8, roughness: 0.6, emissive: 0x4a423d });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.11), skin); hand.add(palm);
    for (let i = 0; i < 4; i++) {
      let p = new THREE.Group(); p.position.set(-0.035 + i * 0.023, 0, -0.055); hand.add(p);
      for (let k = 0; k < 3; k++) {
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.008 - k * 0.001, 0.05, 3, 6), skin); seg.rotation.x = Math.PI / 2; seg.position.z = -0.03; p.add(seg);
        const n = new THREE.Group(); n.position.z = -0.062; n.rotation.x = -0.35 - k * 0.1; p.add(n); p = n;
      }
    }
    hand.rotation.set(0.42, -0.5, 0.3); hand.position.set(-0.27, -0.7, -0.27); hand.visible = false;
    G.camera.add(hand); this.shoulderHand = hand;
    // the mirror shows what the room hides
    const orig = W.mirror.onBeforeRender;
    W.mirror.onBeforeRender = function (r, s, c) {
      const g = Stalker.group, was = g.visible;
      if (W.ghostInMirror) g.visible = true;
      P.body.traverse(o => o.layers.enable(0));
      orig.call(this, r, s, c);
      P.body.traverse(o => o.layers.disable(0));
      g.visible = was;
    };
  },

  // ----- async helpers (bound to the current run) ------------------------------
  wait(sec) { const run = this.run; return new Promise((res, rej) => this.waits.push({ t: G.time + sec, res, rej, run })); },
  until(fn, timeout = Infinity) { const run = this.run; return new Promise((res, rej) => this.waits.push({ fn, t: G.time + timeout, res, rej, run })); },
  cb(fn) { const run = this.run; return (...a) => { if (run === this.run) fn(...a); }; },
  elapsed() { return G.time - this.t0; },

  // ----- voices: recorded lines (A.line) with their subtitles ------------------
  lineNow(id, o = {}) {
    const L0 = LINES[id] || { kind: 'mimic', text: id };
    const r = A.line(id, o);
    const text = o.text ?? L0.text;
    if (text && o.caption !== false) {
      const cls = o.cls ?? (L0.kind === 'evil' ? 'evil' : L0.kind === 'mom' ? '' : 'mimic');
      const show = () => UI.say(o.who ?? '', text, Math.max(1.6, r.dur - r.lead) + 0.8, cls);
      if (r.lead > 0.05) this.wait(r.lead).then(show).catch(() => {}); else show();
    }
    return r;
  },
  async say(id, o = {}) { const r = this.lineNow(id, o); await this.wait(r.dur + (o.gap ?? 0.35)); },
  // two mouths at once: Mom's voice, and the thing wearing it
  async duo(idMom, idEvil, o = {}) {
    const a = A.line(idMom, { ...o, kind: 'mimic', wrong: o.wrong ?? 0.7 });
    const b = A.line(idEvil, { ...o, gain: (o.gain ?? 1) * 0.9 });
    const d = Math.max(a.dur, b.dur);
    UI.say(o.who ?? '', o.text ?? (LINES[idMom] || LINES[idEvil] || {}).text ?? '', d + 0.8, 'evil');
    await this.wait(d + (o.gap ?? 0.35));
  },
  doorSay(id, o = {}) {
    const real = LINES[id]?.kind === 'mom';
    return this.say(id, { style: 'door', pos: W.anchors.frontOut, who: real ? 'MOM · OUTSIDE THE DOOR' : 'OUTSIDE THE DOOR', ...o });
  },
  keep(h) { if (h) this.sounds.push(h); return h; },
  stopSounds(fade = 0.15) { for (const h of this.sounds) h.stop(fade); this.sounds = []; },
  // three knuckle raps per set
  knockAt(pos, sets = 1, gain = 1.1, gap = 1.0, muffle = 0) {
    for (let i = 0; i < sets; i++) {
      const p = pos || V3(-0.05, 1.2, rand(-0.1, 0.1));
      if (A.buf.sfx_knock) A.play('sfx_knock', { pos: p, gain, when: i * gap, reverb: 0.35, ref: 1.8, rate: rand(0.96, 1.04), muffle });
      else for (let k = 0; k < 3; k++) A.play('knock', { pos: p, gain, when: i * gap + k * 0.2, reverb: 0.35, ref: 1.5, muffle });
    }
    return sets * gap;
  },
  knock(sets = 1, gain = 1.1, gap = 1.0) { return this.knockAt(null, sets, gain, gap); }, // at the front door
  pound(n, interval = 0.32, gain = 1.3) {
    for (let i = 0; i < n; i++) A.play(sfx('sfx_pound', 'pound'), { pos: V3(-0.05, 1.2, rand(-0.1, 0.1)), gain, when: i * interval * rand(0.92, 1.08), reverb: 0.4, ref: 1.8 });
    W.doors.front.jitter = n * interval; A.play('chain', { pos: W.chain.anchor, gain: 0.7, when: 0.05 });
    return n * interval;
  },

  // ----- chapters -----------------------------------------------------------------
  startChapter(i, { spawn = true, fade = 1 } = {}) {
    this.run++;
    for (const w of this.waits) w.rej(new Abort());
    this.waits = []; this.dying = null; this.hold = null;
    this.stopSounds(0.05);
    this.chapter = i; this.flags = {}; this.t0 = G.time; this.baseFear = 0.05; this.peepLocked = false; this.handShow = 0; this.mirrorArmed = false;
    const C = CHAPTERS[i];
    W.reset(); Stalker.hide(); Stalker.tilt = 0.45; Stalker.data = {}; Stalker.setMask(false);
    A.stopMusicBox(false); A.stopRing(); A.stopDial(); A.stopRiser(); A.birds = false; A.setTension(0.1); A.breathSuppressed = false;
    P.dyingBattery = false; P.flashFlicker = 0; P.canClose = true; P.cine = null; P.eyesClosed = 0; P.fear = 0.05; P.fearKick = 0; P.holdingBreath = false; P.breath = 1; P.deadView = false;
    P.onGasp = null; P.onStep = null; P.setMode('free');
    Post.peep = 0; Post.look = 0; Post.red = 0; Post.glitch = 0; Post.bloom.strength = 0.5;
    G.camera.fov = 72; G.camera.updateProjectionMatrix(); G.camera.layers.disable(LAYER_OUTSIDE);
    this.shoulderHand.visible = false;
    UI.clearCaptions(); UI.objective(null); UI.clearHint(); UI.setPrompt(null); UI.setBreath(false, 1); UI.showNote(false); UI.hideDeath();
    const keepFlash = !spawn && P.hasFlashlight ? P.flashOn : null; // walking into the next hour keeps your flashlight as you left it
    C.setup.call(this);
    if (keepFlash !== null) P.flashOn = keepFlash;
    W.setClock(...C.clock);
    if (spawn && C.spawn) P.teleport(...C.spawn);
    if (i > 0) Save.chapter = i;
    G.state = 'play';
    Post.fadeTo(0, fade);
    UI.showHud(true);
    const run = this.run;
    C.run.call(this).then(() => { if (run === this.run && i + 1 < CHAPTERS.length) this.startChapter(i + 1, { spawn: false, fade: 0.01 }); })
      .catch(e => { if (!(e instanceof Abort)) console.error(e); });
  },

  // ----- per-frame ---------------------------------------------------------------
  update(dt) {
    // resolve waits
    if (this.waits.length) {
      const keep = [];
      for (const w of this.waits) {
        if (w.run !== this.run) { w.rej(new Abort()); continue; }
        let done = false, val = true;
        try { if (w.fn) { if (w.fn()) done = true; else if (G.time >= w.t) { done = true; val = false; } } else if (G.time >= w.t) done = true; }
        catch (e) { console.error(e); done = true; }
        if (done) w.res(val); else keep.push(w);
      }
      this.waits = keep;
    }
    if (this.dying) { this.updateDeath(dt); return; }
    if (G.state !== 'play') return;
    // note overlay
    if (UI.noteOpen()) {
      if (Input.wasHit('KeyE', 'Tab', 'Enter') || Input.mouseHit.has(0)) { UI.showNote(false); P.setMode(this._modeBeforeNote || 'free'); this.flags.noteClosed = true; }
      return;
    }
    if (Input.wasHit('Tab') && (this.chapter >= 1 || this.flags.noteRead) && P.mode === 'free') { this._modeBeforeNote = P.mode; P.setMode('note'); UI.showNote(true); return; }
    // interact
    const lab = P.hover ? P.hover.label() : null;
    UI.setPrompt(P.mode === 'free' ? lab : null);
    if (lab && P.mode === 'free' && (Input.wasHit('KeyE') || Input.mouseHit.has(0))) P.hover.use();
    if ((Input.wasHit('KeyF') || Input.mouseHit.has(2)) && P.mode !== 'closet' && P.mode !== 'peephole' && P.mode !== 'bed' && P.hasFlashlight) P.setFlash(!P.flashOn);
    if (P.mode === 'peephole' && !this.peepLocked && (Input.wasHit('KeyE', 'KeyS', 'KeyW', 'KeyA', 'KeyD', 'Escape') || Input.mouseHit.has(0)) && G.time - this.peepT > 0.4) this.exitPeephole();
    if (P.mode === 'closet' && this.flags.canLeaveCloset && (Input.wasHit('KeyE') || Input.mouseHit.has(0))) this.leaveCloset();
    if (P.mode === 'bed' && this.flags.canLeaveBed && (Input.wasHit('KeyE') || Input.mouseHit.has(0))) this.leaveBed();
    // fear baseline from her proximity
    let ft = this.baseFear;
    if (Stalker.group.visible) ft = Math.max(ft, smooth(8, 1, Stalker.distTo(P.pos)) * 0.85);
    if (!P.flashOn && P.mode === 'free') ft += 0.06;
    P.fearTarget = clamp(ft, 0, 1);
    Post.look = damp(Post.look, 0, 3, dt);
    // chapter rules
    const tick = this['tick' + this.chapter];
    if (tick) tick.call(this, dt);
    // shoulder hand
    const h = this.shoulderHand;
    h.position.y = damp(h.position.y, this.handShow ? -0.215 : -0.7, 5, dt); h.visible = h.position.y > -0.66;
    h.children.forEach((c, i) => { if (i) c.rotation.y = Math.sin(G.time * 2 + i) * 0.05; });
  },

  // ----- interactions ------------------------------------------------------------
  label(id) {
    const ch = this.chapter, f = this.flags, mb = W.musicBox;
    switch (id) {
      case 'flashlight': return P.hasFlashlight ? null : 'take your flashlight';
      case 'phone': return A.ring ? 'answer the phone' : ch === 1 && W.machineMode === 'rec' ? 'pick up the phone' : f.onPhone ? null : 'pick up the phone';
      case 'note': return "read mom's note";
      case 'peephole': return W.doors.front.t > 0.01 ? null : 'look through the peephole';
      case 'chain': return W.chainOn ? 'take the chain off' : null;
      case 'frontknob': return 'open the door';
      case 'switch': return 'flip the light switch';
      case 'musicboxNight': return mb.where === 'nightstand' ? (mb.target ? 'close the music box' : 'open the music box') : null;
      case 'musicboxTub': return mb.where === 'tub' && W.curtainTarget > 0 && mb.target > 0 ? 'close the music box' : null;
      case 'curtain': return W.curtainTarget > 0 ? null : 'pull back the shower curtain';
      case 'drawer': return W.drawer.target ? (ch === 6 && !f.gotBatteries ? 'take the batteries' : ch === 1 && !f.gotMatches ? 'take the matches' : ch === 5 && !f.hasKey ? 'take the spare key' : 'close the drawer') : 'open the drawer';
      case 'candle0': case 'candle1': case 'candle2': {
        if (W.candles[+id.slice(-1)].lit) return null;
        return ch === 1 && f.gotMatches ? 'light the candle' : W.candleMode === 'out' ? 'a cold candle' : 'a candle';
      }
      case 'bathSink': return ch === 9 && !f.water ? 'get a glass of water' : 'the sink';
      case 'closet': return ch === 8 && !f.inCloset ? 'hide in the closet' : W.doors.closetL.t < 0.5 ? 'open the closet' : null;
      case 'bedDoor': return W.doors.bed.t < 0.3 ? 'open the door' : null;
      case 'bathDoor': return W.doors.bath.t < 0.6 ? 'push the door open' : null;
      case 'momDoor': return ch === 5 && f.momShut && f.hasKey && !f.locked ? "lock mom's door" : W.doors.mom.t < 0.3 || f.momOpen ? "mom's door" : null;
      case 'alarm': case 'clock': return 'check the time';
      case 'scrawl': return 'read the wall';
      case 'coat': return W.coatOn ? "mom's coat" : null;
      case 'photoNurse': case 'photoSchool': case 'photoBeach': return 'look at the photo';
      case 'drawingHall': case 'drawingHall2': case 'fridgeDrawing': return 'look at the drawing';
      case 'bed': return ch === 7 && f.mustHide && !f.underBed ? 'hide under the bed' : 'get back in bed';
      case 'bedWindow': case 'livingWindow': case 'kitchenWindow': {
        const w = WINDOWS[id][0];
        if (ch === 2 && !f['lock_' + w]) return 'check the window lock';
        if (ch === 10 && w !== 'kitchen' && !W.curtainsOpen(w)) return 'open the curtains';
        return 'look outside';
      }
      case 'tv': return W.tvMode === 'off' ? 'the TV' : null;
      default: return 'look';
    }
  },
  think(t) { UI.thought(t, 3.8); },
  use(id) {
    const ch = this.chapter, f = this.flags, D = W.doors, mb = W.musicBox;
    switch (id) {
      case 'flashlight':
        P.hasFlashlight = true; W.setFlashlightProp(false); P.setFlash(true); A.play('rustle', { gain: 0.3 });
        this.think('there.'); break;
      case 'phone':
        if (ch === 1 && (A.ring || W.machineMode === 'rec')) { this.answered().catch(() => {}); break; }
        if (A.ring) { f.phoneAnswered = true; break; }
        this.listenToLine().catch(() => {}); break;
      case 'note':
        f.noteRead = true; this._modeBeforeNote = P.mode; P.setMode('note'); UI.showNote(true); UI.hint('<span><kbd>tab</kbd>read the note again</span>', 6); break;
      case 'peephole': this.enterPeephole(); break;
      case 'chain': this.chainOff(); break;
      case 'frontknob': A.play('chain', { pos: W.chain.anchor, gain: 0.35 }); this.think(W.chainOn ? "the chain's on. it stays on." : '...'); break;
      case 'switch':
        A.play('click', { gain: 0.35, rate: 0.8 });
        this.think(f.switched ? '...nothing.' : "click. nothing. the power's out."); f.switched = true; break;
      case 'musicboxNight':
        if (mb.target) { mb.target = 0; A.stopMusicBox(false); A.play('clack', { pos: mb.group.position, gain: 0.5 }); }
        else { mb.target = 1; A.startMusicBox(mb.group.position, { gain: 0.35 }); this.think('mom gave me this.'); }
        break;
      case 'musicboxTub':
        mb.target = 0; A.stopMusicBox(true); A.play('clack', { pos: mb.group.position, gain: 0.7 }); f.musicBoxClosed = true; break;
      case 'curtain':
        W.setShowerCurtain(true); A.play('curtain', { pos: W.anchors.tub, gain: 0.7 }); f.curtainOpen = true;
        if (A.musicBox) { A.setMusicBoxMuffle(18000); P.kick(0.45); } break;
      case 'drawer':
        if (!W.drawer.target) { W.setDrawer(true); A.play('drawer', { pos: W.drawer.group.position, gain: 0.6 }); if (ch !== 6 && ch !== 1 && ch !== 5) this.think('spoons. string. birthday candles.'); }
        else if (ch === 6 && !f.gotBatteries) {
          f.gotBatteries = true; W.props.battery0.forEach(m => (m.visible = false)); W.props.battery1.forEach(m => (m.visible = false));
          A.play('click', { gain: 0.5, rate: 0.7 }); A.play('click', { gain: 0.5, rate: 0.9, when: 0.5 });
        } else if (ch === 1 && !f.gotMatches) {
          f.gotMatches = true; W.props.matchbox.visible = false; A.play('rustle', { gain: 0.4 });
          UI.objective(`light the candles (${W.litCount()}/3)`); this.think('matches. one in the hall, one by the TV, one in the kitchen.');
        } else if (ch === 5 && !f.hasKey) {
          f.hasKey = true; W.props.spareKey.visible = false; A.play('keys', { pos: W.drawer.group.position, gain: 0.45 });
          UI.objective("lock mom's door"); this.think("mom's spare key.");
        } else { W.setDrawer(false); A.play('clack', { pos: W.drawer.group.position, gain: 0.4 }); }
        break;
      case 'candle0': case 'candle1': case 'candle2': {
        const i = +id.slice(-1);
        if (ch === 1 && f.gotMatches && W.lightCandle(i)) {
          A.play('match', { pos: W.candles[i].top, gain: 0.9 });
          const n = W.litCount();
          UI.objective(n >= 3 ? null : `light the candles (${n}/3)`);
          if (n >= 3) this.think('better.');
        } else this.think(W.candleMode === 'out' ? "they're cold. she blew them out." : 'mom left candles out. the matches are in the kitchen drawer.');
        break;
      }
      case 'bathSink':
        if (ch === 9 && !f.water) {
          f.water = true; A.play('pour', { pos: W.anchors.drip, gain: 0.9 });
          UI.objective(null);
          this.wait(2.4).then(() => this.think('...that tastes like pennies.')).catch(() => {});
        } else this.think('drip. drip. drip.');
        break;
      case 'closet':
        if (ch === 8 && !f.inCloset) { this.enterCloset().catch(() => {}); break; }
        D.closetL.set(0.55); D.closetR.set(0.55); A.play('creakDoor', { pos: _v1.set(1.3, 1, -0.66), gain: 0.25 });
        this.think('coats and the vacuum. a good hiding place.');
        this.wait(2.2).then(() => { D.closetL.set(0); D.closetR.set(0); A.play('clack', { pos: _v1.set(1.3, 1, -0.66), gain: 0.25 }); }).catch(() => {});
        break;
      case 'bedDoor': D.bed.set(0.92); A.play('creakDoor', { pos: _v1.set(4.2, 1, -0.66), gain: 0.4 }); break;
      case 'bathDoor': D.bath.set(0.92); A.play('creakDoor', { pos: _v1.set(8.0, 1, -0.66), gain: 0.4, rate: 1.2 }); break;
      case 'momDoor':
        if (ch === 5 && f.momShut && f.hasKey && !f.locked) { f.locked = true; A.play('lock', { pos: W.anchors.momDoor, gain: 1 }); UI.objective(null); break; }
        if (f.momOpen) { this.think("don't. it isn't her."); break; }
        A.play('chain', { pos: W.anchors.momDoor, gain: 0.15, rate: 0.6 }); D.mom.jitter = 0.25;
        this.think(ch >= 5 ? "...something's breathing in there." : "mom's room. she always locks it."); break;
      case 'alarm': case 'clock': this.think(W.clockMinutes() % 720 === 284 ? '4:44.' : `it's ${W.timeText()}.`); break;
      case 'scrawl': this.think("i wrote that last time. so i'd remember."); break;
      case 'keyhooks': this.think("mom's keys are gone. she has them with her."); break;
      case 'coat': this.think("mom's winter coat. she wore her work jacket."); break;
      case 'photoNurse': this.think(['mom on her first day at the hospital.', "...where's mom's face?", "someone's standing behind her."][W.photoVariant]); break;
      case 'photoSchool': this.think(['my school picture. i hate my hair.', 'my school picture.', "...that wasn't there before."][W.photoVariant]); break;
      case 'photoBeach': this.think(['the lake. mom let me stay up late.', 'someone cut her face out.', "there's someone standing in the water."][W.photoVariant]); break;
      case 'drawingHall': this.think(W.drawingSet === 'late' ? "i didn't draw this one." : 'me and mom.'); break;
      case 'drawingHall2': this.think('mom works at night. she helps people.'); break;
      case 'fridgeDrawing': this.think("i drew her last time. so i'd know her."); break;
      case 'bed':
        if (ch === 7 && f.mustHide && !f.underBed) { this.enterBed().catch(() => {}); break; }
        this.think("i can't sleep. not until mom's home."); break;
      case 'bedWindow': case 'livingWindow': case 'kitchenWindow': {
        const [w, at] = WINDOWS[id];
        if (ch === 2 && !f['lock_' + w]) {
          f['lock_' + w] = true; A.play('click', { pos: at, gain: 0.55, rate: 0.6 });
          const n = ['bed', 'living', 'kitchen'].filter(k => f['lock_' + k]).length;
          UI.objective(n >= 3 ? null : `check the window locks (${n}/3)`);
          this.think(n >= 3 ? 'all locked.' : 'locked.');
          if (w === 'kitchen') this.windowScare().catch(() => {});
          break;
        }
        if (ch === 10 && w !== 'kitchen' && !W.curtainsOpen(w)) {
          W.openCurtains(w); A.play('curtain', { pos: at, gain: 0.6, rate: 0.8 });
          const n = ['bed', 'living'].filter(k => W.curtainsOpen(k)).length;
          if (!f.knocked) UI.objective(n >= 2 ? 'wait for the sun' : `open the curtains (${n}/2)`);
          if (n >= 2) this.think("the sky's getting lighter.");
          break;
        }
        this.think(ch >= 10 ? "it's getting light." : w === 'bed' ? 'rain. the streetlights are out too.' : ch >= 2 ? "...we're on the second floor." : 'the whole street is dark.');
        break;
      }
      case 'tv': this.think("the TV's off. the power's out."); break;
      case 'mirror': this.think(W.bloodLevel >= 1 ? "...it's still wet." : 'i look so tired.'); break;
      case 'duck': this.think('mister quack.'); break;
      case 'microwave': this.think(W.clockMinutes() % 720 === 284 ? '4:44. 4:44. 4:44.' : "it's off. the power's out."); break;
      case 'calendar': this.think('NIGHT. NIGHT. NIGHT. NIGHT. mom works so many nights.'); break;
      case 'wardrobe': this.think("...i'm not opening that."); break;
      case 'couch': this.think('mom falls asleep here after work.'); break;
      case 'stove': this.think("i'm not allowed to touch it."); break;
      case 'musicbox': break;
    }
  },

  async listenToLine() {
    if (this.flags.onPhone) return;
    this.flags.onPhone = true;
    W.setHandset(false); A.play('clack', { pos: W.anchors.phone, gain: 0.4 });
    P.setMode('phone', { center: P.yaw, range: 1.2, pitch: 0.7 });
    try {
      if (this.chapter < 1) { A.startDial(); await this.wait(2.2); A.stopDial(); this.think('dial tone.'); }
      else {
        const s = this.keep(A.play('staticLoop', { loop: true, gain: 0.05, pan: -0.55, reverb: 0 }));
        await this.wait(1.2);
        A.play(sfx('sfx_breath', 'gIn'), { pan: -0.55, gain: 0.55, muffle: 3000, reverb: 0 });
        await this.wait(2.2);
        await this.say('x_follow1', { style: 'phone', who: 'THE PHONE' });
        s && s.stop(0.1);
        this.think("someone's breathing on the line.");
        P.kick(0.5);
      }
    } finally {
      W.setHandset(true); A.play('clack', { pos: W.anchors.phone, gain: 0.4 });
      if (P.mode === 'phone') P.setMode('free');
      this.flags.onPhone = false;
    }
  },
  // 3:09: you picked it up
  async answered() {
    const f = this.flags; if (f.answered) return; f.answered = true;
    A.stopRing(); this.stopSounds(0.05); W.machineMode = 'idle';
    W.setHandset(false); A.play('clack', { pos: W.anchors.phone, gain: 0.5 });
    P.setMode('phone', { center: P.yaw, range: 0.9, pitch: 0.6 });
    UI.objective(null);
    this.keep(A.play('staticLoop', { loop: true, gain: 0.05, pan: -0.55, reverb: 0 }));
    await this.wait(1.3);
    A.play(sfx('sfx_breath', 'gIn'), { pan: -0.55, gain: 0.7, muffle: 3200, reverb: 0 });
    await this.wait(2.0);
    await this.say('e_bed1', { style: 'phone', who: 'THE PHONE', gap: 0.15 });
    this.kill('answered');
  },

  // ----- peephole --------------------------------------------------------------------
  enterPeephole() {
    this.peepYaw = P.yaw; this.peepT = G.time;
    P.setMode('peephole', { center: Math.PI / 2, range: 0.5, pitch: 0.35 });
    P.yaw = Math.PI / 2; P.pitch = 0; P.viewPos = V3(-0.07, 1.55, 0);
    G.camera.fov = 112; G.camera.updateProjectionMatrix(); G.camera.layers.enable(LAYER_OUTSIDE);
    Post.peep = 1; A.play('rustle', { gain: 0.25 }); A.play('creakFloor', { gain: 0.15, pos: _v1.set(0.4, 0, 0) });
    UI.hint('<span><kbd>E</kbd>step down</span>', 3);
    if (this.flags.knocking && !this.flags.peepScared) this.peepScare().catch(() => {});
    else if (this.chapter >= 4 && this.chapter <= 8 && !this.flags.peepSeen) { // far down the building corridor, she's waiting
      this.flags.peepSeen = true; Stalker.show('idle'); Stalker.place(-8.4, 0, Math.PI / 2); Stalker.look = V3(0, 0, 0); Stalker.tilt = 0.7;
      Stalker.data.peepOnly = true; P.kick(0.5); A.play('stingSoft', { gain: 0.35 });
    }
  },
  exitPeephole() {
    P.setMode('free'); P.yaw = this.peepYaw ?? -Math.PI / 2; P.pitch = 0; Post.peep = 0;
    G.camera.fov = 72; G.camera.updateProjectionMatrix(); G.camera.layers.disable(LAYER_OUTSIDE);
    if (Stalker.data.peepOnly) Stalker.hide();
    A.play('creakFloor', { gain: 0.15, pos: _v1.set(0.4, 0, 0) });
  },
  async peepScare() {
    this.flags.peepScared = true; this.peepLocked = true;
    try {
      await this.wait(1.3);
      await this.doorSay('x_peep', { wrong: 0.35, gain: 1.2 });
      A.hush(3, 0.05);
      await this.wait(0.9);
      Stalker.show('idle'); Stalker.pose = 'peer'; Stalker.poseK = 1; Stalker.tilt = 0.2;
      Stalker.putHeadAt(V3(-0.25, 1.52, 0.0), Math.PI / 2);
      L.warm.color.set(0xd8dcc8); L.warm.position.set(-0.08, 1.32, 0.1); L.warm.intensity = 0.45; L.warm.distance = 1.2;
      A.play(sfx('sfx_sting', 'stingHard'), { gain: 1 }); A.play('crack', { pos: _v1.set(-0.2, 1.5, 0), gain: 0.8 });
      if (A.buf.sfx_growl) A.play('sfx_growl', { pos: V3(-0.3, 1.5, 0), gain: 0.9 });
      Post.glitch = 0.6; P.kick(1); P.addShake(0.5);
      await this.wait(0.8);
      Stalker.hide(); L.warm.intensity = 0; L.warm.distance = 6; L.warm.color.set(0xffc890);
      this.peepLocked = false; this.exitPeephole();
      W.setUnderDoor(1, 1);
      this.think('...');
    } finally { this.peepLocked = false; }
  },

  // 3:17: you check the kitchen window after the knocking stops, and something taps on it. Two floors up.
  async windowScare() {
    const f = this.flags; if (!f.knockDone || f.tapDone) return;
    f.tapDone = true; f.tapRunning = true;
    try {
      A.hush(4);
      await this.wait(1.6);
      A.play(sfx('sfx_tap', 'click'), { pos: V3(9.3, 1.7, 6.16), gain: 1.6, reverb: 0.3 });
      await this.wait(1.9);
      // her face against the glass
      Stalker.show('idle'); Stalker.pose = 'peer'; Stalker.poseK = 1; Stalker.tilt = 0.5;
      Stalker.putHeadAt(V3(9.04, 1.6, 6.16), Math.PI);
      L.warm.color.set(0xb8c4d8); L.warm.position.set(9.05, 1.65, 5.7); L.warm.distance = 1.6; L.warm.intensity = 0.9;
      A.play(sfx('sfx_sting', 'stingHard'), { gain: 1.1 }); if (A.buf.sfx_growl) A.play('sfx_growl', { pos: V3(9.1, 1.6, 6.3), gain: 0.9 });
      P.kick(1); Post.glitch = 0.5; P.addShake(0.3);
      await this.wait(0.6);
      Stalker.hide(); L.warm.intensity = 0; L.warm.distance = 6; L.warm.color.set(0xffc890);
      await this.wait(1.2);
      this.think("...we're on the second floor.");
    } finally { f.tapRunning = false; }
  },

  // ----- the chain ---------------------------------------------------------------------
  chainOff() {
    const ch = this.chapter, f = this.flags;
    if (ch === 10 && f.realMom) { this.ending(); return; }
    if (ch === 10 && f.fakeMom) { this.kill('knocked', { door: true }); return; }
    if (ch === 2 && f.knocking) { this.kill('chain', { door: true }); return; }
    A.play('chain', { pos: W.chain.anchor, gain: 0.3 });
    this.think(ch === 10 && W.sunT > 0 ? 'not yet. wait for mom.' : "mom said keep it on until the sun's up.");
  },

  // ----- closet --------------------------------------------------------------------------
  async enterCloset() {
    const f = this.flags; f.inCloset = true;
    P.setMode('cine'); P.setFlash(false);
    W.doors.closetL.set(1); W.doors.closetR.set(1); A.play('creakDoor', { pos: _v1.set(1.3, 1, -0.66), gain: 0.35, rate: 1.3 });
    P.cine = { pos: V3(1.3, 1.1, -0.45), look: V3(1.3, 1.0, -1.4), k: 7 };
    await this.wait(0.45);
    P.cine = { pos: W.closetCam.clone(), look: V3(1.3, 1.05, -1.6), k: 6 };
    await this.wait(0.5);
    P.cine.look = V3(1.3, 1.05, 1.0); P.cine.k = 4;
    W.doors.closetL.set(0); W.doors.closetR.set(0); A.play('clack', { pos: _v1.set(1.3, 1, -0.66), gain: 0.4 });
    await this.wait(0.7);
    P.teleport(1.3, -1.02, Math.PI, -0.05); P.viewPos = W.closetCam.clone();
    P.setMode('closet', { center: Math.PI, range: 0.75, pitch: 0.45 });
    UI.hint('<span>hold <kbd>shift</kbd>hold your breath</span>', 9);
    UI.objective(null);
  },
  leaveCloset() {
    this.flags.leftCloset = true;
    W.doors.closetL.set(0.6); W.doors.closetR.set(0.6); A.play('creakDoor', { pos: _v1.set(1.3, 1, -0.66), gain: 0.3 });
    P.teleport(1.3, -0.1, Math.PI, 0); P.setMode('free'); UI.setBreath(false, 1);
    this.wait(1.4).then(() => { W.doors.closetL.set(0); W.doors.closetR.set(0); }).catch(() => {});
  },

  // ----- under the bed (4:23) ------------------------------------------------------------
  async enterBed() {
    const f = this.flags; f.underBed = true;
    UI.objective(null); UI.setPrompt(null);
    P.setMode('cine'); P.setFlash(false);
    A.play('rustle', { gain: 0.6 }); A.play(sfx('sfx_sheets', 'rustle'), { pos: V3(3.3, 0.3, -3.0), gain: 0.5 });
    P.cine = { pos: V3(3.85, 0.13, -3.05), look: V3(3.0, 0.1, -3.05), k: 5 };
    await this.wait(0.7);
    P.cine = { pos: V3(3.22, 0.1, -3.05), look: V3(4.6, 0.11, -3.05), k: 5 };
    await this.wait(0.8);
    P.viewPos = V3(3.22, 0.1, -3.05);
    P.teleport(3.22, -3.05, -Math.PI / 2, 0.02);
    P.setMode('bed', { center: -Math.PI / 2, range: 0.55, pitch: 0.18 });
    UI.hint('<span>hold <kbd>space</kbd>shut your eyes</span>', 9);
  },
  leaveBed() {
    this.flags.leftBed = true; A.play('rustle', { gain: 0.5 });
    P.teleport(3.95, -3.0, -Math.PI / 2, 0); P.setMode('free'); UI.clearHint();
  },

  // ----- deaths ----------------------------------------------------------------------------
  kill(reason, o = {}) {
    if (G.state !== 'play') return;
    G.state = 'dying';
    this.run++; for (const w of this.waits) w.rej(new Abort()); this.waits = [];
    this.deathReason = reason;
    UI.setPrompt(null); UI.clearCaptions(); UI.objective(null); UI.clearHint(); UI.showNote(false); UI.setBreath(false, 1); UI.card.classList.remove('on');
    A.stopMusicBox(false); A.stopRing(); A.stopDial(); A.stopRiser(); this.stopSounds(0.05);
    P.eyesClosed = 0; P.canClose = false; P.holdingBreath = false;
    if (P.mode === 'peephole') this.exitPeephole();
    P.deadView = P.mode === 'bed';
    const cam = G.camera; cam.updateMatrixWorld();
    const fwd = cam.getWorldDirection(V3()); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0); fwd.normalize();
    if (o.door) { W.setChain(false); W.doors.front.speed = 10; W.doors.front.set(1); A.play('bang', { pos: W.anchors.frontIn, gain: 0.9 }); }
    if (o.bedDoor) { W.doors.bed.speed = 12; W.doors.bed.set(1); A.play('bang', { pos: V3(4.22, 1.2, -0.66), gain: 1 }); }
    P.setMode('dead');
    P.flashOn = true; P.hasFlashlight = true;
    Stalker.show('lunge'); Stalker.pose = 'lunge'; Stalker.poseK = 1; Stalker.path = null; Stalker.look = null;
    Stalker.setMask(true); // the paper tears: what's under it
    W.slatFingers.show = 0; W.edgeFingers.show = 0;
    this.dying = { t: 0, fwd, cam: cam.position.clone(), stage: 0 };
    this.handShow = 0;
    A.hush(4, 0); // nothing but her
    A.play(sfx('sfx_shriek', 'shriek'), { gain: 1.25, reverb: 0.25 });
    A.play('shriek', { gain: 0.5, reverb: 0.2, rate: 0.82 });
    A.play(sfx('sfx_sting', 'stingHard'), { gain: 1, reverb: 0.2 });
    if (A.buf.sfx_growl) A.play('sfx_growl', { gain: 1.1, reverb: 0.1, when: 0.06 });
    Post.red = 0.3; Post.glitch = 0.8; P.addShake(1.2); P.kick(1);
  },
  updateDeath(dt) {
    const d = this.dying; d.t += dt;
    if (d.stage === 0) {
      const k = 1 - Math.pow(1 - Math.min(1, d.t / 0.2), 3);
      const dist = lerp(1.2, 0.36, k);
      Stalker.putHeadAt(V3(d.cam.x + d.fwd.x * dist, d.cam.y + 0.02, d.cam.z + d.fwd.z * dist), Math.atan2(-d.fwd.x, -d.fwd.z));
      L.flash.intensity = lerp(4, 1.4, k) * (Math.random() < 0.15 ? 0.25 : 1);
      Post.bloom.strength = 0.25;
      Post.red = Math.max(Post.red, 0.15); Post.glitch = Math.max(Post.glitch, 0.35);
      // look straight at her: the camera is pulled onto her face, the flashlight with it
      const face = _v1.setFromMatrixPosition(Stalker.parts.face.matrixWorld), cam = G.camera;
      cam.lookAt(face); cam.rotateZ((Math.random() - 0.5) * 0.08 * P.shake); cam.rotateX((Math.random() - 0.5) * 0.05 * P.shake); cam.updateMatrixWorld();
      // (under the bed the hand is at the floor: the light comes from just above the eyes instead)
      L.flash.position.copy(cam.position).add((P.deadView ? _v3.set(0.1, 0.05, 0.05) : _v3.set(0.14, -0.18, -0.08)).applyQuaternion(cam.quaternion));
      L.flash.target.position.copy(face); L.flash.target.updateMatrixWorld();
      if (d.t > 1.05) {
        d.stage = 1; d.t = 0;
        A.cut(2.6); Post.fadeTo(1, 0); Stalker.hide(); P.shake = 0; Post.red = 0; Post.glitch = 0; Post.bloom.strength = 0.5;
        UI.showHud(false);
      }
    } else if (d.stage === 1 && d.t > 1.5) {
      d.stage = 2;
      const [why, rule] = DEATHS[this.deathReason] || ['...', ''];
      UI.showDeath(why, rule);
      G.state = 'dead';
    }
  },
  retry() {
    if (G.state !== 'dead') return;
    this.dying = null; UI.hideDeath(); A.duck.gain.cancelScheduledValues(A.ctx.currentTime); A.duck.gain.setTargetAtTime(1, A.ctx.currentTime, 0.3);
    this.startChapter(this.chapter, { spawn: true, fade: 1.2 });
  },

  // ----- the ending -------------------------------------------------------------------------
  ending() { this._ending().catch(e => { if (!(e instanceof Abort)) console.error(e); }); },
  async _ending() {
    const f = this.flags; if (f.ended) return; f.ended = true;
    const run = ++this.run; for (const w of this.waits) w.rej(new Abort()); this.waits = [];
    UI.objective(null); UI.clearHint(); UI.setPrompt(null);
    P.setMode('cine'); P.cine = { pos: G.camera.position.clone(), look: V3(-1, 1.15, 0), k: 2 };
    P.setFlash(false);
    A.play('chain', { pos: W.chain.anchor, gain: 0.5 }); W.setChain(false);
    await this.wait(0.8);
    W.doors.front.speed = 0.7; W.doors.front.set(1); A.play(sfx('sfx_creak', 'creakLong'), { pos: W.anchors.frontIn, gain: 0.5 });
    W.momFigure.visible = true; G.camera.layers.enable(LAYER_OUTSIDE);
    L.warm.color.set(0xffd9a8); L.warm.distance = 7; L.warm.position.set(-2.2, 1.7, 0.1); L.warm.intensity = 0; // morning behind her
    Post.bloom.strength = 0.9;
    const t0 = G.time;
    await this.until(() => { L.warm.intensity = Math.min(14, (G.time - t0) * 5); return G.time - t0 > 2.5; });
    if (run !== this.run) return;
    this.lineNow('m_real4', { style: 'clean', pos: V3(-0.6, 1.2, 0), who: 'MOM' });
    P.cine = { pos: V3(0.45, 1.12, 0), look: V3(-1, 1.05, 0), k: 0.9 };
    await this.wait(2.6);
    P.cine = { pos: V3(-0.25, 1.0, 0), look: V3(-1.2, 1.0, 0), k: 0.7 };
    const end = $('#ending'), cards = $('#endCards');
    end.classList.remove('dark'); end.style.opacity = '0'; end.hidden = false; end.style.transition = 'opacity 2.4s, background 3s, color 3s';
    setTimeout(() => (end.style.opacity = '1'), 40);
    A.play('stingSoft', { gain: 0.2, rate: 2 });
    await this.wait(3);
    G.state = 'ending'; UI.showHud(false); Save.chapter = 0;
    A.setTension(0); A.setRain(0);
    const card = async (text, hold, cls = '') => {
      cards.innerHTML = `<div class="card ${cls}">${text}</div>`; const c = cards.firstChild;
      await sleep(40); c.classList.add('on');
      await sleep(hold * 1000); c.classList.remove('on'); await sleep(2300);
    };
    await card('6:07 AM', 2.6);
    await card('mom came home.', 3);
    end.classList.add('dark');
    await card('she works nights again on thursday.', 4.2, 'hand');
    cards.innerHTML = '<div class="card" style="font-size:clamp(40px,7vw,86px);letter-spacing:.28em">LATCHKEY</div>';
    await sleep(40); cards.firstChild.classList.add('on');
    await sleep(4200);
    this.knockAt(V3(0, 1.2, -1.5), 1, 1);
    await sleep(2600);
    A.line('e_thursday', { style: 'near', pos: V3(0.25, 1.2, -0.3) });
    await sleep(3200);
    $('#credits').classList.add('on');
  },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// make her face land exactly at a point (used for the peephole, closet, bed and jump scares)
Stalker.putHeadAt = function (target, yaw) {
  for (let k = 0; k < 2; k++) {
    this.yaw = yaw; this.group.rotation.y = yaw; this.group.position.copy(this.pos);
    this.animate(0.016, G.time, 0);
    this.group.updateMatrixWorld(true);
    this.headWorld.setFromMatrixPosition(this.parts.head.matrixWorld);
    _v2.setFromMatrixPosition(this.parts.face.matrixWorld);
    this.pos.add(_v1.copy(target).sub(_v2));
  }
  this.group.position.copy(this.pos);
};

// ---------------------------------------------------------------------------
// the eleven hours
// ---------------------------------------------------------------------------
const CHAPTERS = [
  { // 3:00 — wake up, the phone, the note
    clock: [3, 0], spawn: [3.75, -3.15, yawTo(3.75, -3.15, 4.2, -0.66)],
    setup() { P.hasFlashlight = false; P.flashOn = false; W.setFlashlightProp(true); },
    async run() {
      const S = this, f = S.flags;
      Post.fadeTo(1, 0); UI.showHud(false);
      A.startAmbience(); A.startRing(W.anchors.phone);
      await S.wait(1.2);
      UI.timecard('3:00 AM', 3.4);
      await S.wait(3.6);
      P.setMode('cine'); P.cine = { pos: V3(3.02, 0.66, -3.78), look: V3(3.3, 2.7, -3.0), k: 60 };
      P.eyesClosed = 1; P.eyesScripted = true; P.canClose = false;
      await S.wait(0.2);
      Post.fadeTo(0, 2.5);
      const e0 = G.time;
      await S.until(() => { const k = (G.time - e0) / 3.2; P.eyesClosed = 1 - smooth(0, 1, k) + Math.max(0, Math.sin(k * 9)) * 0.25 * (1 - k); return k >= 1; });
      P.eyesClosed = 0; P.eyesScripted = false; P.canClose = true;
      await S.wait(1.2);
      UI.thought('...the phone?', 3);
      await S.wait(2.2);
      P.cine = { pos: V3(3.25, 1.0, -3.45), look: V3(4.6, 0.9, -1.0), k: 1.5 };
      await S.wait(2.0);
      P.cine = { pos: V3(3.75, 1.18, -3.15), look: V3(4.25, 1.1, -0.66), k: 2.2 };
      await S.wait(1.4);
      P.teleport(3.75, -3.15, yawTo(3.75, -3.15, 4.25, -0.66), -0.05); P.setMode('free');
      UI.showHud(true);
      UI.objective('answer the phone');
      UI.hint('<span><kbd>W A S D</kbd>move</span><span><kbd>mouse</kbd>look</span><span><kbd>E</kbd>use</span><span><kbd>shift</kbd>run</span>', 9);
      const gate = addCollider(3.8, -0.78, 4.65, -0.62, 'gate');
      S._gate = gate;
      await S.until(() => P.hasFlashlight);
      gate.on = false;
      UI.hint('<span><kbd>F</kbd>/<kbd>right click</kbd>flashlight</span><span>hold <kbd>space</kbd>close your eyes</span>', 9);
      await S.until(() => f.phoneAnswered);
      await S.momCall();
      UI.objective("read mom's note on the fridge");
      await S.until(() => f.noteRead);
      UI.objective(null);
      await S.until(() => f.noteClosed);
      await S.wait(2.5);
      // somewhere out in the storm, a woman screams
      W.lightningNow(0.9, 1.0);
      await S.wait(2.4);
      const far = V3(4.4, 3.5, 15);
      A.play(sfx('sfx_scream_far', 'shriek'), { pos: far, gain: 1.6, muffle: 2600, reverb: 0.7, ref: 4, roll: 0.5 });
      A.play(sfx('sfx_scream_far', 'shriek'), { pos: far, gain: 1.2, muffle: 2000, reverb: 0.7, ref: 4, roll: 0.5, when: 0.85, rate: 0.86 });
      await S.wait(2.2);
      UI.thought("...someone's screaming outside.", 4);
      await S.wait(6);
    },
  },
  { // 3:09 — the phone rings again
    clock: [3, 9], spawn: [7.4, 1.9, yawTo(7.4, 1.9, 1.42, 0.42)],
    setup() { nightState(1); },
    async run() {
      const S = this, f = S.flags, mach = W.anchors.machine;
      UI.timecard('3:09 AM');
      A.startAmbience(); A.setTension(0.1);
      await S.wait(3);
      UI.thought("it's so dark. mom left candles out for me.", 4);
      await S.wait(2.5);
      UI.objective('find the matches (kitchen drawer)');
      await S.until(() => f.gotMatches, 45);
      // the phone rings while you light them
      await S.until(() => W.litCount() >= 1, 10);
      A.startRing(W.anchors.phone); f.ringing = true; S.baseFear = 0.25; A.setTension(0.3);
      await S.wait(2.2);
      UI.thought('...mom again?', 3);
      await S.wait(4);
      UI.thought("she said she won't call twice.", 4);
      await S.until(() => f.answered, 19);
      if (f.answered) throw new Abort();
      A.stopRing(); f.ringing = false;
      // the machine picks up. Mom's old greeting, from before
      W.machineMode = 'rec'; A.play('click', { pos: mach, gain: 0.6, rate: 0.8 });
      await S.wait(0.6);
      await S.say('m_machine', { style: 'machine', pos: mach, who: 'THE ANSWERING MACHINE', gap: 0.25 });
      A.play('mwBeep', { pos: mach, gain: 0.6, rate: 0.55 });
      await S.wait(1.4);
      S.keep(A.play('staticLoop', { loop: true, pos: mach, gain: 0.06, reverb: 0.1 }));
      await S.wait(2.4);
      A.play(sfx('sfx_breath', 'gIn'), { pos: mach, gain: 0.8, muffle: 2800 });
      await S.wait(2.6);
      S.baseFear = 0.45; A.setTension(0.5);
      await S.say('x_machine', { style: 'machine', pos: mach, who: 'THE ANSWERING MACHINE', wrong: 0.3, gap: 0.8 });
      await S.say('e_machine_laugh', { style: 'machine', pos: mach, gap: 0.3 });
      S.stopSounds(0.1);
      A.play('click', { pos: mach, gain: 0.6 });
      W.machineMode = 'msg'; A.setTension(0.25); S.baseFear = 0.2;
      await S.wait(1.6);
      UI.thought('...how does it know where i am?', 4.5);
      await S.wait(3);
      // finish the candles (if you never found the matches, the night goes on without them)
      if (f.gotMatches && W.litCount() < 3) { UI.objective(`light the candles (${W.litCount()}/3)`); await S.until(() => W.litCount() >= 3, 45); }
      UI.objective(null);
      S.litMask = W.candles.map(c => c.lit); // the rest of the night keeps the ones you lit
      await S.wait(2.5);
      // one more ring. just the one.
      const b = A.play('bell', { pos: W.anchors.phone, gain: 0.55, reverb: 0.3, ref: 1.2 });
      await S.wait(0.7); b && b.stop(0.05);
      await S.wait(6);
    },
  },
  { // 3:17 — the knocking
    clock: [3, 17], spawn: [8.1, 2.15, 0],
    setup() { nightState(2); },
    async run() {
      const S = this, f = S.flags;
      // she waits while you're at the peephole (that scene speaks for itself)
      const door = async (id, o) => { await S.until(() => !S.peepLocked); await S.doorSay(id, o); };
      UI.timecard('3:17 AM');
      A.startAmbience(); A.setTension(0.12);
      await S.wait(2);
      UI.thought('mom always checks the windows when it storms.', 4);
      UI.objective('check the window locks (0/3)');
      await S.wait(5);
      f.knocking = true; W.setUnderDoor(1, 1); S.baseFear = 0.3; A.setTension(0.3);
      S.knock(1);
      await S.wait(2.6);
      await door('x_knock1', { wrong: 0.05 });
      await S.wait(0.6);
      UI.thought('mom?', 2.5);
      await S.wait(2.2);
      await door('x_knock2', { wrong: 0.1 });
      await S.wait(1.4);
      UI.thought('...mom has a key.', 3.5);
      await S.wait(4);
      await S.until(() => !S.peepLocked);
      S.knock(2, 1.25, 0.85);
      await S.wait(2.6);
      await door('x_knock3', { wrong: 0.3 });
      await S.wait(5.5);
      await S.until(() => !S.peepLocked);
      S.pound(7, 0.3, 1.4); P.addShake(0.15); S.baseFear = 0.55; A.setTension(0.65);
      await S.wait(2.2);
      await door('e_knock4', { gain: 1.3 });
      A.play('chain', { pos: W.chain.anchor, gain: 0.6 });
      await S.wait(2.5);
      W.under.show = 1; A.play(sfx('sfx_scratch', 'scratch'), { pos: _v1.set(0.05, 0.05, 0), gain: 1.1, reverb: 0.25 });
      await S.wait(2.6);
      A.play(sfx('sfx_scratch', 'scratch'), { pos: _v1.set(0.05, 0.05, 0.15), gain: 1.0, reverb: 0.25, rate: 0.85 });
      await S.wait(2.6);
      W.under.show = 0; W.setUnderDoor(1, 0); A.setTension(0.25);
      await S.wait(5);
      // nails, slowly, from the top of the door to the bottom
      A.play(sfx('sfx_scratch', 'scratch'), { pos: _v1.set(-0.05, 1.7, 0), gain: 0.9, rate: 0.6, reverb: 0.4 });
      await S.wait(5);
      f.knocking = false; f.knockDone = true; S.baseFear = 0.15;
      if (f.lock_kitchen) { // you already checked it: she taps on the glass from wherever you are
        A.hush(3);
        await S.wait(1.2);
        A.play(sfx('sfx_tap', 'click'), { pos: V3(9.3, 1.7, 6.16), gain: 1.5, reverb: 0.35 });
        await S.wait(2.4);
        UI.thought("...we're on the second floor.", 4);
        await S.wait(3);
      }
      // the windows still need checking (the kitchen one waits for you)
      if (!(f.lock_bed && f.lock_living && f.lock_kitchen)) UI.objective(`check the window locks (${['bed', 'living', 'kitchen'].filter(k => f['lock_' + k]).length}/3)`);
      await S.until(() => f.lock_bed && f.lock_living && f.lock_kitchen, 45);
      await S.until(() => !f.tapRunning);
      UI.objective(null);
      await S.wait(5);
    },
  },
  { // 3:33 — the music box
    clock: [3, 33], spawn: [1.2, 0.0, -Math.PI / 2],
    setup() { nightState(3); W.setMusicBox('tub', true); W.doors.bath.set(0.25, true); },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('3:33 AM');
      A.startAmbience(); A.play('whoomp', { gain: 0.5 }); Post.glitch = 0.5;
      await S.wait(3.5);
      A.startMusicBox(W.anchors.tub, { warp: 0.65, muffle: 700, gain: 0.6 });
      await S.wait(1.5);
      UI.thought('...my music box?', 3.5);
      await S.wait(2.5);
      UI.objective('close the music box');
      S.baseFear = 0.2; A.setTension(0.3);
      await S.until(() => f.musicBoxClosed, 75);
      if (!f.musicBoxClosed) { // it played to the end, and she came to listen
        A.stopMusicBox(true); UI.objective(null);
        await S.wait(1.5);
        await S.say('e_song', { style: 'near', pos: S.earBehind(), gap: 0 });
        S.kill('song'); throw new Abort();
      }
      UI.objective(null); A.setTension(0.2);
      await S.wait(1.2);
      // whoever was listening didn't like that
      await S.say('e_song', { style: 'room', pos: W.anchors.tub, gap: 0.2 });
      W.doors.bath.speed = 0.5; W.doors.bath.set(0.3); A.play(sfx('sfx_creak', 'creakDoor'), { pos: W.anchors.bathDoor, gain: 0.8 });
      P.kick(0.6);
      await S.wait(1.5);
      S.mirrorArmed = true;
      await S.until(() => f.mirrorDone || P.room !== 'bath', 40);
      S.mirrorArmed = false;
      if (!f.mirrorDone) W.setBlood(1);
      await S.wait(f.mirrorDone ? 4.5 : 1);
    },
  },
  { // 3:51 — she is in the hall
    clock: [3, 51], spawn: [8.0, -1.7, Math.PI],
    setup() { nightState(4); },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('3:51 AM');
      A.startAmbience(); A.setTension(0.2);
      await S.until(() => (P.room === 'hall' && P.pos.x < 9.6) || S.elapsed() > 28);
      A.hush(3, 0.04); // the house holds its breath
      await S.wait(1.4);
      W.setHall('flicker'); A.play('whoomp', { gain: 0.4 });
      await S.wait(0.9);
      W.setHall('on');
      const sx = P.pos.x > 4 ? 0.75 : 10.3;
      Stalker.place(sx, 0, sx < 5 ? Math.PI / 2 : -Math.PI / 2); Stalker.show('stalk'); Stalker.look = P.pos; Stalker.tilt = 0.62;
      Stalker.data = { phase: 'approach', stare: 0, jump: 1.2 };
      A.play('stingSoft', { gain: 0.5 }); A.setTension(0.75); P.kick(0.65);
      if (W.litCount()) { A.play('blowout', { gain: 0.9 }); W.setCandles('out'); } // every candle in the house, at once
      await S.wait(0.5);
      UI.thought("don't look at her face.", 4);
      UI.hint('<span>hold <kbd>space</kbd>close your eyes</span>', 12);
      await S.until(() => Stalker.data.done);
      W.setHall('dying'); A.setTension(0.15); S.baseFear = 0.1;
      await S.wait(2);
      W.setHall('off');
      UI.thought('...is she gone?', 3.5);
      await S.wait(5);
    },
  },
  { // 4:05 — Mom's room
    clock: [4, 5], spawn: [7.4, 0.15, -Math.PI / 2],
    setup() {
      nightState(5);
      const s = W.sheet; s.group.visible = true; s.t = s.target = 0;
      L.warm.color.set(0x7d8fb3); L.warm.position.set(13.0, 2.1, 0.6); L.warm.distance = 4.5; L.warm.intensity = 0;
    },
    async run() {
      const S = this, f = S.flags, bed = W.anchors.momBed;
      const room = { style: 'room', pos: bed, who: "MOM'S ROOM" };
      UI.timecard('4:05 AM');
      A.startAmbience(); A.setTension(0.12);
      await S.wait(6);
      // her door unlatches by itself and swings open
      W.doors.mom.speed = 0.35; W.doors.mom.set(0.6); A.play(sfx('sfx_creak', 'creakLong'), { pos: W.anchors.momDoor, gain: 1.2 });
      L.warm.intensity = 1.7;
      f.momOpen = true; S.baseFear = 0.3; A.setTension(0.3);
      await S.wait(3.5);
      await S.say('x_room1', { ...room, wrong: 0.1 });
      await S.wait(0.8);
      UI.thought('...mom?', 3);
      await S.wait(3);
      await S.say('x_room2', { ...room, wrong: 0.15 });
      await S.wait(1.2);
      UI.thought("mom's at the hospital. she said so.", 4);
      await S.wait(4.2);
      UI.thought("i have to lock her door. the spare key's in the kitchen drawer.", 5);
      UI.objective('get the spare key (kitchen drawer)');
      // she keeps begging while you look for it
      let begging = true;
      (async () => {
        await S.wait(7);
        await S.say('x_room3', { ...room, wrong: 0.25 });
        begging = false;
      })().catch(e => { if (!(e instanceof Abort)) console.error(e); });
      if (!(await S.until(() => f.hasKey, 35))) { UI.thought('the spare key. the kitchen drawer.', 4); await S.until(() => f.hasKey); }
      // the key is in your hand. now you have to walk up to her door
      await S.until(() => !begging);
      await S.until(() => P.room === 'hall' && P.pos.x > 8.6, 40);
      A.hush(2.5, 0.05);
      await S.wait(0.6);
      await S.say('x_room4', { ...room, wrong: 0.45 });
      await S.wait(1.6);
      // then the sheet sits up
      A.setTension(0.65); S.baseFear = 0.5;
      W.sheet.target = 1; A.play(sfx('sfx_sheets', 'rustle'), { pos: bed, gain: 1.3 }); A.play(sfx('sfx_bones', 'crack'), { pos: bed, gain: 1.2, when: 0.7 });
      await S.wait(2.4);
      await S.say('e_room5', { ...room });
      await S.wait(0.4);
      await S.say('e_room_laugh', { ...room, who: '', gap: 0.05 });
      // the door slams in your face
      f.momOpen = false; f.momShut = true;
      W.doors.mom.speed = 9; W.doors.mom.slam(); A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.momDoor, gain: 1.5 }); A.play('bang', { pos: W.anchors.momDoor, gain: 0.8 });
      P.addShake(0.35); P.kick(0.85); L.warm.intensity = 0;
      await S.wait(1);
      W.sheet.group.visible = false; A.setTension(0.4); S.baseFear = 0.35;
      UI.objective('lock it. now.');
      // something drags itself across the floor toward the door
      A.play(sfx('sfx_drag', 'drag'), { pos: V3(12.4, 0.1, 0.3), gain: 1.1, muffle: 1500, when: 0.8 });
      if (!(await S.until(() => f.locked, 9))) {
        W.doors.mom.jitter = 0.6; A.play('click', { pos: W.anchors.momDoor, gain: 0.8, rate: 0.55 }); P.addShake(0.12);
        UI.thought('lock it. LOCK IT.', 3);
        await S.until(() => f.locked);
      }
      UI.objective(null); A.setTension(0.25); S.baseFear = 0.2;
      await S.wait(1.6);
      // the handle turns from the inside. the lock holds.
      W.doors.mom.jitter = 0.5; A.play('click', { pos: W.anchors.momDoor, gain: 0.6, rate: 0.6 }); A.play('click', { pos: W.anchors.momDoor, gain: 0.5, rate: 0.5, when: 0.35 });
      await S.wait(1.5);
      UI.thought('...', 2);
      await S.wait(4);
    },
  },
  { // 4:12 — batteries, and something walking behind you
    clock: [4, 12], spawn: [7.0, 0, Math.PI / 2],
    setup() { nightState(6); },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('4:12 AM');
      A.startAmbience(); A.setTension(0.15);
      await S.wait(2);
      P.dyingBattery = true;
      await S.wait(2.5);
      UI.thought('no no no... the batteries.', 3.5);
      await S.wait(1.5);
      UI.objective('get batteries from the kitchen drawer');
      await S.until(() => f.gotBatteries);
      UI.objective(null);
      P.dyingBattery = false; P.setFlash(true);
      W.setRain(0.35); A.setTension(0.35);
      await S.wait(1.2);
      UI.thought('okay. okay. back to my room.', 3.5);
      UI.objective('go back to your room');
      // the moment you walk away from the counter, she is behind you
      await S.until(() => P.speed2D > 0.4 && P.moveDir.x < -0.35 && Math.hypot(P.pos.x - 10.3, P.pos.z - 2.35) > 1.25);
      f.following = true;
      Stalker.show('follow'); Stalker.tilt = 0.5;
      Stalker.data.ang = Math.atan2(-P.moveDir.x, -P.moveDir.z);
      Stalker.place(P.pos.x + Math.sin(Stalker.data.ang) * 1.05, P.pos.z + Math.cos(Stalker.data.ang) * 1.05, Stalker.data.ang + Math.PI);
      A.play('heel', { pos: Stalker.pos, gain: 1 });
      W.setTV('cam'); A.play('static', { pos: _v1.set(2.9, 0.8, 1.3), gain: 0.5 });
      await S.wait(1.2);
      S.handShow = 1;
      await S.say('x_follow1', { style: 'near', pos: S.earBehind(), who: 'BEHIND YOU', gain: 1.1 });
      S.handShow = 0;
      UI.thought("don't turn around. keep walking.", 5);
      UI.objective("go back to your room. don't turn around.");
      A.setTension(0.6); S.baseFear = 0.55;
      if (A.buf.sfx_whispers) S.keep(A.play('sfx_whispers', { loop: true, gain: 0.07, reverb: 0.2 }));
      (async () => {
        const behind = { style: 'near', who: 'BEHIND YOU' };
        await S.wait(4.5); S.handShow = 1; await S.say('x_follow2', { ...behind, pos: S.earBehind(), wrong: 0.2 }); S.handShow = 0;
        await S.wait(5); S.handShow = 1; await S.say('x_follow3', { ...behind, pos: S.earBehind(), wrong: 0.3 }); S.handShow = 0;
        await S.wait(5); await S.duo('x_follow5', 'e_follow5', { ...behind, pos: S.earBehind(), gain: 1.2 }); P.addShake(0.2);
        await S.wait(6); S.handShow = 1; await S.say('e_name', { ...behind, pos: S.earBehind() }); S.handShow = 0;
      })().catch(e => { if (!(e instanceof Abort)) console.error(e); });
      await S.until(() => P.room === 'bedroom' && P.pos.z < -1.15);
      f.following = false; S.handShow = 0; S.stopSounds(0.4);
      W.doors.bed.slam(); A.play(sfx('sfx_slam', 'slam'), { pos: _v1.set(4.2, 1.2, -0.66), gain: 1.3 }); P.addShake(0.35);
      Stalker.hide(); W.setTV('off');
      A.setTension(0.12); S.baseFear = 0.1;
      await S.wait(2.4);
      UI.thought('...', 2);
      await S.wait(3);
    },
  },
  { // 4:23 — on the ceiling
    clock: [4, 23], spawn: [4.6, -2.0, yawTo(4.6, -2.0, 3.4, -3.0)],
    setup() { nightState(7); W.doors.bed.set(0, true); },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('4:23 AM');
      A.startAmbience(); A.setTension(0.1);
      await S.wait(6.5);
      // something heavy is moving inside the ceiling, coming from the hall
      f.ceiling = true; S.baseFear = 0.35; A.setTension(0.45); A.hush(6, 0.05);
      const crawl = (x, z, g = 1.3) => {
        A.play(sfx('sfx_crawl', 'drag'), { pos: V3(x, H + 0.05, z), gain: g, muffle: 1700, reverb: 0.3, rate: rand(0.85, 1.05) });
        A.play('creakFloor', { pos: V3(x, H, z), gain: 0.4, muffle: 1300 });
      };
      const route = [[4.2, 0.2], [4.2, -0.7], [4.4, -1.3], [4.3, -1.9], [4.0, -2.4], [3.6, -2.8], [3.2, -3.0], [4.6, -3.4], [5.2, -2.6]];
      for (let i = 0; i < 3; i++) { crawl(route[i][0], route[i][1]); await S.wait(1.15); }
      UI.thought('...the ceiling.', 3);
      await S.wait(1.0);
      await S.say('e_ceiling', { style: 'room', pos: V3(P.pos.x, H, P.pos.z), muffle: 3200, who: 'ABOVE YOU', gap: 0.1 });
      UI.objective('get under your bed');
      f.mustHide = true;
      let i = 3; const deadline = G.time + 22;
      while (!f.underBed && G.time < deadline) {
        const p = i < route.length ? route[i] : [P.pos.x + rand(-0.5, 0.5), P.pos.z + rand(-0.5, 0.5)]; i++;
        crawl(p[0], p[1], 1.4);
        if (Math.random() < 0.3) A.play(sfx('sfx_bones', 'crack'), { pos: V3(p[0], H, p[1]), gain: 0.9, muffle: 2000 });
        await S.until(() => f.underBed, rand(1.3, 2.1));
      }
      if (!f.underBed) { S.kill('ceiling'); throw new Abort(); }
      await S.until(() => P.mode === 'bed');
      A.setTension(0.5);
      await S.wait(2.5);
      crawl(3.3, -3.0, 1.5);
      await S.wait(1.6);
      // she comes down: something heavy drops by the window
      A.play(sfx('sfx_thud', 'thump'), { pos: V3(5.0, 0.2, -3.5), gain: 1.6, reverb: 0.3 }); A.play(sfx('sfx_bones', 'crack'), { pos: V3(5.0, 0.6, -3.5), gain: 1.2, when: 0.35 });
      P.addShake(0.3); P.kick(0.85);
      Stalker.place(5.0, -3.55, -Math.PI / 2 - 0.6); Stalker.show('hunt'); Stalker.tilt = 0.85; Stalker.look = null;
      Stalker.data = { stage: 'bed' };
      A.setTension(0.75); S.baseFear = 0.6;
      UI.thought("don't look. don't look.", 3.5);
      await S.wait(2.4);
      const go = (x, z, sp = 0.7) => new Promise(res => Stalker.walkTo(x, z, sp, S.cb(res)));
      await go(5.15, -2.2, 0.65);
      A.play('sniff', { pos: Stalker.headWorld, gain: 0.8 });
      await S.wait(1.6);
      await go(3.98, -2.95, 0.55); // right in front of the gap
      Stalker.yaw = -Math.PI / 2;
      await S.wait(1.2);
      // she folds in half to look under the bed
      A.play(sfx('sfx_bones', 'crack'), { pos: V3(3.95, 0.9, -2.95), gain: 1.4 });
      S._foldTarget = V3(3.62, 0.085, -3.06);
      Stalker.pose = 'fold'; Stalker.data.fold = true;
      // a little night-light reaches the floor: just enough to see the paper face
      L.warm.color.set(0x9aa8c8); L.warm.position.set(3.95, 0.18, -3.3); L.warm.distance = 1.4; L.warm.intensity = 0.9;
      await S.wait(1.3);
      f.facing = true; f.peek = 0;
      UI.hint('<span>hold <kbd>space</kbd>keep your eyes shut</span>', 0);
      await S.say('e_bed1', { style: 'near', pos: S._foldTarget, who: 'UNDER THE BED', gain: 1.15 });
      await S.wait(1.4);
      A.play(sfx('sfx_breath', 'gIn'), { pos: S._foldTarget, gain: 1.2 });
      await S.wait(2.2);
      await S.say('e_bed2', { style: 'near', pos: S._foldTarget, who: '', gain: 1.15 });
      await S.wait(2.4);
      A.play(sfx('sfx_breath', 'gOut'), { pos: S._foldTarget, gain: 1.2 });
      await S.wait(2.8);
      f.facing = false; Stalker.data.fold = false; Stalker.pose = 'walk';
      L.warm.intensity = 0; L.warm.distance = 6; L.warm.color.set(0xffc890);
      A.play(sfx('sfx_bones', 'crack'), { pos: V3(3.95, 0.9, -2.95), gain: 1.1 });
      UI.clearHint();
      await S.wait(1.2);
      await go(4.22, -1.15, 0.7);
      W.doors.bed.set(0.9); A.play(sfx('sfx_creak', 'creakDoor'), { pos: V3(4.22, 1.0, -0.66), gain: 0.9 });
      await go(4.22, 0.3, 0.7);
      W.doors.bed.set(0); A.play('clack', { pos: V3(4.22, 1.0, -0.66), gain: 0.5 });
      Stalker.hide(); A.setTension(0.12); S.baseFear = 0.12;
      await S.wait(3);
      UI.thought('4:24.', 3);
      f.canLeaveBed = true; UI.hint('<span><kbd>E</kbd>crawl out</span>', 0);
      await S.until(() => f.leftBed);
      UI.clearHint();
      await S.wait(2.5);
    },
  },
  { // 4:44 — hide
    clock: [4, 43], spawn: [4.25, -1.5, Math.PI],
    setup() {
      nightState(8);
      W.doors.bed.set(0, true);
      L.hall.position.set(2.4, 2.45, 0); // the lamp by the closet is the one that stutters tonight
    },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('4:43 AM');
      A.startAmbience(); A.setTension(0.12);
      await S.wait(8);
      W.setClock(4, 44); W.alarmText = '4:44'; W.updateAlarm(); W.setMicrowave('4:44'); W.setTV('444');
      for (let i = 0; i < 8; i++) A.play('alarm', { pos: _v1.set(3.88, 0.55, -3.82), gain: 0.5, when: i * 0.24 + (i >= 4 ? 0.4 : 0) });
      A.play('mwBeep', { pos: _v1.set(10.5, 1.1, 4.5), gain: 0.3, when: 0.1 }); A.play('static', { pos: _v1.set(2.9, 0.8, 1.3), gain: 0.4 });
      await S.wait(1.2);
      UI.thought('4:44.', 3);
      await S.wait(1.4);
      UI.objective('hide in the hall closet');
      f.hunt = true; S.baseFear = 0.5; A.setTension(0.85); A.startRiser();
      for (let k = 0; k < 3; k++) A.play(sfx('sfx_pound', 'pound'), { pos: W.anchors.momDoor, gain: 1.2, when: k * 0.5, reverb: 0.4 });
      W.doors.mom.jitter = 1.5; P.kick(0.8);
      await S.wait(3.2);
      for (let k = 0; k < 5; k++) A.play(sfx('sfx_pound', 'pound'), { pos: W.anchors.momDoor, gain: 1.3, when: k * 0.38, reverb: 0.4 });
      W.doors.mom.jitter = 2;
      await S.wait(2.6);
      A.hush(1.0, 0.03); // a breath of silence
      await S.wait(1.2);
      // the door bursts open
      W.doors.mom.speed = 9; W.doors.mom.set(1); A.play('bang', { pos: W.anchors.momDoor, gain: 1 }); P.addShake(0.4); P.kick(0.9);
      W.setHall('flicker');
      Stalker.place(11.5, 0, -Math.PI / 2); Stalker.show('hunt'); Stalker.tilt = 0.8; Stalker.look = null;
      Stalker.data = { stage: 'out' };
      f.out = true;
      await S.wait(2);
      // her route through the apartment
      const go = (x, z, sp = 0.8) => new Promise(res => Stalker.walkTo(x, z, sp, S.cb(res)));
      const search = async (sec, lookX, lookZ) => { Stalker.look = V3(lookX, 0, lookZ); A.play('sniff', { pos: Stalker.headWorld, gain: 0.7 }); await S.wait(sec); Stalker.look = null; };
      await go(8.0, 0.0); await go(8.0, -1.55, 0.7); await search(2.5, 8.0, -2.6); await go(8.0, 0.0, 0.8);
      await go(4.25, 0.0, 0.8);
      if (!f.inCloset) { await go(4.3, -1.6, 0.8); await search(2, 4.6, -3.0); await go(4.25, 0, 0.8); await go(5.7, 1.6, 0.8); await search(2.5, 3.5, 3.0); }
      while (!f.inCloset) await go(P.pos.x, P.pos.z, 0.95); // nowhere else is safe
      await S.until(() => f.inCloset);
      // the closet: she comes to the slats
      Stalker.data.stage = 'closet';
      await go(2.4, 0.05, 0.75);
      await go(1.52, 0.2, 0.55);
      Stalker.look = V3(1.52, 0, -1); await S.wait(1.0);
      A.play('sniff', { pos: _v1.set(1.5, 1.3, -0.4), gain: 0.9 });
      Stalker.pose = 'peer'; S._peerTarget = V3(1.53, 1.1, -0.5); Stalker.data.peer = true;
      W.setHall('flicker');
      await S.wait(1.6);
      S.lineNow('e_closet2', { style: 'near', pos: V3(1.45, 1.1, -0.55), who: '' });
      await S.wait(1.4);
      // fingers through the louvers
      W.slatFingers.show = 1; A.play(sfx('sfx_scratch', 'scratch'), { pos: V3(1.38, 1.0, -0.62), gain: 0.7, rate: 1.2 });
      await S.wait(3.0);
      A.play('sniff', { pos: _v1.set(1.3, 1.2, -0.45), gain: 1 });
      await S.wait(1.4);
      W.slatFingers.show = 0;
      Stalker.data.peer = false; Stalker.pose = 'walk';
      A.play(sfx('sfx_bones', 'crack'), { pos: V3(1.5, 1.2, -0.3), gain: 0.9 });
      await S.wait(0.8);
      await go(5.7, 0, 0.8);
      W.setHall('dying');
      await go(10.3, 0, 0.9);
      await go(11.8, 0, 0.9);
      W.doors.mom.speed = 6; W.doors.mom.slam(); A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.momDoor, gain: 1.1 });
      Stalker.hide(); A.stopRiser(1.5); A.setTension(0.12); S.baseFear = 0.1; W.setHall('off');
      W.alarmText = null; W.setClock(4, 45); W.setMicrowave(null); W.setTV('off');
      await S.wait(2.5);
      UI.thought('4:45.', 3);
      await S.wait(1.5);
      f.canLeaveCloset = true;
      UI.hint('<span><kbd>E</kbd>leave the closet</span>', 0);
      await S.until(() => f.leftCloset);
      UI.clearHint();
      await S.wait(2);
    },
  },
  { // 5:13 — she runs
    clock: [5, 13], spawn: [1.35, -0.1, -Math.PI / 2],
    setup() { nightState(9); W.doors.bed.set(0.92, true); },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('5:13 AM');
      A.startAmbience(); A.setTension(0.12);
      await S.wait(3);
      UI.thought('my throat hurts. i need some water.', 4);
      await S.wait(1.5);
      UI.objective('get a glass of water (bathroom sink)');
      if (!(await S.until(() => f.water, 40))) { UI.thought('water. the bathroom sink.', 3.5); await S.until(() => f.water); }
      await S.wait(3.2);
      // three slow knocks at the far end of the hall: from inside Mom's room
      A.hush(5, 0.04);
      await S.wait(0.8);
      S.knockAt(V3(11.2, 1.3, 0), 1, 1.1);
      await S.wait(2.6);
      UI.thought("...that came from mom's room.", 3.5);
      await S.wait(1.5);
      // and the way back to your room goes past her door
      UI.objective('go back to your room');
      await S.until(() => P.room !== 'bath', 25);
      W.setHall('flicker'); A.play('whoomp', { gain: 0.6 });
      await S.wait(0.9);
      W.setHall('on');
      // her door bursts open
      W.doors.mom.speed = 10; W.doors.mom.set(1); A.play('bang', { pos: W.anchors.momDoor, gain: 1.2 }); A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.momDoor, gain: 1.1 });
      A.play(sfx('sfx_shriek', 'shriek'), { pos: W.anchors.momDoor, gain: 1.4, reverb: 0.4 });
      Stalker.place(11.4, 0, -Math.PI / 2); Stalker.show('chase'); Stalker.tilt = 0.95; Stalker.pose = 'reach'; Stalker.poseK = 1; Stalker.look = P.pos;
      P.kick(1); P.addShake(0.3); S.baseFear = 0.95; A.setTension(1); A.startRiser();
      UI.objective('RUN. get to your room.');
      await S.wait(1.8); // she stands in her doorway, twitching, for one long breath
      f.chase = true;
      A.play(sfx('sfx_run', 'heel'), { pos: V3(10.5, 0.1, 0), gain: 1.4 });
      await S.until(() => P.room === 'bedroom' && P.pos.z < -0.9);
      f.chase = false; Stalker.path = null; Stalker.hide(); A.stopRiser(0.4);
      // slam it and hold it
      W.doors.bed.speed = 12; W.doors.bed.slam(); A.play(sfx('sfx_slam', 'slam'), { pos: V3(4.22, 1.1, -0.66), gain: 1.4 }); P.addShake(0.3);
      P.teleport(4.22, -1.02, Math.PI, -0.05); P.setMode('door', { center: Math.PI, range: 0.8, pitch: 0.6 });
      UI.objective('hold the door'); UI.hint('<span>hold <kbd>E</kbd>or the mouse button: hold the door shut</span>', 0);
      S.hold = { level: 1, let: 0 }; f.holding = true;
      const dpos = V3(4.22, 1.25, -0.45);
      const hit = (g = 1.5) => { A.play(sfx('sfx_pound', 'pound'), { pos: dpos, gain: g, reverb: 0.3, ref: 1.6 }); W.doors.bed.jitter = 0.22; P.addShake(0.24); };
      await S.wait(0.9);
      for (let k = 0; k < 3; k++) { hit(); await S.wait(0.75 + rand(0, 0.3)); }
      await S.duo('x_chase', 'e_chase', { style: 'door', pos: dpos, open: 1, who: 'BEHIND THE DOOR', gain: 1.25 });
      for (let k = 0; k < 4; k++) { hit(1.6); await S.wait(0.45 + rand(0, 0.25)); }
      // she drags it open a crack against you, and her fingers come round the edge
      S.hold.crack = 0.055; W.edgeFingers.show = 1; A.play(sfx('sfx_scratch', 'scratch'), { pos: V3(4.66, 1.1, -0.66), gain: 1.2 });
      A.play(sfx('sfx_creak', 'creakDoor'), { pos: V3(4.4, 1.1, -0.66), gain: 0.7, rate: 1.4 });
      await S.wait(2.0);
      await S.say('x_door1', { style: 'door', pos: dpos, open: 1, who: 'BEHIND THE DOOR', wrong: 0.3 });
      W.edgeFingers.show = 0; S.hold.crack = 0;
      for (let k = 0; k < 3; k++) { hit(1.7); await S.wait(0.6); }
      await S.wait(2.5);
      // quiet. then, right at the crack
      await S.say('e_name', { style: 'near', pos: V3(4.4, 1.15, -0.62), who: '' });
      await S.wait(1.8);
      A.play(sfx('sfx_drag', 'drag'), { pos: V3(5.6, 0.1, 0), gain: 1 });
      await S.wait(2.4);
      A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.momDoor, gain: 0.8 });
      f.holding = false; S.hold = null; UI.setBreath(false, 1); UI.clearHint(); UI.objective(null);
      W.doors.bed.set(0); P.setMode('free');
      A.setTension(0.1); S.baseFear = 0.1;
      await S.wait(2);
      UI.thought('...', 2);
      await S.wait(4.5);
    },
  },
  { // 5:52 — dawn
    clock: [5, 52], spawn: [1.3, -0.25, Math.PI],
    setup() {
      nightState(10);
      W.setRain(0); W.setSky('predawn'); W.lightning.auto = false; W.corrFlicker = 0.006;
    },
    async run() {
      const S = this, f = S.flags;
      UI.timecard('5:52 AM');
      A.startAmbience(); A.setRain(0); A.setTension(0.08);
      await S.wait(2.5);
      UI.thought('it stopped raining.', 3);
      await S.wait(2.5);
      UI.thought("i want to see the sky. i'll open the curtains.", 4);
      UI.objective('open the curtains (0/2)');
      await S.until(() => W.curtainsOpen('bed') && W.curtainsOpen('living'), 40);
      UI.objective('wait for the sun');
      await S.wait(7);
      // someone knocks
      f.knocked = true; A.hush(3, 0.05);
      S.knock(1, 1.0);
      await S.wait(2.8);
      f.fakeMom = true; S.baseFear = 0.35; A.setTension(0.4);
      await S.doorSay('x_dawn1');
      await S.wait(0.6);
      UI.thought('...she knocked.', 3.5);
      await S.wait(1.8);
      await S.doorSay('x_dawn2');
      A.play('keys', { pos: W.anchors.frontOut, gain: 0.8 });
      await S.wait(1.6);
      A.play('lock', { pos: W.anchors.frontOut, gain: 0.9 });
      await S.wait(0.9);
      W.doors.front.speed = 1.5; W.doors.front.set(1); A.play(sfx('sfx_creak', 'creakDoor'), { pos: W.anchors.frontIn, gain: 0.8 }); A.play('chain', { pos: W.chain.anchor, gain: 0.9, when: 0.25 });
      W.setUnderDoor(1.3, 0.5); P.kick(0.6);
      await S.wait(1.2);
      await S.doorSay('x_dawn3', { open: 1 });
      UI.objective(null);
      await S.wait(7);
      await S.doorSay('x_knock3', { open: 1, wrong: 0.15 });
      await S.wait(6);
      await S.doorSay('x_dawn5', { open: 1, wrong: 0.3 });
      await S.wait(4);
      A.setTension(0.9); A.startRiser(); S.baseFear = 0.7;
      f.reaching = true; W.reach.show = 1;
      W.doors.front.speed = 7;
      (async () => { for (let k = 0; k < 7; k++) { W.doors.front.set(0); await S.wait(0.18); W.doors.front.set(1); A.play('chain', { pos: W.chain.anchor, gain: 1 }); A.play(sfx('sfx_pound', 'pound'), { pos: W.anchors.frontIn, gain: 0.9 }); P.addShake(0.15); await S.wait(0.5); } })().catch(() => {});
      await S.duo('x_dawn6', 'e_dawn6', { style: 'door', pos: W.anchors.frontOut, open: 1, who: 'OUTSIDE THE DOOR', gain: 1.3 });
      await S.wait(5);
      // the sun comes up
      f.reaching = false; W.reach.show = 0; f.fakeMom = false;
      W.sunrise(); A.birds = true; A.stopRiser(0.5); A.setTension(0); S.baseFear = 0.05;
      A.play(sfx('sfx_shriek', 'shriek'), { pos: W.anchors.frontOut, gain: 1, muffle: 2400, reverb: 0.6, rate: 0.85 });
      W.doors.front.speed = 9; W.doors.front.slam(); A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.frontIn, gain: 1.1, when: 0.15 });
      W.setUnderDoor(1, 0); W.setClock(6, 0);
      await S.wait(1.4);
      S.lineNow('e_soon', { style: 'door', pos: W.anchors.frontOut, who: '' });
      await S.wait(3);
      UI.thought('the sun...', 3.5);
      await S.wait(9);
      // Mom. No knock. Keys.
      W.setCorridorDay(true);
      A.play('keys', { pos: W.anchors.frontOut, gain: 0.8 });
      await S.wait(1.5);
      A.play('lock', { pos: W.anchors.frontOut, gain: 0.9 });
      await S.wait(0.9);
      W.doors.front.speed = 1.2; W.doors.front.set(1); A.play('chain', { pos: W.chain.anchor, gain: 0.7, when: 0.3 });
      await S.wait(1.2);
      await S.doorSay('m_real1', { open: 1 });
      await S.wait(0.5);
      await S.doorSay('m_real2', { open: 1 });
      f.realMom = true;
      UI.objective('take the chain off');
      await S.wait(12);
      await S.doorSay('m_real3', { open: 1 });
      A.play('keys', { pos: W.anchors.frontOut, gain: 0.6 });
      await S.until(() => f.ended);
    },
  },
];

// mouth-at-your-ear position behind the player
Story.earBehind = function () { const b = _v3.copy(P.moveDir).multiplyScalar(-0.35); return V3(P.pos.x + b.x, 1.25, P.pos.z + b.z); };

// Mom's first call (3:00)
Story.momCall = async function () {
  const S = this; S.flags.onPhone = true;
  A.stopRing(); W.setHandset(false); A.play('clack', { pos: W.anchors.phone, gain: 0.5 });
  P.setMode('phone', { center: P.yaw, range: 1.0, pitch: 0.6 });
  UI.objective(null);
  const hiss = S.keep(A.play('staticLoop', { loop: true, gain: 0.035, pan: -0.55, reverb: 0 }));
  await S.wait(0.9);
  const gaps = [0.45, 0.35, 0.45, 0.45, 0.6, 0.6, 0.5, 0.2];
  for (let i = 0; i < 8; i++) await S.say('m_call' + (i + 1), { style: 'phone', who: 'MOM · ON THE PHONE', gap: gaps[i] });
  A.play('click', { gain: 0.4, pan: -0.6, rate: 0.7 });
  hiss && hiss.stop(0.05);
  A.startDial();
  await S.wait(1.6);
  UI.thought('...mom?', 2.5);
  await S.wait(2.4);
  A.stopDial(); W.setHandset(true); A.play('clack', { pos: W.anchors.phone, gain: 0.5 });
  P.setMode('free'); S.flags.onPhone = false;
};

// ---------------------------------------------------------------------------
// per-hour rules
// ---------------------------------------------------------------------------
Story.tick0 = function () {
  if (this._gate?.on && P.room === 'bedroom' && P.pos.z > -1.25 && P.pos.x > 3.6 && P.pos.x < 4.85 && !this._gateSaid) { this._gateSaid = true; this.think("it's too dark out there. where's my flashlight?"); }
};
Story.tick1 = function () {
  if (this.flags.ringing) P.fearTarget = Math.max(P.fearTarget, 0.3);
};
Story.tick2 = function () {
  if (this.flags.knocking) P.fearTarget = Math.max(P.fearTarget, smooth(6, 0.5, P.pos.x) * 0.6);
};
Story.tick3 = function (dt) {
  const f = this.flags;
  if (A.musicBox && !f.curtainOpen) A.setMusicBoxMuffle(P.room === 'bath' ? 1100 : 550);
  else if (A.musicBox) A.setMusicBoxMuffle(P.room === 'bath' ? 18000 : 2500);
  if (this.mirrorArmed && !f.mirrorDone && P.room === 'bath' && P.mode === 'free') {
    const cam = G.camera; cam.getWorldDirection(_v1);
    const m = W.mirror.position, dir = _v2.copy(m).sub(cam.position); const dist = dir.length(); dir.normalize();
    if (dist < 2.6 && _v1.dot(dir) > 0.93) {
      f.mirrorDone = true;
      // she leans in over your shoulder: a face right beside yours, only in the glass
      const back = _v3.copy(cam.position).sub(m); back.y = 0; back.normalize();
      const side = V3(-back.z, 0, back.x).multiplyScalar(0.2);
      Stalker.show('mirror'); Stalker.group.visible = false; W.ghostInMirror = true; Stalker.tilt = 0.75;
      Stalker.pose = 'peer'; Stalker.poseK = 1;
      Stalker.place(cam.position.x + back.x * 0.9, cam.position.z + back.z * 0.9, Math.atan2(-back.x, -back.z));
      const faceAt = V3(cam.position.x + back.x * 0.32 + side.x, cam.position.y + 0.12, cam.position.z + back.z * 0.32 + side.z);
      Stalker.putHeadAt(faceAt, Math.atan2(-back.x, -back.z));
      Stalker.data.mirrorFace = faceAt;
      L.warm.color.set(0xc8d4e0); L.warm.distance = 1.2; L.warm.intensity = 0.55;
      L.warm.position.set(cam.position.x - back.x * 0.1, cam.position.y + 0.3, cam.position.z - back.z * 0.1);
      A.hush(3, 0.05); A.play('stingSoft', { gain: 0.6 }); A.play(sfx('sfx_breath', 'gIn'), { pos: faceAt, gain: 1 });
      this.lineNow('e_mirror', { style: 'near', pos: faceAt, swell: false, who: '' });
      P.kick(0.9); Post.glitch = 0.3;
      (async () => {
        await this.wait(1.8); P.flashFlicker = 0.35;
        await this.wait(0.35); W.ghostInMirror = false; Stalker.hide(); L.warm.intensity = 0; L.warm.distance = 6; L.warm.color.set(0xffc890);
        W.setBlood(1); // and she left something on the glass
        await this.wait(1.4);
        this.think('...');
      })().catch(() => {});
    }
  }
};
Story.tick4 = function (dt) {
  const S = Stalker, d = S.data;
  if (S.mode !== 'stalk' || d.done) return;
  const dist = S.distTo(P.pos), closed = P.eyesClosed > 0.85, seen = S.seenBy(G.camera, P.eyesClosed);
  S.look = P.pos;
  if (d.phase === 'approach') {
    if (closed) {
      if (!S.path || G.time - (d.repath || 0) > 0.7) {
        d.side = d.side ?? (P.pos.z > 0 ? -1 : 1);
        S.walkTo(P.pos.x, clamp(P.pos.z + d.side * 0.36, -0.45, 0.45), 0.85); d.repath = G.time;
      }
      if (dist < 0.85) {
        d.phase = 'pass'; S.path = null;
        this.lineNow('e_closet1', { style: 'near', pos: V3(P.pos.x, 1.25, P.pos.z + 0.22), who: '' });
        A.play(sfx('sfx_breath', 'gIn'), { pos: P.headPos, gain: 0.9 });
        A.play('rustle', { pos: P.headPos, gain: 0.5 }); P.kick(1);
        S.walk(navPath(S.pos.x, S.pos.z, 10.5, 0), 0.75, this.cb(() => this.stalkerIntoMom()));
      }
    } else {
      S.path = null;
      if (seen > 0.04) {
        d.stare += dt * (0.45 + seen * 1.25);
        Post.look = Math.max(Post.look, seen * 0.9 + d.stare * 0.15);
        P.fearTarget = Math.max(P.fearTarget, 0.6 + seen * 0.4);
        A.setTension(0.75 + Math.min(0.25, d.stare * 0.1));
        if (d.stare > 2.6) { this.kill('look'); return; }
      } else {
        d.stare = Math.max(0, d.stare - dt * 0.35);
        d.jump -= dt;
        if (d.jump <= 0) {
          d.jump = 1.15;
          if (dist < 1.6) { this.kill('behind'); return; }
          const pts = navPath(S.pos.x, S.pos.z, P.pos.x, P.pos.z); let left = 0.75;
          for (const p of pts) { const dx = p.x - S.pos.x, dz = p.z - S.pos.z, l = Math.hypot(dx, dz); if (l >= left) { S.pos.x += dx / l * left; S.pos.z += dz / l * left; break; } S.pos.x = p.x; S.pos.z = p.z; left -= l; }
          A.play('creakFloor', { pos: _v1.set(S.pos.x, 0.05, S.pos.z), gain: 0.35 });
        }
      }
    }
  } else if (d.phase === 'pass') {
    if (!closed && dist < 2.3) { this.kill('opened'); return; }
  }
};
Story.stalkerIntoMom = function () {
  const S = Stalker;
  W.doors.mom.set(1); A.play('creakDoor', { pos: W.anchors.momDoor, gain: 0.5 });
  S.walk([V3(12.2, 0, 0)], 0.75, this.cb(() => {
    W.doors.mom.set(0); A.play(sfx('sfx_slam', 'slam'), { pos: W.anchors.momDoor, gain: 0.7 });
    S.hide(); S.data.done = true;
  }));
};
Story.tick5 = function () {
  const f = this.flags;
  if (f.momOpen) {
    if (P.pos.x > 10.98) { this.kill('entered'); return; }
    P.fearTarget = Math.max(P.fearTarget, smooth(7.5, 10.8, P.pos.x) * 0.6);
  }
};
Story.tick6 = function (dt) {
  if (!this.flags.following) return;
  const S = Stalker, d = S.data;
  // she keeps to the arc behind you: never cuts across in front
  const want = Math.atan2(-P.moveDir.x, -P.moveDir.z);
  d.ang = (d.ang ?? want) + wrapAngle(want - (d.ang ?? want)) * (1 - Math.exp(-4 * dt));
  S.pos.x = P.pos.x + Math.sin(d.ang) * 1.05; S.pos.z = P.pos.z + Math.cos(d.ang) * 1.05;
  S.yaw = Math.atan2(P.pos.x - S.pos.x, P.pos.z - S.pos.z); S.look = P.pos;
  const seen = S.seenBy(G.camera, P.eyesClosed);
  if (seen > 0.05) { this.kill('turned'); return; }
  if (P.stillTime > 4.5 && !this.flags.stillWarn) { this.flags.stillWarn = true; this.say('x_follow6', { style: 'near', pos: this.earBehind(), who: 'BEHIND YOU' }).catch(() => {}); }
  if (P.stillTime < 1) this.flags.stillWarn = false;
  if (P.stillTime > 9) { this.kill('stopped'); return; }
  // her heels echo yours, half a beat late
  P.onStep = () => A.play('heel', { pos: _v2.set(S.pos.x, 0.05, S.pos.z), gain: 0.9, when: 0.16, reverb: 0.3 });
  P.fearTarget = Math.max(P.fearTarget, 0.55 + Math.sin(G.time * 0.7) * 0.05);
};
Story.tick7 = function (dt) {
  const f = this.flags, S = Stalker;
  if (S.group.visible && S.data.fold && this._foldTarget) S.putHeadAt(this._foldTarget, -Math.PI / 2);
  if (P.mode === 'bed') {
    P.fearTarget = Math.max(P.fearTarget, S.group.visible ? 0.75 : 0.45);
    if (f.facing) {
      if (P.eyesClosed < 0.7) { f.peek = (f.peek || 0) + dt; Post.look = Math.max(Post.look, f.peek); if (f.peek > 0.85) { this.kill('peeked'); return; } }
      else f.peek = Math.max(0, (f.peek || 0) - dt * 0.6);
    }
  }
};
Story.tick8 = function (dt) {
  const f = this.flags, S = Stalker;
  if (P.mode === 'closet') {
    UI.setBreath(true, P.breath);
    if (S.group.visible && S.data.stage === 'closet') {
      const d = Math.hypot(S.pos.x - 1.3, S.pos.z + 0.66);
      if (d < 1.8 && !P.holdingBreath) { f.hear = (f.hear || 0) + dt; if (f.hear > 0.7) { this.kill('heard'); return; } } else f.hear = Math.max(0, (f.hear || 0) - dt);
      P.fearTarget = Math.max(P.fearTarget, smooth(4, 0.6, d));
      if (S.data.peer) S.putHeadAt(this._peerTarget, Math.PI);
    }
    P.onGasp = () => { if (S.group.visible && S.distTo(V3(1.3, 0, -0.66)) < 3.5) this.kill('heard'); };
    return;
  }
  if (f.out && !f.inCloset && S.group.visible) {
    const dx = P.pos.x - S.pos.x, dz = P.pos.z - S.pos.z, dist = Math.hypot(dx, dz);
    const facing = (dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw)) / Math.max(dist, 1e-3);
    if (dist < 6.5 && (facing > 0.25 || dist < 1.6) && !segmentBlocked(S.pos.x, S.pos.z, P.pos.x, P.pos.z)) { this.kill('found'); }
  }
};
Story.tick9 = function (dt) {
  const f = this.flags, S = Stalker;
  if (f.chase && S.group.visible) {
    // she runs you down
    if (!S.path || G.time - (S.data.repath || 0) > 0.25) { S.walkTo(P.pos.x, P.pos.z, 2.5); S.data.repath = G.time; }
    S.look = P.pos;
    if (S.distTo(P.pos) < 0.75) { this.kill('caught'); return; }
    P.fearTarget = 1;
  }
  if (f.holding && this.hold) {
    const h = this.hold, held = Input.isDown('KeyE') || Input.mouseDown.has(0);
    h.level = held ? Math.min(1, h.level + dt * 2.5) : Math.max(0, h.level - dt * 1.4);
    UI.setBreath(true, h.level);
    if (!held) { h.let += dt; W.doors.bed.set(Math.min(0.14, (h.crack || 0) + h.let * 0.16)); }
    else { h.let = Math.max(0, h.let - dt * 2); W.doors.bed.set(h.crack || 0); } // a crack is all you can keep it to
    if (h.let > 0.9) { this.kill('door', { bedDoor: true }); return; }
    P.fearTarget = Math.max(P.fearTarget, 0.8);
  }
};
Story.tick10 = function () {
  const f = this.flags;
  if (f.reaching && Math.hypot(P.pos.x - 0.1, P.pos.z - 0.35) < 0.95) this.kill('grabbed');
  if ((f.fakeMom || f.realMom) && W.doors.front.t > 0.02) P.fearTarget = Math.max(P.fearTarget, f.fakeMom ? 0.45 : 0.1);
};
