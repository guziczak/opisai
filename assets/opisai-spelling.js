/* OpisAI 0.12.0rc32 — local spelling assistance over the Klinika description fields.
 * A port of ui/spelling_overlay.py (SpellingController, _UnderlineOverlay), ui/spelling_suggestions.py
 * (SuggestionCard), ui/spelling_layers.py (SpellingConfirmation), ui/spelling_range_preview.py and
 * domain/spelling.py, spelling_style.py, application/spelling_suggestions.py.
 * OpisAI's own layer above the Klinika window: Klinika knows nothing about it. Only the bar under a word
 * takes the mouse (left: pin the card, right: OpisAI's spelling menu); the letters remain the field's,
 * so a click there places the caret. Demonstration: a small local dictionary, nothing leaves the page. */
(() => {
  'use strict';
  const STORE = 'opisai.demo.spelling.v1';   // "Mój słownik" (Config.spelling_ignored_words); "Pomiń" stays in memory
  const TICK = 100, HOVER_DELAY = 220, LEAVE_DELAY = 350, RECHECK = 350;   // SpellingController, _SpellingWorker
  const SEARCH_FIRST = 140, SEARCH_TAIL = 160;   // the demo's lookup: rc26 shows a first choice after about 0.15 s
  const ROW = 30, HEADER = 26, FOOTER = 28, GAP = 3, LIMIT = 240, CONTEXT_LIMIT = 320, CHOICES = 5;
  const HIT = 5;   // the bar under a word takes the mouse in a 5 px strip; its line is drawn at the top of it
  const STYLES = {spelling: {label: 'Literówka', color: '#d1352f', pattern: 'solid'}, unknown: {label: 'Nieznane słowo', color: '#b26b00', pattern: 'dashed'}, repeated: {label: 'Powtórzone słowo', color: '#2f6fd6', pattern: 'dotted'}};
  const SUCCESS = '#1f9d55', ENGINE = 'słownik demonstracyjny';
  /* The demonstration dictionary. The sample visit's four slips (fancy, nastroszna, Osłuchwo, rzęzenia) carry
   * the choices rc32's offline checker gives for the sample text (_DictionaryChecker: Hunspell pl_PL + the
   * veterinary lexicon, through application/spelling_suggestions.iter_suggestions); the other words are
   * invented slips to try by typing. The choices are ILLUSTRATIVE: with
   * Windows' Polish dictionary (WindowsSpellChecker, used first) they and their order may differ. */
  const DICTIONARY = new Map(Object.entries({
    fancy: ['fany', 'francy', 'flancy', 'fance', 'fanzy'], nastroszna: ['nastrosza', 'nastroszana', 'nastroszona', 'nastroszka'],
    osłuchwo: ['osłuchowo'], rzęzenia: ['rzężenia'], edróg: ['dróg'], kajtusia: [], sluzowe: ['śluzowe'], bravekto: ['bravecto'],
    szcur: ['szur', 'szczur', 'sznur'], szczor: ['szczur', 'szczot', 'szczyr'], apatycznny: ['apatyczny'], klinczne: ['klincze', 'kliniczne'],
    przyspiesozny: ['przyspieszony'], błonyy: ['błony'], porfirryna: ['porfiryna'], wilgotneee: ['wilgotne ee', 'wilgotne-ee'], wymiotty: ['wymioty', 'wymiotny', 'wymiotły']
  }));
  const VETERINARY = new Set(['bravekto']);   // within_reach(): a veterinary form is near, so a capital keeps it a typo
  /* domain/spelling_context: the offline proposals rc32 makes around a word, before the dictionary's words. Each
   * holds only in its exact neighbourhood: "Osłuchwo nad" in the sample (rc32's own result: a correct
   * neighbour's letters across the space, one letter dropped), "zakażeni edróg" when typed. */
  const CONTEXT = new Map([['osłuchwo', [['osłuchwo nad', 'osłuch wona', 'boundary']]], ['edróg', [['zakażeni edróg', 'zakażenie dróg', 'boundary']]]]);
  const WORD = /\p{L}+(?:[-’']\p{L}+)*/gu, ALNUM = /[\p{L}\p{N}]/u, EDGE = /[\p{L}\p{N}_]/u, ATTACHED = /[\p{L}\p{N}\p{M}_'’-]/u;
  const SENTENCE_ENDS = '.!?…:\r\n', OPENING = '"\'„“”«»([{-–—•*', SHORTCUTS = new Set(['crt', 'usg', 'rtg', 'morf', 'bcs', 'spo', 't4', 'ft4', 'tt4']);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fold = text => String(text).toLowerCase();
  const upper = c => !!c && c !== c.toLowerCase();
  const clock = () => performance.now();
  const n2 = value => String(Math.round(value * 100) / 100);
  const px = value => n2(value) + 'px';
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
  const animationsEnabled = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches && document.documentElement?.dataset?.motion !== 'off';
  class SafetyError extends Error {}

  /* ------------------------------------------------------------ dictionary (domain/spelling.py) */
  /* useful_issue: no measurements, clinical shortcuts or acronyms (upper case, up to six letters). */
  const useful = word => word.length <= 80 && !SHORTCUTS.has(fold(word)) && !(word === word.toUpperCase() && word !== word.toLowerCase() && word.length <= 6);
  /* opens_sentence: a capital that opens the text, a line, a sentence or a list item says nothing about the word. */
  function opensSentence(text, start) {
    let i = start;
    while (i && (OPENING.includes(text[i - 1]) || (/\s/.test(text[i - 1]) && !SENTENCE_ENDS.includes(text[i - 1])))) i--;
    return !i || SENTENCE_ENDS.includes(text[i - 1]);
  }
  /* _DictionaryChecker.check: a misspelling is a typo unless a capital in mid-sentence suggests a name with no
   * veterinary form in reach (initial_kind); the same word right after the previous one, only spaces or tabs
   * between, is repeated (repeated_word: a new line, punctuation or a digit breaks it). */
  function check(text) {
    const issues = []; let previous = null;
    for (const match of String(text).matchAll(WORD)) {
      const word = match[0], start = match.index, end = start + word.length;
      if ((start && ALNUM.test(text[start - 1])) || (end < text.length && ALNUM.test(text[end]))) continue;
      const between = previous ? text.slice(previous[1], start) : '', repeated = !!between && !between.replace(/[ \t]/g, '') && fold(text.slice(previous[0], previous[1])) === fold(word);
      previous = [start, end];
      if (repeated) { if (useful(word)) issues.push({start, end, word, kind: 'repeated'}); }
      else if (useful(word) && DICTIONARY.has(fold(word))) issues.push({start, end, word, kind: !upper(word[0]) || opensSentence(text, start) || VETERINARY.has(fold(word)) ? 'spelling' : 'unknown'});
      if (issues.length >= 64) break;
    }
    return issues;
  }
  /* The dictionary answers in the word's own case ("Bravekto" → "Bravecto"). */
  const cased = (word, value) => !value ? value : word.length > 1 && word === word.toUpperCase() && upper(word[0]) ? value.toUpperCase() : upper(word[0]) ? value[0].toUpperCase() + value.slice(1) : value;
  const wholeSpan = (text, start, end) => 0 <= start && start < end && end <= text.length && !(start && ATTACHED.test(text[start - 1])) && !(end < text.length && ATTACHED.test(text[end]));
  /* iter_suggestions: a context proposal first, then the dictionary's words; never the word itself; at most five. */
  function suggestionsFor(text, issue) {
    if (issue.kind === 'repeated') return [''];   // as Windows reports it: delete the second word
    const values = [];
    for (const [original, replacement, kind] of CONTEXT.get(fold(issue.word)) || []) {
      const at = fold(original).indexOf(fold(issue.word)), start = issue.start - at, end = start + original.length;
      if (at < 0 || start < 0 || fold(text.slice(start, end)) !== fold(original) || !wholeSpan(text, start, end)) continue;
      const literal = text.slice(start, end); values.push({start, end, original: literal, replacement: cased(literal, replacement), kind});
    }
    for (const value of (DICTIONARY.get(fold(issue.word)) || []).map(word => cased(issue.word, word))) {
      if (values.length >= CHOICES) break;
      if (value !== issue.word && !values.some(v => typeof v === 'string' ? v === value : v.start === issue.start && v.end === issue.end && v.replacement === value)) values.push(value);
    }
    return values;
  }
  /* selected_replacement / validate_replacement / validate_proposal: only a displayed choice, for the exact text and whole words. */
  function selectedReplacement(text, batch, choice) {
    if (!batch.choices.includes(choice)) throw new SafetyError('Wybierz jedną z wyświetlonych propozycji.');
    let issue = batch.anchor, replacement = choice;
    if (typeof choice === 'object') {
      if (!wholeSpan(text, choice.start, choice.end)) throw new SafetyError('Propozycja nie obejmuje całego fragmentu.');
      issue = {start: choice.start, end: choice.end, word: choice.original}; replacement = choice.replacement;
    }
    if (replacement.length > 100 || /[\r\n\0]/.test(replacement)) throw new SafetyError('Nieprawidłowa propozycja pisowni.');
    if (issue.end > text.length || text.slice(issue.start, issue.end) !== issue.word) throw new SafetyError('Tekst zmienił się. Sprawdź aktualne podkreślenie.');
    if ((issue.start && EDGE.test(text[issue.start - 1])) || (issue.end < text.length && EDGE.test(text[issue.end]))) throw new SafetyError('Propozycja nie obejmuje całego słowa.');
    return [issue, replacement];
  }
  /* difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes(): which letters a choice changes. */
  function opcodes(a, b) {
    const b2j = new Map(); [...b].forEach((c, j) => { if (!b2j.has(c)) b2j.set(c, []); b2j.get(c).push(j); });
    const longest = (alo, ahi, blo, bhi) => {
      let best = [alo, blo, 0], lengths = new Map();
      for (let i = alo; i < ahi; i++) {
        const next = new Map();
        for (const j of b2j.get(a[i]) || []) { if (j < blo) continue; if (j >= bhi) break; const k = (lengths.get(j - 1) || 0) + 1; next.set(j, k); if (k > best[2]) best = [i - k + 1, j - k + 1, k]; }
        lengths = next;
      }
      return best;
    };
    const queue = [[0, a.length, 0, b.length]], blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop(), [i, j, k] = longest(alo, ahi, blo, bhi);
      if (k) { blocks.push([i, j, k]); if (alo < i && blo < j) queue.push([alo, i, blo, j]); if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]); }
    }
    blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const merged = [];
    for (const [i, j, k] of blocks) { const last = merged.at(-1); if (last && last[0] + last[2] === i && last[1] + last[2] === j) last[2] += k; else merged.push([i, j, k]); }
    merged.push([a.length, b.length, 0]);
    const codes = []; let i = 0, j = 0;
    for (const [ai, bj, size] of merged) {
      const tag = i < ai && j < bj ? 'replace' : i < ai ? 'delete' : j < bj ? 'insert' : '';
      if (tag) codes.push([tag, i, ai, j, bj]);
      i = ai + size; j = bj + size; if (size) codes.push(['equal', ai, i, bj, j]);
    }
    return codes;
  }
  /* changed_html: the replacement with the letters it changes in bold, in the note's colour (rc24). */
  const changedHtml = (original, replacement) => opcodes(fold(original), fold(replacement)).map(([tag, , , c, d]) => { const literal = esc(replacement.slice(c, d)); return !literal ? '' : tag === 'equal' ? literal : `<b>${literal}</b>`; }).join('');
  /* _ContextChoiceButton: a literal before/after preview of the exact range, its changes in amber. */
  function contextHtml(original, replacement) {
    const before = [], after = [];
    for (const [tag, a, b, c, d] of opcodes(original, replacement)) for (const [list, value] of [[before, original.slice(a, b)], [after, replacement.slice(c, d)]]) { const literal = esc(value).replace(/\n/g, '<br>'); if (literal) list.push(tag === 'equal' ? literal : `<b>${literal}</b>`); }
    return [before.join(''), after.join('')];
  }

  /* ------------------------------------------------------------ the line (domain/spelling_style.py, paint_line) */
  /* About two physical pixels in the editor's five-pixel band right below the letters; one pixel stronger under the card's word. */
  const thickness = band => Math.min(band, Math.max(1, Math.min(2, band * .45)));
  const emphasized = band => Math.max(thickness(band), Math.min(band, thickness(band) + 1));
  const lineSpan = (left, right, width) => { const first = left + width / 2 + .5, last = right - width / 2 - .5; return last >= first ? [first, last] : [(left + right) / 2, (left + right) / 2]; };
  function dashes(first, last, width) { const dash = Math.max(3, width * 2), gap = Math.max(2.5, width * 1.5), spans = []; for (let at = first; at <= last; at += dash + gap + width) spans.push([at, Math.min(at + dash, last)]); return spans; }
  function dots(first, last, width) { const step = Math.max(2.5, width * 1.9), count = Math.max(1, Math.floor((last - first) / step) + 1); if (count === 1) return [(first + last) / 2]; const spacing = (last - first) / (count - 1); return Array.from({length: count}, (_, i) => first + i * spacing); }
  /* Python's round(5 / scale): 5 px at 100 %, 4 at 125 %, 3 at 150 %, 2 at 200 % (_logical_rect). */
  const bandHeight = () => { const v = 5 / (window.devicePixelRatio || 1), f = Math.floor(v), d = v - f; return Math.max(1, d > .5 || (d === .5 && f % 2) ? f + 1 : f); };
  function lineSvg(width, band, kind, strong) {
    const style = STYLES[kind] || STYLES.unknown, stroke = strong ? emphasized(band) : thickness(band), [first, last] = lineSpan(0, width, stroke), ink = style.color, height = Math.max(band, HIT);
    const line = (a, b, y, w, extra = '') => `<line x1="${n2(a)}" y1="${n2(y)}" x2="${n2(b)}" y2="${n2(y)}" stroke="${ink}" stroke-width="${n2(w)}" stroke-linecap="round"${extra}/>`;
    let body = '';
    if (strong) { const glow = Math.min(band, stroke + 1.5); body += line(first, last, glow / 2, glow, ' stroke-opacity=".28"'); }   // the soft halo
    if (style.pattern === 'dotted') { const r = Math.min(stroke * .6, band / 2); body += dots(first, last, stroke).map(x => `<circle cx="${n2(x)}" cy="${n2(r)}" r="${n2(r)}" fill="${ink}"/>`).join(''); }
    else body += (style.pattern === 'solid' ? [[first, last]] : dashes(first, last, stroke)).map(([a, b]) => line(a, b, stroke / 2, stroke)).join('');
    return `<svg width="${n2(width)}" height="${n2(height)}" viewBox="0 0 ${n2(width)} ${n2(height)}" aria-hidden="true" focusable="false"><svg width="${n2(width)}" height="${n2(band)}" overflow="hidden">${body}</svg></svg>`;   // the inner viewport clips the line to the band
  }

  /* ------------------------------------------------------------ the field's text and geometry (NativeSpellingFields) */
  function nodesOf(el) { const out = []; (function visit(node) { for (const child of node.childNodes || []) { if (child.nodeType === 3 || child.nodeName === 'BR') out.push(child); else if (child.nodeType === 1) visit(child); } })(el); return out; }
  const fieldText = el => nodesOf(el).map(node => node.nodeType === 3 ? node.data : '\n').join('').replace(/ /g, ' ');
  const geometryOf = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, el.scrollLeft || 0, el.scrollTop || 0].map(v => Math.round(v * 2) / 2).join(','); };
  /* EM_POSFROMCHAR: the letters of [start, end), one rectangle per line. */
  function textRects(el, start, end) {
    let at = 0, a = null, b = null;
    for (const node of nodesOf(el)) {
      const length = node.nodeType === 3 ? node.data.length : 1;
      if (node.nodeType === 3) { if (!a && start < at + length) a = [node, start - at]; if (a && end > at && end <= at + length) { b = [node, end - at]; break; } }
      at += length;
    }
    if (!a || !b) return [];
    const range = document.createRange(); range.setStart(a[0], a[1]); range.setEnd(b[0], b[1]);
    const lines = [];
    for (const r of range.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      const line = lines.at(-1);
      if (line && Math.abs(line.top - r.top) < 1 && r.left <= line.right + 2) { line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom); }
      else lines.push({left: r.left, top: r.top, right: r.right, bottom: r.bottom});
    }
    return lines;
  }
  /* rc28/rc29: whether the field itself shows at a point. OpisAI's card does not count (it lies above the line and
   * covers its part); another window, OpisAI's bubble or a notice over part of a word takes the line from that part. */
  function exposed(field, x, y) {
    const hit = (document.elementsFromPoint?.(x, y) || []).find(el => !layer?.contains(el) && !cards?.contains(el));
    return !!hit && (hit === field || field.contains(hit));
  }
  /* _exposed_spans: a point every half line and both ends; where neighbours differ, the edge to the pixel. */
  function exposedSpans(field, x1, x2, y, step) {
    const xs = []; for (let x = x1 + .5; x < x2; x += step) xs.push(x); if (!xs.length || xs.at(-1) < x2 - .5) xs.push(Math.max(x1, x2 - .5));
    const spans = []; let start = x1, previous = null, state = null;
    for (const x of xs) {
      const value = exposed(field, x, y);
      if (previous !== null && value !== state) {
        let low = previous, high = x;
        while (high - low > 1) { const middle = (low + high) / 2; if (exposed(field, middle, y) === state) low = middle; else high = middle; }
        if (state) spans.push([start, high]); else start = high;
      }
      previous = x; state = value;
    }
    if (state) spans.push([start, x2]);
    return spans.filter(([a, b]) => b - a >= 1);
  }
  /* _rectangles_mark: the band under each visible piece of a word; a clipped line never gets a line in its glyphs. */
  function measure(row, issues) {
    const el = row.el, box = el.getBoundingClientRect(), left = box.left + (el.clientLeft || 0), top = box.top + (el.clientTop || 0);
    const right = left + (el.clientWidth || box.width), bottom = top + (el.clientHeight || box.height), band = bandHeight(), strip = Math.max(band, HIT), marks = [];
    for (const issue of issues) {
      const bands = [], letters = [];
      for (const r of textRects(el, issue.start, issue.end)) {
        const x1 = Math.max(left, r.left), x2 = Math.min(right, r.right), h = r.bottom - r.top;
        if (x2 <= x1 || r.top < top || r.bottom + strip > bottom) continue;
        for (const [a, b] of exposedSpans(el, x1, x2, r.top + h / 2, Math.max(2, Math.floor(h / 2)))) { letters.push({x: a, y: r.top, w: b - a, h}); bands.push({x: a, y: r.bottom, w: b - a, h: strip, band}); }
      }
      if (bands.length) marks.push({issue, bands, letters});
    }
    return marks;
  }

  /* ------------------------------------------------------------ state */
  let host = null, timer = 0, epoch = 0, target = null, targetId = '', frame = [], hoverItems = [], notice = '', engine = 'idle';
  const seen = new Map(), checkedAt = new Map(), checked = new Map(), settled = new Map(), barItems = new WeakMap(), choiceValues = new WeakMap();
  const sessionIgnored = new Set(), unsuggested = new Map(), searches = new Map();
  let personal = loadWords();
  let layer = null, cards = null, card = null, tip = null, tipTimer = 0, preview = null, hovered = null, toastEl = null;
  let hoverKey = null, hoverSince = 0, hoverTimer = 0, dismissedKey = null, lastInside = 0, pointer = null, lastField = null;
  let pending = null, serial = 0, open = null, menuEl = null, receipt = null, emphasis = null;
  function loadWords() { try { const saved = JSON.parse(localStorage.getItem(STORE) || 'null'); return Array.isArray(saved?.words) ? saved.words.filter(word => typeof word === 'string' && word.trim() && word.length <= 80) : []; } catch (_) { return []; } }
  function saveWords(list) { personal = list; try { localStorage.setItem(STORE, JSON.stringify({words: list})); return true; } catch (_) { return false; } }
  const ignored = () => new Set([...personal.map(fold), ...sessionIgnored]);
  const issueKey = (row, issue) => [row.session, row.key, row.geometry, row.text, issue.start, issue.end, issue.word].join('\u0001');   // never the kind (rc26)
  /* rc26 settled_kind: a typo whose complete search found nothing is underlined as an unknown word from then on. */
  const settle = issue => issue.kind === 'spelling' && unsuggested.has(issue.word) ? {...issue, kind: 'unknown'} : issue;
  function settleWord(word, found) { unsuggested.delete(word); if (!found) { unsuggested.set(word, true); if (unsuggested.size > 512) unsuggested.delete(unsuggested.keys().next().value); } }

  /* MacroController._spelling_target: only the active, configured visit sub-window, and nothing while OpisAI
   * reads, generates, reviews, writes, dictates or has its settings open (SafeCoordinator.busy). */
  function computeTarget() {
    if (!host || host.running?.() === false || !host.enabled() || host.busy()) return null;
    const win = window.Shell?.activeWindow;
    if (!win || win.id !== 'clinic-editor' || win.visible === false || !win.el?.isConnected || !window.Clinic?.isEditorOpen?.()) return null;
    const fields = [...win.el.querySelectorAll('[data-clinic-field]')];
    return fields.length ? {session: window.Clinic.getContext?.()?.session ?? 0, fields} : null;
  }
  /* One tick: the GUI's checks (_tick) and the worker's capture (_SpellingWorker._loop), every 0.1 s. */
  function tick() {
    if (!host || document.hidden) return;
    const next = computeTarget(), id = next ? 'visit:' + next.session : '';
    if (id !== targetId) {   // another visit or none: forget its fields, close the card and the menu
      targetId = id; epoch += 1; notice = ''; seen.clear(); checkedAt.clear(); checked.clear(); settled.clear();
      cancelSuggestions(); closeMenu(); clearBars();
    }
    target = next;
    if (!target) { clearBars(); return; }
    const at = clock(), values = window.Clinic.getFields?.() || {}, skip = ignored(), rows = [];
    for (const el of target.fields) {
      const key = el.dataset.clinicField, text = fieldText(el), geometry = geometryOf(el);
      if (text !== values[key]) continue;   // the editor is between an input and its render
      if (seen.get(key) !== text) { seen.set(key, text); checkedAt.set(key, at); checked.delete(key); }
      if (!checked.has(key) && at - checkedAt.get(key) >= RECHECK) { checked.set(key, text.trim() ? check(text) : []); if (text.trim()) engine = 'ready'; }
      if (settled.get(key) !== geometry) { settled.set(key, geometry); continue; }   // moved or scrolled: its lines wait until it rests
      const issues = (checked.get(key) || []).map(settle).filter(issue => !skip.has(fold(issue.word)));
      const row = {key, el, text, geometry, session: target.session};
      row.marks = issues.length ? measure(row, issues) : [];
      if (row.marks.length) rows.push(row);
    }
    present(rows);
    pollHover();
  }
  function present(rows) {
    frame = rows;
    hoverItems = rows.flatMap(row => row.marks.flatMap(mark => mark.letters.map((letters, i) => ({letters, band: mark.bands[i], row, mark, key: issueKey(row, mark.issue)}))));
    renderBars();
    // _receive_frame: the card and a pending search follow their word; a changed or vanished word closes them.
    if ((open && !hoverItems.some(item => item.key === open.key)) || (pending && !hoverItems.some(item => item.key === pending.key))) cancelSuggestions();
  }

  /* ------------------------------------------------------------ the layer (_UnderlineOverlay, PassiveLayer) */
  function ensureLayers() {
    if (layer?.isConnected && cards?.isConnected) return;
    const root = document.getElementById('desktop') || document.body;
    layer = document.createElement('div'); layer.className = 'oa-spell-layer'; layer.setAttribute('aria-hidden', 'true');
    cards = document.createElement('div'); cards.className = 'oa-spell-cards';
    root.append(layer, cards); card = null;
    layer.addEventListener('pointerdown', event => { const item = itemAt(event.target); if (item && event.button === 0) pin(item, {x: event.clientX, y: event.clientY}); });
    layer.addEventListener('mousedown', event => { if (event.target?.closest?.('.oa-spell-bar')) event.preventDefault(); });   // no focus or selection change in Klinika
    layer.addEventListener('contextmenu', event => { const item = itemAt(event.target); if (!item) return; event.preventDefault(); event.stopPropagation(); suggest(item, {x: event.clientX, y: event.clientY}); });
  }
  const itemAt = node => { const bar = node?.closest?.('.oa-spell-bar'); return bar ? barItems.get(bar) || null : null; };
  /* present(): only changed bars are touched; a newly shown one fades in over 140 ms (not with reduced motion). */
  function renderBars() {
    ensureLayers();
    const old = new Map(), keep = new Set(), animate = animationsEnabled();
    for (const el of [...layer.children]) if (el.classList.contains('oa-spell-bar')) old.set(el.dataset.visual, el);
    for (const item of hoverItems) {
      const {band, mark} = item, visual = [band.x, band.y, band.w, band.h, mark.issue.word, mark.issue.kind].map(n => typeof n === 'number' ? n2(n) : n).join('|');
      let el = old.get(visual);
      if (!el || keep.has(el)) {
        el = document.createElement('div'); el.className = 'oa-spell-bar' + (animate ? ' is-new' : ''); el.dataset.visual = visual;
        Object.assign(el.style, {left: px(band.x), top: px(band.y), width: px(band.w), height: px(band.h)}); layer.append(el);
      }
      barItems.set(el, item); keep.add(el); paintBar(el);
    }
    for (const el of old.values()) if (!keep.has(el)) el.remove();
  }
  function paintBar(el) {
    const item = barItems.get(el); if (!item) return;
    const strong = String(item.key === emphasis), kind = item.mark.issue.kind;
    if (el.dataset.strong === strong && el.dataset.kind === kind && el.firstChild) return;
    el.dataset.strong = strong; el.dataset.kind = kind; el.innerHTML = lineSvg(item.band.w, item.band.band, kind, strong === 'true');
  }
  function clearBars() { if (layer) for (const el of [...layer.children]) if (el.classList.contains('oa-spell-bar')) el.remove(); frame = []; hoverItems = []; cancelSuggestions(true); }
  /* rc24: the word with an open card gets a stronger line, until the card closes; only the words concerned repaint. */
  function setEmphasis(key) { if (key === emphasis) return; emphasis = key; if (layer) for (const el of layer.children) if (el.classList.contains('oa-spell-bar')) paintBar(el); }
  function emphasize(request) {
    if (!open || (pending || open.request) !== request || open.key !== request.key || !target) return;
    if (!open.pinned && wordAt(pointer)?.key !== request.key) return;
    setEmphasis(request.key);
  }

  /* ------------------------------------------------------------ hover, pin and the card */
  /* _word_at: the letters of an underlined word (the hover rectangles are the text, not the bar below it). */
  function wordAt(point) {
    if (!point) return null;
    for (const item of hoverItems) {
      const r = item.letters;
      if (point.x < r.x || point.x >= r.x + r.w || point.y < r.y || point.y >= r.y + r.h) continue;
      // A window or OpisAI's bubble over the word: polling never makes the covered word hoverable.
      const hit = (document.elementsFromPoint?.(point.x, point.y) || []).find(el => !cards?.contains(el));
      if (hit && (hit === item.row.el || item.row.el.contains(hit) || layer?.contains(hit))) return item;
    }
    return null;
  }
  const insideCard = (point, margin = 5) => { if (!point || !card || card.hidden || !open) return false; const r = card.getBoundingClientRect(); return point.x >= r.left - margin && point.x < r.right + margin && point.y >= r.top - margin && point.y < r.bottom + margin; };
  /* _poll_hover: 0.22 s on a word opens its card; a card stays while the pointer is on the word or the card,
   * and 0.35 s after it left; a pinned card ignores the pointer. Esc keeps a closed card closed on its word. */
  function pollHover() {
    if (!host || menuEl || pending?.mode === 'manual') return;
    const item = wordAt(pointer), key = item?.key ?? null, at = clock();
    if (dismissedKey !== null) { if (key === dismissedKey) return; dismissedKey = null; }
    if (open?.pinned) return;
    if (open) {
      if (key === open.key || insideCard(pointer)) { lastInside = at; return; }
      if (at - lastInside < LEAVE_DELAY) return;
      cancelSuggestions(true);
    }
    if (!item) { cancelSuggestions(true); return; }
    if (key !== hoverKey) { cancelSuggestions(true); hoverKey = key; hoverSince = at; hoverTimer = setTimeout(hoverDeadline, HOVER_DELAY); }
  }
  function hoverDeadline() {
    const expected = hoverKey; hoverTimer = 0;
    if (expected === null) return;
    tick();
    if (hoverKey !== expected || open || pending) return;
    const item = wordAt(pointer);
    if (item?.key === expected) request(item, 'hover', item.letters, pointer);
  }
  /* rc24, the left button on the bar: the card stays open until ×, Esc, a press elsewhere, a choice or an edit. */
  function pin(item, point) {
    if (!host?.enabled() || !target) return;
    if (!open || open.key !== item.key) { dismissedKey = null; request(item, 'hover', item.letters, point); }
    if (open) { open.pinned = true; renderCard(); }
    setEmphasis(item.key);
  }
  function request(item, mode, anchor, point, keyboard = false) {
    cancelSuggestions();
    const req = {id: ++serial, mode, key: item.key, point: point || pointer, keyboard, epoch, timers: []};
    pending = req;
    if (mode === 'hover') {
      open = {request: req, key: item.key, anchor, row: item.row, issue: item.mark.issue, kind: item.mark.issue.kind, pinned: false, choices: [], batch: null, searching: true, loading: true, above: false};
      lastInside = clock(); presentCard(); setTimeout(() => emphasize(req), 0);
    }
    search(item.row, item.mark.issue, req);
  }
  /* The search: complete results are kept (suggestion_cache_key); the demo's lookup brings the first choice, then the rest. */
  function search(row, issue, req) {
    const key = [row.text, issue.start, issue.end, issue.kind === 'repeated'].join('\u0001'), deliver = (values, complete) => receive(req, row, issue, values, complete);
    if (issue.kind === 'repeated') { deliver([''], true); return; }
    if (searches.has(key)) { deliver(searches.get(key), true); return; }
    const values = suggestionsFor(row.text, issue);
    const finish = () => { searches.set(key, values); if (searches.size > 128) searches.delete(searches.keys().next().value); settleWord(issue.word, values.length > 0); deliver(values, true); };
    if (values.length > 1) { req.timers.push(setTimeout(() => deliver(values.slice(0, 1), false), SEARCH_FIRST)); req.timers.push(setTimeout(finish, SEARCH_FIRST + SEARCH_TAIL)); }
    else req.timers.push(setTimeout(finish, values.length ? SEARCH_FIRST : SEARCH_FIRST + SEARCH_TAIL));
  }
  /* _show_suggestions: only for the current request and the same revision of the field. */
  function receive(req, row, issue, values, complete) {
    if (req !== pending || req.epoch !== epoch || !target) return;
    tick();
    if (req !== pending || !hoverItems.some(item => item.key === req.key)) return;
    if (complete) pending = null;
    notice = ''; hideTip();
    const batch = {anchor: issue, choices: values, row};
    if (req.mode === 'hover') { if (open?.request === req) { open.batch = batch; updateChoices(values, complete); } return; }
    if (complete) wordMenu(row, issue, batch, req.point, req.keyboard);
  }
  function cancelSuggestions(hoverOnly = false) {
    clearTimeout(hoverTimer); hoverTimer = 0; setEmphasis(null); setHovered(null);
    if (pending && (!hoverOnly || pending.mode === 'hover')) { pending.timers.forEach(clearTimeout); pending = null; }
    hoverKey = null;
    if (open) { open = null; if (card) card.hidden = true; }
  }

  /* horizontalAdvance in the card's own font: a hidden ruler in OpisAI's layer, so the width decisions use the
   * face the card is drawn in (Segoe UI, or the bundled Selawik once loaded). Without a layout: 7 px a letter. */
  let ruler = null;
  function advance(text, weight = 400) {
    text = String(text);
    if (!ruler?.isConnected) { ensureLayers(); ruler = document.createElement('span'); ruler.className = 'oa-spell-ruler'; ruler.setAttribute('aria-hidden', 'true'); cards.append(ruler); }
    ruler.style.fontWeight = String(weight); ruler.textContent = text;
    const width = ruler.getBoundingClientRect?.().width || 0;
    return width > 0 || !text ? width : text.length * 7;
  }
  /* The status label's fixed width (search_status.setFixedWidth(horizontalAdvance("Szukam…"))), one value for
   * the card's width and for the heading's fit. */
  const searchWidth = () => Math.ceil(advance('Szukam…'));
  /* _footer_button_width: a caption (horizontalAdvance, whole pixels) and its 7 px paddings. */
  const footerWidths = () => [Math.round(advance('Pomiń')) + 14, Math.round(advance('Dodaj do słownika')) + 14];
  /* _measure: the footer's stretch factors are those widths and the buttons ignore their size hints, so the whole
   * row is shared in proportion to the captions, not split evenly; qGeomCalc rounds the first share and gives the
   * rest to the second (a 240 px card: 66 and 155 px). */
  function allocateFooter(width) {
    const [a, b] = footerWidths(), room = Math.max(0, width - 16 - GAP), first = Math.round(room * a / (a + b));
    card.querySelectorAll('.oa-spell-foot button').forEach((button, i) => { button.style.flex = '0 0 ' + px(i ? room - first : first); });
  }
  /* _preferred_width, at the opening: the footer, the header (kind, word, "Szukam…", ×) and the choices then
   * known; 176 to 240 px (320 with a context proposal). The controller opens a card before its search, so
   * choices arriving later never widen it. */
  function preferredWidth(word, kind, choices = []) {
    const footer = footerWidths().reduce((a, b) => a + b) + GAP, label = (STYLES[kind] || STYLES.unknown).label;
    const header = advance('● ' + label) + 4 + advance(word, 600) + searchWidth() + HEADER + 8;
    const lines = choices.flatMap((value, i) => typeof value === 'object' ? [value.original, value.replacement] : i === 0 && value ? [word + ' → ' + value] : [value || 'Usuń powtórzone słowo']);
    const candidates = Math.max(0, ...lines.map(line => advance(line))) + 30, limit = choices.some(value => typeof value === 'object') ? CONTEXT_LIMIT : LIMIT;
    return Math.ceil(Math.min(limit, Math.max(176, footer + 16, Math.min(header + 16, limit), candidates + 16)));
  }
  const workBounds = () => { const top = document.getElementById('taskbar')?.getBoundingClientRect?.().top, bottom = Number.isFinite(top) && top > 0 ? Math.min(innerHeight, top) : innerHeight - 48; return {left: 8, top: 8, right: innerWidth - 8, bottom: bottom - 8}; };
  function buildCard() {
    const el = document.createElement('div'); el.className = 'oa-spell-card'; el.setAttribute('role', 'group'); el.hidden = true;
    el.innerHTML = `<div class="oa-spell-head"><span class="oa-spell-kind"></span><span class="oa-spell-word" aria-label="Słowo do sprawdzenia"></span><span class="oa-spell-search" aria-label="Stan wyszukiwania podpowiedzi"></span><button type="button" class="oa-spell-close" tabindex="-1" data-spell="close" title="Zamknij podpowiedzi" aria-label="Zamknij podpowiedzi pisowni">×</button></div><div class="oa-spell-choices"><div class="oa-spell-empty"></div><div class="oa-spell-hint">Jeśli to nazwa leku albo nazwisko — dodaj je do słownika.</div><div class="oa-spell-skeleton" role="img" aria-label="Szukam propozycji…"><i></i><i></i></div></div><div class="oa-spell-foot"><button type="button" tabindex="-1" data-spell="ignore" title="Pomiń słowo w tej sesji" aria-label="Pomiń słowo w tej sesji">Pomiń</button><button type="button" tabindex="-1" data-spell="add" title="Dodaj słowo do mojego słownika" aria-label="Dodaj słowo do mojego słownika">Dodaj do słownika</button></div>`;
    el.addEventListener('mousedown', event => event.preventDefault());   // the card never takes the editor's focus (WindowDoesNotAcceptFocus)
    el.addEventListener('click', event => {
      const button = event.target?.closest?.('button'); if (!button || button.disabled || !open) return;
      const action = button.dataset.spell;
      if (action === 'close') { dismissedKey = open.key; cancelSuggestions(true); }
      else if (action === 'ignore') { if (cardActionCurrent()) ignoreWord(open.batch.anchor.word); cancelSuggestions(true); }
      else if (action === 'add') { if (cardActionCurrent()) addWord(open.batch.anchor.word); cancelSuggestions(true); }
      else if (choiceValues.has(button)) replaceFromCard(choiceValues.get(button));
    });
    el.addEventListener('pointerover', event => { const value = choiceValues.get(event.target?.closest?.('.oa-spell-choice')); setHovered(typeof value === 'object' ? value : null); });
    el.addEventListener('pointerleave', () => setHovered(null));
    cards.append(el);
    return el;
  }
  function presentCard() {
    ensureLayers();
    if (!card?.isConnected) card = buildCard();
    card.querySelectorAll('.oa-spell-choice').forEach(el => el.remove());
    const appearing = card.hidden; card.hidden = false;
    open.reserve = open.searching || open.choices.length > 2;   // present(): the gutter stays until an empty result
    open.width = Math.min(preferredWidth(open.issue.word, open.kind, open.choices), workBounds().right - workBounds().left);
    allocateFooter(open.width); renderCard(); sizeCard(true);
    if (appearing && animationsEnabled()) card.animate?.([{opacity: 0}, {opacity: 1}], {duration: 120, easing: 'cubic-bezier(.33,1,.68,1)'});   // OutCubic, 120 ms
  }
  /* The header ("● Literówka", the word, "Szukam…", ×), the footer and the states of the list. */
  function renderCard() {
    if (!card || !open) return;
    const style = STYLES[open.kind] || STYLES.unknown;
    card.className = 'oa-spell-card' + (host?.theme?.() === 'dark' ? ' oa-theme-dark' : '') + (open.pinned ? ' is-pinned' : '');
    card.style.setProperty('--kind', style.color); card.style.setProperty('--kind-rgb', rgb(style.color));
    card.setAttribute('aria-label', 'Podpowiedzi pisowni: ' + open.issue.word);
    const search = card.querySelector('.oa-spell-search'), status = searchWidth();
    search.style.width = px(status); search.textContent = open.searching ? 'Szukam…' : ''; search.title = open.searching ? 'Szukam kolejnych propozycji' : '';
    // _fit_heading: the kind's name only when it fits beside the whole word; the dot always does.
    const room = open.width - 16 - HEADER - status - 8, full = advance('● ' + style.label) + 4 + advance(open.issue.word, 600) <= room + .5;
    const kind = card.querySelector('.oa-spell-kind'); kind.innerHTML = `<span class="dot">●</span>${full ? `&nbsp;<span class="name">${esc(style.label)}</span>` : ''}`;
    kind.title = style.label; kind.setAttribute('aria-label', 'Rodzaj uwagi: ' + style.label);
    const word = card.querySelector('.oa-spell-word'); word.textContent = open.issue.word; word.title = open.issue.word;
    const empty = card.querySelector('.oa-spell-empty');
    empty.textContent = open.loading ? 'Szukam propozycji…' : 'Brak propozycji dla tego fragmentu.'; empty.hidden = !!open.choices.length || open.loading;
    card.querySelector('.oa-spell-skeleton').hidden = !open.loading;
    card.querySelector('.oa-spell-hint').hidden = open.searching || !!open.choices.length || open.kind !== 'unknown';
    card.querySelector('.oa-spell-choices').classList.toggle('reserve', !!open.reserve);
    card.querySelectorAll('.oa-spell-foot button').forEach(button => { button.disabled = open.loading; });
  }
  function choiceButton(value, index) {
    const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1; button.className = 'oa-spell-choice';
    let caption;
    if (typeof value === 'object') { const [before, after] = contextHtml(value.original, value.replacement); button.className += ' is-context'; button.innerHTML = `<span class="before">${before}</span><span class="after">${after}</span>`; caption = value.original + ' → ' + value.replacement; }
    else if (!value) { button.textContent = caption = 'Usuń powtórzone słowo'; }
    else {
      const changed = changedHtml(open.issue.word, value), room = open.width - 16 - 2 - 12 - 14; caption = value;
      // _WordChoiceButton: the first choice shows what it replaces when that fits; a long word keeps the whole new word.
      if (index === 0) { button.className += ' is-primary'; button.innerHTML = advance(open.issue.word, 600) + advance(' → ', 600) + advance(value, 600) <= room ? `<s>${esc(open.issue.word)}</s><span class="arrow">&nbsp;→&nbsp;</span>${changed}` : changed; }
      else button.innerHTML = changed;
    }
    button.setAttribute('aria-label', caption); button.title = caption; choiceValues.set(button, value);
    return button;
  }
  /* update_choices: append verified candidates (never reorder); a typo whose search found nothing becomes an unknown word. */
  function updateChoices(values, complete) {
    if (!open || !card) return;
    const list = card.querySelector('.oa-spell-choices'), first = list.querySelector('.oa-spell-empty');
    for (const value of values) {
      if (open.choices.includes(value) || open.choices.length >= CHOICES) continue;
      open.choices.push(value); list.insertBefore(choiceButton(value, open.choices.length - 1), first);
    }
    open.searching = !complete; open.loading = open.searching && !open.choices.length;
    if (complete && !open.choices.length && open.kind === 'spelling') open.kind = 'unknown';
    if (complete && !open.choices.length) open.reserve = false;   // a completed empty state is a sentence, not a list
    renderCard(); sizeCard(false);
  }
  /* Heights as in rc32: two rows and part of a third while searching or for a longer list, one or two rows exactly,
   * the empty sentence (and the hint); a hovered card keeps its height so no action moves under the pointer. */
  function viewport() {
    const rows = [...card.querySelectorAll('.oa-spell-choice')].map(b => b.classList.contains('is-context') ? Math.max(ROW, b.scrollHeight || 48) : ROW), count = open.choices.length;
    if (!open.searching && (count === 1 || count === 2)) return rows.reduce((a, b) => a + b, 0) + (count - 1) * GAP;
    if (!open.searching && !count) return Math.max(ROW, card.querySelector('.oa-spell-empty').scrollHeight || 36) + (open.kind === 'unknown' ? GAP + (card.querySelector('.oa-spell-hint').scrollHeight || 36) : 0);
    while (rows.length < 3) rows.push(rows.at(-1) || ROW);
    return rows[0] + rows[1] + 2 * GAP + Math.ceil(rows[2] / 2);
  }
  function sizeCard(placing) {
    if (!open || !card) return;
    const desired = 16 + 10 + HEADER + FOOTER + viewport(), bounds = workBounds();
    if (placing) {   // present(): six clear pixels below the word, or above it when there is no room below
      const width = open.width, height = Math.min(desired, bounds.bottom - bounds.top), a = open.anchor;
      let y = a.y + a.h + 6; open.above = y + height > bounds.bottom; if (open.above) y = a.y - height - 6;
      y = Math.max(bounds.top, Math.min(y, bounds.bottom - height));
      Object.assign(card.style, {left: px(Math.max(bounds.left, Math.min(a.x, bounds.right - width))), top: px(y), width: px(width), height: px(height)});
      return;
    }
    // _compact_after_completion: never under the pointer; a context row may grow the card within the work area.
    const contextual = open.choices.some(value => typeof value === 'object');
    if (insideCard(pointer, 0) || (open.searching && !contextual)) return;
    const current = parseFloat(card.style.height) || desired, top = parseFloat(card.style.top) || 0;
    const height = contextual ? Math.min(desired, Math.max(1, open.above ? top + current - bounds.top : bounds.bottom - top)) : Math.min(current, desired);
    if (Math.abs(height - current) < .5) return;
    if (open.above) card.style.top = px(top + current - height);
    card.style.height = px(height);
  }
  function cardActionCurrent() { tick(); return !!(host?.enabled() && target && open && !open.loading && open.batch && hoverItems.some(item => item.key === open.key)); }
  function replaceFromCard(value) {
    if (cardActionCurrent()) { try { const [issue, replacement] = selectedReplacement(open.batch.row.text, open.batch, value); applyCorrection(open.batch.row, issue, replacement, open.anchor); } catch (error) { feedback(error.message); } }
    else feedback('Tekst zmienił się. Wybierz aktualną propozycję pisowni.');
    cancelSuggestions(true);
  }
  /* SpellingRangePreview: the whole range of a hovered context proposal, a faint amber box; never a selection. */
  function setHovered(proposal) {
    if (proposal === hovered) return;
    hovered = proposal; preview?.remove(); preview = null;
    if (!proposal || !open?.batch?.choices.includes(proposal) || !layer) return;
    const rects = textRects(open.batch.row.el, proposal.start, proposal.end); if (!rects.length) return;
    preview = document.createElement('div'); preview.className = 'oa-spell-preview';
    preview.innerHTML = rects.map(r => `<i style="left:${px(r.left)};top:${px(r.top)};width:${px(r.right - r.left)};height:${px(r.bottom - r.top)}"></i>`).join('');
    layer.append(preview);
  }

  /* ------------------------------------------------------------ menus (the right button and the bubble's list) */
  function openMenu(items, point, keyboard, field) {
    closeMenu();
    const shell = window.Shell; if (!shell?.menu) return;
    const p = point || pointer || fieldCorner(field), prior = document.activeElement?.closest?.('[data-clinic-field]');
    let el = null;   // the field that had the keyboard before the menu gets it back (Windows returns it to Klinika)
    el = shell.menu(items, p.x, p.y, {className: 'oa-menu' + (host?.theme?.() === 'dark' ? ' oa-theme-dark' : ''), flip: true, onClose: () => { if (menuEl === el) menuEl = null; returnFocus(prior || field); }}) || null;
    menuEl = el;
    // A QMenu takes the keyboard while it is open: Esc closes it and never reaches Klinika (whose Esc cancels the visit).
    if (keyboard) el?.querySelector?.('button:not(:disabled)')?.focus();
    else if (el) { el.tabIndex = -1; el.classList?.add('oa-spell-menu'); el.focus?.({preventScroll: true}); }
  }
  function closeMenu() { const el = menuEl; menuEl = null; if (el?.isConnected) window.Shell?.closePopups?.(); }
  const fieldCorner = field => { const r = (field || lastField || target?.fields[0])?.getBoundingClientRect?.(); return r ? {x: r.left + 12, y: r.top + 12} : {x: innerWidth / 2, y: innerHeight / 2}; };
  /* After OpisAI's menu the visit window and its field have the keyboard again (OpisAI windows never keep it). */
  function returnFocus(field) {
    const el = field || lastField, active = document.activeElement;
    if (!el?.isConnected || window.Shell?.activeWindow?.id !== 'clinic-editor') return;
    if (active && active !== document.body && active.isConnected && !active.closest?.('.shell-menu')) return;
    el.focus?.({preventScroll: true});
  }
  /* _suggest: the right button on the bar (or a word of the list) asks for suggestions, then shows the menu. */
  function suggest(item, point, keyboard = false) {
    if (!host?.enabled() || !target) return;
    notice = 'Sprawdzam propozycje pisowni…'; showTip('Szukam propozycji…', point);
    request(item, 'manual', null, point, keyboard);
  }
  function wordMenu(row, issue, batch, point, keyboard) {
    const items = [{label: issue.word, disabled: true}];
    for (const choice of batch.choices) items.push({label: typeof choice === 'object' ? choice.original + ' → ' + choice.replacement : choice || 'Usuń powtórzone słowo', onClick: () => replaceFromMenu(row, batch, choice)});
    if (!batch.choices.length) items.push({label: 'Brak propozycji dla tego fragmentu.', disabled: true});
    items.push({separator: true}, {label: 'Pomiń w tej sesji', onClick: () => ignoreWord(issue.word)}, {label: 'Dodaj do mojego słownika', onClick: () => addWord(issue.word)});
    if (receipt && receipt.session === row.session) items.push({separator: true}, {label: 'Cofnij ostatnią poprawkę', onClick: undo});
    openMenu(items, point, keyboard, row.el);
  }
  function replaceFromMenu(row, batch, choice) {
    const before = epoch; tick();   // the busy and target guard again at the click itself
    if (before !== epoch || !target) { feedback('Kontekst zmienił się. Nie zastosowano poprawki pisowni.'); return; }
    try { const [issue, replacement] = selectedReplacement(row.text, batch, choice); applyCorrection(row, issue, replacement, hoverItems.find(item => item.key === issueKey(row, batch.anchor))?.letters); } catch (error) { feedback(error.message); }
  }
  /* show_issues: the underlined words of the active visit as a list for the keyboard, also from the bubble's menu. */
  function showIssues() {
    if (!host?.enabled()) return;
    tick(); if (!target) return;
    cancelSuggestions();
    const visible = pointer && pointer.x >= 0 && pointer.y >= 0 && pointer.x < innerWidth && pointer.y < innerHeight, point = visible ? pointer : fieldCorner(lastField), items = [];
    for (const row of frame) for (const mark of row.marks) {
      const key = issueKey(row, mark.issue);
      items.push({label: mark.issue.word, onClick: () => { tick(); const item = hoverItems.find(candidate => candidate.key === key); if (item) suggest(item, point, true); }});
    }
    if (!items.length) items.push({label: 'Brak widocznych podkreśleń', disabled: true});
    if (receipt) items.push({separator: true}, {label: 'Cofnij ostatnią poprawkę', onClick: undo});
    openMenu(items, point, true, lastField);
  }
  function showTip(text, point) {
    hideTip(); if (!point) return; ensureLayers();
    tip = document.createElement('div'); tip.className = 'oa-spell-tip' + (host?.theme?.() === 'dark' ? ' oa-theme-dark' : ''); tip.setAttribute('role', 'status'); tip.textContent = text;
    Object.assign(tip.style, {left: px(Math.min(point.x + 12, innerWidth - 180)), top: px(Math.min(point.y + 18, innerHeight - 90))}); cards.append(tip);
    tipTimer = setTimeout(hideTip, 2500);
  }
  function hideTip() { clearTimeout(tipTimer); tip?.remove(); tip = null; }

  /* ------------------------------------------------------------ replacement, undo and the dictionaries */
  function feedback(message) { hideTip(); toastEl?.remove?.(); toastEl = window.Shell?.toast?.(message) || null; }
  function failed(message, status = true) { if (status) notice = message; feedback(message); }
  function restart() { seen.clear(); checkedAt.clear(); checked.clear(); cancelSuggestions(); clearBars(); }
  /* The worker's "replace": the exact range, undoable in the field (EM_REPLACESEL), only in the same visit window. */
  /* ``anchor``: the underlined word's letters before the change (_remember_confirmation), the confirmation's place. */
  function applyCorrection(row, issue, replacement, anchor) {
    if (!target || row.session !== target.session) { failed('Kontekst zmienił się. Nie zastosowano poprawki pisowni.', false); return; }
    if (window.Shell?.activeWindow?.id !== 'clinic-editor') { failed('Wróć do właściwego okna Kliniki i wybierz poprawkę ponownie.', false); return; }
    const result = window.Clinic?.replaceText?.(row.key, issue.start, issue.end, replacement, {expected: row.text, session: row.session, source: 'spelling'});
    if (!result?.ok) { failed('Pole lub tekst zmieniły się. Wybierz aktualną propozycję.'); return; }
    receipt = {key: row.key, session: row.session, start: issue.start, original: issue.word, replacement, after: result.text};
    restart(); notice = 'Zmieniono pisownię wybranego fragmentu.';
    confirmation(anchor, row.el);
  }
  /* SpellingController.undo: our own replacement reversed, only while the field still shows exactly it. */
  function undo() {
    tick();
    const r = receipt; if (!r || !target) return;
    if (r.session !== target.session) { failed('Wróć do właściwego okna Kliniki i wybierz poprawkę ponownie.', false); return; }
    const result = window.Clinic?.replaceText?.(r.key, r.start, r.start + r.replacement.length, r.original, {expected: r.after, session: r.session, source: 'spelling-undo'});
    if (!result?.ok) { failed('Pole lub tekst zmieniły się. Wybierz aktualną propozycję.'); return; }
    receipt = null; restart(); notice = 'Cofnięto poprawkę pisowni.';
    returnFocus(target.fields.find(el => el.dataset.clinicField === r.key));
  }
  /* SpellingConfirmation: a green line under the word just replaced, gone after 0.38 s; none with reduced motion. */
  function confirmation(anchor, field) {
    if (!animationsEnabled() || !anchor || anchor.w <= 0 || !layer) return;
    // The strip below the word, clipped to the field; local coordinates keep the word at (2, 0).
    const f = field?.getBoundingClientRect?.(), left = anchor.x - 2, right = Math.min(anchor.x + anchor.w + 2, f ? f.right : Infinity), bottom = Math.min(anchor.y + anchor.h + 5, f ? f.bottom : Infinity);
    const x0 = Math.max(left, f ? f.left : -Infinity), width = right - x0, height = bottom - anchor.y; if (width <= 0 || height <= anchor.h) return;
    const [first, last] = lineSpan(anchor.x - x0, anchor.x - x0 + anchor.w, 2), y = anchor.h + 1;
    const line = document.createElement('div'); line.className = 'oa-spell-confirm';
    Object.assign(line.style, {left: px(x0), top: px(anchor.y), width: px(width), height: px(height)});
    line.innerHTML = `<svg width="${n2(width)}" height="${n2(height)}" aria-hidden="true" focusable="false"><line x1="${n2(first)}" y1="${n2(y)}" x2="${n2(last)}" y2="${n2(y)}" stroke="${SUCCESS}" stroke-width="2" stroke-linecap="round"/></svg>`;
    layer.append(line); setTimeout(() => line.remove(), 380);
  }
  /* "Pomiń w tej sesji": in memory only; a reload (a restart of OpisAI) checks the word again. */
  function ignoreWord(word) { sessionIgnored.add(fold(word)); tick(); }
  /* "Dodaj do słownika": kept in this browser (legacy_ui._add_spelling_word: up to 5000 words of 80 characters). */
  function addWord(word) {
    word = String(word).trim(); if (!word || word.length > 80 || /[\r\n\0]/.test(word)) return;
    const list = [...personal];
    if (!list.some(entry => fold(entry) === fold(word))) { if (list.length >= 5000) { feedback('Osobisty słownik ma już 5000 słów. Usuń niepotrzebne wpisy w menu pisowni.'); return; } list.push(word); }
    if (!saveWords(list)) feedback('Słowo pominięto w tej sesji; nie udało się zapisać słownika.');
    tick();
  }
  /* "Mój słownik…" (legacy_ui._edit_spelling_words): one word per line; removing one checks it again. */
  function editWords() {
    const shell = window.Shell; if (!shell?.createWindow) return;
    shell.windows?.get?.('opisai-spelling-words')?.close?.();
    const body = document.createElement('div'); body.className = 'oa-app oa-spell-words';
    body.innerHTML = `<label class="oa-spell-words-label" for="oa-spell-words-text">Jedno słowo w wierszu. Usunięcie wpisu ponownie włącza jego sprawdzanie.</label><textarea id="oa-spell-words-text" spellcheck="false"></textarea><div class="oa-spell-words-foot"><button type="button" class="oa-btn primary" data-words="ok">OK</button><button type="button" class="oa-btn" data-words="cancel">Anuluj</button></div>`;
    const area = body.querySelector('textarea'); area.value = personal.join('\n');
    const win = shell.createWindow({id: 'opisai-spelling-words', title: 'Mój słownik pisowni', icon: 'opisai', width: 440, height: 380, minWidth: 340, minHeight: 280, className: 'oa-host oa-theme-' + (host?.theme?.() || 'light'), content: body, resizable: true, maximizable: false, taskbar: false});
    host?.adopt?.(win);   // one of OpisAI's windows (rc32 InputDialog is an AppDialog): it follows the theme, the bubble recalls it, "Zamknij" closes it
    const close = () => win.close();
    body.querySelector('[data-words="cancel"]').addEventListener('click', close);
    body.querySelector('[data-words="ok"]').addEventListener('click', () => {
      const list = [...new Set(area.value.split(/\r?\n/).map(word => word.trim()).filter(Boolean))];
      close();
      if (list.length > 5000 || list.some(word => word.length > 80 || word.includes('\0'))) { feedback('Słownik może zawierać do 5000 słów, każde do 80 znaków.'); return; }
      if (!saveWords(list)) feedback('Zmiany słownika działają w tej sesji; nie udało się ich zapisać.');
      tick();
    });
    body.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
    setTimeout(() => { area.focus?.(); area.select?.(); }, 60);   // QInputDialog opens with its text selected
    return win;
  }

  /* ------------------------------------------------------------ status and wiring */
  /* SpellingController._publish_status (the disabled row of the bubble's "Podpowiedzi pisowni" menu); no counts. */
  function status() {
    if (!host) return 'Sprawdzanie pisowni jest niedostępne';
    tick();
    if (!host.enabled()) return 'Pisownia wyłączona';
    if (!target) return 'Czekam na aktywne okno wizyty';
    if (notice) return notice;
    return engine === 'ready' ? 'Pisownia gotowa · ' + ENGINE : 'Czekam na tekst w aktywnym polu wizyty';
  }
  /* _refresh_spelling_menu: suggestions and undo need the setting on and the active visit. */
  const available = () => { tick(); return !!(host?.enabled() && target); };
  /* OpisAI connects its state: enabled() is the one source (the bubble menu's check item), busy() its work,
   * theme() its window theme and adopt() its window registry. */
  function connect(next) {
    host = next && typeof next.enabled === 'function' && typeof next.busy === 'function' ? next : null;
    if (!host) return;
    ensureLayers();
    if (!timer) timer = setInterval(tick, TICK);
    tick();
  }
  document.addEventListener('pointermove', event => { pointer = {x: event.clientX, y: event.clientY}; pollHover(); }, {capture: true, passive: true});
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) { pointer = null; pollHover(); } }, {capture: true, passive: true});
  /* A press elsewhere than on the pinned card or its word closes it; the press itself goes where it always does. */
  document.addEventListener('pointerdown', event => {
    pointer = {x: event.clientX, y: event.clientY};
    if (!open?.pinned) return;
    if (itemAt(event.target)?.key === open.key || wordAt(pointer)?.key === open.key || insideCard(pointer)) return;
    dismissedKey = open.key; cancelSuggestions(true);
  }, true);
  /* Esc closes the card and keeps it closed while the pointer stays on that word. */
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (open) { dismissedKey = open.key; cancelSuggestions(true); event.preventDefault(); event.stopPropagation(); }
    else if (hoverKey !== null) { dismissedKey = hoverKey; cancelSuggestions(true); }
  }, true);
  document.addEventListener('focusin', event => { if (event.target?.matches?.('[data-clinic-field]')) lastField = event.target; }, true);
  /* Typing, scrolling or a resize takes the lines at once; they come back from the next reading. */
  document.addEventListener('input', event => { const row = frame.find(r => r.el === event.target || r.el.contains?.(event.target)); if (row) { cancelSuggestions(); present(frame.filter(r => r !== row)); } }, true);
  document.addEventListener('scroll', event => { if (frame.some(row => event.target === document || event.target?.contains?.(row.el))) { cancelSuggestions(); clearBars(); } }, true);
  window.addEventListener('resize', () => { if (frame.length) { cancelSuggestions(); clearBars(); } });
  window.OpisAISpelling = {connect, refresh: tick, status, available, showIssues, undo, editWords, check, suggestionsFor};
})();
