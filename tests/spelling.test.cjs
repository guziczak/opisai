'use strict';

// Execute the real spelling layer (assets/opisai-spelling.js) against a small DOM fixture with a
// deterministic text layout: 7 px per character, one 17 px line per field. Klinika and the desktop are
// stubs; the dictionary, the checks, the lines, the card, the menus, replacement and undo are production
// code. The expectations are 0.12.0rc32 behaviour (domain/spelling.py, ui/spelling_overlay.py,
// ui/spelling_suggestions.py, legacy_ui.py _spelling_target and the "Podpowiedzi pisowni" actions).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/opisai-spelling.js'), 'utf8');

const SAMPLE = {
  wywiad: 'Szczur, samiec, fancy rat, 1 rok 9 mies., ok. 420 g. Od ~2 tygodni nasilające się kichanie i świszczący oddech, czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych.',
  badanie: 'Stan ogólny obniżony, postawa zgarbiona, sierść nastroszna. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchwo nad polami płucnymi rzęzenia i świsty. BCS 2/5. T 37,8°C, HR ok. 360/min.',
  diagnoza: 'Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych.'
};
const CHAR = 7, LINE = 17, PAD = 3;

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options) { const capture = options === true || !!options?.capture; if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push({ fn, capture }); }
  removeEventListener(type, fn) { const list = this.listeners.get(type) || []; this.listeners.set(type, list.filter(entry => entry.fn !== fn)); }
  dispatchEvent(event) {
    event.target ??= this; event.defaultPrevented ??= false;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => { event.stopped = true; };
    for (const { fn } of [...(this.listeners.get(event.type) || [])]) fn.call(this, event);
    return !event.defaultPrevented;
  }
}
class Text { constructor(data, parent) { this.nodeType = 3; this.nodeName = '#text'; this.data = data; this.parentNode = parent; } }
class Element extends Target {
  constructor(tag, doc) {
    super(); this.nodeType = 1; this.tagName = this.nodeName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null;
    this.attributes = new Map(); this.dataset = {}; this._class = ''; this.hidden = false; this.text = ''; this.html = ''; this.rect = null; this.disabled = false;
    this.style = { setProperty(key, value) { this[key] = String(value); } };
    const classes = () => this._class.split(/\s+/).filter(Boolean);
    this.classList = {
      contains: name => classes().includes(name),
      add: (...names) => { this._class = [...new Set([...classes(), ...names])].join(' '); },
      remove: (...names) => { this._class = classes().filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !classes().includes(name); this.classList[on ? 'add' : 'remove'](name); return on; }
    };
  }
  get className() { return this._class; } set className(value) { this._class = String(value); }
  get childNodes() { return this.nodes || this.children; }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return this === this.doc.documentElement || !!this.parentNode?.isConnected; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { for (const child of this.children) child.parentNode = null; this.children = []; this.text = String(value); this.html = ''; }
  get innerHTML() { return this.html; }
  set innerHTML(html) {
    this.html = String(html); this.text = '';
    for (const child of this.children) child.parentNode = null; this.children = [];
    const stack = [this];
    for (const match of String(html).matchAll(/<\/?[a-z][^>]*>|[^<]+/gi)) {
      const token = match[0];
      if (!token.startsWith('<')) { stack.at(-1).text += token.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'); continue; }
      if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([\w-]+)/)[1], child = new Element(tag, this.doc);
      for (const attr of token.slice(tag.length + 1, -1).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>/]+)))?/g)) child.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      stack.at(-1).append(child);
      if (!/^(?:input|img|br|hr|meta|link|line|circle)$/i.test(tag) && !token.endsWith('/>')) stack.push(child);
    }
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'class') this._class = String(value);
    if (name === 'hidden') this.hidden = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return name === 'class' ? this._class : this.attributes.get(name) ?? null; }
  append(...children) { for (const child of children) { child.remove?.(); child.parentNode = this; this.children.push(child); } }
  insertBefore(child, reference) { child.remove(); child.parentNode = this; const at = this.children.indexOf(reference); this.children.splice(at < 0 ? this.children.length : at, 0, child); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  matches(selector) {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector === 'button:not(:disabled)') return this.tagName === 'BUTTON' && !this.disabled;
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.getAttribute('id') === selector.slice(1);
    const attr = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attr) return this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
    return this.tagName === selector.toUpperCase();
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/), last = parts.pop(), all = this.children.flatMap(child => [...(child.matches(last) ? [child] : []), ...child.querySelectorAll(last)]);
    return all.filter(el => { let node = el.parentNode; for (let i = parts.length - 1; i >= 0; i--) { while (node && node !== this && !node.matches(parts[i])) node = node.parentNode; if (!node || node === this) return false; node = node.parentNode; } return true; });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() {
    if (this.rect) { const { left, top, width, height } = this.rect; return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }; }
    const n = key => parseFloat(this.style[key]) || 0, left = n('left'), top = n('top'), width = n('width'), height = n('height');
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  focus() { this.doc.activeElement = this; }
}

function fixture({ fields = SAMPLE, storage = new Map(), editor = true } = {}) {
  const doc = new Target(), win = new Target(), timers = new Map(), intervals = new Map();
  let now = 0, serial = 0;
  doc.documentElement = new Element('html', doc); doc.documentElement.dataset = {}; doc.body = new Element('body', doc); doc.documentElement.append(doc.body);
  doc.hidden = false; doc.activeElement = doc.body;
  doc.createElement = tag => new Element(tag, doc);
  doc.getElementById = id => doc.documentElement.querySelector('#' + id);
  const desktop = doc.createElement('main'); desktop.setAttribute('id', 'desktop'); doc.body.append(desktop);
  const taskbar = doc.createElement('nav'); taskbar.setAttribute('id', 'taskbar'); taskbar.rect = { left: 0, top: 752, width: 1900, height: 48 }; doc.body.append(taskbar);
  // Klinika's description sub-window with its three memos.
  const editorEl = doc.createElement('section'), mainEl = doc.createElement('section'), memo = {};
  doc.body.append(mainEl, editorEl);
  for (const [index, key] of ['wywiad', 'badanie', 'diagnoza'].entries()) {
    const el = doc.createElement('div'); el.setAttribute('data-clinic-field', key);
    el.rect = { left: 100, top: 100 + index * 120, width: 1780, height: 60 }; el.nodes = [new Text(fields[key] || '', el)];
    editorEl.append(el); memo[key] = el;
  }
  const covers = [];
  doc.elementsFromPoint = (x, y) => [...covers, ...Object.values(memo)].filter(el => { const r = el.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; });
  doc.createRange = () => ({
    setStart(node, offset) { this.node = node; this.start = offset; }, setEnd(node, offset) { this.end = offset; },
    getClientRects() { const r = this.node.parentNode.rect, left = r.left + PAD + this.start * CHAR, top = r.top + PAD; return [{ left, top, right: left + (this.end - this.start) * CHAR, bottom: top + LINE, width: (this.end - this.start) * CHAR, height: LINE }]; }
  });
  const replaced = [], menus = [], toasts = [], created = [];
  const clinic = {
    editor, session: 1,
    isEditorOpen: () => clinic.editor, getContext: () => ({ session: clinic.editor ? clinic.session : 0 }),
    getFields: () => Object.fromEntries(Object.entries(memo).map(([key, el]) => [key, el.nodes[0].data])),
    replaceText(key, start, end, replacement, options) {
      replaced.push({ key, start, end, replacement, expected: options.expected, session: options.session });
      const node = memo[key].nodes[0];
      if (!clinic.editor || options.session !== clinic.session) return { ok: false, reason: 'Zmieniło się okno, proces programu lub mapowanie pól. Odczytaj pola ponownie.' };
      if (options.expected !== node.data) return { ok: false, reason: 'Treść pola zmieniła się od ostatniego odczytu.' };
      node.data = node.data.slice(0, start) + replacement + node.data.slice(end); return { ok: true, text: node.data };
    }
  };
  const editorWindow = { id: 'clinic-editor', visible: true, el: editorEl }, mainWindow = { id: 'clinic', visible: true, el: mainEl };
  const shell = {
    activeWindow: editor ? editorWindow : mainWindow, windows: new Map(), current: null,
    menu(items, x, y, options) { const el = doc.createElement('div'); el.className = 'shell-menu'; doc.body.append(el); shell.current = { items, x, y, options, el }; menus.push(shell.current); return el; },
    closePopups() { const open = shell.current; shell.current = null; if (open) { open.el.remove(); open.options.onClose?.(); } },
    toast(message) { toasts.push(message); return { remove() {} }; },
    createWindow(options) { const el = doc.createElement('section'); el.append(options.content); doc.body.append(el); const w = { options, el, close() { el.remove(); created.splice(created.indexOf(w), 1); } }; created.push(w); return w; }
  };
  win.Shell = shell; win.Clinic = clinic; win.devicePixelRatio = 1; win.matchMedia = () => ({ matches: false });
  const local = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) };
  const context = vm.createContext({ window: win, document: doc, localStorage: local, performance: { now: () => now },
    innerWidth: 1900, innerHeight: 800, setTimeout: (fn, delay = 0) => { timers.set(++serial, { fn, due: now + delay }); return serial; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => { intervals.set(++serial, { fn, delay, due: now + delay }); return serial; }, clearInterval: id => intervals.delete(id),
    Map, Set, WeakMap, Object, Array, Number, String, Math, JSON, Error, Infinity });
  vm.runInContext(source, context, { filename: 'assets/opisai-spelling.js' });
  const host = { on: true, isBusy: false, enabled: () => host.on, busy: () => host.isBusy, running: () => true, theme: () => 'light' };
  const api = win.OpisAISpelling;
  function advance(milliseconds) {
    const end = now + milliseconds;
    while (now < end - 1e-9) {
      now = Math.min(end, now + 10);
      for (const [id, timer] of [...timers].sort((a, b) => a[1].due - b[1].due)) if (timer.due <= now && timers.delete(id)) timer.fn();
      for (const interval of intervals.values()) while (interval.due <= now) { interval.due += interval.delay; interval.fn(); }
    }
  }
  const layer = () => desktop.querySelector('.oa-spell-layer'), card = () => desktop.querySelector('.oa-spell-card');
  const f = {
    doc, win, api, host, clinic, shell, memo, storage, replaced, menus, toasts, created, covers, advance, layer, card,
    bars: () => (layer()?.children || []).filter(el => el.classList.contains('oa-spell-bar')),
    words: () => plain(f.bars().map(el => [el.getBoundingClientRect(), el.dataset.visual.split('|')[4] + ':' + el.dataset.kind]).sort((a, b) => a[0].top - b[0].top || a[0].left - b[0].left).map(entry => entry[1])), // in reading order
    bar: word => f.bars().find(el => el.dataset.visual.split('|')[4] === word),
    // the middle of a word's letters in the fixture layout (its first occurrence)
    letters(key, word) { const text = memo[key].nodes[0].data, at = text.indexOf(word), r = memo[key].rect; return { x: r.left + PAD + (at + word.length / 2) * CHAR, y: r.top + PAD + LINE / 2 }; },
    move(point) { doc.dispatchEvent({ type: 'pointermove', clientX: point.x, clientY: point.y }); },
    press(target, button = 0, point = null) { const r = target.getBoundingClientRect(), x = point?.x ?? r.left + r.width / 2, y = point?.y ?? r.top + r.height / 2, event = { type: 'pointerdown', target, button, clientX: x, clientY: y }; doc.dispatchEvent(event); layer().dispatchEvent(event); return event; },
    contextmenu(target) { const r = target.getBoundingClientRect(), event = { type: 'contextmenu', target, clientX: r.left + r.width / 2, clientY: r.top + 2 }; layer().dispatchEvent(event); return event; },
    choices: () => card().querySelectorAll('.oa-spell-choice'),
    click: button => card().dispatchEvent({ type: 'click', target: button }),
    choose(label) { const open = shell.current, item = open.items.find(entry => entry.label === label); assert(item && !item.disabled, label); shell.closePopups(); item.onClick(); },
    labels: open => plain(open.items.map(item => item.separator ? '---' : item.label + (item.disabled ? ' (wył.)' : ''))),
    activate(windowId) { shell.activeWindow = windowId === 'clinic-editor' ? editorWindow : windowId === 'clinic' ? mainWindow : { id: windowId, visible: true, el: doc.createElement('section') }; },
    type(key, text) { memo[key].nodes[0].data = text; doc.dispatchEvent({ type: 'input', target: memo[key] }); }
  };
  api.connect(host);
  return f;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('check(): rc26 kinds, repeated words and the words it never decorates', () => {
  const { api } = fixture(), kinds = text => plain(api.check(text).map(issue => [issue.word, issue.kind, issue.start]));
  assert.deepEqual(kinds(SAMPLE.wywiad), [['fancy', 'spelling', 16]], 'a misspelling in lower case is a typo (initial_kind), not an unknown word');
  assert.deepEqual(kinds(SAMPLE.badanie), [['nastroszna', 'spelling', 48], ['Osłuchwo', 'spelling', 156], ['rzęzenia', 'spelling', 185]], 'a capital that opens a sentence says nothing');
  assert.deepEqual(kinds(SAMPLE.diagnoza), []);
  assert.deepEqual(kinds('Obserwować też Kajtusia (brat).'), [['Kajtusia', 'unknown', 15]], 'a capital in mid-sentence with no veterinary form near: a name');
  assert.deepEqual(kinds('Kajtusia obserwować.'), [['Kajtusia', 'spelling', 0]], 'opening the text: a typo until its search settles it');
  assert.deepEqual(kinds('Podano Bravekto.'), [['Bravekto', 'spelling', 7]], 'a veterinary form within reach keeps a capitalized word a typo');
  assert.deepEqual(kinds('kot kot\tkot\nkot, kot kot2 kot'), [['kot', 'repeated', 4], ['kot', 'repeated', 8]], 'only spaces or tabs between: a new line, a comma or a word glued to a digit break it');
  assert.deepEqual(kinds('FANCY SZCUR fancy2 2fancy'), [], 'acronyms up to six capitals and words glued to digits are never decorated');
});

test('suggestions: the context proposal first, then the dictionary in the word\'s own case, at most five', () => {
  const { api } = fixture(), issue = (text, word) => api.check(text).find(item => item.word === word);
  assert.deepEqual(plain(api.suggestionsFor(SAMPLE.badanie, issue(SAMPLE.badanie, 'Osłuchwo'))),
    [{ start: 156, end: 168, original: 'Osłuchwo nad', replacement: 'Osłuch wona', kind: 'boundary' }, 'Osłuchowo'], 'rc32 offline iter_suggestions for the sample');
  assert.deepEqual(plain(api.suggestionsFor('Osłuchwo serca.', issue('Osłuchwo serca.', 'Osłuchwo'))), ['Osłuchowo'], 'a context proposal holds only in its own neighbourhood');
  assert.deepEqual(plain(api.suggestionsFor(SAMPLE.wywiad, issue(SAMPLE.wywiad, 'fancy'))), ['fany', 'francy', 'flancy', 'fance', 'fanzy']);
  assert.deepEqual(plain(api.suggestionsFor('Podano Bravekto.', issue('Podano Bravekto.', 'Bravekto'))), ['Bravecto']);
  const shifted = 'Zakażeni edróg oddechowych.';
  assert.deepEqual(plain(api.suggestionsFor(shifted, issue(shifted, 'edróg'))), [{ start: 0, end: 14, original: 'Zakażeni edróg', replacement: 'Zakażenie dróg', kind: 'boundary' }, 'dróg']);
  assert.deepEqual(plain(api.suggestionsFor('kot kot', issue('kot kot', 'kot'))), [''], 'a repeated word: delete it');
});

test('lines only over the active visit sub-window, never while OpisAI works (MacroController._spelling_target)', () => {
  const f = fixture();
  assert.equal(f.api.status(), 'Czekam na tekst w aktywnym polu wizyty', 'before its first check the dictionary is idle');
  f.advance(500);
  assert.deepEqual(f.words(), ['fancy:spelling', 'nastroszna:spelling', 'Osłuchwo:spelling', 'rzęzenia:spelling'], 'rc32 underlines these four words of the sample');
  assert.equal(f.api.status(), 'Pisownia gotowa · słownik demonstracyjny'); assert.equal(f.api.available(), true);
  const bar = f.bar('nastroszna').getBoundingClientRect(), letters = f.letters('badanie', 'nastroszna');
  assert.equal(bar.top, 220 + PAD + LINE, 'the bar lies right below the letters'); assert.equal(bar.height, 5, 'a 5 px band at 100 %');
  assert(letters.y < bar.top, 'the letters themselves stay the field\'s');
  assert.match(f.bar('nastroszna').innerHTML, /stroke="#d1352f"/); assert.match(f.bar('nastroszna').innerHTML, /stroke-width="2"/);
  f.host.isBusy = true; f.advance(150);
  assert.deepEqual(f.words(), [], 'OpisAI reads, generates, reviews, writes or dictates: no lines');
  assert.equal(f.api.status(), 'Czekam na aktywne okno wizyty'); assert.equal(f.api.available(), false);
  f.host.isBusy = false; f.advance(500); assert.equal(f.words().length, 4);
  f.activate('clinic'); f.advance(150); assert.deepEqual(f.words(), [], 'the main window is not the visit\'s description sub-window');
  f.activate('opisai-compose'); f.advance(150); assert.deepEqual(f.words(), []); assert.equal(f.api.status(), 'Czekam na aktywne okno wizyty');
  f.activate('clinic-editor'); f.advance(500); assert.equal(f.words().length, 4);
  f.covers.push(Object.assign(f.doc.createElement('div'), { rect: { left: 0, top: 215, width: 470, height: 40 } })); f.advance(300);
  const partial = f.bar('nastroszna').getBoundingClientRect(), word = f.letters('badanie', 'nastroszna');
  assert(Math.abs(partial.left - 470) <= 1 && Math.abs(partial.right - (word.x + 5 * CHAR)) <= 1, 'a window over part of a word takes the line from that part only (rc29)'); f.covers.length = 0;
  f.host.on = false; f.advance(150); assert.deepEqual(f.words(), []); assert.equal(f.api.status(), 'Pisownia wyłączona'); assert.equal(f.api.available(), false);
  const empty = fixture({ fields: { wywiad: '', badanie: '', diagnoza: '' } }); empty.advance(500);
  assert.equal(empty.api.status(), 'Czekam na tekst w aktywnym polu wizyty');
});

test('the SuggestionCard: "● Literówka" and the word, quiet bars while searching, then the choices; it follows the pointer', () => {
  const f = fixture(); f.advance(500);
  const under = f.bar('nastroszna').getBoundingClientRect(); f.move({ x: under.left + 20, y: under.top + 2 }); f.advance(300);
  assert(!f.card() || f.card().hidden, 'the bar below a word is for clicks; hovering is on its letters (_word_at)');
  f.move(f.letters('badanie', 'nastroszna')); f.advance(200);
  assert(!f.card() || f.card().hidden, 'nothing before 0.22 s'); f.advance(30);
  const card = f.card(); assert(card && !card.hidden, 'the card after 0.22 s on the letters');
  assert.equal(card.querySelector('.oa-spell-word').textContent, 'nastroszna'); assert.equal(card.querySelector('.oa-spell-kind').querySelector('.dot').textContent, '●');
  assert.equal(card.querySelector('.oa-spell-kind').getAttribute('aria-label'), 'Rodzaj uwagi: Literówka');
  assert.equal(card.querySelector('.oa-spell-search').textContent, 'Szukam…'); assert.equal(card.querySelector('.oa-spell-skeleton').hidden, false, 'two quiet bars');
  assert.deepEqual(card.querySelectorAll('.oa-spell-foot button').map(button => [button.getAttribute('aria-label'), button.disabled]), [['Pomiń słowo w tej sesji', true], ['Dodaj słowo do mojego słownika', true]]);
  const width = parseFloat(card.style.width); assert(width >= 176 && width <= 240, 'rc24: 176 to 240 px');
  assert.equal(parseFloat(card.style.top), 220 + PAD + LINE + 6, 'six clear pixels below the word');
  assert.equal(f.bar('nastroszna').dataset.strong, 'true', 'the word with an open card gets a stronger line');
  assert.match(f.bar('nastroszna').innerHTML, /stroke-opacity=".28"/, 'with a soft halo');
  f.advance(160); assert.deepEqual(f.choices().map(button => button.getAttribute('aria-label')), ['nastrosza'], 'the first choice comes first');
  f.advance(200);
  assert.deepEqual(f.choices().map(button => button.getAttribute('aria-label')), ['nastrosza', 'nastroszana', 'nastroszona', 'nastroszka']);
  const [first, second] = f.choices();
  assert(first.classList.contains('is-primary') && !second.classList.contains('is-primary'), 'only the first choice is the main one');
  assert.match(first.innerHTML, /^<s>nastroszna<\/s><span class="arrow">&nbsp;→&nbsp;<\/span>nastrosza$/, 'it shows what it replaces');
  assert.equal(second.innerHTML, 'nastrosz<b>a</b>na', 'the letters a choice changes stand out');
  assert.equal(card.querySelector('.oa-spell-search').textContent, ''); assert.equal(card.querySelector('.oa-spell-skeleton').hidden, true);
  assert.equal(card.querySelectorAll('.oa-spell-foot button').some(button => button.disabled), false);
  f.move({ x: 1500, y: 700 }); f.advance(200); assert.equal(card.hidden, false, 'it stays a moment after the pointer left (LEAVE_DELAY 0.35 s from the last poll on the word)');
  f.advance(300); assert.equal(card.hidden, true); assert.equal(f.bar('nastroszna').dataset.strong, 'false');
});

test('only the bar takes the mouse: the left button pins the card, the right button opens OpisAI\'s menu', () => {
  const f = fixture(); f.advance(500);
  const down = { type: 'mousedown', target: f.bar('Osłuchwo') }; f.layer().dispatchEvent(down);
  assert.equal(down.defaultPrevented, true, 'a press on the bar never moves Klinika\'s caret or focus');
  f.press(f.bar('Osłuchwo')); f.advance(400);
  const card = f.card(); assert(!card.hidden && card.classList.contains('is-pinned'), 'pinned, framed in the kind\'s colour');
  assert.deepEqual(f.choices().map(button => button.getAttribute('aria-label')), ['Osłuchwo nad → Osłuch wona', 'Osłuchowo'], 'the context proposal first');
  assert(f.choices()[0].classList.contains('is-context') && !f.choices()[1].classList.contains('is-primary'));
  f.card().dispatchEvent({ type: 'pointerover', target: f.choices()[0] });
  const preview = f.layer().querySelector('.oa-spell-preview'); assert(preview, 'the range preview while the pointer is on a context proposal');
  assert.equal(preview.children.length, 1); assert.match(preview.innerHTML, new RegExp(`width:${'Osłuchwo nad'.length * CHAR}px`), 'the whole replaced range');
  f.card().dispatchEvent({ type: 'pointerleave' }); assert.equal(f.layer().querySelector('.oa-spell-preview'), null);
  f.move({ x: 1500, y: 700 }); f.advance(600); assert.equal(card.hidden, false, 'a pinned card ignores the pointer');
  f.press(f.memo.diagnoza, 0, { x: 300, y: 350 }); assert.equal(card.hidden, true, 'a press elsewhere closes it');
  const event = f.contextmenu(f.bar('nastroszna'));
  assert.equal(event.defaultPrevented, true); assert.equal(f.card().querySelector('.oa-spell-tip'), null);
  assert.equal(f.layer().parentNode.querySelector('.oa-spell-tip').textContent, 'Szukam propozycji…');
  assert.equal(f.api.status(), 'Sprawdzam propozycje pisowni…');
  f.advance(400);
  assert.deepEqual(f.labels(f.shell.current), ['nastroszna (wył.)', 'nastrosza', 'nastroszana', 'nastroszona', 'nastroszka', '---', 'Pomiń w tej sesji', 'Dodaj do mojego słownika']);
  assert.equal(f.shell.current.options.className, 'oa-menu');
});

test('a choice replaces exactly its range in the same sub-window, undoably; Esc closes the card', () => {
  const f = fixture(); f.advance(500);
  f.move(f.letters('badanie', 'Osłuchwo')); f.advance(600);
  f.click(f.choices()[1]);
  assert.deepEqual(plain(f.replaced), [{ key: 'badanie', start: 156, end: 164, replacement: 'Osłuchowo', expected: SAMPLE.badanie, session: 1 }]);
  assert.match(f.memo.badanie.nodes[0].data, /Osłuchowo nad polami/); assert.equal(f.api.status(), 'Zmieniono pisownię wybranego fragmentu.');
  const line = f.layer().querySelector('.oa-spell-confirm'); assert(line, 'a short green line under the word'); assert.match(line.innerHTML, /stroke="#1f9d55"/);
  f.advance(400); assert.equal(f.layer().querySelector('.oa-spell-confirm'), null, 'gone after 0.38 s');
  f.api.undo();
  assert.deepEqual(plain(f.replaced.at(-1)), { key: 'badanie', start: 156, end: 165, replacement: 'Osłuchwo', expected: SAMPLE.badanie.replace('Osłuchwo', 'Osłuchowo'), session: 1 });
  assert.equal(f.memo.badanie.nodes[0].data, SAMPLE.badanie); assert.equal(f.api.status(), 'Cofnięto poprawkę pisowni.');
  f.advance(500); f.move(f.letters('wywiad', 'fancy')); f.advance(300); assert.equal(f.card().hidden, false);
  const esc = { type: 'keydown', key: 'Escape' }; f.doc.dispatchEvent(esc);
  assert.equal(f.card().hidden, true); assert.equal(esc.defaultPrevented, true);
  f.advance(400); assert.equal(f.card().hidden, true, 'it stays closed while the pointer stays on that word');
});

test('Pomiń lasts for this session only; Dodaj do słownika is kept in this browser; Mój słownik… edits the list', () => {
  const storage = new Map(), f = fixture({ storage }); f.advance(500);
  f.move(f.letters('wywiad', 'fancy')); f.advance(600);
  f.click(f.card().querySelector('[data-spell="ignore"]')); f.advance(100);
  assert.deepEqual(f.words(), ['nastroszna:spelling', 'Osłuchwo:spelling', 'rzęzenia:spelling']); assert.equal(storage.get('opisai.demo.spelling.v1'), undefined);
  f.move(f.letters('badanie', 'nastroszna')); f.advance(600);
  f.click(f.card().querySelector('[data-spell="add"]')); f.advance(100);
  assert.deepEqual(f.words(), ['Osłuchwo:spelling', 'rzęzenia:spelling']);
  assert.deepEqual(JSON.parse(storage.get('opisai.demo.spelling.v1')), { words: ['nastroszna'] });
  const again = fixture({ storage }); again.advance(500);
  assert.deepEqual(again.words(), ['fancy:spelling', 'Osłuchwo:spelling', 'rzęzenia:spelling'], 'a reload checks a skipped word again, never a word of the dictionary');
  const win = again.api.editWords(); const area = win.options.content.querySelector('textarea');
  assert.equal(win.options.title, 'Mój słownik pisowni'); assert.equal(area.value, 'nastroszna');
  assert.equal(win.options.content.querySelector('label').textContent, 'Jedno słowo w wierszu. Usunięcie wpisu ponownie włącza jego sprawdzanie.');
  area.value = ' Osłuchwo \n\nOsłuchwo\n'; win.options.content.querySelector('[data-words="ok"]').dispatchEvent({ type: 'click' }); again.advance(100);
  assert.deepEqual(JSON.parse(storage.get('opisai.demo.spelling.v1')), { words: ['Osłuchwo'] }, 'one word per line, trimmed, without repeats');
  assert.deepEqual(again.words(), ['fancy:spelling', 'nastroszna:spelling', 'rzęzenia:spelling'], 'removing an entry checks the word again');
  assert.equal(again.created.length, 0, 'OK closes the dialog');
});

test('the keyboard list and a reopened sub-window: Sugestie dla aktywnej wizyty…, Cofnij ostatnią poprawkę', () => {
  const f = fixture(); f.advance(500);
  f.memo.badanie.focus(); f.api.showIssues();
  assert.deepEqual(f.labels(f.shell.current), ['fancy', 'nastroszna', 'Osłuchwo', 'rzęzenia'], 'show_issues: every underlined word of the active visit');
  f.choose('nastroszna'); f.advance(400);
  assert.deepEqual(f.labels(f.shell.current), ['nastroszna (wył.)', 'nastrosza', 'nastroszana', 'nastroszona', 'nastroszka', '---', 'Pomiń w tej sesji', 'Dodaj do mojego słownika']);
  f.choose('nastroszona');
  assert.equal(f.replaced.at(-1).replacement, 'nastroszona'); assert.equal(f.doc.activeElement, f.memo.badanie, 'the field has the keyboard again');
  f.advance(500); f.api.showIssues();
  assert.deepEqual(f.labels(f.shell.current), ['fancy', 'Osłuchwo', 'rzęzenia', '---', 'Cofnij ostatnią poprawkę']);
  f.shell.closePopups();
  // ANULUJ and F2: the same visit in a new sub-window; its lines come back, the old receipt does not apply.
  f.clinic.session = 2; f.advance(500);
  assert.deepEqual(f.words(), ['fancy:spelling', 'Osłuchwo:spelling', 'rzęzenia:spelling']);
  const before = f.replaced.length; f.api.undo();
  assert.equal(f.replaced.length, before, 'nothing written into another window'); assert.equal(f.toasts.at(-1), 'Wróć do właściwego okna Kliniki i wybierz poprawkę ponownie.');
  f.contextmenu(f.bar('fancy')); f.advance(400);
  assert(!f.labels(f.shell.current).includes('Cofnij ostatnią poprawkę'), 'the right button offers only this window\'s receipt');
  f.shell.closePopups(); f.clinic.editor = false; f.activate('clinic'); f.advance(150);
  assert.deepEqual(f.words(), []); f.api.showIssues(); assert.equal(f.shell.current, null, 'no list without the visit window');
});

test('an unknown word: amber dashes and the empty card with the dictionary hint', () => {
  const f = fixture({ fields: { wywiad: 'Obserwować też Kajtusia.', badanie: '', diagnoza: '' } }); f.advance(500);
  assert.deepEqual(f.words(), ['Kajtusia:unknown']);
  assert.match(f.bars()[0].innerHTML, /stroke="#b26b00"/); assert(f.bars()[0].querySelectorAll('line').length > 1, 'dashes');
  f.move(f.letters('wywiad', 'Kajtusia')); f.advance(600);
  const card = f.card();
  assert.equal(card.querySelector('.oa-spell-kind').getAttribute('aria-label'), 'Rodzaj uwagi: Nieznane słowo');
  assert.equal(card.querySelector('.oa-spell-empty').textContent, 'Brak propozycji dla tego fragmentu.'); assert.equal(card.querySelector('.oa-spell-empty').hidden, false);
  assert.equal(card.querySelector('.oa-spell-hint').hidden, false); assert.equal(card.querySelector('.oa-spell-hint').textContent, 'Jeśli to nazwa leku albo nazwisko — dodaj je do słownika.');
  assert.equal(card.querySelector('.oa-spell-choices').classList.contains('reserve'), false, 'an empty result is a sentence, without the list\'s gutter');
});

test('a typo whose complete search found nothing settles as an unknown word: the card first, then its line (rc26)', () => {
  const f = fixture({ fields: { wywiad: '', badanie: 'Kajtusia obserwować.', diagnoza: '' } }); f.advance(500);
  assert.deepEqual(f.words(), ['Kajtusia:spelling'], 'a capital that opens the text: a typo before its search');
  f.move(f.letters('badanie', 'Kajtusia')); f.advance(240);
  const card = f.card(); assert.equal(card.querySelector('.oa-spell-kind').getAttribute('aria-label'), 'Rodzaj uwagi: Literówka');
  f.advance(400);
  assert.equal(card.querySelector('.oa-spell-kind').getAttribute('aria-label'), 'Rodzaj uwagi: Nieznane słowo'); assert.equal(card.querySelector('.oa-spell-hint').hidden, false);
  assert.equal(card.style.getPropertyValue?.('--kind') ?? card.style['--kind'], '#b26b00');
  f.move({ x: 1500, y: 700 }); f.advance(600);
  assert.deepEqual(f.words(), ['Kajtusia:unknown']);
});

test('typing takes the lines of that field at once; they come back from the next check', () => {
  const f = fixture(); f.advance(500);
  f.type('badanie', SAMPLE.badanie + ' Bez zmian.');
  assert.deepEqual(f.words(), ['fancy:spelling'], 'the edited field\'s lines go at once');
  f.advance(500); assert.equal(f.words().length, 4);
  f.type('badanie', 'kot kot'); f.advance(500);
  assert.deepEqual(f.words(), ['fancy:spelling', 'kot:repeated']); assert.match(f.bar('kot').innerHTML, /<circle/, 'dots for a repeated word');
  f.move(f.letters('badanie', ' kot')); f.advance(600);
  assert.deepEqual(f.choices().map(button => button.getAttribute('aria-label')), ['Usuń powtórzone słowo']);
});
