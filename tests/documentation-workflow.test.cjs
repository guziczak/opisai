'use strict';

// The documentation workflow of assets/opisai.js (compose → progress → review → write → undo →
// history) with the real document model (assets/opisai-document.js) against a small DOM and a
// Klinika stand-in that keeps the sub-window session like assets/clinic.js. Timers are simulated.
// The expectations are 0.12.0rc32 behaviour: ui/state.py ApprovalState, ui/workflow.py,
// ui/review.py, application/writer.py and ui/coordinator.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/opisai.js'), 'utf8');
const documentSource = fs.readFileSync(path.join(__dirname, '../assets/opisai-document.js'), 'utf8');
const startup = "  if(document.readyState==='loading')";
assert.equal(source.split(startup).length, 2, 'The test boundary must precede the single application startup');
const controllerSource = source.replace(startup, `
  failure=message=>{__failures.push(message);};
  Object.assign(__api,{prepare,review,undo,history,settings,state,preferences:()=>preferences,setPhase,closeApp,menu:orbMenuItems,
    bubbleAt(x,y){orbRect=()=>({x:x-64,y:y-64,w:128,h:128});}}); // the bubble is not mounted here: its box is given
  return;
${startup}`);

/* ------------------------------------------------------------------ a small DOM */
const VOID = /^(?:input|br|img|hr|meta|link|source|area|col|wbr)$/i;
const decode = text => text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, m => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': '\u00a0'}[m]));
const BOOLEAN = ['hidden', 'disabled', 'readonly', 'checked', 'selected'];
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ??= this; event.currentTarget = this; event.preventDefault ??= () => { event.defaultPrevented = true; }; event.stopPropagation ??= () => {};
    for (const fn of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
    return !event.defaultPrevented;
  }
}
class Text { constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; } get textContent() { return this.data; } }
class Element extends Target {
  constructor(tag, doc) {
    super(); this.nodeType = 1; this.tagName = tag.toUpperCase(); this.doc = doc; this.childNodes = []; this.parentNode = null; this.attrs = new Map();
    this.style = {setProperty(key, value) { this[key] = String(value); }}; this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0; this.offsetHeight = 0;
    const el = this;
    this.dataset = new Proxy({}, {get: (_, key) => typeof key === 'string' ? el.getAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())) ?? undefined : undefined,
      set: (_, key, value) => { el.setAttribute('data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value); return true; }});
    this.classList = {contains: name => el.className.split(/\s+/).includes(name), add: (...names) => { el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { el.className = el.className.split(/\s+/).filter(n => n && !names.includes(n)).join(' '); },
      toggle: (name, force) => { const on = force ?? !el.classList.contains(name); el.classList[on ? 'add' : 'remove'](name); return on; }};
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get isConnected() { return this === this.doc.documentElement || !!this.parentNode?.isConnected; }
  get className() { return this.attrs.get('class') ?? ''; } set className(value) { this.attrs.set('class', String(value)); }
  get id() { return this.attrs.get('id') ?? ''; } set id(value) { this.attrs.set('id', String(value)); }
  get title() { return this.attrs.get('title') ?? ''; } set title(value) { this.attrs.set('title', String(value)); }
  get hidden() { return this.attrs.has('hidden'); } set hidden(on) { this.toggleAttribute('hidden', !!on); }
  get disabled() { return this.attrs.has('disabled'); } set disabled(on) { this.toggleAttribute('disabled', !!on); }
  get readOnly() { return this.attrs.has('readonly'); }
  get checked() { return this._checked ?? this.attrs.has('checked'); } set checked(on) { this._checked = !!on; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    if (this.tagName === 'SELECT') { const options = this.querySelectorAll('option'); return (options.find(o => o.attrs.has('selected')) || options[0])?.getAttribute('value') ?? options[0]?.textContent ?? ''; }
    return this.attrs.get('value') ?? '';
  }
  set value(text) { this._value = String(text); }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(text) { this.replaceChildren(new Text(text ?? '')); }
  get innerHTML() { return this._html ?? ''; }
  set innerHTML(html) {
    this._html = String(html); this.replaceChildren();
    const stack = [this];
    for (const match of String(html).matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
      const token = match[0];
      if (token.startsWith('<!--')) continue;
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
  removeAttribute(name) { this.attrs.delete(name.toLowerCase()); }
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
  click() { if (!this.disabled) this.dispatchEvent({type: 'click', detail: 1}); }
  focus(options) { this.doc.activeElement = this; if (!options?.preventScroll) this.doc.scrolledTo = this; } // a browser scrolls a focused element into view unless told not to
  blur() {}
  scrollIntoView() {}
  getBoundingClientRect() { return this.doc.rects?.(this) || {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0}; }
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
const SAMPLE = {
  wywiad: 'Szczur, samiec, fancy rat, 1 rok 9 mies., ok. 420 g. Od ~2 tygodni nasilające się kichanie i świszczący oddech, czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych.',
  badanie: 'Stan ogólny obniżony, postawa zgarbiona, sierść nastroszna. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchwo nad polami płucnymi rzęzenia i świsty. BCS 2/5. T 37,8°C, HR ok. 360/min.',
  diagnoza: 'Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych.'
};
const WINDOW_CHANGED = 'Zmieniło się okno, proces programu lub mapowanie pól. Odczytaj pola ponownie.';
function fixture({fields = SAMPLE, storage: saved = {}, rects = null} = {}) { // rects(element): the box of a window or a control, for the tests that need a layout
  const doc = new Target(), win = new Target(), timers = new Map(), frames = new Map(), toasts = [], failures = [], api = {}, storage = new Map(Object.entries(saved)), clipboard = [];
  let now = 0, serial = 0;
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.createElement = tag => new Element(tag, doc); doc.createElementNS = (_, tag) => new Element(tag, doc);
  doc.querySelector = selector => doc.documentElement.querySelector(selector); doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.getElementById = id => doc.querySelector('#' + id); doc.hidden = false; doc.readyState = 'complete'; doc.rects = rects;
  const windows = new Map();
  const shell = {windows, toast: message => { toasts.push(message); return {remove() {}}; }, menu: () => null, confirm: o => toasts.push(o.message), registerApp() {},
    createWindow(o) {
      if (windows.has(o.id)) { const existing = windows.get(o.id); existing.show(); return existing; }
      const el = doc.createElement('section'); el.setAttribute('data-window', o.id); const content = doc.createElement('div'); content.className = 'window-content'; el.append(content); content.innerHTML = o.content; doc.body.append(el);
      const box = rects?.(el); if (box) Object.assign(el.style, {left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px'}); // as the shell's setRect
      const w = {id: o.id, el, content, options: o, title: o.title, closed: false, maximized: false, show() {}, focus() {}, minimize() {}, setBounds(box) { this.bounds = {...this.bounds, ...box}; },
        setTitle(title) { this.title = title; }, setContent(html) { content.innerHTML = html; },
        close() { if (o.onClose?.() === false) return false; this.closed = true; el.remove(); windows.delete(o.id); return true; }};
      windows.set(o.id, w); return w;
    }};
  const clinic = {fields: {...fields}, session: 1, editor: true, writes: [],
    isOpen: () => true, isEditorOpen: () => clinic.editor, getFields: () => ({...clinic.fields}), getActiveField: () => 'wywiad', setSpellingEnabled() {}, focusField() {}, markTarget() {}, open() {}, openEditor() {},
    getContext: () => ({editorOpen: clinic.editor, writable: clinic.editor, mode: 'edit', title: 'Rejestracja wizyty: Wywiad - Badanie - Diagnoza', patient: 'Fistaszek', visitNumber: '<NOWY>', session: clinic.editor ? clinic.session : 0}),
    setFields(next, options = {}) { // assets/clinic.js: the same sub-window session and the read text
      if (!clinic.editor) return {ok: false, reason: 'Nie znaleziono podokna opisu wizyty.'};
      if (options.session !== undefined && options.session !== clinic.session) return {ok: false, reason: WINDOW_CHANGED};
      if (options.expected && Object.keys(options.expected).some(k => options.expected[k] !== clinic.fields[k])) return {ok: false, reason: 'Treść wizyty zmieniła się od ostatniego odczytu.'};
      Object.assign(clinic.fields, next); clinic.writes.push({...next}); return {ok: true};
    },
    edit(key, text) { clinic.fields[key] = text; }, reopen() { clinic.session += 1; }};
  win.Clinic = clinic; win.Shell = shell;
  const context = vm.createContext({window: win, document: doc, Element, Clinic: clinic, Shell: shell, __api: api, __failures: failures,
    CSS: {escape: text => String(text).replace(/(["\\])/g, '\\$1')}, innerWidth: 1400, innerHeight: 900, navigator: {clipboard: {writeText: async text => { clipboard.push(text); }}}, performance: {now: () => now},
    matchMedia: () => ({matches: false, addEventListener() {}}),
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key)},
    setTimeout: (fn, delay = 0) => { timers.set(++serial, {fn, due: now + delay}); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++serial, clearInterval() {}, requestAnimationFrame: fn => { frames.set(++serial, fn); return serial; }, cancelAnimationFrame: id => frames.delete(id),
    Intl, Date, JSON, Math, Object, Array, Number, String, Map, Set, Promise, RegExp, Proxy});
  vm.runInContext(documentSource, context, {filename: 'assets/opisai-document.js'});
  win.OpisAIDocument = context.OpisAIDocument;
  vm.runInContext(controllerSource, context, {filename: 'assets/opisai.js'});
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      const pending = [...frames]; frames.clear(); pending.forEach(([, fn]) => fn(now));
      if (!next || next[1].due > end) break;
      now = Math.max(now, next[1].due); timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  const f = {api, doc, clinic, windows, toasts, failures, storage, clipboard, advance,
    win: id => windows.get(id), root: id => windows.get(id)?.content,
    q(id, selector) { const el = windows.get(id)?.content.querySelector(selector); assert.ok(el, `${id}: ${selector}`); return el; },
    click(id, selector) { f.q(id, selector).click(); f.advance(0); },
    press(id, selector) { const el = f.q(id, selector); el.focus(); el.click(); f.advance(0); return f.doc.activeElement; }, // Enter or Space on a focused control
    escape(id) { f.win(id).el.dispatchEvent({type: 'keydown', key: 'Escape'}); f.advance(0); },
    type(id, selector, text) { const el = f.q(id, selector); el.value = text; el.dispatchEvent({type: 'input'}); f.advance(0); },
    check(id, selector, on = true) { const el = f.q(id, selector); el.checked = on; el.dispatchEvent({type: 'change'}); f.advance(0); },
    get phase() { return api.state.phase; },
    compose(options) { api.prepare(options); f.advance(1000); assert.ok(f.win('opisai-compose'), 'the compose window opens after the read'); },
    tiles() { return f.root('opisai-compose').querySelectorAll('[data-tile]').map(t => ({text: t.textContent.trim(), disabled: t.getAttribute('aria-disabled') === 'true', title: t.title, selected: t.classList.contains('selected')})); },
    generate() { f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]'); f.advance(30000); assert.ok(f.win('opisai-review')?.content.querySelector('#oa-review-ack'), 'the review replaces the progress page'); },
    approve(ms = 5000) { f.check('opisai-review', '#oa-review-ack'); f.click('opisai-review', '[data-action="apply"]'); f.advance(ms); },
    messageText() { return f.root('opisai-message')?.querySelector('.oa-mb-text')?.textContent ?? null; }};
  return f;
}

/* ------------------------------------------------------------------ tests */
test('compose: whole visit reads the sub-window first, then sources in the configured order and rc32 consent wording', () => {
  const f = fixture(); f.api.prepare();
  assert.equal(f.win('opisai-progress').title, 'OpisAI — odczyt wizyty', 'SafeCoordinator.capture shows the read');
  assert.equal(f.q('opisai-progress', '[data-heading]').textContent, 'Odczytuję pola');
  f.advance(1000);
  assert.equal(f.win('opisai-progress'), undefined);
  const root = f.root('opisai-compose');
  assert.deepEqual(root.querySelectorAll('[data-source-card] h3').map(h => h.textContent), ['Badanie kliniczne', 'Wywiad', 'Diagnoza']);
  assert.equal(f.q('opisai-compose', '[data-heading]').textContent, 'Przygotuj opis z AI');
  assert.equal(f.q('opisai-compose', '[data-ack-text]').textContent, 'Sprawdzone: wysyłam do ChatGPT tylko te pola, bez danych osobowych właściciela i personelu.');
  assert.equal(f.q('opisai-compose', '[data-action="generate"] span').textContent, 'Wyślij i przygotuj podgląd');
  assert.equal(f.q('opisai-compose', '[data-source-card="diagnoza"] [data-status]').textContent, 'Poza wybranym zakresem — diagnoza nie będzie opracowywana.');
  assert.deepEqual(f.tiles().filter(t => t.selected).map(t => t.text), ['Sam opis'], 'Variant() = Wiernie · sam opis by default');
  assert.equal(f.tiles().findIndex(t => t.selected), 3, 'the faithful row');
  assert.equal(f.q('opisai-compose', '[data-action="generate"]').disabled, true);
});

test('compose opens at its top: the selected tile gets the keyboard without scrolling the stacked sources away', () => {
  let f = fixture(); f.compose();
  const tile = f.root('opisai-compose').querySelectorAll('[data-tile]').find(t => t.classList.contains('selected'));
  assert(f.doc.activeElement === tile, 'the keyboard starts on the chosen variant');
  assert(f.doc.scrolledTo !== tile, 'focus({preventScroll: true}): in a narrow window the tiles lie below the sources');
  f = fixture({fields: {...SAMPLE, badanie: ''}}); f.compose();
  assert(f.doc.activeElement === f.q('opisai-compose', '[data-source="badanie"]'), 'an empty first source is filled in first');
  assert(f.doc.scrolledTo !== f.doc.activeElement);
});

test('compose: other sources or scope clear the consent visibly; the writing style alone keeps it (ApprovalState)', () => {
  const f = fixture(); f.compose();
  const ack = f.q('opisai-compose', '#oa-compose-ack'), foot = f.q('opisai-compose', '[data-foot]'), send = f.q('opisai-compose', '[data-action="generate"]');
  f.check('opisai-compose', '#oa-compose-ack'); assert.equal(send.disabled, false);
  f.root('opisai-compose').querySelectorAll('[data-tile]')[0].click(); f.advance(0); // Bogato · sam opis: only the style changes
  assert.equal(f.tiles()[0].selected, true); assert.equal(ack.checked, true, 'Bogato/Wiernie keeps the consent'); assert.equal(send.disabled, false);
  f.root('opisai-compose').querySelectorAll('[data-tile]')[1].click(); f.advance(0); // + panel: the scope changes
  assert.equal(ack.checked, false); assert.equal(send.disabled, true);
  assert.equal(foot.textContent, 'Zmieniło się to, co zostanie wysłane — zaznacz potwierdzenie ponownie.');
  f.check('opisai-compose', '#oa-compose-ack'); assert.equal(foot.textContent, 'Pola wizyty pozostaną bez zmian.');
  f.type('opisai-compose', '[data-source="wywiad"]', 'Szczur, kicha od tygodnia.');
  assert.equal(ack.checked, false, 'another source text clears it');
  assert.match(f.q('opisai-compose', '[data-rules] textarea').value, /ŹRÓDŁA: \[\{"label":"Badanie kliniczne"[^\n]*"label":"Wywiad","role":"standard","text":"Szczur, kicha od tygodnia\."/);
  f.type('opisai-compose', '[data-source="badanie"]', ''); f.type('opisai-compose', '[data-source="wywiad"]', '');
  assert.equal(f.q('opisai-compose', '[data-error]').textContent, 'Uzupełnij treść pola objętego wybranym zakresem.');
  assert.equal(f.q('opisai-compose', '[data-source-card="wywiad"] [data-status]').textContent, 'Puste pole — możesz je uzupełnić.');
});

test('compose: a dropped field offers the rc32 matrix (no panel for the history, the diagnosis column only for the diagnosis)', () => {
  let f = fixture(); f.compose({field: 'wywiad'});
  assert.deepEqual(f.root('opisai-compose').querySelectorAll('[data-source-card] h3').map(h => h.textContent), ['Wywiad']);
  assert.deepEqual(f.tiles().map(t => t.disabled), [false, true, true, false, true, true]);
  assert.equal(f.tiles()[1].title, 'Parametry życiowe nie są dostępne dla wskazanych pól.');
  assert.equal(f.tiles()[2].title, 'Rozpoznanie robocze nie jest dostępne dla wskazanych pól.');
  assert.equal(f.tiles()[2].text, '+ rozpoznanie');
  f = fixture(); f.compose({field: 'badanie'});
  assert.deepEqual(f.tiles().map(t => t.disabled), [false, false, true, false, false, true]);
  f = fixture(); f.compose({field: 'diagnoza'});
  assert.deepEqual(f.root('opisai-compose').querySelectorAll('[data-source-card] h3').map(h => h.textContent), ['Badanie kliniczne', 'Wywiad', 'Diagnoza']);
  assert.deepEqual(f.tiles().map(t => [t.text, t.disabled]), [['Rozpoznanie', false], ['+ panelparametrów', true], ['+ rozpoznanie', true], ['Rozpoznanie', false], ['+ panelparametrów', true], ['+ rozpoznanie', true]]);
  assert.equal(f.tiles()[2].title, 'Rozpoznanie robocze jest już uwzględnione w tym trybie.');
  assert.equal(f.tiles()[3].selected, true);
});

test('variant memory: an approved whole-visit choice is remembered, a dropped field or a forced projection never changes it', () => {
  const f = fixture(); f.compose();
  f.root('opisai-compose').querySelectorAll('[data-tile]')[2].click(); f.advance(0); // Bogato + panel + rozpoznanie
  f.generate();
  assert.deepEqual(JSON.parse(f.storage.get('opisai.demo.variant.v1')), {rich: true, panel: true, diagnosis: true});
  f.click('opisai-review', '[data-action="reject"]');
  f.compose({field: 'wywiad'});
  assert.equal(f.tiles()[0].selected, true, 'projected onto the available Bogato · sam opis');
  f.generate();
  assert.deepEqual(JSON.parse(f.storage.get('opisai.demo.variant.v1')), {rich: true, panel: true, diagnosis: true}, 'remember_variant only for the whole visit');
});

test('generation: cancelling keeps the edited note; "Wróć do notatki" reads again and reopens it unconfirmed', () => {
  const f = fixture(); f.compose();
  f.type('opisai-compose', '[data-source="wywiad"]', 'Szczur, kicha od tygodnia.');
  f.root('opisai-compose').querySelectorAll('[data-tile]')[1].click(); f.advance(0);
  f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]'); f.advance(500);
  assert.equal(f.win('opisai-review').title, 'OpisAI — przygotowuję wersję roboczą');
  assert.equal(f.phase, 'processing');
  assert.equal(f.win('opisai-review').close(), false, 'the × only requests cancellation');
  assert.equal(f.q('opisai-review', '[data-heading]').textContent, 'Anuluję generowanie');
  f.advance(2000);
  assert.equal(f.win('opisai-recovery').title, 'OpisAI — następny krok');
  assert.equal(f.q('opisai-recovery', 'h2').textContent, 'Anulowano przygotowanie');
  assert.match(f.q('opisai-recovery', '[data-note] pre').textContent, /Wywiad: Szczur, kicha od tygodnia\./);
  assert.equal(f.phase, 'idle'); assert.equal(f.api.state.history.length, 0, 'nothing reached a review');
  f.click('opisai-recovery', '[data-action="mb-act"]'); f.advance(1000);
  assert.equal(f.q('opisai-compose', '[data-source="wywiad"]').value, 'Szczur, kicha od tygodnia.');
  assert.equal(f.q('opisai-compose', '#oa-compose-ack').checked, false);
  assert.equal(f.tiles()[1].selected, true, 'the chosen variant comes back');
});

test('generation: a changed visit refuses to resume the retained note', () => {
  const f = fixture(); f.compose();
  f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]'); f.advance(500);
  f.click('opisai-review', '[data-action="cancel"]'); f.advance(2000);
  f.clinic.edit('badanie', 'Nowe badanie.');
  f.click('opisai-recovery', '[data-action="mb-act"]'); f.advance(1000);
  assert.equal(f.q('opisai-recovery', 'h2').textContent, 'Sprawdź bieżącą wizytę');
  assert.match(f.q('opisai-recovery', '.oa-mb-text').textContent, /^Zmieniło się okno docelowe, jego proces lub odczytane pola\. Wczytaj je ponownie\./);
  assert.equal(f.win('opisai-compose'), undefined);
});

test('review: rc32 header, structured subsections with provenance, field choice and the exact rendered text', () => {
  const f = fixture(); f.compose(); f.root('opisai-compose').querySelectorAll('[data-tile]')[2].click(); f.advance(0); f.generate();
  assert.equal(f.win('opisai-review').title, 'OpisAI 0.12.0rc32 — sprawdź i zatwierdź wynik');
  assert.equal(f.q('opisai-review', '[data-summary]').textContent, 'Podgląd · Bogato · Do wpisania: 3/3 pól');
  assert.equal(f.q('opisai-review', '[data-components]').textContent, 'Wnioskowanie: 3 fragmentów');
  assert.match(f.q('opisai-review', '.oa-rv-info').textContent, /Sprawdź także rozpoznania i propozycje AI\.$/);
  assert.deepEqual(f.root('opisai-review').querySelectorAll('[data-tab]').map(t => t.textContent.replace(/ · \d+$/, '')), ['Badanie', 'Wywiad', 'Rozpoznanie', 'Szczegóły']);
  const names = f.root('opisai-review').querySelectorAll('.oa-se-name').map(n => n.textContent);
  assert.deepEqual(names, ['Stan ogólny', 'Temperatura', 'CRT', 'Błony śluzowe', 'Tętno', 'Drogi oddechowe (osłuchowo)', 'Serce (osłuchowo)', 'Węzły chłonne', 'Brzuch', 'Odgłosy perystaltyczne']);
  const origin = label => f.root('opisai-review').querySelectorAll('.oa-se-row').find(r => r.querySelector('.oa-se-name').textContent === label).querySelector('.oa-se-origin').textContent;
  assert.equal(origin('CRT'), 'Z wzorca'); assert.equal(origin('Temperatura'), 'Ze źródła'); assert.equal(origin('Brzuch'), 'Ze źródła · uwaga');
  f.click('opisai-review', '[data-tab="diagnoza"]'); f.click('opisai-review', '[data-action="toggle-field"]');
  assert.equal(f.q('opisai-review', '[data-summary]').textContent, 'Podgląd · Bogato · Do wpisania: 2/3 pól');
  assert.equal(f.q('opisai-review', '[data-tab="diagnoza"]').textContent, 'Rozpoznanie · bez zmian');
  assert.equal(f.q('opisai-review', '[data-action="apply"] span').textContent, '✓\u00a0 Wpisz wybrane (2)');
  assert.ok(f.root('opisai-review').querySelectorAll('textarea[data-block]').every(t => t.readOnly), 'an unselected proposal is read-only');
  f.click('opisai-review', '[data-action="toggle-field"]');
  f.check('opisai-review', '#oa-review-ack'); f.click('opisai-review', '[data-action="apply"]');
  assert.equal(f.win('opisai-progress').title, 'OpisAI — wpisanie do pól');
  assert.equal(f.q('opisai-progress', '[data-message]').textContent, 'Kontrola pól → wpisanie → odczyt kontrolny.');
  assert.equal(f.q('opisai-progress', '[data-action="cancel"]').disabled, true, 'a controlled write cannot be cancelled');
  f.advance(1500);
  assert.equal(f.win('opisai-progress'), undefined);
  assert.equal(f.win('opisai-message').title, 'OpisAI — wpisano do pól');
  assert.match(f.clinic.fields.badanie, /^Badanie kliniczne:\nStan ogólny: obniżony\nTemperatura: 37,8°C\nCRT: <2 s\n/);
  assert.match(f.clinic.fields.diagnoza, /^Rozpoznanie wstępne:\nPodejrzenie mykoplazmozy układu oddechowego \(MRM\); zakażenie dróg oddechowych\.\n\nRóżnicowanie:\nDo rozważenia: /);
  assert.doesNotMatch(f.clinic.fields.diagnoza, /wymaga oceny lekarza|na podstawie notatki/);
  assert.equal(f.phase, 'done'); f.advance(4000); assert.equal(f.phase, 'idle', 'Gotowe for 4 s');
});

test('approval: a changed text needs a new check; emptying a filled field needs the separate permission', () => {
  const f = fixture(); f.compose(); f.generate();
  f.check('opisai-review', '#oa-review-ack');
  f.type('opisai-review', 'textarea[data-block]', 'Poprawiony opis.');
  assert.equal(f.q('opisai-review', '#oa-review-ack').checked, false, 'ReviewPage._changed clears the acknowledgement');
  f.click('opisai-review', '[data-tab="wywiad"]');
  for (const area of f.root('opisai-review').querySelectorAll('textarea[data-block]')) { area.value = ''; area.dispatchEvent({type: 'input'}); }
  f.advance(0);
  assert.equal(f.q('opisai-review', '[data-allow-row]').hidden, false);
  f.approve();
  assert.equal(f.q('opisai-review', '[data-review-error]').textContent, 'Wyzerowanie niepustego pola wymaga osobnego potwierdzenia.');
  assert.equal(f.clinic.writes.length, 0);
  f.check('opisai-review', '[data-allow-empty]'); f.approve();
  assert.equal(f.clinic.fields.wywiad, '');
  assert.match(f.clinic.fields.badanie, /^Badanie kliniczne:\nPoprawiony opis\.$/);
});

test('write: a field changed after the read is a conflict; nothing is written and the history keeps the approved text', () => {
  const f = fixture(); f.compose(); f.generate();
  f.clinic.edit('wywiad', SAMPLE.wywiad + ' Dopisek.');
  f.approve();
  assert.equal(f.win('opisai-message').title, 'OpisAI — sprawdź wynik wpisania');
  assert.equal(f.messageText(), 'Opis badania i ocena: nie wykonano. Zmieniono albo wymieniono pole: wywiad\nOpis wywiadu: nie wykonano\n\nTo wynik wpisania do kontrolek, nie potwierdzenie zapisu wizyty w bazie Kliniki.');
  assert.equal(f.clinic.writes.length, 0);
  f.api.history();
  assert.match(f.q('opisai-history', '[data-list]').textContent, /Wiernie.*Nie wpisano — zmiana pól/);
  assert.equal(f.q('opisai-history', '[data-action="copy-history"] span').textContent, 'Kopiuj wynik');
});

test('write: a reopened sub-window is another window; a closed one is an unconfirmed write', () => {
  let f = fixture(); f.compose(); f.generate();
  f.clinic.reopen(); f.approve();
  assert.equal(f.messageText().split('\n')[0], 'Opis badania i ocena: nie wykonano. ' + WINDOW_CHANGED);
  assert.equal(f.clinic.writes.length, 0);
  f = fixture(); f.compose(); f.generate();
  f.clinic.editor = false; f.approve();
  assert.equal(f.win('opisai-recovery').title, 'OpisAI — sprawdź wpisanie');
  assert.equal(f.q('opisai-recovery', 'h2').textContent, 'Sprawdź wynik wpisania');
  assert.equal(f.clinic.writes.length, 0);
});

test('undo: checks the fields first, then OBECNIE/PRZYWRÓĆ and the same controlled write; not recorded in history', () => {
  const f = fixture(); f.compose(); f.generate(); f.approve();
  const written = {...f.clinic.fields};
  f.click('opisai-message', '[data-action="mb-close"]');
  f.clinic.edit('wywiad', written.wywiad + ' Edycja.');
  f.api.undo(); f.advance(1000);
  assert.equal(f.messageText(), 'Pole zmieniono po naszym wpisie. Nie cofnięto: wywiad');
  assert.equal(f.win('opisai-undo'), undefined);
  f.click('opisai-message', '[data-action="mb-close"]');
  f.clinic.edit('wywiad', written.wywiad);
  f.clinic.reopen(); f.api.undo(); f.advance(1000);
  assert.equal(f.messageText(), WINDOW_CHANGED);
  f.click('opisai-message', '[data-action="mb-close"]');
  f.clinic.session -= 1; f.api.undo(); f.advance(1000);
  assert.match(f.q('opisai-undo', 'textarea').value, /^Opis badania i ocena:\nOBECNIE:\nBadanie kliniczne:\n[\s\S]*\nPRZYWRÓĆ:\nStan ogólny obniżony, postawa zgarbiona/);
  f.click('opisai-undo', '[data-action="ok"]'); f.advance(5000);
  assert.equal(f.win('opisai-message').title, 'OpisAI — wpisano do pól');
  assert.deepEqual(f.clinic.fields, SAMPLE);
  assert.equal(f.api.state.history.length, 1);
  assert.equal(f.api.state.history[0].status, 'written');
});

test('history: generated on review, rejected by × on the review; every status worded as in rc32', () => {
  const f = fixture(); f.compose(); f.generate();
  assert.equal(f.api.state.history[0].status, 'generated');
  f.win('opisai-review').close(); f.advance(0);
  assert.equal(f.api.state.history[0].status, 'rejected');
  assert.equal(f.phase, 'idle');
  f.api.history();
  assert.match(f.q('opisai-history', '[data-summary]').textContent, /^Odrzucono — bez wpisania · \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\nZapisany stan dokumentu; ten podgląd nie zmienia bieżącej wizyty\.$/);
  assert.deepEqual(f.root('opisai-history').querySelectorAll('[data-doc-tabs] [data-page]').map(t => t.textContent), ['Wersja robocza', 'Źródła', 'Propozycja', 'Poprawki', 'Przed wpisaniem', 'Ustawienia']);
  assert.equal(f.q('opisai-history', '[data-action="copy-history"] span').textContent, 'Kopiuj wersję roboczą');
});

test('dictation summary: rc32 transcription line from the session source and the footer order', () => {
  const f = fixture();
  f.api.review({id: 7, mode: 'dictation', field: 'badanie', snapshot: {...SAMPLE}, session: 1, output: {badanie: SAMPLE.badanie + '\nBłony śluzowe bladoróżowe.'}, sources: {badanie: 'Błony śluzowe bladoróżowe.'},
    transcription: {backend: 'gemini', model: 'gemini-3.5-transcribe-live', language: 'pl-PL', mode: 'transcribe', realtime_model: ''}, variant: {rich: false, panel: false, diagnosis: false}});
  assert.equal(f.q('opisai-review', '.oa-rv-pre').textContent, 'Transkrypcja: Gemini Live · Model sesji: gemini-3.5-transcribe-live\nJęzyk ustawiony: Polski (pl-PL)');
  assert.equal(f.q('opisai-review', '[data-summary]').textContent, 'Dyktowanie · Do wpisania: 1/1 pól');
  assert.equal(f.q('opisai-review', '[data-tab="badanie"]').textContent, 'Dyktowanie — Opis badania i ocena');
  assert.deepEqual(f.q('opisai-review', 'footer').children.map(b => b.textContent.trim()).filter(Boolean), ['Wpisz samą notatkę', 'Odrzuć', 'Wpisanie do pól nie zapisuje wizyty w Klinice.', 'Kontynuuj dyktowanie', 'Generuj opis']);
  assert.equal(f.q('opisai-review', '[data-compare-text]').value, 'Błony śluzowe bladoróżowe.', 'the transcript is the sent source');
  f.click('opisai-review', '[data-tab="details"]');
  assert.deepEqual(f.root('opisai-review').querySelectorAll('[data-details]').map(t => t.textContent), ['Źródło', 'Transkrypcja', 'Kontrole']);
});

test('dictation → "Generuj opis" → Anuluj returns to the summary; a changed field keeps it behind the bubble', () => {
  const f = fixture(), result = {id: 8, mode: 'dictation', field: 'badanie', snapshot: {...SAMPLE}, session: 1, output: {badanie: SAMPLE.badanie + '\nBłony śluzowe bladoróżowe.'}, variant: {rich: false, panel: false, diagnosis: false}};
  f.api.review(result);
  f.click('opisai-review', '[data-action="compose"]'); f.advance(1000);
  assert.equal(f.q('opisai-compose', '[data-source="badanie"]').value, SAMPLE.badanie + '\nBłony śluzowe bladoróżowe.', 'the reviewed text replaces only the source copy');
  assert.equal(f.clinic.fields.badanie, SAMPLE.badanie);
  f.click('opisai-compose', '[data-action="cancel"]'); f.advance(10);
  assert.ok(f.win('opisai-review')?.content.querySelector('[data-plain]'), '_restore_dictation_generation(reopen=True)');
  assert.equal(f.phase, 'review');
  f.clinic.edit('badanie', SAMPLE.badanie + ' Zmiana.');
  f.click('opisai-review', '[data-action="compose"]'); f.advance(1000);
  assert.equal(f.messageText(), 'Pole wizyty zmieniło się podczas dyktowania. Sprawdź je przed dalszym opracowaniem transkrypcji.');
  assert.equal(f.win('opisai-review'), undefined); assert.equal(f.phase, 'review'); assert.equal(f.api.state.review, result);
});

test('consent: an edit of a source outside the chosen scope also clears it (asdict(request) carries every source)', () => {
  const f = fixture(); f.compose();
  const ack = f.q('opisai-compose', '#oa-compose-ack');
  f.check('opisai-compose', '#oa-compose-ack');
  assert.equal(f.q('opisai-compose', '[data-source-card="diagnoza"] [data-status]').textContent, 'Poza wybranym zakresem — diagnoza nie będzie opracowywana.');
  f.type('opisai-compose', '[data-source="diagnoza"]', SAMPLE.diagnoza + ' Edytowane.');
  assert.equal(ack.checked, false);
  assert.equal(f.q('opisai-compose', '[data-foot]').textContent, 'Zmieniło się to, co zostanie wysłane — zaznacz potwierdzenie ponownie.');
  assert.equal(f.q('opisai-compose', '[data-action="generate"]').disabled, true);
});

test('focus: a rebuilt review tab, field action, comparison or detail tab keeps the keyboard focus; "Wybierz" moves it into the editor', () => {
  const f = fixture(); f.compose(); f.generate();
  let active = f.press('opisai-review', '[data-tab="wywiad"]');
  assert.ok(active.isConnected); assert.equal(active.dataset.tab, 'wywiad');
  active = f.press('opisai-review', '[data-action="toggle-field"]');
  assert.ok(active.isConnected); assert.equal(active.dataset.action, 'toggle-field'); assert.equal(active.textContent, 'Wybierz', '"Pomiń" keeps the focus on its action');
  active = f.press('opisai-review', '[data-action="toggle-field"]');
  assert.ok(active.isConnected); assert.ok(active.hasAttribute('data-block') && !active.readOnly, '_toggle_target focuses the selected field\'s editor');
  active = f.press('opisai-review', '[data-action="compare"]');
  assert.ok(active.isConnected); assert.equal(active.textContent, 'Ukryj porównanie');
  f.press('opisai-review', '[data-tab="details"]');
  active = f.press('opisai-review', '[data-details="controls"]');
  assert.ok(active.isConnected); assert.equal(active.dataset.details, 'controls');
});

test('history: the copy is the epikryza (field texts without labels); every request source is kept; tabs and entries keep the focus', () => {
  const f = fixture(); f.compose(); f.generate(); f.approve();
  f.click('opisai-message', '[data-action="mb-close"]');
  f.compose(); f.generate(); f.click('opisai-review', '[data-action="reject"]');
  f.api.history();
  let active = f.press('opisai-history', '[data-page="sources"]');
  assert.ok(active.isConnected); assert.equal(active.dataset.page, 'sources');
  const read = f.clinic.fields; // the second document read the fields after the first write
  assert.equal(f.q('opisai-history', '[data-doc-text]').value, `Badanie kliniczne:\n${read.badanie}\n\nWywiad:\n${read.wywiad}\n\nDiagnoza:\n${SAMPLE.diagnoza}`, 'the diagnosis outside the scope is a request source too');
  const entries = f.root('opisai-history').querySelectorAll('[data-entry]'), written = f.api.state.history.find(e => e.status === 'written');
  active = f.press('opisai-history', `[data-entry="${entries[1].dataset.entry}"]`);
  assert.ok(active.isConnected); assert.equal(active.dataset.entry, written.id);
  f.click('opisai-history', '[data-action="copy-history"]');
  assert.equal(f.clipboard.at(-1), `${f.clinic.fields.badanie}\n\n${f.clinic.fields.wywiad}`, 'exactly what was written, without headings');
});

test('a child window never outlives its parent: the prompt-and-answer view goes with the review, the delete question with Historia', () => {
  const exchange = f => { f.click('opisai-review', '[data-tab="details"]'); f.click('opisai-review', '[data-action="exchange"]'); assert.equal(f.win('opisai-exchange')?.title, 'OpisAI — polecenie i odpowiedź AI'); };
  let f = fixture(); f.compose(); f.generate(); exchange(f);
  f.click('opisai-review', '[data-action="reject"]');
  assert(!f.win('opisai-exchange'), 'ReviewPage._complete closes it with "Odrzuć"'); assert.equal(f.phase, 'idle');
  f.compose(); assert.ok(f.win('opisai-compose'), 'so the next click on the bubble starts the next description');
  f = fixture(); f.compose(); f.generate(); exchange(f);
  f.win('opisai-review').close(); f.advance(0); assert(!f.win('opisai-exchange'), 'with the × of the review');
  f = fixture(); f.compose(); f.generate(); exchange(f);
  f.click('opisai-review', '[data-tab="badanie"]'); f.approve(); assert(!f.win('opisai-exchange'), 'and with the approved write');
  f.click('opisai-message', '[data-action="mb-close"]');
  f.api.history(); f.click('opisai-history', '[data-action="delete-history"]');
  assert.equal(f.q('opisai-history-delete', '.oa-mb-text').textContent, 'Usunąć ten dokument z historii OpisAI?');
  f.win('opisai-history').close(); f.advance(0);
  assert(!f.win('opisai-history-delete'), 'the question closes with its list'); assert.equal(f.api.state.history.length, 1, 'unanswered: nothing is deleted');
  f.api.history(); f.click('opisai-history', '[data-action="delete-history"]'); f.api.history(); // the list opened again from Start
  assert(!f.win('opisai-history-delete'), 'a rebuilt list has no question about the old one');
  f.click('opisai-history', '[data-action="delete-history"]'); f.click('opisai-history-delete', '[data-action="mb-yes"]');
  assert.equal(f.api.state.history.length, 0); assert.equal(f.root('opisai-history').querySelectorAll('[data-entry]').length, 0, 'answered in its list, the entry goes');
});

test('OpisAI says it in its own message box: the journal from the bubble menu and from a recovery report, "Zamknij" during generation', () => {
  let f = fixture();
  const journal = () => [f.win('opisai-journal')?.title, f.q('opisai-journal', 'h2').textContent, f.q('opisai-journal', '.oa-mb-text').textContent];
  const empty = ['Dziennik', 'Informacja', 'Brak niezamkniętych lub niepotwierdzonych operacji.']; // QMessageBox.information(bubble, "Dziennik", …)
  f.api.menu().find(item => item.label === 'Bezpieczny zapis i odzyskiwanie').children().find(item => item.label === 'Sprawdź niepotwierdzone operacje…').onClick(); f.advance(0);
  assert.deepEqual(journal(), empty); assert.deepEqual(f.toasts, [], 'not the confirmation window of the desktop');
  assert.equal(f.doc.activeElement?.getAttribute('data-action'), 'mb-close', 'the keyboard is on OK');
  f.click('opisai-journal', '[data-action="mb-close"]'); assert(!f.win('opisai-journal'));
  f.compose(); f.generate(); f.clinic.editor = false; f.approve(); // an unconfirmed write: the report offers "Sprawdź dziennik"
  assert.equal(f.q('opisai-recovery', '[data-action="mb-act"]').textContent, 'Sprawdź dziennik'); f.click('opisai-recovery', '[data-action="mb-act"]');
  assert.deepEqual(journal(), empty, 'the same window from the report');
  f = fixture(); f.compose(); f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]'); f.advance(500);
  f.api.closeApp(); f.advance(0); // can_quit: the job is cancelled and _say() explains
  assert.equal(f.win('opisai-message').title, 'OpisAI — informacja'); assert.equal(f.messageText(), 'Kończę transport. Zamknij aplikację po zwolnieniu bieżącej operacji.');
  assert.deepEqual(f.toasts, []); assert.equal(f.api.state.closed, false); assert.equal(f.q('opisai-review', '[data-heading]').textContent, 'Anuluję generowanie');
  f.advance(2000); assert.equal(f.q('opisai-recovery', 'h2').textContent, 'Anulowano przygotowanie');
});

test('compose, the review and a message box that open with a control under the bubble make room beside it; other views stay where they opened', () => {
  // Every window stands at 180,60 and is 1040 × 690 in a 1400 × 852 work area. The bubble is at 1100,500 and keeps 1020…1180 × 420…580.
  const UNDER = '[data-tile], [data-action="compare"], [data-action="mb-close"]'; // a variant tile, "Porównaj", "Gotowe"
  const layout = covered => el => el.hasAttribute('data-window') ? {left: 180, top: 60, width: 1040, height: 690} : covered && el.matches(UNDER) ? {left: 1060, top: 470, width: 80, height: 60} : null;
  const beside = {x: 12, y: 60, width: 1008, height: 690}; // place_around_orb: no room for the whole window, so the side that costs least (32 px of width)
  let f = fixture({rects: layout(true)}); f.api.bubbleAt(1100, 500);
  f.compose(); assert.deepEqual(f.win('opisai-compose').bounds, beside, 'a variant tile under the bubble: "Przygotuj opis" opens beside it');
  f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]'); f.advance(500);
  assert.equal(f.q('opisai-review', '[data-heading]').textContent, 'Powstaje opis wizyty'); assert.equal(f.win('opisai-review').bounds, undefined, 'the progress page has no control there');
  f.advance(30000); assert.ok(f.q('opisai-review', '#oa-review-ack')); assert.deepEqual(f.win('opisai-review').bounds, beside, '"Porównaj" under the bubble: the review page moves the window that showed the progress');
  f.approve(); assert.equal(f.win('opisai-message').title, 'OpisAI — wpisano do pól');
  assert.deepEqual(f.win('opisai-message').bounds, beside, '"Gotowe" under the bubble: the receipt, once it has its height');
  f = fixture({rects: layout(false)}); f.api.bubbleAt(1100, 500); // the same windows with nothing of theirs under the bubble
  f.compose(); assert.equal(f.win('opisai-compose').bounds, undefined, 'rc32: a view opens where the desktop puts it');
  f.generate(); assert.equal(f.win('opisai-review').bounds, undefined);
  f.approve(); assert.deepEqual(Object.keys(f.win('opisai-message').bounds), ['height'], 'a message box only takes the height of its content');
  f = fixture({rects: layout(true)}); f.compose(); f.generate(); f.approve(); // no bubble on the screen (closed, or soaked into a field)
  assert.deepEqual(Object.keys(f.win('opisai-message').bounds), ['height']);
});

test('undo: a conflicting write is the last receipt; undo asks to clarify it instead of reverting an older write', () => {
  const f = fixture(); f.compose({field: 'wywiad'}); f.generate(); f.approve();
  assert.equal(f.win('opisai-message').title, 'OpisAI — wpisano do pól');
  f.click('opisai-message', '[data-action="mb-close"]');
  const written = f.clinic.fields.wywiad;
  f.compose({field: 'badanie'}); f.generate();
  f.clinic.edit('badanie', SAMPLE.badanie + ' Dopisek lekarza.');
  f.approve();
  assert.equal(f.win('opisai-message').title, 'OpisAI — sprawdź wynik wpisania');
  f.click('opisai-message', '[data-action="mb-close"]');
  f.api.undo(); f.advance(1000);
  assert.equal(f.messageText(), 'Najpierw wyjaśnij niepotwierdzony wynik poprzedniego zapisu.', 'WriteService.inverse refuses a conflict receipt');
  assert.ok(!f.win('opisai-undo'), 'opisai-undo is closed');
  assert.equal(f.clinic.fields.wywiad, written);
});

test('Esc is reject(): compose cancels, the read and the generation ask to cancel, the review is rejected, undo is not accepted, history closes', () => {
  let f = fixture(); f.compose(); f.escape('opisai-compose');
  assert.ok(!f.win('opisai-compose'), 'opisai-compose is closed'); assert.ok(!f.api.state.operation, 'composeClosed ends the operation'); assert.equal(f.phase, 'idle');
  f.api.prepare(); f.advance(0);
  assert.equal(f.doc.activeElement?.dataset.action, 'cancel', 'the read focuses Anuluj');
  f.escape('opisai-progress');
  assert.equal(f.q('opisai-progress', '[data-heading]').textContent, 'Anuluję operację');
  f.advance(1000); assert.ok(!f.win('opisai-compose'), 'a cancelled read opens nothing');
  f.compose(); f.check('opisai-compose', '#oa-compose-ack'); f.click('opisai-compose', '[data-action="generate"]');
  assert.equal(f.doc.activeElement?.dataset.action, 'hide-stream', 'ProgressPage focuses "Ukryj" while the live text shows');
  f.escape('opisai-review');
  assert.equal(f.q('opisai-review', '[data-heading]').textContent, 'Anuluję generowanie');
  f.advance(2000); assert.equal(f.q('opisai-recovery', 'h2').textContent, 'Anulowano przygotowanie');
  f = fixture(); f.compose(); f.generate(); f.escape('opisai-review');
  assert.ok(!f.win('opisai-review'), 'opisai-review is closed'); assert.equal(f.api.state.history[0].status, 'rejected');
  f = fixture(); f.compose(); f.generate(); f.approve(); f.click('opisai-message', '[data-action="mb-close"]');
  const written = {...f.clinic.fields};
  f.api.undo(); f.advance(1000); assert.ok(f.win('opisai-undo'));
  f.escape('opisai-undo'); f.advance(5000);
  assert.ok(!f.win('opisai-undo'), 'opisai-undo is closed'); assert.deepEqual(f.clinic.fields, written, 'not accepted: nothing is restored');
  f.api.history(); f.escape('opisai-history'); assert.ok(!f.win('opisai-history'), 'opisai-history is closed');
  const result = {id: 9, mode: 'dictation', field: 'badanie', snapshot: {...SAMPLE}, session: 1, output: {badanie: SAMPLE.badanie + '\nBłony śluzowe bladoróżowe.'}, variant: {rich: false, panel: false, diagnosis: false}};
  f = fixture(); f.api.review(result); f.click('opisai-review', '[data-action="compose"]'); f.advance(1000);
  f.escape('opisai-compose'); f.advance(10);
  assert.ok(f.win('opisai-review')?.content.querySelector('[data-plain]'), 'the dictation summary comes back');
});

test('settings: no inert compose switches; the page shows the layout and panel template the workflow uses', () => {
  const f = fixture(); f.api.settings('sections');
  const page = f.q('opisai-settings', '[data-settings-page]');
  assert.equal(page.querySelectorAll('[data-setting], [data-panel-row], [data-section-name]').length, 0);
  assert.deepEqual(page.querySelectorAll('.oa-doc-layout tbody tr').map(tr => tr.children[1].textContent), ['Opis badania i ocena', 'Opis wywiadu', 'Rozpoznanie robocze']);
  page.querySelector('[data-vitals]').click(); f.advance(0); // "Konfiguruj": the panel template the workflow uses
  assert.match(f.root('opisai-vitals').textContent, /Wartości z notatki zastępują odpowiednie pozycje szablonu\./);
  assert.ok(f.root('opisai-vitals').querySelectorAll('tbody td').some(td => td.textContent === 'niepowiększone, niebolesne, przesuwalne względem podłoża'));
  f.click('opisai-settings', '[data-page="history"]');
  assert.doesNotMatch(f.q('opisai-settings', '[data-settings-page] p').textContent, /Potwierdzone wpisy/);
});

test('review compaction: no later plain rule undoes a short- or narrow-window rule (ReviewPage._layout_review)', () => {
  const lines = fs.readFileSync(path.join(__dirname, '../assets/opisai.css'), 'utf8').split('\n');
  const weight = selector => (selector.match(/[.#[]|:(?!not\b)[\w-]/g) || []).length, last = selector => selector.trim().split(/\s+/).at(-1);
  const sets = (declarations, property) => declarations.split(';').some(d => { const name = d.split(':')[0].trim(); return name === property || name === property.split('-')[0]; });
  const plain = lines.flatMap((line, i) => line.startsWith('@') ? [] : [...line.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(m => m[1].split(',').map(selector => ({i, selector: selector.trim(), declarations: m[2]}))));
  let checked = 0;
  lines.forEach((line, i) => {
    const m = /^@container \(max-(?:height|width):\d+px\)\{(.*)\}/.exec(line); if (!m || !/oa-(?:rv|c2|pg)-/.test(m[1])) return;
    for (const r of m[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) for (const selector of r[1].split(',')) for (const property of r[2].split(';').map(d => d.split(':')[0].trim()).filter(Boolean)) {
      checked++;
      for (const p of plain) if (p.i > i && last(p.selector) === last(selector) && sets(p.declarations, property))
        assert.ok(weight(p.selector) < weight(selector), `${selector.trim()} {${property}} at line ${i + 1} is undone by ${p.selector} at line ${p.i + 1}`);
    }
  });
  assert.ok(checked > 10);
  assert.match(source, /class="oa-footnote oa-rv-fnote"/, 'the footer note has its own class');
  assert.doesNotMatch(lines.filter(l => l.startsWith('@container')).join('\n'), /\.oa-rv-note\b/, 'the visible quality-note rows are never hidden by width');
});
