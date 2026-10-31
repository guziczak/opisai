/* OpisAI 0.12.0rc32. A local, interactive reconstruction of the desktop app.
 * Demonstration only: no microphone access, cloud requests or clinical writes.
 * Editable visit data stays locally in this browser. */
(() => {
  'use strict';
  const VERSION = '0.12.0rc32';
  const FIELDS = {wywiad: 'Wywiad', badanie: 'Badanie kliniczne', diagnoza: 'Rozpoznanie'};
  const PREF_KEY = 'opisai-demo-settings-v12';
  const defaults = {provider:'ChatGPT',transport:'Przeglądarka',model:'Wybrany w ChatGPT',theme:'light',transcriber:'ChatGPT',cardMode:'Nagrywa OpisAI',spelling:true,animations:true,idleBounce:true,bounceInterval:10,bounceMax:0,history:true,retention:'30 dni',fontSize:13,livePreview:true,language:'Polski',sentenceLines:false,dictationConsent:false,panel:true,rich:false,diagnosis:false,clinicalSections:['Wywiad','Badanie kliniczne','Rozpoznanie'],panelRows:{temperature:true,heart:true,bcs:true,mass:true},customPrompt:''};
  let preferences = {...defaults};
  try { const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); for (const key of Object.keys(defaults)) if (key in saved && typeof saved[key] === typeof defaults[key]) preferences[key] = saved[key]; } catch (_) {}
  if(!Array.isArray(preferences.clinicalSections)||preferences.clinicalSections.length!==3)preferences.clinicalSections=[...defaults.clinicalSections];
  if(!preferences.panelRows||typeof preferences.panelRows!=='object')preferences.panelRows={...defaults.panelRows};
  if(!['light','dark','blue'].includes(preferences.theme))preferences.theme='light';
  /* Config idle_bounce_*: 10–3600 s between bounces, 0 = no limit per idle window. */
  const normalizeBounce=p=>{p.bounceInterval=Number.isFinite(+p.bounceInterval)?Math.max(10,Math.min(3600,Math.round(+p.bounceInterval))):defaults.bounceInterval;p.bounceMax=Number.isFinite(+p.bounceMax)?Math.max(0,Math.min(999,Math.round(+p.bounceMax))):defaults.bounceMax;};
  normalizeBounce(preferences);
  const state = {phase:'idle',active:null,operation:null,review:null,history:[],lastWrite:null,token:0,recording:null,receipt:null,job:null,orb:null,closed:false,handlingFailure:false,failureSerial:0,activeField:null};
  const windows = new Map();
  const $ = (sel,root=document) => root.querySelector(sel);
  const $$ = (sel,root=document) => [...root.querySelectorAll(sel)];
  const esc = text => String(text ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name,size=16) => window.Icons?.svg(name,size) || '';
  const button = (label,action,kind='',ic='',extra='') => `<button type="button" class="oa-btn ${kind}" data-action="${esc(action)}" ${extra}>${ic?icon(ic):''}<span>${label}</span></button>`;
  const check = (label,id,checked=false,extra='') => `<label class="oa-ack"><input type="checkbox" id="${id}" ${checked?'checked':''} ${extra}><span>${label}</span></label>`;
  const notice = (text,kind='info',extra='') => `<div class="oa-notice ${kind}" ${extra}>${icon(kind==='error'?'info':'shield',17)}<div>${text}</div></div>`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const savePreferences = () => { try { localStorage.setItem(PREF_KEY,JSON.stringify(preferences)); } catch (_) {} };
  const route = () => `${preferences.provider} · ${preferences.provider==='Lokalny'?'Offline':preferences.transport} · ${preferences.model}`;
  const stamp = () => new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  const toast = message => window.Shell?.toast(message);
  function bind(root, action, callback) { $$(`[data-action="${action}"]`,root).forEach(el => el.addEventListener('click',callback)); }
  function applyTheme(win,theme=preferences.theme) { if(!win?.el)return; win.el.classList.remove('oa-theme-light','oa-theme-dark','oa-theme-blue');win.el.classList.add('oa-host','oa-theme-'+theme); }
  function makeWindow(id,title,width,height,html,onClose) {
    let win=windows.get(id);
    if(win?.el?.isConnected){win.setTitle(title);win.setContent(html);win.show();win.focus();}
    else {win=Shell.createWindow({id,title,icon:'opisai',width,height,minWidth:Math.min(width,500),minHeight:Math.min(height,360),className:'oa-host oa-theme-'+preferences.theme,content:html,resizable:true,maximizable:true,taskbar:true,onClose:()=>onClose?.()});windows.set(id,win);}
    applyTheme(win); if(win?.el)win.el.dataset.oaWindow=id; holdPosition(); return win; // a work view stops the idle bounce where it is
  }
  function closeWin(id) { windows.get(id)?.close(); }
  function getFields() { return clone(window.Clinic?.getFields?.() || {wywiad:'',badanie:'',diagnoza:''}); }
  function validOption(options) {return options && typeof options==='object' && !('target' in options && options.target instanceof Element)?options:{};}
  /* ------------------------------------------------------------------ documentation workflow
   * 0.12.0rc32 ui/workflow.py ComposeDialog and ProgressPage, ui/workspace.py DocumentWorkspace,
   * ui/review.py ReviewPage with ui/structured_review.py, ui/coordinator.py (write, receipts,
   * undo, history) and ui/recovery.py. The document itself comes from assets/opisai-document.js. */
  const Doc = () => window.OpisAIDocument;
  const DOC_KEYS = ['badanie', 'wywiad', 'diagnoza']; // configured order: exam, history, diagnosis
  const DOC_FIELD = {badanie: 'Badanie kliniczne', wywiad: 'Wywiad', diagnoza: 'Diagnoza'};
  const DOC_SECTION = {badanie: 'Opis badania i ocena', wywiad: 'Opis wywiadu', diagnoza: 'Rozpoznanie robocze'};
  const DOC_TAB = {badanie: 'Badanie', wywiad: 'Wywiad', diagnoza: 'Rozpoznanie'};
  const VARIANT_KEY = 'opisai.demo.variant.v1'; // config generation_variant: the last approved whole-visit choice
  const WINDOW_CHANGED = 'Zmieniło się okno, proces programu lub mapowanie pól. Odczytaj pola ponownie.';
  const RECEIPT_NOTE = 'To wynik wpisania do kontrolek, nie potwierdzenie zapisu wizyty w bazie Kliniki.';
  const docSpeed = () => preferences.animations === false || matchMedia('(prefers-reduced-motion: reduce)').matches ? .35 : 1;
  const pick = (values, keys) => Object.fromEntries(keys.map(key => [key, String(values?.[key] ?? '')]));
  const lines = text => Math.max(1, String(text).split('\n').length);
  const normal = text => String(text).replace(/\s+/g, ' ').trim().toLowerCase(); // also the settings search
  function connectionLabel() { const p = preferences.provider; return [p === 'Lokalny' ? 'Lokalny (offline)' : p, p === 'Lokalny' ? 'Lokalnie (offline)' : preferences.transport, p === 'ChatGPT' ? 'model wybrany w ChatGPT UI' : preferences.model].join(' · '); }
  function clinicTitle() { const c = window.Clinic?.getContext?.() || {}; return c.title ? `${c.title.replace(/^\[DEMO\]\s*/, '')} — ${c.patient}${c.visitNumber === '<NOWY>' ? ' [NOWA]' : ' · ' + c.visitNumber}` : 'Okno docelowe'; }
  function rememberedVariant() { try { const v = JSON.parse(localStorage.getItem(VARIANT_KEY) || 'null'); if (v && ['rich', 'panel', 'diagnosis'].every(k => typeof (v[k] ?? false) === 'boolean')) return Doc().variant(v); } catch (_) {} return Doc().variant({}); }
  function rememberVariant(v) { try { localStorage.setItem(VARIANT_KEY, JSON.stringify(Doc().variant(v))); } catch (_) {} }
  function docScope(field) { // legacy_ui._trigger: sources, outputs and what the matrix may offer
    if (field === null) return {sources: DOC_KEYS, outputs: ['badanie', 'wywiad'], panel: true, diagnosis: true, required: false};
    if (field === 'diagnoza') return {sources: DOC_KEYS, outputs: [], panel: false, diagnosis: true, required: true};
    return {sources: [field], outputs: [field], panel: field === 'badanie', diagnosis: false, required: false};
  }
  const composeSources = op => op.scope.sources.map(k => ({id: (k === 'diagnoza' ? 'diagnosis:' : 'standard:') + k, field: k, label: DOC_FIELD[k], role: k === 'diagnoza' ? 'diagnosis' : 'standard', text: op.texts[k] || '', included: k !== 'diagnoza' || op.variant.diagnosis}));
  const composeRequest = op => ({mode: op.variant.rich ? 'rich' : 'faithful', panel: op.variant.panel, diagnosis: op.variant.diagnosis, sources: composeSources(op),
    outputs: [...op.scope.outputs, ...(op.variant.diagnosis ? ['diagnoza'] : [])], panelTarget: op.variant.panel ? 'badanie' : '', snapshot: op.snapshot});
  const linkButton = (label, action, extra = '') => `<button type="button" class="oa-link-btn" data-action="${esc(action)}" ${extra}>${label}</button>`;

  /* MacroController.on_trigger: the sub-window is read first (SafeCoordinator.capture shows "Odczytuję
   * pola"), then one compose window. A dictation summary handed over here (_compose_dictation) waits
   * behind the bubble ("Sprawdź") when the read is cancelled or its window or field changed. */
  function prepare(options = {}) {
    options = typeof options === 'string' ? {field: options} : validOption(options);
    const back = options.dictationReturn, restore = () => { if (back) { back.outcome = null; state.review = back; setPhase('review'); } };
    beginOperation(); if (!visitReady()) { restore(); return; }
    readVisit(() => {
      if (!visitReady()) { restore(); return; }
      if (back) { // DictationGenerationInput.apply: the same window and the dictated field unchanged
        const ctx = window.Clinic?.getContext?.() || {}, now = getFields(), problem = ctx.session !== back.session ? 'Zmieniła się wizyta lub okno docelowe. Transkrypcja pozostaje w podsumowaniu dyktowania.'
          : back.keys.some(k => now[k] !== String(back.snapshot?.[k] ?? '')) ? 'Pole wizyty zmieniło się podczas dyktowania. Sprawdź je przed dalszym opracowaniem transkrypcji.' : '';
        if (problem) { restore(); messageBox({title: 'OpisAI — sprawdź komunikat', icon: 'warning', text: problem}); return; }
      }
      openCompose(options);
    }, restore);
  }
  function openCompose(options) { // ComposeDialog: editable source copies, the six-variant matrix and the RODO acknowledgement
    const field = DOC_KEYS.includes(options.field) ? options.field : null, scope = docScope(field), snapshot = pick(options.snapshot || getFields(), scope.sources);
    const preferred = Doc().variant(options.variant || rememberedVariant()), projected = Doc().forCapabilities(preferred, scope);
    const op = {id: ++state.token, snapshot, texts: {...snapshot, ...pick({...snapshot, ...(options.sources || {})}, scope.sources)}, scope, field, preferred, projected, variant: projected,
      session: options.session ?? window.Clinic?.getContext?.().session, context: clinicTitle(), remember: field === null, dictation: options.dictationReturn || null, fingerprint: null, details: false, finished: false};
    state.operation = op; state.review = null; setPhase('idle');
    const cards = scope.sources.map(k => `<div class="oa-c2-card" data-source-card="${k}"><h3>${esc(DOC_FIELD[k])}</h3><textarea data-source="${k}" spellcheck="false" placeholder="Brak treści. Możesz uzupełnić to pole." aria-label="${esc(DOC_FIELD[k])} — źródło do opracowania, edytowalne">${esc(op.texts[k])}</textarea><div class="oa-c2-status" data-status hidden></div></div>`).join('');
    const offered = []; // the enabled tiles' variants (VariantDescription)
    const tiles = [true, false].map(rich => `<div class="oa-c2-row" title="${esc(Doc().modeSummary(rich))}">${rich ? 'Bogato' : 'Wiernie'}</div>` + [0, 1, 2].map(col => {
      const v = {rich, panel: col > 0 && scope.panel, diagnosis: col === 2 || scope.required}, sub = col === 0 ? (scope.required ? 'Rozpoznanie' : 'Sam opis') : col === 1 ? '+ panel\nparametrów' : scope.panel ? '+ panel\n+ rozpoznanie' : '+ rozpoznanie';
      const enabled = col === 0 || (col === 1 && scope.panel) || (col === 2 && scope.diagnosis && !scope.required), name = (rich ? 'Bogato' : 'Wiernie') + ' — ' + sub.replace('\n', ' ');
      if (enabled) offered.push(v);
      const tip = !enabled ? (col === 1 ? 'Parametry życiowe nie są dostępne dla wskazanych pól.' : scope.required ? 'Rozpoznanie robocze jest już uwzględnione w tym trybie.' : 'Rozpoznanie robocze nie jest dostępne dla wskazanych pól.') : v.diagnosis ? name + '. Rozpoznanie robocze to propozycja AI do sprawdzenia.' : name;
      return `<button type="button" class="oa-c2-tile" data-tile="${JSON.stringify(v).replace(/"/g, '&quot;')}" aria-label="${esc(name)}" title="${esc(tip)}" ${enabled ? '' : 'aria-disabled="true" tabindex="-1"'}><span class="oa-c2-tick" aria-hidden="true">${icon('check', 12)}</span>${esc(sub).replace('\n', '<br>')}</button>`;
    }).join('')).join('');
    const variantHtml = v => { const [first, ...rest] = Doc().describeVariant(v), name = v.rich ? 'Bogato' : 'Wiernie'; return `<p><b>${name}</b>${esc(first.slice(name.length))}</p>` + rest.map(line => `<p>${esc(line)}</p>`).join(''); };
    // VariantDescription: every enabled tile's text keeps its space, so another choice never moves the window.
    const sizer = `<div class="oa-c2-sizer" aria-hidden="true">${offered.map(v => `<div class="oa-c2-description">${variantHtml(v)}</div>`).join('')}</div>`;
    const html = `<div class="oa-app oa-c2"><div class="oa-c2-head"><h1 data-heading>Przygotuj opis wizyty</h1><p class="oa-c2-route" data-oa-route>${esc(connectionLabel())}</p></div><div class="oa-c2-body"><div class="oa-c2-columns"><section class="oa-c2-sources"><div class="oa-c2-label" data-source-heading>Treść pól</div><div class="oa-c2-stack"><div class="oa-c2-cards" data-cards>${cards}</div><div class="oa-c2-rules" data-rules hidden><textarea readonly spellcheck="false" aria-label="Zasady i źródła"></textarea></div></div><button type="button" class="oa-btn oa-c2-details" data-action="rules" title="Instrukcje, zamówione sekcje i zatwierdzone źródła. Dla panelu program dołącza również zestawienie parametrów i cytatów z tych źródeł.">Pokaż zasady i źródła</button></section><section class="oa-c2-options"><div class="oa-c2-label" id="oa-c2-mode-${op.id}">Sposób opracowania</div><div class="oa-c2-grid" role="group" aria-labelledby="oa-c2-mode-${op.id}">${tiles}</div><div class="oa-c2-descwrap"><div class="oa-c2-description" data-description aria-live="polite"></div>${sizer}</div></section></div></div><div class="oa-c2-error" data-error role="alert" hidden></div><label class="oa-ack oa-c2-ack"><input type="checkbox" id="oa-compose-ack"><span data-ack-text>Sprawdzone: źródła i wybrany zakres opracowania.</span></label><footer class="oa-footer"><span class="oa-footnote" data-foot>Pola wizyty pozostaną bez zmian.</span>${button('Anuluj', 'cancel')}${button('Przygotuj podgląd', 'generate', 'primary', '', 'disabled')}</footer></div>`;
    const win = makeWindow('opisai-compose', 'OpisAI — przygotuj opis wizyty', 1040, 690, html, () => composeClosed(op)); state.active = win;
    const root = win.content, ack = $('#oa-compose-ack', root), send = $('[data-action="generate"]', root), foot = $('[data-foot]', root);
    op.win = win; let resetShown = false, preview = null;
    const showReset = on => { resetShown = on; foot.textContent = on ? 'Zmieniło się to, co zostanie wysłane — zaznacz potwierdzenie ponownie.' : 'Pola wizyty pozostaną bez zmian.'; foot.classList.toggle('oa-c2-reset', on); };
    function refresh() {
      const sources = composeSources(op), has = sources.some(s => s.included && s.text.trim());
      for (const s of sources) { const card = $(`[data-source-card="${s.field}"]`, root), status = $('[data-status]', card), text = !s.included ? 'Poza wybranym zakresem — diagnoza nie będzie opracowywana.' : !s.text.trim() ? 'Puste pole — możesz je uzupełnić.' : ''; card.classList.toggle('out-of-scope', !s.included); status.textContent = text; status.hidden = !text; }
      $$('[data-tile]', root).forEach(tile => { const on = tile.getAttribute('aria-disabled') !== 'true' && Doc().sameVariant(JSON.parse(tile.dataset.tile), op.variant); tile.classList.toggle('selected', on); tile.setAttribute('aria-pressed', String(on)); });
      $('[data-description]', root).innerHTML = variantHtml(op.variant);
      const local = preferences.provider === 'Lokalny', route = connectionLabel(), service = route.split('·')[0].trim() || 'wskazanej usługi AI';
      $('[data-oa-route]', root).textContent = route;
      if (has) {
        preview = Doc().plan(composeRequest(op));
        $('[data-heading]', root).textContent = local ? 'Przygotuj opis' : 'Przygotuj opis z AI'; $('span', send).textContent = local ? 'Przygotuj podgląd' : 'Wyślij i przygotuj podgląd';
        $('[data-ack-text]', root).textContent = local ? 'Sprawdzone: tylko te pola, według wybranych ustawień, bez danych osobowych właściciela i personelu.' : `Sprawdzone: wysyłam do ${service} tylko te pola, bez danych osobowych właściciela i personelu.`;
        ack.parentElement.title = 'Potwierdzenie dotyczy treści tych pól i usługi AI, a przy panelu także zestawienie parametrów ze źródeł. Sama zmiana stylu Bogato/Wiernie go nie odznacza.';
        $('[data-rules] textarea', root).value = Doc().OUTLINE_NOTE + '\n\n' + Doc().promptOutline(preview);
      } else { preview = null; $('[data-rules] textarea', root).value = ''; }
      const error = $('[data-error]', root); error.hidden = has; error.textContent = has ? '' : 'Uzupełnij treść pola objętego wybranym zakresem.';
      const fingerprint = has ? Doc().consentScope(sources, op.variant, {route, provider: preferences.provider}) : '';
      if (fingerprint !== op.fingerprint) { op.fingerprint = fingerprint; if (ack.checked) { ack.checked = false; showReset(true); } }
      send.disabled = !(ack.checked && preview);
    }
    $$('[data-source]', root).forEach(editor => editor.addEventListener('input', () => { op.texts[editor.dataset.source] = editor.value; refresh(); }));
    $$('[data-tile]', root).forEach(tile => tile.addEventListener('click', () => { if (tile.getAttribute('aria-disabled') === 'true') return; const v = JSON.parse(tile.dataset.tile); if (Doc().sameVariant(v, op.variant)) return; op.variant = v; refresh(); }));
    ack.addEventListener('change', () => { if (ack.checked && resetShown) showReset(false); refresh(); });
    bind(root, 'rules', () => { op.details = !op.details; $('[data-cards]', root).hidden = op.details; $('[data-rules]', root).hidden = !op.details; $('[data-source-heading]', root).textContent = op.details ? 'Zasady i źródła' : 'Treść pól'; $('[data-action="rules"]', root).textContent = op.details ? '← Wróć do edycji źródeł' : 'Pokaż zasady i źródła'; });
    bind(root, 'cancel', () => win.close());
    bind(root, 'generate', () => {
      refresh(); if (!ack.checked || !preview || op.finished) return;
      const requested = Doc().sameVariant(op.variant, op.projected) ? op.preferred : op.variant; // a forced projection keeps the preference
      state.resume = {texts: {...op.texts}, note: Doc().sentSource(composeSources(op)), variant: requested, field: op.field, snapshot: op.snapshot, session: op.session};
      if (op.remember && !op.scope.required) rememberVariant(requested);
      op.finished = true; op.dictation = null; win.close(); generate(op);
    });
    refresh(); setTimeout(() => (op.texts[scope.sources[0]] ? $$('[data-tile]', root).find(t => t.classList.contains('selected')) : $('[data-source]', root))?.focus(), 0);
  }
  function composeClosed(op) { // Anuluj or ×: nothing was sent; a dictation summary comes back
    if (op.finished) return; op.finished = true; state.resume = null;
    if (state.operation === op) state.operation = null; state.active = null; setPhase('idle');
    if (op.dictation) { const back = op.dictation; setTimeout(() => review(back), 0); }
  }

  /* One OpisAI window per operation: progress, then the review in the same window and geometry. */
  let workspace = null;
  function openWorkspace(title, width, height, html, onClose) {
    if (workspace && !workspace.finished) finishWorkspace(workspace);
    const ws = {finished: false, onClose}; ws.win = makeWindow('opisai-review', title, width, height, html, () => ws.finished ? undefined : ws.onClose?.());
    workspace = ws; return ws;
  }
  function finishWorkspace(ws) { if (!ws || ws.finished) return; ws.finished = true; clearInterval(ws.clock); clearTimeout(ws.timer); ws.win.close(); if (workspace === ws) workspace = null; }
  function progressHtml(kind) {
    const generation = kind === 'generation', steps = generation ? `<div class="oa-pg-steps" data-steps>${['Odczyt', 'Generowanie', 'Sprawdzenie', 'Gotowe'].map((n, i) => `<span data-step="${i}" title="${['Odczyt okna i pól', 'Odpowiedź wybranego AI', 'Sprawdzenie struktury i parametrów', 'Podgląd gotowy do sprawdzenia'][i]}"></span>`).join('')}</div>` : '';
    const stream = generation ? `<section class="oa-pg-stream" data-stream-region><div class="oa-pg-stream-head"><span class="oa-muted" data-caption>Wersja robocza</span>${linkButton('Wcześniej', 'earlier', 'hidden aria-label="Przewiń odpowiedź o stronę wcześniej"')}${linkButton('Do najnowszego', 'latest', 'hidden')}${linkButton('Ukryj', 'hide-stream', 'aria-label="Ukryj tekst na żywo" title="Schowaj podgląd generowanej odpowiedzi"')}</div><div class="oa-pg-doc" data-doc tabindex="0" aria-label="Niesprawdzony podgląd odpowiedzi — bez wpisywania do pól"><p class="oa-pg-waiting">Tu na bieżąco pojawi się treść odpowiedzi.</p></div></section>` : '';
    const heading = generation ? 'Powstaje opis wizyty' : kind === 'writing' ? 'Wpisuję zatwierdzony wynik' : 'Odczytuję pola';
    const message = generation ? 'Łączę się z wybranym serwisem…' : kind === 'writing' ? 'Kontrola pól → wpisanie → odczyt kontrolny.' : 'Sprawdzam okno i treść pól…';
    return `<div class="oa-app oa-pg"><div class="oa-pg-head"><span class="oa-spinner" role="img" aria-label="Operacja w toku"></span><h1 data-heading>${heading}</h1><span class="oa-muted" data-elapsed>Czas: 00:00</span></div>${generation ? `<div class="oa-muted oa-pg-line" data-route></div>` : ''}<div class="oa-pg-line" data-message aria-live="polite">${message}</div>${steps}${stream}<div class="oa-pg-actions">${generation ? button('Pokaż tekst na żywo', 'show-stream', 'primary oa-pg-big', '', 'title="Zobacz na żywo, jak powstaje opis wizyty"') : ''}<span class="oa-pg-gap"></span>${button('Anuluj', 'cancel', '', '', kind === 'writing' ? 'disabled' : '')}</div><div class="oa-muted oa-pg-foot">${kind === 'writing' ? 'Wpisanie do pól nie zapisuje wizyty.' : 'Pola wizyty pozostają bez zmian.'}</div></div>`;
  }
  function startClock(ws, root) { const started = Date.now(); const tick = () => { const s = Math.floor((Date.now() - started) / 1000); $('[data-elapsed]', root).textContent = `Czas: ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }; tick(); ws.clock = setInterval(tick, 1000); }
  function setSteps(root, active) { $$('[data-step]', root).forEach((el, i) => { el.textContent = (i < active ? '✓  ' : i === active ? '●  ' : '○  ') + ['Odczyt', 'Generowanie', 'Sprawdzenie', 'Gotowe'][i]; el.classList.toggle('active', i === active); }); }
  function streamHtml(sections, shown, live) {
    let budget = shown; const out = [];
    for (const s of sections) {
      if (budget <= 0 && out.length) break;
      const visible = s.text.slice(0, Math.max(0, budget)); budget -= s.text.length;
      if (!visible) continue;
      const active = live && budget < 0, fresh = active ? Math.min(visible.length, 36) : 0;
      out.push(`<div class="oa-pg-sec"><div class="oa-pg-sec-title">${esc(s.label)}${active ? ' <span aria-hidden="true">•</span>' : ''}</div><div class="oa-pg-sec-body">${esc(visible.slice(0, visible.length - fresh))}<span class="oa-pg-new">${esc(visible.slice(visible.length - fresh))}</span></div></div>`);
    }
    return out.join('');
  }

  /* Generation (simulated): the local panel first, then the "response", checks and the review. */
  function generate(op) {
    if (!op) return;
    const g = Doc().generate(composeRequest(op)), token = ++state.token, speed = docSpeed(), panel = g.plan.initialPanel;
    const result = {id: op.id, mode: 'generation', generated: g, snapshot: op.snapshot, session: op.session, context: op.context, route: connectionLabel(), variant: {...op.variant}, field: op.field, created: new Date()};
    const stream = preferences.livePreview !== false, ws = openWorkspace('OpisAI — przygotowuję wersję roboczą', 740, stream && panel ? 740 : 540, progressHtml('generation'), () => { cancel(); return false; });
    const root = ws.win.content, doc = $('[data-doc]', root); state.active = ws.win; state.operation = op; state.review = null;
    const route = connectionLabel().split('·').map(x => x.trim()); if (route[0] === 'Lokalny (offline)') route.splice(0, 2, 'Lokalnie');
    $('[data-route]', root).textContent = route.join(' · '); setSteps(root, 1); startClock(ws, root);
    const initial = g.sections.map(s => ({label: s.label, text: s.leaves.map(l => l.panel ? `${l.name}:\n${panel.text}` : '').filter(Boolean).join('')})).filter(s => s.text);
    const final = g.sections.map(s => ({label: s.label, text: s.leaves.map(l => [l.name, l.panel ? panel.text : '', l.text, l.inference]).map(([name, ...body]) => { const b = body.filter(x => x.trim()).join('\n\n'); return b ? name + ':\n' + b : ''; }).filter(Boolean).join('\n\n')})).filter(s => s.text);
    const total = final.reduce((n, s) => n + s.text.length, 0);
    let shown = -1, following = true, cancelling = false;
    function paint() {
      const caption = $('[data-caption]', root);
      if (shown < 0) { if (initial.length) { doc.innerHTML = streamHtml(initial, Infinity, false); caption.textContent = 'Panel z danych i ustawień · oczekuję na AI'; caption.title = 'Wiersze panelu pochodzą ze źródeł i skonfigurowanego wzorca. Wzorzec nie potwierdza wykonania badania.'; } }
      else { doc.innerHTML = streamHtml(final, shown, shown < total); caption.textContent = 'Wersja robocza'; caption.title = ''; }
      if (following) doc.scrollTop = doc.scrollHeight; scrollControls();
    }
    function scrollControls() { const scrollable = doc.scrollHeight > doc.clientHeight + 2; $('[data-action="earlier"]', root).hidden = !scrollable; $('[data-action="earlier"]', root).disabled = doc.scrollTop <= 0; const latest = $('[data-action="latest"]', root); latest.textContent = shown >= 0 ? 'Do najnowszego' : 'Na dół'; latest.hidden = !scrollable || doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 2; }
    function showStream(visible, user) { if (user && cancelling) return; $('[data-stream-region]', root).hidden = !visible; $('[data-action="show-stream"]', root).hidden = visible; if (user) { preferences.livePreview = visible; savePreferences(); $(visible ? '[data-action="hide-stream"]' : '[data-action="show-stream"]', root)?.focus(); } }
    doc.addEventListener('scroll', () => { following = doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 4; scrollControls(); });
    bind(root, 'earlier', () => { doc.scrollTop -= doc.clientHeight * .9; }); bind(root, 'latest', () => { doc.scrollTop = doc.scrollHeight; following = true; scrollControls(); });
    bind(root, 'hide-stream', () => showStream(false, true)); bind(root, 'show-stream', () => showStream(true, true));
    bind(root, 'cancel', () => cancel());
    function step(fn, delay) { ws.timer = setTimeout(() => { if (state.job?.token === token && !cancelling) fn(); }, delay * speed); }
    function cancel() { // ProgressPage.request_close: cancellation, then the recovery report
      if (cancelling || ws.finished) return; cancelling = true; clearTimeout(ws.timer);
      // ProgressPage.request_close, then SafeCoordinator.cancel words it for the generation
      $('[data-action="cancel"]', root).disabled = true; $('[data-heading]', root).textContent = 'Anuluję generowanie';
      $('[data-message]', root).textContent = 'Wynik nie zostanie wpisany. Czekam, aż transport zwolni zasoby.';
      setTimeout(() => { if (state.job?.token === token) state.job = null; finishWorkspace(ws); state.operation = null; state.active = null; setPhase('idle');
        recoveryDialog({code: 'cancelled', title: 'Anulowano przygotowanie', explanation: 'Nie wpisano wyniku do pól wizyty.', next: 'Możesz wrócić do zachowanej notatki. Nie uruchamiam nowego żądania bez Twojego zatwierdzenia.', action: 'review', actionLabel: 'Wróć do notatki', note: Doc().sentSource(g.request.sources)}); }, 700 * speed);
    }
    state.job = {token, cancel}; setPhase('processing'); showStream(stream, false); paint();
    step(() => { shown = 0; $('[data-message]', root).textContent = 'Odbieram odpowiedź…';
      const tick = () => { if (state.job?.token !== token || cancelling) return; shown = Math.min(total, shown + Math.max(24, Math.ceil(total / 40))); paint();
        if (shown < total) ws.timer = setTimeout(tick, 60 * speed);
        else step(() => { setSteps(root, 2); $('[data-message]', root).textContent = 'Sprawdzam strukturę odpowiedzi i sygnały wymagające uwagi…';
          step(() => { setSteps(root, 4); $('.oa-spinner', root).classList.add('stopped'); $('[data-message]', root).textContent = 'Odpowiedź gotowa do przeglądu. Pola wizyty pozostają bez zmian.';
            step(() => { state.job = null; clearInterval(ws.clock); review(result); }, 350); }, 650); }, 250); };
      tick(); }, 1400);
  }

  /* Recovery (ui/recovery.py): a report and explicit next steps, never an automatic resend. */
  const hexId = () => Array.from({length: 32}, () => (Math.random() * 16 | 0).toString(16)).join(''); // uuid4().hex
  const RUNTIME_KEY = {ChatGPT: 'chatgpt', Claude: 'claude.ai-pw', Gemini: 'gemini-pw', Lokalny: 'local'}; // ProviderSpec.runtime_key of the demo's routes
  function recoveryDialog(issue) {
    const writing = !!issue.writing, delivery = issue.delivery || 'unknown', backend = preferences.provider === 'Gemini' && preferences.transport === 'API' ? 'gemini' : RUNTIME_KEY[preferences.provider] || '';
    // enrich_recovery_issue: the sanitized rows in DIAGNOSTIC_LABELS order; the grid shows the compact captions.
    const rows = [['Wersja OpisAI', VERSION], ['ID zdarzenia', hexId()], ['ID operacji', issue.operation || hexId()], ['Etap', writing ? 'writing' : 'generating'], ...(backend ? [['Usługa', backend]] : []), ['Kod błędu', issue.code], ['Stan odpowiedzi', delivery, 'Odpowiedź']];
    const status = writing ? 'Wynik wpisania nie został potwierdzony. Sprawdź pola w Klinice i dziennik operacji. Nie ponawiaj wpisania automatycznie.' : {not_sent: 'Nie wysłano notatki do AI. Pola wizyty pozostają bez zmian.', not_retried: 'Nie wysłano notatki ponownie. Pola wizyty pozostają bez zmian.', received: 'Odebrano odpowiedź serwisu. Pola wizyty pozostają bez zmian. Nie wysłano notatki ponownie.'}[delivery] || 'Pola wizyty pozostają bez zmian. Nie ponawiam wysyłania automatycznie. Poprzednie żądanie mogło dotrzeć do serwisu.';
    const report = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
    const extra = `<div class="oa-mb-report"><div class="oa-mb-report-head"><strong>Raport diagnostyczny</strong>${linkButton('Do zdjęcia', 'photo', 'title="Pokaż pełny raport do zdjęcia; ukryj opis i zachowany tekst."')}${linkButton('Kopiuj raport', 'copy-report', 'aria-label="Kopiuj pełny raport diagnostyczny"')}</div><dl>${rows.map(([k, v, compact]) => `<dt title="${esc(k)}">${esc(compact || k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>${issue.note ? `${linkButton('Pokaż zachowaną notatkę', 'note')}<div class="oa-mb-note" data-note hidden><pre>${esc(issue.note)}</pre>${button('Kopiuj zachowaną notatkę', 'copy-note', 'small')}</div>` : ''}`;
    const act = () => { if (issue.action === 'review') retryGeneration(); else if (issue.action === 'fresh') { state.resume = null; describe(); } else if (issue.action === 'journal') messageBox({title: 'Dziennik', icon: 'info', text: 'Brak niezamkniętych lub niepotwierdzonych operacji.'}); };
    const buttons = [{label: 'Zamknij', action: 'close', default: true}, ...(issue.action ? [{label: issue.actionLabel, action: 'act', primary: true, onClick: act}] : [])];
    const box = messageBox({id: 'opisai-recovery', title: 'OpisAI — ' + (writing ? 'sprawdź wpisanie' : 'następny krok'), icon: 'warning', heading: issue.title, text: issue.explanation + '\n\n' + issue.next, informative: status, extra, buttons, width: 960});
    const root = box.content;
    bind(root, 'copy-report', () => copyText(report, $('[data-action="copy-report"]', root)));
    bind(root, 'photo', () => { const on = root.classList.toggle('oa-mb-photo'); $('[data-action="photo"]', root).textContent = on ? 'Wróć do opisu' : 'Do zdjęcia'; box.fit(); });
    bind(root, 'note', () => { const note = $('[data-note]', root), open = note.hidden; note.hidden = !open; $('[data-action="note"]', root).textContent = (open ? 'Ukryj' : 'Pokaż') + ' zachowaną notatkę'; box.fit(); });
    bind(root, 'copy-note', () => copyText(issue.note, $('[data-action="copy-note"]', root)));
    return box;
  }
  /* _retry_generation: read the visit again; resume the retained note only on the same, unchanged fields. */
  function retryGeneration() {
    const saved = state.resume; if (!saved) { describe(); return; }
    const conflict = reason => recoveryDialog({code: 'resume_context_changed', title: 'Sprawdź bieżącą wizytę', explanation: reason,
      next: 'Zachowaną notatkę możesz skopiować poniżej. Wczytaj bieżącą wizytę, aby zacząć od jej aktualnych pól. Nie przenoszę starej notatki do innej wizyty.', action: 'fresh', actionLabel: 'Wczytaj bieżącą wizytę', delivery: 'not_retried', note: saved.note});
    beginOperation();
    readVisit(() => {
      const ctx = window.Clinic?.getContext?.() || {}, now = getFields();
      if (!ctx.editorOpen) { conflict('Nie udało się ponownie odczytać podokna wizyty. Otwórz właściwe podokno w Klinice.'); return; }
      if (ctx.session !== saved.session || Object.keys(saved.snapshot).some(k => now[k] !== saved.snapshot[k])) { conflict('Zmieniło się okno docelowe, jego proces lub odczytane pola. Wczytaj je ponownie.'); return; }
      openCompose({field: saved.field, snapshot: saved.snapshot, sources: saved.texts, variant: saved.variant, session: saved.session});
    }, () => conflict('Anulowano sprawdzenie wizyty. Zachowana notatka nie została wysłana ponownie.'));
  }
  /* SafeCoordinator._call_read: DocumentWorkspace(reading=True) while the fields are read. Anuluj or the
   * window's × only requests cancellation (a COM read cannot be killed); the caller then gets Cancelled. */
  function readVisit(done, cancelled) {
    const ws = {finished: false, cancelling: false}; let win = null;
    const cancel = () => { if (ws.finished || ws.cancelling) return false; ws.cancelling = true; $('[data-action="cancel"]', win.content).disabled = true; $('[data-heading]', win.content).textContent = 'Anuluję operację'; $('[data-message]', win.content).textContent = 'Wynik nie zostanie wpisany. Czekam, aż bieżący transport zwolni zasoby.'; return false; };
    win = makeWindow('opisai-progress', 'OpisAI — odczyt wizyty', 740, 540, progressHtml('reading'), () => ws.finished ? undefined : cancel());
    ws.win = win; state.active = win; startClock(ws, win.content); bind(win.content, 'cancel', cancel);
    ws.timer = setTimeout(() => { ws.finished = true; clearInterval(ws.clock); win.close(); if (state.active === win) state.active = null; (ws.cancelling ? cancelled : done)?.(); }, 500 * docSpeed());
  }

  /* Message boxes (ui/shell.py MessageBox): icon, heading, text, optional technical details. */
  /* shell.NoticeIcon: severity by shape and glyph in its colour on a light tint, no external assets. */
  function noticeIcon(kind) {
    const shape = kind === 'warning' ? '<path d="M18 3 34 31H2Z"/>' : '<circle cx="18" cy="18" r="15"/>';
    const glyph = kind === 'warning' ? '<path d="M18 13v9M18 27v.01"/>' : kind === 'critical' ? '<path d="M12 12l12 12M24 12 12 24"/>' : kind === 'question' ? '<text x="18" y="26" text-anchor="middle" font-size="23" font-weight="700" fill="currentColor" stroke="none">?</text>' : '<path d="M18 11v.01M18 17v8"/>';
    return `<svg class="oa-mb-icon ${kind}" width="36" height="36" viewBox="0 0 36 36" role="img" aria-label="${{warning: 'Ostrzeżenie', critical: 'Błąd', question: 'Pytanie'}[kind] || 'Informacja'}"><g fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-width="1.8">${shape}</g><g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round">${glyph}</g></svg>`;
  }
  /* Message boxes (ui/shell.py MessageBox): icon, heading, text, optional technical details; the window fits its content. */
  function messageBox({id = 'opisai-message', title, icon: kind = 'info', heading, text, informative = '', details = '', extra = '', buttons = [{label: 'OK', action: 'close', primary: true, default: true}], width = 760, onClose = null}) {
    heading = heading ?? ({warning: 'Sprawdź przed kontynuacją', critical: 'Nie udało się wykonać operacji', question: 'Potwierdzenie'}[kind] || 'Informacja');
    const html = `<div class="oa-app oa-mb"><div class="oa-mb-body">${noticeIcon(kind)}<div class="oa-mb-words"><h2>${esc(heading)}</h2><p class="oa-mb-text">${esc(text)}</p>${informative ? `<p class="oa-mb-info">${esc(informative)}</p>` : ''}${details ? `<div class="oa-mb-details" data-details hidden><div class="oa-mb-details-head"><span class="oa-muted">Szczegóły techniczne</span>${linkButton('Kopiuj', 'copy-details')}</div><pre>${esc(details)}</pre></div>` : ''}${extra}</div></div><footer class="oa-footer oa-mb-footer">${details ? linkButton('Pokaż szczegóły', 'toggle-details', 'aria-label="Rozwiń szczegóły techniczne"') : ''}<span class="oa-pg-gap"></span>${buttons.map(b => button(esc(b.label), 'mb-' + b.action, b.primary ? 'primary' : '')).join('')}</footer></div>`;
    closeWin(id);
    const estimate = 150 + 22 * (lines(text) + Math.ceil(String(text).length / 90) + (informative ? 2 : 0)) + (extra ? 160 : 0);
    const win = makeWindow(id, title, width, Math.min(640, estimate), html, () => { if (!box.done) { box.done = true; onClose?.(null); } });
    if (win.options) win.options.minHeight = Math.min(win.options.minHeight ?? 200, 180);
    const root = win.content, box = {win, content: root, done: false, close: () => win.close(), fit: () => requestAnimationFrame(() => { // CompactDialog._fit_content: the natural height of the content
      const inner = $('.oa-mb', root), body = $('.oa-mb-body', root); if (!inner || !body || !win.el?.isConnected || win.maximized) return;
      const chrome = win.el.offsetHeight - root.clientHeight; inner.style.height = 'auto'; inner.style.flex = body.style.flex = 'none';
      const natural = inner.offsetHeight; inner.style.height = inner.style.flex = body.style.flex = '';
      win.setBounds?.({height: Math.min(innerHeight - 60, chrome + natural)});
    })};
    for (const b of buttons) bind(root, 'mb-' + b.action, () => { box.done = true; win.close(); b.onClick?.(); onClose?.(b.action); });
    bind(root, 'toggle-details', () => { const d = $('[data-details]', root), open = d.hidden; d.hidden = !open; const t = $('[data-action="toggle-details"]', root); t.textContent = open ? 'Ukryj szczegóły' : 'Pokaż szczegóły'; t.setAttribute('aria-label', open ? 'Zwiń szczegóły techniczne' : 'Rozwiń szczegóły techniczne'); box.fit(); });
    bind(root, 'copy-details', () => copyText(details, $('[data-action="copy-details"]', root)));
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); win.close(); } });
    box.fit(); setTimeout(() => $(`[data-action="mb-${(buttons.find(b => b.default) || buttons.at(-1)).action}"]`, root)?.focus(), 0);
    return box;
  }

  /* Review (ui/review.py ReviewPage with ui/structured_review.py): the proposal as fixed subsection
   * headings, panel rows with their origin and AI inference blocks; notes, field choice, approval. */
  /* review._transcription_metadata: the recorded session (TranscriptionSource), never the generation settings. */
  function transcriptionMetadata(source) {
    if (!source) { const missing = 'Brak informacji o transkrypcji'; return {main: missing, details: missing, tooltip: 'Nie zapisano danych źródłowych tej sesji dyktowania.'}; }
    if (source.backend === 'chatgpt_browser') return {main: 'Transkrypcja: ChatGPT w przeglądarce · model niepotwierdzony', details: 'Silnik: ChatGPT — dyktowanie w przeglądarce (próba)\nModel: niepotwierdzony\nJęzyk: ustawienie w ChatGPT\nTryb: dyktowanie do pola wiadomości',
      tooltip: 'Tekst odczytano z dyktowania w zalogowanym ChatGPT. Interfejs WWW nie potwierdza użytego modelu rozpoznawania mowy. Tekst może pojawić się dopiero po zakończeniu nagrania.'};
    const engine = {gemini: 'Gemini Live', local_whisper: 'Lokalny Whisper'}[source.backend] || String(source.backend || ''), raw = String(source.language || '').trim(), lower = raw.toLowerCase();
    const language = lower === 'pl' || lower === 'pl-pl' ? 'Polski (pl-PL)' : source.backend === 'local_whisper' && (!lower || lower === 'auto') ? 'Automatyczny (auto)' : raw || 'Brak informacji o ustawieniu';
    const mode = {transcribe: 'Transkrypcja (transcribe)', agent: 'Asystent głosowy (agent)', realtime: 'Transkrypcja lokalna na żywo (realtime)', whisper_cpp: 'Transkrypcja lokalna (whisper_cpp)'}[source.mode] || String(source.mode || '');
    const rows = [`Silnik: ${engine}`, `Model sesji: ${source.model}`, `Język ustawiony: ${language}`, `Tryb: ${mode}`, ...(source.realtime_model ? ['Model podglądu na żywo: ' + source.realtime_model] : [])];
    return {main: `Transkrypcja: ${engine} · Model sesji: ${source.model}\nJęzyk ustawiony: ${language}`, details: rows.join('\n'),
      tooltip: (source.backend === 'gemini' ? 'Model sesji to identyfikator zaakceptowany przy połączeniu Gemini Live.' : 'Model sesji to identyfikator modelu pomyślnie zainicjalizowanego przez lokalny silnik.') + ' Nie jest to niezależna weryfikacja tożsamości modelu. Język jest ustawieniem lub podpowiedzią tej sesji, a nie wykrytym językiem nagrania.'};
  }
  function dictationSourceFallback() { // a result without its TranscriptionSource: the configured engine
    const engine = String(preferences.transcriber || '');
    if (/gemini/i.test(engine)) return {backend: 'gemini', model: 'gemini-3.5-transcribe-live', language: 'pl-PL', mode: 'transcribe', realtime_model: ''};
    if (/whisper/i.test(engine)) return {backend: 'local_whisper', model: 'large-v3', language: 'pl', mode: 'realtime', realtime_model: 'small'};
    return {backend: 'chatgpt_browser', model: '', language: 'auto', mode: 'dictation', realtime_model: ''};
  }
  function prepareReview(result) {
    result.outcome = null; result.error = ''; result.ack = false;
    if (result.keys) return result;
    if (result.mode === 'dictation') { // the dictation summary: one plain field, its transcript as the source
      const key = result.field, text = String(result.output?.[key] ?? ''), before = String(result.snapshot?.[key] ?? ''), source = result.transcription?.backend ? result.transcription : null;
      // The request's sent source: the transcript (with the edited text for a continuation), as the session reports it.
      const sent = source && typeof result.sources?.[key] === 'string' ? result.sources[key] : before && text.startsWith(before) ? text.slice(before.length).trim() : text;
      Object.assign(result, {keys: [key], edited: {[key]: text}, original: {[key]: text}, captions: {[key]: 'Dyktowanie — ' + DOC_SECTION[key]}, full: {[key]: 'Dyktowanie — ' + DOC_SECTION[key]},
        sent, selected: [key], compare: {[key]: true}, previewing: {}, tab: key, context: result.context || clinicTitle(), transcriptionView: transcriptionMetadata(source || dictationSourceFallback())});
      return result;
    }
    const g = result.generated;
    Object.assign(result, {doc: Doc().reviewDocument(g), keys: g.sections.map(s => s.key), captions: Object.fromEntries(g.sections.map(s => [s.key, s.tab])), full: Object.fromEntries(g.sections.map(s => [s.key, s.label])),
      original: Object.fromEntries(g.sections.map(s => [s.key, s.text])), sent: Doc().sentSource(g.request.sources), selected: g.sections.map(s => s.key), compare: {},
      previewing: Object.fromEntries(Object.keys(g.removed).map(k => [k, true])), tab: g.sections[0]?.key});
    return result;
  }
  const fieldText = (result, key) => result.doc ? result.doc.renderField(key) : String(result.edited[key] ?? '');
  function review(result) {
    if (!result) return;
    prepareReview(result);
    if (!result.keys.length) { state.review = null; setPhase('idle'); toast('Brak treści do sprawdzenia. Uzupełnij źródła.'); return; }
    state.review = result; state.operation = null; setPhase('review');
    const title = `OpisAI ${VERSION} — sprawdź i zatwierdź wynik`, html = reviewHtml(result);
    let ws = workspace && !workspace.finished && result.mode === 'generation' && workspace.win.el?.isConnected ? workspace : null;
    if (ws) { ws.win.setTitle(title); ws.win.setContent(html); }
    else ws = openWorkspace(title, 1000, 560, html);
    ws.onClose = () => { rejectReview(result, ws, true); };
    state.active = ws.win;
    if (!result.historyId) recordHistory(result, 'generated');
    reviewView(result, ws);
  }
  function reviewHtml(result) {
    const dict = result.mode === 'dictation', g = result.generated, tm = result.transcriptionView;
    const info = 'Sprawdź fakty, liczby i negacje. Treść „Do wpisania” możesz poprawić — właśnie ten tekst trafi do pola.' + (g?.findings.some(f => f.code === 'inference_review') ? ' Sprawdź także rozpoznania i propozycje AI.' : '');
    const footer = dict ? `${button('Wpisz samą notatkę', 'apply', '', '', 'disabled title="Wpisz sprawdzoną treść do wybranych pól bez generowania opisu."')}${button('Odrzuć', 'reject')}<span class="oa-footnote oa-rv-dnote">Wpisanie do pól nie zapisuje wizyty w Klinice.</span><span class="oa-pg-gap"></span>${button('Kontynuuj dyktowanie', 'continue', '', '', 'title="Wróć do dyktowania w wybranym polu, zachowując poprawiony tekst."')}${button('Generuj opis', 'compose', 'primary', '', 'title="Otwórz przygotowanie opisu z bieżącą treścią wybranych pól. W następnym oknie wybierzesz wariant, sprawdzisz źródła i rozpoczniesz generowanie."')}`
      : `<span class="oa-footnote oa-rv-note">Wpisanie do pól nie zapisuje wizyty w Klinice.</span>${button('Odrzuć', 'reject')}${button('✓&nbsp; Wpisz do pól', 'apply', 'primary', '', 'disabled')}`;
    return `<div class="oa-app oa-rv"><div class="oa-rv-head"><div class="oa-muted oa-rv-line" title="${esc(result.context)}&#10;Okno, z którego odczytano pola do tego podglądu.">${esc(result.context)}</div><div class="oa-rv-summary"><span data-summary></span>${dict ? '' : '<span class="oa-muted oa-rv-model" title="Model: przykład demonstracyjny — bez AI&#10;Nazwa zgłoszona przez transport, nie niezależna weryfikacja modelu.">Model: przykład demonstracyjny — bez AI</span>'}</div>${dict ? `<div class="oa-muted oa-rv-pre" title="${esc(tm.tooltip)}">${esc(tm.main)}</div>` : ''}<div class="oa-muted oa-rv-info">${esc(info)}</div><div class="oa-muted" data-components hidden></div><div class="oa-rv-notes" data-notes hidden><div class="oa-rv-notes-row"><span data-notes-count></span>${button('Szczegóły uwag', 'notes', 'small', '', 'aria-label="Pokaż wszystkie uwagi do treści"')}</div><div data-note-list></div></div></div><div class="oa-tabs oa-rv-tabs" role="tablist" aria-label="Pola wyniku" data-tabs></div><div class="oa-rv-body" data-body></div>${g?.request.panel ? '<div class="oa-muted oa-rv-pstatus" data-panel-status></div>' : ''}<label class="oa-ack" data-allow-row hidden><input type="checkbox" data-allow-empty><span>Zezwalam na wyczyszczenie pola, dla którego zatwierdzony wynik jest pusty.</span></label><label class="oa-ack"><input type="checkbox" id="oa-review-ack" data-review-ack><span>${dict ? 'Transkrypcja i właściwa wizyta sprawdzone. Zatwierdzam wpisanie tej notatki.' : 'Tekst przygotowany przez AI i właściwa wizyta sprawdzone. Zatwierdzam dokładnie te zmiany.'}</span></label><div class="oa-c2-error" data-review-error role="alert" hidden></div><footer class="oa-footer oa-rv-footer">${footer}</footer></div>`;
  }
  function reviewNotes(result) { // QualityNote list: unresolved panel rows, then preservation issues of the selected write
    const notes = [];
    if (result.doc) {
      for (const b of result.doc.panelIssues(result.selected)) notes.push({key: 'panel:' + b.id, title: 'Parametr ' + (b.metadata.label || ''), quote: b.metadata.quotes?.[0] || b.text, message: Doc().panelIssueDescription(b.metadata) || 'Wartość parametru jest niejednoznaczna.', block: b.id, target: b.target});
      const edited = Object.fromEntries(result.keys.map(k => [k, fieldText(result, k)]));
      result.preservation = Doc().checkPreservation(result.generated.contract, result.snapshot, edited, result.selected);
      for (const i of result.preservation.issues) notes.push({key: i.id, title: i.source_label, quote: i.quote, message: i.message, field: Object.keys(DOC_FIELD).find(k => DOC_FIELD[k] === i.source_label)});
    }
    return notes;
  }
  function controlsText(result) {
    const g = result.generated, parts = [], issues = result.preservation?.issues || [];
    if (g?.findings.length) parts.push('Kontrole odpowiedzi AI przed ręcznymi zmianami:\n\n' + g.findings.map(f => f.message + (f.evidence ? '\nŹródło: ' + f.evidence : '')).join('\n\n'));
    if (issues.length) parts.push('Zachowanie wzmianek w bieżącym wyniku:\n\n' + issues.map(i => `${i.source_label}: „${i.quote}”\n${i.message}`).join('\n\n'));
    if (result.error) parts.push('Nie można zatwierdzić wyniku:\n\n' + result.error);
    return {text: parts.join('\n\n') || 'Automatyczne kontrole nie wykryły ostrzeżeń. To nie dowodzi poprawności treści.', count: (g?.findings.length || 0) + issues.length};
  }
  function structuredEditorHtml(result, key) {
    const doc = result.doc, selected = result.selected.includes(key), ro = selected ? '' : 'readonly';
    return doc.fieldLeaves(key).map(leaf => {
      const blocks = leaf.blocks.map(id => doc.blocks.get(id)), opens = [], body = [];
      for (const b of blocks) {
        const bid = esc(b.id), caption = esc(blockCaption(doc, b)), tip = esc(blockTooltip(b));
        if (b.kind === 'panel_row') {
          body.push(`<div class="oa-se-row"><label class="oa-se-name" for="oa-b-${bid}">${esc(b.metadata.label || 'Parametr')}</label><input id="oa-b-${bid}" type="text" data-block="${bid}" value="${esc(b.text)}" ${ro} title="${tip}" aria-label="${esc(leaf.name + ' — ' + (b.metadata.label || 'Parametr'))}"><span class="oa-se-origin" data-origin="${bid}" title="${tip}">${caption}</span></div>`);
          if (Doc().blockNeedsReview(b)) { const issue = Doc().panelIssueDescription(b.metadata); if (issue) body.push(`<div class="oa-se-issue">${esc(issue)}</div>`); }
          continue;
        }
        const blank = Doc().originallyBlank(b), open = !blank || !!b.text.trim() || result.opened?.[b.id];
        if (blank) opens.push(`<button type="button" class="oa-link-btn" data-open="${bid}" ${open ? 'hidden' : ''} ${selected ? '' : 'disabled'}>${b.kind === 'inference' ? 'Dodaj wniosek' : 'Dodaj treść'}</button>`);
        const placeholder = blank ? (b.kind === 'inference' ? 'Wpisz własną ocenę lub wniosek' : 'Wpisz własne uzupełnienie opisu') : selected ? 'Tutaj możesz poprawić wynik przed wpisaniem.' : 'Propozycja nie jest wybrana do wpisania.';
        body.push(`<div class="oa-se-block" data-row="${bid}" ${open ? '' : 'hidden'}><div class="oa-se-bhead">${b.kind === 'inference' ? '<span class="oa-muted">Wnioskowanie</span>' : ''}<span class="oa-pg-gap"></span><span class="oa-se-origin" data-origin="${bid}" title="${tip}">${caption}</span>${blank ? `<button type="button" class="oa-link-btn" data-dismiss="${bid}" ${selected ? '' : 'disabled'}>${b.text.trim() ? 'Usuń' : 'Anuluj'}</button>` : ''}</div><textarea data-block="${bid}" spellcheck="false" rows="${Math.min(7, Math.max(2, lines(b.text)))}" placeholder="${esc(placeholder)}" ${ro} title="${tip}" aria-label="${esc(leaf.name + (b.kind === 'inference' ? ' — wnioskowanie' : ' — treść'))}">${esc(b.text)}</textarea></div>`);
        if (blank && !b.text && result.removedText?.[b.id] !== undefined) body.push(`<button type="button" class="oa-link-btn oa-se-undo" data-undo-removal="${bid}" ${selected ? '' : 'disabled'} aria-label="${esc('Cofnij usunięcie: ' + leaf.name + (b.kind === 'inference' ? ' — wnioskowanie' : ' — treść'))}">${b.kind === 'inference' ? 'Cofnij usunięcie wniosku' : 'Cofnij usunięcie treści'}</button>`);
      }
      return `<div class="oa-se-leaf"><div class="oa-se-title"><strong>${esc(leaf.name)}</strong><span class="oa-pg-gap"></span>${opens.join('')}</div>${body.join('')}</div>`;
    }).join('');
  }
  function blockCaption(doc, b) { const caption = Doc().originCaption(b); return Doc().blockNeedsReview(b) && caption !== 'Uwaga' ? caption + ' · uwaga' : caption; }
  function blockTooltip(b) {
    let details = (b.metadata.quotes || []).join('\n'); const original = String(b.metadata.original_text ?? '');
    if (original.trim() && b.text !== original) details = 'Pierwotna propozycja: ' + original + (details ? '\n' + details : '');
    const issues = Doc().panelIssueDescription(b.metadata); if (issues) details += (details ? '\n' : '') + issues;
    return details;
  }
  function removalPreviewHtml(result, key) { // InlineRemovalPreview: removed repetitions struck through until the field is edited
    const g = result.generated, section = g.sections.find(s => s.key === key), removed = g.removed[key];
    return `<div class="oa-rv-preview" tabindex="0" aria-label="Podgląd z usuniętymi powtórzeniami: ${esc(result.full[key])}">${section.leaves.map(l => {
      const panel = l.panel ? g.panel.text : '', narrative = l.id === removed.leaf ? removed.pieces.map(p => p.removed ? `<del>${esc(p.text)}</del>` : esc(p.text)).join('').trim() : esc(l.text);
      const body = [esc(panel), narrative, esc(l.inference)].filter(x => x.trim()).join('\n\n'); return body ? `${esc(l.name)}:\n${body}` : '';
    }).filter(Boolean).join('\n\n')}</div>`;
  }
  function reviewView(result, ws) {
    const root = ws.win.content, dict = result.mode === 'dictation', g = result.generated, ack = $('[data-review-ack]', root), allow = $('[data-allow-empty]', root), apply = $('[data-action="apply"]', root);
    let details = 'source', notesOpen = false;
    const tabsEl = $('[data-tabs]', root), body = $('[data-body]', root);
    function updateChrome() {
      const n = result.selected.length, total = result.keys.length, notes = reviewNotes(result), controls = controlsText(result);
      $('[data-summary]', root).textContent = (dict ? 'Dyktowanie · ' : `Podgląd · ${result.variant.rich ? 'Bogato' : 'Wiernie'} · `) + `Do wpisania: ${n}/${total} pól`;
      const inference = result.doc?.inferenceCount || 0, components = $('[data-components]', root); components.textContent = inference ? `Wnioskowanie: ${inference} fragmentów` : ''; components.hidden = !inference;
      const box = $('[data-notes]', root); box.hidden = !notes.length;
      $('[data-notes-count]', root).textContent = `Uwagi do treści: ${notes.length} · informacyjne, nie blokują wpisania`;
      $('[data-action="notes"] span', root).textContent = notesOpen ? 'Wróć do wyniku' : notes.length > 2 ? `Pokaż wszystkie (${notes.length})` : 'Szczegóły uwag';
      $('[data-note-list]', root).innerHTML = notes.slice(0, 2).map(note => `<div class="oa-rv-note"><span class="oa-rv-ellipsis" title="${esc(note.title + '\n' + note.quote + '\n' + note.message)}">${esc(note.title + (note.quote ? ': „' + note.quote + '”' : '') + ' — ' + note.message.split('\n')[0])}</span>${linkButton('Pokaż w tekście', 'note-' + note.key.replace(/[^\w:-]/g, '_'), `data-note="${esc(note.key)}" aria-label="${esc('Pokaż w tekście: ' + note.title + ' ' + note.quote)}"`)}</div>`).join('');
      $$('[data-note]', $('[data-note-list]', root)).forEach(el => el.addEventListener('click', () => showNote(notes.find(x => x.key === el.dataset.note))));
      result.notes = notes; if (!notes.length && notesOpen) { notesOpen = false; draw(); }
      tabsEl.innerHTML = [...result.keys.map(k => `<button type="button" role="tab" class="oa-tab ${result.tab === k && !notesOpen ? 'active' : ''}" data-tab="${k}" aria-selected="${result.tab === k}" title="${esc(result.full[k] + (result.selected.includes(k) ? '' : ' — Pole pozostanie bez zmian'))}">${esc(result.captions[k] + (result.selected.includes(k) ? '' : ' · bez zmian'))}</button>`),
        `<button type="button" role="tab" class="oa-tab ${result.tab === 'details' ? 'active' : ''}" data-tab="details" aria-selected="${result.tab === 'details'}" title="Źródło, parametry i kontrole — ${controls.count} uwag do sprawdzenia">Szczegóły${!dict && controls.count ? ' · ' + controls.count : ''}</button>`].join('');
      tabsEl.hidden = notesOpen;
      $$('[data-tab]', tabsEl).forEach(tab => tab.addEventListener('click', () => { result.tab = tab.dataset.tab; draw(); }));
      apply.disabled = !(n && ack.checked); $('span', apply).innerHTML = dict ? 'Wpisz samą notatkę' : n === total ? '✓&nbsp; Wpisz do pól' : `✓&nbsp; Wpisz wybrane (${n})`;
      if (dict) { const fields = result.selected.filter(k => String(result.edited[k]).trim()); $('[data-action="compose"]', root).disabled = !fields.length; $('[data-action="continue"]', root).disabled = result.selected.length !== 1; }
      $('[data-allow-row]', root).hidden = !result.selected.some(k => String(result.snapshot[k] || '').trim() && !fieldText(result, k).trim());
      const status = $('[data-panel-status]', root); if (status) status.textContent = 'Panel parametrów jest częścią opisu badania.' + (Object.values(result.previewing).some(Boolean) ? ' Przekreślone fragmenty nie trafią do pola.' : '');
      const err = $('[data-review-error]', root); err.hidden = !result.error; err.textContent = result.error;
      if (result.tab === 'details' && details === 'controls' && !notesOpen) { const t = $('[data-controls]', body); if (t && t.value !== controls.text) t.value = controls.text; }
    }
    function changed() { ack.checked = false; allow.checked = false; result.error = ''; updateChrome(); } // ReviewPage._changed
    function draw() {
      if (notesOpen) { body.innerHTML = notesHtml(); bindNotes(); updateChrome(); return; }
      const key = result.tab;
      if (key === 'details') { body.innerHTML = detailsHtml(); bindDetails(); updateChrome(); return; }
      const selected = result.selected.includes(key), compare = !!result.compare[key], previewing = result.previewing[key], caption = result.full[key];
      const action = selected ? 'Pozostaw bez zmian' : 'Użyj propozycji', short = selected ? 'Pomiń' : 'Wybierz';
      const editor = dict ? `<textarea class="oa-rv-plain" data-plain="${key}" spellcheck="false" ${selected ? '' : 'readonly'} placeholder="${selected ? 'Tutaj możesz poprawić wynik przed wpisaniem.' : 'Propozycja nie jest wybrana do wpisania.'}" aria-label="Dokładna treść do wpisania: ${esc(caption)}">${esc(result.edited[key])}</textarea>` : previewing ? removalPreviewHtml(result, key) : `<div class="oa-se" role="group" aria-label="Dokładna treść do wpisania: ${esc(caption)}">${structuredEditorHtml(result, key)}</div>`;
      body.innerHTML = `<div class="oa-rv-field">${dict ? `<div class="oa-rv-status"><span class="oa-muted">${selected ? 'Do wpisania' : 'Pole pozostanie bez zmian'}</span>${linkButton(action, 'toggle-field', `aria-label="${esc(action + ': ' + result.captions[key])}"`)}</div>` : ''}<div class="oa-rv-split ${compare ? 'comparing' : ''}"><section class="oa-rv-compare" ${compare ? '' : 'hidden'}><select data-compare-kind aria-label="Rodzaj porównania: ${esc(caption)}" title="Zatwierdzone źródła lub wcześniejsza zawartość pola: ${esc(caption)}"><option value="sources">Źródła użyte do przygotowania</option><option value="before">Pole przed wpisaniem</option></select><textarea readonly data-compare-text spellcheck="false" aria-label="Zatwierdzone źródła użyte do przygotowania: ${esc(caption)}">${esc(result.sent)}</textarea></section><section class="oa-rv-output"><div class="oa-rv-outhead"><span class="oa-muted" title="Edytowalny wynik dla pola: ${esc(caption)}">${selected ? 'Do wpisania' : 'Odebrana propozycja'}</span><span class="oa-pg-gap"></span>${dict ? '' : linkButton(short, 'toggle-field', `aria-label="${esc(action + ': ' + result.captions[key])}" title="${esc(action + ': ' + result.captions[key])}"`) + linkButton(compare ? 'Ukryj porównanie' : 'Porównaj', 'compare')}${previewing ? linkButton('Edytuj', 'edit-field', `aria-label="Edytuj tekst do wpisania: ${esc(caption)}" title="Popraw tekst po usunięciu powtórzeń. Przekreślone fragmenty znikną z podglądu." ${selected ? '' : 'disabled'}`) : ''}${linkButton('Kopiuj', 'copy-field')}</div><div class="oa-rv-editor">${editor}</div></section></div></div>`;
      bindField(key); updateChrome();
    }
    function bindField(key) {
      bind(body, 'toggle-field', () => { result.selected = result.selected.includes(key) ? result.selected.filter(k => k !== key) : result.keys.filter(k => k === key || result.selected.includes(k)); changed(); draw(); });
      bind(body, 'compare', () => { result.compare[key] = !result.compare[key]; draw(); });
      bind(body, 'edit-field', () => { result.previewing[key] = false; draw(); $('[data-block]', body)?.focus(); });
      bind(body, 'copy-field', () => copyText(fieldText(result, key), $('[data-action="copy-field"]', body)));
      $('[data-compare-kind]', body)?.addEventListener('change', e => { const t = $('[data-compare-text]', body); t.value = e.target.value === 'before' ? result.snapshot[key] || '' : result.sent; t.setAttribute('aria-label', (e.target.value === 'before' ? 'Przed zmianą: ' : 'Zatwierdzone źródła użyte do przygotowania: ') + result.full[key]); });
      $('[data-plain]', body)?.addEventListener('input', e => { result.edited[key] = e.target.value; changed(); });
      $$('[data-block]', body).forEach(el => el.addEventListener('input', () => {
        if (result.removedText) delete result.removedText[el.dataset.block]; // a new edit invalidates the inline undo
        if (!result.doc.edit(el.dataset.block, el.value)) return;
        const b = result.doc.blocks.get(el.dataset.block); $$(`[data-origin="${CSS.escape(b.id)}"]`, body).forEach(o => { o.textContent = blockCaption(result.doc, b); o.title = blockTooltip(b); });
        const dismiss = $(`[data-dismiss="${CSS.escape(b.id)}"]`, body); if (dismiss) dismiss.textContent = b.text.trim() ? 'Usuń' : 'Anuluj';
        changed();
      }));
      $$('[data-open]', body).forEach(el => el.addEventListener('click', () => { (result.opened ||= {})[el.dataset.open] = true; el.hidden = true; const row = $(`[data-row="${CSS.escape(el.dataset.open)}"]`, body); row.hidden = false; $('textarea', row).focus(); }));
      $$('[data-dismiss]', body).forEach(el => el.addEventListener('click', () => { // "Usuń" keeps the removed text for "Cofnij usunięcie…" until the next edit
        const id = el.dataset.dismiss, text = result.doc.blocks.get(id).text; if (result.opened) delete result.opened[id];
        if (text.trim()) (result.removedText ||= {})[id] = text; if (result.doc.edit(id, '')) changed(); draw(); $(`[data-open="${CSS.escape(id)}"]`, body)?.focus(); }));
      $$('[data-undo-removal]', body).forEach(el => el.addEventListener('click', () => {
        const id = el.dataset.undoRemoval, text = result.removedText?.[id]; if (text === undefined) return; delete result.removedText[id];
        (result.opened ||= {})[id] = true; if (result.doc.edit(id, text)) changed(); draw(); $(`textarea[data-block="${CSS.escape(id)}"]`, body)?.focus(); }));
    }
    function detailsHtml() {
      const controls = controlsText(result), tabs = [['source', 'Źródło'], ...(dict ? [['transcription', 'Transkrypcja']] : []), ...(g?.request.panel ? [['params', 'Parametry']] : []), ['controls', 'Kontrole' + (controls.count ? ' · ' + controls.count : '')]];
      if (!tabs.some(t => t[0] === details)) details = 'source';
      let page = '';
      if (details === 'source') page = `<textarea readonly class="oa-rv-doc" aria-label="Zatwierdzone źródło wysłane do AI">${esc(dict ? result.sent : result.sent)}</textarea>`;
      else if (details === 'transcription') page = `<textarea readonly class="oa-rv-doc" title="${esc(result.transcriptionView.tooltip)}" aria-label="Źródło transkrypcji i ustawienia sesji">${esc(result.transcriptionView.details)}</textarea>`;
      else if (details === 'params') page = `<div class="oa-rv-params" tabindex="0" aria-label="Pochodzenie parametrów w panelu"><p class="oa-muted">Pochodzenie wartości w przygotowanym panelu. Treść możesz poprawić w zakładce badania; poniżej pozostaną źródła pierwotnej propozycji.</p>${g.panel.rows.map(row => {
          let origin = {source: 'Z notatki', template: 'Z ustawionego wzorca', missing: 'Brak wartości w notatce i wzorcu', unverified: 'AI wskazało wzmiankę, której nie ma dosłownie w notatce'}[row.origin] || 'Źródło nieokreślone';
          if (row.origin === 'source' && row.attribution === 'ai') origin += ' · fragment wskazany przez AI, sprawdzony dosłownie'; if (row.respelled) origin += ' · pisownia poprawiona przez AI, sprawdzona słowo po słowie'; if (row.needs_review) origin += ' · do sprawdzenia';
          const quotes = [...row.quotes.map(q => `Źródło: „${q}”`), Doc().panelIssueDescription(row)].filter(Boolean).join('\n');
          return `<div class="oa-rv-param"><div>${esc(row.label + ': ' + row.value)}</div><div class="oa-muted">${esc(origin + (quotes ? '\n' + quotes : ''))}</div></div>`; }).join('')}</div>`;
      else page = `<textarea readonly class="oa-rv-doc" data-controls aria-label="Wyniki automatycznych kontroli">${esc(controls.text)}</textarea>`;
      return `<div class="oa-rv-details"><div class="oa-rv-dhead" ${details === 'source' && !dict ? '' : 'hidden'}><span class="oa-muted">Źródło, parametry i automatyczne kontrole wyniku.</span><span class="oa-pg-gap"></span>${linkButton('Pokaż polecenie i odpowiedź', 'exchange')}</div><div class="oa-tabs oa-rv-subtabs" role="tablist" aria-label="Szczegóły przygotowania wyniku">${tabs.map(([id, label]) => `<button type="button" role="tab" class="oa-tab ${details === id ? 'active' : ''}" data-details="${id}" aria-selected="${details === id}">${esc(label)}</button>`).join('')}</div><div class="oa-rv-dbody">${page}</div></div>`;
    }
    function bindDetails() { $$('[data-details]', body).forEach(t => t.addEventListener('click', () => { details = t.dataset.details; draw(); })); bind(body, 'exchange', () => exchangeDialog(result)); }
    function notesHtml() {
      return `<div class="oa-rv-notelist" tabindex="0" aria-label="Uwagi do treści — informacyjne, nie blokują wpisania"><p class="oa-muted">Uwagi są informacyjne. Możesz poprawić treść lub zatwierdzić bieżący wynik.</p>${(result.notes || reviewNotes(result)).map(note => `<div class="oa-rv-notecard"><div class="oa-muted">${esc(note.title)}</div><div>${esc(note.quote ? '„' + note.quote + '”' : 'Pusta wartość')}</div><div class="oa-rv-notemsg">${esc(note.message)}</div><div>${button('Pokaż w tekście', 'show-note', 'small', '', `data-note="${esc(note.key)}"`)}</div></div>`).join('')}<p class="oa-muted">${esc(Doc().PRESERVATION_LIMITS)}</p></div>`;
    }
    function bindNotes() { $$('[data-note]', body).forEach(el => el.addEventListener('click', () => showNote((result.notes || []).find(x => x.key === el.dataset.note)))); }
    function showNote(note) {
      if (!note) return; notesOpen = false;
      const key = note.target || (note.field && result.keys.includes(note.field) && result.selected.includes(note.field) ? note.field : result.selected.find(k => k === result.tab) || result.selected[0]);
      if (!key) { draw(); return; }
      result.tab = key; result.previewing[key] = false; draw();
      const target = note.block ? $(`[data-block="${CSS.escape(note.block)}"]`, body) : $('[data-block]:not([readonly])', body) || $('[data-plain]', body);
      target?.focus(); target?.scrollIntoView?.({block: 'center'});
    }
    bind(root, 'notes', () => { notesOpen = !notesOpen && !!(result.notes || []).length; draw(); });
    ack.addEventListener('change', () => { result.ackRevision = ack.checked ? (result.doc?.revision ?? 0) + ':' + result.selected.join(',') : null; if (ack.checked) { result.error = ''; } updateChrome(); });
    allow.addEventListener('change', () => { ack.checked = false; updateChrome(); });
    bind(root, 'reject', () => rejectReview(result, ws));
    bind(root, 'apply', () => approveReview(result, ws, ack, allow, updateChrome));
    bind(root, 'compose', () => { const fields = Object.fromEntries(result.selected.filter(k => String(result.edited[k]).trim()).map(k => [k, result.edited[k]])); if (!Object.keys(fields).length || !completeReview(result, 'regenerate', ws)) return; composeFromDictation(result, fields); });
    bind(root, 'continue', () => { const key = result.selected[0]; if (result.selected.length !== 1 || !completeReview(result, 'continue', ws)) return; dictate({field: key, base: result.edited[key], snapshot: result.snapshot, session: result.session, continuation: true, direct: true, review: result}); });
    draw();
    setTimeout(() => ($('[data-block]:not([readonly]), [data-plain], .oa-rv-preview', body))?.focus({preventScroll: true}), 0);
  }
  function completeReview(result, outcome, ws, closing = false) { // one outcome; the host closes after it
    if (result.outcome) return false; result.outcome = outcome;
    if (state.review === result) state.review = null; if (!closing) finishWorkspace(ws); else { ws.finished = true; if (workspace === ws) workspace = null; }
    state.active = null; return true;
  }
  function rejectReview(result, ws, closing = false) {
    if (!completeReview(result, 'rejected', ws, closing)) return;
    recordHistory(result, 'rejected'); setPhase('idle');
  }
  function approveReview(result, ws, ack, allow, updateChrome) {
    if (result.outcome || !ack.checked) return;
    const revision = (result.doc?.revision ?? 0) + ':' + result.selected.join(',');
    if (result.ackRevision !== revision) { ack.checked = false; result.error = 'Treść zmieniła się po sprawdzeniu. Sprawdź bieżący wynik i potwierdź go ponownie.'; updateChrome(); return; }
    const changes = [];
    for (const key of result.keys) {
      if (!result.selected.includes(key)) continue;
      const after = fieldText(result, key), before = String(result.snapshot[key] ?? '');
      if (!after.trim() && before.trim() && !allow.checked) { result.error = 'Wyzerowanie niepustego pola wymaga osobnego potwierdzenia.'; updateChrome(); return; }
      changes.push({key, label: result.full[key], before, after});
    }
    if (!changes.length || !completeReview(result, 'approved', ws)) return;
    result.approved = Object.fromEntries(changes.map(c => [c.key, c.after]));
    writeChanges({changes, snapshot: result.snapshot, session: result.session, result});
  }
  function composeFromDictation(result, fields) { // _compose_dictation: through the ordinary entry point; the reviewed text replaces only the source copy
    setTimeout(() => prepare({sources: fields, session: result.session, dictationReturn: result}), 0);
  }
  function exchangeDialog(result) { // ui/response_exchange.py, with the shortened prompt and the demo's sample answer
    const g = result.generated, text = `OPISAI — POLECENIE I ODPOWIEDŹ AI\nPrzykładowa odpowiedź demonstracji, bez AI. Przypisane treści są dostępne w podglądzie dokumentacji.\n\nWersja OpisAI: ${VERSION}\nModel: przykład demonstracyjny\n\n=== POLECENIE WYSŁANE DO AI ===\n${Doc().OUTLINE_NOTE}\n\n${g.prompt}\n\n=== ODPOWIEDŹ — PRZYKŁAD DEMONSTRACJI ===\n${JSON.stringify(g.response, null, 1)}`;
    const html = `<div class="oa-app oa-mb"><h2 class="oa-ex-title">Polecenie i odpowiedź AI</h2><p class="oa-muted">Przykładowa odpowiedź demonstracji, bez AI. Przypisane treści są dostępne w podglądzie dokumentacji.</p><textarea readonly class="oa-rv-doc oa-ex-text" aria-label="Polecenie i oryginalna odpowiedź AI — tylko do odczytu">${esc(text)}</textarea><p class="oa-muted">Kliknij tekst, a następnie naciśnij Ctrl+A i Ctrl+C, albo użyj przycisku kopiowania.</p><footer class="oa-footer"><span class="oa-pg-gap"></span>${button('Zamknij', 'close')}${button('Kopiuj całość', 'copy-all', 'primary', '', 'aria-label="Kopiuj polecenie, odpowiedź i raport"')}</footer></div>`;
    const win = makeWindow('opisai-exchange', 'OpisAI — polecenie i odpowiedź AI', 960, 680, html); bind(win.content, 'close', () => win.close()); bind(win.content, 'copy-all', () => copyText(text, $('[data-action="copy-all"]', win.content)));
  }

  /* Write (application/writer.py, coordinator._written): field check, write, control read, receipt. */
  function writeChanges(plan) {
    const ws = {finished: false}, win = makeWindow('opisai-progress', 'OpisAI — wpisanie do pól', 740, 540, progressHtml('writing'), () => ws.finished ? undefined : false);
    ws.win = win; startClock(ws, win.content); state.active = win;
    ws.timer = setTimeout(() => { ws.finished = true; clearInterval(ws.clock); win.close(); state.active = null; showReceipt(performWrite(plan)); }, 500 * docSpeed());
  }
  function performWrite(plan) {
    const ctx = window.Clinic?.getContext?.() || {}, results = plan.changes.map(c => ({key: c.key, label: c.label, status: 'not_attempted', detail: ''}));
    const conflict = detail => { results[0].detail = detail; return {status: 'conflict', results, plan}; };
    if (!ctx.editorOpen || !ctx.writable) return {status: 'failed', results, plan}; // the window is gone: nothing was prepared
    if (ctx.session !== plan.session) return conflict(WINDOW_CHANGED);
    const now = getFields(), moved = Object.keys(plan.snapshot).find(k => now[k] !== plan.snapshot[k]);
    if (moved) return conflict('Zmieniono albo wymieniono pole: ' + moved); // WriteService._check_fields names the field id
    const applied = window.Clinic.setFields(Object.fromEntries(plan.changes.map(c => [c.key, c.after])), {expected: plan.snapshot, session: plan.session, source: plan.inverse ? 'OpisAI — cofnięcie' : 'OpisAI'});
    if (!applied.ok) return applied.reason === WINDOW_CHANGED ? conflict(WINDOW_CHANGED) : {status: 'failed', results, plan};
    const read = getFields(); // control read
    for (const r of results) { const c = plan.changes.find(x => x.key === r.key); r.status = read[r.key] === c.after ? 'verified' : 'unknown'; if (r.status === 'unknown') r.detail = 'Wynik niepotwierdzony. Sprawdź pole; nie ponawiaj automatycznie.'; }
    return {status: results.every(r => r.status === 'verified') ? 'verified' : 'unknown', results, plan};
  }
  function showReceipt(receipt) {
    const plan = receipt.plan, names = {verified: 'wpisano i potwierdzono', not_attempted: 'nie wykonano', conflict: 'konflikt — nie wpisano', unknown: 'wynik niepotwierdzony'};
    if (receipt.status === 'failed') {
      setPhase('idle');
      recoveryDialog({writing: true, code: 'write_unconfirmed', title: 'Sprawdź wynik wpisania', explanation: 'Nie potwierdzono zakończenia wpisania do pól.', next: 'Sprawdź treść pól w Klinice oraz dziennik operacji. Nie ponawiaj wpisania bez sprawdzenia.', action: 'journal', actionLabel: 'Sprawdź dziennik'});
      return;
    }
    const message = receipt.results.map(r => `${r.label}: ${names[r.status]}${r.detail ? '. ' + r.detail : ''}`).join('\n') + '\n\n' + RECEIPT_NOTE;
    if (plan.result && !plan.inverse) recordHistory(plan.result, receipt.status === 'verified' ? 'written' : receipt.status, receipt);
    if (receipt.status === 'verified') {
      state.lastReceipt = state.lastWrite = receipt; setPhase('done');
      messageBox({title: 'OpisAI — wpisano do pól', icon: 'info', text: 'Wpisano i odczytano kontrolnie wszystkie zatwierdzone pola.\n\nWizyta nie została przez to zapisana w bazie Kliniki. Zapisz ją w programie gabinetowym.', details: message,
        buttons: [{label: 'Cofnij wpisanie', action: 'undo', onClick: () => setTimeout(undo, 0)}, {label: 'Gotowe', action: 'close', primary: true, default: true}]});
    } else { setPhase('idle'); messageBox({title: 'OpisAI — sprawdź wynik wpisania', icon: 'warning', text: message, buttons: [{label: 'Gotowe', action: 'close', primary: true, default: true}]}); }
  }

  /* Undo (coordinator.undo): read and check first, then OBECNIE/PRZYWRÓĆ, then the same controlled write. */
  function undo() {
    const busy = state.job || state.recording || state.review || (workspace && !workspace.finished) || ['opisai-compose', 'opisai-progress', 'opisai-undo'].some(id => windows.get(id)?.el?.isConnected);
    if (busy) { messageBox({title: 'OpisAI — informacja', icon: 'info', text: 'Najpierw zakończ bieżącą operację.'}); return; }
    const last = state.lastReceipt;
    if (!last) { messageBox({title: 'OpisAI — informacja', icon: 'info', text: 'Brak operacji do cofnięcia w tej sesji.'}); return; }
    beginOperation();
    readVisit(() => {
      const ctx = window.Clinic?.getContext?.() || {}, now = getFields(), verified = last.results.filter(r => r.status === 'verified').map(r => r.key);
      const moved = last.plan.changes.find(c => verified.includes(c.key) && now[c.key] !== c.after);
      const error = !['verified', 'partial'].includes(last.status) ? 'Najpierw wyjaśnij niepotwierdzony wynik poprzedniego zapisu.' : !ctx.editorOpen ? 'Okno lub kontrolka nie są dostępne.'
        : ctx.session !== last.plan.session ? WINDOW_CHANGED : !verified.length ? 'Brak potwierdzonych zmian do cofnięcia.' : moved ? 'Pole zmieniono po naszym wpisie. Nie cofnięto: ' + moved.key : '';
      if (error) { messageBox({title: 'OpisAI — sprawdź komunikat', icon: 'warning', text: error}); return; }
      const changes = last.plan.changes.filter(c => verified.includes(c.key)).map(c => ({key: c.key, label: c.label, before: now[c.key], after: c.before}));
      const html = `<div class="oa-app oa-undo"><textarea readonly class="oa-rv-doc" aria-label="Zmiany do cofnięcia — tylko do odczytu">${esc(changes.map(c => `${c.label}:\nOBECNIE:\n${c.before}\nPRZYWRÓĆ:\n${c.after}`).join('\n\n'))}</textarea><footer class="oa-footer"><span class="oa-pg-gap"></span>${button('OK', 'ok', 'primary')}${button('Anuluj', 'cancel')}</footer></div>`;
      const win = makeWindow('opisai-undo', 'OpisAI — potwierdź cofnięcie', 850, 600, html);
      bind(win.content, 'cancel', () => win.close());
      bind(win.content, 'ok', () => { win.close(); writeChanges({changes, snapshot: Object.fromEntries(changes.map(c => [c.key, c.before])), session: ctx.session, inverse: true}); });
      setTimeout(() => $('[data-action="ok"]', win.content)?.focus(), 0);
    }, () => messageBox({title: 'OpisAI — sprawdź komunikat', icon: 'warning', text: 'Anulowano odczyt. Pola pozostały bez zmian.'}));
  }
  async function copyText(value,control){
    let ok=false;try{await navigator.clipboard.writeText(String(value));ok=true;}catch(_){const t=document.createElement('textarea');t.value=String(value);t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();try{ok=document.execCommand('copy');}catch(__){}t.remove();}
    if(control&&ok){const span=$('span',control);if(span){const old=span.textContent;span.textContent='Skopiowano';setTimeout(()=>{if(span.isConnected)span.textContent=old;},1800);}}else toast(ok?'Skopiowano do schowka.':'Zaznacz tekst i użyj Ctrl+C, aby skopiować.');
  }

  /* Recording is deliberately scripted: the microphone is never requested. */
  const DICTATION_TEXT='Pacjent jest dziś spokojniejszy. Właściciel zgłasza poprawę apetytu od wczoraj. Nadal obserwuje kichanie i wydzielinę wokół nozdrzy. Kontynuujemy obserwację objawów. Notatka do sprawdzenia przed wpisaniem.';
  /* Hold, "Dyktuj" and the menu (MacroController._on_triple_click): a second hold stops the
   * recording; an open OpisAI window is recalled instead; no dictation during generation. */
  function dictate(options={}){
    options=validOption(options);
    if(state.closed)launch();
    if(state.recording){finishDictation();return;}
    if(state.receipt)return;
    // rc32 _start_transcription_planned: while compose/review is open (safe.busy) dictation does not start and does not recall the window.
    if(!options.direct&&liveWindows().some(w=>['opisai-compose','opisai-progress','opisai-review','opisai-undo'].includes(w.id))){errorCard('Trwa inna operacja — zakończ ją przed dyktowaniem.',{title:'🎙 Transkrypcja',accent:'#2ecc71'});return;}
    if(state.job)return;
    if(!window.Clinic?.isEditorOpen?.()){errorCard('Nie znaleziono podokna wizyty — otwórz wizytę w Klinice.',{title:'⚠ Transkrypcja',accent:'#e74c3c'});return;}
    beginOperation();startDictation(options);
  }
  function startDictation(options){
    const field=FIELDS[options.field]?options.field:(Clinic.getActiveField?.()||state.activeField||'wywiad');
    const snapshot=clone(options.snapshot||getFields());
    state.review=null;closeWin('opisai-compose');closeWin('opisai-review');
    state.recording={id:++state.token,field,snapshot,session:options.session??window.Clinic?.getContext?.().session,base:options.base||'',text:'',wordIndex:0,seconds:0,paused:false,listening:false,started:Date.now(),tick:null,canvasFrame:null,continuation:!!options.continuation};
    const rec=state.recording;setPhase('processing');showDictation(); // dots until the microphone is confirmed
    setTimeout(()=>{if(state.recording===rec){rec.listening=true;setPhase('recording');}},700); // red REC only while it records
    const words=DICTATION_TEXT.split(' ');
    rec.tick=setInterval(()=>{if(state.recording!==rec){clearInterval(rec.tick);return;}if(rec.paused||!rec.listening)return;rec.seconds+=.45;if(rec.wordIndex<words.length){rec.text+=(rec.wordIndex?' ':'')+words[rec.wordIndex++];}updateDictation();},450);
  }
  function showDictation(){
    const rec=state.recording;if(!rec)return;
    const old=windows.get('opisai-dictation');if(old?.el?.isConnected){old.show();old.focus();state.active=old;return;}
    const html=`<div class="oa-app"><header class="oa-header"><div class="oa-dictation-header"><span class="oa-rec-status"></span><div><h2 data-record-status>Dyktowanie</h2><p>${esc(FIELDS[rec.field])} · ${esc(preferences.transcriber)} · Polski</p></div><span class="oa-dictation-time">00:00</span></div></header><div class="oa-content" style="display:flex;flex-direction:column"><div style="display:flex;align-items:center;gap:8px"><span class="oa-recording-badge">Przykładowe dyktowanie</span><span class="oa-muted oa-small">Demo nie korzysta z mikrofonu.</span></div><div class="oa-dictation-wave"><canvas aria-label="Przykładowy przebieg głośności"></canvas><span class="oa-wave-caption">Mikrofon · przykład</span><span class="oa-wave-unit">−48 dB&nbsp;&nbsp; 0 dB</span></div><div class="oa-section-label">Nowa transkrypcja</div><div class="oa-transcript-block" data-transcript aria-live="polite"><span class="oa-transcript-placeholder">Rozpoczynam przykładowe dyktowanie…</span></div><div class="oa-dictation-controls">${button('Wstrzymaj','pause','small','pause')}${button('Przepisz fragment','flush','small','document')}<span>Enter — zakończ i sprawdź</span></div><div class="oa-lanes"><div class="oa-lane"><span class="oa-lane-name">Karta A</span><div class="oa-lane-track"><div class="oa-lane-fill" data-lane="a"></div></div><span class="oa-lane-state" data-lane-state="a">Nagrywa</span></div><div class="oa-lane"><span class="oa-lane-name">Karta B</span><div class="oa-lane-track"><div class="oa-lane-fill" data-lane="b"></div></div><span class="oa-lane-state" data-lane-state="b">Gotowa</span></div></div><details class="oa-disclosure"><summary>Treść pola przed dyktowaniem</summary><p>${esc(rec.snapshot[rec.field]||'(puste pole)')}</p></details></div><footer class="oa-footer"><span class="oa-footnote">Tekst wpiszesz po sprawdzeniu.</span>${button('Anuluj','discard')}${button('Zakończ i sprawdź tekst','finish','primary','stop')}</footer></div>`;
    const win=makeWindow('opisai-dictation','OpisAI — dyktowanie',690,640,html);state.active=win;const root=win.content;
    bind(root,'pause',()=>{rec.paused=!rec.paused;updateDictation();});
    bind(root,'flush',()=>{toast('Dotychczasowy fragment jest dostępny w podglądzie.');$('.oa-transcript-block',root).classList.add('oa-flushed');updateDictation();});
    bind(root,'finish',finishDictation);
    bind(root,'discard',()=>confirmDiscardDictation());
    root.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!['TEXTAREA','INPUT','BUTTON','SELECT'].includes(event.target.tagName)){event.preventDefault();finishDictation();}});
    animateWave(root,rec);updateDictation();
  }
  function updateDictation(){
    const rec=state.recording,root=windows.get('opisai-dictation')?.content;if(!rec||!root)return;
    const seconds=Math.floor(rec.seconds);$('.oa-dictation-time',root).textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    const text=rec.base?rec.base+'\n\n'+rec.text:rec.text;
    const transcript=$('[data-transcript]',root);transcript.innerHTML=text?esc(text)+(!rec.paused?'<span class="oa-type-cursor"></span>':''):'<span class="oa-transcript-placeholder">Rozpoczynam przykładowe dyktowanie…</span>';transcript.scrollTop=transcript.scrollHeight;
    $('[data-record-status]',root).textContent=rec.paused?'Dyktowanie wstrzymane':'Dyktowanie';$('.oa-rec-status',root).classList.toggle('paused',rec.paused);$('[data-action="pause"] span',root).textContent=rec.paused?'Wznów':'Wstrzymaj';
    const active=Math.floor(seconds/7)%2===0?'a':'b';$$('[data-lane-state]',root).forEach(el=>el.textContent=rec.paused?'Wstrzymana':el.dataset.laneState===active?'Nagrywa':'Odbiera tekst');$$('[data-lane]',root).forEach(el=>el.style.width=(30+(seconds*3)%50)+'%');
  }
  function animateWave(root,rec){
    const canvas=$('.oa-dictation-wave canvas',root),ctx=canvas.getContext('2d');
    function frame(now){if(state.recording!==rec||!canvas.isConnected)return;const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(box.width*dpr)||canvas.height!==Math.round(box.height*dpr)){canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.width,box.height);const center=box.height*.56;ctx.strokeStyle=preferences.theme==='dark'?'#3b424c':'#dfe5ed';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,center);ctx.lineTo(box.width,center);ctx.stroke();ctx.strokeStyle=rec.paused?'#b1bac6':'#44b782';ctx.lineWidth=2;const t=rec.paused?0:now/1000;for(let x=8;x<box.width-8;x+=4){const a=rec.paused?1:(5+32*Math.abs(Math.sin(x*.029+t*2.3))*Math.abs(Math.cos(x*.1-t*1.4)));ctx.beginPath();ctx.moveTo(x,center-a);ctx.lineTo(x,center+a);ctx.stroke();}rec.canvasFrame=requestAnimationFrame(frame);}
    rec.canvasFrame=requestAnimationFrame(frame);
  }
  function finishDictation(){
    const rec=state.recording;if(!rec)return;clearInterval(rec.tick);cancelAnimationFrame(rec.canvasFrame);state.recording=null;closeWin('opisai-dictation');
    let text=[rec.base,rec.text].filter(Boolean).join('\n\n').trim();
    if(preferences.sentenceLines)text=text.replace(/([.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/g,'$1\n');
    if(!text){setPhase('idle');toast('Nie odebrano tekstu do sprawdzenia.');return;}
    const withBefore=rec.base?text:[rec.snapshot[rec.field],text].filter(Boolean).join('\n\n'),receipt=state.receipt={id:rec.id};
    setPhase('processing'); // REC ends with the recording; the last text is still arriving
    receipt.deliver=()=>{if(state.receipt!==receipt)return;state.receipt=null;review({id:rec.id,snapshot:rec.snapshot,sources:{...rec.snapshot,[rec.field]:withBefore},output:{[rec.field]:withBefore},variant:{rich:false,panel:false,diagnosis:false},field:rec.field,session:rec.session,mode:'dictation',route:'Przykładowe dyktowanie',created:new Date().toISOString()});};
    setTimeout(receipt.deliver,600); // "Pokaż" or a click delivers it at once
  }
  function dropDictation(){ // discard the recording, its microphone start or its last-text receipt
    const rec=state.recording;if(rec){clearInterval(rec.tick);cancelAnimationFrame(rec.canvasFrame);}
    state.recording=null;state.receipt=null;closeWin('opisai-dictation');closeWin('opisai-discard');state.active=null;setPhase('idle');
  }
  function confirmDiscardDictation(){
    const html=`<div class="oa-app"><header class="oa-header"><h2>Odrzucić bieżące dyktowanie?</h2></header><div class="oa-content"><p>Tekst tego dyktowania nie zostanie wpisany do pól. Możesz też zakończyć nagranie i sprawdzić zachowaną notatkę.</p></div><footer class="oa-footer">${button('Wróć do nagrania','back')}${button('Odrzuć','discard','danger')}${button('Sprawdź tekst','review','primary')}</footer></div>`;
    const win=makeWindow('opisai-discard','OpisAI — zakończenie dyktowania',560,250,html);bind(win.content,'back',()=>win.close());bind(win.content,'review',()=>{win.close();finishDictation();});bind(win.content,'discard',()=>{win.close();dropDictation();});
  }

  const settingsNav=[
    ['GENEROWANIE',null],['Połączenie i model','connection','send'],['Sekcje opisu','sections','document'],
    ['WEJŚCIE',null],['Dyktowanie','dictation','mic'],['Odczyt pola (Klinika)','fields','clinic'],
    ['INTERFEJS',null],['Wygląd','appearance','eye'],['Bąbelek','bubble','opisai'],['Historia','history','history'],
    ['ZAAWANSOWANE',null],['System','system','settings'],['Zgodność AI (RODO)','privacy','shield']
  ];
  const selectControl=(key,values,current)=>`<select data-setting="${key}" aria-label="${esc(key)}">${values.map(value=>`<option ${value===current?'selected':''}>${esc(value)}</option>`).join('')}</select>`;
  const formRow=(label,control)=>`<div class="oa-form-row"><label>${label}</label>${control}</div>`;
  const switchControl=(key,label,description,draft)=>`<label class="oa-switch-row"><input type="checkbox" data-setting="${key}" ${draft[key]?'checked':''}><div>${label}${description?`<small>${description}</small>`:''}</div></label>`;
  function settings(initial='connection'){
    if(typeof initial!=='string')initial='connection';
    let page=initial,draft=clone(preferences),changed=false;
    const html=`<div class="oa-app"><div class="oa-settings-layout"><aside class="oa-settings-nav"><input class="oa-settings-search" type="search" placeholder="Znajdź ustawienie" aria-label="Znajdź ustawienie">${settingsNav.map(([label,id,ic])=>id?`<button class="oa-nav-item ${page===id?'active':''}" data-page="${id}">${icon(ic,16)}<span>${label}</span></button>`:`<div class="oa-nav-group">${label}</div>`).join('')}</aside><section class="oa-settings-page" data-settings-page></section></div><footer class="oa-footer"><span class="oa-footnote oa-settings-footer-msg">OpisAI ${VERSION}</span>${button('Anuluj','cancel-settings')}${button('Zapisz','save-settings','primary','check')}</footer></div>`;
    const win=makeWindow('opisai-settings','OpisAI — konfiguracja',930,680,html);const root=win.content;
    function dirty(){changed=true;$('.oa-settings-footer-msg',root).textContent='Masz niezapisane zmiany.';}
    function draw(){
      $$('[data-page]',root).forEach(el=>el.classList.toggle('active',el.dataset.page===page));
      const area=$('[data-settings-page]',root);
      if(page==='connection'){
        const models=draft.provider==='Claude'?['Claude Sonnet','Claude Opus','Wybrany w przeglądarce']:draft.provider==='Gemini'?['Gemini Flash','Gemini Pro','Wybrany w przeglądarce']:draft.provider==='Lokalny'?['Qwen · model lokalny','Własny model']:['Wybrany w ChatGPT'];
        if(!models.includes(draft.model))draft.model=models[0];
        area.innerHTML=`<h2>Połączenie i model</h2><p>Wybierz usługę, która opracowuje dokumentację.</p><fieldset class="oa-group"><legend>Generator opisu</legend>${formRow('Dostawca',selectControl('provider',['ChatGPT','Claude','Gemini','Lokalny'],draft.provider))}${formRow('Połączenie',selectControl('transport',draft.provider==='Lokalny'?['Lokalnie (offline)']:draft.provider==='Gemini'?['Przeglądarka','API']:['Przeglądarka'],draft.transport))}${formRow('Model',selectControl('model',models,draft.model))}<div class="oa-form-help">${draft.provider==='Lokalny'?'Lokalny silnik w aplikacji desktopowej działa przez Ollamę.':'W aplikacji desktopowej używany jest osobny profil przeglądarki OpisAI.'}</div></fieldset><fieldset class="oa-group"><legend>Stan połączenia</legend><div class="oa-inline-controls">${button('Sprawdź połączenie','test-connection','','check')}${button('Otwórz profil','profile','','eye')}</div><div class="oa-setting-state" data-connection-state>Profil demonstracyjny · gotowy do pokazania przebiegu pracy.</div></fieldset><div style="margin-top:16px">${notice('W tej demonstracji połączenia są symulowane. Nie wymagają logowania ani kluczy API. Wybór zmienia prezentowany przebieg, a tekst pozostaje w przeglądarce.')}</div>`;
        bind(area,'test-connection',()=>{const target=$('[data-connection-state]',area);target.textContent='Sprawdzam ustawienia…';setTimeout(()=>{if(target.isConnected)target.innerHTML=`<span class="oa-success-text">${icon('check',14)} Tryb demonstracyjny gotowy.</span> Wybrano ${esc(draft.provider)}.`;},900);});
        bind(area,'profile',()=>providerPreview(draft.provider));
      } else if(page==='sections'){
        area.innerHTML=`<h2>Sekcje opisu</h2><p>Układ dokumentacji i parametry odczytywane ze źródeł.</p><fieldset class="oa-group"><legend>Pola wizyty</legend><table class="oa-options-table"><thead><tr><th>Pole</th><th>Nazwa w OpisAI</th></tr></thead><tbody>${Object.keys(FIELDS).map((key,i)=>`<tr><td>${['Wywiad','Badanie','Diagnoza'][i]}</td><td><input type="text" data-section-name="${i}" value="${esc(draft.clinicalSections[i])}" aria-label="Nazwa sekcji ${i+1}"></td></tr>`).join('')}</tbody></table><p class="oa-form-help" style="margin-top:9px">Zmiana nazwy nie zmienia przypisanego pola w Klinice.</p></fieldset><fieldset class="oa-group"><legend>Panel parametrów</legend><p class="oa-form-help">Do panelu trafiają tylko wartości obecne w zatwierdzonych źródłach.</p>${Object.entries({temperature:'Temperatura',heart:'Czynność serca',bcs:'BCS',mass:'Masa ciała'}).map(([key,label])=>`<label class="oa-switch-row"><input type="checkbox" data-panel-row="${key}" ${draft.panelRows[key]?'checked':''}><div>${label}</div></label>`).join('')}</fieldset><fieldset class="oa-group"><legend>Sposób opracowania</legend>${switchControl('rich','Domyślnie wybieraj „Bogato”','Rozwinięty opis zamiast skrótowej notatki.',draft)}${switchControl('panel','Dołącz panel parametrów','Wariant jest zapamiętywany również po wyborze w oknie przygotowania.',draft)}${switchControl('diagnosis','Dołącz rozpoznanie robocze','Wynik wymaga osobnego sprawdzenia.',draft)}</fieldset>`;
        $$('[data-section-name]',area).forEach(el=>el.addEventListener('input',()=>{draft.clinicalSections[Number(el.dataset.sectionName)]=el.value.trim()||defaults.clinicalSections[Number(el.dataset.sectionName)];dirty();}));$$('[data-panel-row]',area).forEach(el=>el.addEventListener('change',()=>{draft.panelRows[el.dataset.panelRow]=el.checked;dirty();}));
      } else if(page==='dictation'){
        area.innerHTML=`<h2>Dyktowanie</h2><p>Przytrzymaj bąbelek, aby rozpocząć. Silnik mowy jest niezależny od generatora opisu.</p><fieldset class="oa-group"><legend>Rozpoznawanie mowy</legend>${formRow('Silnik',selectControl('transcriber',['ChatGPT','Gemini Live','Whisper (lokalnie)'],draft.transcriber))}${formRow('Język',selectControl('language',['Polski'],draft.language))}${draft.transcriber==='ChatGPT'?formRow('Tryb kart',selectControl('cardMode',['Nagrywa OpisAI','Dwie karty'],draft.cardMode)):''}<p class="oa-form-help">${draft.transcriber==='ChatGPT'?'Nagrywa OpisAI: ciągłe nagranie i dwie karty odbierające kolejne fragmenty.':draft.transcriber==='Gemini Live'?'Transkrypcja strumieniowa w aplikacji desktopowej.':'Lokalne rozpoznawanie mowy w aplikacji desktopowej, bez wysyłania nagrania.'}</p>${switchControl('sentenceLines','Każde zdanie w nowej linii','Sposób prezentacji transkrypcji.',draft)}</fieldset><fieldset class="oa-group"><legend>Mikrofon i podgląd</legend><p class="oa-form-help">W witrynie odtwarzany jest stały przykład. Mikrofon nie jest uruchamiany.</p><div class="oa-inline-controls">${button('Sprawdź dyktowanie','test-dictation','','check')}${button('Uruchom przykład','sample-dictation','','mic')}</div><div class="oa-setting-state" data-dictation-test>Przykład pokazuje nagrywanie, transkrypcję i zatwierdzanie wpisu.</div></fieldset>`;
        bind(area,'test-dictation',()=>{const el=$('[data-dictation-test]',area);el.textContent='Sprawdzam interfejs dyktowania…';setTimeout(()=>{if(el.isConnected)el.innerHTML='<span class="oa-success-text">Przykład jest gotowy. Mikrofon pozostaje wyłączony.</span>';},750);});bind(area,'sample-dictation',()=>{win.minimize();dictate({direct:true});});
      } else if(page==='fields'){
        const values=getFields();
        area.innerHTML=`<h2>Odczyt pola (Klinika)</h2><p>Powiązanie OpisAI z polami w oknie opisu wizyty.</p><fieldset class="oa-group"><legend>Okno docelowe</legend>${formRow('Program','<div class="oa-form-control"><strong>Klinika XP</strong><div class="oa-form-help">Bieżąca wizyta · przykład interaktywny</div></div>')}<div class="oa-inline-controls">${button('Pokaż Klinikę','show-clinic','','clinic')}${button('Odczytaj ponownie','read-fields','','document')}</div></fieldset><fieldset class="oa-group"><legend>Przypisane pola</legend><table class="oa-options-table"><thead><tr><th>Pole</th><th>Stan</th><th></th></tr></thead><tbody>${Object.entries(FIELDS).map(([key,label])=>`<tr><td>${esc(label)}</td><td><span class="oa-success-text">${icon('check',12)} Przypisane</span><br><small class="oa-muted">${String(values[key]||'').length} znaków</small></td><td>${button('Pokaż','field-'+key,'small','eye')}</td></tr>`).join('')}</tbody></table></fieldset><fieldset class="oa-group"><legend>Pisownia</legend>${switchControl('spelling','Podkreślaj podejrzane słowa w Klinice','Sugestie dotyczą widocznego przykładu. Poprawkę wybierasz samodzielnie.',draft)}</fieldset>`;
        bind(area,'show-clinic',()=>Clinic.open());bind(area,'read-fields',()=>{draw();toast('Odczytano bieżącą treść trzech pól.');});Object.keys(FIELDS).forEach(key=>bind(area,'field-'+key,()=>{beginOperation();if(!visitReady())return;win.minimize();Clinic.focusField(key);Clinic.markTarget?.(key,true);setTimeout(()=>Clinic.markTarget?.(key,false),1800);}));
      } else if(page==='appearance'){
        area.innerHTML=`<h2>Wygląd</h2><p>Kolory i czytelność okien OpisAI.</p><fieldset class="oa-group"><legend>Motyw aplikacji</legend><div class="oa-theme-choice">${[['light','Jasny'],['dark','Ciemny'],['blue','Niebieski']].map(([value,label])=>`<button type="button" class="oa-theme-card ${draft.theme===value?'selected':''}" data-theme="${value}"><span class="oa-theme-preview ${value}"><i></i><i></i></span>${label}</button>`).join('')}</div></fieldset><fieldset class="oa-group"><legend>Tekst i podgląd</legend>${formRow('Rozmiar tekstu',`<input data-setting="fontSize" type="range" min="12" max="16" value="${draft.fontSize}"><span data-font-size>${draft.fontSize} px</span>`)}<p data-font-preview style="font-size:${draft.fontSize}px;padding:11px;border:1px solid var(--oa-line);border-radius:7px;background:var(--oa-field)">Przykładowy opis wizyty. Czytelny tekst ułatwia sprawdzenie faktów, liczb i jednostek.</p>${switchControl('livePreview','Pokaż tekst na żywo podczas generowania','Wersja robocza pozostaje oddzielona od zatwierdzanego wyniku.',draft)}${switchControl('animations','Animacje interfejsu','Płynne przygotowywanie przykładu w oknach OpisAI.',draft)}</fieldset>`;
        $$('[data-theme]',area).forEach(el=>el.addEventListener('click',()=>{draft.theme=el.dataset.theme;applyTheme(win,draft.theme);dirty();draw();}));
      } else if(page==='bubble'){
        /* rc32 ConfigDialog._build_bounce_section: the bubble's only settings. */
        area.innerHTML=`<h2>Bąbelek</h2><p>Zachowanie bąbelka podczas bezczynności.</p><fieldset class="oa-group"><legend>Animacja bezczynności</legend><label class="oa-switch-row" title="Po dłuższej bezczynności bąbelek spada na pasek zadań i odbija się jak gumowa piłka. Tylko gdy bąbelek jest wyżej niż pasek zadań (nie przecięty)."><input type="checkbox" data-setting="idleBounce" ${draft.idleBounce?'checked':''}><div>Bąbelek czasem odbija się od paska zadań</div></label>${formRow('Co ile sekund:',`<span class="oa-number"><input type="number" data-setting="bounceInterval" min="10" max="3600" step="10" value="${draft.bounceInterval}" title="Co ile sekund bąbelek odbija się podczas bezczynności" aria-label="Co ile sekund"><span>s</span></span>`)}${formRow('Maks. odbić w sesji:',`<span class="oa-number"><input type="number" data-setting="bounceMax" min="0" max="999" step="1" value="${draft.bounceMax}" title="Maks. liczba odbić w jednym oknie bezczynności. 0 = bez limitu." aria-label="Maks. odbić w sesji"><span data-bounce-unit>${draft.bounceMax>0?'odbić':'bez limitu'}</span></span>`)}</fieldset>`;
      } else if(page==='history'){
        area.innerHTML=`<h2>Historia</h2><p>Potwierdzone wpisy wykonane w tej demonstracji.</p><fieldset class="oa-group"><legend>Historia generowań</legend>${switchControl('history','Zapisuj historię tej sesji','Treść pozostaje w bieżącej karcie. Zamknięcie lub odświeżenie strony usuwa wpisy.',draft)}<div class="oa-inline-controls">${button('Otwórz historię','open-history','','history')}${button('Wyczyść historię','clear-history','','close',state.history.length?'':'disabled')}</div><div class="oa-setting-state">W tej sesji: ${state.history.length} ${state.history.length===1?'operacja':'operacji'}.</div></fieldset><fieldset class="oa-group"><legend>Cofanie</legend><p class="oa-form-help">Możesz cofnąć ostatni potwierdzony wpis, jeśli od tego czasu pola nie zostały zmienione.</p>${button('Cofnij ostatni wpis','last-undo','','undo',state.lastWrite?'':'disabled')}</fieldset>`;
        bind(area,'open-history',history);bind(area,'clear-history',()=>clearHistory(()=>draw()));bind(area,'last-undo',undo);
      } else if(page==='system'){
        area.innerHTML=`<h2>System</h2><p>Informacje o działającej wersji i ustawieniach przykładu.</p><fieldset class="oa-group"><legend>Aplikacja</legend><dl class="oa-system-info"><dt>Wersja</dt><dd>${VERSION}</dd><dt>Interfejs</dt><dd>OpisAI dla Microsoft Windows · demonstracja w przeglądarce</dd><dt>Dane wizyty</dt><dd>Lokalnie w tej przeglądarce</dd><dt>Ustawienia wyglądu</dt><dd>Zapamiętane w tej przeglądarce</dd></dl><div class="oa-inline-controls">${button('Kopiuj informacje','copy-info','','copy')}${button('O aplikacji','about','','info')}</div></fieldset><fieldset class="oa-group"><legend>Przywracanie</legend><p class="oa-form-help">Przywróć domyślne ustawienia OpisAI. Treść wizyty nie zostanie zmieniona.</p>${button('Przywróć ustawienia domyślne','reset-settings','','undo')}</fieldset>`;
        bind(area,'copy-info',()=>copyText(`OpisAI ${VERSION}\nInteraktywna demonstracja OpisAI\nGenerator: ${draft.provider}\nDyktowanie: ${draft.transcriber}\nBez danych wizyty i poświadczeń.`,$('[data-action="copy-info"]',area)));bind(area,'about',about);bind(area,'reset-settings',()=>{draft=clone(defaults);dirty();applyTheme(win,draft.theme);draw();});
      } else {
        area.innerHTML=`<h2>Zgodność AI (RODO)</h2><p>Jawne źródła, nadzór lekarza i zatwierdzanie wpisu.</p><fieldset class="oa-group"><legend>Kontrola danych</legend><div class="oa-about-block"><p>Przed opracowaniem opisu widzisz dokładną treść pól. Możesz poprawić źródła i usunąć dane, których nie chcesz przekazać do wybranego połączenia.</p><p style="margin-top:10px">Zmiana treści lub zakresu unieważnia potwierdzenie. Nowe źródła wymagają ponownego sprawdzenia.</p></div></fieldset><fieldset class="oa-group"><legend>Nadzór nad wynikiem</legend><div class="oa-about-block"><p>OpisAI pokazuje wynik jako propozycję. Przed wpisaniem sprawdzasz tekst, właściwą wizytę i wybrane pola.</p><p style="margin-top:10px">Wpis jest wstrzymywany, jeśli zmienił się kontekst lub treść pól od wcześniejszego odczytu.</p></div></fieldset><div style="margin-top:16px">${notice('Tryb demonstracyjny: witryna nie wysyła treści wizyty do modeli AI, nie uruchamia mikrofonu i nie zapisuje danych w zewnętrznej Klinice. Pokazuje interfejs oraz przebieg pracy aplikacji.')}</div><p class="oa-form-help" style="margin-top:12px">Te funkcje wspierają kontrolę pracy. Sama demonstracja nie stanowi potwierdzenia zgodności prawnej konkretnego wdrożenia.</p>`;
      }
      $$('[data-setting]',area).forEach(el=>{
        el.addEventListener(el.type==='range'?'input':'change',()=>{
          const key=el.dataset.setting;draft[key]=el.type==='checkbox'?el.checked:el.type==='range'||el.type==='number'?Number(el.value):el.value;dirty();
          if(key==='provider'){draft.transport=draft.provider==='Lokalny'?'Lokalnie (offline)':'Przeglądarka';draw();}
          if(key==='transcriber')draw();
          if(key==='fontSize'){const text=$('[data-font-size]',area);if(text)text.textContent=draft.fontSize+' px';const preview=$('[data-font-preview]',area);if(preview)preview.style.fontSize=draft.fontSize+'px';}
          if(key==='bounceMax'){const unit=$('[data-bounce-unit]',area);if(unit)unit.textContent=Number(el.value)>0?'odbić':'bez limitu';}
        });
      });
    }
    $$('[data-page]',root).forEach(el=>el.addEventListener('click',()=>{page=el.dataset.page;draw();}));
    $('.oa-settings-search',root).addEventListener('input',event=>{const q=normal(event.target.value);$$('[data-page]',root).forEach(el=>el.hidden=!!q&&!normal(el.textContent).includes(q));$$('.oa-nav-group',root).forEach(el=>el.hidden=!!q);});
    bind(root,'cancel-settings',()=>{applyTheme(win);win.close();});
    bind(root,'save-settings',()=>{
      preferences=clone(draft);normalizeBounce(preferences);savePreferences(); /* stored as used: 10–3600 s, 0–999 bounces */Object.keys(FIELDS).forEach((key,i)=>FIELDS[key]=preferences.clinicalSections[i]||defaults.clinicalSections[i]);windows.forEach(w=>applyTheme(w));
      document.documentElement.style.setProperty('--oa-font-size',preferences.fontSize+'px');Clinic.setSpellingEnabled?.(preferences.spelling);
      if(windows.get('opisai-compose')?.el?.isConnected){const active=windows.get('opisai-compose');if(active?.content){const label=$('[data-route]',active.content);if(label)label.textContent=route();const ack=$('#oa-compose-ack',active.content);if(ack){ack.checked=false;ack.dispatchEvent(new Event('change'));}}}
      changed=false;win.close();toast('Ustawienia OpisAI zapisane.');
    });
    draw();
  }
  function providerPreview(provider){
    const html=`<div class="oa-app"><header class="oa-header"><h1>Profil ${esc(provider)}</h1><p>Osobny profil przeglądarki OpisAI</p></header><div class="oa-content">${notice('W demonstracji profil jest przykładowy. Nie logujemy do zewnętrznego konta.')}<div class="oa-empty">${icon('shield',44)}<h3>Połączenie demonstracyjne</h3><p>Możesz wrócić do przygotowania opisu<br>i przejść przez cały proces zatwierdzania.</p></div></div><footer class="oa-footer"><span class="oa-footnote">${esc(provider)} · przykład interfejsu</span>${button('Zamknij','close','primary')}</footer></div>`;
    const win=makeWindow('opisai-profile','OpisAI — profil przeglądarki',570,430,html);bind(win.content,'close',()=>win.close());
  }
  /* History (ui/history_window.py, ui/history_document.py): every prepared document, its status and the
   * stored states. rc32 keeps it in a protected local database; the demonstration keeps it in this tab. */
  let historySerial = 0, historyRefresh = null;
  const HISTORY_STATUS = {generated: 'Do sprawdzenia', rejected: 'Odrzucono', written: 'Wpisano do pól', partial: 'Częściowe wpisanie', unknown: 'Sprawdź wynik', conflict: 'Nie wpisano — zmiana pól'};
  const HISTORY_SUMMARY = {generated: 'Przygotowano — bez zatwierdzenia i wpisania', rejected: 'Odrzucono — bez wpisania', written: 'Wpisanie potwierdzone odczytem', partial: 'Wpisano część pól', unknown: 'Wynik wpisania wymaga sprawdzenia', conflict: 'Konflikt — wpisanie przerwane'};
  const HISTORY_MODE = {rich: 'Bogato', faithful: 'Wiernie', dictation: 'Dyktowanie'};
  function recordHistory(result, status, receipt) {
    if (!preferences.history) return;
    let entry = state.history.find(e => e.id === result.historyId);
    if (!entry) { entry = {id: result.historyId = 'doc-' + (++historySerial), ts: new Date()}; state.history.unshift(entry); }
    Object.assign(entry, {status, mode: result.mode === 'dictation' ? 'dictation' : result.variant.rich ? 'rich' : 'faithful', panel: !!result.variant?.panel,
      sources: result.generated ? result.generated.request.sources.filter(s => s.included && s.text.trim()).map(s => ({label: s.label, text: s.text})) : [{label: 'Dyktowanie', text: result.sent}],
      proposal: result.keys.map(k => ({key: k, label: result.full[k], text: result.original[k]})), reviewed: result.keys.map(k => ({key: k, label: result.full[k], text: fieldText(result, k)})),
      before: result.keys.map(k => ({key: k, label: result.full[k], text: String(result.snapshot[k] ?? '')})), approved: receipt ? receipt.plan.changes.map(c => ({key: c.key, label: c.label, text: c.after})) : null,
      results: receipt ? receipt.results : null, review: result.doc ? result.doc.snapshot() : null, original: result.generated ? Doc().reviewDocument(result.generated).snapshot() : null,
      sections: result.generated ? result.generated.sections.map(s => ({label: s.label, subsections: s.leaves.map(l => l.name)})) : [], selected: [...result.selected], all: result.keys.length});
    historyRefresh?.();
  }
  function historyReviewText(entry) { // _review_text: provenance and changes per document part
    const doc = entry.review; if (!doc) return 'Nie zapisano oddzielnych rozstrzygnięć ani poprawek.';
    const names = Object.fromEntries(doc.leaves.map(l => [l.section + '/' + l.id, l.name])), original = Object.fromEntries((entry.original?.blocks || []).map(b => [b.id, b])), approved = !!entry.approved, out = [];
    for (const b of doc.blocks) {
      const meta = b.metadata || {}; let name = names[b.section + '/' + b.leaf] || 'Część dokumentu';
      if (b.kind === 'panel_row') name += ' — ' + (meta.label || 'Parametr'); else if (b.kind === 'inference') name += ' — wnioskowanie';
      const value = String(b.text || ''), previous = String(original[b.id]?.text ?? meta.original_text ?? value), issue = !!(meta.needs_review || (meta.assignment_issues || []).length);
      if (!value.trim() && !previous.trim() && !issue) continue;
      const rows = [name, 'Pochodzenie: ' + Doc().originCaption(b)];
      if (approved && entry.selected.length < entry.all && !entry.selected.includes(b.target)) rows.push('To pole nie zostało wybrane do wpisania.');
      if (b.kind !== 'panel_row' && Doc().originallyBlank(b)) rows.push('Treść: ' + (value || '(puste)'));
      else if (value !== previous) rows.push('Pierwotna propozycja: ' + (previous || '(puste)'), (approved ? 'Po sprawdzeniu: ' : 'Po edycji, bez zatwierdzenia: ') + (value || '(puste)'));
      else rows.push('Treść: ' + (value || '(puste)'));
      if (issue) rows.push('Uwaga informacyjna; bez oddzielnego rozstrzygnięcia.');
      rows.push(...(meta.quotes || []).map(q => 'Fragment źródła: „' + q + '”'));
      for (const i of meta.assignment_issues || []) { rows.push(i.message || 'Sprawdzenie przypisania'); const q = i.source_verified ? i.quote : i.proposed_quote; if (q) rows.push((i.source_verified ? 'Fragment źródła: ' : 'Niepotwierdzona propozycja: ') + q); if (i.source_verified && i.context) rows.push('Kontekst: ' + i.context); }
      out.push(rows.join('\n'));
    }
    return out.join('\n\n') || 'Nie zapisano oddzielnych rozstrzygnięć ani poprawek.';
  }
  function historyPages(entry) {
    const fields = items => (items || []).map(f => f.label + ':\n' + f.text).join('\n\n'), approved = !!entry.approved, pages = [];
    pages.push(['result', approved ? 'Wynik' : 'Wersja robocza', approved ? 'Zatwierdzony wynik' : 'Wersja robocza', fields(approved ? entry.approved : entry.reviewed)]);
    if (entry.results) pages.push(['outcome', 'Wpisanie', 'Wynik wpisania', entry.results.map(r => r.label + ': ' + ({verified: 'wpisanie potwierdzone', not_attempted: 'nie podjęto wpisania', conflict: 'konflikt przed wpisaniem', unknown: 'wpisanie niepotwierdzone'}[r.status] || r.status) + (r.detail ? '\n' + r.detail : '')).join('\n\n')]);
    pages.push(['sources', 'Źródła', 'Źródła', fields(entry.sources)], ['proposal', 'Propozycja', 'Propozycja AI', fields(entry.proposal)], ['review', 'Poprawki', 'Poprawki i uwagi', historyReviewText(entry)], ['before', 'Przed wpisaniem', 'Przed wpisaniem', fields(entry.before)],
      ['configuration', 'Ustawienia', 'Ustawienia', [`Tryb: ${HISTORY_MODE[entry.mode] || ''}`, 'Model: przykład demonstracyjny — bez AI', 'Panel parametrów: ' + (entry.panel ? 'włączony' : 'wyłączony'), ...entry.sections.flatMap(s => ['\n' + s.label, ...s.subsections.map(n => '• ' + n)])].join('\n')]);
    return pages;
  }
  const historyStamp = (date, seconds) => { const p = n => String(n).padStart(2, '0'); return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}${seconds ? ':' + p(date.getSeconds()) : ''}`; };
  function history() {
    let filter = '', selectedId = null, page = 'result';
    const html = `<div class="oa-app oa-hist"><input type="search" class="oa-hist-search" placeholder="Szukaj w źródłach, propozycji lub wyniku…" aria-label="Szukaj w historii dokumentów"><div class="oa-hist-split"><div class="oa-hist-list" role="listbox" tabindex="0" aria-label="Dokumenty w historii" data-list></div><div class="oa-hist-doc"><p class="oa-hist-summary" data-summary></p><div class="oa-tabs" role="tablist" aria-label="Zapisany dokument" data-doc-tabs></div><textarea readonly class="oa-rv-doc" data-doc-text aria-label="Zapisany dokument"></textarea></div></div><footer class="oa-footer">${button('Kopiuj wynik', 'copy-history', '', '', 'disabled')}${button('Usuń wpis', 'delete-history', '', '', 'disabled')}<span class="oa-pg-gap"></span>${button('Odśwież', 'refresh')}${button('Zamknij', 'close')}</footer></div>`;
    const win = makeWindow('opisai-history', 'OpisAI — Historia dokumentów', 1100, 740, html, () => { historyRefresh = null; }), root = win.content;
    const visible = () => state.history.filter(e => !filter || [historyStamp(e.ts), ...e.sources.map(s => s.text), ...e.proposal.map(f => f.text), ...(e.approved || e.reviewed).map(f => f.text)].join('\n').toLowerCase().includes(filter));
    function draw() {
      const items = visible(), entry = items.find(e => e.id === selectedId) || items[0] || null; selectedId = entry?.id || null;
      $('[data-list]', root).innerHTML = items.map(e => `<button type="button" role="option" class="oa-hist-item ${e.id === selectedId ? 'selected' : ''}" aria-selected="${e.id === selectedId}" data-entry="${e.id}"><span>${esc(historyStamp(e.ts) + ' · ' + (HISTORY_MODE[e.mode] || 'Dokument'))}</span><span>${esc(HISTORY_STATUS[e.status] || 'Sprawdź wynik')}</span></button>`).join('');
      $$('[data-entry]', root).forEach(el => el.addEventListener('click', () => { selectedId = el.dataset.entry; draw(); }));
      const pages = entry ? historyPages(entry) : []; if (!pages.some(p => p[0] === page)) page = 'result';
      $('[data-summary]', root).textContent = entry ? `${HISTORY_SUMMARY[entry.status] || 'Zapisany wynik'} · ${historyStamp(entry.ts, true)}\nZapisany stan dokumentu; ten podgląd nie zmienia bieżącej wizyty.` : 'Ten wpis nie zawiera zapisanego przebiegu przygotowania dokumentu.';
      $('[data-doc-tabs]', root).innerHTML = pages.map(([id, label, title]) => `<button type="button" role="tab" class="oa-tab ${page === id ? 'active' : ''}" aria-selected="${page === id}" data-page="${id}" title="${esc(title)}">${esc(label)}</button>`).join('');
      $$('[data-page]', $('[data-doc-tabs]', root)).forEach(el => el.addEventListener('click', () => { page = el.dataset.page; draw(); }));
      const text = $('[data-doc-text]', root); text.hidden = !entry; text.value = pages.find(p => p[0] === page)?.[3] || '';
      const copy = $('[data-action="copy-history"]', root); copy.disabled = !entry; $('span', copy).textContent = entry?.approved ? 'Kopiuj wynik' : 'Kopiuj wersję roboczą';
      $('[data-action="delete-history"]', root).disabled = !entry;
    }
    $('[data-list]', root).addEventListener('keydown', e => { if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault(); const items = visible(), i = items.findIndex(x => x.id === selectedId), next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (next) { selectedId = next.id; draw(); $('.oa-hist-item.selected', root)?.focus(); } });
    $('.oa-hist-search', root).addEventListener('input', e => { filter = e.target.value.trim().toLowerCase(); draw(); });
    bind(root, 'copy-history', () => { const e = state.history.find(x => x.id === selectedId); if (e) copyText((e.approved || e.reviewed).map(f => f.label + ':\n' + f.text).join('\n\n'), $('[data-action="copy-history"]', root)); });
    bind(root, 'delete-history', () => { const id = selectedId; if (!id) return; messageBox({id: 'opisai-history-delete', title: 'Usuń wpis z historii?', icon: 'question', text: 'Usunąć ten dokument z historii OpisAI?', buttons: [{label: 'Nie', action: 'close', default: true}, {label: 'Tak', action: 'yes', primary: true, onClick: () => { state.history = state.history.filter(e => e.id !== id); draw(); }}]}); });
    bind(root, 'refresh', draw); bind(root, 'close', () => win.close());
    historyRefresh = () => { if (win.el?.isConnected) draw(); };
    draw();
  }
  function clearHistory(after) {
    if (!state.history.length) { toast('Historia jest już pusta.'); return; }
    messageBox({id: 'opisai-clear-history', title: 'OpisAI — wyczyść historię', icon: 'info', heading: 'Potwierdzenie', text: 'Wyczyścić historię tej sesji? Wpisy znikną z listy. Treść wizyty w Klinice pozostanie bez zmian.', buttons: [{label: 'Anuluj', action: 'close', default: true}, {label: 'Wyczyść historię', action: 'clear', primary: true, onClick: () => { state.history = []; historyRefresh?.(); after?.(); }}]});
  }
  function about(initial='about'){
    let page=typeof initial==='string'?initial:'about';
    const html=`<div class="oa-app"><nav class="oa-tabs" style="padding-top:9px">${[['about','O aplikacji'],['changes','Co nowego'],['contact','Kontakt'],['licenses','Licencje']].map(([id,label])=>`<button class="oa-tab ${page===id?'active':''}" data-about="${id}">${label}</button>`).join('')}</nav><div class="oa-content" data-about-page style="padding-top:20px"></div><footer class="oa-footer"><span class="oa-footnote">OpisAI ${VERSION} · interaktywna demonstracja</span>${button('Kopiuj informacje','copy-about','','copy')}${button('Zamknij','close','primary')}</footer></div>`;
    const win=makeWindow('opisai-about','OpisAI — o aplikacji',680,560,html),root=win.content;
    function draw(){
      $$('[data-about]',root).forEach(el=>el.classList.toggle('active',el.dataset.about===page));const target=$('[data-about-page]',root);
      if(page==='about')target.innerHTML=`<div class="oa-about-brand"><div class="oa-about-logo">${icon('opisai',44)}</div><div><h1>OpisAI</h1><p>Asystent dokumentacji weterynaryjnej</p><p class="oa-small">Wersja ${VERSION}</p></div></div><div class="oa-about-features">${[['document','Opis z notatki','Uporządkowanie źródeł i wybór wariantu.'],['mic','Dyktowanie','Od transkrypcji do sprawdzonego wpisu.'],['eye','Przegląd wyniku','Porównanie, edycja i świadome zatwierdzenie.'],['clinic','Obok Twojego programu','Praca na polach istniejącej wizyty.']].map(([ic,title,text])=>`<div class="oa-about-feature">${icon(ic,20)}<div><strong>${title}</strong><small>${text}</small></div></div>`).join('')}</div>${notice('To interaktywne demo OpisAI dla systemu Microsoft Windows. Przykładowe generowanie i dyktowanie działają lokalnie. Strona nie łączy się z modelami AI i nie używa mikrofonu.')}<div class="oa-about-block"><h3>Jak zacząć</h3><p>Kliknij niebieski bąbelek, aby opracować notatkę. Przytrzymaj go przez chwilę, aby zobaczyć dyktowanie, albo przeciągnij go na pole Kliniki, aby opracować tylko to pole. Po najechaniu pod bąbelkiem pojawiają się akcje „Opisz” i „Dyktuj”. Prawy przycisk otwiera menu OpisAI, takie samo jak w ikonie w zasobniku.</p></div>`;
      else if(page==='changes')target.innerHTML=`<div class="oa-about-block"><h2>Co nowego</h2><p class="oa-muted">Funkcje odwzorowane z aplikacji ${VERSION}</p><h3>Kontrolowany przebieg dokumentacji</h3><ul><li>Edytowalne źródła i sześć wariantów opracowania.</li><li>Podgląd wersji roboczej podczas generowania.</li><li>Porównanie źródła z edytowalnym wynikiem.</li><li>Osobne zatwierdzenie dokładnej treści przed wpisaniem.</li><li>Kontrola konfliktów oraz cofanie potwierdzonego wpisu.</li></ul><h3>Dyktowanie i wygoda</h3><ul><li>Panel transkrypcji, fala mikrofonu i stany kart.</li><li>Kontynuacja nagrania lub przygotowanie opisu z notatki.</li><li>Podpisane akcje przy bąbelku.</li><li>Ustawienia połączeń, wyglądu, pisowni i historii.</li></ul></div>`;
      else if(page==='contact'){target.innerHTML=`<div class="oa-about-block"><h2>Porozmawiajmy o OpisAI</h2><p class="oa-muted">Chcesz zobaczyć aplikację w swoim gabinecie?</p><div class="oa-contact-card"><strong>Łukasz Guziczak</strong><p>Autor OpisAI</p><a class="oa-contact-mail" href="mailto:guziczak@proton.me?subject=OpisAI%20%E2%80%94%20zapytanie%20z%20dema">guziczak@proton.me</a><div class="oa-inline-controls"><a class="oa-btn primary" href="mailto:guziczak@proton.me?subject=OpisAI%20%E2%80%94%20zapytanie%20z%20dema">${icon('send',15)} Napisz wiadomość</a>${button('Kopiuj adres','copy-email','','copy')}</div></div><p>W wiadomości możesz podać nazwę programu gabinetowego i opisać, jak dziś przygotowujesz dokumentację.</p></div>`;bind(target,'copy-email',()=>copyText('guziczak@proton.me',$('[data-action="copy-email"]',target)));}
      else target.innerHTML=`<div class="oa-about-block"><h2>Licencje i informacje</h2><p class="oa-muted">Demonstracja odtwarza interfejs OpisAI.</p><h3>Aplikacja desktopowa</h3><p>OpisAI wykorzystuje między innymi Python, PySide6, silniki rozpoznawania mowy i składniki przeglądarki. Pełne informacje o licencjach są dostępne w dostarczonym programie.</p><h3>Ta witryna</h3><p>Interfejs demonstracyjny jest napisany w HTML, CSS i JavaScript. Nie uruchamia programu Python ani dołączonych do niego bibliotek.</p><h3>Dane przykładu</h3><p>Przypadek kliniczny ma charakter demonstracyjny. Wynik pokazuje funkcje interfejsu i wymaga weryfikacji — nie jest poradą weterynaryjną.</p></div>`;
    }
    $$('[data-about]',root).forEach(el=>el.addEventListener('click',()=>{page=el.dataset.about;draw();}));bind(root,'close',()=>win.close());bind(root,'copy-about',()=>copyText(`OpisAI ${VERSION}\nAsystent dokumentacji weterynaryjnej\nInteraktywna demonstracja OpisAI\nhttps://guziczak.github.io/opisai/\nguziczak@proton.me`,$('[data-action="copy-about"]',root)));draw();
  }

  /* ---------------------------------------------------------------- bubble
   * 0.12.0rc32 Bubble: one painted disc showing its state inside (OpisAI,
   * dots, REC, Sprawdź, Gotowe, Błąd), labelled hover actions, a hold ring,
   * a no-overshoot drag with a contour-only stretch, soaking into a dropped
   * field, an idle taskbar bounce and the tray menu on right click. */
  const ORB_R=50,LONG_PRESS=.45,TICK=1/30,ORB_POS_KEY='opisai.demo.bubble.v1';
  const ORB_STATES={idle:['OpisAI','#2563eb'],processing:['…','#2563eb'],recording:['REC','#ef4444'],review:['Sprawdź','#f59e0b'],done:['Gotowe','#22c55e'],error:['Błąd','#ef4444']};
  const ORB_ACTIONS={idle:[['describe','Opisz'],['dictate','Dyktuj']],recording:[['finish','Zakończ'],['show','Pokaż']],processing:[['show','Pokaż'],['cancel','Anuluj']],review:[['show','Pokaż']]};
  const ORB_SPOKEN={processing:'przetwarzanie',recording:'nagrywanie (REC)',review:'Sprawdź',done:'Gotowe',error:'Błąd'};
  const orb={el:null,x:0,y:0,scale:0,scaleVel:0,scaleTarget:1,amp:0,ampTarget:0,hp1:0,hp2:0,chips:false,chipsAlpha:0,dip:0,pressed:false,armed:false,fired:false,arming:0,pressAt:0,hintState:'',sx:1,sy:1,lastY:null,decay:false,bulge:0,bulgeAngle:0,split:null,soak:null,soaked:false,exit:null,bounce:null,back:null,jellyR:null,contact:0,phys:null,physAcc:0,recAt:0,frame:0,last:0,hover:false,pressOrigin:null,drops:[],stateTimer:0,stateRev:0,menuBlock:0,live:null,timers:{}};
  let orbMotion=null,orbGesture=null,orbMotionQuery=null,pointer=null,dropTarget=null,lastInput=0,bounceWindow={last:null,count:0},card=null,cardSerial=0,unavailableToast=null;
  const nowS=()=>performance.now()/1000;
  const orbReduced=()=>!!orbMotionQuery?.matches;
  const stateKey=()=>ORB_ACTIONS[state.phase]?state.phase:'';
  const smooth=(a,b,x)=>x<=a?0:x>=b?1:((x-a)/(b-a))**2*(3-2*(x-a)/(b-a));
  const hexRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const rgbHex=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
  const lerpHex=(a,b,t)=>{const A=hexRgb(a),B=hexRgb(b);return rgbHex(A.map((v,i)=>Math.trunc(v+(B[i]-v)*Math.max(0,Math.min(1,t)))));};
  function shade(hex,factor){ // QColor.lighter/darker: HSV value scaled, saturation absorbs overflow
    const [r,g,b]=hexRgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let s=max?d/max*255:0,v=max*factor,h=0;
    if(d)h=(max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4)*60;
    if(v>255){s=Math.max(0,s-(v-255));v=255;}
    const c=v*s/255,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,k=Math.floor(h/60)%6;
    return rgbHex([[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][k].map(n=>n+m));
  }
  function workArea(){const top=$('#taskbar')?.getBoundingClientRect().top;return {left:0,top:0,right:innerWidth,bottom:Number.isFinite(top)&&top>0?Math.min(innerHeight,top):innerHeight-48};}
  function liveWindows(){return [...windows.values()].filter(w=>w?.el?.isConnected&&!w.closed);}
  function raiseActive(){const w=liveWindows().sort((a,b)=>(+a.el.style.zIndex||0)-(+b.el.style.zIndex||0)).at(-1);if(!w)return false;w.show();w.focus();return true;}
  const settingsOpen=()=>!!windows.get('opisai-settings')?.el?.isConnected;

  /* MacroController._safe_set_state / Bubble.set_state: Gotowe returns to idle after
   * 4 s and Błąd after 3 s; a held or dragged bubble waits for its release. */
  function setPhase(phase){
    const previous=state.phase;clearTimeout(orb.stateTimer);const rev=++orb.stateRev;state.phase=phase;
    const delay=phase==='done'?4000:phase==='error'?3000:0;
    if(delay){const expire=()=>{if(rev!==orb.stateRev||state.phase!==phase)return;if(pointer||orb.pressed||orb.armed){orb.stateTimer=setTimeout(expire,100);return;}setPhase('idle');};orb.stateTimer=setTimeout(expire,delay);}
    if(phase==='recording'&&previous!=='recording')orb.recAt=nowS();
    if((phase==='processing'||phase==='recording')&&(orb.bounce||orb.back))holdPosition();
    if(orb.el){orb.el.dataset.phase=phase;renderOrbActions();$('.oa-orb',orb.el)?.setAttribute('aria-label',`OpisAI${phase==='idle'?'':' — '+ORB_SPOKEN[phase]}. Kliknij: opisz. Przytrzymaj: dyktuj. Prawy przycisk: menu.`);}
    // The state is painted inside the disc; screen readers hear it from a polite status region (idle clears it, so a repeat is heard again).
    if(orb.live&&phase!==previous)orb.live.textContent=phase==='idle'?'':'OpisAI — '+ORB_SPOKEN[phase];
    orbKick();
  }
  function beginOperation(){ // _begin_bubble_operation: a new action owns its feedback
    if(state.phase==='done'||state.phase==='error')setPhase('idle');else{clearTimeout(orb.stateTimer);orb.stateRev++;}
    dismissCard(true);state.handlingFailure=false;
  }
  /* SafeCoordinator.intercept_trigger: clicking recalls the open view, it never starts a second operation. */
  function recall(){
    if(state.receipt){state.receipt.deliver?.();return true;} // the last text: its review is the current view
    if(state.recording){showDictation();return true;}
    if(raiseActive())return true;
    if(state.job){const w=windows.get('opisai-progress');if(w){w.show();w.focus();}return true;}
    if(state.review){review(state.review);return true;}
    return false;
  }
  function visitReady(){ // MacroController.on_trigger: the sub-window is required, OpisAI never opens a visit
    if(window.Clinic?.isEditorOpen?.())return true;
    if(!window.Clinic?.isOpen?.())failure("Nie znaleziono Kliniki (main: 'Klinika', sub: 'Rejestracja wizyty').\nUruchom Klinikę (przycisk na dymku) albo wybierz okno ponownie (prawy klik na bąbelek).",{actionLabel:'▶ Uruchom Klinikę',actionHint:'Uruchom Klinikę XP (wizytę otwierasz sam)',onAction:()=>{dismissCard();state.handlingFailure=false;window.Clinic?.open();}});
    else failure("Nie znaleziono podokna opisu wizyty (fragment: 'Rejestracja wizyty').\nOtwórz wizytę w Klinice i spróbuj ponownie.\n(Sub-okno musisz wybrać sam — OpisAI nie wybiera wizyty.)",{actionLabel:'⚙',actionHint:'Kliknij aby otworzyć konfigurację',onAction:()=>{dismissCard();state.handlingFailure=false;settings();}});
    return false;
  }
  function describe(options={}){ // click, "Opisz", drop on a field
    options=typeof options==='string'?{field:options}:validOption(options);
    if(state.closed)launch();
    if(recall())return;
    rescueOrb();beginOperation();
    if(!visitReady())return;
    prepare(options);
  }
  function orbAction(action){ // _on_bubble_action: labelled actions run the gesture paths
    if(action==='describe')describe();else if(action==='dictate')dictate();else if(action==='finish'){if(state.recording)finishDictation();}
    else if(action==='show')recall();
    else if(action==='cancel'){ // SafeCoordinator.cancel: generation, the microphone start or the last-text receipt
      if(state.job)state.job.cancel();
      else if(state.recording&&!state.recording.listening||state.receipt){dropDictation();toast('Dyktowanie anulowane. Pola wizyty pozostają bez zmian.');}
    }
  }

  /* MacroController._on_failure_impl: red "Błąd", a bulge of the contour and an error notice budding from its peak. */
  function failure(message,options={}){
    emerge();if(state.handlingFailure)return;state.handlingFailure=true;
    setPhase('error');
    const target={x:orb.x+60,y:orb.y-100},angle=Math.atan2(target.y-orb.y,target.x-orb.x),peak=ORB_R+ORB_R*.8*1.2,serial=++state.failureSerial;
    const origin={x:orb.x+Math.cos(angle)*peak,y:orb.y+Math.sin(angle)*peak};
    split(angle,()=>{if(state.handlingFailure&&serial===state.failureSerial)errorCard(message,{...options,origin});});
  }
  function split(angle,onPeak){ // inflate 300 ms, hold 100 ms, spawn, deflate 180 ms, settle 70 ms
    if(orbReduced()||!orb.el||state.closed){onPeak?.();return;}
    orb.bulgeAngle=angle;orb.split={start:nowS(),onPeak};orbKick();
  }
  const outCubic=t=>1-(1-t)**3,outQuad=t=>1-(1-t)**2,inOutBack=t=>{const c=1.70158*1.525;return t<.5?((2*t)**2*((c+1)*2*t-c))/2:((2*t-2)**2*((c+1)*(t*2-2)+c)+2)/2;};
  function splitAmount(t){if(t<.3)return 1.2*outCubic(t/.3);if(t<.4)return 1.2;if(t<.58)return 1.2-1.3*inOutBack((t-.4)/.18);if(t<.65)return -.1+.1*outQuad((t-.58)/.07);return null;}

  /* ErrorBubble: "⚠ Błąd" notice with ×, copy and an optional action; Esc closes it. */
  function blobPath(left,top,w,h,hp1,hp2){
    const corner=Math.max(8,Math.min(w,h)*.30),amplitude=Math.max(3.5,Math.min(w,h)*.06),right=left+w,bottom=top+h,raw=[];
    const edge=(x0,y0,x1,y1,nx,ny)=>{for(let i=0;i<24;i++){const t=i/24;raw.push([x0+(x1-x0)*t,y0+(y1-y0)*t,nx,ny]);}};
    const arc=(cx,cy,from)=>{for(let i=0;i<18;i++){const a=from+i/18*Math.PI/2;raw.push([cx+corner*Math.cos(a),cy+corner*Math.sin(a),Math.cos(a),Math.sin(a)]);}};
    edge(left+corner,top,right-corner,top,0,-1);arc(right-corner,top+corner,-Math.PI/2);edge(right,top+corner,right,bottom-corner,1,0);arc(right-corner,bottom-corner,0);
    edge(right-corner,bottom,left+corner,bottom,0,1);arc(left+corner,bottom-corner,Math.PI/2);edge(left,bottom-corner,left,top+corner,-1,0);arc(left+corner,top+corner,Math.PI);
    const N=raw.length,pts=raw.map(([x,y,nx,ny],i)=>{const t=2*Math.PI*i/N,b=Math.sin(t*3+.6+hp1)*.55+Math.sin(t*5+2.3+hp2*1.3)*.35+Math.sin(t*7+1.1+hp1*.4-hp2*.8)*.3,bump=Math.max(0,b)*amplitude;return [x+nx*bump,y+ny*bump];});
    const f=n=>n.toFixed(1);let d=`M${f(pts[0][0])} ${f(pts[0][1])}`;
    for(let i=0;i<N;i++){const p0=pts[(i+N-1)%N],p1=pts[i],p2=pts[(i+1)%N],p3=pts[(i+2)%N];d+=`C${f(p1[0]+(p2[0]-p0[0])/6)} ${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)} ${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])} ${f(p2[1])}`;}
    return d+'Z';
  }
  function errorCard(message,{title='⚠  Błąd',actionLabel='',actionHint='',onAction=null,origin=null,accent='#ef4444'}={}){
    dismissCard(true);const host=document.getElementById('overlay-layer')||document.body,id='oa-err-'+(++cardSerial);
    // Never takes focus (rc32 shows it without activating), so the message is an alert, not an alertdialog.
    const el=document.createElement('section');el.className='oa-error-card';el.setAttribute('role','group');el.setAttribute('aria-labelledby',id+'-t');el.setAttribute('aria-describedby',id+'-b');
    el.innerHTML=`<svg class="oa-error-blob" aria-hidden="true"><defs><radialGradient id="${id}-f" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${shade(accent,1.13)}"/><stop offset=".55" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent,1/1.1)}"/></radialGradient><linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".157"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="${id}-p"><stop offset="0" stop-color="${shade(accent,1.4)}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><g id="${id}-g"><path data-shape="body"/><path data-shape="neck"/></g><clipPath id="${id}-c"><use href="#${id}-g"/></clipPath></defs><g data-trail></g>${[[14,.035],[9,.059],[4,.086]].map(([dy,a])=>`<use href="#${id}-g" transform="translate(0 ${dy})" fill="#000" opacity="${a}"/>`).join('')}<use href="#${id}-g" fill="url(#${id}-f)"/><use data-stroke href="#${id}-g" fill="none" stroke="${shade(accent,1/1.2)}" stroke-width="1"/><rect data-sheen clip-path="url(#${id}-c)" fill="url(#${id}-s)"/></svg><div class="oa-error-content"><div class="oa-error-head"><strong id="${id}-t">${esc(title)}</strong><button type="button" class="oa-error-close" aria-label="Zamknij komunikat" title="Zamknij ten komunikat (Esc)">×</button></div><p class="oa-error-body" id="${id}-b" role="alert">${esc(message)}</p><div class="oa-error-hints">${actionLabel&&onAction?`<button type="button" class="oa-error-action" title="${esc(actionHint)}">${esc(actionLabel)}</button>`:''}<button type="button" class="oa-error-copy" aria-label="Kopiuj komunikat do schowka" title="Kopiuj komunikat do schowka">📋</button></div></div>`;
    host.append(el);const content=$('.oa-error-content',el),cw=content.offsetWidth||356,ch=content.offsetHeight||170,center={x:orb.x,y:orb.y};
    const W=cw+48,H=ch+48,x=Math.max(20,Math.min(innerWidth-W-20,center.x-W/2+60));let y=center.y-H-16;if(y<20)y=center.y+140;
    const c={el,svg:$('svg',el),content,target:{x,y,w:W,h:H},origin:origin||center,start:nowS(),hp1:Math.random()*Math.PI*2,hp2:Math.random()*Math.PI*2,trail:[],lastTrail:0,wobble:null,closing:null,frame:0,id,instant:orbReduced()};
    Object.assign(content.style,{left:(x+24)+'px',top:(y+24)+'px'});card=c;
    const stamp=new Date(),pad=n=>String(n).padStart(2,'0'),when=`${stamp.getFullYear()}-${pad(stamp.getMonth()+1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`;
    $('.oa-error-close',el).addEventListener('click',()=>dismissCard());
    $('.oa-error-action',el)?.addEventListener('click',()=>{if(!c.closing)onAction();});
    const copy=$('.oa-error-copy',el);copy.addEventListener('click',async()=>{const payload=`⚠ Błąd OpisAI (${when})\n\n${message}`;try{await navigator.clipboard.writeText(payload);}catch(_){const t=document.createElement('textarea');t.value=payload;t.style.cssText='position:fixed;left:-9999px';document.body.append(t);t.select();try{document.execCommand('copy');}catch(__){}t.remove();}copy.textContent='✓';setTimeout(()=>{if(copy.isConnected)copy.textContent='📋';},1500);});
    el.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismissCard();}});
    c.timeout=setTimeout(()=>dismissCard(),20000);drawCard(c);
    return c;
  }
  function drawCard(c){
    if(card!==c||!c.el.isConnected)return;
    const now=nowS(),t=now-c.start,{target:tg,origin}=c;let v=c.instant?1:Math.min(1,t/.95);v=c.instant?1:outCubic(v);
    if(v>=.75&&!c.wobble&&!c.instant)c.wobble=now;
    const wob=c.wobble?(()=>{const u=Math.min(1,(now-c.wobble)/.5),s=1.70158;return .08*(1-(1+(s+1)*(u-1)**3+s*(u-1)**2));})():0;
    c.hp1=(c.instant?c.hp1:c.hp1+(now-(c.last||now))*.8);c.hp2=(c.instant?c.hp2:c.hp2+(now-(c.last||now))*.54);c.last=now;
    const fade=c.closing?Math.max(0,1-(now-c.closing)/.22):c.instant?1:outQuad(Math.min(1,t/.26));
    c.el.style.opacity=fade.toFixed(3);c.content.style.opacity=(v>.92?Math.min(1,(v-.92)/.08):0).toFixed(3);
    const tx=tg.x+tg.w/2,ty=tg.y+tg.h/2,cx=origin.x+(tx-origin.x)*v,cy=origin.y+(ty-origin.y)*v,scale=.15+v*.85,bw=tg.w*scale-48,bh=tg.h*scale-48;
    if(v>.05&&v<.8&&v-c.lastTrail>.08){c.lastTrail=v;c.trail.push({x:cx+(Math.random()-.5)*12,y:cy+(Math.random()-.5)*12,size:Math.min(tg.w,tg.h)*scale*.18*(.7+Math.random()*.4),life:1,at:now});}
    c.trail=c.trail.filter(p=>{const age=(now-p.at)/.05;p.life=1-.045*age;p.size2=p.size*Math.pow(.972,age);return p.life>.02;});
    const left=Math.min(origin.x-40,tg.x),top=Math.min(origin.y-40,tg.y),right=Math.max(origin.x+40,tg.x+tg.w),bottom=Math.max(origin.y+40,tg.y+tg.h);
    Object.assign(c.svg.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});c.svg.setAttribute('viewBox',`${left} ${top} ${right-left} ${bottom-top}`);
    const body=$(`[data-shape="body"]`,c.svg),neck=$(`[data-shape="neck"]`,c.svg);
    if(bw<4||bh<4){body.setAttribute('d','');neck.setAttribute('d','');}
    else{
      body.setAttribute('d',blobPath(cx-bw/2,cy-bh/2,bw,bh,c.hp1,c.hp2));
      const early=c.instant?0:Math.max(0,1-v/.65)*.4,gx=tx-origin.x,gy=ty-origin.y;
      if((early>.005||wob>.005)&&(gx||gy)){const deg=Math.atan2(gy,gx)*180/Math.PI;body.setAttribute('transform',`translate(${cx} ${cy}) rotate(${deg}) scale(${1+early+wob} ${1-early*.4-wob*.5}) rotate(${-deg}) translate(${-cx} ${-cy})`);}else body.removeAttribute('transform');
      let nd='';
      if(v<.75&&!c.instant){const alpha=1-Math.max(0,(v-.35)/.4),dx=cx-origin.x,dy=cy-origin.y,len=Math.hypot(dx,dy);
        if(len>8){const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,sw=(18+8*(1-v))*alpha,ew=Math.min(bw,bh)*.45*alpha,f=n=>n.toFixed(1);
          nd=`M${f(origin.x+nx*sw/2)} ${f(origin.y+ny*sw/2)}C${f(origin.x+ux*len*.35+nx*sw*.5)} ${f(origin.y+uy*len*.35+ny*sw*.5)} ${f(cx-ux*len*.2+nx*ew*.5)} ${f(cy-uy*len*.2+ny*ew*.5)} ${f(cx+nx*ew/2)} ${f(cy+ny*ew/2)}L${f(cx-nx*ew/2)} ${f(cy-ny*ew/2)}C${f(cx-ux*len*.2-nx*ew*.5)} ${f(cy-uy*len*.2-ny*ew*.5)} ${f(origin.x+ux*len*.35-nx*sw*.5)} ${f(origin.y+uy*len*.35-ny*sw*.5)} ${f(origin.x-nx*sw/2)} ${f(origin.y-ny*sw/2)}Z`;}}
      neck.setAttribute('d',nd);
    }
    const grad=$(`#${c.id}-f`,c.svg);grad.setAttribute('cx',cx-bw/2+bw*.3);grad.setAttribute('cy',cy-bh/2+bh*.26);grad.setAttribute('r',Math.max(1,bw*1.2));
    const sheen=$('[data-sheen]',c.svg);sheen.setAttribute('x',cx-bw/2-20);sheen.setAttribute('y',cy-bh/2);sheen.setAttribute('width',bw+40);sheen.setAttribute('height',Math.max(1,bh*.6));
    $('[data-stroke]',c.svg).style.display=v<.75?'none':'';
    $('[data-trail]',c.svg).innerHTML=c.trail.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(2,p.size2||p.size).toFixed(1)}" fill="url(#${c.id}-p)" opacity="${Math.min(.65,p.life*.65).toFixed(2)}"/>`).join('');
    if(c.closing&&fade<=0){c.el.remove();if(card===c)card=null;return;}
    if(c.instant)return; // reduced motion: one static frame
    c.frame=requestAnimationFrame(()=>drawCard(c));
  }
  function dismissCard(immediate=false){
    const c=card;if(!c)return;clearTimeout(c.timeout);
    if(immediate||c.instant){cancelAnimationFrame(c.frame);c.el.remove();card=null;return;}
    if(!c.closing){c.closing=nowS();$$('button',c.el).forEach(b=>b.disabled=true);}
  }

  /* Bubble.trigger_soak_into / trigger_emerge: the bubble flows into the field, flattens and fades,
   * then reappears where it was grabbed once the action has started. */
  function fieldAt(x,y){
    const hit=(document.elementsFromPoint?.(x,y)||[]).find(el=>!el.closest?.('.oa-orb-wrap,.oa-orb-hint,.oa-field-mark,.oa-orb-splash'));
    return hit?.closest?.('[data-clinic-field]')?.dataset.clinicField||null; // the topmost element: a covered field is not a target
  }
  function markField(key){
    let mark=$('.oa-field-mark');
    if(!key){mark?.remove();return;}
    const field=document.querySelector(`[data-clinic-field="${key}"]`);if(!field)return;
    const r=field.getBoundingClientRect(),w=r.width+12,h=r.height+12;
    if(!mark){mark=document.createElement('div');mark.className='oa-field-mark';mark.setAttribute('aria-hidden','true');(document.getElementById('overlay-layer')||document.body).append(mark);}
    Object.assign(mark.style,{left:(r.left-6)+'px',top:(r.top-6)+'px',width:w+'px',height:h+'px'});
    mark.innerHTML=`<svg width="${w}" height="${h}"><rect class="under" x="3" y="3" width="${Math.max(0,w-7)}" height="${Math.max(0,h-7)}" rx="8"/><rect class="ants" x="3" y="3" width="${Math.max(0,w-7)}" height="${Math.max(0,h-7)}" rx="8"/></svg>`;
  }
  function soakInto(x,y,done){
    if(orb.soak||orb.soaked)return;
    cancelGesture();releaseIdleMotion();orbMotion.stop();hideHint();orb.amp=orb.ampTarget=0;orb.scaleTarget=1;orb.scaleVel=0;
    if(orbReduced()){orb.soaked=true;renderOrb();setTimeout(done,0);return;}
    orb.soak={start:nowS(),from:{x:orb.x,y:orb.y},to:{x,y},done};orbKick();
  }
  function emerge(){
    if(!orb.soaked)return;
    releaseIdleMotion();orb.soaked=false;
    if(orb.pressOrigin){orb.x=orb.pressOrigin.x;orb.y=orb.pressOrigin.y;orbMotion.place(orb.x,orb.y);}
    orb.sx=orb.sy=1;orb.scale=orbReduced()?1:0;orb.scaleVel=0;orb.scaleTarget=orb.hover?1.1:1;saveOrbPosition();orbKick();
  }
  function onDrop(field){ // MacroController._on_bubble_dropped
    markField(null);
    if(!field||state.job||settingsOpen())return false;
    const el=document.querySelector(`[data-clinic-field="${field}"]`);if(!el)return false;
    const r=el.getBoundingClientRect();
    soakInto(r.left+r.width/2,r.top+r.height/2,()=>{describe({field});if(!state.job)emerge();});
    return true;
  }

  /* Bubble.trigger_exit_animation ("Zamknij"): soft collapse with one ripple, about 0.38 s. */
  function closeApp(){
    if(state.closed)return;
    if(state.recording){finishDictation();Shell.confirm({title:'OpisAI — informacja',icon:'info',message:'Zakończ odczyt albo dyktowanie przed zamknięciem.'});return;}
    if(state.job){state.job.cancel();Shell.confirm({title:'OpisAI — informacja',icon:'info',message:'Kończę transport. Zamknij aplikację po zwolnieniu bieżącej operacji.'});return;}
    liveWindows().forEach(w=>w.close());state.review=null;state.operation=null;state.active=null;dismissCard(true);markField(null);
    const finish=()=>{state.closed=true;syncTray();orb.exit=null;stopPhysics();if(orb.el)orb.el.classList.add('is-hidden');hideHint();toast('OpisAI zostało zamknięte. W demonstracji bąbelek wróci po kliknięciu ikony OpisAI w zasobniku albo na pulpicie.');};
    cancelGesture();releaseIdleMotion();stopPhysics();hideHint();
    if(orbReduced()){finish();return;}
    orb.exit={start:nowS(),done:finish};orb.scale=1;orb.scaleTarget=1;orb.scaleVel=0;orb.amp=orb.ampTarget=0;orb.sx=orb.sy=1;orbKick();
  }
  function launch(){ // start (or restart after "Zamknij"): scale from zero with the entrance spring
    if(!orb.el)return;
    const was=state.closed;state.closed=false;syncTray();orb.exit=null;orb.el.classList.remove('is-hidden');
    if(was||!orbOnScreen()){const p=loadOrbPosition();orb.x=p.x;orb.y=p.y;orbMotion.place(orb.x,orb.y);}
    if(was){setPhase('idle');orb.scale=orbReduced()?1:0;orb.scaleVel=0;orb.scaleTarget=1;}
    orbKick();
  }
  function showBubble(){ // a second start of OpisAI: RAISE the running bubble (mini bounce when no window is open)
    if(state.closed){launch();return;}
    if(raiseActive())return;
    startBounce();
  }

  /* Persistence and rescue (config bubble_pos_x/y, _place_default, _rescue_bubble_if_offscreen). */
  function loadOrbPosition(){
    const a=workArea(),fallback={x:Math.max(ORB_R+8,a.right-170),y:Math.max(ORB_R+8,a.bottom-200)};
    try{const p=JSON.parse(localStorage.getItem(ORB_POS_KEY)||'null');if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=a.left&&p.x<a.right&&p.y>=a.top&&p.y<a.bottom)return {x:p.x,y:p.y};}catch(_){}
    return fallback;
  }
  function saveOrbPosition(){try{localStorage.setItem(ORB_POS_KEY,JSON.stringify({x:Math.round(orb.x),y:Math.round(orb.y)}));}catch(_){}}
  function orbOnScreen(){const a=workArea(),R=55;return orb.x+R>a.left&&orb.x-R<a.right&&orb.y+R>a.top&&orb.y-R<a.bottom;}
  function rescueOrb(){
    if(!orb.el||state.closed||orb.soak||orb.soaked||orb.exit||pointer||orbOnScreen())return false;
    const a=workArea();stopPhysics();releaseIdleMotion();orb.x=Math.max(ORB_R,a.right-20-ORB_R);orb.y=Math.max(ORB_R,a.bottom-20-ORB_R);orbMotion.place(orb.x,orb.y);saveOrbPosition();orbKick();
    return true;
  }

  /* Idle taskbar bounce (_maybe_idle_bounce every second, Bubble.start_bounce, ui/bubble_motion.py). */
  function maybeIdleBounce(){
    rescueOrb();
    if(state.closed||document.hidden||liveWindows().length||state.job||state.recording||!preferences.idleBounce||orb.exit||orb.bounce||orb.phys)return;
    if(orb.hover){bounceWindow={last:null,count:0};return;}
    const interval=preferences.bounceInterval,idle=nowS()-lastInput;
    if(idle<interval){bounceWindow={last:null,count:0};if(orb.back)springBackSlow();return;}
    if(preferences.bounceMax>0&&bounceWindow.count>=preferences.bounceMax)return;
    const now=nowS();if(bounceWindow.last!==null&&now-bounceWindow.last<interval)return;
    if(startBounce()){bounceWindow.last=now;bounceWindow.count++;}
  }
  function startBounce(){
    if(!orb.el||state.closed||orb.bounce||orb.exit||orb.soak||orb.soaked||orb.back?.jelly||orb.phys||orb.scale<.9||pointer||orbReduced())return false;
    if(state.phase==='processing'||state.phase==='recording')return false;
    const radius=ORB_R*orb.scale,target=workArea().bottom-radius;
    if(target-orb.y<40)return false;
    orb.back=null;orbMotion.stop();hideHint();
    orb.jellyR=radius;orb.bounce={origin:orb.y,target,jelly:OpisAIOrbMotion.createJelly(target-orb.y,radius),splashCount:0,pending:0,minScale:1};orb.contact=0;orb.sx=orb.sy=1;orb.decay=false;
    orbKick();return true;
  }
  function endBounce(){
    const b=orb.bounce;orb.bounce=null;orb.decay=true;
    orb.back={from:orb.y,to:b.origin,start:nowS(),dur:.85,ease:t=>-(Math.cos(Math.PI*t)-1)/2,jelly:true};
  }
  function springBackSlow(){ // the user returned during the return: a gentle 1.2 s OutQuad back home
    const b=orb.back;if(!b)return;
    orb.back={from:orb.y,to:b.to,start:nowS(),dur:1.2,ease:outQuad,jelly:orb.jellyR!==null};if(orb.jellyR!==null)orb.decay=true;
  }
  function holdPosition(){ // a work view opened: stop spatial animation where the bubble is
    if(orb.bounce||orb.back){orb.bounce=null;orb.back=null;if(orb.jellyR!==null)orb.decay=true;orbKick();}
  }
  function captureAtCurrent(){ // grabbed during a bounce: the current position becomes home
    orb.bounce=null;orb.back=null;if(orb.jellyR!==null)orb.decay=true;saveOrbPosition();
  }
  function releaseIdleMotion(){orb.bounce=null;orb.back=null;orb.jellyR=null;orb.contact=0;orb.decay=false;orb.drops=[];}
  function emitSplash(f){
    const b=orb.bounce;if(f.impactCount<=b.splashCount)return;
    if(b.pending!==f.impactCount){b.pending=f.impactCount;b.minScale=f.scaleY;}
    if(f.scaleY<b.minScale){b.minScale=f.scaleY;return;}
    if(f.contact<=0||b.minScale>.72||f.scaleY-b.minScale<.004)return;
    b.splashCount=f.impactCount;
    if(f.impactSpeed<180||f.impactCount>3)return;
    const radius=orb.jellyR,points=Array.from({length:56},(_,i)=>OpisAIOrbMotion.contactPoint(2*Math.PI*i/56,f.contact));
    let area=0;for(let i=0;i<56;i++){const p=points[i],q=points[(i+1)%56];area+=p[0]*q[1]-q[0]*p[1];}
    const half=radius*f.scaleX*(56*Math.sin(2*Math.PI/56)/2)/Math.abs(area/2)*Math.max(...points.map(p=>Math.abs(p[0])));
    const drops=OpisAIOrbMotion.splash({centerX:orb.x,floorY:b.target+radius,radius,halfWidth:half,scaleY:f.scaleY,impactSpeed:f.impactSpeed,impactIndex:f.impactCount-1});
    const at=nowS();orb.drops=orb.drops.filter(d=>at-d.at<d.lifetime).slice(-6).concat(drops.map(d=>({...d,at,color:ORB_STATES[state.phase]?.[1]||'#2563eb'})));
  }

  /* Tryb fizyki (easter egg, menu only): 30 s of gravity, ←/→, Space charges and launches, Esc ends. */
  function physicsMode(){
    if(!orb.el||state.closed||orb.soak||orb.soaked||orb.exit)return;
    if(orb.bounce||orb.back)captureAtCurrent();
    orb.jellyR=null;orb.contact=0;orbMotion.stop();
    orb.phys={vx:0,vy:0,charging:false,charge:0,magnet:false,until:nowS()+30};orb.physAcc=0;
    $('.oa-orb',orb.el).focus({preventScroll:true});
    showHint('⌨ TRYB FIZYKI (30s)\n←→ poruszanie\nSPACJA hold = ladowanie odbicia (zwolnij = launch!)');
    orbKick();
  }
  function stopPhysics(){if(!orb.phys)return;orb.phys=null;$('.oa-magnet')?.remove();orb.decay=true;orbKick();}
  function physBounds(){const a=workArea(),m=ORB_R+5;return {left:a.left+m,right:a.right-m,top:a.top+m,bottom:a.bottom-m};}
  function physOnGround(){return orb.y>=physBounds().bottom-2;}
  function physicsTick(){
    const p=orb.phys;if(nowS()>p.until){stopPhysics();return;}
    if(p.charging){p.charge=Math.min(1,p.charge+.025);orb.sy+=(1-p.charge*.6-orb.sy)*.3;orb.sx+=(1+p.charge*.4-orb.sx)*.3;p.vy=Math.min(p.vy,.5);}
    else{orb.sx+=(1-orb.sx)*.2;orb.sy+=(1-orb.sy)*.2;}
    p.vy+=1.2;if(p.magnet){if(p.vy<0)p.vy*=.25;p.vy+=7;}
    p.vx=Math.max(-70,Math.min(70,p.vx));p.vy=Math.max(-70,Math.min(70,p.vy));
    const b=physBounds();let x=orb.x+p.vx,y=orb.y+p.vy;
    if(x<b.left){x=b.left;p.vx=-p.vx*.65;}else if(x>b.right){x=b.right;p.vx=-p.vx*.65;}
    if(y<b.top){y=b.top;p.vy=-p.vy*.65;}
    else if(y>b.bottom){const incoming=p.vy;y=b.bottom;
      if(p.magnet){p.vy=0;p.magnet=false;$('.oa-magnet')?.remove();p.charging=true;}
      else if(p.charging)p.vy=0;
      else{p.vy=-p.vy*.65;if(Math.abs(p.vy)<2)p.vy=0;if(incoming>4){orb.sx=1.28;orb.sy=.72;orb.decay=true;}}}
    p.vx*=y>=b.bottom-1&&!p.charging?.9:.985;orb.x=x;orb.y=y;orbMotion.place(x,y);
  }
  function physicsKey(event,down){
    const p=orb.phys;if(!p||nowS()>p.until)return false;
    if(down&&event.key==='ArrowLeft')p.vx-=3;
    else if(down&&event.key==='ArrowRight')p.vx+=3;
    else if(event.key===' '||event.code==='Space'){
      if(down&&!event.repeat){if(physOnGround())p.charging=true;else if(!p.magnet){p.magnet=true;const m=document.createElement('div');m.className='oa-magnet';m.setAttribute('aria-hidden','true');m.innerHTML='<i></i><i></i><i></i><i></i>';(document.getElementById('overlay-layer')||document.body).append(m);}}
      else if(!down){if(p.magnet){p.magnet=false;$('.oa-magnet')?.remove();}else{if(p.charge>.05)p.vy=-p.charge*55;p.charging=false;p.charge=0;}}
    }
    else if(down&&event.key==='Escape'){stopPhysics();hideHint();return true;}
    else return false;
    p.until=nowS()+30;orbKick();return true;
  }

  /* Gestures: ui/bubble_gestures.py decides; this adapter adds feedback and actions. */
  function syncGesture(){
    orb.armed=orbGesture.holdPending;
    if(orbGesture.phase==='held'){orb.fired=true;orb.arming=1;}
    else if(!orb.armed){orb.fired=false;orb.arming=0;}
  }
  function scheduleGesture(){
    clearTimeout(orb.timers.gesture);const due=orbGesture.nextDeadline;if(due===null)return;
    const session=orbGesture.session;orb.timers.gesture=setTimeout(()=>{
      if(orb.exit||orb.soak||orb.soaked){cancelGesture();return;}
      const actions=orbGesture.advance(nowS(),session);syncGesture();scheduleGesture();orbKick();dispatchGesture(actions);
    },Math.max(1,Math.ceil((due-nowS())*1000)));
  }
  function dispatchGesture(actions){
    for(const action of actions){
      if(action==='drag-start'||action==='drag-move'){
        if(action==='drag-start'){orbMotion.begin();orb.el.classList.add('dragging');hideHint();orb.chips=false;}
        const [px,py]=orbGesture.position;orbMotion.follow(px-pointer.offsetX,py-pointer.offsetY);orbKick();
        const key=state.job||settingsOpen()?null:fieldAt(px,py);
        if(key!==dropTarget){dropTarget=key;markField(key);}
      }else if(action==='hold'){dictate();}
    }
  }
  function clearPointer(coast=false){
    clearTimeout(orb.timers.gesture);orb.pressed=false;orb.armed=false;orb.fired=false;orb.arming=0;
    const id=pointer?.id;pointer=null;orb.el?.classList.remove('dragging'); // cleared first: releasing capture may report lostpointercapture at once
    if(id!==undefined){try{const button=$('.oa-orb',orb.el);if(button.hasPointerCapture?.(id))button.releasePointerCapture(id);}catch(_){}}
    if(!coast&&orbMotion?.snapshot().mode==='drag')orbMotion.stop();
    orbKick();
  }
  function cancelGesture(){
    if(!orbGesture?.active&&!pointer)return;
    const dragging=orbGesture.phase==='dragging';orbGesture.cancel();clearPointer();
    if(dragging||dropTarget){dropTarget=null;markField(null);}
  }

  /* Hover: scale 1.10 with breathing contour, actions after 250 ms, hidden 300 ms after leaving, model tooltip after 0.7 s. */
  function setHover(on){
    if(on===orb.hover)return;orb.hover=on;
    clearTimeout(orb.timers.chipShow);clearTimeout(orb.timers.chipHide);clearTimeout(orb.timers.tip);
    if(orb.exit)return;
    if(on){orb.scaleTarget=1.1;orb.ampTarget=1;if(!orb.chips)orb.timers.chipShow=setTimeout(showChips,250);}
    else{orb.scaleTarget=1;orb.ampTarget=0;if(orb.chips)orb.timers.chipHide=setTimeout(()=>{orb.chips=false;orbKick();},300);hideHint();}
    orbKick();
  }
  function showChips(){if(orb.exit||orb.soak||orb.soaked||orb.phys||orb.pressed||pointer)return;orb.chips=true;orbKick();}
  function hintText(){return orb.phys?'⌨ TRYB FIZYKI (30s)\n←→ poruszanie\nSPACJA hold = ladowanie odbicia (zwolnij = launch!)':`OpisAI · ${preferences.model}\nOpisAI ${VERSION}`;}
  function showHint(text=hintText()){
    if(!orb.el||state.closed)return;
    let hint=$('.oa-orb-hint');if(!hint){hint=document.createElement('div');hint.className='oa-orb-hint';hint.setAttribute('role','tooltip');hint.id='oa-orb-hint';(document.getElementById('overlay-layer')||document.body).append(hint);}
    hint.textContent=text;hint.hidden=false;hint.classList.toggle('oa-theme-dark',preferences.theme==='dark'); // BubbleHint uses shell.colors(): the OpisAI theme
    // ui/hint_geometry.place_hint: left, right, above or below the disc and its actions, inside the work area.
    const a=workArea(),R=ORB_R*Math.max(1.1,orb.scale,orb.scaleTarget)+6,chips=ORB_ACTIONS[stateKey()]?{w:($('.oa-orb-actions',orb.el)?.offsetWidth||125)+8,top:orb.y+59-4,bottom:orb.y+85+4}:null;
    const box={x:orb.x-Math.max(R,chips?chips.w/2:0),y:orb.y-R,r:orb.x+Math.max(R,chips?chips.w/2:0),b:chips?Math.max(orb.y+R,chips.bottom):orb.y+R};
    const w=Math.min(hint.offsetWidth||220,a.right-16),h=hint.offsetHeight||56,cx=(box.x+box.r)/2,cy=(box.y+box.b)/2,gap=8;
    const fit=r=>({x:Math.max(a.left+8,Math.min(a.right-8-r.w,r.x)),y:Math.max(a.top+8,Math.min(a.bottom-8-r.h,r.y)),w:r.w,h:r.h});
    const score=r=>{const ov=Math.max(0,Math.min(r.x+r.w,box.r)-Math.max(r.x,box.x))*Math.max(0,Math.min(r.y+r.h,box.b)-Math.max(r.y,box.y)),dx=Math.max(r.x-cx,0,cx-r.x-r.w),dy=Math.max(r.y-cy,0,cy-r.y-r.h);return [ov,dx*dx+dy*dy];};
    const best=[{x:box.x-gap-w,y:cy-h/2,w,h},{x:box.r+gap,y:cy-h/2,w,h},{x:cx-w/2,y:box.y-gap-h,w,h},{x:cx-w/2,y:box.b+gap,w,h}].map(fit).reduce((p,q)=>{const s=score(p),t=score(q);return t[0]<s[0]||(t[0]===s[0]&&t[1]<s[1])?q:p;});
    Object.assign(hint.style,{left:best.x+'px',top:best.y+'px'});
    $('.oa-orb',orb.el)?.setAttribute('aria-describedby','oa-orb-hint');
    clearTimeout(orb.timers.tipHide);orb.timers.tipHide=setTimeout(hideHint,8000);
  }
  function hideHint(){clearTimeout(orb.timers.tip);clearTimeout(orb.timers.tipHide);const hint=$('.oa-orb-hint');if(hint)hint.hidden=true;}

  function createOrb(){
    const host=document.getElementById('overlay-layer')||document.body;
    const wrap=document.createElement('div');wrap.className='oa-orb-wrap';wrap.dataset.phase=state.phase;
    const bars=[0,1,2,3,4].map(i=>`<rect data-bar="${i}"/>`).join('');
    wrap.innerHTML=`<svg class="oa-orb-art" viewBox="-140 -140 280 280" aria-hidden="true" focusable="false"><defs><radialGradient id="oa-orb-fill" gradientUnits="userSpaceOnUse"><stop offset="0"/><stop offset=".55"/><stop offset="1"/></radialGradient><linearGradient id="oa-orb-sheen" gradientUnits="userSpaceOnUse" x1="0" x2="0"><stop offset="0" stop-color="#fff" stop-opacity=".188"/><stop offset=".5" stop-color="#fff" stop-opacity=".055"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="oa-orb-clip"><path data-orb-clip/></clipPath></defs><g class="oa-orb-body"><path class="oa-orb-shadow" data-dy="16" fill-opacity=".0275"/><path class="oa-orb-shadow" data-dy="10" fill-opacity=".047"/><path class="oa-orb-shadow" data-dy="4" fill-opacity=".0706"/><path class="oa-orb-face" fill="url(#oa-orb-fill)"/><path class="oa-orb-rim"/><rect class="oa-orb-sheen" x="-140" y="-140" width="280" height="280" clip-path="url(#oa-orb-clip)" fill="url(#oa-orb-sheen)"/></g><circle class="oa-orb-arming" r="58"/><g class="oa-orb-ripple"><circle/><circle/></g><g class="oa-orb-identity"><g class="oa-orb-squash"><g class="oa-orb-scaled"><g class="oa-orb-logo"><rect data-part="handle" x="-8.97" y="-29.8" width="17.94" height="10.53" rx="4.74"/><rect data-part="hole" class="oa-orb-ink" x="-4.84" y="-27.06" width="9.69" height="4.84" rx="1.94"/><rect data-part="bag" x="-21.84" y="-23.48" width="43.68" height="32.76" rx="7.8"/><rect data-part="arm" class="oa-orb-ink"/>${bars}</g><text class="oa-orb-wordmark" y="23">OpisAI</text><text class="oa-orb-version" y="35.5">${VERSION}</text></g></g><g class="oa-orb-plain"><text class="oa-orb-label"></text><g class="oa-orb-dots"><circle/><circle/><circle/></g></g></g></svg><div class="oa-orb-bridge"></div><button class="oa-orb" type="button" aria-label="OpisAI. Kliknij: opisz. Przytrzymaj: dyktuj. Prawy przycisk: menu."></button><div class="oa-orb-actions" role="group" aria-label="Akcje OpisAI"></div><div class="oa-orb-press" aria-hidden="true"></div>`;
    host.append(wrap);orb.el=wrap;state.orb=wrap;
    orb.live=document.createElement('div');orb.live.className='oa-orb-status sr-only';orb.live.setAttribute('role','status');orb.live.setAttribute('aria-live','polite');host.append(orb.live); // outside the wrap: a hidden (closed or soaked) bubble stays audible
    orbMotionQuery=matchMedia('(prefers-reduced-motion: reduce)');
    const p=loadOrbPosition();orb.x=p.x;orb.y=p.y;
    orbMotion=OpisAIOrbMotion.create({x:orb.x,y:orb.y,reducedMotion:orbReduced()});orbGesture=OpisAIOrbMotion.createGesture({dragDelay:.18,holdDelay:LONG_PRESS});
    orb.scale=orbReduced()?1:0;renderOrbActions();
    const button=$('.oa-orb',wrap),eventTime=()=>nowS();
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false||orbGesture.active)return;
      event.preventDefault();
      if(orb.exit||orb.soak||orb.soaked||state.closed)return;
      if(eventTime()<orb.menuBlock)return; // the click that closed the menu
      hideHint();if(orb.bounce||orb.back)captureAtCurrent();
      clearTimeout(orb.timers.chipShow);orb.chips=false;
      try{button.setPointerCapture(event.pointerId);}catch(_){return;}
      pointer={id:event.pointerId,offsetX:event.clientX-orb.x,offsetY:event.clientY-orb.y};orb.pressOrigin={x:orb.x,y:orb.y};
      orbMotion.stop();orb.pressed=true;orb.fired=false;orb.arming=0;orb.pressAt=eventTime();orb.hintState=stateKey();
      orbGesture.start([event.clientX,event.clientY],eventTime(),{distance:event.pointerType==='mouse'||!event.pointerType?4:10,allowHold:!orb.phys});
      syncGesture();scheduleGesture();orbKick();
    });
    button.addEventListener('pointermove',event=>{
      if(!pointer||pointer.id!==event.pointerId){if(!event.buttons&&orb.hover&&!orb.phys&&$('.oa-orb-hint')?.hidden!==false){clearTimeout(orb.timers.tip);orb.timers.tip=setTimeout(()=>{if(orb.hover&&!pointer&&!orb.soak&&!orb.soaked)showHint();},700);}return;}
      if(!(event.buttons&1)&&event.pointerType==='mouse'){cancelGesture();return;}
      const actions=orbGesture.move([event.clientX,event.clientY],eventTime());syncGesture();scheduleGesture();orbKick();dispatchGesture(actions);
    });
    button.addEventListener('pointerup',event=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      const actions=orbGesture.release([event.clientX,event.clientY],eventTime()),target=dropTarget,dropped=actions.includes('drop');
      dropTarget=null;clearPointer(dropped);
      if(orb.phys){stopPhysics();hideHint();}
      if(dropped){if(!onDrop(target)){markField(null);if(orbMotion.release().mode!=='coast')saveOrbPosition();orbKick();}}
      else if(actions.includes('click'))describe();
    });
    for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,event=>{if(pointer?.id===event.pointerId)cancelGesture();});
    button.addEventListener('contextmenu',event=>{event.preventDefault();if(orbGesture.phase==='held')return; /* a touch long press after the hold */cancelGesture();if(orb.bounce||orb.back)captureAtCurrent();if(event.button<0)showMenu(orb.x,orb.y+ORB_R,{keyboard:true});else showMenu(event.clientX,event.clientY);}); // button -1: a keyboard menu that keydown did not take
    button.addEventListener('keydown',event=>{
      if(physicsKey(event,true)){event.preventDefault();return;}
      if(event.key==='Enter'||event.key===' '){event.preventDefault();cancelGesture();describe();}
      else if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();cancelGesture();showMenu(orb.x,orb.y+ORB_R,{keyboard:true});}
      else if(event.key==='Escape')cancelGesture();
    });
    button.addEventListener('keyup',event=>{if(physicsKey(event,false))event.preventDefault();});
    // Assistive technologies can activate a button without a pointer or key sequence.
    button.addEventListener('click',event=>{if(event.detail===0&&!orbGesture.active){cancelGesture();describe();}});
    wrap.addEventListener('pointerover',()=>setHover(true));
    wrap.addEventListener('pointerout',event=>{if(!event.relatedTarget||!wrap.contains(event.relatedTarget))setHover(false);});
    wrap.addEventListener('focusin',()=>orbKick());
    wrap.addEventListener('focusout',event=>{if(!wrap.contains(event.relatedTarget)&&!orb.hover)orb.chips=false;orbKick();});
    window.addEventListener('blur',()=>cancelGesture());
    window.addEventListener('resize',()=>{cancelGesture();rescueOrb();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelGesture();else orbKick();});
    orbMotionQuery.addEventListener?.('change',()=>{cancelGesture();orbMotion.setReducedMotion(orbReduced());if(orbReduced()){releaseIdleMotion();orb.scale=1;orb.scaleVel=0;}orbKick();});
    for(const type of ['pointermove','pointerdown','keydown','wheel','touchstart'])document.addEventListener(type,()=>{lastInput=nowS();},{capture:true,passive:true});
    lastInput=nowS();
    orb.timers.rescue=setInterval(rescueOrb,250);orb.timers.idle=setInterval(maybeIdleBounce,1000);
    renderOrb();setTimeout(orbKick,50); // entrance: the spring brings the scale from zero
  }
  function renderOrbActions(){
    const box=orb.el&&$('.oa-orb-actions',orb.el);if(!box)return;const list=ORB_ACTIONS[stateKey()]||[],key=list.map(a=>a[0]).join();
    if(box.dataset.key===key)return;box.dataset.key=key;
    box.innerHTML=list.map(([action,label])=>`<button type="button" data-orb-action="${action}">${label}</button>`).join('');
    $$('[data-orb-action]',box).forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();orb.chips=false;orbKick();orbAction(el.dataset.orbAction);}));
  }
  function showMenu(x,y,options={}){ // the bubble's right click shows the tray menu (_on_bubble_right_click)
    if(state.closed){launch();return;}
    if(settingsOpen()&&!options.tray)return;
    const el=Shell.menu(orbMenuItems(),x,y,{className:'oa-menu'+(preferences.theme==='dark'?' oa-theme-dark':''),flip:true,onClose:()=>{orb.menuBlock=nowS()+.35;}}); // submenus share the class
    if(options.keyboard&&el?.querySelector)el.querySelector('button:not(:disabled)')?.focus();
    return el;
  }
  function orbMenuItems(){ // MacroController._setup_tray: same order, separators and submenus
    const unavailable=name=>()=>{unavailableToast?.remove?.();unavailableToast=toast(`„${name}” jest niedostępne w demonstracji. Okna i pola Kliniki XP są tu przypisane na stałe.`);}; // each replaces the last, so they never stack over the bubble
    const dot='<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#22c55e"/></svg>';
    const spelling=preferences.spelling&&!!window.Clinic?.isEditorOpen?.();
    return [
      {label:'Wybierz okno główne...',icon:'computer',onClick:unavailable('Wybierz okno główne')},
      {label:'Wybierz podokno opisu...',icon:'window',onClick:unavailable('Wybierz podokno opisu')},
      {label:'Wskaż pole tekstowe',icon:'view',children:()=>Object.keys(FIELDS).map(key=>({label:{wywiad:'Wywiad:',badanie:'Badanie kliniczne:',diagnoza:'Diagnoza:'}[key],iconHtml:dot,title:key==='diagnoza'?'Wskaż trzecie pole tekstowe Kliniki dla diagnozy.':'Pole już wskazane — kliknij, by wskazać ponownie.',onClick:unavailable('Wskaż pole tekstowe')}))},
      {label:'Skonfiguruj rączki (main)...',icon:'cursor',onClick:unavailable('Skonfiguruj rączki')},
      {separator:true},
      {label:'🎤  Dyktowanie (lub przytrzymaj bąbelek)',icon:'volume',onClick:()=>dictate()},
      {label:'🎙  Profil głosu (rozpoznawanie mówców)…',title:'Kalibracja głosu do oznaczania mówców w dyktowaniu (czytanka ~2 min)',onClick:()=>settings('dictation')},
      {label:'Podpowiedzi pisowni',children:()=>[
        {label:'Podkreślaj podejrzane słowa w Klinice',checked:!!preferences.spelling,onClick:()=>{preferences.spelling=!preferences.spelling;window.Clinic?.setSpellingEnabled?.(preferences.spelling);savePreferences();}},
        {label:'Sugestie dla aktywnej wizyty…',disabled:!spelling,onClick:()=>{const mark=document.querySelector('.kxp-editor-window .clinic-spell');if(mark)mark.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0}));else toast('Brak podpowiedzi pisowni w aktywnej wizycie.');}},
        {label:'Cofnij ostatnią poprawkę pisowni',disabled:!spelling,onClick:unavailable('Cofnij ostatnią poprawkę pisowni')},
        {label:'Mój słownik…',onClick:unavailable('Mój słownik')},
        {label:'Sprawdzanie pisowni',disabled:true}]},
      {label:'🎮  Tryb fizyki (easter egg)',onClick:physicsMode},
      {separator:true},
      {label:'Konfiguracja...',icon:'list',onClick:()=>settings()},
      {separator:true},
      {label:'O aplikacji...',icon:'info',onClick:()=>about()},
      {separator:true},
      {label:'Zamknij',onClick:closeApp},
      {separator:true},
      {label:'Bezpieczny zapis i odzyskiwanie',children:()=>[
        {label:'Cofnij ostatni potwierdzony wpis…',onClick:undo},
        {label:'Sprawdź niepotwierdzone operacje…',onClick:()=>Shell.confirm({title:'Dziennik',icon:'info',message:'Brak niezamkniętych lub niepotwierdzonych operacji.'})}]}
    ];
  }
  function trayTooltip(){return state.closed?'OpisAI — zamknięte\nKliknij, aby uruchomić':`OpisAI — ${preferences.model}\nKlik: opisz · Przytrzymaj: dyktuj · Prawy: menu`;}
  function syncTray(){$('.tray-opisai')?.setAttribute('aria-label',state.closed?'OpisAI — zamknięte. Kliknij, aby uruchomić.':'OpisAI. Kliknij: opisz. Prawy przycisk lub Shift+F10: menu.');}

  /* One animation loop, active only while something moves (Bubble._tick and its settle rule). */
  function orbKick(){if(!orb.el||orb.frame||document.hidden)return;orb.last=null;orb.frame=requestAnimationFrame(orbFrame);}
  function orbFrame(now){
    orb.frame=0;if(!orb.el?.isConnected)return;
    // A frame timestamp may precede the kick (Chromium stamps the frame start), so the first frame of a run is one display frame.
    const dt=orb.last===null?1/60:Math.min(.1,Math.max(0,(now-orb.last)/1000));orb.last=now;
    const busy=orbAdvance(dt,now/1000);renderOrb(now/1000);
    if(busy&&!document.hidden)orb.frame=requestAnimationFrame(orbFrame);
  }
  function scaleSpring(dt){ // vel += diff*.25; vel *= .72 per 33 ms tick, as its continuous damped oscillator
    const S=4.92757,W=13.0158,e=orb.scale-orb.scaleTarget,A=e,B=(orb.scaleVel+S*e)/W,c=Math.cos(W*dt),s=Math.sin(W*dt),k=Math.exp(-S*dt);
    orb.scale=orb.scaleTarget+k*(A*c+B*s);orb.scaleVel=k*((B*W-S*A)*c-(A*W+S*B)*s);
    if(Math.abs(orb.scale-orb.scaleTarget)<.002&&Math.abs(orb.scaleVel)<.06){orb.scale=orb.scaleTarget;orb.scaleVel=0;}
  }
  function orbAdvance(dt,now){
    const ease=OpisAIOrbMotion.ease,reduced=orbReduced();
    if(state.closed&&!orb.exit)return false;
    if(orb.exit){
      const t=now-orb.exit.start;orb.exit.ripple=Math.min(1,t/.38);
      if(t<.22){const u=t/.22;orb.scale=u<.25?1+.05*(u/.25):1.05*(1-((u-.25)/.75)**2);orb.exit.alpha=Math.max(0,1-u*u);orb.exit.phase='collapse';}
      else if(t<.38){orb.scale=0;orb.exit.alpha=0;orb.exit.phase='ripple';}
      else{const done=orb.exit.done;orb.exit=null;done?.();return false;}
      return true;
    }
    if(orb.soak){
      const s=orb.soak,u=Math.min(1,(now-s.start)/.55),fe=smooth(0,1,Math.min(1,u/.65)),e=smooth(0,1,u);
      orb.x=s.from.x+(s.to.x-s.from.x)*fe;orb.y=s.from.y+(s.to.y-s.from.y)*fe;orb.scale=1-.25*e;orb.sy=1-.82*e;orb.sx=1+.55*e;
      s.alpha=Math.max(0,1-Math.max(0,(u-.45)/.55));s.ripple=u;
      if(u>=1){orb.soak=null;orb.soaked=true;orb.sx=orb.sy=1;orb.scale=1;orbMotion.place(orb.x,orb.y);setTimeout(s.done,0);return false;}
      return true;
    }
    if(reduced){orb.scale=Math.min(1,orb.scaleTarget);orb.scaleVel=0;orb.amp=0;}else scaleSpring(dt);
    orb.amp+=(orb.ampTarget*(reduced?0:1)-orb.amp)*ease(.18,dt);if(orb.ampTarget===0&&orb.amp<.005)orb.amp=0;
    if(orb.amp>.01){orb.hp1+=.09*dt/TICK;orb.hp2+=.061*dt/TICK;}
    const chipsTarget=orb.chips||(!!orb.el.querySelector?.(':focus-visible')&&!orb.pressed&&!pointer&&!orb.phys)?1:0;
    if(reduced)orb.chipsAlpha=chipsTarget; // no fade: the actions appear and go at once
    else{orb.chipsAlpha+=(chipsTarget-orb.chipsAlpha)*ease(.3,dt);if(Math.abs(chipsTarget-orb.chipsAlpha)<.02)orb.chipsAlpha=chipsTarget;}
    orb.dip+=((orb.pressed?1:0)-orb.dip)*ease(.35,dt);if(!orb.pressed&&orb.dip<.005)orb.dip=0;
    if(orb.armed)orb.arming=Math.max(0,Math.min(1,(now-orb.pressAt)/LONG_PRESS));else if(orb.arming>.001)orb.arming*=Math.pow(.8,dt/TICK);else orb.arming=0;
    // Split bulge
    if(orb.split){const t=now-orb.split.start,a=splitAmount(t);if(t>=.4&&orb.split.onPeak){const peak=orb.split.onPeak;orb.split.onPeak=null;peak();}if(a===null){orb.split=null;orb.bulge=0;}else orb.bulge=a;}
    // Position: drag/glide, bounce, return or physics own it in turn
    const before=orb.y;
    if(orb.phys){orb.physAcc+=dt;while(orb.phys&&orb.physAcc>=TICK){orb.physAcc-=TICK;physicsTick();}}
    else if(orb.bounce){const f=orb.bounce.jelly.advance(dt);orb.y=orb.bounce.origin+Math.round(f.offset);orb.sx=f.scaleX;orb.sy=f.scaleY;orb.contact=f.contact;emitSplash(f);if(f.settled)endBounce();orbMotion.place(orb.x,orb.y);}
    else if(orb.back){const b=orb.back,u=Math.min(1,(now-b.start)/b.dur);orb.y=Math.round(b.from+(b.to-b.from)*b.ease(u));orbMotion.place(orb.x,orb.y);if(u>=1){orb.back=null;if(!orb.decay)orb.jellyR=null;}}
    else{const was=orbMotion.snapshot().mode,m=orbMotion.step(dt);orb.x=m.x;orb.y=m.y;if(was==='coast'&&m.mode!=='coast')saveOrbPosition();}
    if(orb.decay){
      if(orb.jellyR!==null){const rate=1-Math.exp(-dt/.14);orb.sy+=(1-orb.sy)*rate;orb.sx=1/orb.sy;orb.contact*=1-rate;}
      else{orb.sx+=(1-orb.sx)*ease(.2,dt);orb.sy+=(1-orb.sy)*ease(.2,dt);}
      if(Math.abs(orb.sx-1)<.005&&Math.abs(orb.sy-1)<.005){orb.sx=orb.sy=1;orb.decay=false;orb.contact=0;if(!orb.back)orb.jellyR=null;}
    }else if(!orb.bounce&&!orb.back&&!orb.phys&&!reduced&&dt>0){
      // Fast vertical movement stretches the whole bubble (Bubble._tick "fast-move stretch").
      const perTick=(orb.y-before)/dt*TICK;
      if(Math.abs(perTick)>3){const s=Math.min(.30,Math.abs(perTick)*.02);orb.sx+=(1-s*.5-orb.sx)*ease(.4,dt);orb.sy+=(1+s-orb.sy)*ease(.4,dt);}
      else{orb.sx+=(1-orb.sx)*ease(.2,dt);orb.sy+=(1-orb.sy)*ease(.2,dt);if(Math.abs(orb.sx-1)<.002&&Math.abs(orb.sy-1)<.002)orb.sx=orb.sy=1;}
    }
    if(orb.drops.length)orb.drops=orb.drops.filter(d=>now-d.at<d.lifetime);
    if(orb.x!==orb.lastX||orb.y!==orb.lastYPos){if(orb.lastX!==undefined&&!pointer&&!orb.phys)hideHint();orb.lastX=orb.x;orb.lastYPos=orb.y;} // a moving bubble drops its tooltip
    const m=orbMotion.snapshot();
    return !reduced&&(state.phase==='processing'||state.phase==='recording')||!!(orb.split||orb.bounce||orb.back||orb.decay||orb.phys||orb.drops.length)
      ||(!reduced&&(orb.scaleTarget!==1||orb.ampTarget!==0))||orb.scale!==(reduced?Math.min(1,orb.scaleTarget):orb.scaleTarget)||orb.amp>0||m.moving||orb.pressed||orb.armed||orb.dip>0||orb.arming>0
      ||orb.chipsAlpha!==chipsTarget||orb.sx!==1||orb.sy!==1;
  }
  function renderOrb(now=nowS()){
    const wrap=orb.el;if(!wrap)return;
    const reduced=orbReduced(),phase=state.phase,[label,color]=ORB_STATES[phase]||ORB_STATES.idle,m=orbMotion.snapshot();
    const r=orb.jellyR!==null?orb.jellyR:ORB_R*orb.scale*(1-.07*orb.dip),r0=ORB_R,jelly=orb.jellyR!==null;
    wrap.classList.toggle('is-hidden',state.closed||orb.soaked);wrap.classList.toggle('is-physics',!!orb.phys);
    wrap.style.transform=`translate3d(${orb.x.toFixed(2)}px,${orb.y.toFixed(2)}px,0)`;
    const anchor=orb.phys&&(orb.phys.charging||physOnGround())?1:0;
    const d=r<.5?'':OpisAIOrbMotion.contour({r,amp:jelly?0:orb.amp,hp1:orb.hp1,hp2:orb.hp2,angle:jelly?0:m.angle,stretch:jelly?0:m.stretch,bulge:orb.bulge,bulgeAngle:orb.bulgeAngle,sx:orb.sx,sy:orb.sy,anchor,contact:jelly?orb.contact:0});
    const lift=jelly?1-.85*orb.contact:1;
    $$('.oa-orb-shadow',wrap).forEach(el=>{el.setAttribute('d',d);el.setAttribute('transform',`translate(0 ${(+el.dataset.dy*lift).toFixed(2)})`);});
    for(const sel of ['.oa-orb-face','.oa-orb-rim','[data-orb-clip]'])$(sel,wrap).setAttribute('d',d);
    const bg=phase==='processing'&&!reduced?lerpHex('#2563eb','#0ea5e9',(Math.sin(now*2.2)+1)/2):color;
    const fill=$('#oa-orb-fill',wrap),stops=$$('stop',fill);stops[0].setAttribute('stop-color',shade(bg,1.16));stops[1].setAttribute('stop-color',bg);stops[2].setAttribute('stop-color',shade(bg,1/1.1));
    fill.setAttribute('cx',(-r*.22).toFixed(2));fill.setAttribute('cy',(-r*.28).toFixed(2));fill.setAttribute('r',Math.max(1,r*1.7).toFixed(2));
    const sheen=$('#oa-orb-sheen',wrap);sheen.setAttribute('y1',(-r).toFixed(2));sheen.setAttribute('y2',(r*.15).toFixed(2));
    $('.oa-orb-face',wrap).setAttribute('stroke',shade(bg,1/1.2));
    $('.oa-orb-body',wrap).setAttribute('opacity',(orb.exit?orb.exit.alpha:orb.soak?orb.soak.alpha:1).toFixed(3));
    const ring=$('.oa-orb-arming',wrap),ringR=r*1.16,circ=2*Math.PI*ringR,show=orb.arming>.01&&!orb.exit&&!orb.soak;
    ring.style.display=show?'':'none';if(show){ring.setAttribute('r',ringR.toFixed(2));ring.setAttribute('stroke-width',Math.max(2.5,r*.08).toFixed(2));ring.setAttribute('stroke-dasharray',`${(circ*orb.arming).toFixed(2)} ${circ.toFixed(2)}`);}
    const ripples=$$('circle',$('.oa-orb-ripple',wrap));
    if(orb.soak&&orb.soak.ripple>.001){const u=orb.soak.ripple,rr=r0*(.4+1.5*u);ripples[0].setAttribute('r',rr);ripples[0].setAttribute('stroke',`rgba(150,200,230,${(150*(1-u)/255).toFixed(3)})`);ripples[0].setAttribute('stroke-width',Math.max(1,4*(1-u)));ripples[1].setAttribute('r',rr*.6);ripples[1].setAttribute('stroke',`rgba(205,228,242,${(90*(1-u)/255).toFixed(3)})`);ripples[1].setAttribute('stroke-width',Math.max(.8,2*(1-u)));}
    else if(orb.exit&&orb.exit.ripple>.001){const u=orb.exit.ripple,e=1-(1-u)**2,rr=r0*(.45+1.7*e),f=(1-u)**1.5,[cr,cg,cb]=hexRgb(color);ripples[0].setAttribute('r',rr);ripples[0].setAttribute('stroke',`rgba(${cr},${cg},${cb},${(180*f/255).toFixed(3)})`);ripples[0].setAttribute('stroke-width',Math.max(1,3.5*f));ripples[1].setAttribute('r',rr*.62);ripples[1].setAttribute('stroke',`rgba(255,255,255,${(90*f/255).toFixed(3)})`);ripples[1].setAttribute('stroke-width',Math.max(.8,1.6*f));}
    else ripples.forEach(c=>c.setAttribute('r',0));
    // State identity, inside the disc
    const textVisible=orb.scale>.05&&(!orb.exit||orb.exit.phase==='collapse'),alpha=Math.max(0,Math.min(1,(orb.scale-.2)/.8))*(orb.exit?orb.exit.alpha:1),dy=r*(1-orb.sy)*anchor,k=r/ORB_R;
    const identity=$('.oa-orb-identity',wrap);identity.style.display=textVisible?'':'none';identity.setAttribute('opacity',alpha.toFixed(3));
    $('.oa-orb-squash',wrap).setAttribute('transform',`translate(0 ${dy.toFixed(2)}) scale(${orb.sx.toFixed(4)} ${orb.sy.toFixed(4)})`);
    $('.oa-orb-scaled',wrap).setAttribute('transform',`scale(${k.toFixed(4)})`);
    $('.oa-orb-plain',wrap).setAttribute('transform',`translate(0 ${dy.toFixed(2)})`);
    const logo=phase==='idle'||phase==='recording';
    $('.oa-orb-logo',wrap).style.display=logo?'':'none';$('.oa-orb-wordmark',wrap).style.display=logo?'':'none';
    $('.oa-orb-wordmark',wrap).textContent=phase==='recording'?'REC':'OpisAI';
    $('.oa-orb-version',wrap).style.display=r<28?'none':'';
    $$('.oa-orb-ink',wrap).forEach(el=>el.setAttribute('fill',color));
    // REC: the cross morphs into the equalizer; with reduced motion the bars stand still at once.
    if(logo)drawLogo(wrap,phase==='recording'?(reduced?1:Math.min(1,(now-orb.recAt)/.32)):0,phase==='recording'&&!reduced?now-orb.recAt:-1,color);
    const text=$('.oa-orb-label',wrap);text.style.display=['review','done','error'].includes(phase)?'':'none';text.textContent=['review','done','error'].includes(phase)?label:'';
    const dots=$('.oa-orb-dots',wrap);dots.style.display=phase==='processing'?'':'none';
    if(phase==='processing'){const rd=Math.max(3,r*.1),gap=rd*2.6,amp=r*.18,t=reduced?0:now*4;$$('circle',dots).forEach((c,i)=>{c.setAttribute('cx',((i-1)*gap).toFixed(2));c.setAttribute('cy',(reduced?0:-Math.max(0,Math.sin(t-i*.5))*amp).toFixed(2));c.setAttribute('r',rd.toFixed(2));});}
    // Labelled actions, or what the press is about to do
    const hint=pressHint(),actions=$('.oa-orb-actions',wrap),press=$('.oa-orb-press',wrap),bridge=$('.oa-orb-bridge',wrap);
    const chipsAlpha=hint||orb.exit||orb.soak||orb.soaked?0:orb.chipsAlpha;
    actions.style.opacity=chipsAlpha.toFixed(3);actions.classList.toggle('is-live',chipsAlpha>=.5);
    bridge.classList.toggle('is-live',chipsAlpha>.34&&!!ORB_ACTIONS[stateKey()]);
    if(bridge.classList.contains('is-live')){const w=actions.offsetWidth||170;Object.assign(bridge.style,{left:(-w/2)+'px',width:w+'px'});}
    press.textContent=hint;press.classList.toggle('is-shown',!!hint&&!orb.exit&&!orb.soak);
    renderDrops(now);
  }
  function pressHint(){ // ui/bubble_actions.press_hint: feedforward before the hold decides
    if(!(orb.armed||(orb.fired&&orb.arming>.05)))return '';
    const held=orb.armed?nowS()-orb.pressAt:LONG_PRESS,key=orb.hintState||stateKey();
    if(key==='idle')return orb.fired?'Dyktowanie':held>=.15?'Trzymaj: dyktowanie':'';
    if(key==='recording')return orb.fired?'Kończę':held>=.15?'Trzymaj: zakończ':'';
    return '';
  }
  function drawLogo(wrap,progress,t,color){ // Bubble._paint_logo: medical bag, cross morphing into a five-bar equalizer
    const m=1-(1-Math.max(0,Math.min(1,progress)))**3,bagW=43.68,bagH=32.76,arm=bagH*.58,th=arm*.32,ccy=-23.48+bagH/2;
    const barW=bagW*3.4/42,tall=bagH*16/27,short=bagH*7/27,step=bagW*6.25/42;
    const pulse=i=>t<0?1:.86-.14*Math.cos(2*Math.PI*((t-i*.11)/1.08));
    const set=(el,x,y,w,h,rx)=>{el.setAttribute('x',x.toFixed(2));el.setAttribute('y',y.toFixed(2));el.setAttribute('width',Math.max(0,w).toFixed(2));el.setAttribute('height',Math.max(0,h).toFixed(2));el.setAttribute('rx',Math.max(0,rx).toFixed(2));el.setAttribute('fill',color);};
    const armEl=$('[data-part="arm"]',wrap);
    if(m<.999){const w=arm+(th*.9-arm)*smooth(0,.5,m);set(armEl,-w/2,ccy-th/2,w,th,th*.3);armEl.style.display='';}else armEl.style.display='none';
    const kMid=smooth(0,1,m),wMid=th+(barW-th)*kMid,hMid=(arm+(tall-arm)*kMid)*(1+(pulse(2)-1)*m);
    set($('[data-bar="2"]',wrap),-wMid/2,ccy-hMid/2,wMid,hMid,Math.min(wMid,hMid)*(.3+.2*kMid));
    for(const [offset,full,a,b,index] of [[-1,short,.35,.75,1],[1,short,.35,.75,3],[-2,tall,.55,1,0],[2,tall,.55,1,4]]){
      const el=$(`[data-bar="${index}"]`,wrap),g=m>.001?smooth(a,b,m):0;
      if(g<=.001){el.style.display='none';continue;}
      const h=full*g*(1+(pulse(index)-1)*m);el.style.display='';set(el,offset*step-barW/2,ccy-h/2,barW,h,Math.min(barW,h)/2);
    }
  }
  function renderDrops(now){
    let layer=$('.oa-orb-splash');
    if(!orb.drops.length){if(layer)layer.innerHTML='';return;}
    if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.setAttribute('class','oa-orb-splash');layer.setAttribute('aria-hidden','true');(document.getElementById('overlay-layer')||document.body).append(layer);}
    layer.innerHTML=orb.drops.map(d=>{const f=OpisAIOrbMotion.sampleDrop(d,now-d.at);if(!f)return '';const [cr,cg,cb]=hexRgb(d.color);
      if(f.phase==='wet'){const w=f.radius*(1.35+1.35*Math.sin(f.progress*Math.PI/2)),h=Math.max(.25,f.radius*.22*(1-.55*f.progress));return `<ellipse cx="${f.x.toFixed(1)}" cy="${(f.y-h).toFixed(1)}" rx="${w.toFixed(1)}" ry="${h.toFixed(2)}" fill="rgba(${cr},${cg},${cb},${(130*f.opacity/255).toFixed(3)})"/>`;}
      const rad=f.radius*(1-.22*f.ligament),stretch=1+.48*Math.min(1,Math.abs(f.vy)/190),angle=Math.atan2(f.vy,f.vx)*180/Math.PI;
      const neck=f.ligament>0?`<path d="M${d.x.toFixed(1)} ${d.y.toFixed(1)}Q${((d.x+f.x)/2).toFixed(1)} ${d.y.toFixed(1)} ${f.x.toFixed(1)} ${f.y.toFixed(1)}" stroke="rgba(${cr},${cg},${cb},${(150*f.ligament/255).toFixed(3)})" stroke-width="${Math.max(.25,f.radius*1.1*f.ligament**1.6).toFixed(2)}" stroke-linecap="round" fill="none"/>`:'';
      return `${neck}<g transform="translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${angle.toFixed(1)})"><ellipse rx="${(rad*stretch).toFixed(2)}" ry="${(rad*.95).toFixed(2)}" fill="rgba(${cr},${cg},${cb},.8)" stroke="${shade(d.color,1/1.18)}" stroke-opacity=".53" stroke-width=".55"/><ellipse cx="${(-rad*.15).toFixed(2)}" cy="${(-rad*.43).toFixed(2)}" rx="${(rad*.2).toFixed(2)}" ry="${(rad*.12).toFixed(2)}" fill="rgba(255,255,255,.59)"/></g>`;}).join('');
  }
  function init(){
    if(!window.Shell||!window.Icons)return;
    createOrb();
    document.documentElement.style.setProperty('--oa-font-size',preferences.fontSize+'px');
    Shell.registerApp({id:'opisai',title:'OpisAI',icon:'opisai',open:showBubble}); // a second start raises the running bubble
    Object.keys(FIELDS).forEach((key,i)=>FIELDS[key]=preferences.clinicalSections[i]||defaults.clinicalSections[i]);
    window.addEventListener('clinic:focus',event=>{state.activeField=event.detail?.field||state.activeField;});
    document.addEventListener('keydown',event=>{if(state.recording&&Shell.activeWindow?.id==='opisai-dictation'&&event.key==='Enter'&&!event.shiftKey&&!['TEXTAREA','INPUT','BUTTON','SELECT'].includes(event.target.tagName)){event.preventDefault();finishDictation();}});
    window.OpisAI={open:describe,prepare:describe,describe,dictate,settings,history,about,showBubble,launch,undo,showMenu,trayTooltip,isClosed:()=>state.closed,getState:()=>({phase:state.phase,history:state.history.length,recording:!!state.recording,closed:state.closed,preferences:{...preferences}})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
