/* Klinika XP — demonstration mock-up reconstructed from kxp_mock.c 2.4.1 (OpisAI-resources):
   the "Przebieg wizyty" main window, the separate description sub-window
   "Rejestracja wizyty: Wywiad - Badanie - Diagnoza", the read-only review of a saved visit
   and the visit list (Ctrl+L). Fictional data only; nothing leaves this page.
   An independent reconstruction for showing the OpisAI workflow, not a BRI product. */
(() => {
  'use strict';
  const STORAGE_KEY = 'opisai.demo.visit.v3';
  const KEYS = ['wywiad', 'badanie', 'diagnoza'];
  const LABELS = { wywiad: 'Wywiad', badanie: 'Badanie kliniczne', diagnoza: 'Diagnoza' };
  const DEFAULT_FIELDS = Object.freeze({
    wywiad: 'Szczur, samiec, fancy rat, 1 rok 9 mies., ok. 420 g. Od ~2 tygodni nasilające się kichanie i świszczący oddech, czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych.',
    badanie: 'Stan ogólny obniżony, postawa zgarbiona, sierść nastroszna. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchwo nad polami płucnymi rzęzenia i świsty. BCS 2/5. T 37,8°C, HR ok. 360/min.',
    diagnoza: 'Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych.'
  });
  const SPELLING = {
    nastroszna: 'nastroszona', osłuchwo: 'Osłuchowo', rzęzenia: 'rzężenia', rózowe: 'różowe',
    sluzowe: 'śluzowe', patoogicznych: 'patologicznych', oddechowew: 'oddechowe', badaniau: 'badaniu',
    dexdormitro: 'Dexdomitor', chelbocąc: 'chełbocząc', bravekto: 'Bravecto', szcur: 'szczur',
    szczor: 'szczur', apatycznny: 'apatyczny', klinczne: 'kliniczne', przyspiesozny: 'przyspieszony',
    błonyy: 'błony', porfirryna: 'porfiryna', wilgotneee: 'wilgotne', wymiotty: 'wymioty'
  };
  const UNKNOWN_TERMS = new Set(['fancy']);
  const MAIN_TITLE = '[DEMO] Klinika XP w. 5.40.01.01 - [Przebieg wizyty - Zwierzę domowe]';
  const REVIEW_TITLE = '[DEMO] Klinika XP w. 5.40.01.01 — PRZEGLĄD WIZYTY (TYLKO DO ODCZYTU)';
  const SUB_TITLE = '[DEMO] Rejestracja wizyty: Wywiad - Badanie - Diagnoza';
  const LIST_TITLE = '[DEMO] Klinika XP — Wizyty';
  const NO_EDITOR = 'Nie znaleziono podokna opisu wizyty. Otwórz wizytę w Klinice i spróbuj ponownie.';
  const DOCTOR = 'Anna Nowak';
  const VISIT_TYPES = ['Badanie', 'Kontrola', 'Profilaktyka', 'Obserwacja', 'Diagnostyka', 'Badanie i profilaktyka'];
  const MENUS = ['OPCJE', 'PRZEBIEG WIZYTY – ZWIERZĘ DOMOWE', 'ZWIERZĘTA', 'KLIENCI', 'WIZYTY', 'Dane główne', 'Apteka', 'Finanse', 'Leczenie', 'Profilaktyka', 'Organizacja pracy', 'Dodatkowe', 'Administrator', 'Pomoc'];
  const DISABLED_MENUS = new Set([2, 3, 6, 7, 8, 9, 10, 11, 12]);
  const SIDE = [['start', 'Początek', 'caseStart'], ['visit', 'Przebieg wizyty', 'caseVisit'], ['treatment', 'Leczenie', 'caseTreat'], ['billing', 'Rozliczenie', 'caseBill'], ['media', 'Multimedia', 'monitors'], ['next', 'Następna…', 'caseNext']];
  const STEPS = [['1. Badanie', 'therm', 91], ['2. Szybka diagnoza', 'bookCheck', 130], ['3. Profilaktyka', 'syringe', 112], ['4. Obserwacja', 'search', 104], ['5. Diagnostyka', 'tubes', 104], ['6. Bad. dodatkowe', 'window', 130], ['7. Kont. leczenia', 'docs', 133], ['8. Dalej', 'next', 89], ['9. Anuluj', 'close', 89]];
  const SECTION_ICONS = { wywiad: 'chat', badanie: 'therm', diagnoza: 'diag' };
  /* Section toolbars of the description sub-window, as in kxp_mock.c editor_specs (photo 1645). */
  const SECTION_TOOLS = {
    wywiad: [['Mowa', 'mic'], ['Zredaguj', 'ai'], ['Typowe', 'search'], ['Dodatkowe', 'window'], ['OK', 'check', 'ok'], ['ANULUJ', 'close', 'cancel']],
    badanie: [['Mowa', 'mic'], ['Typowe', 'search'], ['Poziom bólu', 'pain'], ['Objawy', 'dog'], ['Więcej', 'more', 'menu']],
    diagnoza: [['Wybierz', 'search'], ['Choroby', 'diag'], ['Diagnoza AI', 'ai'], ['Porady', 'book']]
  };
  const TOOL_WIDTHS = [58, 65, 70, 70, 63, 65];
  const PATIENTS = [
    { id: 1, owner: 'Marta Wiśniewska', address: 'ul. Przykładowa 1, Wrocław', phone: 'tel. 000 000 000', name: 'Fistaszek', species: 'szczur, odmiana hodowlana (fancy rat)', sex: 'samiec', colour: 'kapturowa, czarno-biała', months: 21, weight: '0.420', chip: '000012345' },
    { id: 2, owner: 'Katarzyna Zielińska', address: 'ul. Przykładowa 2, Wrocław', phone: 'tel. 000 000 000', name: 'Mela', species: 'kot europejski krótkowłosy', sex: 'samica', colour: 'szylkretowa', months: 62, weight: '4.100', chip: '000012346' },
    { id: 3, owner: 'Piotr Malinowski', address: 'ul. Przykładowa 3, Wrocław', phone: 'tel. 000 000 000', name: 'Bruno', species: 'pies, mieszaniec', sex: 'samiec', colour: 'rudy', months: 44, weight: '18.500', chip: '000012347' }
  ];
  const SEED_VISITS = [
    { id: 'V-140', patient: 1, occurred: '2026-08-12 16:40', type: 'Profilaktyka', number: '140/2026', doctor: DOCTOR, weight: '0.45', temperature: '', fields: { wywiad: 'Kontrola okresowa. Apetyt dobry, aktywny, bez kichania.', badanie: 'Stan ogólny dobry, sierść gładka, oddech spokojny, bez wydzieliny z nozdrzy. Masa 450 g.', diagnoza: 'Zdrowy, bez zmian chorobowych.' } },
    { id: 'V-063', patient: 1, occurred: '2026-03-03 11:20', type: 'Badanie', number: '063/2026', doctor: DOCTOR, weight: '0.38', temperature: '', fields: { wywiad: 'Pierwsza wizyta po zakupie. Karmiony mieszanką dla szczurów, mieszka z drugim samcem.', badanie: 'Stan ogólny dobry, BCS 3/5. Uszy, oczy i nozdrza czyste.', diagnoza: 'Zdrowy.' } },
    { id: 'V-151', patient: 2, occurred: '2026-09-02 09:30', type: 'Kontrola', number: '151/2026', doctor: DOCTOR, weight: '4.1', temperature: '38.6', fields: { wywiad: 'Kontrola po zmianie karmy. Apetyt dobry, wymiotów brak.', badanie: 'Stan ogólny dobry, brzuch miękki, niebolesny. Śluzówki różowe.', diagnoza: 'Bez zmian chorobowych.' } },
    { id: 'V-158', patient: 3, occurred: '2026-09-20 18:05', type: 'Badanie', number: '158/2026', doctor: DOCTOR, weight: '18.5', temperature: '38.9', fields: { wywiad: 'Kuleje na lewą kończynę piersiową od wczoraj, po zabawie w parku.', badanie: 'Bolesność przy zginaniu nadgarstka lewego, bez obrzęku. Pozostałe kończyny bez zmian.', diagnoza: 'Stłuczenie nadgarstka lewego, do kontroli.' } }
  ];
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const displayDate = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : (iso || '');
  const newDraft = (patient = 1, { empty = false } = {}) => ({ id: null, patient, meta: { date: today(), time: '10:15', type: 'Badanie', doctor: DOCTOR, number: '', weight: patient === 1 && !empty ? '0.42' : '', temperature: patient === 1 && !empty ? '37.8' : '' }, fields: patient === 1 && !empty ? { ...DEFAULT_FIELDS } : { wywiad: '', badanie: '', diagnoza: '' } });
  const initialState = () => ({ visits: JSON.parse(JSON.stringify(SEED_VISITS)), current: newDraft(1), loaded: null, mode: 'new', editorOpen: true, editorHidden: false, activeField: 'badanie', spelling: true, ignoredWords: [], historyAll: false, historyAscending: false, weights: [17, 72, 11], sequence: 160 });
  function loadState() {
    const base = initialState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || !saved.current || !saved.current.fields || KEYS.some(key => typeof saved.current.fields[key] !== 'string') || !Array.isArray(saved.visits)) return base;
      return { ...base, ...saved, ignoredWords: Array.isArray(saved.ignoredWords) ? saved.ignoredWords : [], weights: Array.isArray(saved.weights) && saved.weights.length === 3 ? saved.weights : base.weights };
    } catch (_) { return base; }
  }
  let state = loadState();
  let mainWindow = null, mainRoot = null, editorWindow = null, editorRoot = null, listWindow = null, listRoot = null;
  let spellPopup = null, popupPinned = false, hoverTimer = null, hideTimer = null, lastCorrection = null, closingEditor = false, statusText = '';
  const undoStack = [], editTimers = new Map(), composing = new Set();
  const esc = text => window.Shell ? Shell.escape(String(text ?? '')) : String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kx = (name, size = 24, extra = '') => window.KxpIcons ? KxpIcons.svg(name, size, extra) : '';
  const icon = (name, size = 16) => window.Icons ? Icons.svg(name, size) : '';
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const patientOf = id => PATIENTS.find(p => p.id === id) || PATIENTS[0];
  const writable = () => state.mode === 'new' || state.mode === 'edit';
  const editorVisible = () => !!(editorWindow && editorRoot && document.contains(editorRoot) && !state.editorHidden);
  const getFields = () => ({ ...state.current.fields });
  const savedFields = () => state.loaded ? { ...state.loaded.fields } : { wywiad: '', badanie: '', diagnoza: '' };
  const dirty = () => state.current.id === null || KEYS.some(key => state.current.fields[key] !== savedFields()[key]);
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const announce = (field, source) => emit('clinic:change', { field, fields: getFields(), source: source || 'manual' });
  const toast = text => window.Shell?.toast(text);
  function plural(n, one, few, many) { const t = n % 100, u = n % 10; return n === 1 ? one : (u >= 2 && u <= 4 && (t < 12 || t > 14)) ? few : many; }
  function ageText(months) { const y = Math.floor(months / 12), m = months % 12, parts = []; if (y) parts.push(`${y} ${plural(y, 'rok', 'lata', 'lat')}`); if (m || !y) parts.push(`${m} ${plural(m, 'miesiąc', 'miesiące', 'miesięcy')}`); return parts.join(' i '); }
  function birthDate(months) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - months); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
  function pushUndo(before, after) {
    if (KEYS.every(key => before[key] === after[key])) return;
    undoStack.push({ before: { ...before }, after: { ...after } });
    if (undoStack.length > 60) undoStack.shift();
  }
  function fieldElement(key) { return editorRoot?.querySelector(`[data-clinic-field="${key}"]`) || null; }
  function selectionOffsets(el) {
    const s = window.getSelection();
    if (!s?.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) return null;
    const r = s.getRangeAt(0), prefix = r.cloneRange();
    prefix.selectNodeContents(el); prefix.setEnd(r.startContainer, r.startOffset);
    return { start: prefix.toString().length, end: prefix.toString().length + r.toString().length };
  }
  function restoreSelection(el, offsets) {
    if (!offsets) return;
    const nodes = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) nodes.push(node);
    if (!nodes.length) { el.appendChild(document.createTextNode('')); nodes.push(el.firstChild); }
    const point = pos => { let left = pos; for (const n of nodes) { if (left <= n.length) return [n, left]; left -= n.length; } const n = nodes[nodes.length - 1]; return [n, n.length]; };
    try { const a = point(offsets.start), b = point(offsets.end), r = document.createRange(); r.setStart(...a); r.setEnd(...b); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) {}
  }
  /* Spelling marks belong to OpisAI's overlay; the Klinika field itself stays plain text. */
  function spellingMarks(text) {
    const marks = [], tokens = [...text.matchAll(/[\p{L}]+(?:[-'][\p{L}]+)*/gu)];
    let previous = null;
    for (const token of tokens) {
      const word = token[0], lower = word.toLocaleLowerCase('pl'), start = token.index;
      if (state.ignoredWords.includes(lower)) { previous = token; continue; }
      if (previous && previous[0].toLocaleLowerCase('pl') === lower && /^\s+$/.test(text.slice(previous.index + previous[0].length, start))) marks.push({ start, word, kind: 'repeat', replacement: '' });
      else if (SPELLING[lower]) {
        let replacement = SPELLING[lower];
        replacement = (word[0] === word[0].toLocaleUpperCase('pl') ? replacement[0].toLocaleUpperCase('pl') : replacement[0].toLocaleLowerCase('pl')) + replacement.slice(1);
        marks.push({ start, word, kind: 'typo', replacement });
      } else if (UNKNOWN_TERMS.has(lower)) marks.push({ start, word, kind: 'unknown', replacement: '' });
      previous = token;
    }
    return marks;
  }
  function renderField(key, preserve = false) {
    const el = fieldElement(key); if (!el || composing.has(key)) return;
    const text = state.current.fields[key], selected = preserve ? selectionOffsets(el) : null;
    if (!state.spelling) el.textContent = text;
    else {
      let html = '', cursor = 0;
      for (const mark of spellingMarks(text)) {
        html += esc(text.slice(cursor, mark.start));
        html += `<span class="clinic-spell ${mark.kind}" data-start="${mark.start}" data-kind="${mark.kind}" data-replacement="${esc(mark.replacement)}" data-word="${esc(mark.word)}">${esc(mark.word)}</span>`;
        cursor = mark.start + mark.word.length;
      }
      el.innerHTML = html + esc(text.slice(cursor));
    }
    restoreSelection(el, selected);
  }

  /* ---------------------------------------------------------------- main window */
  function historyLines(visits) {
    return visits.map(v => {
      const rows = [`<div class="kxp-h-date">${kx('calendar', 18)}<b>${esc(displayDate(v.occurred))} ${esc(v.occurred.slice(11, 16))}: ${esc(v.type)}  •  ${esc(v.number)}</b></div>`];
      KEYS.forEach(key => { if (v.fields[key]) rows.push(`<div class="kxp-h-label">${kx(key === 'wywiad' ? 'clipboard' : key === 'badanie' ? 'notes' : 'docs', 16)}<b>${LABELS[key]}:</b></div><div class="kxp-h-text">${esc(v.fields[key])}</div>`); });
      rows.push(`<div class="kxp-h-person">${kx('person', 16)}Lekarz: ${esc(v.doctor)}</div>`);
      return `<article class="kxp-h-visit" data-visit="${esc(v.id)}">${rows.join('')}</article>`;
    }).join('') || '<p class="kxp-h-empty">Brak zapisanych wizyt dla tego pacjenta.</p>';
  }
  function patientVisits() {
    const list = state.visits.filter(v => v.patient === state.current.patient).sort((a, b) => a.occurred.localeCompare(b.occurred) * (state.historyAscending ? 1 : -1));
    return state.historyAll ? list : list.slice(0, 30);
  }
  function savedViewHTML() {
    const v = state.loaded; if (!v) return '';
    return `<div class="kxp-view-label">${esc(v.type)}</div><button class="kxp-edit-strip" data-kxp="edit" title="Przejdź do edycji (F2)">${kx('therm', 22)}<span>Przejdź do edycji</span></button>
      <div class="kxp-history kxp-saved" tabindex="0" aria-label="Zapisana wizyta — tylko do odczytu">${KEYS.filter(key => v.fields[key]).map(key => `<div class="kxp-h-label">${kx(key === 'wywiad' ? 'clipboard' : key === 'badanie' ? 'notes' : 'docs', 16)}<b>${LABELS[key]}:</b></div><div class="kxp-h-text">${esc(v.fields[key])}</div>`).join('') || '<p class="kxp-h-empty">Wizyta nie zawiera opisu.</p>'}</div>`;
  }
  function modeStatus() {
    if (state.mode === 'saved') return 'TYLKO DO ODCZYTU · Przejdź do edycji otwiera osobny edytor · Ctrl+L: lista wizyt';
    if (state.editorHidden && writable()) return 'Bufor pozostaje w pamięci. F2 przywraca tę samą sesję, bez zapisu.';
    return 'F2 — opis wizyty · F4 — nowa wizyta · Ctrl+L — wizyty';
  }
  function renderMain() {
    if (!mainRoot) return;
    const p = patientOf(state.current.patient), m = state.current.meta, ro = state.mode === 'saved', canEdit = writable();
    const cardTitle = ro ? 'PRZEGLĄD WIZYTY' : state.mode === 'new' ? 'NOWA WIZYTA' : 'WIZYTA / HISTORIA';
    const tools = [['extra', 'Dodatkowe', 'star', 66], ['print', 'Wydruki', 'print', 66], ['ops', 'Operacje', 'bolt', 68, true], [ro ? 'edit' : 'save', ro ? 'Przejdź do edycji' : 'Zapisz wizytę', ro ? 'pen' : 'check', 90], [ro ? 'close-view' : 'hold', ro ? 'Zamknij' : 'Na razie zatrzymaj', ro ? 'folder' : 'pause', 108], ['cancel', 'Anuluj', 'folder', 66, true]];
    mainRoot.dataset.mode = state.mode;
    mainRoot.innerHTML = `
      <nav class="kxp-menubar" aria-label="Menu Kliniki XP">${MENUS.map((label, i) => `<button class="kxp-menu${i === 1 ? ' is-current' : ''}" data-menu="${i}" ${DISABLED_MENUS.has(i) ? 'disabled' : ''}>${esc(i === 1 && ro ? label + ' (TYLKO DO ODCZYTU)' : label)}</button>`).join('')}</nav>
      <div class="kxp-toolbar" role="toolbar" aria-label="Wizyta">${tools.map(([id, label, ico, w, sep]) => id === 'cancel' && ro ? '' : `<button class="kxp-action${sep ? ' has-separator' : ''}" style="width:${w}px" data-kxp="${id}">${kx(ico, 26)}<span>${esc(label)}</span></button>`).join('')}</div>
      <div class="kxp-canvas-scroll"><div class="kxp-canvas">
        <section class="kxp-panel kxp-visit-card" aria-label="${cardTitle}"><header>${cardTitle}</header>
          <span class="kxp-nr">Nr:</span><b class="kxp-nr-value">${esc(state.current.id === null ? '<NOWY>' : m.number)}</b>
          ${kx('calendar', 20, 'kxp-at-date')}<input class="kxp-input kxp-at-date-in" data-meta="date" value="${esc(displayDate(m.date))}" aria-label="Data wizyty" ${canEdit ? '' : 'readonly'}>
          ${kx('clock', 20, 'kxp-at-time')}<input class="kxp-input kxp-at-time-in" data-meta="time" value="${esc(m.time)}" aria-label="Godzina wizyty" ${canEdit ? '' : 'readonly'}>
          <span class="kxp-cap kxp-at-wcap">Waga:</span><span class="kxp-cap kxp-at-tcap">Temperatura:</span>
          ${kx('scales', 20, 'kxp-at-weight')}<input class="kxp-input kxp-at-weight-in" data-meta="weight" value="${esc(m.weight)}" aria-label="Waga w kg" ${canEdit ? '' : 'readonly'}>
          ${kx('therm', 20, 'kxp-at-temp')}<input class="kxp-input kxp-at-temp-in" data-meta="temperature" value="${esc(m.temperature)}" aria-label="Temperatura" ${canEdit ? '' : 'readonly'}>
          ${kx('notes', 18, 'kxp-at-notes')}<button class="kxp-minitool kxp-at-data" data-kxp="meta">${kx('notes', 17)}<span>Dane wizyty…</span></button>
        </section>
        <section class="kxp-panel kxp-owner" aria-label="Właściciel"><header>WŁAŚCICIEL</header>${kx('person', 24, 'kxp-panel-icon')}
          <div class="kxp-data kxp-strong">${esc(p.owner)}</div><div class="kxp-data">${esc(p.address)}</div><div class="kxp-data">${esc(p.phone)}</div>
          <div class="kxp-text kxp-gap">Płatnik VAT: nie</div><div class="kxp-text kxp-balance">Saldo: 0,00 zł</div></section>
        <section class="kxp-panel kxp-animal" aria-label="Zwierzę"><header>ZWIERZĘ<span class="kxp-chip">ID: ${esc(p.chip)}</span><button class="kxp-head-tool" data-kxp="meta" title="Dane wizyty">${kx('pen', 18)}</button><button class="kxp-head-tool" data-kxp="photo" title="Zdjęcie">${kx('camera', 18)}</button><button class="kxp-head-tool" data-kxp="patient-list" title="Karta zwierzęcia">${kx('clipboard', 18)}</button></header>${kx('dog', 24, 'kxp-panel-icon')}
          <div class="kxp-data kxp-strong">${esc(p.name)}</div><div class="kxp-data kxp-strong">${esc(p.species)}</div>
          <div class="kxp-text">Płeć: ${esc(p.sex)}  Maść: ${esc(p.colour)}</div><div class="kxp-text">Wiek: ${esc(ageText(p.months))} (${esc(birthDate(p.months))})</div><div class="kxp-text kxp-strong">Waga: ${esc(p.weight)} kg</div>
          <button class="kxp-info" data-kxp="patient-list" title="Informacje o zwierzęciu">${kx('info', 21)}</button></section>
        <button class="kxp-photo" data-kxp="photo" title="Zdjęcie zwierzęcia">${kx('camera', 56)}<span>zdjęcie niedostępne</span></button>
        <nav class="kxp-side" aria-label="Etapy">${SIDE.map(([id, label, ico]) => ro && (id === 'start' || id === 'next') ? '' : `<button class="kxp-side-item${(ro ? id === 'visit' : id === 'start') ? ' is-selected' : ''}" data-side="${id}"><span>${esc(label)}</span>${kx(ico, 22)}</button>`).join('')}</nav>
        ${ro ? savedViewHTML() : `
        <div class="kxp-pager" role="tablist" aria-label="Przebieg wizyty">${STEPS.map(([label, ico, w], i) => `<button class="kxp-step${i === 0 && editorVisible() ? ' is-selected' : ''}" style="width:${w}px" data-step="${i}" role="tab" aria-selected="${i === 0 && editorVisible()}">${kx(ico, 23)}<span>${esc(label)}</span></button>`).join('')}</div>
        <div class="kxp-history-head"><b>Historia wizyt (${state.historyAll ? 'wszystkie' : 'ostatnie 30 wizyt'})</b><label class="kxp-check"><input type="checkbox" data-kxp="history-all" ${state.historyAll ? 'checked' : ''}>Pokaż wszystkie</label><button class="kxp-small" data-kxp="history-order">↕ Kolejność</button></div>
        <div class="kxp-history-icons">${['clipboard', 'syringe', 'docs'].map(ico => `<button data-kxp="list" title="Historia / wybór wizyty">${kx(ico, 22)}</button>`).join('')}</div>
        <div class="kxp-history" tabindex="0" aria-label="Historia wizyt">${historyLines(patientVisits())}</div>`}
      </div></div>
      <footer class="kxp-status" role="status"><button class="kxp-next" data-kxp="next">${kx('next', 13)}Dalej</button><span class="kxp-cost">Szacunkowy koszt:<b>0,00 zł</b></span><span class="kxp-doctor">${kx('person', 18)}${esc(m.doctor || DOCTOR)}</span><span class="kxp-mode" data-kxp-status>${esc(statusText || modeStatus())}</span></footer>`;
    mainWindow?.setTitle(ro ? REVIEW_TITLE : MAIN_TITLE);
  }
  function setStatus(text) { statusText = text || ''; const el = mainRoot?.querySelector('[data-kxp-status]'); if (el) el.textContent = statusText || modeStatus(); }
  function refreshAll() { renderMain(); renderEditorChrome(); persist(); }

  /* ------------------------------------------------------- description sub-window */
  function editorHTML() {
    const total = state.weights.reduce((a, b) => a + b, 0) || 100;
    return `<div class="kxp-editor">${KEYS.map((key, i) => `
      <section class="kxp-section" data-section="${key}" style="flex:${state.weights[i] / total} 1 0">
        <header class="kxp-section-head"><button class="kxp-section-title${i === 0 ? ' is-first' : ''}" data-focus="${key}">${kx(SECTION_ICONS[key], 25)}<span>${LABELS[key]}:</span></button>
          <div class="kxp-section-tools" role="toolbar" aria-label="Narzędzia sekcji ${LABELS[key]}">${SECTION_TOOLS[key].map(([label, ico, role], j) => `<button class="kxp-section-tool${i === 0 && (j === 2 || j === 4) ? ' pair-start' : ''}" style="width:${TOOL_WIDTHS[j]}px" data-tool="${role || label}" data-section-key="${key}">${kx(ico, 22)}<span>${esc(label)}</span></button>`).join('')}</div></header>
        <div class="kxp-memo" role="textbox" aria-label="${LABELS[key]}" aria-multiline="true" contenteditable="plaintext-only" spellcheck="false" data-field="${key}" data-clinic-field="${key}"></div>
      </section>${i < 2 ? `<div class="kxp-splitter" data-splitter="${i}" role="separator" aria-orientation="horizontal" title="Przeciągnij, aby zmienić wysokość pól"></div>` : ''}`).join('')}
      <footer class="kxp-editor-status"><span data-editor-identity></span><span data-editor-status></span></footer></div>`;
  }
  function renderEditorChrome() {
    if (!editorRoot) return;
    const p = patientOf(state.current.patient);
    editorRoot.querySelector('[data-editor-identity]').textContent = `${state.current.id === null ? 'Nowa wizyta' : 'Wizyta ' + state.current.meta.number} · ${p.name} · ${p.owner}`;
    editorRoot.querySelector('[data-editor-status]').textContent = dirty() ? 'Zmiany w buforze. OK zapisze; ANULUJ je odrzuci.' : 'Opis wizyty otwarty do edycji.';
    for (const key of KEYS) fieldElement(key)?.closest('.kxp-section').classList.toggle('is-active', key === state.activeField);
  }
  function openEditor() {
    if (!writable()) return false;
    open();
    state.editorHidden = false;
    if (editorWindow && editorRoot && document.contains(editorRoot)) { editorWindow.show(); editorWindow.focus(); persist(); renderMain(); return true; }
    editorRoot = document.createElement('div'); editorRoot.className = 'kxp-editor-root';
    /* Below the visit card row of the main window, so both windows read as in the mock. */
    const width = Math.max(560, Math.min(1110, innerWidth - 120)), height = Math.max(400, Math.min(520, innerHeight - 300)), top = Math.max(8, Math.min(262, innerHeight - height - 56));
    editorWindow = Shell.createWindow({ id: 'clinic-editor', title: SUB_TITLE, icon: 'clinic', width, height, minWidth: 520, minHeight: 360, x: Math.max(8, Math.min(96, innerWidth - width - 8)), y: top, className: 'kxp-editor-window', content: editorRoot, resizable: true, maximizable: true, taskbar: false, owner: 'clinic', onClose: () => { if (closingEditor) return true; requestCancel(); return false; } });
    editorRoot.innerHTML = editorHTML();
    KEYS.forEach(key => renderField(key)); bindEditor(); renderEditorChrome();
    state.editorOpen = true; persist(); renderMain();
    emit('clinic:editor', { open: true, mode: state.mode });
    setTimeout(() => fieldElement(state.activeField)?.focus(), 60);
    return true;
  }
  function closeEditor() {
    dismissSpelling();
    if (editorWindow) { closingEditor = true; editorWindow.close(); closingEditor = false; }
    editorWindow = null; editorRoot = null; state.editorOpen = false; state.editorHidden = false;
    emit('clinic:editor', { open: false, mode: state.mode });
  }
  function holdEditor() {
    if (!writable() || !editorWindow) return;
    dismissSpelling(); editorWindow.minimize(true); state.editorHidden = true; persist();
    setStatus('Bufor pozostaje w pamięci. F2 przywraca tę samą sesję, bez zapisu.'); renderMain();
    emit('clinic:editor', { open: false, mode: state.mode });
  }
  function startEditing() {
    if (state.mode === 'saved' || state.mode === 'history') {
      if (!state.loaded) { newVisit(); return; }
      state.current = { id: state.loaded.id, patient: state.loaded.patient, meta: metaFromVisit(state.loaded), fields: { ...state.loaded.fields } };
      state.mode = 'edit'; undoStack.length = 0; statusText = '';
    }
    openEditor();
  }
  function metaFromVisit(v) { return { date: v.occurred.slice(0, 10), time: v.occurred.slice(11, 16), type: v.type, doctor: v.doctor, number: v.number, weight: v.weight, temperature: v.temperature }; }
  function metaValid(m) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(m.date) && !Number.isNaN(+new Date(m.date + 'T12:00:00'));
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time);
    const decimal = v => !v || /^\d+([.,]\d+)?$/.test(v);
    return date && time && m.type && m.doctor && decimal(m.weight) && decimal(m.temperature);
  }
  function saveVisit() {
    if (!writable()) return false;
    syncMetaInputs();
    if (!metaValid(state.current.meta)) { Shell.notify?.({ app: 'Klinika XP', icon: 'clinic', title: 'Nie zapisano wizyty', message: 'Sprawdź datę, godzinę, typ, lekarza i numer. Waga / temperatura: liczba bez jednostki.' }); setStatus('Nieprawidłowe dane wizyty. Popraw je przed zapisaniem.'); return false; }
    const c = state.current, m = c.meta;
    const record = { id: c.id || `V-${state.sequence}`, patient: c.patient, occurred: `${m.date} ${m.time}`, type: m.type, number: m.number || `${String(state.sequence).padStart(3, '0')}/${m.date.slice(0, 4)}`, doctor: m.doctor, weight: m.weight, temperature: m.temperature, fields: getFields() };
    if (!c.id) state.sequence += 1;
    state.visits = [record, ...state.visits.filter(v => v.id !== record.id)];
    state.loaded = record; state.current = { id: record.id, patient: record.patient, meta: metaFromVisit(record), fields: { ...record.fields } };
    state.mode = 'saved'; undoStack.length = 0;
    closeEditor();
    statusText = 'Zapisano wizytę. Teraz przegląd TYLKO DO ODCZYTU; ponowna edycja wymaga „Przejdź do edycji”.';
    refreshAll(); renderList();
    emit('clinic:saved', { fields: { ...record.fields }, visitNo: record.number });
    return true;
  }
  function discardEditing() {
    const wasNew = state.current.id === null;
    closeEditor(); undoStack.length = 0;
    if (wasNew) { const last = state.visits.filter(v => v.patient === state.current.patient).sort((a, b) => b.occurred.localeCompare(a.occurred))[0] || null; state.loaded = last; state.current = last ? { id: last.id, patient: last.patient, meta: metaFromVisit(last), fields: { ...last.fields } } : newDraft(state.current.patient, { empty: true }); state.mode = 'history'; }
    else { state.current = { id: state.loaded.id, patient: state.loaded.patient, meta: metaFromVisit(state.loaded), fields: { ...state.loaded.fields } }; state.mode = 'saved'; }
    statusText = 'Anulowano edycję. Nie zapisano zmian.'; refreshAll(); announce(null, 'cancel');
  }
  function requestCancel() {
    if (!writable() && !editorWindow) return;
    if (writable() && dirty()) confirmDialog('Odrzucić zmiany?', 'Odrzucić niezapisane zmiany tej wizyty? Zapisane dane pozostaną bez zmian.', 'Odrzuć zmiany', discardEditing);
    else discardEditing();
  }
  function closeSavedView() { state.mode = 'history'; statusText = ''; refreshAll(); }
  function newVisit(patient = state.current.patient) {
    const begin = () => metaDialog(true, patient);
    if (writable() && editorWindow && dirty()) confirmDialog('Nowa wizyta', 'Otwarcie nowej wizyty odrzuci bieżący bufor edycji. Kontynuować?', 'Kontynuuj', () => { closeEditor(); begin(); });
    else begin();
  }
  function activateVisit(id, editAfter = false) {
    const v = state.visits.find(row => row.id === id); if (!v) return;
    const go = () => { closeEditor(); state.loaded = v; state.current = { id: v.id, patient: v.patient, meta: metaFromVisit(v), fields: { ...v.fields } }; state.mode = 'saved'; statusText = ''; undoStack.length = 0; refreshAll(); open(); announce(null, 'switch'); if (editAfter) startEditing(); };
    if (writable() && editorWindow && dirty()) confirmDialog('Zmiana wizyty', 'Zmiana wizyty odrzuci bieżący bufor edycji. Kontynuować?', 'Kontynuuj', go); else go();
  }
  function syncMetaInputs() {
    if (!mainRoot || !writable()) return;
    mainRoot.querySelectorAll('[data-meta]').forEach(input => {
      const key = input.dataset.meta; let value = input.value.trim();
      if (key === 'date' && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) value = `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`;
      state.current.meta[key] = key === 'weight' || key === 'temperature' ? value.replace(',', '.') : value;
    });
  }

  /* ---------------------------------------------------------------- dialogs */
  function dialog(id, title, width, height, body, footer) {
    Shell.windows?.get(`clinic-${id}`)?.close();
    const host = document.createElement('div'); host.className = 'clinic-dialog';
    host.innerHTML = `<div class="clinic-dialog-body">${body}</div><div class="clinic-dialog-footer">${footer || '<button class="clinic-button" data-dialog-close>Zamknij</button>'}</div>`;
    const win = Shell.createWindow({ id: `clinic-${id}`, title, icon: 'clinic', width, height, minWidth: Math.min(width, 340), minHeight: Math.min(height, 220), x: Math.max(12, (innerWidth - width) / 2), y: Math.max(18, (innerHeight - height) / 2 - 30), className: 'clinic-dialog-window', content: host, resizable: false, maximizable: false, taskbar: false, owner: 'clinic' });
    host.querySelectorAll('[data-dialog-close]').forEach(el => el.addEventListener('click', () => win.close()));
    return { win, host };
  }
  function info(title, message) { dialog('info', title, 440, 230, `<h2>${esc(title)}</h2><p>${esc(message)}</p>`, '<button class="clinic-button primary" data-dialog-close>OK</button>'); }
  function confirmDialog(title, message, button, action) {
    const d = dialog('confirm', title, 440, 230, `<h2>${esc(title)}</h2><p>${esc(message)}</p>`, `<button class="clinic-button primary" data-confirm>${esc(button)}</button><button class="clinic-button" data-dialog-close>Anuluj</button>`);
    d.host.querySelector('[data-confirm]').onclick = () => { d.win.close(); action(); };
  }
  function metaDialog(isNew, patient = state.current.patient) {
    if (!isNew && !writable()) { const m = state.current.meta; info('Dane wybranej wizyty', `${displayDate(m.date)} ${m.time} · ${m.type} · Nr ${m.number} · Lekarz: ${m.doctor}. Wizyta jest w trybie tylko do odczytu.`); return; }
    syncMetaInputs();
    const m = isNew ? newDraft(patient, { empty: true }).meta : state.current.meta;
    const fields = [['date', 'Data', 'date', m.date], ['time', 'Godzina (HH:MM)', 'text', m.time], ['type', 'Typ wizyty', 'select', m.type], ['doctor', 'Lekarz', 'text', m.doctor], ['number', 'Numer', 'text', isNew ? '<NOWY>' : m.number], ['weight', 'Waga (kg)', 'text', m.weight], ['temperature', 'Temperatura (°C)', 'text', m.temperature]];
    const html = fields.map(([name, label, type, value]) => `<label class="clinic-form-field">${esc(label)}${type === 'select' ? `<select name="${name}">${VISIT_TYPES.map(t => `<option ${t === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : `<input name="${name}" type="${type}" value="${esc(value)}" ${name === 'number' && isNew ? 'readonly' : ''}>`}</label>`).join('');
    const d = dialog('meta', isNew ? '[DEMO] Nowa wizyta — dane' : '[DEMO] Dane bieżącej wizyty', 520, 430, `<form id="clinic-meta-form"><p class="clinic-subtle-message">${esc(patientOf(patient).name)} · ${esc(patientOf(patient).owner)}</p><div class="clinic-form-grid">${html}</div><p class="clinic-form-error" data-meta-error role="alert"></p></form>`, `<button class="clinic-button primary" type="submit" form="clinic-meta-form">OK</button><button class="clinic-button" data-dialog-close>Anuluj</button>`);
    d.host.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target)); data.weight = (data.weight || '').replace(',', '.'); data.temperature = (data.temperature || '').replace(',', '.');
      const meta = { ...m, ...data, number: isNew ? '' : (data.number || m.number) };
      if (!metaValid(meta)) { d.host.querySelector('[data-meta-error]').textContent = 'Sprawdź datę, godzinę, typ i lekarza. Waga / temperatura: liczba bez jednostki albo puste pole.'; return; }
      d.win.close();
      if (isNew) { closeEditor(); state.current = { ...newDraft(patient, { empty: true }), meta }; state.loaded = null; state.mode = 'new'; undoStack.length = 0; statusText = ''; state.activeField = 'wywiad'; refreshAll(); openEditor(); announce(null, 'new'); }
      else { state.current.meta = meta; statusText = 'Zmieniono dane w buforze. OK zapisuje całą wizytę.'; refreshAll(); }
    });
    setTimeout(() => d.host.querySelector('input:not([readonly]),select')?.focus(), 80);
  }
  /* Section tools are Klinika XP features the mock-up does not reproduce: manual text only (kxp_mock.c open_text_workbench). */
  function sectionWorkbench(tool, key, heading) {
    const names = { Mowa: 'Mowa — tekst wpisany ręcznie, bez mikrofonu', Zredaguj: 'Zredaguj — ręczna redakcja, bez AI', Typowe: 'Typowe — własny tekst sekcji', 'Poziom bólu': 'Poziom bólu — wpis użytkownika, bez automatycznej oceny', Objawy: 'Objawy — tekst potwierdzony przez użytkownika', Wybierz: 'Diagnoza — wpis ręczny zamiast nieodtworzonego słownika chorób', Choroby: 'Diagnoza — wpis ręczny zamiast nieodtworzonego słownika chorób', 'Diagnoza AI': 'Diagnoza AI — narzędzie Kliniki XP, w makiecie bez AI', Porady: 'Porady — wpis ręczny, brak generatora zaleceń' };
    const d = dialog('workbench', `[DEMO] ${heading || names[tool] || tool}`, 560, 340, `<p class="clinic-subtle-message">To narzędzie Kliniki XP nie jest odwzorowane w makiecie. Tekst wpisany poniżej zostanie dopisany do sekcji „${esc(LABELS[key])}”. Dyktowanie z OpisAI uruchamiasz przytrzymaniem bąbelka.</p><label class="clinic-form-field full">Tekst do dopisania<textarea data-workbench-text rows="6"></textarea></label><p class="clinic-form-error" data-workbench-error role="alert"></p>`, '<button class="clinic-button primary" data-workbench-ok>Dopisz</button><button class="clinic-button" data-dialog-close>Anuluj</button>');
    const area = d.host.querySelector('[data-workbench-text]'); setTimeout(() => area.focus(), 80);
    d.host.querySelector('[data-workbench-ok]').onclick = () => {
      const text = area.value.trim(); if (!text) { d.host.querySelector('[data-workbench-error]').textContent = 'Wpisz tekst do dopisania albo wybierz Anuluj.'; return; }
      const before = state.current.fields[key]; d.win.close();
      setFields({ [key]: before.trim() ? `${before.trimEnd()} ${text}` : text }, { expected: { [key]: before }, source: 'section-tool' }); focusField(key);
    };
  }
  function photoInfo() { info('Zdjęcie zwierzęcia', 'Makieta nie zawiera zdjęć pacjentów. W Klinice XP w tym miejscu jest zdjęcie z karty zwierzęcia.'); }
  function notReproduced(name) { info(name, `Moduł „${name}” nie jest odwzorowany w makiecie. Demonstracja obejmuje przebieg wizyty, opis w podoknie i listę wizyt.`); }
  function aboutMock() { dialog('about', 'O makiecie Kliniki XP', 470, 300, `<div class="kxp-about">${kx('caseVisit', 40)}<div><h2>Makieta Kliniki XP</h2><p>Niezależna rekonstrukcja układu okna wizyty do pokazania pracy z OpisAI. Nie jest produktem BRI ani kompletną Kliniką XP.</p><p>Odwzorowane: przebieg wizyty, osobne podokno opisu (F2), nowa wizyta (F4), przegląd zapisanej wizyty i lista wizyt (Ctrl+L). Dane są fikcyjne i zostają w tej przeglądarce.</p></div></div>`); }

  /* ---------------------------------------------------------------- visit list (Ctrl+L) */
  let listFilter = { owner: '', animal: '', text: '' }, listSelected = null;
  const fold = text => String(text || '').toLocaleLowerCase('pl');
  function listRows() {
    return state.visits.filter(v => { const p = patientOf(v.patient); return fold(p.owner).includes(fold(listFilter.owner)) && fold(p.name + ' ' + p.species).includes(fold(listFilter.animal)) && (!listFilter.text || fold([v.number, v.type, v.doctor, ...KEYS.map(k => v.fields[k])].join(' ')).includes(fold(listFilter.text))); }).sort((a, b) => b.occurred.localeCompare(a.occurred));
  }
  function renderList() {
    if (!listRoot) return;
    const rows = listRows(); if (!rows.some(v => v.id === listSelected)) listSelected = rows[0]?.id || null;
    const sel = state.visits.find(v => v.id === listSelected), p = sel ? patientOf(sel.patient) : null;
    listRoot.querySelector('[data-list-rows]').innerHTML = rows.map(v => { const q = patientOf(v.patient); return `<tr data-list-row="${esc(v.id)}" class="${v.id === listSelected ? 'is-selected' : ''}" tabindex="0"><td>${esc(displayDate(v.occurred))} ${esc(v.occurred.slice(11, 16))}</td><td>${esc(v.type)}</td><td>${esc(v.number)}</td><td>${esc(q.name)}</td><td>${esc(q.owner)}</td><td>${esc(v.doctor)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="clinic-empty-cell">Brak wizyt spełniających warunki.</td></tr>';
    listRoot.querySelector('[data-list-owner]').textContent = p ? `WŁAŚCICIEL\n${p.owner}\n${p.address}` : 'WŁAŚCICIEL\n—';
    listRoot.querySelector('[data-list-animal]').textContent = p ? `ZWIERZĘ\n${p.name}\n${p.species}` : 'ZWIERZĘ\n—';
    listRoot.querySelector('[data-list-summary]').textContent = sel ? KEYS.filter(k => sel.fields[k]).map(k => `${LABELS[k]}: ${sel.fields[k]}`).join('\n\n') : '';
    listRoot.querySelectorAll('[data-list-action]').forEach(b => { b.disabled = !sel && b.dataset.listAction !== 'new'; });
    listRoot.querySelector('[data-list-count]').textContent = `${rows.length} ${plural(rows.length, 'wizyta', 'wizyty', 'wizyt')}`;
  }
  function openList(patientFilter) {
    if (patientFilter) { const p = patientOf(patientFilter); listFilter = { owner: '', animal: p.name, text: '' }; }
    if (listWindow && listRoot && document.contains(listRoot)) { listWindow.show(); listWindow.focus(); if (patientFilter) { listRoot.querySelector('[name=animal]').value = listFilter.animal; renderList(); } return; }
    listRoot = document.createElement('div'); listRoot.className = 'kxp-list';
    listRoot.innerHTML = `<form class="kxp-list-filter" data-list-filter><label>Właściciel<input name="owner" value="${esc(listFilter.owner)}"></label><label>Zwierzę<input name="animal" value="${esc(listFilter.animal)}"></label><label>Tekst<input name="text" value="${esc(listFilter.text)}" placeholder="numer, typ, opis…"></label><button class="clinic-button primary" type="submit">${kx('search', 16)}Szukaj</button><button class="clinic-button" type="button" data-list-clear>Wyczyść</button><span class="kxp-list-count" data-list-count></span></form>
      <div class="kxp-list-body"><div class="kxp-list-table"><table class="clinic-data-table"><thead><tr><th>Data</th><th>Typ</th><th>Nr</th><th>Zwierzę</th><th>Właściciel</th><th>Lekarz</th></tr></thead><tbody data-list-rows></tbody></table></div>
      <aside class="kxp-list-details"><pre data-list-owner></pre><pre data-list-animal></pre><pre class="kxp-list-summary" data-list-summary></pre></aside></div>
      <div class="clinic-dialog-footer"><button class="clinic-button primary" data-list-action="review">Przegląd — tylko do odczytu</button><button class="clinic-button" data-list-action="edit">Przejdź do edycji (F2)</button><button class="clinic-button" data-list-action="new">Nowa wizyta (F4)</button><button class="clinic-button" data-list-close>Zamknij</button></div>`;
    const width = Math.min(1080, innerWidth - 60), height = Math.min(620, innerHeight - 110);
    listWindow = Shell.createWindow({ id: 'clinic-list', title: LIST_TITLE, icon: 'clinic', width, height, minWidth: 560, minHeight: 360, className: 'kxp-list-window', content: listRoot, resizable: true, maximizable: true, taskbar: true, owner: 'clinic', onClose: () => { listWindow = null; listRoot = null; } });
    listRoot.addEventListener('submit', event => { event.preventDefault(); listFilter = Object.fromEntries(new FormData(event.target)); renderList(); });
    listRoot.addEventListener('click', event => {
      const row = event.target.closest('[data-list-row]'); if (row) { listSelected = row.dataset.listRow; renderList(); return; }
      if (event.target.closest('[data-list-clear]')) { listFilter = { owner: '', animal: '', text: '' }; listRoot.querySelectorAll('.kxp-list-filter input').forEach(i => { i.value = ''; }); renderList(); return; }
      if (event.target.closest('[data-list-close]')) { listWindow?.close(); return; }
      const action = event.target.closest('[data-list-action]')?.dataset.listAction;
      if (action === 'new') { const sel = state.visits.find(v => v.id === listSelected); newVisit(sel ? sel.patient : state.current.patient); }
      else if (action && listSelected) activateVisit(listSelected, action === 'edit');
    });
    listRoot.addEventListener('dblclick', event => { const row = event.target.closest('[data-list-row]'); if (row) activateVisit(row.dataset.listRow); });
    listRoot.addEventListener('keydown', event => { const row = event.target.closest('[data-list-row]'); if (row && event.key === 'Enter') activateVisit(row.dataset.listRow); });
    renderList();
  }

  /* ---------------------------------------------------------------- menus and commands */
  function visitMenu(x, y) {
    Shell.menu([
      { label: 'Wizyty — lista i szczegóły', icon: 'list', shortcut: 'Ctrl+L', onClick: () => openList() },
      { label: 'Nowa wizyta', icon: 'plus', shortcut: 'F4', onClick: () => newVisit() },
      { label: 'Przegląd zapisanej wizyty — TYLKO DO ODCZYTU', icon: 'view', disabled: !state.loaded || state.mode === 'saved', onClick: () => state.loaded && activateVisit(state.loaded.id) },
      { label: 'Przejdź do edycji / opis', icon: 'edit', shortcut: 'F2', onClick: startEditing },
      { separator: true },
      { label: 'Dane bieżącej wizyty…', icon: 'document', onClick: () => metaDialog(false) },
      { label: 'Przywróć przykładowe dane…', icon: 'refresh', onClick: () => confirmDialog('Przywróć przykładowe dane', 'Wizyty, opis i ustawienia makiety zostaną zastąpione początkowym przykładem.', 'Przywróć', () => { reset(); toast('Przywrócono przykładową wizytę.'); }) }
    ], x, y);
  }
  function editMenu(x, y) {
    const key = state.activeField;
    Shell.menu([
      { label: 'Cofnij', icon: 'undo', shortcut: 'Ctrl+Z', disabled: !undoStack.length, onClick: undoVisit },
      { separator: true },
      { label: 'Wytnij', icon: 'cut', shortcut: 'Ctrl+X', onClick: () => { focusField(key); document.execCommand('cut'); } },
      { label: 'Kopiuj', icon: 'copy', shortcut: 'Ctrl+C', onClick: copySelection },
      { label: 'Wklej', icon: 'paste', shortcut: 'Ctrl+V', onClick: pasteText },
      { separator: true },
      { label: 'Zaznacz wszystko', shortcut: 'Ctrl+A', onClick: selectAllText }
    ], x, y);
  }
  async function copySelection() { const selection = window.getSelection()?.toString() || state.current.fields[state.activeField]; try { await navigator.clipboard.writeText(selection); toast('Skopiowano tekst.'); } catch (_) { document.execCommand('copy'); } }
  async function pasteText() { try { const text = await navigator.clipboard.readText(); focusField(state.activeField); document.execCommand('insertText', false, text); } catch (_) { toast('Użyj Ctrl+V, aby wkleić tekst do wybranego pola.'); focusField(state.activeField); } }
  function selectAllText() { if (!focusField(state.activeField)) return; const r = document.createRange(); r.selectNodeContents(fieldElement(state.activeField)); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
  function command(id, event) {
    const at = event?.target?.closest('button')?.getBoundingClientRect(), x = at ? at.left : event?.clientX, y = at ? at.bottom : event?.clientY;
    switch (id) {
      case 'extra': case 'ops': visitMenu(x, y); break;
      case 'print': info('Wydruki', 'Makieta nie drukuje dokumentów. Tekst wizyty można skopiować z opisu lub z przeglądu (Ctrl+C).'); break;
      case 'save': if (!editorWindow) openEditor(); saveVisit(); break;
      case 'hold': holdEditor(); break;
      case 'cancel': requestCancel(); break;
      case 'edit': startEditing(); break;
      case 'close-view': closeSavedView(); break;
      case 'meta': metaDialog(false); break;
      case 'photo': photoInfo(); break;
      case 'patient-list': openList(state.current.patient); break;
      case 'list': openList(); break;
      case 'next': startEditing(); break;
      case 'history-order': Shell.menu([{ label: 'Od najnowszych', checked: !state.historyAscending, onClick: () => { state.historyAscending = false; refreshAll(); } }, { label: 'Od najstarszych', checked: state.historyAscending, onClick: () => { state.historyAscending = true; refreshAll(); } }], x, y); break;
      default: break;
    }
  }
  function sideCommand(id) {
    if (id === 'start') { setStatus(''); mainRoot.querySelector('.kxp-history')?.focus(); return; }
    if (id === 'visit') { if (state.mode === 'saved') return; if (state.mode === 'history' && state.loaded) activateVisit(state.loaded.id); else startEditing(); return; }
    if (id === 'next') { openList(); return; }
    notReproduced({ treatment: 'Leczenie', billing: 'Rozliczenie', media: 'Multimedia' }[id]);
  }
  function stepCommand(i) {
    if (i === 8) { requestCancel(); return; }
    startEditing();
    if (i >= 1 && i <= 6 && editorWindow) sectionWorkbench(STEPS[i][0], 'badanie', `${STEPS[i][0].replace(/^\d+\. /, '')} — moduł Kliniki XP nieodwzorowany; ręczny tekst do badania`);
  }
  function bindMain() {
    mainRoot.addEventListener('click', event => {
      const menu = event.target.closest('[data-menu]');
      if (menu) { const i = Number(menu.dataset.menu), r = menu.getBoundingClientRect(); if (i === 4) openList(); else if (i === 13) aboutMock(); else if (!DISABLED_MENUS.has(i)) visitMenu(r.left, r.bottom); return; }
      const side = event.target.closest('[data-side]'); if (side) { sideCommand(side.dataset.side); return; }
      const step = event.target.closest('[data-step]'); if (step) { stepCommand(Number(step.dataset.step)); return; }
      const visit = event.target.closest('[data-visit]'); if (visit && event.detail === 2) { activateVisit(visit.dataset.visit); return; }
      const action = event.target.closest('[data-kxp]'); if (action && action.dataset.kxp !== 'history-all') command(action.dataset.kxp, event);
    });
    mainRoot.addEventListener('change', event => {
      if (event.target.matches('[data-kxp="history-all"]')) { state.historyAll = event.target.checked; refreshAll(); return; }
      if (event.target.matches('[data-meta]')) { syncMetaInputs(); if (!metaValid(state.current.meta)) setStatus('Nieprawidłowe dane pomiaru / daty. Popraw je przed zapisaniem.'); else { statusText = 'Zmieniono dane w buforze. OK zapisuje całą wizytę.'; setStatus(statusText); } persist(); renderEditorChrome(); }
    });
    mainRoot.addEventListener('contextmenu', event => { if (event.target.closest('input')) return; event.preventDefault(); visitMenu(event.clientX, event.clientY); });
  }
  function bindEditor() {
    editorRoot.addEventListener('click', event => {
      const title = event.target.closest('[data-focus]'); if (title) { focusField(title.dataset.focus); return; }
      const tool = event.target.closest('[data-tool]'); if (!tool) return;
      const key = tool.dataset.sectionKey, name = tool.dataset.tool;
      state.activeField = key;
      if (name === 'ok') saveVisit(); else if (name === 'cancel') requestCancel();
      else if (name === 'menu' || name === 'Dodatkowe') { const r = tool.getBoundingClientRect(); editMenu(r.left, r.bottom); }
      else sectionWorkbench(name, key);
    });
    editorRoot.addEventListener('input', event => {
      const el = event.target.closest('[data-clinic-field]'); if (!el || !writable()) return;
      const key = el.dataset.clinicField, value = el.innerText.replace(/\r\n/g, '\n').replace(/ /g, ' '), before = getFields();
      if (state.current.fields[key] === value) return;
      state.current.fields[key] = value; pushUndo(before, getFields()); persist(); renderEditorChrome(); announce(key, 'manual'); dismissSpelling();
      clearTimeout(editTimers.get(key)); editTimers.set(key, setTimeout(() => renderField(key, true), 650));
    });
    editorRoot.addEventListener('compositionstart', event => { const key = event.target.closest('[data-clinic-field]')?.dataset.clinicField; if (key) composing.add(key); });
    editorRoot.addEventListener('compositionend', event => { const key = event.target.closest('[data-clinic-field]')?.dataset.clinicField; if (key) { composing.delete(key); setTimeout(() => renderField(key, true), 100); } });
    editorRoot.addEventListener('focusin', event => { const key = event.target.closest('[data-clinic-field]')?.dataset.clinicField; if (key) { state.activeField = key; renderEditorChrome(); emit('clinic:focus', { field: key, fields: getFields() }); } });
    editorRoot.addEventListener('paste', event => { if (!event.target.closest('[data-clinic-field]')) return; event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); });
    editorRoot.addEventListener('contextmenu', event => { const field = event.target.closest('[data-clinic-field]'); if (field) { event.preventDefault(); state.activeField = field.dataset.clinicField; editMenu(event.clientX, event.clientY); } });
    editorRoot.addEventListener('pointerover', event => { const mark = event.target.closest('.clinic-spell'); if (!mark || popupPinned) return; clearTimeout(hideTimer); clearTimeout(hoverTimer); hoverTimer = setTimeout(() => showSpelling(mark, mark.closest('[data-clinic-field]').dataset.clinicField), 380); });
    editorRoot.addEventListener('pointerout', event => { if (event.target.closest('.clinic-spell') && !popupPinned) { clearTimeout(hoverTimer); hideTimer = setTimeout(dismissSpelling, 240); } });
    editorRoot.addEventListener('pointerdown', event => {
      const mark = event.target.closest('.clinic-spell'); if (mark && event.button === 0) { event.preventDefault(); showSpelling(mark, mark.closest('[data-clinic-field]').dataset.clinicField, true); return; }
      const split = event.target.closest('[data-splitter]'); if (split) dragSplitter(event, Number(split.dataset.splitter));
    });
    editorRoot.addEventListener('scroll', () => { if (spellPopup) dismissSpelling(); }, true);
    editorRoot.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z' && event.target.closest('[data-clinic-field]')) { event.preventDefault(); undoVisit(); } });
  }
  function dragSplitter(event, index) {
    event.preventDefault();
    const sections = [...editorRoot.querySelectorAll('.kxp-section')], a = sections[index], b = sections[index + 1];
    const startY = event.clientY, ha = a.getBoundingClientRect().height, hb = b.getBoundingClientRect().height, total = state.weights[index] + state.weights[index + 1];
    const move = e => { const dy = Math.max(-ha + 70, Math.min(hb - 70, e.clientY - startY)), na = ha + dy, nb = hb - dy; state.weights[index] = Math.round(total * na / (na + nb)); state.weights[index + 1] = total - state.weights[index]; const sum = state.weights.reduce((x, y) => x + y, 0); sections.forEach((s, i) => { s.style.flex = `${state.weights[i] / sum} 1 0`; }); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); persist(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }

  /* ---------------------------------------------------------------- OpisAI-facing API */
  function focusField(key) {
    if (!KEYS.includes(key) || !editorVisible()) return false;
    editorWindow.show(); state.activeField = key;
    const el = fieldElement(key); el.focus(); renderEditorChrome();
    emit('clinic:focus', { field: key, fields: getFields() });
    return true;
  }
  function setFields(fields, options = {}) {
    if (!editorVisible() || !writable()) return { ok: false, reason: NO_EDITOR };
    const expected = options.expected;
    if (expected && KEYS.some(key => Object.prototype.hasOwnProperty.call(expected, key) && String(expected[key]) !== state.current.fields[key])) return { ok: false, reason: 'Treść wizyty zmieniła się od ostatniego odczytu. Odczytaj pola ponownie przed wpisaniem.' };
    if (!fields || KEYS.some(key => key in fields && typeof fields[key] !== 'string')) return { ok: false, reason: 'Nieprawidłowa treść pól wizyty.' };
    const before = getFields(), changed = KEYS.filter(key => key in fields && fields[key] !== state.current.fields[key]);
    if (!changed.length) return { ok: true, reason: 'Treść jest już aktualna.' };
    changed.forEach(key => { state.current.fields[key] = fields[key]; clearTimeout(editTimers.get(key)); });
    if (options.source !== 'undo') pushUndo(before, getFields());
    dismissSpelling();
    changed.forEach(key => { renderField(key); const wrap = fieldElement(key)?.closest('.kxp-section'); wrap?.classList.remove('just-applied'); requestAnimationFrame(() => wrap?.classList.add('just-applied')); setTimeout(() => wrap?.classList.remove('just-applied'), 1300); });
    persist(); renderEditorChrome(); announce(changed.length === 1 ? changed[0] : null, options.source || 'external');
    return { ok: true, reason: 'Wpisano treść do pól wizyty.' };
  }
  function undoVisit() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return toast('Brak zmian do cofnięcia.');
    if (KEYS.some(key => state.current.fields[key] !== entry.after[key])) return toast('Nie można cofnąć zmiany: treść wizyty została zmodyfikowana.');
    undoStack.pop(); setFields(entry.before, { expected: entry.after, source: 'undo' }); toast('Cofnięto ostatnią zmianę.');
  }
  function setSpellingEnabled(enabled) { state.spelling = !!enabled; dismissSpelling(); KEYS.forEach(key => renderField(key, true)); persist(); emit('clinic:spelling', { enabled: state.spelling }); }
  function markTarget(key, enabled = true) { editorRoot?.querySelectorAll('.kxp-section').forEach(el => el.classList.toggle('is-target', enabled && el.dataset.section === key)); }
  function reset() {
    const settings = { spelling: state.spelling };
    closeEditor(); listWindow?.close();
    state = { ...initialState(), ...settings }; undoStack.length = 0; lastCorrection = null; statusText = ''; dismissSpelling();
    try { localStorage.removeItem('opisai.demo.visit.v2'); } catch (_) {}
    persist();
    if (mainRoot) renderMain();
    openEditor();
    announce(null, 'reset'); emit('clinic:focus', { field: state.activeField, fields: getFields() });
    return getFields();
  }
  function context() { const p = patientOf(state.current.patient); return { editorOpen: editorVisible(), writable: writable() && editorVisible(), mode: state.mode, title: SUB_TITLE, mainTitle: state.mode === 'saved' ? REVIEW_TITLE : MAIN_TITLE, patient: p.name, owner: p.owner, visitNumber: state.current.id === null ? '<NOWY>' : state.current.meta.number, message: NO_EDITOR }; }

  /* ---------------------------------------------------------------- spelling card (OpisAI overlay) */
  function dismissSpelling() { clearTimeout(hoverTimer); clearTimeout(hideTimer); spellPopup?.remove(); spellPopup = null; popupPinned = false; }
  function showSpelling(mark, key, pinned = false) {
    if (!document.contains(mark) || !state.spelling) return;
    dismissSpelling(); popupPinned = pinned;
    const kind = mark.dataset.kind, word = mark.dataset.word, replacement = mark.dataset.replacement, start = Number(mark.dataset.start);
    const popup = document.createElement('div'); popup.className = 'clinic-spell-popover'; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Podpowiedź pisowni');
    const title = kind === 'unknown' ? 'Nieznane słowo' : kind === 'repeat' ? 'Powtórzone słowo' : 'Literówka';
    popup.innerHTML = `<div class="clinic-spell-popover-header ${kind}">${icon('document', 14)}${title}<button class="clinic-spell-close" data-spell-close aria-label="Zamknij podpowiedź">${icon('close', 13)}</button></div><div class="clinic-spell-explanation">${kind === 'unknown' ? 'Może to być nazwa własna lub termin specjalistyczny.' : kind === 'repeat' ? 'To słowo występuje dwa razy obok siebie.' : 'Proponowana poprawka pisowni'}</div>${kind !== 'unknown' ? `<button class="clinic-spell-suggestion" data-spell-fix><s>${esc(word)}</s>${icon('arrowRight', 14)}<b>${esc(replacement || 'Usuń powtórzenie')}</b></button>` : `<div style="padding:0 12px 10px;font-size:14px">${esc(word)}</div>`}<div class="clinic-spell-actions"><button class="clinic-spell-action" data-spell-ignore>${icon('check', 13)}${kind === 'unknown' ? 'Dodaj do słownika' : 'Pomiń słowo'}</button>${lastCorrection ? `<button class="clinic-spell-action" data-spell-undo>${icon('undo', 13)}Cofnij poprawkę</button>` : ''}</div><div class="clinic-spell-source">OpisAI · lokalne podpowiedzi demonstracyjne</div>`;
    document.body.appendChild(popup); spellPopup = popup;
    const rect = mark.getBoundingClientRect(), pr = popup.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - pr.width - 8)) + 'px';
    popup.style.top = (rect.bottom + 8 + pr.height < innerHeight - 55 ? rect.bottom + 8 : Math.max(8, rect.top - pr.height - 8)) + 'px';
    popup.addEventListener('pointerenter', () => clearTimeout(hideTimer)); popup.addEventListener('pointerleave', () => { if (!popupPinned) hideTimer = setTimeout(dismissSpelling, 220); });
    popup.querySelector('[data-spell-close]').onclick = dismissSpelling;
    popup.querySelector('[data-spell-ignore]').onclick = () => { state.ignoredWords.push(word.toLocaleLowerCase('pl')); persist(); dismissSpelling(); KEYS.forEach(k => renderField(k, true)); };
    popup.querySelector('[data-spell-fix]')?.addEventListener('click', () => {
      const before = state.current.fields[key]; if (before.slice(start, start + word.length) !== word) { dismissSpelling(); return; }
      let end = start + word.length; if (kind === 'repeat' && before[end] === ' ') end++;
      const after = before.slice(0, start) + replacement + before.slice(end);
      lastCorrection = { key, before, after }; setFields({ [key]: after }, { expected: { [key]: before }, source: 'spelling' }); dismissSpelling(); focusField(key); restoreSelection(fieldElement(key), { start: start + replacement.length, end: start + replacement.length }); toast('Poprawiono pisownię.');
    });
    popup.querySelector('[data-spell-undo]')?.addEventListener('click', () => { const c = lastCorrection; if (!c) return; const result = setFields({ [c.key]: c.before }, { expected: { [c.key]: c.after }, source: 'spelling-undo' }); if (result.ok) { lastCorrection = null; toast('Cofnięto poprawkę pisowni.'); } else toast('Pole zmieniło się po poprawce. Użyj polecenia Cofnij.'); dismissSpelling(); });
  }

  /* ---------------------------------------------------------------- window lifecycle */
  function open() {
    if (mainWindow && document.contains(mainWindow.el)) { mainWindow.show(); mainWindow.focus(); return mainWindow; }
    mainRoot = document.createElement('div'); mainRoot.className = 'kxp-app';
    const width = Math.max(360, Math.min(1214, innerWidth - 40)), height = Math.max(380, Math.min(800, innerHeight - 70));
    mainWindow = Shell.createWindow({ id: 'clinic', title: MAIN_TITLE, icon: 'clinic', width, height, minWidth: 600, minHeight: 360, x: innerWidth < 900 ? 8 : 16, y: innerHeight < 600 ? 8 : 12, className: 'kxp-window', content: mainRoot, resizable: true, maximizable: true, taskbar: true, onClose: () => { if (writable() && editorWindow && dirty()) { confirmDialog('Zamknąć Klinikę?', 'Odrzucić niezapisane zmiany tej wizyty?', 'Odrzuć i zamknij', () => { discardEditing(); mainWindow?.close(); }); return false; } closeEditor(); dismissSpelling(); mainWindow = null; mainRoot = null; emit('clinic:editor', { open: false, mode: state.mode }); return true; } });
    renderMain(); bindMain(); return mainWindow;
  }
  function onKey(event) {
    const id = Shell.activeWindow?.id || '';
    if (!id.startsWith('clinic')) return;
    if (event.key === 'F2') { event.preventDefault(); startEditing(); }
    else if (event.key === 'F4') { event.preventDefault(); newVisit(); }
    else if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'l') { event.preventDefault(); openList(); }
  }
  window.Clinic = { open, openEditor: startEditing, isEditorOpen: editorVisible, getContext: context, getFields, setFields, focusField, getActiveField: () => state.activeField, setSpellingEnabled, reset, markTarget, undo: undoVisit, getDefaultFields: () => ({ ...DEFAULT_FIELDS }), getSpellingEnabled: () => state.spelling };
  document.addEventListener('pointerdown', event => { if (spellPopup && !spellPopup.contains(event.target) && !event.target.closest('.clinic-spell')) dismissSpelling(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && spellPopup) { dismissSpelling(); event.stopPropagation(); } }, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', dismissSpelling);
  function init() {
    Shell.registerApp({ id: 'clinic', title: 'Klinika XP', icon: 'clinic', open });
    open();
    if (state.editorOpen && writable()) openEditor();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
