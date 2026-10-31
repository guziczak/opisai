'use strict';

// Live dictation (assets/opisai.js) against a small DOM fixture: the real dictation session, its
// preview panel, the Gemini consent and Konfiguracja → Dyktowanie run; only the review window is a
// spy. The expectations are 0.12.0rc32 behaviour (MacroController._on_triple_click,
// application/dictation_session.py, ui/transcript_overlay.py, ui/overlay_geometry.py).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/opisai.js'), 'utf8');
const motionSource = fs.readFileSync(path.join(__dirname, '../assets/orb-motion.js'), 'utf8');
const startup = "  if(document.readyState==='loading')";
assert.equal(source.split(startup).length, 2, 'The test boundary must precede the single application startup');
const controllerSource = source.replace(startup, `
  review=result=>{__reviews.push(result);state.review=result;setPhase('review');};
  document.addEventListener('keydown',dictationEnterShortcut,true);
  Object.assign(__api,{mount:createOrb,state,preferences:()=>preferences,dictate,finishDictation,orbAction,settings,setPhase,placeDictationPanel,FIELDS,
    open(id){return makeWindow(id,'Okno',400,300,'<div></div>');}});
  return;
${startup}`);

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ??= this; event.currentTarget = this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => { event.stopped = true; };
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
    return !event.defaultPrevented;
  }
}
class Element extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null;
    this.attributes = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this.rect = null; this.textContent = '';
    this.style = { setProperty(key, value) { this[key] = String(value); } };
    const classes = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      contains: name => classes().includes(name),
      add: (...names) => { this.className = [...new Set([...classes(), ...names])].join(' '); },
      remove: (...names) => { this.className = classes().filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !classes().includes(name); this.classList[on ? 'add' : 'remove'](name); return on; }
    };
  }
  get isConnected() { return this === this.doc.documentElement || !!this.parentNode?.isConnected; }
  get innerHTML() { return this.html || ''; }
  set innerHTML(html) {
    this.html = String(html);
    for (const child of this.children) child.parentNode = null; this.children = [];
    const stack = [this];
    for (const match of String(html).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)) {
      const token = match[0];
      if (!token.startsWith('<')) { stack.at(-1).textContent += token.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); continue; }
      if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([\w-]+)/)[1], child = new Element(tag, this.doc);
      for (const attr of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        child.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      stack.at(-1).append(child);
      if (!/^(?:input|img|br|hr|meta|link)$/i.test(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  get text() { return this.textContent + this.children.map(child => child.text).join(''); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
    if (name === 'checked') this.checked = true;
    if (name === 'selected') this.selected = true;
    if (name === 'value' || name === 'type' || name === 'title') this[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return name === 'class' ? this.className : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector === ':focus-visible') return this.doc.activeElement === this;
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^([\w-]*)\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) return (!attr[1] || this.tagName === attr[1].toUpperCase()) && this.getAttribute(attr[2]) !== null && (attr[3] === undefined || this.getAttribute(attr[2]) === attr[3]);
    return this.tagName === selector.toUpperCase();
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) return this.querySelectorAll(parts[0]).flatMap(el => el.querySelectorAll(parts.slice(1).join(' ')));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect || { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
  focus() { this.doc.activeElement = this; }
  setPointerCapture() {} hasPointerCapture() { return false; } releasePointerCapture() {}
}
// Events bubble from the target up to the document, as in the browser.
function bubble(target, event) { event.target = target; for (let node = target; node; node = node.parentNode) node.dispatchEvent(event); target.doc.dispatchEvent(event); return event; }

function fixture({ prefs = {}, editor = true, active = 'badanie' } = {}) {
  const doc = new Target(), win = new Target(), media = new Target(), frames = new Map(), timers = new Map(), intervals = new Map();
  const reviews = [], shown = [], toasts = [], confirms = [], opened = [], api = {}, storage = new Map(); let now = 0, serial = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.createElement = tag => new Element(tag, doc); doc.createElementNS = (_, tag) => new Element(tag, doc);
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector); doc.getElementById = id => doc.querySelector('#' + id);
  doc.hidden = false; doc.elementsFromPoint = () => [];
  for (const id of ['overlay-layer', 'windows']) { const el = doc.createElement('div'); el.setAttribute('id', id); doc.body.append(el); }
  const taskbar = doc.createElement('div'); taskbar.setAttribute('id', 'taskbar'); taskbar.rect = { top: 818, left: 0, width: 1536, height: 48 }; doc.body.append(taskbar);
  const editorEl = doc.createElement('section'); editorEl.style.zIndex = '7'; doc.body.append(editorEl);
  const fields = {}, text = { wywiad: 'Szczur, samiec.', badanie: 'Stan ogólny obniżony.', diagnoza: '' };
  for (const [index, key] of ['wywiad', 'badanie', 'diagnoza'].entries()) {
    const field = doc.createElement('div'); field.setAttribute('data-clinic-field', key);
    field.rect = { left: 107, top: 300 + index * 160, width: 1088, height: key === 'badanie' ? 213 : 60 }; editorEl.append(field); fields[key] = field;
  }
  storage.set('opisai-demo-settings-v12', JSON.stringify(prefs));
  media.matches = false;
  const clinic = { editor, session: 1, text, isEditorOpen: () => clinic.editor, isOpen: () => true, open: () => opened.push('main'), openEditor: () => opened.push('editor'),
    getFields: () => ({ ...clinic.text }), getActiveField: () => active, getContext: () => ({ editorOpen: clinic.editor, session: clinic.editor ? clinic.session : 0 }) };
  const editorWindow = { id: 'clinic-editor', el: editorEl, get visible() { return clinic.editor; } };
  const shell = {
    menu: () => ({ querySelector: () => null }), notify() {},
    toast: message => { toasts.push(message); const el = doc.createElement('div'); doc.body.append(el); return el; },
    confirm: o => confirms.push(o.message), windows: new Map([['clinic-editor', editorWindow]]),
    createWindow: options => { const el = doc.createElement('section'); el.innerHTML = options.content; doc.body.append(el); shown.push(options.id);
      const w = { id: options.id, el, content: el, closed: false, options, show() { shown.push(options.id); }, focus() {}, minimize() {},
        close() { if (this.closed) return; this.closed = true; el.remove(); options.onClose?.(); }, setTitle() {}, setContent(html) { el.innerHTML = html; } }; return w; }
  };
  win.Clinic = clinic; win.Shell = shell; win.devicePixelRatio = 1;
  const context = vm.createContext({ window: win, document: doc, Element, __reviews: reviews, __api: api, Clinic: clinic, Shell: shell,
    innerWidth: 1536, innerHeight: 866, performance: { now: () => now }, matchMedia: () => media, navigator: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout: (fn, delay = 0) => { timers.set(++serial, { fn, due: now + delay }); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { intervals.set(++serial, { fn, delay, due: now + delay }); return serial; }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame: fn => { frames.set(++serial, { fn, at: now }); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    Intl, Date, JSON, Math, Object, Array, Number, String, Map, Set, Promise
  });
  vm.runInContext(motionSource, context, { filename: 'assets/orb-motion.js' });
  vm.runInContext(controllerSource, context, { filename: 'assets/opisai.js' }); api.mount();
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1000 / 60);
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) if (timer.due <= now && timers.delete(id)) timer.fn();
      for (const interval of [...intervals.values()]) while (interval.due <= now) { interval.due += interval.delay; interval.fn(); }
      const pending = [...frames.values()]; frames.clear(); pending.forEach(({ fn }) => fn(now));
    }
  }
  const f = {
    doc, win, api, clinic, fields, reviews, shown, toasts, confirms, opened, storage, advance, bubble,
    get state() { return api.state; }, get rec() { return api.state.recording; }, get phase() { return api.state.phase; },
    get panel() { return doc.querySelector('.oa-dictation'); },
    q(selector) { return f.panel?.querySelector(selector) || null; },
    status() { return f.q('[data-dt-status]')?.textContent || ''; },
    card() { return doc.querySelector('.oa-error-card .oa-error-body')?.text || ''; },
    key(target, key = 'Enter', extra = {}) { return bubble(target, { type: 'keydown', key, ...extra }); },
    click(target) { return bubble(target, { type: 'click' }); },
    // Speak until the scripted speaker has said n fragments (and is in the pause after them).
    speak(n) { const end = f.rec.speech[n - 1].end; while (f.rec.t < end + .3) advance(120); }
  };
  advance(1500);
  return f;
}

test('dictation always goes into "Badanie kliniczne", whatever field was active last', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' }, active: 'wywiad' });
  f.api.dictate(); f.advance(100);
  assert.equal(f.rec.key, 'badanie'); assert.equal(f.q('[data-dt-target]').textContent, 'Dyktowanie do: Badanie kliniczne');
  assert.equal(f.rec.base, 'Stan ogólny obniżony.', 'the field read at the start is the earlier text');
  assert.equal(f.q('[data-dt="base"]').hidden, false, '"Dotychczasowy tekst" is offered for a non-empty field');
  f.advance(1600); f.speak(1); f.key(f.q('[data-dt-scroll]')); f.advance(6000);
  assert.equal(f.rec.text, 'Błony śluzowe bladoróżowe, czas powrotu kapilarnego około 2 sekund.', 'Enter closed the first fragment');
  // Meanwhile the second sentence was spoken into the open fragment: Stop ends that fragment too, and it is
  // transcribed before the review (own_audio_session: "Without Autoenter only Enter (or Stop) ends a segment").
  f.api.finishDictation(); f.advance(6000);
  assert.equal(f.reviews.length, 1); const r = f.reviews[0];
  assert.equal(r.field, 'badanie'); assert.deepEqual(Object.keys(r.output), ['badanie']);
  const transcript = 'Błony śluzowe bladoróżowe, czas powrotu kapilarnego około 2 sekund. Oddechy około 140 na minutę, z udziałem tłoczni brzusznej.';
  assert.equal(r.output.badanie, 'Stan ogólny obniżony.\n' + transcript, 'the field text once, then a single line break (dictation_draft)');
  assert.equal(r.sources.badanie, transcript, 'the transcript is the source');
  assert.equal(r.transcription.backend, 'chatgpt_browser'); assert.equal(r.session, 1);
});

test('ChatGPT: Enter is "Przepisz fragment" — the recording goes on and the text returns after the fragment is transcribed', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(300);
  assert.equal(f.phase, 'processing', 'dots until the microphone is confirmed');
  assert.match(f.status(), /^Otwieram karty ChatGPT… Mikrofon otworzy OpisAI/);
  assert.equal(f.q('[data-dt="flush"]').hidden, false); assert.equal(f.q('[data-dt="flush"]').disabled, true);
  f.advance(1500); assert.equal(f.phase, 'recording'); assert.equal(f.status(), 'Słucham — tekst jeszcze nie wrócił.');
  assert.equal(f.q('[data-dt="flush"]').disabled, false); assert.equal(f.q('[data-dt="flush"]').textContent, 'Przepisz fragment ↵');
  f.speak(2); assert.equal(f.rec.text, '', 'without Enter (and without Autoenter) a long pause does not end the fragment');
  const enter = f.key(f.q('[data-dt-scroll]'));
  assert(enter.defaultPrevented); assert.equal(f.phase, 'recording', 'Enter never finishes the dictation');
  assert.equal(f.status(), 'Przyjęto prośbę o przepisanie fragmentu. Bieżący fragment nie jest jeszcze zamykany.');
  assert.equal(f.q('[data-dt="flush"]').textContent, 'Przepisanie przyjęte…');
  f.advance(2400); assert.match(f.status(), /^Nagrywam dalej w B\. Strona sygnalizuje przetwarzanie A1; czekam na wynik: \d s\.$/);
  assert.equal(f.q('[data-dt="flush"]').textContent, 'Czekam na wynik fragmentu…');
  f.advance(2600);
  assert.equal(f.rec.text, 'Błony śluzowe bladoróżowe, czas powrotu kapilarnego około 2 sekund. Oddechy około 140 na minutę, z udziałem tłoczni brzusznej.');
  assert.equal(f.status(), 'Słucham.'); assert.equal(f.phase, 'recording'); assert.equal(f.reviews.length, 0);
  // The dictated Klinika field: Enter requests the next fragment and never types a line break there.
  f.speak(3); const press = f.bubble(f.fields.badanie, { type: 'keydown', key: 'Enter' });
  assert(press.defaultPrevented && press.stopped, 'Enter is kept out of the clinical field');
  assert.equal(f.rec.command?.source, 'keyboard');
  const other = f.bubble(f.fields.wywiad, { type: 'keydown', key: 'Enter' });
  assert(!other.defaultPrevented, 'only the dictated control: Enter in "Wywiad" stays a line break');
  f.advance(6000); assert.match(f.rec.text, /Brzuch miękki, niebolesny\.$/);
  // "Zakończ i sprawdź tekst": the stop protocol, then the review.
  f.click(f.q('[data-dt="finish"]')); f.advance(100);
  assert.equal(f.phase, 'processing'); assert.equal(f.q('[data-dt="finish"]').textContent, 'Kończę — czekam na wynik…'); assert.equal(f.q('[data-dt="finish"]').disabled, true);
  assert.equal(f.q('[data-dt="flush"]').textContent, 'Kończę dyktowanie…');
  assert.equal(f.status(), 'Kończę nagrywanie — zatrzymuję wejścia mikrofonu…');
  f.advance(1500); assert.match(f.status(), /^Nagrywanie zakończone\. Odbieram ostatnie teksty i porządkuję karty…$|^Wyniki odebrane/);
  f.advance(1500); assert.equal(f.reviews.length, 1); assert.equal(f.panel, null, 'the preview closes when the review opens');
});

test('the panel has no "Anuluj", pause, timer or "Enter — zakończ"; Finish is the full-width last control', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(2000);
  const html = f.panel.innerHTML;
  for (const absent of ['Anuluj', 'Wstrzymaj', 'Wznów', '00:0', 'Enter — zakończ', 'Karta A', 'Nowa transkrypcja']) assert(!html.includes(absent), absent);
  for (const label of ['Zwiń', 'Dotychczasowy tekst', 'Szczegóły dyktowania — mikrofon', 'Tekst roboczy — jeszcze niewpisany do Kliniki.', 'Pokaż ChatGPT', 'Zakończ i sprawdź tekst', 'Przykładowe dyktowanie']) assert(html.includes(label), label);
  assert.equal(f.panel.children.at(-2).dataset.dt, 'finish');
  assert.equal(f.q('[data-dt="details"]').getAttribute('aria-expanded'), 'false', 'details are collapsed by default');
  assert.equal(f.q('[data-dt-timeline]').hidden, true);
  f.click(f.q('[data-dt="details"]')); assert.equal(f.q('[data-dt-timeline]').hidden, false);
  assert.equal(JSON.parse(f.storage.get('opisai-demo-settings-v12')).dictationDetails, true, 'the details choice is remembered at once');
});

test('compose or review open, or a review waiting behind the bubble, is another operation; other OpisAI windows are recalled', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.open('opisai-compose'); f.shown.length = 0;
  f.api.dictate(); f.advance(1200);
  assert.equal(f.rec, null); assert.equal(f.card(), 'Trwa inna operacja — zakończ ją przed dyktowaniem.');
  assert.deepEqual(f.shown, [], 'the open compose window is neither closed nor recalled'); assert.equal(f.doc.querySelector('.oa-dictation'), null);
  const h = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  h.api.open('opisai-history'); h.shown.length = 0;
  h.api.dictate(); h.advance(200);
  assert.equal(h.rec, null); assert.deepEqual(h.shown, ['opisai-history'], 'ui_windows().raise_active()'); assert.equal(h.card(), '');
  const g = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  g.api.state.review = { field: 'badanie', output: { badanie: 'x' } }; g.api.setPhase('review');
  g.api.dictate(); g.advance(1200);
  assert.equal(g.rec, null); assert.equal(g.card(), 'Trwa inna operacja — zakończ ją przed dyktowaniem.');
});

test('without the visit sub-window: "⚠ Transkrypcja" and Klinika is never opened', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' }, editor: false });
  f.api.dictate(); f.advance(1200);
  assert.equal(f.rec, null); assert.equal(f.card(), 'Nie znaleziono podokna wizyty — otwórz wizytę w Klinice.');
  assert.match(f.doc.querySelector('.oa-error-card').html, /⚠ Transkrypcja/); assert.deepEqual(f.opened, []); assert.equal(f.phase, 'idle');
});

test('Gemini Live (the rc32 default): consent before the first recording, then live text without cards or "Przepisz fragment"', () => {
  const f = fixture();
  assert.equal(f.api.preferences().transcriber, 'gemini');
  f.api.dictate(); f.advance(100);
  assert.equal(f.rec, null); assert(f.shown.includes('opisai-gemini-consent'));
  const dialog = f.doc.querySelector('.oa-consent');
  assert.match(dialog.text, /Dyktowanie przez Gemini Live/); assert.match(dialog.text, /Zapamiętaj zgodę na dyktowanie przez Gemini Live/);
  assert.equal(dialog.querySelector('#oa-gemini-remember').checked, true);
  f.click(dialog.querySelector('[data-action="start"]')); f.advance(100);
  assert.equal(JSON.parse(f.storage.get('opisai-demo-settings-v12')).dictationConsent, true, 'remembered consent is stored');
  assert.equal(f.rec.engine, 'gemini'); assert.match(f.status(), /^🎙 Łączę z Gemini… za chwilę mów\./);
  assert.equal(f.q('[data-dt="flush"]').hidden, true); assert.equal(f.q('[data-dt="browser"]').hidden, true);
  f.advance(1300); assert.equal(f.phase, 'recording'); assert.equal(f.q('[data-dt-meter]').hidden, false, 'the level meter is in the header');
  f.advance(3000); assert(f.rec.text.length > 10, 'Gemini shows the text while speaking'); assert.equal(f.status(), 'Słucham.');
  assert.equal(f.q('[data-dt="details"]').textContent, 'Szczegóły dyktowania — mikrofon');
  f.key(f.q('[data-dt-scroll]')); assert.equal(f.rec.command, null, 'no fragment command for Gemini');
  f.api.finishDictation(); f.advance(200); assert.equal(f.status(), 'Kończę — odbieram ostatnie słowa i zwalniam zasoby…');
  f.advance(2500); assert.equal(f.reviews.length, 1); assert.equal(f.reviews[0].transcription.model, 'gemini-3.5-transcribe-live');
  f.api.state.review = null; f.api.setPhase('idle');
  f.api.dictate(); f.advance(100); assert(f.rec, 'the remembered consent is not asked again');
  // Declining never records and never stores consent.
  const g = fixture(); g.api.dictate(); g.advance(100);
  g.click(g.doc.querySelector('.oa-consent [data-action="cancel"]')); g.advance(200);
  assert.equal(g.rec, null); assert.equal(JSON.parse(g.storage.get('opisai-demo-settings-v12')).dictationConsent, undefined);
  // A hold while the question waits cancels that start (_dictation_starting); the answer is still remembered.
  const c = fixture(); c.api.dictate(); c.advance(100); c.api.dictate(); c.advance(100);
  assert.equal(c.doc.querySelectorAll('.oa-consent').length, 1, 'the question stays, once');
  c.click(c.doc.querySelector('.oa-consent [data-action="start"]')); c.advance(1500);
  assert.equal(c.rec, null, 'the cancelled start does not record'); assert.equal(c.phase, 'idle');
  assert.equal(JSON.parse(c.storage.get('opisai-demo-settings-v12')).dictationConsent, true);
  assert.equal(c.shown.filter(id => id === 'opisai-gemini-consent').length, 1, 'a compact dialog, shown once');
  assert.equal(c.api.state.consent, null);
});

test('placement follows ui/overlay_geometry.place_dictation_overlay (values computed with the rc32 module)', () => {
  const f = fixture(), place = (anchor, work, orb, minimum) => { const r = f.api.placeDictationPanel(...[anchor, work, orb].map(v => v && { x: v[0], y: v[1], w: v[2], h: v[3] }), minimum); return [r.x, r.y, r.w, r.h]; };
  assert.deepEqual(place([107, 448, 1088, 213], [0, 0, 1536, 818], [1302, 553, 128, 128], [320, 260]), [107, 401, 1088, 260], 'field width and bottom edge');
  assert.deepEqual(place([100, 300, 200, 50], [0, 0, 1200, 752], null, [320, 260]), [100, 90, 320, 260], 'at least 320 × 260, growing upward');
  assert.deepEqual(place([700, 420, 500, 213], [0, 0, 1536, 818], [1100, 500, 128, 128], [320, 260]), [588, 373, 500, 260], 'clear of the bubble');
  assert.deepEqual(place([107, 448, 1088, 213], [0, 0, 1536, 818], [1302, 553, 128, 128], [320, 420]), [107, 241, 1088, 420], 'expanded details grow upward');
  assert.deepEqual(place([40, 40, 900, 120], [0, 0, 1200, 752], [500, 20, 128, 128], [320, 300]), [40, 160, 900, 300]);
});

test('the preview hides without its field and stays hidden for a reopened sub-window; the review keeps the session of the start', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(400);
  assert.equal(f.panel.hidden, false); assert.equal(f.panel.style.zIndex, '7', 'stacked with the Klinika sub-window');
  assert.equal(f.panel.style.width, '1088px'); assert.equal(f.panel.style.top, (300 + 160 + 213 - 260) + 'px');
  f.clinic.editor = false; f.advance(350); assert.equal(f.panel.hidden, true, 'a missing sub-window hides the view');
  f.clinic.editor = true; f.clinic.session = 2; f.advance(350); assert.equal(f.panel.hidden, true, 'never retargeted to a new window');
  assert.notEqual(f.rec, null, 'hiding the view is not a session event');
  f.advance(1600); f.speak(1); f.api.dictate(); f.advance(6000); // a second hold finishes
  assert.equal(f.reviews.length, 1); assert.equal(f.reviews[0].session, 1);
});

test('"Zwiń" hides the preview while dictating; "Pokaż" recalls it', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(2000);
  f.click(f.q('[data-dt="hide"]')); f.advance(400); assert.equal(f.panel.hidden, true); assert.equal(f.phase, 'recording');
  f.api.orbAction('show'); assert.equal(f.panel.hidden, false); assert.equal(f.doc.activeElement, f.q('[data-dt-scroll]'));
});

test('Kontynuuj dyktowanie: the edited text waits in "Dotychczasowy tekst", the transcript holds only new words; nothing new restores the review', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(1700); f.speak(1); f.api.finishDictation(); f.advance(6000);
  const first = f.reviews[0]; first.edited = { badanie: 'POPRAWIONY TEKST.' }; f.api.state.review = null;
  f.api.dictate({ field: 'badanie', base: 'POPRAWIONY TEKST.', snapshot: first.snapshot, session: first.session, continuation: true, direct: true }); f.advance(100);
  assert.equal(f.rec.base, 'POPRAWIONY TEKST.'); assert.equal(f.q('[data-dt-base]').textContent, 'POPRAWIONY TEKST.');
  f.advance(1600); f.speak(1); f.key(f.q('[data-dt-scroll]')); f.advance(6000);
  assert.equal(f.rec.text, 'Nawodnienie prawidłowe, fałd skórny rozprostowuje się od razu.', 'a second sample, never the first one again');
  f.api.finishDictation(); f.advance(6000);
  assert.equal(f.reviews[1].output.badanie, 'POPRAWIONY TEKST.\nNawodnienie prawidłowe, fałd skórny rozprostowuje się od razu. Siekacze prawidłowej długości, bez przerostu.');
  // No new words: the earlier review returns behind the bubble ("Sprawdź").
  const second = f.reviews[1]; second.edited = { badanie: 'DRUGA POPRAWKA.' }; f.api.state.review = null; f.api.setPhase('idle');
  f.api.dictate({ field: 'badanie', base: 'DRUGA POPRAWKA.', snapshot: second.snapshot, session: second.session, continuation: true, direct: true }); f.advance(400);
  f.api.finishDictation(); f.advance(2000);
  assert.equal(f.reviews.length, 2); assert.equal(f.api.state.review, second); assert.equal(f.phase, 'review'); assert.equal(second.edited.badanie, 'DRUGA POPRAWKA.');
  assert.equal(f.card(), 'Nagranie zakończone bez tekstu. Dotychczasowa notatka została zachowana.');
  // A changed field or window keeps the earlier text and says why.
  f.api.state.review = null; f.api.setPhase('idle'); f.clinic.text.badanie += ' X';
  f.api.dictate({ field: 'badanie', base: 'DRUGA POPRAWKA.', snapshot: second.snapshot, session: second.session, continuation: true, direct: true }); f.advance(100);
  assert.equal(f.rec, null); assert.equal(f.api.state.review, second); assert.deepEqual(f.confirms, ['Zmieniła się wizyta lub treść jej pola. Zachowano wcześniejszy tekst dyktowania.']);
  // Once the three samples are used up the recording stays silent and the badge says so; no sample repeats.
  const g = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  const stub = { field: 'badanie', takes: 3, edited: { badanie: 'Stan ogólny obniżony.' }, snapshot: { ...g.clinic.text }, session: 1, output: { badanie: 'x' } };
  g.api.dictate({ field: 'badanie', base: 'Stan ogólny obniżony.', snapshot: stub.snapshot, session: 1, continuation: true, direct: true, review: stub }); g.advance(100);
  assert.equal(g.rec.words.length, 0); assert.equal(g.q('.oa-dt-demo').textContent, 'Przykładowe dyktowanie — cisza');
});

test('cancelling while the stop waits shows "Anuluję…" briefly and never opens a review', () => {
  const f = fixture({ prefs: { transcriber: 'chatgpt_browser' } });
  f.api.dictate(); f.advance(1700); f.speak(1); f.api.finishDictation(); f.advance(200);
  assert.equal(f.rec.listening, false); f.api.orbAction('cancel');
  assert.equal(f.rec, null); assert.equal(f.phase, 'idle');
  assert.equal(f.q('[data-dt="finish"]').textContent, 'Anuluję…'); assert.equal(f.status(), 'Anuluję dyktowanie — czekam na zwolnienie zasobów…');
  f.advance(6000); assert.equal(f.panel, null); assert.equal(f.reviews.length, 0);
});

test('Konfiguracja → Dyktowanie: rc32 engines, the ChatGPT retention notice, the card mode text and Autoenter', () => {
  const f = fixture();
  f.api.settings('dictation'); const page = f.doc.querySelector('[data-settings-page]');
  const engine = page.querySelector('select[data-setting="transcriber"]');
  assert.deepEqual(engine.querySelectorAll('option').map(o => o.text), ['Gemini Live — chmura (wymaga klucza API Gemini)', 'Lokalny Whisper — na tym komputerze, offline (RODO)', 'ChatGPT — dyktowanie w przeglądarce (próba)']);
  assert.equal(engine.querySelector('option[selected]').getAttribute('value'), 'gemini');
  for (const absent of ['Język', 'Każde zdanie', 'Uruchom przykład']) assert(!page.text.includes(absent), absent);
  assert.match(page.text, /Zezwalaj na wysyłanie audio do Gemini bez pytania/); assert.match(page.text, /Ustawienia dla następnego dyktowania\./);
  engine.value = 'chatgpt_browser'; f.bubble(engine, { type: 'change' });
  const chat = f.doc.querySelector('[data-settings-page]');
  assert.match(chat.text, /ChatGPT przechowuje nagrania dyktowania na koncie przez 30 dni i nie pozwala ich usunąć — przy wrażliwych wizytach dyktuj lokalnym Whisperem\./);
  assert.match(chat.text, /Podpowiadaj ChatGPT język polski/); assert(!chat.text.includes('Sprawdź dyktowanie'), '"Sprawdź dyktowanie" is Gemini only');
  assert.match(chat.text, /Niezapisane zmiany w konfiguracji — kliknij „Zapisz”, aby je zachować\./);
  const mode = chat.querySelector('select[data-setting="cardMode"]'), summary = () => chat.querySelector('[data-dt-strategy-summary]').textContent;
  assert.match(summary(), /^OpisAI nagrywa mikrofon i dzieli wypowiedź w pauzach/);
  mode.value = 'two'; f.bubble(mode, { type: 'change' });
  assert.match(summary(), /^Karty same nagrywają mikrofon i przekazują sobie nagrywanie/, 'the description follows the choice');
  assert.equal(chat.querySelector('[data-dt-interval]').textContent, 'Odstęp fragmentów:');
  const auto = chat.querySelector('[data-setting="autoEnter"]'), spin = chat.querySelector('[data-setting="autoEnterSeconds"]');
  assert.equal(spin.disabled, true); auto.checked = true; f.bubble(auto, { type: 'change' }); assert.equal(spin.disabled, false);
  spin.value = '3'; f.bubble(spin, { type: 'change' }); assert.equal(spin.value, 10, 'outside 5–600 s it is 10');
});
