'use strict';

// Konfiguracja and O aplikacji of assets/opisai.js against a small DOM (the harness of
// documentation-workflow.test.cjs) and facts read from the real OpisAI 0.12.0rc32 modules
// (tests/fixtures/rc32-settings.json: domain/providers.py, domain/app_info.py, creds_ui_for,
// document_defaults.default_sections and the SHA-256 of LICENSE.txt). Behaviour: ConfigDialog
// _set_dirty / _mark_dirty / _on_tab_changed / _on_accept / reject, _filter_nav, _update_provider_ui,
// _reset_gemini_btn, the controller's _open_config / _open_about, ui/about.py.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const rc32 = require('./fixtures/rc32-settings.json');
const source = fs.readFileSync(path.join(__dirname, '../assets/opisai.js'), 'utf8');
const documentSource = fs.readFileSync(path.join(__dirname, '../assets/opisai-document.js'), 'utf8');
const startup = "  if(document.readyState==='loading')";
assert.equal(source.split(startup).length, 2, 'The test boundary must precede the single application startup');
const controllerSource = source.replace(startup, `
  Object.assign(__api,{prepare,settings,about,history,state,preferences:()=>preferences,windows,PROVIDERS,TRANSPORT_LABELS,AUTH_LABELS,connectionLabel,modelLabel,applicationInfoText,LICENSE_TEXTS,APP_RELEASE_NOTES,APP_CAPABILITIES,providerNames,THIRD_PARTY_LICENSES,HW_LLM});
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
  get type() { return this.attrs.get('type') ?? (this.tagName === 'INPUT' ? 'text' : this.tagName === 'SELECT' ? 'select-one' : ''); } // reflected as in browsers
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
  focus() { this.doc.activeElement = this; }
  blur() {}
  scrollIntoView() {}
  getBoundingClientRect() { return {top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0}; }
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
const SAMPLE = {wywiad: 'Szczur, kicha od tygodnia.', badanie: 'T 38,1°C, HR 320/min.', diagnoza: 'Nieżyt górnych dróg oddechowych.'};
function fixture({prefs, desktop = 'light', editor = true, spelling = null} = {}) {
  const doc = new Target(), win = new Target(), timers = new Map(), toasts = [], notices = [], api = {}, storage = new Map(), clipboard = [];
  if (prefs) storage.set('opisai-demo-settings-v12', JSON.stringify(prefs));
  let now = 0, serial = 0, refuses = false; // refuses: a blocked or full browser storage
  doc.documentElement = new Element('html', doc); doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.documentElement.setAttribute('data-theme', desktop);
  doc.createElement = tag => new Element(tag, doc); doc.createElementNS = (_, tag) => new Element(tag, doc);
  doc.querySelector = selector => doc.documentElement.querySelector(selector); doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.getElementById = id => doc.querySelector('#' + id); doc.hidden = false; doc.readyState = 'complete';
  const windows = new Map();
  const shell = {windows, prefs: {theme: desktop}, toast: message => { toasts.push(message); return {remove() {}}; }, notify: n => { notices.push({...n}); }, menu: () => null, confirm: o => toasts.push(o.message), registerApp() {},
    createWindow(o) {
      if (windows.has(o.id)) { const existing = windows.get(o.id); existing.show(); return existing; }
      const el = doc.createElement('section'); el.setAttribute('data-window', o.id); el.className = o.className || ''; const content = doc.createElement('div'); content.className = 'window-content'; el.append(content); content.innerHTML = o.content; doc.body.append(el);
      const w = {id: o.id, el, content, options: o, title: o.title, closed: false, show() {}, focus() {}, minimize() {}, setBounds() {},
        setTitle(title) { this.title = title; }, setContent(html) { content.innerHTML = html; },
        close() { if (o.onClose?.() === false) return false; this.closed = true; el.remove(); windows.delete(o.id); return true; }};
      windows.set(o.id, w); return w;
    }};
  const clinic = {fields: {...SAMPLE}, editor, session: 1, isOpen: () => true, isEditorOpen: () => clinic.editor, getFields: () => ({...clinic.fields}), getActiveField: () => 'badanie', focusField() {}, markTarget() {}, open() {}, openEditor() {},
    getContext: () => ({editorOpen: clinic.editor, writable: clinic.editor, mode: 'edit', title: '[DEMO] Rejestracja wizyty: Wywiad - Badanie - Diagnoza', mainTitle: '[DEMO] Klinika XP - [Przebieg wizyty - Zwierzę domowe]', patient: 'Fistaszek', visitNumber: '<NOWY>', session: clinic.editor ? clinic.session : 0}),
    setFields: () => ({ok: true})};
  win.Clinic = clinic; win.Shell = shell; if (spelling) win.OpisAISpelling = spelling; // assets/opisai-spelling.js loads before opisai.js
  const context = vm.createContext({window: win, document: doc, Element, Clinic: clinic, Shell: shell, __api: api,
    CSS: {escape: text => String(text).replace(/(["\\])/g, '\\$1')}, innerWidth: 1400, innerHeight: 900, navigator: {clipboard: {writeText: async text => { clipboard.push(text); }}}, performance: {now: () => now},
    matchMedia: () => ({matches: false, addEventListener() {}}), encodeURIComponent, Event: function Event(type) { this.type = type; },
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (refuses) throw new Error('QuotaExceededError'); storage.set(key, String(value)); }, removeItem: key => storage.delete(key)},
    setTimeout: (fn, delay = 0) => { timers.set(++serial, {fn, due: now + delay}); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++serial, clearInterval() {}, requestAnimationFrame: fn => ++serial, cancelAnimationFrame() {},
    Intl, Date, JSON, Math, Object, Array, Number, String, Map, Set, Promise, RegExp, Proxy});
  vm.runInContext(documentSource, context, {filename: 'assets/opisai-document.js'});
  win.OpisAIDocument = context.OpisAIDocument;
  vm.runInContext(controllerSource, context, {filename: 'assets/opisai.js'});
  function advance(ms) { const end = now + ms; for (;;) { const next = [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]; if (!next || next[1].due > end) break; now = Math.max(now, next[1].due); timers.delete(next[0]); next[1].fn(); } now = end; }
  const f = {api, doc, win, shell, clinic, windows, toasts, notices, storage, clipboard, advance, refuseStorage(on) { refuses = on; },
    root: id => windows.get(id)?.content,
    q(id, selector) { const el = windows.get(id)?.content.querySelector(selector); assert.ok(el, `${id}: ${selector}`); return el; },
    click(id, selector) { f.q(id, selector).click(); f.advance(0); },
    page: () => f.q('opisai-settings', '[data-settings-page]'),
    text: id => f.root(id).textContent.replace(/\s+/g, ' '),
    bubble(el, event) { for (let node = el; node; node = node.parentNode) node.dispatchEvent?.(event); f.advance(0); }, // change events bubble to the page's handler
    set(selector, value) { const el = f.page().querySelector(selector); assert.ok(el, selector); if (typeof value === 'boolean') el.checked = value; else el.value = String(value); f.bubble(el, {type: 'change', target: el}); },
    type(selector, value) { const el = f.page().querySelector(selector); assert.ok(el, selector); el.value = String(value); f.bubble(el, {type: 'input', target: el}); return el; }, // a key press: "change" follows when the edit ends
    rowLabels: () => f.page().querySelectorAll('.oa-form-row').map(r => r.children[0].textContent),
    options: selector => f.page().querySelector(selector).querySelectorAll('option').map(o => o.textContent),
    saved: () => JSON.parse(storage.get('opisai-demo-settings-v12') || '{}'),
    themeOf: id => (windows.get(id).el.className.match(/oa-theme-(\w+)/) || [])[1]};
  return f;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

/* ------------------------------------------------------------------ tests */
test('Konfiguracja: rc32 title, pages and keyword search, "Konfig: Otwórz folder", "Zapisz" and "Zamknij"', () => {
  const f = fixture(); f.api.settings();
  assert.equal(f.windows.get('opisai-settings').title, `OpisAI ${rc32.version} — konfiguracja`);
  const nav = () => f.root('opisai-settings').querySelectorAll('[data-page], .oa-nav-group').filter(el => !el.hidden).map(el => el.textContent);
  assert.deepEqual(nav(), ['GENEROWANIE', 'Połączenie i model', 'Sekcje opisu', 'WEJŚCIE', 'Dyktowanie', 'Odczyt pola (Klinika)', 'INTERFEJS', 'Wygląd', 'Bąbelek', 'Historia', 'ZAAWANSOWANE', 'System', 'Zgodność AI (RODO)']);
  const search = f.q('opisai-settings', '.oa-settings-search'); assert.equal(search.getAttribute('placeholder'), 'Szukaj ustawienia…');
  const find = text => { search.value = text; search.dispatchEvent({type: 'input'}); return nav(); };
  assert.deepEqual(find('klucz api'), ['GENEROWANIE', 'Połączenie i model'], '_filter_nav: keywords, and a group header only with a visible page');
  assert.deepEqual(find('matryca'), ['ZAAWANSOWANE', 'Zgodność AI (RODO)']);
  assert.deepEqual(find('Wygląd'), ['INTERFEJS', 'Wygląd']);
  assert.equal(find('').length, 13);
  const foot = f.q('opisai-settings', '.oa-footer');
  assert.match(foot.textContent, /Konfig:\s*Otwórz folder/); assert.equal(f.q('opisai-settings', '[data-action="save-settings"]').disabled, true);
  assert.equal(foot.querySelectorAll('button').map(b => b.textContent).join('|'), 'Otwórz folder|Zapisz|Zamknij');
  assert.equal(f.page().querySelectorAll('h2').length, 0, 'rc32 pages have group boxes, no page titles');
});

test('Zapisz: active only with changes, stores the current page and keeps the window open; another page or Zamknij discards', () => {
  const f = fixture(); f.api.settings('bubble');
  const save = () => f.q('opisai-settings', '[data-action="save-settings"]');
  f.set('[data-setting="bounceInterval"]', 30); assert.equal(save().disabled, false);
  f.set('[data-setting="bounceInterval"]', 10); assert.equal(save().disabled, true, 'back to the saved value: nothing to save');
  f.set('[data-setting="bounceInterval"]', 30); save().click(); f.advance(0);
  assert.equal(f.saved().bounceInterval, 30); assert.ok(f.windows.get('opisai-settings'), '_on_accept does not close the window'); assert.equal(save().disabled, true);
  assert.equal(f.q('opisai-settings', '[data-cfg-status]').textContent, 'Zapisano zmiany z tej karty.');
  f.set('[data-setting="idleBounce"]', false); assert.equal(save().disabled, false);
  f.click('opisai-settings', '[data-page="history"]'); f.click('opisai-settings', '[data-page="bubble"]');
  assert.equal(f.page().querySelector('[data-setting="idleBounce"]').checked, true, '_on_tab_changed drops the unsaved change'); assert.equal(f.api.preferences().idleBounce, true);
  f.set('[data-setting="bounceMax"]', 3); f.click('opisai-settings', '[data-action="close-settings"]');
  assert.equal(f.windows.get('opisai-settings'), undefined); assert.equal(f.api.preferences().bounceMax, 0); assert.equal(f.saved().bounceMax, 0);
  f.api.settings('bubble'); f.set('[data-setting="bounceInterval"]', 5); save().click(); f.advance(0);
  assert.equal(f.saved().bounceInterval, 10, 'stored as used: 10–3600 s');
});

test('Zapisz follows a number or text field while it is typed in, so the first click saves (valueChanged, textChanged → _mark_dirty)', () => {
  const f = fixture(); f.api.settings('bubble');
  const save = () => f.q('opisai-settings', '[data-action="save-settings"]'), status = () => f.q('opisai-settings', '[data-cfg-status]').textContent;
  f.type('[data-setting="bounceInterval"]', 40); assert.equal(save().disabled, false, 'active with the cursor still in the field');
  f.set('[data-setting="bounceInterval"]', 40); save().click(); f.advance(0); // a click ends the edit ("change"), then presses the button
  assert.equal(f.saved().bounceInterval, 40); assert.equal(save().disabled, true); assert.equal(status(), 'Zapisano zmiany z tej karty.');
  f.type('[data-setting="bounceMax"]', 5); assert.equal(f.page().querySelector('[data-bounce-unit]').textContent, 'odbić'); assert.equal(save().disabled, false); assert.equal(status(), '', 'a new edit ends the confirmation');
  f.type('[data-setting="bounceMax"]', 0); assert.equal(save().disabled, true, 'typed back to the saved value'); assert.equal(f.page().querySelector('[data-bounce-unit]').textContent, 'bez limitu');
  f.click('opisai-settings', '[data-page="dictation"]'); f.set('[data-setting="transcriber"]', 'local_whisper'); save().click(); f.advance(0);
  const scope = () => f.page().querySelector('[data-dt-scope]').textContent.split('\n')[0];
  assert.equal(scope(), 'Zapisano ustawienia dla następnego dyktowania.');
  f.type('[data-setting="labelDoctor"]', 'Dr'); assert.equal(save().disabled, false); assert.equal(scope(), 'Niezapisane zmiany w konfiguracji — kliknij „Zapisz”, aby je zachować.', 'the note of the page follows the typing too');
  save().click(); f.advance(0); assert.equal(f.saved().labelDoctor, 'Dr'); assert.equal(f.api.preferences().labelDoctor, 'Dr');
  f.type('[data-setting="labelDoctor"]', 'Lekarz'); f.type('[data-setting="labelDoctor"]', 'Dr'); assert.equal(save().disabled, true); assert.equal(scope(), 'Ustawienia dla następnego dyktowania.');
  f.set('[data-setting="transcriber"]', 'chatgpt_browser'); f.set('[data-setting="autoEnter"]', true); save().click(); f.advance(0);
  const seconds = f.type('[data-setting="autoEnterSeconds"]', 4);
  assert.equal(save().disabled, true, '4 is outside 5–600 s: what would be stored is still 10'); assert.equal(seconds.value, '4', 'the field is not rewritten under the cursor');
  f.type('[data-setting="autoEnterSeconds"]', 45); assert.equal(save().disabled, false); assert.equal(scope(), 'Niezapisane zmiany w konfiguracji — kliknij „Zapisz”, aby je zachować.');
  f.set('[data-setting="autoEnterSeconds"]', 45); save().click(); f.advance(0); assert.equal(f.saved().autoEnterSeconds, 45);
  f.set('[data-setting="autoEnterSeconds"]', 4); assert.equal(seconds.value, '10', 'the end of the edit shows the value in use'); assert.equal(save().disabled, false);
});

test('Bąbelek: a value outside the rc32 spin box ranges (10–3600 s, 0–999) comes back into the field in range, and nothing is left to save', () => {
  const f = fixture(); f.api.settings('bubble');
  const save = () => f.q('opisai-settings', '[data-action="save-settings"]'), field = key => f.page().querySelector(`[data-setting="${key}"]`), unit = () => f.page().querySelector('[data-bounce-unit]').textContent;
  assert.deepEqual(['min', 'max', 'step'].map(a => field('bounceInterval').getAttribute(a)), ['10', '3600', '10'], 'QSpinBox.setRange(10, 3600), setSingleStep(10)');
  assert.deepEqual(['min', 'max', 'step'].map(a => field('bounceMax').getAttribute(a)), ['0', '999', '1'], 'QSpinBox.setRange(0, 999)');
  f.set('[data-setting="bounceInterval"]', 3); assert.equal(field('bounceInterval').value, '10'); assert.equal(save().disabled, true, '3 s is stored as 10 s, which is the saved value');
  f.set('[data-setting="bounceInterval"]', 99999); assert.equal(field('bounceInterval').value, '3600'); assert.equal(save().disabled, false);
  save().click(); f.advance(0); assert.equal(f.saved().bounceInterval, 3600); assert.equal(save().disabled, true, 'saved: the field, the draft and the settings agree');
  f.set('[data-setting="bounceInterval"]', ''); assert.equal(field('bounceInterval').value, '10', 'an emptied field');
  f.set('[data-setting="bounceMax"]', -4); assert.equal(field('bounceMax').value, '0'); assert.equal(unit(), 'bez limitu');
  f.set('[data-setting="bounceMax"]', 12.6); assert.equal(field('bounceMax').value, '13'); assert.equal(unit(), 'odbić');
  f.set('[data-setting="bounceMax"]', 5000); assert.equal(field('bounceMax').value, '999');
  save().click(); f.advance(0); assert.deepEqual([f.saved().bounceInterval, f.saved().bounceMax], [10, 999]); assert.equal(save().disabled, true);
  assert.deepEqual([field('bounceInterval').value, field('bounceMax').value], ['10', '999']);
  const typed = f.type('[data-setting="bounceInterval"]', 3); assert.equal(typed.value, '3', 'not rewritten under the cursor'); assert.equal(save().disabled, true, 'on the way to 30: still the saved 10');
  f.type('[data-setting="bounceInterval"]', 30); assert.equal(save().disabled, false);
});

test('Konfiguracja chosen again while open is only presented, with its page and unsaved changes; a named page is chosen as in the list (_open_config)', () => {
  const f = fixture(); f.api.settings('bubble');
  const win = f.windows.get('opisai-settings'), save = () => f.q('opisai-settings', '[data-action="save-settings"]'), active = () => f.q('opisai-settings', '.oa-nav-item.active').textContent;
  let presented = 0; win.show = () => { presented++; };
  f.set('[data-setting="bounceInterval"]', 120);
  f.api.settings(); f.advance(0); // "Konfiguracja..." in the bubble menu
  assert.equal(f.windows.get('opisai-settings'), win); assert.equal(presented, 1);
  assert.equal(active(), 'Bąbelek'); assert.equal(f.page().querySelector('[data-setting="bounceInterval"]').value, '120'); assert.equal(save().disabled, false, 'the unsaved change is still there');
  f.api.settings('bubble'); f.advance(0); assert.equal(f.page().querySelector('[data-setting="bounceInterval"]').value, '120', 'the page already shown is not reloaded'); assert.equal(save().disabled, false);
  const search = f.q('opisai-settings', '.oa-settings-search'); search.value = 'motyw'; search.dispatchEvent({type: 'input'});
  assert.equal(f.q('opisai-settings', '[data-page="dictation"]').hidden, true);
  f.api.settings('dictation'); f.advance(0); // "Profil głosu (rozpoznawanie mówców)…"
  assert.equal(presented, 3); assert.equal(active(), 'Dyktowanie'); assert.equal(f.doc.activeElement, f.q('opisai-settings', '[data-page="dictation"]'));
  assert.equal(search.value, ''); assert.equal(f.root('opisai-settings').querySelectorAll('[data-page], .oa-nav-group').filter(el => el.hidden).length, 0, 'focus_dictation: the whole list again');
  assert.equal(save().disabled, true); f.click('opisai-settings', '[data-page="bubble"]');
  assert.equal(f.page().querySelector('[data-setting="bounceInterval"]').value, '10', '_on_tab_changed: the change of the page that was left is dropped'); assert.equal(f.api.preferences().bounceInterval, 10);
  f.click('opisai-settings', '[data-action="close-settings"]'); f.api.settings(); f.advance(0);
  assert.notEqual(f.windows.get('opisai-settings'), win); assert.equal(active(), 'Połączenie i model', 'a new window starts on the first page');
});

test('O aplikacji chosen again while open is only presented and keeps its tab and document (_open_about)', () => {
  const f = fixture(); f.api.about();
  const win = f.windows.get('opisai-about'), tab = () => f.q('opisai-about', '[data-about].active').textContent;
  let presented = 0; win.show = () => { presented++; };
  f.click('opisai-about', '[data-about="licenses"]');
  const select = f.q('opisai-about', '[data-license]'); select.value = 'demo'; f.bubble(select, {type: 'change', target: select});
  f.api.about(); f.advance(0);
  assert.equal(f.windows.get('opisai-about'), win); assert.equal(presented, 1); assert.equal(tab(), 'Licencje'); assert.equal(f.q('opisai-about', 'textarea').value, f.api.LICENSE_TEXTS.demo);
  f.api.about('contact'); assert.equal(tab(), 'Kontakt', 'a named tab is chosen as by a click');
  f.click('opisai-about', '[data-action="close"]'); f.api.about(); assert.equal(tab(), 'O aplikacji');
});

test('Zapisz when the browser refuses to store: the change works, no saving is claimed and one notice says it lasts until the page is refreshed', () => {
  const f = fixture(); f.api.settings('appearance'); f.api.about();
  const save = () => f.q('opisai-settings', '[data-action="save-settings"]'), status = () => f.q('opisai-settings', '[data-cfg-status]').textContent;
  const scope = () => f.page().querySelector('[data-dt-scope]').textContent.split('\n')[0];
  f.refuseStorage(true); // localStorage.setItem throws: blocked or full
  f.set('[data-setting="theme"]', 'dark'); save().click(); f.advance(0);
  assert.equal(f.api.preferences().theme, 'dark'); assert.equal(f.themeOf('opisai-about'), 'dark', 'the setting is in use'); assert.equal(save().disabled, true);
  assert.deepEqual(f.saved(), {}, 'nothing was stored');
  assert.equal(status(), 'Nie udało się zapisać w przeglądarce. Zmiany z tej karty działają do odświeżenia strony.');
  assert.deepEqual(f.notices, [{app: 'OpisAI', icon: 'opisai', title: 'Nie udało się zapisać w przeglądarce', message: 'Zmiany w Konfiguracji działają do odświeżenia strony.'}]);
  f.click('opisai-settings', '[data-page="dictation"]'); f.set('[data-setting="transcriber"]', 'local_whisper'); save().click(); f.advance(0);
  assert.equal(scope(), 'Ustawienia dla następnego dyktowania działają do odświeżenia strony.', 'the note of the page does not claim it either');
  assert.match(status(), /^Nie udało się zapisać w przeglądarce\./); assert.equal(f.notices.length, 1, 'the notice comes once');
  f.refuseStorage(false);
  f.set('[data-setting="transcriber"]', 'chatgpt_browser'); save().click(); f.advance(0);
  assert.equal(status(), 'Zapisano zmiany z tej karty.'); assert.equal(scope(), 'Zapisano ustawienia dla następnego dyktowania.');
  assert.deepEqual([f.saved().theme, f.saved().transcriber], ['dark', 'chatgpt_browser'], 'a later save stores everything in use'); assert.equal(f.notices.length, 1);
});

test('Zapisz stores only its own page: a choice made elsewhere meanwhile is kept', () => {
  const f = fixture(); f.api.settings('history');
  f.api.preferences().livePreview = false; f.api.preferences().spelling = false; // the progress window and the spelling menu
  f.set('[data-setting="history"]', false); f.click('opisai-settings', '[data-action="save-settings"]');
  assert.deepEqual([f.saved().history, f.saved().livePreview, f.saved().spelling], [false, false, false]);
});

test('Wygląd: Automatyczny (jak Windows), Jasny, Ciemny; "Automatyczny" follows the desktop, the preview ends with Zamknij', () => {
  const f = fixture(); f.api.settings('appearance');
  assert.deepEqual(f.options('[data-setting="theme"]'), ['Automatyczny (jak Windows)', 'Jasny', 'Ciemny']);
  assert.equal(f.page().querySelector('[data-setting="theme"]').value, 'auto', 'ui_theme = "auto" by default');
  assert.match(f.page().textContent, /Zmiana działa od razu — bez restartu\./);
  for (const absent of ['Niebieski', 'Rozmiar tekstu', 'Animacje', 'Pokaż tekst na żywo']) assert(!f.page().textContent.includes(absent), absent);
  f.api.about(); assert.equal(f.themeOf('opisai-about'), 'light');
  f.set('[data-setting="theme"]', 'dark'); assert.equal(f.themeOf('opisai-settings'), 'dark', 'the open window previews the choice'); assert.equal(f.themeOf('opisai-about'), 'light');
  f.api.settings(); assert.equal(f.themeOf('opisai-settings'), 'dark', 'chosen again from the bubble menu: the open window as it is'); assert.equal(f.page().querySelector('[data-setting="theme"]').value, 'dark');
  f.api.settings('dictation'); assert.equal(f.themeOf('opisai-settings'), 'light', 'another page, named from the bubble menu ("Profil głosu…"): the saved settings, no stale preview');
  f.click('opisai-settings', '[data-page="appearance"]'); f.set('[data-setting="theme"]', 'dark');
  f.click('opisai-settings', '[data-action="close-settings"]'); f.api.settings('appearance'); assert.equal(f.themeOf('opisai-settings'), 'light'); assert.equal(f.api.preferences().theme, 'auto');
  f.shell.prefs.theme = 'dark'; f.win.dispatchEvent({type: 'shell:theme'});
  assert.equal(f.themeOf('opisai-about'), 'dark', 'auto follows the colour mode of the desktop'); assert.equal(f.themeOf('opisai-settings'), 'dark');
  f.set('[data-setting="theme"]', 'light'); f.click('opisai-settings', '[data-action="save-settings"]');
  assert.equal(f.saved().theme, 'light'); assert.equal(f.themeOf('opisai-about'), 'light', 'a saved theme reaches every OpisAI window');
  f.shell.prefs.theme = 'light'; f.win.dispatchEvent({type: 'shell:theme'}); f.shell.prefs.theme = 'dark'; f.win.dispatchEvent({type: 'shell:theme'});
  assert.equal(f.themeOf('opisai-about'), 'light', 'an explicit theme ignores the desktop');
});

test('saved settings of removed options migrate safely and leave the stored JSON at the next save', () => {
  const old = {provider: 'Gemini', transport: 'API', model: 'Gemini Pro', theme: 'blue', fontSize: 16, animations: false, livePreview: false, retention: '30 dni', language: 'Polski', sentenceLines: true,
    clinicalSections: ['A', 'B', 'C'], panelRows: {bcs: true}, panel: false, rich: true, diagnosis: true, customPrompt: 'x', idleBounce: false};
  const f = fixture({prefs: old}), p = f.api.preferences();
  assert.deepEqual([p.provider, p.transport, p.auth, p.model, p.theme, p.livePreview, p.idleBounce], ['gemini', 'api', 'api_key', 'gemini-3.1-pro-preview', 'light', false, false], 'the model stays the one that was chosen');
  for (const key of ['fontSize', 'animations', 'retention', 'language', 'sentenceLines', 'clinicalSections', 'panelRows', 'panel', 'rich', 'diagnosis', 'customPrompt']) assert(!(key in p), key);
  f.api.settings('bubble'); f.set('[data-setting="idleBounce"]', true); f.click('opisai-settings', '[data-action="save-settings"]');
  const saved = f.saved(); for (const key of ['fontSize', 'animations', 'clinicalSections', 'panelRows', 'customPrompt']) assert(!(key in saved), 'stored: ' + key);
  const map = prefs => { const q = fixture({prefs}).api.preferences(); return [q.provider, q.transport, q.auth, q.model]; };
  assert.deepEqual(map({provider: 'Lokalny', transport: 'Lokalnie (offline)', model: 'Własny model'}), ['local', 'local', 'local', 'gemma4:12b']);
  /* Every connection the earlier settings could store keeps its model: "Pro" and "Flash" by transport, Qwen, Opus; a model left to the service takes the variant's first. */
  for (const [provider, transport, model, now] of [['Gemini', 'API', 'Gemini Flash', 'gemini / api / api_key / gemini-3.5-flash'], ['Gemini', 'API', 'Wybrany w przeglądarce', 'gemini / api / api_key / gemini-3.5-flash'],
    ['Gemini', 'Przeglądarka', 'Gemini Pro', 'gemini / browser / profile / Gemini 3.1 Pro'], ['Gemini', 'Przeglądarka', 'Gemini Flash', 'gemini / browser / profile / Gemini 3.5 Flash'], ['Gemini', 'Przeglądarka', 'Wybrany w przeglądarce', 'gemini / browser / profile / Gemini 3.1 Pro'],
    ['Lokalny', 'Lokalnie (offline)', 'Qwen · model lokalny', 'local / local / local / qwen3:14b'], ['Claude', 'Przeglądarka', 'Claude Sonnet', 'claude / browser / profile / claude-sonnet-4-6'], ['Claude', 'Przeglądarka', 'Wybrany w przeglądarce', 'claude / browser / profile / claude-sonnet-4-6']])
    assert.equal(map({provider, transport, model}).join(' / '), now, [provider, transport, model].join(' · '));
  assert.deepEqual(map({provider: 'Claude', transport: 'Przeglądarka', model: 'Claude Opus'}), ['claude', 'browser', 'profile', 'claude-opus-4-7']);
  assert.deepEqual(map({provider: 'ChatGPT', model: 'Wybrany w ChatGPT'}), ['chatgpt', 'browser', 'profile', '']);
  assert.deepEqual(map({provider: 'gemini', transport: 'browser', auth: 'anonymous', model: 'Gemini 3.1 Pro'}), ['gemini', 'browser', 'anonymous', 'Gemini 3.5 Flash'], 'a model belongs to its variant');
  assert.deepEqual(map({provider: 'mistral', transport: 'api'}), ['chatgpt', 'browser', 'profile', '']);
  assert.equal(fixture({prefs: {theme: 'sepia'}}).api.preferences().theme, 'auto');
});

test('the provider registry, its labels and the connection labels are the ones of domain/providers.py', () => {
  const f = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(f.api.PROVIDERS)), rc32.providers);
  assert.deepEqual({...f.api.TRANSPORT_LABELS}, rc32.transport_labels); assert.deepEqual({...f.api.AUTH_LABELS}, rc32.auth_labels); assert.deepEqual({...f.api.HW_LLM}, rc32.llm_hardware);
  for (const s of f.api.PROVIDERS) assert.equal(f.api.connectionLabel({provider: s.id, transport: s.transport, auth: s.auth, model: ''}), rc32.connection_labels[s.runtime], s.runtime);
  assert.equal(f.api.modelLabel(), 'wybrany w ChatGPT UI', 'model_label: the bubble and tray tooltips');
});

test('Połączenie i model: Serwis → Transport → Autoryzacja → Model with the rows rc32 shows; the status is never a connection test', () => {
  const f = fixture(); f.api.settings();
  const legend = () => f.page().querySelector('legend').textContent, status = () => f.page().querySelector('[data-connection-status]').textContent;
  assert.equal(legend(), rc32.creds_titles.profile);
  assert.equal(status(), 'ChatGPT — Profil OpisAI / ChromeTen status nie jest testem połączenia.');
  assert.deepEqual(f.rowLabels(), ['Serwis:', 'Transport:', 'Model:', 'Tytuł okna głównego:', 'Tytuł podokna opisu:']);
  assert.deepEqual(f.options('[data-setting="provider"]'), ['Claude', 'ChatGPT', 'Gemini', 'Lokalny (offline)']);
  const model = f.page().querySelectorAll('.oa-form-row select')[2]; assert.equal(model.disabled, true); assert.equal(model.textContent, '(wybrany w ChatGPT UI)');
  assert.deepEqual(f.page().querySelectorAll('.oa-form-row input[readonly]').map(i => i.getAttribute('value')), ['Klinika', 'Rejestracja wizyty'], 'main window and sub-window fragments, separately');
  assert.match(f.page().textContent, /okno główne „\[DEMO\] Klinika XP - \[Przebieg wizyty - Zwierzę domowe\]” i podokno opisu „\[DEMO\] Rejestracja wizyty: Wywiad - Badanie - Diagnoza”/);
  assert.equal(f.page().querySelectorAll('button').map(b => b.textContent).join('|'), 'Otwórz przeglądarkę z profilem OpisAI');
  assert(!/Sprawdź połączenie|Otwórz profil\b/.test(f.page().textContent));
  f.page().querySelector('[data-cfg="profile"]').click(); assert.match(f.toasts.at(-1), /^W demonstracji przeglądarka się nie otwiera\./); assert.equal(f.windows.size, 1, 'no invented profile window');
  f.set('[data-setting="provider"]', 'claude');
  assert.deepEqual(f.options('[data-setting="transport"]'), ['Cookie HTTP', 'Przeglądarka']);
  assert.equal(f.page().querySelector('[data-setting="transport"]').value, 'browser', '_refresh_transport_combo keeps a transport the new service also has');
  assert.equal(status(), 'Claude — Profil OpisAI / ChromeTen status nie jest testem połączenia.');
  f.set('[data-setting="transport"]', 'cookie');
  assert.equal(legend(), rc32.creds_titles.cookie); assert.equal(status(), 'Claude — Brak tokenuTen status nie jest testem połączenia.');
  assert.deepEqual(f.rowLabels(), ['Serwis:', 'Transport:', 'Klucz / token:', 'Model:', 'Tytuł okna głównego:', 'Tytuł podokna opisu:']);
  assert.equal(f.page().querySelector('input[type="password"]').disabled, true);
  assert.deepEqual(f.options('[data-setting="model"]'), ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-7']);
  assert.deepEqual(f.page().querySelectorAll('[data-cfg]').map(b => b.textContent), ['Wykryj ponownie', 'Zaloguj przez Edge...']);
  f.set('[data-setting="provider"]', 'gemini');
  assert.deepEqual(f.options('[data-setting="auth"]'), ['Profil OpisAI / Chrome', 'Cookie z Edge', 'Bez logowania (Flash)'], 'Autoryzacja only with more than one way');
  f.set('[data-setting="auth"]', 'anonymous'); assert.equal(f.page().querySelector('[data-setting="model"]').disabled, true); assert.equal(legend(), rc32.creds_titles.anonymous);
  f.set('[data-setting="transport"]', 'api'); assert.deepEqual(f.options('[data-setting="auth"]'), ['Klucz API', 'OAuth Google Cloud']); assert.equal(status(), 'Gemini — Brak kluczaTen status nie jest testem połączenia.');
  f.set('[data-setting="provider"]', 'local');
  assert.deepEqual(f.rowLabels(), ['Serwis:', 'Transport:', 'Model:', 'Liczy na:', 'Tytuł okna głównego:', 'Tytuł podokna opisu:']);
  assert.deepEqual(f.options('[data-setting="model"]'), ['gemma4:12b', 'qwen3:14b', 'qwen3:8b', 'qwen3:4b']);
  assert.equal(status(), 'Lokalny (offline) — Lokalnie (bez logowania)Ten status nie jest testem połączenia.');
  f.set('[data-setting="provider"]', 'claude'); f.click('opisai-settings', '[data-action="save-settings"]');
  assert.deepEqual([f.saved().provider, f.saved().transport, f.saved().auth, f.saved().model], ['claude', 'cookie', 'cookie', 'claude-sonnet-4-6']);
  f.api.prepare(); f.advance(1000);
  assert.equal(f.q('opisai-compose', '[data-oa-route]').textContent, 'Claude · Cookie HTTP · claude-sonnet-4-6');
  assert.equal(f.q('opisai-compose', '[data-ack-text]').textContent, 'Sprawdzone: wysyłam do Claude tylko te pola, bez danych osobowych właściciela i personelu.');
});

test('Połączenie i model, Gemini over the API: the key variant fetches a key, the OAuth variant prepares OAuth and names no key (_reset_gemini_btn)', () => {
  const f = fixture({prefs: {provider: 'gemini', transport: 'api', auth: 'api_key', model: 'gemini-3.5-flash'}}); f.api.settings();
  const buttons = () => f.page().querySelectorAll('[data-cfg]'), group = () => f.page().querySelector('fieldset');
  assert.equal(group().querySelector('legend').textContent, rc32.creds_titles.api_key);
  assert.deepEqual(buttons().map(b => b.textContent), ['🔑 Pobierz klucz Gemini API']); assert.match(buttons()[0].title, /tworzy klucz ograniczony do Gemini\./);
  const key = f.page().querySelector('input[type="password"]'); assert.equal(key.disabled, true);
  assert.equal(key.title, 'W demonstracji klucze i tokeny nie są potrzebne ani zapisywane.', 'the field is not needed here at all: no "— w aplikacji" tail');
  buttons()[0].click(); assert.match(f.toasts.at(-1), /^W demonstracji nic nie jest pobierane ani logowane\. .* przygotowuje klucz Gemini\.$/);
  f.set('[data-setting="auth"]', 'gcloud_oauth');
  assert.equal(group().querySelector('legend').textContent, rc32.creds_titles.gcloud_oauth); assert.equal(f.page().querySelectorAll('input[type="password"]').length, 0, 'creds_ui_for: no key field');
  assert.deepEqual(buttons().map(b => b.textContent), ['Przygotuj Gemini OAuth']);
  assert.equal(buttons()[0].title, 'Pierwszy klik pobiera portable gcloud do ./gcloud, przez Google Console przygotowuje client_secret.json i loguje OAuth Gemini. Bez klucza API.');
  assert.match(group().textContent, /Łączy się z Gemini przez logowanie Google, bez klucza API w polu\./);
  buttons()[0].click(); assert.match(f.toasts.at(-1), /^W demonstracji nic nie jest pobierane ani logowane\. .* loguje OAuth Gemini — bez klucza API\.$/);
  assert(!/Pobierz klucz|klucz Gemini|tworzy klucz/.test(group().textContent + buttons()[0].title + f.toasts.at(-1)), 'nothing under "Gemini OAuth" promises an API key');
  assert.deepEqual(f.options('[data-setting="model"]')[0], 'gemini-3.1-pro-preview');
});

test('Wygląd reaches "Mój słownik pisowni" too: the window of the spelling layer follows a saved and a followed theme', () => {
  let host = null; const f = fixture({spelling: {connect(next) { host = next; }, refresh() {}}});
  const words = f.shell.createWindow({id: 'opisai-spelling-words', title: 'Mój słownik pisowni', className: 'oa-host oa-theme-light', content: '<textarea></textarea>'});
  host.adopt(words); assert.equal(f.themeOf('opisai-spelling-words'), 'light');
  f.api.settings('appearance'); const save = () => f.click('opisai-settings', '[data-action="save-settings"]');
  f.set('[data-setting="theme"]', 'dark'); assert.equal(f.themeOf('opisai-spelling-words'), 'light', 'the preview is the open Konfiguracja only');
  save(); assert.equal(f.themeOf('opisai-spelling-words'), 'dark', 'a saved theme reaches every OpisAI window');
  f.set('[data-setting="theme"]', 'auto'); save(); assert.equal(f.themeOf('opisai-spelling-words'), 'light');
  f.shell.prefs.theme = 'dark'; f.win.dispatchEvent({type: 'shell:theme'}); assert.equal(f.themeOf('opisai-spelling-words'), 'dark', '"Automatyczny" follows the desktop');
});

test('Sekcje opisu: rc32 default sections and subsections in two tables; Konfiguruj shows the panel rows; no prompt text', () => {
  const f = fixture(); f.api.settings('sections');
  const page = f.page(), master = page.querySelectorAll('[data-section]');
  assert.deepEqual(master.map(tr => [tr.children[1].textContent, tr.children[3].textContent]), rc32.sections.map(s => [s.label, s.instruction]));
  assert.equal(page.querySelectorAll('[data-setting]').length, 0, 'nothing here changes the workflow');
  const subs = () => page.querySelector('[data-subs]').querySelectorAll('tr').map(tr => [tr.children[1].textContent, tr.children[2].textContent, tr.querySelector('input')?.checked ?? true, tr.classList.contains('oa-cfg-panel-row')]);
  rc32.sections.forEach((s, i) => { master[i].click(); assert.equal(page.querySelector('[data-sub-label]').textContent, 'Podsekcje pola: ' + s.label); assert.deepEqual(subs(), s.subsections, s.label); });
  master[0].click(); page.querySelector('[data-vitals]').click();
  const vitals = f.text('opisai-vitals');
  assert.equal(f.windows.get('opisai-vitals').title, 'OpisAI — konfiguracja parametrów życiowych');
  assert.match(vitals, /Wariant „\+ parametry” dołącza cały szablon do opisu badania klinicznego\. .* Wartości z notatki zastępują odpowiednie pozycje szablonu\./);
  assert.deepEqual(f.root('opisai-vitals').querySelectorAll('tbody tr').map(tr => tr.children[1].textContent), ['Stan ogólny', 'Temperatura', 'CRT', 'Błony śluzowe', 'Tętno', 'Drogi oddechowe (osłuchowo)', 'Serce (osłuchowo)', 'Węzły chłonne', 'Brzuch', 'Odgłosy perystaltyczne']);
  assert(!/BCS|Masa ciała/.test(vitals)); assert(!/Do panelu trafiają tylko wartości/.test(vitals + page.textContent));
  assert.deepEqual(page.querySelectorAll('.oa-cfg-prompt textarea').map(t => t.value), ['', ''], 'the conditioning prompt stays in the application');
  assert(!/Sposób opracowania|Domyślnie wybieraj/.test(page.textContent));
});

test('Odczyt pola: both read methods on and locked, the field diagnostics, no spelling switch', () => {
  const f = fixture(); f.api.settings('fields');
  const page = f.page(), locked = page.querySelectorAll('input[type="checkbox"]');
  assert.deepEqual(locked.map(i => [i.checked, i.disabled]), [[true, true], [true, true]]);
  assert.match(page.textContent, /0\. Standardowy odczyt — WM_GETTEXT \(Win32, domyślny\)/); assert.match(page.textContent, /1\. UI Automation \+ MSAA \(nieinwazyjne\)/);
  assert(!/Przypisane pola|Podkreślaj podejrzane/.test(page.textContent)); assert.equal(page.querySelectorAll('[data-setting="spelling"]').length, 0, 'the bubble submenu is the single source');
  page.querySelector('[data-cfg="diagnose"]').click(); f.advance(0);
  assert.match(f.text('opisai-settings-message'), new RegExp(`WM_GETTEXT: ${SAMPLE.badanie.length} zn\\.`));
  f.clinic.editor = false; page.querySelector('[data-cfg="diagnose"]').click(); f.advance(0);
  assert.match(f.text('opisai-settings-message'), /Nie znaleziono podokna opisu wizyty\. Otwórz wizytę w Klinice i spróbuj ponownie\./);
});

test('windows opened from Konfiguracja close with it (modal dialogs in rc32); Historia is independent and stays', () => {
  const f = fixture(); f.api.settings('sections');
  f.page().querySelector('[data-vitals]').click(); assert.ok(f.windows.get('opisai-vitals'));
  f.api.settings('privacy'); f.page().querySelector('[data-cfg="matrix"]').click(); assert.ok(f.windows.get('opisai-matrix'));
  f.api.settings('fields'); f.page().querySelector('[data-cfg="diagnose"]').click(); f.advance(0); assert.ok(f.windows.get('opisai-settings-message'));
  f.api.settings('history'); f.page().querySelector('[data-cfg="open-history"]').click(); assert.ok(f.windows.get('opisai-history'));
  f.click('opisai-settings', '[data-action="close-settings"]');
  assert.deepEqual([...f.windows.keys()], ['opisai-history'], 'VitalParamsConfigDialog, AiActMatrixDialog and the diagnostics message go; _open_history has no parent');
  f.api.settings('privacy'); f.page().querySelector('[data-cfg="matrix"]').click();
  const matrix = f.windows.get('opisai-matrix'), close = matrix.close; let closes = 0; matrix.close = function () { closes++; return close.call(this); };
  matrix.close(); f.windows.get('opisai-settings').close();
  assert.equal(closes, 1, 'a child closed first is not closed again with Konfiguracja: closeWin() leaves a closed window alone'); assert.deepEqual([...f.windows.keys()], ['opisai-history']);
});

test('Historia: the rc32 group with its limits, no "Wyczyść historię" and no undo; the switch stops new records', () => {
  const f = fixture(); f.api.settings('history');
  const page = f.page();
  assert.equal(page.querySelector('[data-cfg="open-history"]').textContent, 'Otwórz historię generowań…');
  assert.deepEqual(f.rowLabels(), ['Maks. wpisów:', 'Czas retencji:']);
  assert.deepEqual(page.querySelectorAll('input[type="number"]').map(i => [i.getAttribute('value'), i.disabled]), [['1000', true], ['90', true]]);
  assert.match(page.textContent, /Trim przy starcie: najpierw wpisy starsze niż czas retencji/);
  assert(!/Wyczyść historię|Cofnij ostatni wpis|Cofanie/.test(page.textContent));
  page.querySelector('[data-cfg="open-history"]').click(); assert.ok(f.windows.get('opisai-history'));
  f.set('[data-setting="history"]', false); f.click('opisai-settings', '[data-action="save-settings"]'); assert.equal(f.api.preferences().history, false);
});

test('System and Zgodność AI (RODO): rc32 groups, no reset and no settings copy; the matrix is a read-only view', () => {
  const f = fixture(); f.api.settings('system');
  const text = () => f.page().textContent;
  assert.deepEqual(f.page().querySelectorAll('legend').map(l => l.textContent), ['Integracja z Windows', 'Hash skryptu (SHA-256)']);
  assert(!/Przywróć ustawienia domyślne|Kopiuj informacje|Generator:/.test(text()));
  f.page().querySelector('[data-cfg="shortcut"]').click(); assert.match(f.toasts.at(-1), /^W demonstracji skrót nie jest tworzony\./);
  f.click('opisai-settings', '[data-page="privacy"]');
  assert.equal(f.page().querySelector('legend').textContent, 'AI Act / RODO'); assert.match(text(), /To robocza matryca zgodności, nie opinia prawna\./);
  f.page().querySelector('[data-cfg="matrix"]').click();
  assert.equal(f.windows.get('opisai-matrix').title, 'OpisAI — matryca AI Act / RODO');
  assert.deepEqual(f.root('opisai-matrix').querySelectorAll('[data-tab]').map(t => t.textContent), ['Kwalifikacja', 'Ryzyka_i_kontrole', 'Checklista']);
  assert.equal(f.root('opisai-matrix').querySelectorAll('input, textarea, td [contenteditable]').length, 0);
  f.root('opisai-matrix').querySelectorAll('[data-tab]')[1].click(); assert.deepEqual(f.root('opisai-matrix').querySelectorAll('th').map(t => t.textContent).slice(0, 3), ['ID', 'Ryzyko', 'Skutek']);
});

test('O aplikacji: the rc32 header, pages and copy texts; Kontakt without phone or address; licences with the demonstration page', async () => {
  const f = fixture(); f.api.about();
  assert.equal(f.windows.get('opisai-about').title, 'O aplikacji OpisAI');
  assert.match(f.q('opisai-about', '.oa-about-head').textContent, new RegExp(`OpisAI\\s*Wersja ${rc32.version.replace('.', '\\.')}\\s*Asystent dokumentacji weterynaryjnej`));
  assert.deepEqual(f.root('opisai-about').querySelectorAll('[data-about]').map(t => t.textContent), ['O aplikacji', 'Co nowego', 'Kontakt', 'Licencje']);
  const page = () => f.q('opisai-about', '[data-about-page]');
  assert.deepEqual(page().querySelectorAll('li').map(li => li.textContent), rc32.capabilities);
  assert.match(page().textContent, new RegExp('Generowanie: ' + rc32.provider_names.join(' · ').replace(/[()]/g, '\\$&')));
  assert.match(page().textContent, /Przed wpisaniem do dokumentacji lekarz weterynarii sprawdza i zatwierdza treść\. OpisAI nie zastępuje oceny lekarskiej\./);
  f.click('opisai-about', '[data-about="changes"]');
  assert.equal(page().querySelector('h2').textContent, 'Zmiany w wersji ' + rc32.version);
  assert.deepEqual(page().querySelectorAll('li').map(li => li.textContent), rc32.release_notes);
  assert.match(page().textContent, /Wersja i informacje o wydaniu są spójne\./); assert(page().textContent.includes(rc32.update_status));
  f.click('opisai-about', '[data-about="contact"]');
  assert.deepEqual(page().querySelectorAll('h2').map(h => h.textContent), ['Autor i kontakt', 'GUITS']);
  /* Shapes only (a phone number, a street, a postal code, the two labels), so that the test names no real value. */
  assert(!/\+48|\b\d{3}[ -]?\d{3}[ -]?\d{3}\b|\bul\.|\b\d{2}-\d{3}\b|NIP:|REGON:/.test(f.root('opisai-about').innerHTML), 'the demonstration omits phone, address, NIP and REGON');
  assert.match(page().textContent, /Pełne dane kontaktowe .* są w aplikacji/);
  assert.equal(page().querySelector('a.oa-btn').getAttribute('href'), 'mailto:guziczak@proton.me?subject=' + encodeURIComponent('OpisAI — wsparcie'));
  assert.deepEqual(page().querySelector('.oa-inline-controls').children.map(b => b.textContent), ['Napisz e-mail', 'Kopiuj e-mail', 'Kopiuj dane kontaktowe']);
  f.click('opisai-about', '[data-action="copy-version"]'); f.click('opisai-about', '[data-action="copy-about"]'); await flush();
  assert.deepEqual(f.clipboard, ['OpisAI ' + rc32.version, rc32.application_info_text], 'application_info_text: no settings, keys or paths');
  f.click('opisai-about', '[data-about="licenses"]');
  assert.deepEqual(page().querySelectorAll('option').map(o => o.textContent), ['Licencja OpisAI — pełny tekst', 'Wybrane biblioteki i licencje', 'Ta demonstracja — prawa i zasoby strony']);
  assert.equal(crypto.createHash('sha256').update(f.api.LICENSE_TEXTS.app, 'utf8').digest('hex'), rc32.license_sha256, 'LICENSE.txt of 0.12.0rc32, byte for byte');
  assert.equal(f.api.LICENSE_TEXTS.deps, [rc32.license_summary, '', 'Wybrane biblioteki:', '', ...rc32.third_party.map(([n, l]) => n + ' — ' + l), '', 'Pełne teksty licencji bibliotek i ich zależności są dołączone do odpowiednich pakietów.'].join('\n'));
  assert.match(f.api.LICENSE_TEXTS.demo, /© 2026 Łukasz Guziczak \(GUITS\)\. Wszelkie prawa zastrzeżone, o ile nie zaznaczono inaczej\./);
  assert.match(f.api.LICENSE_TEXTS.demo, /SIL Open Font License 1\.1/); assert.match(f.api.LICENSE_TEXTS.demo, /Klinika XP jest produktem firmy BRI\./); assert.match(f.api.LICENSE_TEXTS.demo, /Windows jest znakiem towarowym Microsoft/);
  assert.match(f.api.LICENSE_TEXTS.demo, /^Windows jest znakiem towarowym Microsoft Corporation\. Pulpit demonstracji jest własną stylizacją tej strony, a nie produktem Microsoft\.$/m, 'the styling belongs to this page: no pronoun that could point at Windows');
  const select = page().querySelector('[data-license]'); select.value = 'deps'; f.bubble(select, {type: 'change', target: select});
  assert.equal(page().querySelector('textarea').value, f.api.LICENSE_TEXTS.deps);
});

test('"Zasady i źródła" names Konfiguracja as the source of the Bogato style; "Ustawienia" is the desktop application of this page', () => {
  const f = fixture(); f.api.prepare(); f.advance(1000);
  const rules = () => f.q('opisai-compose', '[data-rules] textarea').value;
  assert.match(rules(), /^TRYB WIERNY: /m); assert.doesNotMatch(rules(), /STYL UŻYTKOWNIKA/);
  f.root('opisai-compose').querySelectorAll('[data-tile]').find(t => JSON.parse(t.dataset.tile).rich && t.getAttribute('aria-disabled') !== 'true').click(); f.advance(0);
  assert.match(rules(), /^STYL UŻYTKOWNIKA: styl Bogato z Konfiguracji; nie zmienia faktów, uprawnień ani kontraktu\. \[…\]$/m);
  assert.doesNotMatch(rules(), /Ustawie/);
  assert.equal(f.win.OpisAIDocument.PANEL_COPY, 'Panel: wartości z pól, a brakujące parametry według Ustawień (np. norma).', 'the caption of the panel tile is the rc32 text (ui/variant_copy.py) and stays');
});

/* The layout contract of a window smaller than the rc32 dialogs can get (a phone), read from the stylesheet:
 * measured in a browser at 390x844, a text block of O aplikacji lay over the next one and a caption left its button. */
test('small windows: a tab page of O aplikacji scrolls and its cards hold their text; Konfiguracja wraps captions, breaks a file name longer than its line and stacked rows lose the label indent', () => {
  const css = fs.readFileSync(path.join(__dirname, '../assets/opisai.css'), 'utf8').split('\n');
  const rule = selector => { const line = css.find(l => l.startsWith(selector + '{')); assert.ok(line, `rule ${selector}`); return line.slice(selector.length + 1, line.indexOf('}')).split(';'); };
  assert.ok(rule('.oa-about-page').includes('overflow:auto'), 'the page scrolls when the window cannot hold it');
  for (const selector of ['.oa-about-card', '.oa-about-columns']) assert.ok(!rule(selector).some(d => d.startsWith('min-height')), `${selector} is never shorter than its text`);
  const narrow = at => css.filter(l => l.startsWith(`@container (max-width:${at}px)`)).join('\n');
  assert.match(narrow(560), /\.oa-about-columns\{flex-direction:column\}\.oa-about-columns>\.oa-about-card\{flex:1 0 auto\}/, 'stacked cards start from their own text');
  assert.match(narrow(740), /\.oa-settings-page \.oa-btn\{white-space:normal\}/, 'the form rows stack at 740 px; from there a caption wraps');
  assert.match(narrow(740), /\.oa-cfg-indent,\.oa-app \.oa-cfg-windows\{margin-left:0\}/);
  assert.match(narrow(740), /\.oa-settings-page \.oa-cfg-hint\{overflow-wrap:break-word\}/, 'a word longer than the line of its note breaks instead of widening the page');
  const cfg = fixture(); cfg.api.settings('privacy'); // measured at 390x844: the workbook name is the one word of Konfiguracja that is wider than the page
  assert.ok(cfg.page().querySelectorAll('.oa-cfg-hint').some(p => p.textContent.includes('OpisAI_matryca_kwalifikacji_AI_Act.xlsx')), 'the workbook name stands in such a note');
  const order = selector => css.findIndex(l => l.startsWith(selector + '{')), last = css.findLastIndex(l => l.startsWith('@container (max-width:740px)') && l.includes('.oa-cfg-indent'));
  assert.ok(last > order('.oa-cfg-indent') && last > order('.oa-app .oa-cfg-windows'), 'the narrow rule follows the rules it adjusts (same weight)');
  const f = fixture(); f.api.about(); const page = f.q('opisai-about', '[data-about-page]');
  page.scrollTop = 40; f.click('opisai-about', '[data-about="contact"]'); assert.equal(page.scrollTop, 0, 'another tab starts at its top');
});
