// ---------------------------------------------------------------------------
// UI: captions, thoughts, objective, prompts, menus
// ---------------------------------------------------------------------------
const UI = {
  init() {
    this.hud = $('#hud'); this.prompt = $('#prompt'); this.cross = $('#crosshair'); this.caps = $('#captions');
    this.obj = $('#objective'); this.objText = $('#objective span'); this.hintEl = $('#hint'); this.card = $('#timecard');
    this.breathEl = $('#breath'); this.breathBar = $('#breath i');
    for (const host of document.querySelectorAll('[data-settings]')) this.buildSettings(host);
  },
  buildSettings(host) {
    const row = (label, html) => { const l = document.createElement('label'); l.innerHTML = `<span>${label}</span>${html}`; host.appendChild(l); return l; };
    const uid = host.closest('section').id;
    row('mouse sensitivity', `<input type="range" id="${uid}-sens" min="0.3" max="2.5" step="0.05" value="${Settings.sensitivity}">`)
      .querySelector('input').addEventListener('input', e => { Settings.sensitivity = +e.target.value; Settings.save(); this.syncSettings(); });
    row('brightness', `<input type="range" id="${uid}-bright" min="0.7" max="1.6" step="0.02" value="${Settings.brightness}">`)
      .querySelector('input').addEventListener('input', e => { Settings.brightness = +e.target.value; Settings.save(); this.syncSettings(); });
    row('volume', `<input type="range" id="${uid}-vol" min="0" max="1" step="0.01" value="${Settings.volume}">`)
      .querySelector('input').addEventListener('input', e => { Settings.volume = +e.target.value; A.setVolume(Settings.volume); Settings.save(); this.syncSettings(); });
    const checks = document.createElement('div'); checks.className = 'row'; checks.style.flexWrap = 'wrap'; checks.style.gap = '8px 22px';
    checks.innerHTML = `<label class="row"><input type="checkbox" id="${uid}-flash" ${Settings.reduceFlashing ? 'checked' : ''}> reduce flashing</label>
      <label class="row"><input type="checkbox" id="${uid}-inv" ${Settings.invertY ? 'checked' : ''}> invert mouse</label>`;
    host.appendChild(checks);
    checks.querySelector(`#${uid}-flash`).addEventListener('change', e => { Settings.reduceFlashing = e.target.checked; Settings.save(); this.syncSettings(); });
    checks.querySelector(`#${uid}-inv`).addEventListener('change', e => { Settings.invertY = e.target.checked; Settings.save(); this.syncSettings(); });
  },
  syncSettings() {
    for (const s of ['title', 'pause']) {
      const g = id => document.getElementById(`${s}-${id}`);
      if (!g('sens')) continue;
      g('sens').value = Settings.sensitivity; g('bright').value = Settings.brightness; g('vol').value = Settings.volume;
      g('flash').checked = Settings.reduceFlashing; g('inv').checked = Settings.invertY;
    }
  },
  showHud(on) { this.hud.classList.toggle('on', on); },

  // captions: who = 'MOM (phone)' etc. returns the element
  say(who, text, dur = 4, cls = '') {
    const el = document.createElement('div');
    el.className = 'cap ' + cls;
    if (who) { const w = document.createElement('span'); w.className = 'who'; w.textContent = who; el.appendChild(w); }
    el.appendChild(document.createTextNode(text));
    this.caps.appendChild(el);
    while (this.caps.children.length > 3) this.caps.firstChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, dur * 1000);
    return el;
  },
  thought(text, dur = 4) { return this.say(null, text, dur, 'thought'); },
  clearCaptions() { this.caps.innerHTML = ''; },
  objective(text) {
    clearTimeout(this._objT);
    this.currentObjective = text;
    if (!text) { this.obj.classList.remove('on', 'quiet'); return; }
    this.objText.textContent = text; this.obj.classList.remove('quiet'); this.obj.classList.add('on');
    this._objT = setTimeout(() => this.obj.classList.add('quiet'), 7000);
  },
  hint(html, dur = 7) {
    clearTimeout(this._hintT);
    this.hintEl.innerHTML = html; this.hintEl.classList.add('on');
    if (dur) this._hintT = setTimeout(() => this.hintEl.classList.remove('on'), dur * 1000);
  },
  clearHint() { this.hintEl.classList.remove('on'); },
  timecard(text, dur = 3.2) {
    this.card.textContent = text; this.card.classList.add('on');
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.card.classList.remove('on'), dur * 1000);
  },
  setPrompt(text) {
    if (text) { this.prompt.innerHTML = `<kbd>E</kbd>${text}`; this.prompt.classList.add('on'); this.cross.classList.add('hot'); }
    else { this.prompt.classList.remove('on'); this.cross.classList.remove('hot'); }
  },
  setBreath(show, level) {
    this.breathEl.classList.toggle('on', show);
    this.breathEl.classList.toggle('low', level < 0.3);
    this.breathBar.style.transform = `scaleX(${level})`;
  },
  showNote(on) { $('#note').hidden = !on; if (on) A.play('paper', { gain: 0.5 }); },
  noteOpen() { return !$('#note').hidden; },
  loading(p, what) { $('#loading .bar i').style.width = `${Math.round(p * 100)}%`; $('#loading .what').textContent = what; },
  loadError(msg) { const e = document.createElement('div'); e.className = 'err'; e.textContent = msg; $('#loading').appendChild(e); },
  showDeath(why, rule) {
    const d = $('#death'); d.hidden = false; d.classList.remove('show');
    d.querySelector('.why').textContent = why; d.querySelector('.rule').textContent = rule || '';
    setTimeout(() => d.classList.add('show'), 40);
  },
  hideDeath() { $('#death').hidden = true; $('#death').classList.remove('show'); },
};
