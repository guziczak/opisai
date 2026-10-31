'use strict';

// Execute the real bubble controller (assets/opisai.js) and models (assets/orb-motion.js)
// against a small DOM fixture. Only the views it opens (compose, dictation, review,
// settings) are spies; gestures, timers, frames, states, the menu and the error
// notice are production code. The expectations are 0.12.0rc32 behaviour.
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
  prepare=options=>{__actions.push({type:'prepare',field:options?.field||null});};
  startDictation=()=>{__actions.push({type:'dictate'});state.recording={};setPhase('recording');};
  finishDictation=()=>{__actions.push({type:'finish'});state.recording=null;setPhase('idle');};
  review=()=>__actions.push({type:'review'});
  settings=page=>__actions.push({type:'settings',page:typeof page==='string'?page:null});
  Object.assign(__orbHarness,{mount:createOrb,setPhase,state,orb,preferences,launch,showBubble,closeApp,
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
    event.stopPropagation ??= () => {};
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
    return !event.defaultPrevented;
  }
}
class Element extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null;
    this.attributes = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this.captures = new Set(); this.rect = null;
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
  set innerHTML(html) {
    this.html = String(html);
    for (const child of this.children) child.parentNode = null; this.children = [];
    const stack = [this];
    for (const match of String(html).matchAll(/<\/?[a-z][^>]*>/gi)) {
      const token = match[0]; if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([\w-]+)/)[1], child = new Element(tag, this.doc);
      for (const attr of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        child.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      stack.at(-1).append(child);
      if (!/^(?:input|img|br|hr|meta|link)$/i.test(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return name === 'class' ? this.className : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector === ':focus-visible') return this.doc.activeElement === this; // keyboard focus in these tests
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) return this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
    return this.tagName === selector.toUpperCase();
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect || { top: Number(this.style.top) || 0, left: 0, width: 0, height: 0 }; }
  focus() { this.doc.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { if (this.captures.delete(id)) this.dispatchEvent({ type: 'lostpointercapture', pointerId: id }); }
}

// rafLag > 0 stamps every frame that many milliseconds before the call that requested it, as Chromium does
// (the frame's start time); 0 keeps the stamp at the harness clock.
function fixture({ reduced = false, saved = null, prefs = {}, editor = true, main = true, rafLag = 0, spelling = null } = {}) {
  const doc = new Target(), win = new Target(), media = new Target(), frames = new Map(), timers = new Map(), intervals = new Map();
  const actions = [], menus = [], shown = [], toasts = [], opened = [], api = {}, storage = new Map(); let now = 0, serial = 0, stack = [];
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.createElement = tag => new Element(tag, doc); doc.createElementNS = (_, tag) => new Element(tag, doc);
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector); doc.getElementById = id => doc.querySelector('#' + id);
  doc.hidden = false; doc.elementsFromPoint = () => stack;
  const overlay = doc.createElement('div'); overlay.setAttribute('id', 'overlay-layer'); doc.body.append(overlay);
  const taskbar = doc.createElement('div'); taskbar.setAttribute('id', 'taskbar'); taskbar.style.top = 752; doc.body.append(taskbar);
  const fields = {};
  for (const [index, key] of ['wywiad', 'badanie', 'diagnoza'].entries()) {
    const field = doc.createElement('div'); field.setAttribute('data-clinic-field', key);
    field.rect = { left: 100, top: 100 + index * 150, width: 600, height: 120 }; doc.body.append(field); fields[key] = field;
  }
  if (saved) storage.set('opisai.demo.bubble.v1', JSON.stringify(saved));
  storage.set('opisai-demo-settings-v12', JSON.stringify(prefs));
  media.matches = reduced;
  const clinic = { editor, main, isEditorOpen: () => clinic.editor, isOpen: () => clinic.main, open: () => { opened.push('main'); clinic.main = true; }, openEditor: () => opened.push('editor'), getFields: () => ({ wywiad: '', badanie: '', diagnoza: '' }) };
  const shell = {
    menu: (items, x, y, options) => { menus.push({ items, x, y, options }); return { querySelector: () => null }; },
    toast: message => { toasts.push(message); const el = doc.createElement('div'); el.className = 'status-toast'; doc.body.append(el); return el; },
    confirm: o => toasts.push(o.message), windows: new Map(),
    createWindow: options => { const el = doc.createElement('section'); doc.body.append(el); const w = { id: options.id, el, content: el, closed: false, options,
      show() { shown.push(options.id); }, focus() {}, close() { this.closed = true; el.remove(); options.onClose?.(); }, setTitle() {}, setContent() {} }; return w; }
  };
  win.Clinic = clinic; win.Shell = shell; if (spelling) win.OpisAISpelling = spelling; // assets/opisai-spelling.js loads before opisai.js
  const context = vm.createContext({ window: win, document: doc, Element, __actions: actions, __orbHarness: api, Clinic: clinic, Shell: shell,
    innerWidth: 1200, innerHeight: 800, performance: { now: () => now }, matchMedia: () => media, navigator: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout: (fn, delay = 0) => { timers.set(++serial, { fn, due: now + delay }); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { intervals.set(++serial, { fn, delay, due: now + delay }); return serial; }, clearInterval: id => intervals.delete(id),
    requestAnimationFrame: fn => { frames.set(++serial, { fn, at: now }); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    Intl, Date, JSON, Math, Object, Array, Number, String, Map, Set, Promise
  });
  vm.runInContext(motionSource, context, { filename: 'assets/orb-motion.js' });
  vm.runInContext(controllerSource, context, { filename: 'assets/opisai.js' }); api.mount();
  const wrap = doc.querySelector('.oa-orb-wrap'), orb = wrap.querySelector('.oa-orb');
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 1000 / 60);
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) if (timer.due <= now && timers.delete(id)) timer.fn();
      for (const interval of intervals.values()) while (interval.due <= now) { interval.due += interval.delay; interval.fn(); }
      const pending = [...frames.values()]; frames.clear(); pending.forEach(({ fn, at }) => fn(rafLag ? at - rafLag : now));
    }
  }
  function pointer(type, x, y, extra = {}) {
    const event = { type, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pointerId: 7, pointerType: 'mouse', clientX: x, clientY: y, timeStamp: now, ...extra };
    orb.dispatchEvent(event);
    if ((type === 'pointerup' || type === 'pointercancel') && orb.hasPointerCapture(event.pointerId)) orb.releasePointerCapture(event.pointerId);
    return event;
  }
  const f = {
    doc, win, orb, wrap, api, actions, menus, shown, toasts, opened, clinic, fields, storage, pointer, advance,
    get pendingFrames() { return frames.size; }, get pendingTimers() { return timers.size; },
    get phase() { return api.state.phase; },
    center() { const m = wrap.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/); return [Number(m[1]), Number(m[2])]; },
    press(ms) { const [x, y] = f.center(); pointer('pointerdown', x, y); advance(ms); return [x, y]; },
    click() { const [x, y] = f.press(70); pointer('pointerup', x, y); },
    over(...elements) { stack = elements; },
    reduced(value) { media.matches = value; media.dispatchEvent({ type: 'change', matches: value }); },
    chips() { return wrap.querySelectorAll('[data-orb-action]').map(button => button.dataset.orbAction); },
    resize(width, height) { context.innerWidth = width; context.innerHeight = height; taskbar.style.top = height - 48; win.dispatchEvent({ type: 'resize' }); }
  };
  advance(2000); // entrance spring (it settles after about 1.3 s) and the first rescue checks
  return f;
}
const plain = value => JSON.parse(JSON.stringify(value));
function assertIdle(f) {
  assert.equal(f.pendingFrames, 0, 'no animation loop at rest'); assert.equal(f.orb.hasPointerCapture(7), false);
  for (const name of ['dragging']) assert.equal(f.wrap.classList.contains(name), false, name);
  assert.equal(f.wrap.querySelector('.oa-orb-squash').getAttribute('transform'), 'translate(0 0.00) scale(1.0000 1.0000)', 'the resting bubble is round');
}

test('click, keyboard and assistive activation describe the visit once; the bubble then rests', () => {
  for (const kind of ['pointer', 'keyboard', 'assistive']) {
    const f = fixture(); assertIdle(f);
    if (kind === 'pointer') f.click();
    else if (kind === 'keyboard') { const event = { type: 'keydown', key: 'Enter' }; f.orb.dispatchEvent(event); assert(event.defaultPrevented); }
    else f.orb.dispatchEvent({ type: 'click', detail: 0 });
    f.advance(1500); assert.deepEqual(plain(f.actions), [{ type: 'prepare', field: null }], kind); assertIdle(f);
    assert.equal(f.phase, 'idle', 'opening the compose view keeps the blue resting state');
  }
});

test('a click while an OpisAI view is open only recalls it (no second operation)', () => {
  const f = fixture(); f.api.open('opisai-compose'); f.shown.length = 0;
  f.click(); f.advance(200);
  assert.deepEqual(f.actions, []); assert.deepEqual(f.shown, ['opisai-compose']);
});

test('holding for 450 ms starts dictation with a filling ring and a feedforward hint', () => {
  const f = fixture(), [x, y] = f.press(120);
  assert.equal(f.wrap.querySelector('.oa-orb-press').textContent, '', 'no promise before 0.15 s');
  assert(f.wrap.querySelector('.oa-orb-arming').style.display !== 'none', 'the arming ring fills from the press');
  f.advance(60); assert.equal(f.wrap.querySelector('.oa-orb-press').textContent, 'Trzymaj: dyktowanie');
  f.advance(250); assert.deepEqual(f.actions, [], 'nothing before 450 ms');
  f.advance(40); assert.deepEqual(plain(f.actions), [{ type: 'dictate' }]);
  assert.equal(f.wrap.querySelector('.oa-orb-press').textContent, 'Dyktowanie');
  f.pointer('pointermove', x - 200, y + 50); f.advance(200);
  assert.deepEqual(f.center(), [x, y], 'after the hold the same gesture never drags');
  f.pointer('pointerup', x - 200, y + 50); f.orb.dispatchEvent({ type: 'click', detail: 1 }); f.advance(1500);
  assert.equal(f.actions.length, 1); assert.equal(f.phase, 'recording');
  assert.deepEqual(f.chips(), ['finish', 'show']);
  f.press(250); assert.equal(f.wrap.querySelector('.oa-orb-press').textContent, 'Trzymaj: zakończ'); f.advance(250); f.pointer('pointerup', x, y);
  assert.deepEqual(plain(f.actions), [{ type: 'dictate' }, { type: 'finish' }]);
});

test('Gotowe and Błąd give no hold promise and offer no actions', () => {
  for (const phase of ['done', 'error']) {
    const f = fixture(); f.api.setPhase(phase); f.advance(20);
    assert.deepEqual(f.chips(), [], phase);
    const [x, y] = f.press(300); assert.equal(f.wrap.querySelector('.oa-orb-press').textContent, '', phase); f.pointer('pointerup', x, y);
  }
});

test('moving before 180 ms and releasing cancels: no click and no movement', () => {
  const f = fixture(), [x, y] = f.center();
  f.pointer('pointerdown', x, y); f.advance(20); f.pointer('pointermove', x - 80, y + 40); f.advance(20);
  f.pointer('pointerup', x - 160, y + 80); f.advance(1500);
  assert.deepEqual(f.actions, []); assert.deepEqual(f.center(), [x, y]); assertIdle(f);
  f.pointer('pointerdown', x, y); f.pointer('pointermove', x + 30, y); f.pointer('pointermove', x, y); f.advance(60); f.pointer('pointerup', x, y);
  f.advance(500); assert.deepEqual(f.actions, [], 'returning to the press point does not restore the click');
});

test('a drag starts at 180 ms, follows without overshoot, glides after release and remembers the position', () => {
  const f = fixture(), [x, y] = f.center();
  f.pointer('pointerdown', x, y); f.pointer('pointermove', x - 30, y); f.advance(170);
  assert.deepEqual(f.center(), [x, y], 'no movement before the drag delay');
  f.advance(20); assert(f.wrap.classList.contains('dragging'));
  let last = f.center()[0];
  for (let step = 1; step <= 20; step++) {
    f.pointer('pointermove', x - 30 - step * 12, y); f.advance(1000 / 60);
    const now = f.center()[0]; assert(now <= last + 1e-9 && now >= x - 30 - step * 12 - 1e-9, 'the bubble trails the pointer and never passes it'); last = now;
  }
  assert.equal(f.wrap.querySelector('.oa-orb-squash').getAttribute('transform').endsWith('scale(1.0000 1.0000)'), true, 'logo and labels keep their shape while the contour stretches');
  f.pointer('pointerup', x - 270, y); const released = f.center(); f.advance(2500);
  assert(f.center()[0] < released[0], 'a short glide continues in the drag direction');
  assert.deepEqual(f.actions, []); assertIdle(f);
  assert.deepEqual(JSON.parse(f.storage.get('opisai.demo.bubble.v1')), { x: Math.round(f.center()[0]), y: Math.round(f.center()[1]) });
});

test('dropping on a visible field soaks into it, describes only that field and re-emerges at the press point', () => {
  const f = fixture(), [x, y] = f.center();
  f.pointer('pointerdown', x, y); f.advance(200);
  f.over(f.fields.badanie); f.pointer('pointermove', 400, 310); f.advance(50);
  assert.equal(f.doc.querySelectorAll('.oa-field-mark').length, 1, 'marching frame over the target field');
  f.pointer('pointerup', 400, 310);
  assert.equal(f.doc.querySelectorAll('.oa-field-mark').length, 0); assert.deepEqual(f.actions, [], 'the action waits for the soak');
  f.advance(300); assert(Math.abs(f.center()[0] - 400) < 120, 'the bubble flows towards the field centre');
  f.advance(400);
  assert.deepEqual(plain(f.actions), [{ type: 'prepare', field: 'badanie' }]);
  f.advance(1200); assert.deepEqual(f.center(), [x, y]); assert(!f.wrap.classList.contains('is-hidden')); assertIdle(f);
});

test('a field covered by another window is not a drop target', () => {
  const f = fixture(), [x, y] = f.center(), cover = f.doc.createElement('section'); f.doc.body.append(cover);
  f.pointer('pointerdown', x, y); f.advance(200); f.over(cover, f.fields.wywiad); f.pointer('pointermove', 300, 160); f.advance(50);
  assert.equal(f.doc.querySelectorAll('.oa-field-mark').length, 0);
  f.pointer('pointerup', 300, 160); f.advance(2500); assert.deepEqual(f.actions, []);
});

test('a drop during generation is a plain move; during an open review it only recalls the view', () => {
  const busy = fixture(), [x, y] = busy.center(); busy.api.state.job = { cancel() {} }; busy.api.setPhase('processing');
  busy.pointer('pointerdown', x, y); busy.advance(200); busy.over(busy.fields.wywiad); busy.pointer('pointermove', 300, 160); busy.advance(50);
  assert.equal(busy.doc.querySelectorAll('.oa-field-mark').length, 0); busy.pointer('pointerup', 300, 160); busy.advance(1500);
  assert.deepEqual(busy.actions, []);
  const f = fixture(); f.api.open('opisai-review'); f.shown.length = 0; const [ax, ay] = f.center();
  f.pointer('pointerdown', ax, ay); f.advance(200); f.over(f.fields.wywiad); f.pointer('pointermove', 300, 160); f.advance(50); f.pointer('pointerup', 300, 160); f.advance(2000);
  assert.deepEqual(f.actions, [], 'the review keeps its result'); assert.deepEqual(f.shown, ['opisai-review']); assert.deepEqual(f.center(), [ax, ay]);
});

test('no visit sub-window: red Błąd for 3 s and a notice budding from the bubble (never opens a visit)', () => {
  const f = fixture({ editor: false });
  f.click(); assert.equal(f.phase, 'error'); assert.deepEqual(f.actions, []);
  f.advance(450);
  const card = f.doc.querySelector('.oa-error-card');
  assert(card, 'the notice spawns at the bulge peak');
  assert.match(card.html, /⚠  Błąd/); assert.match(card.html, /Nie znaleziono podokna opisu wizyty \(fragment: &#39;Rejestracja wizyty&#39;\)/);
  assert.match(card.html, /OpisAI nie wybiera wizyty/); assert.doesNotMatch(card.html, /Uruchom Klinikę/);
  assert.match(card.html, /aria-label="Zamknij komunikat"/); assert.match(card.html, /Kopiuj komunikat do schowka/);
  assert.equal(card.querySelector('.oa-error-action').getAttribute('title'), 'Kliknij aby otworzyć konfigurację', 'rc32 default action: open the configuration');
  f.advance(2600); assert.equal(f.phase, 'idle', 'Błąd returns to idle after 3 s'); assert.deepEqual(f.opened, []);
});

test('Klinika not running: the notice offers "▶ Uruchom Klinikę", which starts Klinika but not a visit', () => {
  const f = fixture({ editor: false, main: false });
  f.click(); f.advance(450);
  const action = f.doc.querySelector('.oa-error-action');
  assert(action); assert.equal(action.getAttribute('title'), 'Uruchom Klinikę XP (wizytę otwierasz sam)');
  assert.match(f.doc.querySelector('.oa-error-card').html, /Nie znaleziono Kliniki \(main: &#39;Klinika&#39;, sub: &#39;Rejestracja wizyty&#39;\)/);
  action.dispatchEvent({ type: 'click' }); f.advance(400);
  assert.deepEqual(f.opened, ['main'], 'only the main window opens'); assert.equal(f.clinic.editor, false);
  assert.equal(f.doc.querySelectorAll('.oa-error-card').length, 0, 'the notice closes');
  assert.equal(f.api.state.handlingFailure, false, 'rc32 _launch_klinika: the next failure is shown again');
});

test('Gotowe returns after 4 s, but not while the bubble is held', () => {
  const f = fixture(); f.api.setPhase('done'); f.advance(3900); assert.equal(f.phase, 'done');
  const [x, y] = f.press(400); assert.equal(f.phase, 'done', 'a held bubble keeps its result');
  f.pointer('pointerup', x, y); f.advance(150); assert.equal(f.phase, 'idle');
});

test('right click shows the tray menu 1:1 (order, separators and submenus)', () => {
  const f = fixture(), [x, y] = f.center();
  f.orb.dispatchEvent({ type: 'contextmenu', clientX: x, clientY: y });
  assert.equal(f.menus.length, 1); const { items, options } = f.menus[0];
  assert.deepEqual(plain(items.map(item => item.separator ? '---' : item.label + (item.children ? ' ►' : ''))), [
    'Wybierz okno główne...', 'Wybierz podokno opisu...', 'Wskaż pole tekstowe ►', 'Skonfiguruj rączki (main)...', '---',
    '🎤  Dyktowanie (lub przytrzymaj bąbelek)', '🎙  Profil głosu (rozpoznawanie mówców)…', 'Podpowiedzi pisowni ►', '🎮  Tryb fizyki (easter egg)', '---',
    'Konfiguracja...', '---', 'O aplikacji...', '---', 'Zamknij', '---', 'Bezpieczny zapis i odzyskiwanie ►']);
  const sub = label => plain(items.find(item => item.label === label).children().map(item => item.label + (item.disabled ? ' (wył.)' : '') + (item.checked ? ' ✓' : '')));
  // rc32 _refresh_spelling_menu: suggestions and undo need the spelling service, the setting and an active visit
  // window; this fixture has no spelling service, so both are disabled and the status keeps its first text.
  assert.deepEqual(sub('Podpowiedzi pisowni'), ['Podkreślaj podejrzane słowa w Klinice ✓', 'Sugestie dla aktywnej wizyty… (wył.)', 'Cofnij ostatnią poprawkę pisowni (wył.)', 'Mój słownik…', 'Sprawdzanie pisowni (wył.)']);
  assert.deepEqual(sub('Bezpieczny zapis i odzyskiwanie'), ['Cofnij ostatni potwierdzony wpis…', 'Sprawdź niepotwierdzone operacje…']);
  assert.deepEqual(sub('Wskaż pole tekstowe'), ['Wywiad:', 'Badanie kliniczne:', 'Diagnoza:']);
  assert.equal(options.className, 'oa-menu'); assert.equal(options.flip, true);
  assert(!items.some(item => /Historia|Ukryj|Kontakt|Przygotuj opis/.test(item.label || '')), 'no entries rc32 does not have');
  for (const label of ['Wybierz okno główne...', 'Wybierz podokno opisu...', 'Skonfiguruj rączki (main)...']) items.find(item => item.label === label).onClick();
  assert.equal(f.doc.querySelectorAll('.status-toast').length, 1, 'each "niedostępne" notice replaces the last; they never stack over the bubble');
  assert.match(f.toasts.at(-1), /„Skonfiguruj rączki” jest niedostępne w demonstracji/);
  options.onClose(); const [px, py] = f.press(100); f.pointer('pointerup', px, py); f.advance(100);
  assert.deepEqual(f.actions, [], 'the click that closes the menu does not reach the bubble');
});

test('the spelling submenu follows the one spelling state (rc32 _refresh_spelling_menu, _set_spelling_enabled)', () => {
  const calls = []; let host = null, available = true;
  const spelling = { connect(next) { host = next; }, refresh() { calls.push('refresh'); }, available: () => available, status: () => 'Pisownia gotowa · słownik demonstracyjny',
    showIssues() { calls.push('issues'); }, undo() { calls.push('undo'); }, editWords() { calls.push('words'); } };
  const f = fixture({ spelling }), [x, y] = f.center(), open = () => { f.menus.length = 0; f.orb.dispatchEvent({ type: 'contextmenu', clientX: x, clientY: y }); return f.menus[0].items.find(item => item.label === 'Podpowiedzi pisowni').children(); };
  assert(host, 'OpisAI connects its state to the spelling layer');
  const sub = () => plain(open().map(item => item.label + (item.disabled ? ' (wył.)' : '') + (item.checked ? ' ✓' : '')));
  assert.deepEqual(sub(), ['Podkreślaj podejrzane słowa w Klinice ✓', 'Sugestie dla aktywnej wizyty…', 'Cofnij ostatnią poprawkę pisowni', 'Mój słownik…', 'Pisownia gotowa · słownik demonstracyjny (wył.)']);
  const items = open(); items[1].onClick(); items[2].onClick(); items[3].onClick();
  assert.deepEqual(calls, ['issues', 'undo', 'words']);
  available = false; assert.deepEqual(sub().slice(1, 3), ['Sugestie dla aktywnej wizyty… (wył.)', 'Cofnij ostatnią poprawkę pisowni (wył.)'], 'no active visit window: both disabled');
  open()[0].onClick();
  assert.equal(host.enabled(), false, 'the check item is the one source of the setting'); assert.equal(f.api.preferences.spelling, false);
  assert.equal(JSON.parse(f.storage.get('opisai-demo-settings-v12')).spelling, false, 'and it is saved'); assert.equal(calls.at(-1), 'refresh');
  available = true; assert.deepEqual(sub().slice(0, 3), ['Podkreślaj podejrzane słowa w Klinice', 'Sugestie dla aktywnej wizyty… (wył.)', 'Cofnij ostatnią poprawkę pisowni (wył.)'], 'off: nothing to suggest or undo');
  open()[0].onClick(); assert.equal(host.enabled(), true);
  // SafeCoordinator.busy: no lines while OpisAI works; its passive windows do not count.
  assert.equal(host.busy(), false);
  f.api.open('opisai-about'); assert.equal(host.busy(), false, 'About is not work');
  const review = f.api.open('opisai-review'); assert.equal(host.busy(), true, 'an open work view'); review.close(); assert.equal(host.busy(), false);
  f.api.setPhase('processing'); assert.equal(host.busy(), true); f.api.setPhase('idle');
  f.api.state.recording = {}; assert.equal(host.busy(), true, 'dictation'); f.api.state.recording = null;
  assert.equal(host.running(), true); f.api.closeApp(); f.advance(2000); assert.equal(host.running(), false, 'a closed OpisAI draws nothing');
});

test('the spelling lines come back after "Odrzuć" or × on the preview: the operation record is not work (SafeCoordinator.busy)', () => {
  let host = null; const spelling = { connect(next) { host = next; }, refresh() {}, available: () => true, status: () => '', showIssues() {}, undo() {}, editWords() {} };
  const f = fixture({ spelling });
  f.api.state.operation = { id: 1 }; assert.equal(host.busy(), false, 'an operation record with no work view open');
  // generate → review → "Odrzuć" (or the preview's ×): the view closes and the phase returns to idle, the record stays behind
  const view = f.api.open('opisai-review'); f.api.state.operation = { id: 2 }; f.api.state.review = { id: 2 }; f.api.setPhase('review');
  assert.equal(host.busy(), true, 'the preview is work');
  view.close(); f.api.state.review = null; f.api.state.active = null; f.api.setPhase('idle');
  assert.equal(host.busy(), false, 'the lines come back'); assert.deepEqual(plain(f.api.state.operation), { id: 2 });
});

test('spelling busy names OpisAI\'s work as SafeCoordinator.busy does; its notices and reports are not work', () => {
  let host = null; const spelling = { connect(next) { host = next; }, refresh() {}, available: () => true, status: () => '', showIssues() {}, undo() {}, editWords() {} };
  const f = fixture({ spelling });
  for (const id of ['opisai-compose', 'opisai-review', 'opisai-undo', 'opisai-progress', 'opisai-settings', 'opisai-dictation', 'opisai-discard']) {
    const view = f.api.open(id); assert.equal(host.busy(), true, id); view.close(); assert.equal(host.busy(), false, id + ' closed');
  }
  // _say() message boxes, _show_problem's recovery report (opened after job and _writing are cleared), the exchange view,
  // the Gemini consent question (some open in the documentation and dictation views), history, About and a profile view
  for (const id of ['opisai-message', 'opisai-recovery', 'opisai-exchange', 'opisai-gemini-consent', 'opisai-history', 'opisai-clear-history', 'opisai-history-delete', 'opisai-about', 'opisai-profile']) f.api.open(id);
  assert.equal(host.busy(), false, 'they keep the lines');
});

test('the menu and the model tooltip follow the OpisAI theme, not the desktop theme', () => {
  for (const [theme, dark] of [['light', false], ['dark', true], ['blue', false]]) {
    const f = fixture({ prefs: { theme } }), [x, y] = f.center(); f.doc.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    f.orb.dispatchEvent({ type: 'contextmenu', clientX: x, clientY: y });
    assert.equal(f.menus[0].options.className, dark ? 'oa-menu oa-theme-dark' : 'oa-menu', theme);
    f.wrap.dispatchEvent({ type: 'pointerover' }); f.orb.dispatchEvent({ type: 'pointermove', buttons: 0, pointerId: 9, clientX: x, clientY: y }); f.advance(800);
    const hint = f.doc.querySelector('.oa-orb-hint'); assert(hint && !hint.hidden, theme); assert.equal(hint.classList.contains('oa-theme-dark'), dark, theme);
  }
});

test('labelled actions per state appear 250 ms after hovering and go 300 ms after leaving', () => {
  const expected = { idle: ['describe', 'dictate'], processing: ['show', 'cancel'], recording: ['finish', 'show'], review: ['show'], done: [], error: [] };
  for (const [phase, chips] of Object.entries(expected)) { const f = fixture(); f.api.setPhase(phase); assert.deepEqual(f.chips(), chips, phase); }
  const f = fixture(), actions = f.wrap.querySelector('.oa-orb-actions');
  f.wrap.dispatchEvent({ type: 'pointerover' }); f.advance(230); assert.equal(Number(actions.style.opacity), 0);
  f.advance(500); assert.equal(Number(actions.style.opacity), 1); assert(actions.classList.contains('is-live'));
  f.wrap.dispatchEvent({ type: 'pointerout', relatedTarget: null }); f.advance(250); assert.equal(Number(actions.style.opacity), 1);
  f.advance(500); assert.equal(Number(actions.style.opacity), 0);
});

test('reduced motion: hovering or keyboard focus shows the actions at once, also with frames stamped before the kick', () => {
  const f = fixture({ reduced: true, rafLag: 6 }), actions = f.wrap.querySelector('.oa-orb-actions');
  f.wrap.dispatchEvent({ type: 'pointerover' }); f.advance(300);
  assert.equal(Number(actions.style.opacity), 1, 'hover shows the actions'); assert(actions.classList.contains('is-live'), 'and makes them clickable');
  f.wrap.dispatchEvent({ type: 'pointerout', relatedTarget: null }); f.advance(400);
  assert.equal(Number(actions.style.opacity), 0); assert(!actions.classList.contains('is-live'));
  const chip = f.wrap.querySelector('[data-orb-action="describe"]'), outside = f.doc.createElement('button'); f.doc.body.append(outside);
  chip.focus(); f.wrap.dispatchEvent({ type: 'focusin', target: chip }); f.advance(50);
  assert.equal(Number(actions.style.opacity), 1, 'a focused action is never invisible'); assert(actions.classList.contains('is-live'));
  outside.focus(); f.wrap.dispatchEvent({ type: 'focusout', target: chip, relatedTarget: outside }); f.advance(50);
  assert.equal(Number(actions.style.opacity), 0, 'the actions go with the focus'); assertIdle(f);
});

test('keyboard focus shows the actions every time it enters the bubble and hides them every time it leaves', () => {
  const f = fixture({ rafLag: 6 }), actions = f.wrap.querySelector('.oa-orb-actions'), chip = f.wrap.querySelector('[data-orb-action="dictate"]');
  const outside = f.doc.createElement('button'); f.doc.body.append(outside);
  for (let round = 0; round < 6; round++) {
    const target = round % 2 ? chip : f.orb;
    target.focus(); f.wrap.dispatchEvent({ type: 'focusin', target }); f.advance(500);
    assert.equal(Number(actions.style.opacity), 1, `focus ${round}`);
    outside.focus(); f.wrap.dispatchEvent({ type: 'focusout', target, relatedTarget: outside }); f.advance(500);
    assert.equal(Number(actions.style.opacity), 0, `leave ${round}`);
  }
  assertIdle(f);
});

test('reduced motion: REC shows the five still bars at once, not the cross', () => {
  const f = fixture({ reduced: true }); f.api.setPhase('recording'); f.advance(50);
  assert.equal(f.wrap.querySelector('.oa-orb-wordmark').textContent, 'REC');
  assert.equal(f.wrap.querySelector('[data-part="arm"]').style.display, 'none', 'no cross arm');
  const bars = [0, 1, 2, 3, 4].map(i => f.wrap.querySelector(`[data-bar="${i}"]`));
  assert(bars.every(bar => bar.style.display !== 'none'), 'five bars');
  assert.deepEqual(bars.map(bar => bar.getAttribute('height')), ['19.41', '8.49', '19.41', '8.49', '19.41'], 'tall, short, tall, short, tall');
  assertIdle(f);
});

test('state changes are announced in a polite status region; the notice message is an alert', () => {
  const f = fixture(), live = f.doc.querySelector('.oa-orb-status');
  assert.equal(live.getAttribute('role'), 'status'); assert.equal(live.getAttribute('aria-live'), 'polite'); assert(!f.wrap.contains(live), 'audible while the bubble is hidden');
  f.api.setPhase('processing'); assert.equal(live.textContent, 'OpisAI — przetwarzanie');
  f.api.setPhase('recording'); assert.equal(live.textContent, 'OpisAI — nagrywanie (REC)');
  f.api.setPhase('review'); assert.equal(live.textContent, 'OpisAI — Sprawdź');
  f.api.setPhase('idle'); assert.equal(live.textContent, '', 'idle clears it, so the next state is heard even when repeated');
  f.api.setPhase('done'); assert.equal(live.textContent, 'OpisAI — Gotowe');
  const g = fixture({ editor: false }); g.click(); assert.equal(g.doc.querySelector('.oa-orb-status').textContent, 'OpisAI — Błąd');
  g.advance(450); const card = g.doc.querySelector('.oa-error-card');
  assert.equal(card.getAttribute('role'), 'group', 'not an alertdialog: the notice never takes the focus');
  assert.equal(card.querySelector('.oa-error-body').getAttribute('role'), 'alert');
});

test('"Anuluj" stops the microphone start or the last-text receipt; "Pokaż" brings the receipt forward', () => {
  const f = fixture(); f.api.state.recording = { listening: false, tick: 0, canvasFrame: 0 }; f.api.setPhase('processing'); f.advance(20);
  assert.deepEqual(f.chips(), ['show', 'cancel']);
  f.wrap.querySelector('[data-orb-action="cancel"]').dispatchEvent({ type: 'click' });
  assert.equal(f.api.state.recording, null, 'the start is aborted'); assert.equal(f.phase, 'idle'); assert.match(f.toasts.at(-1), /Dyktowanie anulowane/);
  let delivered = 0;
  f.api.state.receipt = { deliver() { delivered++; f.api.state.receipt = null; } }; f.api.setPhase('processing'); f.advance(20);
  f.wrap.querySelector('[data-orb-action="show"]').dispatchEvent({ type: 'click' }); assert.equal(delivered, 1, '"Pokaż" shows the review at once');
  f.api.state.receipt = { deliver() { delivered++; } }; f.api.setPhase('processing'); f.advance(20);
  f.wrap.querySelector('[data-orb-action="cancel"]').dispatchEvent({ type: 'click' });
  assert.equal(f.api.state.receipt, null); assert.equal(f.phase, 'idle'); assert.equal(delivered, 1, 'a cancelled receipt is never reviewed');
});

test('the drop frame marches like the Qt pen: [6, 5] in 2.4 px pen widths, square caps, about 90 px/s', () => {
  const css = fs.readFileSync(path.join(__dirname, '../assets/opisai.css'), 'utf8'), ants = css.match(/\.oa-field-mark \.ants\s*\{([^}]*)\}/)[1];
  assert.match(ants, /stroke-width:\s*2\.4;/); assert.match(ants, /stroke-dasharray:\s*14\.4 12;/); assert.match(ants, /stroke-linecap:\s*square;/);
  const duration = Number(ants.match(/animation:\s*oa-ants\s+([\d.]+)s/)[1]), offset = Number(css.match(/@keyframes oa-ants\s*\{\s*to\s*\{\s*stroke-dashoffset:\s*(-?[\d.]+)/)[1]);
  assert.equal(offset, -26.4, 'one 26.4 px period per cycle, marching forward'); assert(Math.abs(26.4 / duration - 1.5 * 2.4 * 25) < 1, 'rc32 moves -1.5 pen widths every 40 ms');
});

test('interrupted gestures clear capture and hold without a later action', () => {
  for (const ending of ['cancel', 'lost', 'blur', 'hidden', 'escape', 'contextmenu', 'reduced', 'resize']) {
    const f = fixture(), [x, y] = f.press(160);
    if (ending === 'cancel') f.pointer('pointercancel', x, y);
    else if (ending === 'lost') f.orb.releasePointerCapture(7);
    else if (ending === 'blur') f.win.dispatchEvent({ type: 'blur' });
    else if (ending === 'hidden') { f.doc.hidden = true; f.doc.dispatchEvent({ type: 'visibilitychange' }); f.doc.hidden = false; }
    else if (ending === 'escape') f.orb.dispatchEvent({ type: 'keydown', key: 'Escape' });
    else if (ending === 'contextmenu') f.orb.dispatchEvent({ type: 'contextmenu', clientX: x, clientY: y });
    else if (ending === 'reduced') f.reduced(true);
    else f.resize(900, 700);
    f.advance(600); f.pointer('pointerup', x, y); f.advance(1500);
    assert.deepEqual(f.actions, [], ending); assert.equal(f.orb.hasPointerCapture(7), false, ending);
  }
});

test('secondary pointers cannot move, cancel or complete the active gesture', () => {
  const f = fixture(), [x, y] = f.press(10), before = f.center();
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) f.pointer(type, 300, 100, { pointerId: 8, isPrimary: false });
  assert.deepEqual(f.center(), before); assert(f.orb.hasPointerCapture(7)); assert.deepEqual(f.actions, []);
  f.pointer('pointercancel', x, y); f.advance(500); assertIdle(f);
});

test('reduced motion: direct dragging, no glide and no idle bounce', () => {
  const f = fixture({ reduced: true }), [x, y] = f.center();
  f.pointer('pointerdown', x, y); f.advance(200); f.pointer('pointermove', x - 100, y - 60); f.advance(20);
  assert.deepEqual(f.center(), [x - 100, y - 60]);
  f.pointer('pointerup', x - 100, y - 60); f.advance(30000);
  assert.deepEqual(f.center(), [x - 100, y - 60], 'no glide and no bounce'); assertIdle(f);
});

test('after 10 s without input the bubble bounces on the taskbar and returns home', () => {
  const f = fixture(), [x, y] = f.center(); let lowest = y, start = null;
  for (let t = 2000; t < 17000; t += 50) { f.advance(50); if (start === null && f.center()[1] !== y) start = t; lowest = Math.max(lowest, f.center()[1]); }
  assert(start >= 10000 && start <= 11100, 'the default interval is 10 s of inactivity'); assert(lowest > 752 - 60, 'the bubble falls onto the taskbar');
  f.advance(2500); assert.deepEqual(f.center(), [x, y], 'it returns to its place'); assertIdle(f);
  let again = false; for (let t = 0; t < 8000; t += 50) { f.advance(50); again ||= f.center()[1] !== y; }
  assert(again, 'no limit by default: it bounces every interval while idle');
  const once = fixture({ prefs: { bounceMax: 1 } }); let moves = 0, was = once.center()[1];
  for (let t = 0; t < 40000; t += 50) { once.advance(50); const now = once.center()[1]; if (now !== was && was === y) moves++; was = now; }
  assert.equal(moves, 1, '"Maks. odbić w sesji" limits one idle period');
  const active = fixture(); for (let t = 0; t < 25000; t += 1000) { active.doc.dispatchEvent({ type: 'pointermove' }); active.advance(1000); }
  assert.deepEqual(active.center(), [x, y], 'user activity postpones it');
  const off = fixture({ prefs: { idleBounce: false } }); off.advance(25000); assert.deepEqual(off.center(), [x, y], 'the setting turns it off');
  const busy = fixture(); busy.api.open('opisai-settings'); busy.advance(25000); assert.deepEqual(busy.center(), [x, y], 'not while an OpisAI window is open');
});

test('position: rc32 default corner, remembered position and rescue of a lost bubble', () => {
  const f = fixture(); assert.deepEqual(f.center(), [1200 - 170, 752 - 200]);
  assert.deepEqual(fixture({ saved: { x: 400, y: 300 } }).center(), [400, 300]);
  assert.deepEqual(fixture({ saved: { x: 5000, y: 300 } }).center(), [1030, 552], 'an off-screen saved position falls back to the default');
  const lost = fixture({ reduced: true }), [x, y] = lost.center();
  lost.pointer('pointerdown', x, y); lost.advance(200); lost.pointer('pointermove', -300, -300); lost.pointer('pointerup', -300, -300);
  lost.advance(300); assert.deepEqual(lost.center(), [1200 - 20 - 50, 752 - 20 - 50], 'a fully off-screen bubble returns to the bottom-right corner');
});

test('"Zamknij" plays the exit and hides the bubble until OpisAI is started again', () => {
  const f = fixture(); f.api.closeApp(); f.advance(200);
  assert(!f.wrap.classList.contains('is-hidden'), 'collapse and ripple first'); f.advance(300);
  assert(f.wrap.classList.contains('is-hidden')); assert.equal(f.api.state.closed, true); assert(f.toasts.some(text => /zasobniku/.test(text)));
  f.advance(30000); assert(f.wrap.classList.contains('is-hidden'), 'no rescue of a closed app');
  f.doc.dispatchEvent({ type: 'pointerdown' }); f.api.showBubble(); f.advance(50); assert(!f.wrap.classList.contains('is-hidden')); f.advance(2000); assertIdle(f);
});
