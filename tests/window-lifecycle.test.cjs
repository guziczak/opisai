'use strict';

// Run the real Shell without desktop startup. This small DOM fixture checks
// lifecycle events and the matching animation rules, not browser rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const shellSource = fs.readFileSync(path.join(__dirname, '../assets/shell.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../assets/windows.css'), 'utf8');
const animationRules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .flatMap((match, order) => match[1].trim().split(',').map(selector => ({ selector: selector.trim(), body: match[2], order })))
  .filter(rule => /^\.desktop-window(?:\.[\w-]+)*$/.test(rule.selector))
  .map(rule => ({ ...rule, classes: rule.selector.slice(1).split('.'), animation: rule.body.match(/(?:^|;)\s*animation\s*:\s*([^;}]+)/)?.[1] }))
  .filter(rule => rule.animation);
function animationName(element) {
  const matching = animationRules.filter(rule => rule.classes.every(name => element.classList.contains(name)))
    .sort((a, b) => Number(a.animation.includes('!important')) - Number(b.animation.includes('!important'))
      || a.classes.length - b.classes.length || a.order - b.order);
  return matching.at(-1)?.animation.trim().split(/\s+/)[0] || 'none';
}

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatchEvent(event) {
    event.target ??= this; event.currentTarget = this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => {};
    event.stopImmediatePropagation ??= () => {};
    this['on' + event.type]?.(event);
    for (const callback of [...(this.listeners.get(event.type) || [])]) callback.call(this, event);
    return !event.defaultPrevented;
  }
}
class Element extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
    this.children = []; this.parentNode = null; this.attributes = new Map();
    this.style = {}; this.dataset = {}; this.hidden = false; this.className = ''; this.captures = new Set(); this._text = '';
    const classes = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      contains: name => classes().includes(name),
      add: (...names) => { this.className = [...new Set([...classes(), ...names])].join(' '); },
      remove: (...names) => { this.className = classes().filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !classes().includes(name); this.classList[on ? 'add' : 'remove'](name); return on; }
    };
  }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get isConnected() { return this === this.ownerDocument.documentElement || !!this.parentNode?.isConnected; }
  get offsetWidth() { return parseFloat(this.style.width) || 0; }
  get offsetHeight() { return parseFloat(this.style.height) || 0; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  set innerHTML(html) {
    this.replaceChildren(); this._text = '';
    const stack = [this];
    for (const token of String(html).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)) {
      const source = token[0];
      if (source.startsWith('</')) { stack.pop(); continue; }
      if (!source.startsWith('<')) { const text = new Element('#text', this.ownerDocument); text._text = source; stack.at(-1).append(text); continue; }
      const tag = source.match(/^<([\w-]+)/)[1], child = new Element(tag, this.ownerDocument);
      for (const attribute of source.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        child.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      stack.at(-1).append(child);
      if (!/^(?:input|img|br|hr|meta|link)$/i.test(tag) && !source.endsWith('/>')) stack.push(child);
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this.className = String(value);
    if (name === 'disabled') this.disabled = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  getAttribute(name) { return name === 'class' ? this.className : this.attributes.get(name) ?? null; }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  getClientRects() { return this.isConnected && !this.hidden && this.style.display !== 'none' ? [this.getBoundingClientRect()] : []; }
  getBoundingClientRect() { const x = parseFloat(this.style.left) || 0, y = parseFloat(this.style.top) || 0; return { x, y, left: x, top: y, width: this.offsetWidth, height: this.offsetHeight, right: x + this.offsetWidth, bottom: y + this.offsetHeight }; }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim(); if (this.tagName === '#TEXT') return false;
      const chain = part.split(/\s+/); if (chain.length > 1) return this.matches(chain.pop()) && !!this.parentNode?.closest(chain.join(' '));
      const tag = part.match(/^[\w-]+/)?.[0]; if (tag && tag.toUpperCase() !== this.tagName) return false;
      const id = part.match(/#([\w-]+)/)?.[1]; if (id && id !== this.id) return false;
      for (const match of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
      for (const match of part.matchAll(/\[([\w-]+)(?:=["']?([^\]'" ]+)["']?)?\]/g))
        if (this.getAttribute(match[1]) === null || match[2] !== undefined && this.getAttribute(match[1]) !== match[2]) return false;
      return true;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { if (this.captures.delete(id)) this.dispatchEvent({ type: 'lostpointercapture', pointerId: id }); }
}
function fixture() {
  const doc = new Target(), win = new Target(), timers = new Map(); let serial = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body); doc.activeElement = doc.body;
  doc.createElement = tag => new Element(tag, doc);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  for (const id of ['desktop', 'windows', 'snap-preview', 'shell-popups']) {
    const element = doc.createElement('div'); element.id = id; element.hidden = id === 'snap-preview'; doc.body.append(element);
  }
  vm.runInNewContext(shellSource, { window: win, document: doc, Node: Element,
    innerWidth: 1200, innerHeight: 800, localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout: callback => { timers.set(++serial, callback); return serial; }, clearTimeout: id => timers.delete(id)
  }, { filename: 'assets/shell.js' });
  const frame = win.Shell.createWindow({ id: 'clinic', title: 'Klinika XP', x: 100, y: 100, width: 500, height: 350 });
  return { win, doc, frame, shell: win.Shell, title: frame.el.querySelector('.titlebar'),
    preview: doc.querySelector('#snap-preview'),
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); }
  };
}
function pointer(target, type, x, y, extra = {}) {
  const event = { type, target, button: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: y, ...extra };
  target.dispatchEvent(event);
  // Browsers release capture implicitly after pointerup / pointercancel.
  if ((type === 'pointerup' || type === 'pointercancel') && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
}
function settle(frame, type = 'animationend') { frame.el.dispatchEvent({ type, animationName: 'window-open' }); }
function bounds(frame) { return ['left', 'top', 'width', 'height'].map(name => frame.el.style[name]); }
function assertReleased(f, target) {
  assert.equal(target.hasPointerCapture(7), false);
  for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) assert.equal(target.listeners.get(type)?.size || 0, 0);
  assert.equal(f.win.listeners.get('blur')?.size || 0, 0);
  assert.equal(animationName(f.frame.el), 'none', 'Finishing a gesture cannot re-enter the opacity-zero opening animation');
  assert.equal(f.frame.visible, true);
}

test('the opening animation ends once; ordinary focus does not replay it', () => {
  const f = fixture(); assert.equal(animationName(f.frame.el), 'window-open');
  f.frame.el.dispatchEvent({ type: 'animationend', animationName: 'child-effect' });
  f.frame.el.dispatchEvent({ type: 'animationend', animationName: 'window-open', target: f.title });
  assert.equal(animationName(f.frame.el), 'window-open', 'Unrelated or descendant animations cannot settle the window');
  settle(f.frame); assert.equal(animationName(f.frame.el), 'none');
  f.frame.focus(); assert.equal(animationName(f.frame.el), 'none');
  f.frame.minimize(); f.flushTimers(); assert.equal(f.frame.el.hidden, true);
  f.frame.show(); assert.equal(animationName(f.frame.el), 'window-open');
  settle(f.frame, 'animationcancel'); assert.equal(animationName(f.frame.el), 'none');
  f.shell.showDesktop(); f.flushTimers(); f.shell.showDesktop();
  assert.equal(animationName(f.frame.el), 'window-open', 'Show Desktop retains its normal restore animation');
  settle(f.frame); f.shell.createDesktop(); f.shell.switchDesktop('desktop-1');
  assert.equal(animationName(f.frame.el), 'window-open', 'Switching back to a desktop restores the window normally');
});

test('releasing a drag never restarts opening, even when grabbed before its first animation ends', () => {
  for (const alreadyOpened of [false, true]) {
    const f = fixture(); if (alreadyOpened) settle(f.frame);
    pointer(f.title, 'pointerdown', 200, 120);
    pointer(f.title, 'pointermove', 250, 160);
    assert(f.frame.el.classList.contains('dragging')); assert.equal(f.frame.el.style.left, '150px');
    const moved = bounds(f.frame); pointer(f.title, 'pointerup', 250, 160);
    assert(!f.frame.el.classList.contains('dragging')); assert.deepEqual(bounds(f.frame), moved);
    assertReleased(f, f.title); assert.equal(f.preview.hidden, true);
  }
});

test('resize and snap retain their geometry without re-entering opening', () => {
  const f = fixture(), handle = f.frame.el.querySelector('.resize-se');
  let resizes = 0; f.win.addEventListener('shell:resize', () => { resizes++; });
  pointer(handle, 'pointerdown', 600, 450); pointer(handle, 'pointermove', 650, 480);
  assert.equal(f.frame.el.style.width, '550px'); assert.equal(f.frame.el.style.height, '380px');
  pointer(handle, 'pointerup', 650, 480); assert(!f.frame.el.classList.contains('resizing'));
  assert.equal(resizes, 1, 'Release-triggered lost capture cannot finalize resize twice'); assertReleased(f, handle);
  pointer(f.title, 'pointerdown', 200, 120); pointer(f.title, 'pointermove', 2, 200);
  assert.equal(f.preview.hidden, false); pointer(f.title, 'pointerup', 2, 200);
  assert.equal(f.frame.el.style.left, '6px'); assert.equal(f.frame.el.style.width, '591px'); assertReleased(f, f.title);
  f.frame.maximize(); assert(f.frame.maximized); assert.equal(animationName(f.frame.el), 'none');
  pointer(f.title, 'pointerdown', 400, 10); pointer(f.title, 'pointermove', 450, 60);
  assert.equal(f.frame.maximized, false, 'Dragging a maximized window still restores its saved bounds');
  pointer(f.title, 'pointerup', 450, 60); assertReleased(f, f.title);
});

test('cancel, lost capture and blur clear drag without committing the snap preview', () => {
  for (const ending of ['pointercancel', 'lostpointercapture', 'blur']) {
    const f = fixture(); settle(f.frame);
    pointer(f.title, 'pointerdown', 200, 120); pointer(f.title, 'pointermove', 2, 2);
    assert.equal(f.preview.hidden, false); const moved = bounds(f.frame);
    if (ending === 'blur') f.win.dispatchEvent({ type: 'blur' });
    else if (ending === 'lostpointercapture') f.title.releasePointerCapture(7);
    else pointer(f.title, ending, 2, 2);
    assert.equal(f.frame.maximized, false); assert.deepEqual(bounds(f.frame), moved);
    assert.equal(f.preview.hidden, true); assert(!f.frame.el.classList.contains('dragging')); assertReleased(f, f.title);
    pointer(f.title, 'pointermove', 900, 600); assert.deepEqual(bounds(f.frame), moved, 'Cancelled listeners cannot move the window later');
  }
});

test('a different pointer cannot move or end the active gesture; interrupted resize cleans up once', () => {
  const f = fixture(), handle = f.frame.el.querySelector('.resize-se'); let resizes = 0;
  f.win.addEventListener('shell:resize', () => { resizes++; });
  pointer(handle, 'pointerdown', 600, 450); const before = bounds(f.frame);
  pointer(handle, 'pointermove', 800, 700, { pointerId: 8 }); pointer(handle, 'pointerup', 800, 700, { pointerId: 8 });
  assert.deepEqual(bounds(f.frame), before); assert(f.frame.el.classList.contains('resizing')); assert(handle.hasPointerCapture(7));
  pointer(handle, 'pointermove', 620, 470); const resized = bounds(f.frame); pointer(handle, 'pointercancel', 620, 470);
  assert.equal(resizes, 1); assert(!f.frame.el.classList.contains('resizing')); assertReleased(f, handle);
  pointer(handle, 'pointermove', 800, 700); assert.deepEqual(bounds(f.frame), resized);
});
