'use strict';

// The real Klinika mock-up (assets/clinic.js) inside the real desktop shell (assets/shell.js) on a small DOM (the
// harness of settings.test.cjs). Timers are simulated. Input arrives as a browser delivers it: a press focuses the
// nearest focusable element, an event travels from its target up to the window, and an element that has left the
// document is heard by nobody above it. A double click is two clicks and then dblclick on the element of the second.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const shellSource = fs.readFileSync(path.join(__dirname, '../assets/shell.js'), 'utf8');
const clinicSource = fs.readFileSync(path.join(__dirname, '../assets/clinic.js'), 'utf8');
const iconsSource = fs.readFileSync(path.join(__dirname, '../assets/clinic-icons.js'), 'utf8');
const REVIEW_TITLE = '[DEMO] Klinika XP — PRZEGLĄD WIZYTY (TYLKO DO ODCZYTU)';
const KEY = 'opisai.demo.visit.v3';

/* ------------------------------------------------------------------ a small DOM */
const VOID = /^(?:input|br|img|hr|meta|link|source|area|col|wbr)$/i;
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0'}[m]));
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ??= this; event.currentTarget = this; event.preventDefault ??= () => { event.defaultPrevented = true; }; event.stopPropagation ??= () => {};
    this['on' + event.type]?.(event);
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
    return !event.defaultPrevented;
  }
}
class Text { constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; } get textContent() { return this.data; } }
class Element extends Target {
  constructor(tag, doc) {
    super(); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.doc = doc; this.childNodes = []; this.parentNode = null; this.attrs = new Map();
    this.style = {setProperty(key, value) { this[key] = String(value); }};
    const el = this;
    this.dataset = new Proxy({}, {get: (_, key) => typeof key === 'string' ? el.getAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())) ?? undefined : undefined,
      set: (_, key, value) => { el.setAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value); return true; }});
    this.classList = {contains: name => el.className.split(/\s+/).includes(name), add: (...names) => { el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { el.className = el.className.split(/\s+/).filter(n => n && !names.includes(n)).join(' '); },
      toggle: (name, force) => { const on = force ?? !el.classList.contains(name); el.classList[on ? 'add' : 'remove'](name); return on; }};
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get isConnected() { return this === this.doc.documentElement || !!this.parentNode?.isConnected; }
  get className() { return this.attrs.get('class') ?? ''; } set className(value) { this.attrs.set('class', String(value)); }
  get id() { return this.attrs.get('id') ?? ''; } set id(value) { this.attrs.set('id', String(value)); }
  get title() { return this.attrs.get('title') ?? ''; } set title(value) { this.attrs.set('title', String(value)); }
  get hidden() { return this.attrs.has('hidden'); } set hidden(on) { this.toggleAttribute('hidden', !!on); }
  get disabled() { return this.attrs.has('disabled'); } set disabled(on) { this.toggleAttribute('disabled', !!on); }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'SELECT') { const options = this.querySelectorAll('option'); return (options.find(o => o.attrs.has('selected')) || options[0])?.textContent ?? ''; }
    return this.attrs.get('value') ?? '';
  }
  set value(text) { this._value = String(text); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(text) { this.replaceChildren(new Text(text ?? '')); }
  get innerText() { return this.textContent; }
  set innerHTML(html) {
    this.replaceChildren();
    const stack = [this];
    for (const match of String(html).matchAll(/<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
      const token = match[0];
      if (!token.startsWith('<')) { stack.at(-1).appendChild(new Text(decode(token))); continue; }
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      const tag = token.match(/^<([\w-]+)/)[1], child = new Element(tag, this.doc);
      for (const attr of token.slice(tag.length + 1, token.endsWith('/>') ? -2 : -1).matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
        child.attrs.set(attr[1].toLowerCase(), decode(attr[2] ?? attr[3] ?? attr[4] ?? ''));
      stack.at(-1).appendChild(child);
      if (!VOID.test(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  setAttribute(name, value) { this.attrs.set(name.toLowerCase(), String(value)); }
  getAttribute(name) { return this.attrs.has(name.toLowerCase()) ? this.attrs.get(name.toLowerCase()) : null; }
  hasAttribute(name) { return this.attrs.has(name.toLowerCase()); }
  toggleAttribute(name, force) { const on = force ?? !this.attrs.has(name); if (on) this.attrs.set(name, ''); else this.attrs.delete(name); return on; }
  appendChild(node) { node.parentNode?.childNodes && node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); node.parentNode = this; this.childNodes.push(node); return node; }
  append(...nodes) { for (const node of nodes) this.appendChild(typeof node === 'string' ? new Text(node) : node); }
  replaceChildren(...nodes) { for (const node of this.childNodes) node.parentNode = null; this.childNodes = []; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  matches(selector) { return parseSelectors(selector).some(chain => matchChain(this, chain)); }
  closest(selector) { for (let node = this; node?.nodeType === 1; node = node.parentNode) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { const chains = parseSelectors(selector), found = []; (function walk(node) { for (const child of node.children) { if (chains.some(chain => matchChain(child, chain))) found.push(child); walk(child); } })(this); return found; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.doc.activeElement = this; }
  getBoundingClientRect() { return {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0}; }
  getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
}
/* Selectors: compound (tag, #id, .class, [attr], [attr="v"], :not(...)) joined by descendant spaces, comma lists. */
function splitTop(text, separator) {
  const parts = []; let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c; else if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (separator === ',' ? c === ',' : /\s/.test(c))) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start)); return parts.map(p => p.trim()).filter(Boolean);
}
const selectorCache = new Map();
function parseSelectors(selector) {
  if (!selectorCache.has(selector)) selectorCache.set(selector, splitTop(selector, ',').map(one => splitTop(one, ' ').map(parseCompound)));
  return selectorCache.get(selector);
}
function parseCompound(text) {
  const parts = []; let i = 0;
  while (i < text.length) {
    let m;
    if ((m = /^[\w-]+|^\*/.exec(text.slice(i)))) { parts.push({tag: m[0].toUpperCase()}); i += m[0].length; }
    else if ((m = /^#([\w-]+)/.exec(text.slice(i)))) { parts.push({id: m[1]}); i += m[0].length; }
    else if ((m = /^\.([\w-]+)/.exec(text.slice(i)))) { parts.push({cls: m[1]}); i += m[0].length; }
    else if ((m = /^\[([\w-]+)(?:=(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\]]+)))?\]/.exec(text.slice(i)))) { const value = m[2] ?? m[3] ?? m[4]; parts.push({attr: m[1], value: value === undefined ? undefined : value.replace(/\\(.)/g, '$1')}); i += m[0].length; }
    else if ((m = /^:not\(/.exec(text.slice(i)))) { let depth = 1, j = i + 5; for (; j < text.length && depth; j++) { if (text[j] === '(') depth++; else if (text[j] === ')') depth--; } parts.push({not: parseCompound(text.slice(i + 5, j - 1))}); i = j; }
    else throw new Error('Unsupported selector: ' + text);
  }
  return parts;
}
function matchCompound(el, parts) {
  return parts.every(p => p.tag ? p.tag === '*' || el.tagName === p.tag : p.id ? el.id === p.id : p.cls ? el.classList.contains(p.cls)
    : p.attr ? el.hasAttribute(p.attr) && (p.value === undefined || el.getAttribute(p.attr) === p.value) : p.not ? !matchCompound(el, p.not) : false);
}
function matchChain(el, chain, index = chain.length - 1) {
  if (!matchCompound(el, chain[index])) return false;
  if (index === 0) return true;
  for (let node = el.parentNode; node?.nodeType === 1; node = node.parentNode) if (matchChain(node, chain, index - 1)) return true;
  return false;
}

/* ------------------------------------------------------------------ the fixture */
const FOCUSABLE = /^(?:BUTTON|INPUT|SELECT|TEXTAREA)$/;
/* saved: the stored visit state the page starts with. storage: 'ok', 'full' (setItem throws, as on an exceeded quota) or
   'denied' (reading window.localStorage throws, as in a browser that blocks site data). icons: the page's drawings
   (assets/clinic-icons.js) are loaded too; without them Klinika renders its markup bare, which is all most tests need. */
function fixture({saved, storage = 'ok', icons = false} = {}) {
  const doc = new Target(), win = new Target(), timers = new Map(), store = new Map();
  if (saved !== undefined) store.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  const failure = (name, message) => Object.assign(new Error(message), {name});
  const localStorage = {getItem: key => store.get(key) ?? null, removeItem: key => { store.delete(key); },
    setItem(key, value) { if (storage === 'full') throw failure('QuotaExceededError', 'The quota has been exceeded.'); store.set(key, String(value)); }};
  let now = 0, serial = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body); doc.activeElement = doc.body;
  doc.createElement = tag => new Element(tag, doc); doc.contains = node => doc.documentElement.contains(node); doc.readyState = 'complete';
  doc.querySelector = selector => doc.documentElement.querySelector(selector); doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  for (const id of ['desktop', 'windows', 'snap-preview', 'shell-popups', 'notification-toasts', 'shell-status']) { const el = doc.createElement('div'); el.id = id; doc.body.append(el); }
  win.getSelection = () => ({rangeCount: 0, removeAllRanges() {}, addRange() {}});
  const sandbox = {window: win, document: doc, Node: Element, innerWidth: 1536, innerHeight: 866, navigator: {clipboard: {writeText: async () => {}, readText: async () => ''}},
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    FormData: class { constructor(form) { this.pairs = form.querySelectorAll('input,select').map(el => [el.getAttribute('name'), el.value]); } [Symbol.iterator]() { return this.pairs[Symbol.iterator](); } },
    setTimeout: (fn, delay = 0) => { timers.set(++serial, {fn, due: now + delay}); return serial; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => sandbox.setTimeout(fn, 16), addEventListener() {}, removeEventListener() {}};
  Object.defineProperty(sandbox, 'localStorage', {enumerable: true, get() { if (storage === 'denied') throw failure('SecurityError', 'Access is denied for this document.'); return localStorage; }});
  const context = vm.createContext(sandbox);
  vm.runInContext(shellSource, context, {filename: 'assets/shell.js'});
  sandbox.Shell = win.Shell;
  if (icons) { vm.runInContext(iconsSource, context, {filename: 'assets/clinic-icons.js'}); sandbox.KxpIcons = win.KxpIcons; }
  vm.runInContext(clinicSource, context, {filename: 'assets/clinic.js'});
  function advance(ms) { const end = now + ms; for (;;) { const next = [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]; if (!next || next[1].due > end) break; now = Math.max(now, next[1].due); timers.delete(next[0]); next[1].fn(); } now = end; }
  /* An event goes from its target through the ancestors to the document and the window; a detached target has neither. */
  function fire(target, type, init = {}) {
    let stopped = false;
    const event = {type, target, detail: 0, defaultPrevented: false, ...init, preventDefault() { event.defaultPrevented = true; }, stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; }};
    const nodes = []; for (let node = target; node; node = node.parentNode) nodes.push(node);
    if (nodes.at(-1) === doc.documentElement) nodes.push(doc, win);
    for (const node of nodes) { if (stopped) break; node.dispatchEvent(event); }
    return event;
  }
  const focusTarget = el => { for (let node = el; node?.nodeType === 1; node = node.parentNode) if (FOCUSABLE.test(node.tagName) ? !node.disabled : node.hasAttribute('tabindex') || node.tabIndex !== undefined) return node; return doc.body; };
  const f = {doc, win, advance, fire, shell: win.Shell, clinic: win.Clinic, store, saved: () => JSON.parse(store.get(KEY)),
    plain: value => JSON.parse(JSON.stringify(value)),
    ctx: () => f.plain(win.Clinic.getContext()),
    window: id => win.Shell.windows.get(id), open: id => win.Shell.windows.has(id), // elements and windows are compared by identity only: a failed assert would print the whole DOM
    q(id, selector) { const el = f.window(id)?.el.querySelector(selector); assert.ok(el, `${id}: ${selector}`); return el; },
    press(el) { fire(el, 'pointerdown'); const to = focusTarget(el); if (doc.activeElement !== to) { to.focus(); fire(to, 'focusin'); } },
    click(el, detail = 1) { f.press(el); fire(el, 'pointerup'); return fire(el, 'click', {detail}); },
    /* at() names the element under the pointer anew for every press, as a hit test does. */
    doubleClick(at) { f.click(at(), 1); const second = at(); f.click(second, 2); fire(second, 'dblclick', {detail: 2}); },
    key(key, init = {}) { return fire(doc.activeElement?.isConnected ? doc.activeElement : doc.body, 'keydown', {key, ...init}); },
    openList() { f.shell.windows.get('clinic').focus(); f.key('l', {ctrlKey: true}); assert.ok(f.window('clinic-list')?.visible, 'Ctrl+L shows the visit list'); },
    row: id => f.q('clinic-list', `[data-list-row="${id}"]`),
    rows: () => f.window('clinic-list').el.querySelectorAll('[data-list-row]').map(row => row.dataset.listRow),
    selected: () => f.window('clinic-list').el.querySelectorAll('[data-list-row]').filter(row => row.classList.contains('is-selected')).map(row => row.dataset.listRow),
    summary: () => f.q('clinic-list', '[data-list-summary]').textContent,
    notices: () => doc.querySelectorAll('#notification-toasts .windows-toast').map(toast => [toast.querySelector('.toast-top span').textContent, toast.querySelector('h4').textContent, toast.querySelector('p').textContent])};
  advance(100);
  return f;
}

/* ------------------------------------------------------------------ the visit list (Ctrl+L) */
test('the fixture starts as the page does: the new visit of the example with its description sub-window', () => {
  const f = fixture(), c = f.ctx();
  assert.deepEqual([c.mode, c.editorOpen, c.patient, c.visitNumber], ['new', true, 'Fistaszek', '<NOWY>']);
  assert.equal(f.shell.activeWindow.id, 'clinic-editor');
  f.openList();
  assert.deepEqual(f.rows(), ['V-158', 'V-151', 'V-140', 'V-133', 'V-122', 'V-104', 'V-097', 'V-088', 'V-071', 'V-063'], 'the newest visit first');
  assert.deepEqual(f.selected(), ['V-158']);
});

test('visit list: a click selects the row where it is — the same element keeps the focus, the details follow, no visit opens', () => {
  const f = fixture(); f.openList();
  const row = f.row('V-104');
  f.click(row.children[1]);
  assert.ok(f.row('V-104') === row, 'the clicked row was not replaced');
  assert.ok(f.doc.activeElement === row, 'so it still has the focus of the press');
  assert.deepEqual(f.selected(), ['V-104']);
  assert.match(f.summary(), /^Wywiad: kaszel 5 dni gł po bieganiu\./);
  assert.match(f.q('clinic-list', '[data-list-animal]').textContent, /^ZWIERZĘ\nBruno\n/);
  assert.equal(f.q('clinic-list', '[data-list-action="review"]').disabled, false);
  assert.equal(f.ctx().mode, 'new', 'a single click opens nothing');
  assert.equal(f.open('clinic-confirm'), false);
});

test('visit list: a double click opens the visit of that row in the read-only review', () => {
  const f = fixture(); f.openList();
  // The start is an unsaved new visit, so Klinika asks before it leaves the buffer.
  f.doubleClick(() => f.row('V-104').children[1]);
  assert.equal(f.shell.activeWindow.id, 'clinic-confirm', 'the question „Zmiana wizyty” is asked');
  assert.match(f.window('clinic-confirm').el.textContent, /Zmiana wizyty odrzuci bieżący bufor edycji\. Kontynuować\?/);
  assert.equal(f.ctx().mode, 'new');
  f.click(f.q('clinic-confirm', '[data-confirm]'));
  let c = f.ctx();
  assert.deepEqual([c.mode, c.visitNumber, c.patient, c.mainTitle, c.editorOpen], ['saved', '104/2026', 'Bruno', REVIEW_TITLE, false]);
  // From a review nothing is unsaved: the next double click opens at once.
  f.openList();
  f.doubleClick(() => f.row('V-088').children[0]);
  c = f.ctx();
  assert.deepEqual([c.mode, c.visitNumber, c.mainTitle], ['saved', '088/2026', REVIEW_TITLE]);
  assert.equal(f.open('clinic-confirm'), false);
  assert.equal(f.open('clinic-editor'), false, 'a review, not an edit: the description sub-window stays closed');
});

test('visit list: Enter opens the row that was clicked, and the buttons act on it', () => {
  const f = fixture(); f.openList();
  f.click(f.row('V-071').children[0]);
  f.key('Enter');
  assert.equal(f.shell.activeWindow.id, 'clinic-confirm', 'Enter reached the clicked row');
  f.click(f.q('clinic-confirm', '[data-confirm]'));
  assert.deepEqual([f.ctx().mode, f.ctx().visitNumber, f.ctx().patient], ['saved', '071/2026', 'Mela']);
  f.openList();
  f.click(f.row('V-133').children[2]); f.click(f.q('clinic-list', '[data-list-action="review"]'));
  assert.deepEqual([f.ctx().mode, f.ctx().visitNumber], ['saved', '133/2026']);
});

test('visit list: a filter rebuilds the rows and keeps or moves the selection', () => {
  const f = fixture(); f.openList();
  f.click(f.row('V-097').children[0]);
  f.q('clinic-list', '[name=animal]').value = 'mela'; f.fire(f.q('clinic-list', 'form'), 'submit');
  assert.deepEqual(f.rows(), ['V-151', 'V-097', 'V-071']); assert.deepEqual(f.selected(), ['V-097'], 'a selected visit that is still listed stays selected');
  assert.equal(f.q('clinic-list', '[data-list-count]').textContent, '3 wizyty');
  f.q('clinic-list', '[name=text]').value = 'OTOSKOPIA'; f.fire(f.q('clinic-list', 'form'), 'submit');
  assert.deepEqual(f.rows(), ['V-071']); assert.deepEqual(f.selected(), ['V-071'], 'otherwise the first row is selected');
  assert.match(f.summary(), /^Wywiad: trzepie głową/);
  f.q('clinic-list', '[name=text]').value = 'brak-takiego-tekstu'; f.fire(f.q('clinic-list', 'form'), 'submit');
  assert.deepEqual(f.rows(), []); assert.match(f.window('clinic-list').el.textContent, /Brak wizyt spełniających warunki\./);
  assert.equal(f.q('clinic-list', '[data-list-action="review"]').disabled, true); assert.equal(f.q('clinic-list', '[data-list-action="new"]').disabled, false);
  assert.equal(f.summary(), '');
  f.click(f.q('clinic-list', '[data-list-clear]'));
  assert.equal(f.rows().length, 10); assert.deepEqual(f.selected(), ['V-158']);
});

test('visit list: once the chosen visit is shown the list is put away; Ctrl+L brings it back as it was', () => {
  const f = fixture(), list = () => f.window('clinic-list');
  f.openList();
  f.doubleClick(() => f.row('V-104').children[1]);
  assert.equal(list().visible, true, 'the list waits while Klinika asks about the unsaved buffer');
  f.click(f.q('clinic-confirm', '[data-dialog-close]'));
  assert.deepEqual([f.ctx().mode, list().visible, f.open('clinic-confirm')], ['new', true, false], '„Anuluj” changes nothing');
  f.doubleClick(() => f.row('V-104').children[1]); f.click(f.q('clinic-confirm', '[data-confirm]'));
  assert.deepEqual([f.ctx().visitNumber, list().visible, f.shell.activeWindow.id], ['104/2026', false, 'clinic'], 'the review is in front and the list is away');
  f.advance(200); assert.equal(list().el.hidden, true);
  f.openList();
  assert.equal(list().el.hidden, false); assert.deepEqual(f.selected(), ['V-104']);
  assert.ok(f.doc.activeElement === f.row('V-104'), 'the list returns with its selection and the focus on that row');
  // Enter and the buttons do the same as the double click.
  f.click(f.row('V-097').children[0]); f.key('Enter');
  assert.deepEqual([f.ctx().visitNumber, list().visible, f.shell.activeWindow.id], ['097/2026', false, 'clinic']);
  f.openList(); f.click(f.row('V-133').children[0]); f.click(f.q('clinic-list', '[data-list-action="review"]'));
  assert.deepEqual([f.ctx().visitNumber, list().visible], ['133/2026', false]);
  // „Przejdź do edycji (F2)” goes on to the description sub-window of the chosen visit.
  f.openList(); f.click(f.row('V-151').children[0]); f.click(f.q('clinic-list', '[data-list-action="edit"]'));
  const c = f.ctx();
  assert.deepEqual([c.mode, c.visitNumber, c.editorOpen, list().visible, f.shell.activeWindow.id], ['edit', '151/2026', true, false, 'clinic-editor']);
  // A new visit starts with a dialog above the list: the list stays.
  f.openList(); f.click(f.q('clinic-list', '[data-list-action="new"]'));
  assert.deepEqual([f.open('clinic-meta'), list().visible], [true, true]);
});

test('visit list: a visit opened elsewhere in Klinika leaves the list where it is', () => {
  const f = fixture(); f.openList();
  // double click in the history of the main window
  f.click(f.q('clinic', '[data-visit="V-140"]'), 1); f.click(f.q('clinic', '[data-visit="V-140"]'), 2);
  f.click(f.q('clinic-confirm', '[data-confirm]'));
  assert.deepEqual([f.ctx().mode, f.ctx().visitNumber, f.window('clinic-list').visible], ['saved', '140/2026', true]);
});

/* ------------------------------------------------------------------ the saved state (opisai.demo.visit.v3) */
const startState = () => fixture().saved(); // what the page stores when it starts with nothing saved
const example = (f, label) => {
  const c = f.ctx();
  assert.deepEqual([c.mode, c.editorOpen, c.patient, c.visitNumber], ['new', true, 'Fistaszek', '<NOWY>'], label);
  assert.deepEqual(f.plain(f.clinic.getFields()), f.plain(f.clinic.getDefaultFields()), label);
  assert.match(f.q('clinic', '.kxp-visit-card').textContent, /NOWA WIZYTA/, `${label}: the main window is drawn`);
  assert.match(f.q('clinic', '[data-meta="date"]').value, /^\d{2}\/\d{2}\/\d{4}$/, `${label}: with today's date`); assert.equal(f.q('clinic', '[data-meta="time"]').value, '10:15', label);
  assert.equal(f.q('clinic', '.kxp-history').querySelectorAll('[data-visit]').length, 2, `${label}: with the history of the example`);
  f.openList(); assert.equal(f.rows().length, 10, `${label}: and the list holds the example's visits`);
};

test('an incomplete saved state starts from the example instead of leaving Klinika empty', () => {
  const incomplete = {
    // states that used to end in an exception while the windows were drawn
    'current.meta missing': s => { delete s.current.meta; },
    'current.meta null': s => { s.current.meta = null; },
    'visits [{}]': s => { s.visits = [{}]; },
    'visit without occurred/fields': s => { s.visits = [{id: 'V-1', patient: 1}]; },
    'visit.fields null': s => { s.visits[0].fields = null; },
    'visit.occurred number': s => { s.visits[0].occurred = 20260812; },
    // the same gaps in the other places that the windows read
    'current.meta wrong types': s => { s.current.meta = {date: 5, time: null}; },
    'visits [null]': s => { s.visits = [null]; },
    'the reviewed visit without its texts': s => { s.mode = 'saved'; s.loaded = {id: 'V-140', patient: 1}; s.current.id = 'V-140'; },
    'an edit without its saved visit': s => { s.mode = 'edit'; s.loaded = null; s.current.id = 'V-999'; },
    'unknown mode': s => { s.mode = 'banana'; },
    'not a state': () => {}
  };
  for (const [label, change] of Object.entries(incomplete)) {
    const state = startState(); change(state);
    example(fixture({saved: label === 'not a state' ? '[1, 2' : state}), label);
  }
});

test('a whole saved state is taken as it is: a draft, a saved visit in review, an edit, the history', () => {
  const a = fixture();
  assert.equal(a.clinic.setFields({diagnoza: 'Nieżyt górnych dróg oddechowych.'}).ok, true);
  const draft = fixture({saved: a.saved()});
  assert.deepEqual([draft.ctx().mode, draft.ctx().editorOpen, draft.clinic.getFields().diagnoza], ['new', true, 'Nieżyt górnych dróg oddechowych.']);
  draft.key('s', {ctrlKey: true}); // Ctrl+S in the description sub-window saves the visit
  assert.equal(draft.ctx().mode, 'saved');
  const review = fixture({saved: draft.saved()}), c = review.ctx();
  assert.deepEqual([c.mode, c.editorOpen, c.mainTitle], ['saved', false, REVIEW_TITLE]); assert.match(c.visitNumber, /^160\/\d{4}$/);
  assert.match(review.q('clinic', '.kxp-saved').textContent, /Diagnoza:\s*Nieżyt górnych dróg oddechowych\./);
  review.openList(); assert.equal(review.rows().length, 11); assert.equal(review.rows()[0], 'V-160');
  review.shell.windows.get('clinic').focus(); review.key('F2');
  assert.equal(review.clinic.setFields({wywiad: 'Kicha od tygodnia.'}).ok, true);
  const edit = fixture({saved: review.saved()});
  assert.deepEqual([edit.ctx().mode, edit.ctx().editorOpen, edit.clinic.getFields().wywiad], ['edit', true, 'Kicha od tygodnia.']);
  edit.key('Escape'); edit.click(edit.q('clinic-confirm', '[data-confirm]')); // ANULUJ: back to the saved visit
  assert.equal(edit.ctx().mode, 'saved');
  edit.click(edit.q('clinic', '[data-kxp="close-view"]'));
  const history = fixture({saved: edit.saved()});
  assert.deepEqual([history.ctx().mode, history.ctx().editorOpen], ['history', false]); assert.match(history.ctx().visitNumber, /^160\/\d{4}$/);
  assert.equal(history.q('clinic', '.kxp-history').querySelectorAll('[data-visit]').length, 3);
  // What the user typed is not judged: an unfinished date in the visit card is a draft, not a broken state.
  const date = a.q('clinic', '[data-meta="date"]'); date.value = '12/13'; a.fire(date, 'change');
  const typed = fixture({saved: a.saved()});
  assert.deepEqual([typed.ctx().mode, typed.q('clinic', '[data-meta="date"]').value, typed.clinic.getFields().diagnoza], ['new', '12/13', 'Nieżyt górnych dróg oddechowych.']);
});

/* ------------------------------------------------------------------ a save that the browser refuses */
const NOTICE = ['Klinika XP', 'Nie udało się zapisać w przeglądarce', 'Zmiany w wizytach działają do odświeżenia strony.'];

test('blocked or full browser storage: Klinika works and says once that the changes last until the page is refreshed', () => {
  for (const storage of ['full', 'denied']) {
    const f = fixture({storage}), c = f.ctx();
    assert.deepEqual([c.mode, c.editorOpen, c.visitNumber], ['new', true, '<NOWY>'], `${storage}: the page starts with the example`);
    assert.deepEqual(f.notices(), [], `${storage}: nothing is said while the page starts`);
    assert.equal(f.clinic.setFields({diagnoza: 'Nieżyt górnych dróg oddechowych.'}).ok, true);
    assert.deepEqual(f.notices(), [NOTICE], `${storage}: the first change that could not be stored`);
    f.key('s', {ctrlKey: true});
    assert.equal(f.ctx().mode, 'saved', `${storage}: the visit is saved in this page`);
    f.openList(); assert.equal(f.rows().length, 11); f.click(f.row('V-071').children[0]); f.key('Enter'); f.shell.windows.get('clinic').focus(); f.key('F2');
    assert.deepEqual(f.notices(), [NOTICE], `${storage}: said once per page load`);
    assert.equal(f.store.has(KEY), false);
  }
  // Typing is such a change, and so is a save right after the start.
  const typed = fixture({storage: 'full'}), memo = typed.q('clinic-editor', '[data-clinic-field="badanie"]');
  memo.textContent = 'T 38,5°C.'; typed.fire(memo, 'input');
  assert.equal(typed.clinic.getFields().badanie, 'T 38,5°C.'); assert.deepEqual(typed.notices(), [NOTICE]);
  const saved = fixture({storage: 'full'}); saved.key('s', {ctrlKey: true});
  assert.equal(saved.ctx().mode, 'saved'); assert.deepEqual(saved.notices(), [NOTICE]);
});

test('working storage: changes are stored and nothing is said', () => {
  const f = fixture();
  assert.equal(f.clinic.setFields({diagnoza: 'Nieżyt górnych dróg oddechowych.'}).ok, true); f.key('s', {ctrlKey: true});
  f.openList(); f.click(f.row('V-071').children[0]); f.key('Enter'); f.shell.windows.get('clinic').focus(); f.key('F2');
  assert.deepEqual(f.notices(), []);
  assert.deepEqual([f.saved().mode, f.saved().visits.length, f.saved().current.id], ['edit', 11, 'V-071']);
});

test('visit list: the rest of a double click on a button of the list does not act on the main window below', () => {
  const f = fixture(); f.key('s', {ctrlKey: true}); // the example saved: nothing is unsaved
  f.openList(); f.click(f.row('V-104').children[0]);
  f.click(f.q('clinic-list', '[data-list-action="review"]'), 1);
  assert.deepEqual([f.ctx().mode, f.ctx().visitNumber, f.window('clinic-list').visible], ['saved', '104/2026', false]);
  // The list is away, and the second click of the same double click reaches what lay under the button: here the review's edit strip.
  f.click(f.q('clinic', '.kxp-edit-strip'), 2);
  assert.deepEqual([f.ctx().mode, f.ctx().editorOpen], ['saved', false], 'the visit stays in the read-only review');
  f.click(f.q('clinic', '.kxp-edit-strip'), 3);
  assert.deepEqual([f.ctx().mode, f.ctx().editorOpen], ['saved', false], 'also after the third click of a triple click');
  f.click(f.q('clinic', '.kxp-edit-strip'), 1);
  assert.deepEqual([f.ctx().mode, f.ctx().editorOpen], ['edit', true], 'a click of its own goes on to the edit');
  // A double click that starts in the main window is not affected.
  f.advance(100); f.key('Escape'); f.click(f.q('clinic', '[data-kxp="close-view"]')); // Esc in the focused field: back to the review, then „Zamknij”
  f.click(f.q('clinic', '[data-visit="V-158"]'), 1); f.click(f.q('clinic', '[data-visit="V-158"]'), 2);
  assert.deepEqual([f.ctx().mode, f.ctx().visitNumber], ['saved', '158/2026']);
});

/* ------------------------------------------------------------------ the photo slot */
test('photo slot: a drawing of the patient\'s species above the caption, and a dialog that says what the drawing is', () => {
  const f = fixture({icons: true}), slot = () => f.q('clinic', '.kxp-photo'), drawing = () => slot().querySelector('svg.kxp-portrait');
  const shapes = () => drawing().querySelectorAll('path').map(shape => shape.getAttribute('d')).join(' ');
  assert.ok(slot().classList.contains('has-portrait') && drawing(), 'the slot holds a drawing');
  assert.deepEqual([slot().getAttribute('title'), slot().querySelector('span').textContent, drawing().getAttribute('aria-hidden')], ['Zdjęcie zwierzęcia', 'zdjęcie niedostępne', 'true'], 'title and caption stay; the drawing is decorative');
  // the dialog behind the slot and behind the camera button of the ZWIERZĘ header
  const TEXT = 'Makieta nie zawiera zdjęć pacjentów; rysunek pokazuje tylko gatunek zwierzęcia. W Klinice XP w tym miejscu jest zdjęcie z karty zwierzęcia.';
  for (const opener of [slot(), f.q('clinic', '.kxp-head-tool[data-kxp="photo"]')]) {
    f.click(opener);
    assert.deepEqual([f.q('clinic-info', 'h2').textContent, f.q('clinic-info', '.clinic-dialog-body p').textContent], ['Zdjęcie zwierzęcia', TEXT]);
    f.click(f.q('clinic-info', '[data-dialog-close]')); assert.equal(f.open('clinic-info'), false);
  }
  // one drawing per species: the slot follows the patient of the visit on the card
  const seen = new Map([[f.ctx().patient, shapes()]]);
  f.click(f.q('clinic-editor', '[data-tool="ok"]')); // the example saved: nothing is unsaved
  for (const id of ['V-151', 'V-158']) { f.openList(); f.click(f.row(id).children[0]); f.key('Enter'); seen.set(f.ctx().patient, shapes()); }
  assert.deepEqual([...seen.keys()], ['Fistaszek', 'Mela', 'Bruno']);
  assert.equal(new Set(seen.values()).size, 3, 'three different drawings');
  // without the module of drawings the slot is empty and keeps its caption and title
  const bare = fixture().q('clinic', '.kxp-photo');
  assert.deepEqual([bare.classList.contains('has-portrait'), bare.querySelector('svg'), bare.querySelector('span').textContent, bare.getAttribute('title')], [false, null, 'zdjęcie niedostępne', 'Zdjęcie zwierzęcia']);
});
