'use strict';

// Execute the real orb controller and motion model. Only the application actions
// that open clinical workflows are replaced with spies; pointer/timer/rAF logic
// and the orb DOM are the production code. Rendering remains a browser QA task.
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
  prepare=options=>{__actions.push({type:'prepare',field:options?.field||null});setPhase('preparing');};
  dictate=()=>{__actions.push({type:'dictate'});state.recording={};setPhase('recording');};
  finishDictation=()=>{__actions.push({type:'finish'});state.recording=null;setPhase('idle');};
  showActive=()=>__actions.push({type:'show'});
  Object.assign(__orbHarness,{mount:createOrb,hide:hideBubble,show:showBubble,setPhase,
    setAnimations(value){preferences.animations=value;updateOrbSize();}});
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
    this.attributes = new Map(); this.dataset = {}; this.className = ''; this.hidden = false; this.captures = new Set();
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
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) return this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
    return this.tagName === selector.toUpperCase();
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return { top: Number(this.style.top) || 0 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { if (this.captures.delete(id)) this.dispatchEvent({ type: 'lostpointercapture', pointerId: id }); }
}

function fixture({ reduced = false, animations = true } = {}) {
  const doc = new Target(), win = new Target(), media = new Target(), frames = new Map(), timers = new Map();
  const actions = [], marks = [], menus = [], api = {}; let now = 0, serial = 0, hit = null, probes = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.createElement = tag => new Element(tag, doc); doc.querySelector = selector => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector); doc.getElementById = id => doc.querySelector('#' + id);
  doc.hidden = false; doc.elementsFromPoint = () => { probes++; return hit ? [hit] : []; };
  const overlay = doc.createElement('div'); overlay.setAttribute('id', 'overlay-layer'); doc.body.append(overlay);
  const taskbar = doc.createElement('div'); taskbar.setAttribute('id', 'taskbar'); taskbar.style.top = 752; doc.body.append(taskbar);
  media.matches = reduced;
  const context = vm.createContext({ window: win, document: doc, Element, __actions: actions, __orbHarness: api,
    innerWidth: 1200, innerHeight: 800, performance: { now: () => now }, matchMedia: () => media,
    localStorage: { getItem: () => JSON.stringify({ animations }), setItem() {} }, sessionStorage: { getItem: () => '1', setItem() {} },
    Clinic: { markTarget: (field, active) => marks.push({ field, active }) }, Shell: { menu: entries => menus.push(entries) },
    setTimeout: (fn, delay) => { timers.set(++serial, { fn, due: now + delay }); return serial; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; }, cancelAnimationFrame: id => frames.delete(id)
  });
  vm.runInContext(motionSource, context, { filename: 'assets/orb-motion.js' });
  vm.runInContext(controllerSource, context, { filename: 'assets/opisai.js' }); api.mount();
  const wrap = doc.querySelector('.oa-orb-wrap'), orb = wrap.querySelector('.oa-orb');
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (now < end) {
      now = Math.min(end, now + 1000 / 60);
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due))
        if (timer.due <= now && timers.delete(id)) timer.fn();
      const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
    }
  }
  function pointer(type, x, y, extra = {}) {
    const event = { type, button: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: y, timeStamp: now, ...extra };
    orb.dispatchEvent(event);
    if ((type === 'pointerup' || type === 'pointercancel') && orb.hasPointerCapture(event.pointerId)) orb.releasePointerCapture(event.pointerId);
    return event;
  }
  return { doc, win, orb, wrap, api, actions, marks, menus, pointer, advance,
    get pendingFrames() { return frames.size; }, get pendingTimers() { return timers.size; }, get probes() { return probes; },
    position() { return wrap.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px/).slice(1).map(Number); },
    hit(field) { hit = field ? doc.createElement('textarea') : null; hit?.setAttribute('data-clinic-field', field); },
    reduced(value) { media.matches = value; media.dispatchEvent({ type: 'change', matches: value }); },
    resize(width, height) { context.innerWidth = width; context.innerHeight = height; taskbar.style.top = height - 48; win.dispatchEvent({ type: 'resize' }); }
  };
}
function flick(f) {
  const [x, y] = f.position(); f.pointer('pointerdown', x + 50, y + 50); f.advance(16);
  f.pointer('pointermove', x - 120, y + 80); f.advance(16); f.pointer('pointerup', x - 170, y + 90);
}
function assertStopped(f) {
  assert.equal(f.pendingFrames, 0); assert.equal(f.pendingTimers, 0); assert.equal(f.orb.hasPointerCapture(7), false);
  for (const name of ['dragging', 'holding', 'coasting']) assert.equal(f.wrap.classList.contains(name), false, name);
  assert.equal(Number(f.wrap.style['--oa-orb-stretch']), 1, 'The resting bubble must be round');
  assert.equal(Number(f.wrap.style['--oa-orb-squash']), 1);
}
const plain = value => JSON.parse(JSON.stringify(value));

test('pointer, keyboard and assistive activation are single actions; idle has no animation loop', () => {
  for (const kind of ['pointer', 'keyboard', 'assistive']) {
    const f = fixture(); assert.equal(f.pendingFrames, 0);
    if (kind === 'pointer') {
      f.pointer('pointerdown', 1100, 350); f.advance(70); f.pointer('pointerup', 1101, 350);
      f.orb.dispatchEvent({ type: 'click', detail: 1 });
    } else if (kind === 'keyboard') {
      const event = { type: 'keydown', key: 'Enter' }; f.orb.dispatchEvent(event);
      assert(event.defaultPrevented, 'Prevent the native keyboard click after the explicit activation');
    } else f.orb.dispatchEvent({ type: 'click', detail: 0 });
    assert.deepEqual(plain(f.actions), [{ type: 'prepare', field: null }]); assertStopped(f);
  }
});

test('a fling coasts but neither its synthetic click nor crossing a field starts an action', () => {
  const f = fixture(); flick(f); assert(f.wrap.classList.contains('coasting')); assert.equal(f.pendingFrames, 1);
  f.orb.dispatchEvent({ type: 'click', detail: 1 }); f.hit('wywiad');
  const before = f.position(), probes = f.probes; f.advance(80);
  assert.notDeepEqual(f.position(), before); assert.equal(f.probes, probes, 'Coasting must not perform drop hit tests');
  f.advance(2000); assertStopped(f); assert.deepEqual(f.actions, []); assert.deepEqual(f.marks, []);
});

test('a held drag visibly stretches the rendered bubble and release springs back without an action', () => {
  const f = fixture(), [x, y] = f.position();
  f.pointer('pointerdown', x + 50, y + 50);
  for (let frame = 1; frame <= 18; frame++) {
    f.pointer('pointermove', x + 50 - frame * 10, y + 50);
    f.advance(1000 / 60);
  }
  const stretch = Number(f.wrap.style['--oa-orb-stretch']);
  assert(stretch > 1.2, 'An ordinary 600px/s drag must produce a clearly visible elongation');
  assert(Number(f.wrap.style['--oa-orb-squash']) < .85);
  assert(Math.abs(parseFloat(f.wrap.style['--oa-orb-angle'])) < .01, 'Stretch must follow the horizontal drag axis');
  assert(f.orb.hasPointerCapture(7)); assert(f.wrap.classList.contains('dragging'));
  f.pointer('pointerup', x + 50 - 180, y + 50);
  assert.equal(Number(f.wrap.style['--oa-orb-stretch']), stretch, 'Release must preserve the current shape');
  assert.equal(f.pendingFrames, 1);
  f.advance(80);
  assert(Number(f.wrap.style['--oa-orb-stretch']) > 1.01, 'The rubber must recover over time, not snap to a circle');
  f.advance(1500); assertStopped(f); assert.deepEqual(f.actions, []);
});

test('release uses its current field, commits once, and never starts a field action in a busy phase', () => {
  for (const phase of ['idle', 'processing', 'recording']) {
    const f = fixture(); f.api.setPhase(phase); f.pointer('pointerdown', 1100, 350); f.advance(16);
    f.hit('wywiad'); f.pointer('pointermove', 900, 350); f.advance(16);
    f.hit('badanie'); f.pointer('pointerup', 700, 350); f.orb.dispatchEvent({ type: 'click', detail: 1 });
    assert.deepEqual(plain(f.marks), [{ field: 'wywiad', active: true }, { field: 'wywiad', active: false },
      { field: 'badanie', active: true }, { field: 'badanie', active: false }]);
    assert.deepEqual(plain(f.actions), phase === 'idle' ? [{ type: 'prepare', field: 'badanie' }] : []); assertStopped(f);
  }
});

test('a fast release without a pointermove is still a drag, not a click', () => {
  const f = fixture(); f.pointer('pointerdown', 1100, 350); f.advance(20); f.pointer('pointerup', 900, 400);
  f.orb.dispatchEvent({ type: 'click', detail: 1 }); assert.deepEqual(f.actions, []);
  assert(f.wrap.classList.contains('coasting')); f.advance(2000); assertStopped(f);
});

test('interrupted gestures clear capture, target and hold without a later action', () => {
  for (const ending of ['cancel', 'lost', 'blur', 'hidden', 'hide', 'escape', 'contextmenu', 'reduced', 'resize']) {
    const f = fixture(); f.pointer('pointerdown', 1100, 350); f.advance(160); assert(f.wrap.classList.contains('holding'));
    f.hit('wywiad'); f.pointer('pointermove', 900, 350); f.advance(16);
    if (ending === 'cancel') f.pointer('pointercancel', 900, 350);
    else if (ending === 'lost') f.orb.releasePointerCapture(7);
    else if (ending === 'blur') f.win.dispatchEvent({ type: 'blur' });
    else if (ending === 'hidden') { f.doc.hidden = true; f.doc.dispatchEvent({ type: 'visibilitychange' }); }
    else if (ending === 'hide') f.api.hide();
    else if (ending === 'escape') f.orb.dispatchEvent({ type: 'keydown', key: 'Escape' });
    else if (ending === 'contextmenu') f.orb.dispatchEvent({ type: 'contextmenu', clientX: 900, clientY: 350 });
    else if (ending === 'reduced') f.reduced(true);
    else f.resize(600, 500);
    assertStopped(f); f.pointer('pointerup', 900, 350); f.advance(1000);
    assert.deepEqual(f.actions, [], ending); assert.deepEqual(plain(f.marks), [{ field: 'wywiad', active: true }, { field: 'wywiad', active: false }]);
  }
});

test('hiding, blur, resize and reduced motion stop a coast without catch-up on return', () => {
  for (const ending of ['blur', 'hidden', 'hide', 'resize', 'system', 'preference']) {
    const f = fixture(); flick(f); f.advance(32);
    if (ending === 'blur') f.win.dispatchEvent({ type: 'blur' });
    else if (ending === 'hidden') { f.doc.hidden = true; f.doc.dispatchEvent({ type: 'visibilitychange' }); }
    else if (ending === 'hide') f.api.hide();
    else if (ending === 'resize') f.resize(500, 400);
    else if (ending === 'system') f.reduced(true);
    else f.api.setAnimations(false);
    assertStopped(f); const stopped = f.position(); f.advance(2000);
    f.doc.hidden = false; f.doc.dispatchEvent({ type: 'visibilitychange' }); f.api.show();
    f.advance(100); assert.deepEqual(f.position(), stopped, ending); assertStopped(f); assert.deepEqual(f.actions, []);
    if (ending === 'resize') { assert(stopped[0] >= 8 && stopped[0] <= 392); assert(stopped[1] >= 8 && stopped[1] <= 190); }
  }
});

test('system and application reduced motion follow the pointer directly and never coast', () => {
  for (const options of [{ reduced: true }, { animations: false }]) {
    const f = fixture(options), [x, y] = f.position(); assert(f.wrap.classList.contains('reduced-motion'));
    f.pointer('pointerdown', x + 50, y + 50); f.advance(16); f.pointer('pointermove', x - 50, y + 80);
    assert.deepEqual(f.position(), [x - 100, y + 30]); assert.equal(f.pendingFrames, 0);
    f.pointer('pointerup', x - 50, y + 80); const released = f.position(); f.advance(1000);
    assert.deepEqual(f.position(), released); assert.equal(f.wrap.style['--oa-orb-stretch'], '1.0000');
    assertStopped(f); assert.deepEqual(f.actions, []);
  }
});

test('hold starts or finishes dictation once, while dragging and cancel stop the hold timer', () => {
  const held = fixture(); held.pointer('pointerdown', 1100, 350); held.advance(651);
  assert.deepEqual(plain(held.actions), [{ type: 'dictate' }]); held.pointer('pointerup', 1100, 350);
  held.orb.dispatchEvent({ type: 'click', detail: 1 }); assert.equal(held.actions.length, 1); assertStopped(held);
  held.pointer('pointerdown', 1100, 350); held.advance(651); held.pointer('pointerup', 1100, 350);
  assert.deepEqual(plain(held.actions), [{ type: 'dictate' }, { type: 'finish' }]); assertStopped(held);
  for (const action of ['drag', 'cancel']) {
    const f = fixture(); f.pointer('pointerdown', 1100, 350); f.advance(200);
    f.pointer(action === 'drag' ? 'pointermove' : 'pointercancel', 900, 350); f.advance(700);
    f.pointer('pointerup', 900, 350); f.advance(2000); assert.deepEqual(f.actions, [], action); assertStopped(f);
  }
});

test('secondary pointers cannot move, cancel or complete the active gesture', () => {
  const f = fixture(); f.pointer('pointerdown', 1100, 350); const before = f.position();
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
    f.pointer(type, 300, 100, { pointerId: 8, isPrimary: false });
  assert.deepEqual(f.position(), before); assert(f.orb.hasPointerCapture(7)); assert.deepEqual(f.actions, []);
  f.pointer('pointercancel', 1100, 350); assertStopped(f);
});
