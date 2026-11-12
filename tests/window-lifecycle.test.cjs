'use strict';

// Run the real Shell without desktop startup. This small DOM fixture checks
// lifecycle events, the matching animation rules, the keys of open menus and
// the reset in Ustawienia, not browser rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const shellSource = fs.readFileSync(path.join(__dirname, '../assets/shell.js'), 'utf8');
const desktopSource = fs.readFileSync(path.join(__dirname, '../assets/desktop-apps.js'), 'utf8');
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
  remove() {
    // A removed element cannot keep the focus: browsers hand it to the body.
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null;
  }
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
// `storage` is what reading window.localStorage gives; a function stands for a browser that refuses the access.
// `desktopApps` also loads assets/desktop-apps.js and starts it (Ustawienia), still without the desktop startup of the shell.
function fixture({ storage = { getItem: () => null, setItem() {} }, desktopApps = false } = {}) {
  const doc = new Target(), win = new Target(), timers = new Map(); let serial = 0, reloads = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body); doc.activeElement = doc.body;
  doc.createElement = tag => new Element(tag, doc);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  for (const id of ['desktop', 'windows', 'snap-preview', 'shell-popups']) {
    const element = doc.createElement('div'); element.id = id; element.hidden = id === 'snap-preview'; doc.body.append(element);
  }
  const context = vm.createContext(Object.defineProperty({ window: win, document: doc, Node: Element,
    innerWidth: 1200, innerHeight: 800, Icons: { svg: () => '' }, location: { reload() { reloads++; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout: callback => { timers.set(++serial, callback); return serial; }, clearTimeout: id => timers.delete(id)
  }, 'localStorage', { get: typeof storage === 'function' ? storage : () => storage }));
  vm.runInContext(shellSource, context, { filename: 'assets/shell.js' });
  if (desktopApps) {
    context.Shell = win.Shell; vm.runInContext(desktopSource, context, { filename: 'assets/desktop-apps.js' });
    [...doc.listeners.get('DOMContentLoaded')].at(-1)(); // its own init; the shell's needs the whole desktop
  }
  const frame = win.Shell.createWindow({ id: 'clinic', title: 'Klinika XP', x: 100, y: 100, width: 500, height: 350 });
  return { win, doc, frame, shell: win.Shell, title: frame.el.querySelector('.titlebar'),
    preview: doc.querySelector('#snap-preview'), reloads: () => reloads,
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
// A key press as the page routes it: the document's capturing listeners first (the fixture runs no desktop startup, so
// these are the shell's menu keys alone); a key they do not stop reaches its target and then each ancestor.
function press(f, target, key, extra = {}) {
  const event = { type: 'keydown', key, target, defaultPrevented: false, stopped: false, ...extra };
  event.preventDefault = () => { event.defaultPrevented = true; };
  event.stopPropagation = event.stopImmediatePropagation = () => { event.stopped = true; };
  f.doc.dispatchEvent(event);
  for (let node = target; node && !event.stopped; node = node.parentNode) node.dispatchEvent(event);
  return event;
}
const click = (target, extra = {}) => target.dispatchEvent({ type: 'click', detail: 1, ...extra });
const menus = f => f.doc.querySelectorAll('.shell-menu').length;
// A window that closes on Esc, as an OpisAI dialog or the Klinika sub-window does, with a focused control inside.
function escapable(f, tag = 'textarea') {
  const control = f.doc.createElement(tag), seen = { escapes: 0 }; f.frame.content.append(control); control.focus();
  f.frame.el.addEventListener('keydown', event => { if (event.key === 'Escape') seen.escapes++; });
  return { control, seen };
}
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

test('Esc belongs to an open menu alone: the window underneath does not get the key', () => {
  const f = fixture(), { control, seen } = escapable(f); let closes = 0;
  f.shell.menu([{ label: 'Kopiuj', onClick() {} }], 10, 10, { onClose() { closes++; } }); // opened with the mouse: the focus stays in the window
  assert.equal(menus(f), 1); assert.equal(f.doc.activeElement, control);
  const event = press(f, control, 'Escape');
  assert.equal(menus(f), 0); assert.equal(closes, 1); assert(event.defaultPrevented);
  assert.equal(seen.escapes, 0, 'The key that closed the menu cannot also cancel the window');
  assert.equal(f.doc.activeElement, control);
  press(f, control, 'Escape', { repeat: true }); assert.equal(seen.escapes, 0, 'Still held, the key does nothing more');
  press(f, control, 'Escape'); assert.equal(seen.escapes, 1, 'Pressed again with nothing open, Esc reaches the window as before');
});

test('Esc closes one layer at a time and hands the keyboard back', () => {
  const f = fixture(), { control, seen } = escapable(f, 'button');
  const menu = f.shell.menu([{ label: 'Pisownia', children: [{ label: 'Podkreślaj', onClick() {} }] }, { label: 'Zamknij', onClick() {} }], 10, 10);
  const owner = menu.querySelector('button'); owner.focus();
  click(owner, { detail: 0 }); // Enter on an item with children: the submenu opens and takes the keyboard
  assert.equal(menus(f), 2); assert.notEqual(f.doc.activeElement, owner); assert.equal(owner.getAttribute('aria-expanded'), 'true');
  press(f, f.doc.activeElement, 'Escape');
  assert.equal(menus(f), 1); assert.equal(f.doc.activeElement, owner, 'Esc in a submenu returns to its item'); assert.equal(owner.getAttribute('aria-expanded'), 'false');
  press(f, owner, 'Escape');
  assert.equal(menus(f), 0); assert.equal(f.doc.activeElement, control, 'Esc in the menu returns to the element that had the keyboard');
  assert.equal(seen.escapes, 0);

  // A menu over a flyout: the menu goes first, then the flyout; each returns the focus to its own opener.
  f.shell.showStart(); const start = f.doc.querySelector('#start-menu'), power = f.doc.querySelector('#start-power'); assert(start.isConnected);
  power.focus(); click(power, { clientX: 600, clientY: 600 }); assert.equal(menus(f), 1);
  f.doc.querySelector('.shell-menu button').focus();
  press(f, f.doc.activeElement, 'Escape');
  assert.equal(menus(f), 0); assert(start.isConnected, 'The flyout under the menu stays'); assert.equal(f.doc.activeElement, power);
  press(f, power, 'Escape');
  assert(!start.isConnected); assert.equal(f.doc.activeElement, control); assert.equal(seen.escapes, 0);
});

test('Esc with Shift, Alt or the Windows key still belongs to the open menu', () => {
  for (const chord of [{ shiftKey: true }, { altKey: true }, { metaKey: true }]) {
    const f = fixture(), { control, seen } = escapable(f);
    f.shell.menu([{ label: 'Kopiuj', onClick() {} }], 10, 10);
    const event = press(f, control, 'Escape', chord);
    assert.equal(menus(f), 0, JSON.stringify(chord)); assert(event.defaultPrevented); assert.equal(seen.escapes, 0);
    press(f, control, 'Escape', chord); assert.equal(seen.escapes, 1, 'With nothing open the chord goes to the window, as before');
  }
});

test('Ctrl+Esc opens Start once per press, and the window with the keyboard never sees it', () => {
  const f = fixture(), { control, seen } = escapable(f), start = () => f.doc.querySelector('#start-menu');
  f.shell.menu([{ label: 'Kopiuj', onClick() {} }], 10, 10);
  const event = press(f, control, 'Escape', { ctrlKey: true });
  assert(event.defaultPrevented); assert.equal(seen.escapes, 0, 'The shortcut of the desktop is not an Esc for the window');
  assert.equal(menus(f), 0); assert(start(), 'Start replaces the menu');
  press(f, control, 'Escape', { ctrlKey: true, repeat: true }); press(f, control, 'Escape', { ctrlKey: true, repeat: true });
  assert(start(), 'Held down, the shortcut does not close and reopen Start'); assert.equal(seen.escapes, 0);
  press(f, control, 'Escape', { ctrlKey: true });
  assert(!start(), 'Pressed again, it closes Start'); assert.equal(seen.escapes, 0); assert.equal(f.doc.activeElement, control);

  // The lock screen has an Esc of its own; the shortcut opens nothing over it.
  f.shell.power('lock'); const curtain = f.doc.querySelector('.screen-curtain');
  press(f, curtain.querySelector('button'), 'Escape', { ctrlKey: true });
  assert(!start()); assert(!curtain.isConnected, 'There the chord is the Esc of that screen');
});

test('a chosen command returns the keyboard to where it was, unless the command took it', () => {
  const f = fixture(), { control } = escapable(f, 'button'); let ran = 0, enters = 0, opened = null;
  control.addEventListener('keydown', event => { if (event.key === 'Enter') enters++; });
  const choose = (items, detail) => { const item = f.shell.menu(items, 10, 10).querySelector('button'); item.focus(); click(item, { detail }); };

  choose([{ label: 'Wybierz okno główne...', onClick() { ran++; } }], 0); // Enter on a command that only shows a notice
  assert.equal(ran, 1); assert.equal(menus(f), 0);
  assert.equal(f.doc.activeElement, control, 'The focus cannot stay on the body, out of reach of the keyboard');
  const repeat = press(f, control, 'Enter', { repeat: true });
  assert(repeat.defaultPrevented); assert.equal(enters, 0, 'The Enter that chose the command, still held, does not press the opener');
  press(f, control, 'Enter'); press(f, control, 'Enter', { repeat: true }); assert.equal(enters, 2, 'A new press and its repeats work as usual');

  choose([{ label: 'Kopiuj', onClick() { ran++; } }], 1); // a click: no key is held
  assert.equal(f.doc.activeElement, control); press(f, control, 'Enter', { repeat: true }); assert.equal(enters, 3);

  choose([{ label: 'Konfiguracja...', onClick() { opened = f.shell.createWindow({ id: 'settings', title: 'Konfiguracja' }); } }], 0);
  assert.equal(f.doc.activeElement, opened.el, 'A window opened by the command keeps the focus');

  control.focus(); choose([{ label: 'Usuń', onClick() { control.remove(); } }], 0);
  assert.equal(f.doc.activeElement, opened.el, 'An opener that is gone is not focused: the active window has the keyboard');
});

test('with nothing to return to, the keyboard goes to the active window', () => {
  const f = fixture(), { control, seen } = escapable(f), items = [{ label: 'Odśwież', onClick() {} }];
  const blur = () => { f.doc.activeElement = f.doc.body; }; // a right click on the desktop: nothing has the focus
  f.frame.el.dispatchEvent({ type: 'focusin', target: control }); // the window remembers its control, as it does in a browser

  blur(); f.shell.menu(items, 10, 10); press(f, f.doc.body, 'Escape');
  assert.equal(menus(f), 0); assert.equal(f.doc.activeElement, control, 'Esc in the desktop\'s menu: the control that had the keyboard last');
  assert.equal(seen.escapes, 0);
  blur(); click(f.shell.menu(items, 10, 10).querySelector('button'));
  assert.equal(f.doc.activeElement, control, 'A command of that menu: the same');

  // A command that redraws the toolbar it was chosen from: the button that opened the menu is gone.
  const tool = f.doc.createElement('button'); f.frame.content.append(tool); tool.focus(); f.frame.el.dispatchEvent({ type: 'focusin', target: tool });
  const item = f.shell.menu([{ label: 'Sortuj według', onClick() { tool.remove(); } }], 10, 10).querySelector('button'); item.focus(); click(item, { detail: 0 });
  assert.equal(f.doc.activeElement, f.frame.el, 'The control is gone too: the window itself, where its shortcuts work');

  // No window is shown: the focus is left alone.
  f.frame.minimize(); f.flushTimers(); blur(); f.shell.menu(items, 10, 10); press(f, f.doc.body, 'Escape');
  assert.equal(menus(f), 0); assert.equal(f.doc.activeElement, f.doc.body);
});

test('a command of a flyout leaves the keyboard with the active window; its Enter, still held, does nothing more', () => {
  const f = fixture(), { control } = escapable(f); let enters = 0, opened = null;
  control.addEventListener('keydown', event => { if (event.key === 'Enter') enters++; });
  f.frame.el.dispatchEvent({ type: 'focusin', target: control });
  f.shell.registerApp({ id: 'opisai', title: 'OpisAI', icon: 'opisai', open() {} }); // raises its bubble: no window opens
  f.shell.registerApp({ id: 'help', title: 'Przewodnik', icon: 'help', open() { opened = f.shell.createWindow({ id: 'help', title: 'Przewodnik' }); } });
  const start = () => f.doc.querySelector('#start-menu'), tile = id => f.doc.querySelector(`#start-menu .start-pinned [data-open="${id}"]`);

  f.shell.showStart(); tile('opisai').focus(); click(tile('opisai'), { detail: 0 }); // Enter on the tile
  assert(!start()); assert.equal(f.doc.activeElement, control, 'The focus cannot stay on the body: the window that was active has it');
  const repeat = press(f, control, 'Enter', { repeat: true });
  assert(repeat.defaultPrevented); assert.equal(enters, 0, 'The Enter that chose the tile does not reach the window');
  press(f, control, 'Enter'); assert.equal(enters, 1);

  f.shell.showStart(); tile('help').focus(); click(tile('help'));
  assert(!start()); assert.equal(f.doc.activeElement, opened.el, 'A window opened by the command keeps the keyboard');

  // "Wszystkie" and "Wstecz" redraw the list inside Start: the keyboard stays in Start, on the button that leads back.
  f.shell.showStart(); const all = f.doc.querySelector('#all-apps'); all.focus(); click(all, { detail: 0 });
  assert.equal(f.doc.activeElement, f.doc.querySelector('#back-pinned')); click(f.doc.activeElement, { detail: 0 });
  assert.equal(f.doc.activeElement, f.doc.querySelector('#all-apps')); assert(start());
});

test('"Przywróć ustawienia" clears the demo keys and reloads, also when the browser blocks storage', () => {
  for (const blocked of [false, true]) {
    const kept = { 'opisai.demo.visit.v3': '{}', 'opisai.demo.files.v1': '{}', 'opisai-demo-settings-v12': '{}', 'another-page': 'keep' };
    Object.defineProperties(kept, { getItem: { value: key => kept[key] ?? null }, setItem: { value(key, value) { kept[key] = String(value); } }, removeItem: { value(key) { delete kept[key]; } } });
    const f = fixture({ desktopApps: true, storage: blocked ? () => { throw new Error('SecurityError: access is denied for this document') } : kept });
    f.shell.openSettings('privacy'); click(f.doc.querySelector('[data-action="reset"]'));
    const confirm = f.doc.querySelector('[data-confirm]');
    assert(confirm, 'The reset asks first'); assert.equal(f.reloads(), 0);
    click(confirm);
    assert.equal(f.reloads(), 1, blocked ? 'Nothing is stored, so the reload alone brings the sample back' : 'The page restarts');
    if (!blocked) assert.deepEqual(Object.keys(kept), ['another-page'], 'Only the keys of this demonstration are removed');
  }
});
