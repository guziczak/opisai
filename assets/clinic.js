/* Klinika XP: a local, editable demonstration visit. No patient data leaves this page. */
(() => {
  'use strict';
  const STORAGE_KEY = 'opisai.demo.visit.v2';
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
  const DIAGNOSES = [
    ['Rozpoznanie wstępne', 'Podejrzenie mykoplazmozy układu oddechowego (MRM)'],
    ['Rozpoznanie wstępne', 'Zakażenie dróg oddechowych'],
    ['Objaw', 'Kichanie i świszczący oddech'],
    ['Objaw', 'Obniżony apetyt'],
    ['Objaw', 'Spadek masy ciała']
  ];
  const dateISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const datePL = value => { if (!value) return '—'; const d = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(+d) ? value : d.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' }); };
  const timePL = value => new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
  const initialState = () => ({ fields: { ...DEFAULT_FIELDS }, savedFields: { ...DEFAULT_FIELDS }, activeTab: 'exam', activeField: 'badanie', spelling: true, largeType: false, ignoredWords: [], visitNo: '2026/001248', visitDate: dateISO(), savedAt: null, owner: 'Marta Wiśniewska', ownerType: 'Osoba fizyczna', patient: 'Fistaszek', species: 'Szczur', breed: 'Odmiana hodowlana (fancy rat)', sex: 'Samiec', colour: 'Kapturowa, czarno-biała', weight: '420 g', prophylaxis: [], labs: [], followup: { date: '', reason: '', notes: '' }, history: [] });
  function loadState() {
    const base = initialState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || !saved.fields || KEYS.some(key => typeof saved.fields[key] !== 'string')) return base;
      return { ...base, ...saved, fields: { ...base.fields, ...saved.fields }, savedFields: { ...base.savedFields, ...(saved.savedFields || saved.fields) }, ignoredWords: Array.isArray(saved.ignoredWords) ? saved.ignoredWords : [], prophylaxis: Array.isArray(saved.prophylaxis) ? saved.prophylaxis : [], labs: Array.isArray(saved.labs) ? saved.labs : [], history: Array.isArray(saved.history) ? saved.history : [], followup: { ...base.followup, ...saved.followup } };
    } catch (_) { return base; }
  }
  let state = loadState();
  let mainWindow = null, appRoot = null, spellPopup = null, popupPinned = false, hoverTimer = null, hideTimer = null;
  let lastCorrection = null;
  const undoStack = [];
  const editTimers = new Map();
  const composing = new Set();
  const esc = text => window.Shell ? Shell.escape(String(text ?? '')) : String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 16) => window.Icons ? Icons.svg(name, size) : '';
  const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const getFields = () => ({ ...state.fields });
  const dirty = () => KEYS.some(key => state.fields[key] !== state.savedFields[key]);
  const words = text => (text.trim().match(/\S+/g) || []).length;
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  function announce(field, source) { emit('clinic:change', { field, fields: getFields(), source: source || 'manual' }); }
  function pushUndo(before, after) {
    if (KEYS.every(key => before[key] === after[key])) return;
    undoStack.push({ before: { ...before }, after: { ...after } });
    if (undoStack.length > 60) undoStack.shift();
  }
  function fieldElement(key) { return appRoot?.querySelector(`[data-clinic-field="${key}"]`) || null; }
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
  function spellingMarks(text) {
    const marks = [], tokens = [...text.matchAll(/[\p{L}]+(?:[-'][\p{L}]+)*/gu)];
    let previous = null;
    for (const token of tokens) {
      const word = token[0], lower = word.toLocaleLowerCase('pl'), start = token.index;
      if (state.ignoredWords.includes(lower)) { previous = token; continue; }
      if (previous && previous[0].toLocaleLowerCase('pl') === lower && /^\s+$/.test(text.slice(previous.index + previous[0].length, start))) marks.push({ start, word, kind: 'repeat', replacement: '' });
      else if (SPELLING[lower]) {
        let replacement = SPELLING[lower];
        if (word[0] === word[0].toLocaleUpperCase('pl')) replacement = replacement[0].toLocaleUpperCase('pl') + replacement.slice(1);
        else replacement = replacement[0].toLocaleLowerCase('pl') + replacement.slice(1);
        marks.push({ start, word, kind: 'typo', replacement });
      } else if (UNKNOWN_TERMS.has(lower)) marks.push({ start, word, kind: 'unknown', replacement: '' });
      previous = token;
    }
    return marks;
  }
  function renderField(key, preserve = false) {
    const el = fieldElement(key); if (!el || composing.has(key)) return;
    const text = state.fields[key], selected = preserve ? selectionOffsets(el) : null;
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
  function updateStatus() {
    if (!appRoot) return;
    const isDirty = dirty(), field = state.activeField;
    appRoot.querySelector('[data-clinic-status="save"]').textContent = isDirty ? 'Niezapisane zmiany' : state.savedAt ? `Zapisano o ${timePL(state.savedAt)}` : 'Wizyta otwarta';
    appRoot.querySelector('[data-clinic-status="save"]').classList.toggle('is-saved', !isDirty);
    appRoot.querySelector('[data-clinic-status="active"]').textContent = LABELS[field] || 'Gotowy';
    appRoot.querySelector('[data-clinic-status="words"]').textContent = `${words(state.fields[field] || '')} słów · ${(state.fields[field] || '').length} zn.`;
    const count = state.spelling ? KEYS.reduce((n, k) => n + spellingMarks(state.fields[k]).length, 0) : 0;
    appRoot.querySelector('[data-clinic-status="spelling"]').textContent = state.spelling ? `Pisownia: ${count ? count + (count===1?' uwaga':count<5?' uwagi':' uwag') : 'sprawdzona'}` : 'Pisownia wyłączona';
    appRoot.querySelector('[data-action="undo"]').disabled = !undoStack.length;
    for (const key of KEYS) {
      appRoot.querySelector(`[data-field-count="${key}"]`).textContent = `${words(state.fields[key])} słów`;
      fieldElement(key)?.closest('.clinic-field').classList.toggle('is-active', key === field);
    }
    mainWindow?.setTitle(`Klinika XP — Rejestracja wizyty: ${state.patient}${isDirty ? ' *' : ''}`);
  }
  function selectTab(tab) {
    const valid = ['exam', 'diagnosis', 'prophylaxis', 'diagnostics', 'followup'];
    state.activeTab = valid.includes(tab) ? tab : 'exam';
    if (appRoot) {
      appRoot.querySelectorAll('.clinic-tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.tab === state.activeTab)));
      appRoot.querySelectorAll('.clinic-page').forEach(el => { el.hidden = el.dataset.page !== state.activeTab; });
    }
    dismissSpelling(); persist();
  }
  function focusField(key) {
    if (!KEYS.includes(key)) return false;
    open(); selectTab('exam'); state.activeField = key;
    const el = fieldElement(key); el.focus(); updateStatus();
    emit('clinic:focus', { field: key, fields: getFields() });
    return true;
  }
  function setFields(fields, options = {}) {
    const expected = options.expected;
    if (expected && KEYS.some(key => Object.prototype.hasOwnProperty.call(expected, key) && String(expected[key]) !== state.fields[key])) return { ok: false, reason: 'Treść wizyty zmieniła się od ostatniego odczytu. Odczytaj pola ponownie przed wpisaniem.' };
    if (!fields || KEYS.some(key => key in fields && typeof fields[key] !== 'string')) return { ok: false, reason: 'Nieprawidłowa treść pól wizyty.' };
    open();
    const before = getFields(), changed = KEYS.filter(key => key in fields && fields[key] !== state.fields[key]);
    if (!changed.length) return { ok: true, reason: 'Treść jest już aktualna.' };
    changed.forEach(key => { state.fields[key] = fields[key]; clearTimeout(editTimers.get(key)); });
    if (options.source !== 'undo') pushUndo(before, getFields());
    selectTab('exam'); dismissSpelling();
    changed.forEach(key => { renderField(key); const wrap = fieldElement(key)?.closest('.clinic-field'); wrap?.classList.remove('just-applied'); requestAnimationFrame(() => wrap?.classList.add('just-applied')); setTimeout(() => wrap?.classList.remove('just-applied'), 1300); });
    persist(); updateStatus(); announce(changed.length === 1 ? changed[0] : null, options.source || 'external');
    return { ok: true, reason: 'Wpisano treść do pól wizyty.' };
  }
  function undoVisit() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return Shell.toast('Brak zmian do cofnięcia.');
    if (KEYS.some(key => state.fields[key] !== entry.after[key])) return Shell.toast('Nie można cofnąć zmiany: treść wizyty została zmodyfikowana.');
    undoStack.pop(); setFields(entry.before, { expected: entry.after, source: 'undo' }); updateStatus(); Shell.toast('Cofnięto ostatnią zmianę.');
  }
  function setSpellingEnabled(enabled) {
    state.spelling = !!enabled; dismissSpelling(); KEYS.forEach(key => renderField(key, true)); persist(); updateStatus();
    emit('clinic:spelling', { enabled: state.spelling });
  }
  function markTarget(key, enabled = true) {
    open();
    if (enabled && KEYS.includes(key)) selectTab('exam');
    appRoot.querySelectorAll('.clinic-field').forEach(el => el.classList.toggle('is-target', enabled && el.querySelector('[data-clinic-field]')?.dataset.clinicField === key));
  }
  function reset() {
    const settings = { spelling: state.spelling, largeType: state.largeType };
    state = { ...initialState(), ...settings }; undoStack.length = 0; lastCorrection = null; dismissSpelling(); persist();
    if (appRoot) renderMain();
    announce(null, 'reset'); emit('clinic:focus', { field: state.activeField, fields: getFields() });
    return getFields();
  }
  function summaryHTML() {
    return `<div class="clinic-summary">
      <fieldset class="clinic-group"><legend>Właściciel</legend><button class="clinic-edit-link" data-action="owner">Kartoteka</button><div class="clinic-person-name">${esc(state.owner)}</div><dl><div class="clinic-summary-line"><dt>Nr klienta</dt><dd>000284</dd></div><div class="clinic-summary-line"><dt>Typ</dt><dd>${esc(state.ownerType)}</dd></div><div class="clinic-summary-line"><dt>Kontakt</dt><dd>Dane demonstracyjne</dd></div></dl></fieldset>
      <fieldset class="clinic-group"><legend>Zwierzę / pacjent</legend><button class="clinic-edit-link" data-action="patient">Kartoteka</button><div class="clinic-person-name">${esc(state.patient)} <span style="font-size:10px;font-weight:400;color:#83909e">ID 012345678</span></div><dl><div class="clinic-summary-line"><dt>Gatunek</dt><dd title="${esc(state.breed)}">${esc(state.species)} · ${esc(state.breed)}</dd></div><div class="clinic-summary-line"><dt>Płeć / maść</dt><dd>${esc(state.sex)} / ${esc(state.colour)}</dd></div><div class="clinic-summary-line"><dt>Wiek / masa</dt><dd>1 rok 9 mies. / ${esc(state.weight)}</dd></div></dl></fieldset>
      <fieldset class="clinic-group clinic-encounter"><legend>Wizyta</legend><div class="clinic-visit-label">Numer dokumentu</div><div class="clinic-visit-value" data-visit-number>${esc(state.visitNo)}</div><div class="clinic-visit-label">${datePL(state.visitDate)} · Gabinet 1</div><div class="clinic-visit-doctor">lek. wet. Anna Nowak</div></fieldset>
    </div>`;
  }
  function renderMain() {
    if (!appRoot) return;
    appRoot.classList.toggle('large-type', state.largeType);
    appRoot.innerHTML = `
      <nav class="clinic-menubar" aria-label="Menu Kliniki XP">${[['visit','Wizyta'],['edit','Edycja'],['patient','Pacjent'],['tools','Narzędzia'],['help','Pomoc']].map(([id,label])=>`<button class="clinic-menu-button" data-menu="${id}">${label}</button>`).join('')}</nav>
      <div class="clinic-toolbar" role="toolbar" aria-label="Narzędzia wizyty">
        <button class="clinic-tool primary" data-action="save" title="Zapisz wizytę (Ctrl+S)">${icon('save',18)}<span>Zapisz wizytę</span></button>
        <button class="clinic-tool" data-action="new" title="Nowa wizyta (Ctrl+N)">${icon('plus',18)}<span>Nowa</span></button>
        <span class="clinic-tool-separator"></span><button class="clinic-tool" data-action="print" title="Podgląd wydruku (Ctrl+P)">${icon('print',18)}<span class="clinic-tool-label">Wydruki</span></button>
        <button class="clinic-tool" data-action="history" title="Historia wizyt pacjenta">${icon('history',18)}<span class="clinic-tool-label optional">Historia</span></button>
        <span class="clinic-tool-separator"></span><button class="clinic-tool" data-action="undo" title="Cofnij ostatnią zmianę (Ctrl+Z)">${icon('undo',18)}<span class="clinic-tool-label optional">Cofnij</span></button>
        <span class="clinic-tool-spacer"></span><span class="clinic-dirty-badge" data-clinic-status="save">Wizyta otwarta</span>
      </div>
      ${summaryHTML()}
      <div class="clinic-tabs" role="tablist" aria-label="Przebieg wizyty">${[['exam','Badanie'],['diagnosis','Szybka diagnoza'],['prophylaxis','Profilaktyka'],['diagnostics','Diagnostyka'],['followup','Kontynuacja leczenia']].map(([id,label],i)=>`<button id="clinic-tab-${id}" class="clinic-tab" role="tab" data-tab="${id}" aria-controls="clinic-page-${id}" aria-selected="${state.activeTab===id}"><span class="clinic-tab-number">${i+1}.</span>${label}</button>`).join('')}</div>
      <div class="clinic-pages">
        <section class="clinic-page" role="tabpanel" id="clinic-page-exam" aria-labelledby="clinic-tab-exam" data-page="exam">
          <div class="clinic-exam-layout">${KEYS.map((key,i)=>`<div class="clinic-field"><div class="clinic-field-heading"><span class="clinic-field-index">${i+1}</span><label for="f-${key}">${LABELS[key]}:</label><span class="clinic-field-hint" data-field-count="${key}"></span></div><div id="f-${key}" class="clinic-memo" role="textbox" aria-label="${LABELS[key]}" aria-multiline="true" contenteditable="plaintext-only" spellcheck="false" data-field="${key}" data-clinic-field="${key}" data-placeholder="Wpisz ${key==='badanie'?'wynik badania':key==='wywiad'?'wywiad z wizyty':'rozpoznanie'}…"></div></div>`).join('')}</div>
        </section>
        <section class="clinic-page" role="tabpanel" id="clinic-page-diagnosis" aria-labelledby="clinic-tab-diagnosis" data-page="diagnosis" hidden><div class="clinic-pane"><h2>Szybka diagnoza</h2><p class="clinic-pane-subtitle">Wybierz określenie i dodaj je do pola diagnozy bieżącej wizyty.</p><div class="clinic-pane-tools"><label class="clinic-search">${icon('search',16)}<input type="search" data-diagnosis-search placeholder="Szukaj w rozpoznaniach…" aria-label="Szukaj rozpoznania"></label><span class="clinic-record-count">Lista przykładowa</span></div><table class="clinic-data-table"><thead><tr><th>Rodzaj</th><th>Rozpoznanie / objaw</th><th style="width:85px">Operacja</th></tr></thead><tbody data-diagnosis-rows>${diagnosisRows('')}</tbody></table><p class="clinic-subtle-message">Wybrane określenie zostanie dopisane. Pozostała treść diagnozy pozostanie zachowana.</p></div></section>
        <section class="clinic-page" role="tabpanel" id="clinic-page-prophylaxis" aria-labelledby="clinic-tab-prophylaxis" data-page="prophylaxis" hidden><div class="clinic-pane"><h2>Profilaktyka pacjenta</h2><p class="clinic-pane-subtitle">Zdarzenia i terminy związane z profilaktyką tego pacjenta.</p><div class="clinic-pane-tools"><button class="clinic-small-button" data-action="prophylaxis-add">${icon('plus',15)}Dodaj wpis</button><span class="clinic-record-count" data-prophylaxis-count></span></div><table class="clinic-data-table"><thead><tr><th>Data</th><th>Czynność</th><th>Uwagi</th><th style="width:60px"></th></tr></thead><tbody data-prophylaxis-rows></tbody></table></div></section>
        <section class="clinic-page" role="tabpanel" id="clinic-page-diagnostics" aria-labelledby="clinic-tab-diagnostics" data-page="diagnostics" hidden><div class="clinic-pane"><h2>Badania diagnostyczne</h2><p class="clinic-pane-subtitle">Zlecenia i wyniki przypisane do bieżącej wizyty.</p><div class="clinic-pane-tools"><button class="clinic-small-button" data-action="lab-add">${icon('plus',15)}Dodaj badanie</button><span class="clinic-record-count" data-lab-count></span></div><table class="clinic-data-table"><thead><tr><th>Data</th><th>Badanie</th><th>Status</th><th style="width:100px">Wynik</th></tr></thead><tbody data-lab-rows></tbody></table></div></section>
        <section class="clinic-page" role="tabpanel" id="clinic-page-followup" aria-labelledby="clinic-tab-followup" data-page="followup" hidden><div class="clinic-pane"><h2>Kontynuacja leczenia</h2><p class="clinic-pane-subtitle">Zapisz termin kontroli i własne zalecenia dla opiekuna.</p><form data-followup-form><div class="clinic-form-grid"><label class="clinic-form-field">Data kontroli<input name="date" type="date" value="${esc(state.followup.date)}"></label><label class="clinic-form-field">Cel wizyty kontrolnej<input name="reason" value="${esc(state.followup.reason)}" placeholder="Np. kontrola stanu pacjenta"></label><label class="clinic-form-field full">Zalecenia dla opiekuna<textarea name="notes" placeholder="Wpisz zalecenia z bieżącej wizyty…">${esc(state.followup.notes)}</textarea></label></div><div class="clinic-form-actions"><button class="clinic-button primary" type="submit">${icon('save',15)}Zapisz zalecenia</button><span class="clinic-saved-inline" data-followup-saved aria-live="polite"></span></div></form></div></section>
      </div>
      <div class="clinic-statusbar" role="status"><span class="clinic-status-main"><i class="clinic-db-dot"></i>Baza demonstracyjna</span><span data-clinic-status="active">Badanie kliniczne</span><span data-clinic-status="words"></span><span class="clinic-status-spelling" data-clinic-status="spelling"></span></div>`;
    KEYS.forEach(key => renderField(key)); renderRecords(); selectTab(state.activeTab); updateStatus();
  }
  function diagnosisRows(query) {
    const normalized = query.toLocaleLowerCase('pl');
    const rows = DIAGNOSES.map((item,i)=>({item,i})).filter(({item})=>item.join(' ').toLocaleLowerCase('pl').includes(normalized));
    return rows.length ? rows.map(({item,i})=>`<tr><td><span class="clinic-status-pill">${esc(item[0])}</span></td><td>${esc(item[1])}</td><td><button class="clinic-small-button" data-diagnosis-add="${i}">${icon('plus',13)}Dodaj</button></td></tr>`).join('') : '<tr><td colspan="3" class="clinic-empty-cell">Brak pasujących rozpoznań.</td></tr>';
  }
  function renderRecords() {
    if (!appRoot) return;
    appRoot.querySelector('[data-prophylaxis-count]').textContent = `${state.prophylaxis.length} wpisów`;
    appRoot.querySelector('[data-prophylaxis-rows]').innerHTML = state.prophylaxis.length ? state.prophylaxis.map(row=>`<tr><td>${datePL(row.date)}</td><td>${esc(row.name)}</td><td>${esc(row.notes || '—')}</td><td><button class="clinic-inline-link" data-prophylaxis-delete="${esc(row.id)}" title="Usuń wpis">${icon('delete',15)}</button></td></tr>`).join('') : '<tr><td colspan="4" class="clinic-empty-cell">Nie dodano jeszcze wpisów profilaktyki.<br>Użyj przycisku „Dodaj wpis”, aby zapisać pierwszą czynność.</td></tr>';
    appRoot.querySelector('[data-lab-count]').textContent = `${state.labs.length} badań`;
    appRoot.querySelector('[data-lab-rows]').innerHTML = state.labs.length ? state.labs.map(row=>`<tr><td>${datePL(row.date)}</td><td>${esc(row.name)}</td><td><span class="clinic-status-pill ${row.result?'success':''}">${row.result?'Wynik wpisany':'Oczekuje na wynik'}</span></td><td><button class="clinic-small-button" data-lab-edit="${esc(row.id)}">${row.result?'Otwórz wynik':'Wpisz wynik'}</button></td></tr>`).join('') : '<tr><td colspan="4" class="clinic-empty-cell">Brak badań przypisanych do tej wizyty.<br>Dodaj badanie, aby zapisać zlecenie lub jego wynik.</td></tr>';
  }
  function dialog(id, title, width, height, body, footer) {
    // Reusing a Shell id otherwise returns its old content and event handlers.
    Shell.windows?.get(`clinic-${id}`)?.close();
    const host = document.createElement('div'); host.className = 'clinic-dialog';
    host.innerHTML = `<div class="clinic-dialog-body">${body}</div><div class="clinic-dialog-footer">${footer || '<button class="clinic-button" data-dialog-close>Zamknij</button>'}</div>`;
    const win = Shell.createWindow({ id: `clinic-${id}`, title, icon: 'clinic', width, height, minWidth: Math.min(width, 340), minHeight: Math.min(height, 240), x: Math.max(12,(innerWidth-width)/2), y: Math.max(18,(innerHeight-height)/2-30), className:'clinic-dialog-window', content:host, resizable:false, maximizable:false, taskbar:false });
    host.querySelectorAll('[data-dialog-close]').forEach(el=>el.addEventListener('click',()=>win.close()));
    return { win, host };
  }
  function confirmDialog(title, message, button, action) {
    const d = dialog('confirm', title, 435, 238, `<h2>${esc(title)}</h2><p>${esc(message)}</p>`, `<button class="clinic-button primary" data-confirm>${esc(button)}</button><button class="clinic-button" data-dialog-close>Anuluj</button>`);
    d.host.querySelector('[data-confirm]').onclick = () => { d.win.close(); action(); };
  }
  function formDialog(id, title, fields, onSave, options={}) {
    const formId = `clinic-form-${id}`;
    const html = fields.map(f=>`<label class="clinic-form-field ${f.full?'full':''}">${esc(f.label)}${f.type==='textarea'?`<textarea name="${f.name}" ${f.required?'required':''}>${esc(f.value||'')}</textarea>`:f.type==='select'?`<select name="${f.name}">${f.options.map(v=>`<option ${v===f.value?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input name="${f.name}" type="${f.type||'text'}" value="${esc(f.value||'')}" ${f.required?'required':''}>`}</label>`).join('');
    const d = dialog(id, title, options.width||460, options.height||390, `<form id="${formId}"><div class="clinic-form-grid">${html}</div>${options.note?`<p class="clinic-subtle-message">${esc(options.note)}</p>`:''}</form>`, `<button class="clinic-button primary" type="submit" form="${formId}">Zapisz</button><button class="clinic-button" data-dialog-close>Anuluj</button>`);
    d.host.querySelector('form').addEventListener('submit',e=>{e.preventDefault(); const data=Object.fromEntries(new FormData(e.target)); if(onSave(data)!==false)d.win.close();});
    setTimeout(()=>d.host.querySelector('input,textarea,select')?.focus(),80);
    return d;
  }
  function saveVisit() {
    state.savedFields = getFields(); state.savedAt = new Date().toISOString();
    const record = { id: state.visitNo, date: state.visitDate, savedAt: state.savedAt, fields: getFields(), patient: state.patient };
    state.history = [record, ...state.history.filter(row=>row.id!==record.id)].slice(0,20);
    persist(); updateStatus(); Shell.toast('Wizyta zapisana w bazie demonstracyjnej.'); emit('clinic:saved', { fields:getFields(), visitNo:state.visitNo });
  }
  function newVisit() {
    const d = dialog('new', 'Nowa wizyta', 438, 296, `<h2>Nowa wizyta pacjenta</h2><p>${esc(state.patient)} · ${esc(state.owner)}</p><p>${dirty()?'Bieżąca wizyta zawiera niezapisane zmiany. Zapisz je przed otwarciem nowej wizyty.':'Zostaną otwarte puste pola dokumentacji dla tego samego pacjenta.'}</p><label class="clinic-checkbox"><input type="checkbox" data-save-first ${dirty()?'checked':''}>Zapisz bieżącą wizytę przed otwarciem nowej</label>`, '<button class="clinic-button primary" data-create>Otwórz nową</button><button class="clinic-button" data-dialog-close>Anuluj</button>');
    d.host.querySelector('[data-create]').onclick=()=>{
      if(d.host.querySelector('[data-save-first]').checked)saveVisit();
      const sequence=(parseInt(state.visitNo.split('/')[1],10)||1248)+1;
      state.visitNo=`${new Date().getFullYear()}/${String(sequence).padStart(6,'0')}`;state.visitDate=dateISO();state.fields={wywiad:'',badanie:'',diagnoza:''};state.savedFields={...state.fields};state.savedAt=null;state.labs=[];state.followup={date:'',reason:'',notes:''};state.activeTab='exam';undoStack.length=0;lastCorrection=null;persist();renderMain();d.win.close();focusField('wywiad');announce(null,'new');
    };
  }
  function patientCard() {
    formDialog('patient','Kartoteka zwierzęcia',[
      {name:'patient',label:'Imię pacjenta',value:state.patient,required:true},
      {name:'weight',label:'Masa ciała',value:state.weight,required:true},
      {name:'species',label:'Gatunek',value:state.species,required:true},
      {name:'breed',label:'Rasa / odmiana',value:state.breed},
      {name:'sex',label:'Płeć',type:'select',options:['Samiec','Samica'],value:state.sex},
      {name:'colour',label:'Maść',value:state.colour}
    ],data=>{for(const key of ['patient','weight','species','breed','sex','colour'])state[key]=data[key].trim();persist();renderMain();Shell.toast('Dane kartoteki zostały zapisane.');},{height:372,note:'Zmiana kartoteki nie zmienia treści wpisanej wcześniej do dokumentacji wizyty.'});
  }
  function ownerCard() {
    const d = formDialog('owner','Kartoteka właściciela',[
      {name:'name',label:'Imię i nazwisko',value:state.owner,required:true,full:true},
      {name:'client',label:'Numer klienta',value:'000284'},
      {name:'type',label:'Typ klienta',type:'select',options:['Osoba fizyczna','Firma'],value:state.ownerType}
    ],data=>{state.owner=data.name.trim();state.ownerType=data.type;persist();renderMain();Shell.toast('Dane właściciela zostały zapisane.');},{height:315,note:'Kartoteka demonstracyjna. Nie zawiera prawdziwego telefonu ani adresu właściciela.'});
    d.host.querySelector('[name="client"]').readOnly=true;
  }
  function addProphylaxis() {
    formDialog('prophylaxis','Wpis profilaktyki',[
      {name:'name',label:'Czynność',required:true,full:true},
      {name:'date',label:'Data',type:'date',value:dateISO(),required:true},
      {name:'notes',label:'Uwagi',type:'textarea',full:true}
    ],data=>{state.prophylaxis.push({...data,id:String(Date.now())});persist();renderRecords();Shell.toast('Dodano wpis profilaktyki.');},{height:380});
  }
  function labDialog(id) {
    const row = state.labs.find(item=>item.id===id);
    formDialog('lab',row?'Wynik badania':'Nowe badanie diagnostyczne',[
      {name:'name',label:'Rodzaj badania',type:'select',options:['Morfologia krwi','Badanie biochemiczne','Badanie RTG','Badanie USG','Badanie moczu','Inne badanie'],value:row?.name||'Morfologia krwi'},
      {name:'date',label:'Data',type:'date',value:row?.date||dateISO(),required:true},
      {name:'result',label:'Wynik / opis',type:'textarea',value:row?.result||'',full:true}
    ],data=>{if(row)Object.assign(row,data);else state.labs.push({...data,id:String(Date.now())});persist();renderRecords();Shell.toast(row?'Zapisano wynik badania.':'Dodano badanie do wizyty.');},{height:360,note:'Wynik można uzupełnić później. Zapis nie wysyła zlecenia do laboratorium.'});
  }
  function historyWindow() {
    const records = state.history.length ? state.history : [{id:'example',date:state.visitDate,patient:state.patient,fields:{...DEFAULT_FIELDS}}];
    const d=dialog('history',`Historia wizyt — ${state.patient}`,660,400,`<p>Wybierz dokument, aby przejrzeć jego zapisaną treść.</p><table class="clinic-data-table"><thead><tr><th>Data</th><th>Numer</th><th>Pacjent</th><th></th></tr></thead><tbody>${records.map((r,i)=>`<tr class="clinic-history-row"><td>${datePL(r.date)}</td><td>${r.id==='example'?'Przykład demonstracyjny':esc(r.id)}</td><td>${esc(r.patient)}</td><td><button class="clinic-small-button" data-open-record="${i}">Otwórz</button></td></tr>`).join('')}</tbody></table>`);
    d.host.querySelectorAll('[data-open-record]').forEach(btn=>btn.onclick=()=>printPreview(records[Number(btn.dataset.openRecord)]));
  }
  function printPreview(record) {
    const fields=record?.fields||getFields(), visitDate=record?.date||state.visitDate;
    const host=document.createElement('div');host.className='clinic-dialog';
    host.innerHTML=`<div class="clinic-print-wrap"><article class="clinic-print-paper"><header><h1>Karta wizyty</h1><div class="clinic-print-meta">Gabinet weterynaryjny · dokument demonstracyjny<br>Data wizyty: ${datePL(visitDate)} · Numer: ${esc(record?.id==='example'?'Przykład':record?.id||state.visitNo)}</div></header><div class="clinic-print-meta"><b>Pacjent:</b> ${esc(record?.patient||state.patient)} — szczur, samiec<br><b>Opiekun:</b> ${esc(state.owner)}<br><b>Lekarz:</b> lek. wet. Anna Nowak</div>${KEYS.map(key=>`<section><h2>${LABELS[key]}</h2><p>${esc(fields[key]||'Nie uzupełniono.')}</p></section>`).join('')}<footer>OpisAI · interaktywna demonstracja · dane fikcyjne<br>Dokument wygenerowany lokalnie w przeglądarce.</footer></article></div><div class="clinic-dialog-footer"><button class="clinic-button primary" data-print>${icon('print',16)}Drukuj…</button><button class="clinic-button" data-close>Zamknij</button></div>`;
    const width=Math.min(760,innerWidth-36),height=Math.min(800,innerHeight-100);
    let win=Shell.windows?.get('clinic-print');
    if(win){win.setContent(host);win.show();}
    else win=Shell.createWindow({id:'clinic-print',title:'Klinika XP — Podgląd wydruku',icon:'print',width,height,minWidth:340,minHeight:320,x:Math.max(16,(innerWidth-width)/2),y:30,className:'clinic-print-dialog',content:host,resizable:true,maximizable:true,taskbar:true});
    host.querySelector('[data-close]').onclick=()=>win.close();host.querySelector('[data-print]').onclick=()=>window.print();
  }
  function about() {
    dialog('about','Klinika XP — informacje',420,275,`<div style="display:flex;gap:14px;align-items:center;margin-bottom:15px">${icon('clinic',38)}<div><h2 style="margin:0">Klinika XP</h2><span style="color:#74808c;font-size:12px">Gabinet weterynaryjny · środowisko demonstracyjne</span></div></div><p>Okno wizyty przedstawia przykładowy system gabinetowy, z którym współpracuje OpisAI.</p><p>Możesz edytować pola, zapisać wizytę i sprawdzić wydruk. Zmiany są przechowywane tylko w tej przeglądarce.</p>`);
  }
  async function copySelection() {
    const selection=window.getSelection()?.toString()||state.fields[state.activeField];
    try { await navigator.clipboard.writeText(selection); Shell.toast('Skopiowano tekst.'); } catch (_) { document.execCommand('copy'); }
  }
  async function pasteText() {
    try { const text=await navigator.clipboard.readText();focusField(state.activeField);document.execCommand('insertText',false,text); } catch (_) { Shell.toast('Użyj Ctrl+V, aby wkleić tekst do wybranego pola.');focusField(state.activeField); }
  }
  function selectAllText() { focusField(state.activeField);const r=document.createRange();r.selectNodeContents(fieldElement(state.activeField));const s=window.getSelection();s.removeAllRanges();s.addRange(r); }
  function menuFor(name,button,event) {
    const edit=[{label:'Cofnij ostatnią zmianę',icon:'undo',shortcut:'Ctrl+Z',disabled:!undoStack.length,onClick:undoVisit},{separator:true},{label:'Wytnij',icon:'cut',shortcut:'Ctrl+X',onClick:()=>{focusField(state.activeField);document.execCommand('cut');}},{label:'Kopiuj',icon:'copy',shortcut:'Ctrl+C',onClick:copySelection},{label:'Wklej',icon:'paste',shortcut:'Ctrl+V',onClick:pasteText},{separator:true},{label:'Zaznacz całe pole',shortcut:'Ctrl+A',onClick:selectAllText}];
    const items=name==='visit'?[{label:'Zapisz wizytę',icon:'save',shortcut:'Ctrl+S',onClick:saveVisit},{label:'Nowa wizyta…',icon:'plus',shortcut:'Ctrl+N',onClick:newVisit},{separator:true},{label:'Podgląd wydruku…',icon:'print',shortcut:'Ctrl+P',onClick:()=>printPreview()},{label:'Historia wizyt…',icon:'history',onClick:historyWindow},{separator:true},{label:'Zamknij',icon:'close',onClick:()=>mainWindow?.close()}]:name==='edit'?edit:name==='patient'?[{label:'Kartoteka zwierzęcia…',icon:'clinic',onClick:patientCard},{label:'Kartoteka właściciela…',icon:'document',onClick:ownerCard},{label:'Historia wizyt…',icon:'history',onClick:historyWindow}]:name==='tools'?[{label:'Sprawdzanie pisowni OpisAI',checked:state.spelling,onClick:()=>setSpellingEnabled(!state.spelling)},{label:'Większy tekst w polach',checked:state.largeType,onClick:()=>{state.largeType=!state.largeType;appRoot.classList.toggle('large-type',state.largeType);persist();}},{separator:true},{label:'Przywróć przykładową wizytę…',icon:'refresh',onClick:()=>confirmDialog('Przywróć przykładową wizytę','Bieżąca treść i lokalna historia demonstracji zostaną zastąpione początkowym przykładem.','Przywróć',()=>{reset();Shell.toast('Przywrócono przykładową wizytę.');})}]:[{label:'Skróty klawiaturowe…',icon:'help',onClick:()=>dialog('shortcuts','Skróty klawiaturowe',410,328,`<h2>Praca z dokumentacją</h2>${[['Zapisz wizytę','Ctrl + S'],['Nowa wizyta','Ctrl + N'],['Podgląd wydruku','Ctrl + P'],['Cofnij zmianę','Ctrl + Z'],['Zmień zakładkę','Alt + 1…5'],['Zamknij podpowiedź pisowni','Esc']].map(([label,key])=>`<div class="clinic-dialog-pair"><span>${label}</span><b>${key}</b></div>`).join('')}`)},{separator:true},{label:'O oknie demonstracyjnym…',icon:'info',onClick:about}];
    const r=button?.getBoundingClientRect();Shell.menu(items,event?.clientX??r.left,event?.clientY??r.bottom);
  }
  function dismissSpelling() { clearTimeout(hoverTimer);clearTimeout(hideTimer);spellPopup?.remove();spellPopup=null;popupPinned=false; }
  function showSpelling(mark,key,pinned=false) {
    if(!document.contains(mark)||!state.spelling)return;
    dismissSpelling();popupPinned=pinned;
    const kind=mark.dataset.kind,word=mark.dataset.word,replacement=mark.dataset.replacement,start=Number(mark.dataset.start);
    const popup=document.createElement('div');popup.className='clinic-spell-popover';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Podpowiedź pisowni');
    const title=kind==='unknown'?'Nieznane słowo':kind==='repeat'?'Powtórzone słowo':'Literówka';
    popup.innerHTML=`<div class="clinic-spell-popover-header ${kind}">${icon('document',14)}${title}<button class="clinic-spell-close" data-spell-close aria-label="Zamknij podpowiedź">${icon('close',13)}</button></div><div class="clinic-spell-explanation">${kind==='unknown'?'Może to być nazwa własna lub termin specjalistyczny.':kind==='repeat'?'To słowo występuje dwa razy obok siebie.':'Proponowana poprawka pisowni'}</div>${kind!=='unknown'?`<button class="clinic-spell-suggestion" data-spell-fix><s>${esc(word)}</s>${icon('arrowRight',14)}<b>${esc(replacement||'Usuń powtórzenie')}</b></button>`:`<div style="padding:0 12px 10px;font-size:14px">${esc(word)}</div>`}<div class="clinic-spell-actions"><button class="clinic-spell-action" data-spell-ignore>${icon('check',13)}${kind==='unknown'?'Dodaj do słownika':'Pomiń słowo'}</button>${lastCorrection?`<button class="clinic-spell-action" data-spell-undo>${icon('undo',13)}Cofnij poprawkę</button>`:''}</div><div class="clinic-spell-source">OpisAI · lokalne podpowiedzi demonstracyjne</div>`;
    document.body.appendChild(popup);spellPopup=popup;
    const rect=mark.getBoundingClientRect(), pr=popup.getBoundingClientRect();
    popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-pr.width-8))+'px';
    popup.style.top=(rect.bottom+8+pr.height<innerHeight-55?rect.bottom+8:Math.max(8,rect.top-pr.height-8))+'px';
    popup.addEventListener('pointerenter',()=>clearTimeout(hideTimer));popup.addEventListener('pointerleave',()=>{if(!popupPinned)hideTimer=setTimeout(dismissSpelling,220);});
    popup.querySelector('[data-spell-close]').onclick=dismissSpelling;
    popup.querySelector('[data-spell-ignore]').onclick=()=>{state.ignoredWords.push(word.toLocaleLowerCase('pl'));persist();dismissSpelling();KEYS.forEach(k=>renderField(k,true));updateStatus();};
    popup.querySelector('[data-spell-fix]')?.addEventListener('click',()=>{
      const before=state.fields[key];if(before.slice(start,start+word.length)!==word){dismissSpelling();return;}
      let end=start+word.length;if(kind==='repeat'&&before[end]===' ')end++;
      const after=before.slice(0,start)+replacement+before.slice(end);
      lastCorrection={key,before,after};setFields({[key]:after},{expected:{[key]:before},source:'spelling'});dismissSpelling();focusField(key);restoreSelection(fieldElement(key),{start:start+replacement.length,end:start+replacement.length});Shell.toast('Poprawiono pisownię.');
    });
    popup.querySelector('[data-spell-undo]')?.addEventListener('click',()=>{const c=lastCorrection;if(!c)return;const result=setFields({[c.key]:c.before},{expected:{[c.key]:c.after},source:'spelling-undo'});if(result.ok){lastCorrection=null;Shell.toast('Cofnięto poprawkę pisowni.');}else Shell.toast('Pole zmieniło się po poprawce. Użyj polecenia Cofnij.');dismissSpelling();});
  }
  function bindMain() {
    appRoot.addEventListener('click',event=>{
      const menu=event.target.closest('[data-menu]');if(menu){menuFor(menu.dataset.menu,menu);return;}
      const tab=event.target.closest('[data-tab]');if(tab){selectTab(tab.dataset.tab);return;}
      const action=event.target.closest('[data-action]')?.dataset.action;
      const actions={save:saveVisit,new:newVisit,print:()=>printPreview(),history:historyWindow,undo:undoVisit,owner:ownerCard,patient:patientCard,'prophylaxis-add':addProphylaxis,'lab-add':()=>labDialog()};if(action&&actions[action]){actions[action]();return;}
      const diagnosis=event.target.closest('[data-diagnosis-add]');if(diagnosis){const text=DIAGNOSES[Number(diagnosis.dataset.diagnosisAdd)][1];if(!state.fields.diagnoza.includes(text))setFields({diagnoza:state.fields.diagnoza.trim()?state.fields.diagnoza.trim()+'\n'+text:text},{source:'diagnosis-list'});focusField('diagnoza');return;}
      const remove=event.target.closest('[data-prophylaxis-delete]');if(remove){state.prophylaxis=state.prophylaxis.filter(row=>row.id!==remove.dataset.prophylaxisDelete);persist();renderRecords();return;}
      const lab=event.target.closest('[data-lab-edit]');if(lab)labDialog(lab.dataset.labEdit);
    });
    appRoot.addEventListener('input',event=>{
      if(event.target.matches('[data-diagnosis-search]')){appRoot.querySelector('[data-diagnosis-rows]').innerHTML=diagnosisRows(event.target.value);return;}
      const el=event.target.closest('[data-clinic-field]');if(!el)return;
      const key=el.dataset.clinicField,value=el.innerText.replace(/\r\n/g,'\n').replace(/\u00a0/g,' '),before=getFields();
      if(state.fields[key]===value)return;
      state.fields[key]=value;pushUndo(before,getFields());persist();updateStatus();announce(key,'manual');dismissSpelling();clearTimeout(editTimers.get(key));editTimers.set(key,setTimeout(()=>renderField(key,true),650));
    });
    appRoot.addEventListener('compositionstart',event=>{const key=event.target.closest('[data-clinic-field]')?.dataset.clinicField;if(key)composing.add(key);});
    appRoot.addEventListener('compositionend',event=>{const key=event.target.closest('[data-clinic-field]')?.dataset.clinicField;if(key){composing.delete(key);setTimeout(()=>renderField(key,true),100);}});
    appRoot.addEventListener('focusin',event=>{const key=event.target.closest('[data-clinic-field]')?.dataset.clinicField;if(key){state.activeField=key;updateStatus();emit('clinic:focus',{field:key,fields:getFields()});}});
    appRoot.addEventListener('paste',event=>{if(!event.target.closest('[data-clinic-field]'))return;event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));});
    appRoot.addEventListener('contextmenu',event=>{const field=event.target.closest('[data-clinic-field]');if(field){event.preventDefault();state.activeField=field.dataset.clinicField;menuFor('edit',null,event);}});
    appRoot.addEventListener('pointerover',event=>{const mark=event.target.closest('.clinic-spell');if(!mark||popupPinned)return;clearTimeout(hideTimer);clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>showSpelling(mark,mark.closest('[data-clinic-field]').dataset.clinicField),380);});
    appRoot.addEventListener('pointerout',event=>{if(event.target.closest('.clinic-spell')&&!popupPinned){clearTimeout(hoverTimer);hideTimer=setTimeout(dismissSpelling,240);}});
    appRoot.addEventListener('pointerdown',event=>{const mark=event.target.closest('.clinic-spell');if(mark&&event.button===0){event.preventDefault();showSpelling(mark,mark.closest('[data-clinic-field]').dataset.clinicField,true);}});
    appRoot.addEventListener('scroll',()=>{if(spellPopup)dismissSpelling();},true);
    appRoot.addEventListener('submit',event=>{if(!event.target.matches('[data-followup-form]'))return;event.preventDefault();state.followup=Object.fromEntries(new FormData(event.target));persist();appRoot.querySelector('[data-followup-saved]').textContent='Zalecenia zapisane';Shell.toast('Zapisano zalecenia i termin kontroli.');});
    appRoot.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&!event.altKey){const key=event.key.toLowerCase();if(['s','p','n'].includes(key)){event.preventDefault();({s:saveVisit,p:()=>printPreview(),n:newVisit})[key]();}else if(key==='z'&&event.target.closest('[data-clinic-field]')){event.preventDefault();undoVisit();}}
      if(event.altKey&&/^[1-5]$/.test(event.key)){event.preventDefault();selectTab(['exam','diagnosis','prophylaxis','diagnostics','followup'][Number(event.key)-1]);}
    });
  }
  function open() {
    if(mainWindow&&document.contains(mainWindow.el)){mainWindow.show();mainWindow.focus();return mainWindow;}
    appRoot=document.createElement('div');appRoot.className='clinic-app';
    const width=Math.max(360,Math.min(1120,innerWidth-240)),height=Math.max(370,Math.min(740,innerHeight-130));
    mainWindow=Shell.createWindow({id:'clinic',title:`Klinika XP — Rejestracja wizyty: ${state.patient}`,icon:'clinic',width:innerWidth<650?innerWidth-24:width,height:innerHeight<550?innerHeight-76:height,minWidth:340,minHeight:350,x:innerWidth<850?18:125,y:innerHeight<600?12:60,className:'clinic-window',content:appRoot,resizable:true,maximizable:true,taskbar:true,onClose:()=>{dismissSpelling();mainWindow=null;appRoot=null;}});
    renderMain();bindMain();return mainWindow;
  }
  window.Clinic={open,getFields,setFields,focusField,getActiveField:()=>state.activeField,setSpellingEnabled,reset,markTarget,undo:undoVisit,getDefaultFields:()=>({...DEFAULT_FIELDS}),getSpellingEnabled:()=>state.spelling};
  document.addEventListener('pointerdown',event=>{if(spellPopup&&!spellPopup.contains(event.target)&&!event.target.closest('.clinic-spell'))dismissSpelling();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&spellPopup){dismissSpelling();event.stopPropagation();}},true);
  window.addEventListener('resize',dismissSpelling);
  function init(){Shell.registerApp({id:'clinic',title:'Klinika XP',icon:'clinic',open});open();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
