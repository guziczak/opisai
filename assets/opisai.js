/* OpisAI 0.12.0rc32. A local, interactive reconstruction of the desktop app.
 * Demonstration only: no microphone access, cloud requests or clinical writes.
 * Editable visit data stays locally in this browser. */
(() => {
  'use strict';
  const VERSION = '0.12.0rc32';
  const FIELDS = {wywiad: 'Wywiad', badanie: 'Badanie kliniczne', diagnoza: 'Rozpoznanie'};
  const PREF_KEY = 'opisai-demo-settings-v12';
  /* Konfiguracja (rc32 Config): the connection variant (domain/providers.py ids), the window theme ("auto" follows the
   * desktop), the idle bounce and the history switch. livePreview is the progress window's remembered "Pokaż tekst na
   * żywo" (generation_stream_visible). The demonstration starts from ChatGPT in the browser; a fresh rc32 starts from
   * Claude · Cookie HTTP · claude-sonnet-4-6. Earlier demo-only options (text size, animations, "Niebieski", section
   * names, panel rows, the variant switches) are no longer read, so they leave the stored settings at the next save. */
  const defaults = {provider:'chatgpt',transport:'browser',auth:'profile',model:'',theme:'auto',spelling:true,idleBounce:true,bounceInterval:10,bounceMax:0,history:true,livePreview:true};
  /* Dyktowanie (rc32 Config): engine (default Gemini Live), ChatGPT language clip, card mode and Autoenter, Gemini mode and
   * consent, local Whisper hardware, model and speakers, and the remembered details view. rc32 has no language or
   * one-sentence-per-line control. */
  Object.assign(defaults,{transcriber:'gemini',chatgptClip:true,cardMode:'own',autoEnter:false,autoEnterSeconds:10,geminiMode:'transcribe',dictationConsent:false,whisperHardware:'auto',whisperModel:'large-v3',diarization:false,diarizationOverlay:true,labelDoctor:'Lekarz',labelOther:'Właściciel',dictationDetails:false});
  /* domain/providers.py PROVIDERS: serwis → transport → autoryzacja → modele of that variant (runtime_key, a secret
   * field, a model chosen by the service's own UI). Konfiguracja, the compose route and the consent's service name. */
  const CLAUDE_MODELS=['claude-sonnet-4-6','claude-haiku-4-5','claude-opus-4-7'],GEMINI_WEB=['Gemini 3.1 Pro','Gemini 3.5 Flash'];
  const PROVIDERS=[['claude','Claude','cookie','cookie',CLAUDE_MODELS,'claude.ai',true],['chatgpt','ChatGPT','browser','profile',['gpt-4o','gpt-4o-mini','o1-preview','o1-mini','gpt-4-turbo'],'chatgpt',false,'(wybrany w ChatGPT UI)'],
    ['claude','Claude','browser','profile',CLAUDE_MODELS,'claude.ai-pw'],['gemini','Gemini','browser','profile',GEMINI_WEB,'gemini-pw'],['gemini','Gemini','browser','edge_cookie',GEMINI_WEB,'gemini-cookie',true],
    ['gemini','Gemini','browser','anonymous',['Gemini 3.5 Flash'],'gemini-anon'],['gemini','Gemini','api','api_key',['gemini-3.5-flash','gemini-3.1-flash-lite','gemini-3-flash-preview','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro','gemini-3.1-pro-preview','gemini-3-pro-preview','gemini-flash-latest','gemini-flash-lite-latest','gemini-pro-latest'],'gemini',true],
    ['gemini','Gemini','api','gcloud_oauth',['gemini-3.1-pro-preview','gemini-3.5-flash','gemini-3.1-flash-lite','gemini-3-flash-preview','gemini-2.5-flash','gemini-2.5-pro'],'gemini-oauth'],['local','Lokalny (offline)','local','local',['gemma4:12b','qwen3:14b','qwen3:8b','qwen3:4b'],'local']]
    .map(([id,label,transport,auth,models,runtime,secret=false,locked=''])=>({id,label,transport,auth,models,runtime,secret,locked}));
  const TRANSPORT_LABELS={cookie:'Cookie HTTP',browser:'Przeglądarka',api:'API',local:'Lokalnie (offline)'};
  const AUTH_LABELS={cookie:'Cookie z przeglądarki',profile:'Profil OpisAI / Chrome',edge_cookie:'Cookie z Edge',anonymous:'Bez logowania (Flash)',api_key:'Klucz API',gcloud_oauth:'OAuth Google Cloud',local:'Lokalnie (bez logowania)'};
  const uniq=list=>[...new Set(list)];
  const providerSpec=(p=preferences)=>PROVIDERS.find(s=>s.id===p.provider&&s.transport===p.transport&&s.auth===p.auth)||PROVIDERS[1];
  function modelFor(spec,requested){ // model_for_spec: a model belongs to its variant; ChatGPT's is chosen in its own UI
    if(spec.locked)return '';
    let m=String(requested||'').trim();const low=m.toLowerCase();
    if(spec.id==='gemini'&&spec.transport==='api')m=/3\.1/.test(low)&&/pro/.test(low)?'gemini-3.1-pro-preview':/3\.5/.test(low)&&/flash/.test(low)?'gemini-3.5-flash':m;
    else if(spec.id==='gemini')m=/flash/.test(low)&&!/pro/.test(low)?'Gemini 3.5 Flash':/pro/.test(low)||!spec.models.includes(m)?'Gemini 3.1 Pro':m;
    return spec.models.includes(m)?m:spec.models[0];
  }
  function connectCascade(p){ // _refresh_transport_combo → _refresh_auth_combo → _refresh_model_combo: keep what still fits
    const ts=uniq(PROVIDERS.filter(s=>s.id===p.provider).map(s=>s.transport));if(!ts.includes(p.transport))p.transport=ts[0];
    const as=PROVIDERS.filter(s=>s.id===p.provider&&s.transport===p.transport).map(s=>s.auth);if(!as.includes(p.auth))p.auth=as[0];
    const s=providerSpec(p);if(!s.locked)p.model=modelFor(s,p.model);
  }
  const modelLabel=(p=preferences)=>{const s=providerSpec(p);return s.locked?s.locked.replace(/^\(|\)$/g,''):modelFor(s,p.model);}; // model_label (bubble and tray tooltips)
  function connectionLabel(p=preferences){const s=providerSpec(p);return [s.label,TRANSPORT_LABELS[s.transport],s.locked?'model '+modelLabel(p):modelFor(s,p.model)].join(' · ');} // connection_label
  const normalizeConnection=p=>{ // the demo's earlier labels map onto rc32 variants; anything unknown returns to the default
    const old={ChatGPT:['chatgpt','browser','profile'],Claude:['claude','browser','profile'],Gemini:['gemini',p.transport==='API'?'api':'browser',p.transport==='API'?'api_key':'profile'],Lokalny:['local','local','local']}[p.provider];
    if(old){[p.provider,p.transport,p.auth]=old;p.model={'Claude Opus':'claude-opus-4-7','Gemini Pro':'pro','Gemini Flash':'flash'}[p.model]||'';}
    if(!PROVIDERS.some(s=>s.id===p.provider))Object.assign(p,{provider:defaults.provider,transport:defaults.transport,auth:defaults.auth});
    connectCascade(p);
  };
  /* Motyw okien: auto (the desktop's colour mode stands for Windows here), light or dark; the open Konfiguracja previews its choice. */
  let themePreview=null;
  const themeName=(theme=preferences.theme)=>theme==='dark'||theme==='auto'&&(window.Shell?.prefs?.theme||document.documentElement?.dataset?.theme)==='dark'?'dark':'light';
  let preferences = {...defaults};
  try { const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); for (const key of Object.keys(defaults)) if (key in saved && typeof saved[key] === typeof defaults[key]) preferences[key] = saved[key]; } catch (_) {}
  if(preferences.theme==='blue')preferences.theme='light'; // the demo's "Niebieski" was a light palette; rc32 offers auto, light and dark
  if(!['auto','light','dark'].includes(preferences.theme))preferences.theme=defaults.theme;
  /* Config idle_bounce_*: 10–3600 s between bounces, 0 = no limit per idle window. */
  const normalizeBounce=p=>{p.bounceInterval=Number.isFinite(+p.bounceInterval)?Math.max(10,Math.min(3600,Math.round(+p.bounceInterval))):defaults.bounceInterval;p.bounceMax=Number.isFinite(+p.bounceMax)?Math.max(0,Math.min(999,Math.round(+p.bounceMax))):defaults.bounceMax;};
  normalizeBounce(preferences);
  /* Saved dictation choices as rc32 identifiers (the demo's earlier labels map onto them); Autoenter whole seconds 5–600, otherwise 10. */
  const normalizeDictation=p=>{p.transcriber={ChatGPT:'chatgpt_browser','Gemini Live':'gemini','Whisper (lokalnie)':'local_whisper'}[p.transcriber]||(['gemini','local_whisper','chatgpt_browser'].includes(p.transcriber)?p.transcriber:defaults.transcriber);p.cardMode={'Nagrywa OpisAI':'own','Dwie karty':'two'}[p.cardMode]||(['own','two'].includes(p.cardMode)?p.cardMode:'own');if(!['transcribe','agent'].includes(p.geminiMode))p.geminiMode='transcribe';const s=Math.round(Number(p.autoEnterSeconds));p.autoEnterSeconds=s>=5&&s<=600?s:10;if(!['auto','nvidia_external','nvidia_internal','integrated','cpu'].includes(p.whisperHardware))p.whisperHardware='auto';if(!['large-v3','large-v3-turbo','medium','small'].includes(p.whisperModel))p.whisperModel='large-v3';};
  normalizeDictation(preferences);
  normalizeConnection(preferences);
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
  const stamp = () => new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  const toast = message => window.Shell?.toast(message);
  function bind(root, action, callback) { $$(`[data-action="${action}"]`,root).forEach(el => el.addEventListener('click',callback)); }
  function applyTheme(win,theme=(win?.id==='opisai-settings'&&themePreview)||preferences.theme) { if(!win?.el)return; win.el.classList.remove('oa-theme-light','oa-theme-dark','oa-theme-blue');win.el.classList.add('oa-host','oa-theme-'+themeName(theme)); }
  function refreshThemes() { windows.forEach(w=>applyTheme(w)); const dt=document.querySelector('.oa-dictation'); if(dt){dt.classList.remove('oa-theme-light','oa-theme-dark','oa-theme-blue');dt.classList.add('oa-theme-'+themeName());} } // a saved or followed theme reaches every OpisAI window
  function makeWindow(id,title,width,height,html,onClose) {
    let win=windows.get(id);
    if(win?.el?.isConnected){win.setTitle(title);win.setContent(html);win.show();win.focus();}
    else {win=Shell.createWindow({id,title,icon:'opisai',width,height,minWidth:Math.min(width,500),minHeight:Math.min(height,360),className:'oa-host oa-theme-'+themeName(),content:html,resizable:true,maximizable:true,taskbar:true,onClose:()=>onClose?.()});windows.set(id,win);}
    applyTheme(win); if(win?.el)win.el.dataset.oaWindow=id; holdPosition(); return win; // a work view stops the idle bounce where it is
  }
  function closeWin(id) { windows.get(id)?.close(); }
  window.addEventListener?.('shell:theme',()=>{if(preferences.theme==='auto'||themePreview==='auto')refreshThemes();}); // "Automatyczny" follows a change of the desktop's colour mode
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
  const docSpeed = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? .35 : 1; // ui/motion.py: only the system setting
  const pick = (values, keys) => Object.fromEntries(keys.map(key => [key, String(values?.[key] ?? '')]));
  const lines = text => Math.max(1, String(text).split('\n').length);
  const normal = text => String(text).replace(/\s+/g, ' ').trim().toLowerCase(); // also the settings search
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
  /* AppDialog (QDialog): Esc is reject(), the same path as the window's × or Anuluj. */
  function escapeCloses(win) {
    if (!win?.el || win.el.dataset.oaEscape) return; win.el.dataset.oaEscape = '1';
    win.el.addEventListener('keydown', e => { if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return; e.preventDefault(); e.stopPropagation(); win.close(); });
  }
  /* Qt keeps the keyboard focus on a control whose text changes; a control rebuilt here hands it to its replacement. */
  const FOCUS_KEYS = ['data-tab', 'data-details', 'data-page', 'data-entry', 'data-action', 'data-note'];
  function keepFocus(root, render) {
    const active = document.activeElement, key = active && active !== root && root.contains(active) ? FOCUS_KEYS.find(k => active.hasAttribute(k)) : null, value = key ? active.getAttribute(key) : '';
    render();
    if (key && !active.isConnected) root.querySelector(`[${key}="${CSS.escape(value)}"]`)?.focus();
  }

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
    const win = makeWindow('opisai-compose', 'OpisAI — przygotuj opis wizyty', 1040, 690, html, () => composeClosed(op)); state.active = win; escapeCloses(win);
    const root = win.content, ack = $('#oa-compose-ack', root), send = $('[data-action="generate"]', root), foot = $('[data-foot]', root);
    op.win = win; let resetShown = false, preview = null;
    const showReset = on => { resetShown = on; foot.textContent = on ? 'Zmieniło się to, co zostanie wysłane — zaznacz potwierdzenie ponownie.' : 'Pola wizyty pozostaną bez zmian.'; foot.classList.toggle('oa-c2-reset', on); };
    function refresh() {
      const sources = composeSources(op), has = sources.some(s => s.included && s.text.trim());
      for (const s of sources) { const card = $(`[data-source-card="${s.field}"]`, root), status = $('[data-status]', card), text = !s.included ? 'Poza wybranym zakresem — diagnoza nie będzie opracowywana.' : !s.text.trim() ? 'Puste pole — możesz je uzupełnić.' : ''; card.classList.toggle('out-of-scope', !s.included); status.textContent = text; status.hidden = !text; }
      $$('[data-tile]', root).forEach(tile => { const on = tile.getAttribute('aria-disabled') !== 'true' && Doc().sameVariant(JSON.parse(tile.dataset.tile), op.variant); tile.classList.toggle('selected', on); tile.setAttribute('aria-pressed', String(on)); });
      $('[data-description]', root).innerHTML = variantHtml(op.variant);
      const local = preferences.provider === 'local', route = connectionLabel(), service = route.split('·')[0].trim() || 'wskazanej usługi AI';
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
    if (ws.win.options) Object.assign(ws.win.options, {minWidth: 420, minHeight: 400}); // DocumentWorkspace.setMinimumSize(420, 400)
    escapeCloses(ws.win); workspace = ws; return ws;
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
    setTimeout(() => { if (!ws.finished && !cancelling) $(stream ? '[data-action="hide-stream"]' : '[data-action="show-stream"]', root)?.focus(); }, 0);
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
  function recoveryDialog(issue) {
    const writing = !!issue.writing, delivery = issue.delivery || 'unknown', backend = providerSpec().runtime; // ProviderSpec.runtime_key
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
    ws.win = win; state.active = win; startClock(ws, win.content); bind(win.content, 'cancel', cancel); escapeCloses(win);
    setTimeout(() => { if (!ws.finished && !ws.cancelling) $('[data-action="cancel"]', win.content)?.focus(); }, 0);
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
      : `<span class="oa-footnote oa-rv-fnote">Wpisanie do pól nie zapisuje wizyty w Klinice.</span>${button('Odrzuć', 'reject')}${button('✓&nbsp; Wpisz do pól', 'apply', 'primary', '', 'disabled')}`;
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
      keepFocus(root, () => { $('[data-note-list]', root).innerHTML = notes.slice(0, 2).map(note => `<div class="oa-rv-note"><span class="oa-rv-ellipsis" title="${esc(note.title + '\n' + note.quote + '\n' + note.message)}">${esc(note.title + (note.quote ? ': „' + note.quote + '”' : '') + ' — ' + note.message.split('\n')[0])}</span>${linkButton('Pokaż w tekście', 'note-' + note.key.replace(/[^\w:-]/g, '_'), `data-note="${esc(note.key)}" aria-label="${esc('Pokaż w tekście: ' + note.title + ' ' + note.quote)}"`)}</div>`).join(''); });
      $$('[data-note]', $('[data-note-list]', root)).forEach(el => el.addEventListener('click', () => showNote(notes.find(x => x.key === el.dataset.note))));
      result.notes = notes; if (!notes.length && notesOpen) { notesOpen = false; draw(); }
      keepFocus(root, () => { tabsEl.innerHTML = [...result.keys.map(k => `<button type="button" role="tab" class="oa-tab ${result.tab === k && !notesOpen ? 'active' : ''}" data-tab="${k}" aria-selected="${result.tab === k}" title="${esc(result.full[k] + (result.selected.includes(k) ? '' : ' — Pole pozostanie bez zmian'))}">${esc(result.captions[k] + (result.selected.includes(k) ? '' : ' · bez zmian'))}</button>`),
        `<button type="button" role="tab" class="oa-tab ${result.tab === 'details' ? 'active' : ''}" data-tab="details" aria-selected="${result.tab === 'details'}" title="Źródło, parametry i kontrole — ${controls.count} uwag do sprawdzenia">Szczegóły${!dict && controls.count ? ' · ' + controls.count : ''}</button>`].join(''); });
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
    function draw() { keepFocus(root, render); }
    function focusEditor(options) { // the inline preview or the field's first visible editor (StructuredFieldEditor's focus proxy)
      ($('.oa-rv-preview', body) || $$('[data-block]:not([readonly]), [data-plain]', body).find(el => !el.closest('[hidden]')))?.focus(options);
    }
    function render() {
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
      bind(body, 'toggle-field', () => { const on = !result.selected.includes(key); result.selected = on ? result.keys.filter(k => k === key || result.selected.includes(k)) : result.selected.filter(k => k !== key); changed(); draw(); if (on) focusEditor(); });
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
    setTimeout(() => focusEditor({preventScroll: true}), 0);
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
    const win = makeWindow('opisai-exchange', 'OpisAI — polecenie i odpowiedź AI', 960, 680, html); escapeCloses(win); bind(win.content, 'close', () => win.close()); bind(win.content, 'copy-all', () => copyText(text, $('[data-action="copy-all"]', win.content)));
  }

  /* Write (application/writer.py, coordinator._written): field check, write, control read, receipt. */
  function writeChanges(plan) {
    const ws = {finished: false}, win = makeWindow('opisai-progress', 'OpisAI — wpisanie do pól', 740, 540, progressHtml('writing'), () => ws.finished ? undefined : false);
    ws.win = win; startClock(ws, win.content); state.active = win; escapeCloses(win);
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
    state.lastReceipt = receipt; // coordinator._written keeps every receipt; undo refuses one that is not verified or partial
    if (receipt.status === 'verified') {
      state.lastWrite = receipt; setPhase('done');
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
      const win = makeWindow('opisai-undo', 'OpisAI — potwierdź cofnięcie', 850, 600, html); escapeCloses(win);
      bind(win.content, 'cancel', () => win.close());
      bind(win.content, 'ok', () => { win.close(); writeChanges({changes, snapshot: Object.fromEntries(changes.map(c => [c.key, c.before])), session: ctx.session, inverse: true}); });
      setTimeout(() => $('[data-action="ok"]', win.content)?.focus(), 0);
    }, () => messageBox({title: 'OpisAI — sprawdź komunikat', icon: 'warning', text: 'Anulowano odczyt. Pola pozostały bez zmian.'}));
  }
  async function copyText(value,control){
    let ok=false;try{await navigator.clipboard.writeText(String(value));ok=true;}catch(_){const t=document.createElement('textarea');t.value=String(value);t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();try{ok=document.execCommand('copy');}catch(__){}t.remove();}
    if(control&&ok){const span=$('span',control);if(span){const old=span.textContent;span.textContent='Skopiowano';setTimeout(()=>{if(span.isConnected)span.textContent=old;},1800);}}else toast(ok?'Skopiowano do schowka.':'Zaznacz tekst i użyj Ctrl+C, aby skopiować.');
  }

  /* ---------------------------------------------------------------- dictation
   * 0.12.0rc32 live dictation (MacroController._on_triple_click, application/dictation_session.py,
   * ui/transcript_overlay.py): always into the configured "Badanie kliniczne" field, a frameless
   * preview over that field and the engine chosen in Konfiguracja → Dyktowanie. The microphone is
   * never requested: fictional exam findings for Fistaszek are "spoken" word by word with pauses
   * between fragments; each dictation speaks the next sample that is not yet in the field (or in the
   * continued text), and "Kontynuuj dyktowanie" moves on to the sample after the last one. */
  const DICTATION_SAMPLES=[
    ['Błony śluzowe bladoróżowe, czas powrotu kapilarnego około 2 sekund.','Oddechy około 140 na minutę, z udziałem tłoczni brzusznej.','Węzły chłonne podżuchwowe niepowiększone. Brzuch miękki, niebolesny.'],
    ['Nawodnienie prawidłowe, fałd skórny rozprostowuje się od razu.','Siekacze prawidłowej długości, bez przerostu.'],
    ['Małżowiny uszne i przewody słuchowe czyste, bez wydzieliny.']];
  const DT_STEP=.12,DT_DELAY=1.5,DT_QUIET=.0025; // TranscriptionTextEdit.SAMPLE_SECONDS and QUIET_LEVEL; a card plays OpisAI's recording 1.5 s later
  const DT_ENGINES={gemini:'Gemini Live — chmura (wymaga klucza API Gemini)',local_whisper:'Lokalny Whisper — na tym komputerze, offline (RODO)',chatgpt_browser:'ChatGPT — dyktowanie w przeglądarce (próba)'};
  const DT_STRATEGY={ // ui/dictation_strategy.py STRATEGY_COPY: label, summary, details, interval label and its tooltip
    own:['Nagrywa OpisAI — dwie karty przepisują (polecany)','OpisAI nagrywa mikrofon i dzieli wypowiedź w pauzach; karty ChatGPT tylko przepisują kolejne fragmenty. Przełączenie kart nie przerywa nagrywania, a każdy fragment trafia do jednej karty.','Mikrofon otwiera OpisAI (karty ChatGPT nie używają mikrofonu), więc możesz mówić bez przerwy — także wtedy, gdy karty jeszcze przepisują. Fragment kończy się w pauzie: po podanym czasie, po dłuższym zawieszeniu głosu albo po Enterze (bez Autoenter tylko po Enterze). Karta, która zostaje w tyle, nie dostaje środka dłuższej pauzy (słowa i krótkie pauzy idą zawsze w całości), więc tekst przychodzi szybciej po Enterze. Fragment, którego karta nie przepisze, przepisuje druga karta z nagrania w pamięci. Nagranie jest tylko w pamięci OpisAI i znika po zakończeniu dyktowania; ChatGPT, jak w trybie dwóch kart, dostaje dźwięk fragmentów do przepisania.','Długość fragmentu:','Po tylu sekundach OpisAI zamyka fragment w najbliższej pauzie w mowie. Dłuższe zawieszenie głosu zamyka go wcześniej; Enter też. Po wyłączeniu Autoenter fragment kończy tylko Enter albo zakończenie dyktowania; dopiero po 2 minutach bez Entera OpisAI zamyka go w najbliższej pauzie.'],
    two:['Dwie karty nagrywają na zmianę','Karty same nagrywają mikrofon i przekazują sobie nagrywanie; wynik jest składany z kolejnych fragmentów. Tryb zapasowy, gdy „Nagrywa OpisAI” nie działa na tym komputerze.','Enter zleca przepisanie fragmentu: druga karta przejmuje mikrofon i nagrywa do następnego polecenia (A → B → A …), a poprzednia oddaje tekst i czeka gotowa. Następne polecenie wymaga gotowości drugiej karty; Autoenter nie gwarantuje wyniku dokładnie co podaną liczbę sekund.','Odstęp fragmentów:','Odstęp automatycznych próśb o przepisanie fragmentu, liczony od przejęcia nagrywania przez bieżącą kartę. Gotowość drugiej karty może opóźnić wykonanie, bez zaległych przełączeń. Po wyłączeniu Autoenter używaj Entera.']};
  const DT_REASONS={accepted:'Przyjęto prośbę o przepisanie fragmentu.',segment_pause:'Zamknę fragment w najbliższej pauzie w mowie, żeby nie przeciąć słowa. Mów dalej; nie ponawiaj Entera.',pause:'Przekazuję w najbliższej pauzie w mowie, żeby nie przeciąć słowa. Nie ponawiaj Entera.'};
  const DT_ACTIVE=['queued','starting','recording','transcribing','stabilizing'];

  /* Hold, "Dyktuj" and the menu (MacroController._on_triple_click). A second hold stops the recording;
   * a hold while the Gemini question waits cancels that start; the configuration blocks it; any open
   * OpisAI window, compose, progress, review and undo included, is recalled silently
   * (ui_windows().raise_active); only a review waiting behind the bubble is "another operation"
   * (_start_transcription_planned, safe.busy), and nothing starts during generation. */
  function dictate(options={}){
    options=validOption(options);
    if(state.closed)launch();
    if(state.recording){finishDictation();return;}
    if(state.receipt)return;
    if(state.consent){state.consent.cancelled=true;return;} // _dictation_starting: the question stays, the start is cancelled
    if(!options.direct&&settingsOpen())return;
    if(!options.direct&&raiseActive())return; // the open view comes forward and nothing starts
    if(state.job)return;
    if(!options.direct&&state.review){errorCard('Trwa inna operacja — zakończ ją przed dyktowaniem.',{title:'🎙 Transkrypcja',accent:'#2ecc71'});return;}
    if(!window.Clinic?.isEditorOpen?.()){errorCard('Nie znaleziono podokna wizyty — otwórz wizytę w Klinice.',{title:'⚠ Transkrypcja',accent:'#e74c3c'});restoreDictationReview(options);return;}
    beginOperation();startDictation(options);
  }
  function startDictation(options){ // Gemini asks before the first recording (MacroController._confirm_gemini_dictation)
    if(preferences.transcriber!=='gemini'||preferences.dictationConsent){openDictation(options);return;}
    askGeminiConsent(accepted=>{if(accepted)openDictation(options);else restoreDictationReview(options);});
  }
  function askGeminiConsent(done){ // ui/dictation.py, a compact dialog: dismissal never authorizes or stores consent
    const ask=state.consent={cancelled:false};let answered=false;
    const answer=value=>{if(answered)return;answered=true;if(state.consent===ask)state.consent=null;done(value&&!ask.cancelled);}; // consent given during a cancelled start is still remembered
    const html=`<div class="oa-app oa-consent"><div class="oa-content"><h2>Dyktowanie przez Gemini Live</h2><p>Dźwięk z mikrofonu będzie przesyłany do usługi Google Gemini Live w celu zamiany mowy na tekst. Podczas nagrywania zobaczysz transkrypcję, a po zakończeniu sprawdzisz ją przed wpisaniem do Kliniki.</p>${check('Zapamiętaj zgodę na dyktowanie przez Gemini Live','oa-gemini-remember',true)}<p class="oa-muted">Zgodę możesz cofnąć w konfiguracji, w sekcji transkrypcji głosowej.</p></div><footer class="oa-footer"><span class="oa-footnote"></span>${button('Anuluj','cancel')}${button('Rozpocznij dyktowanie','start','primary')}</footer></div>`;
    const id='opisai-gemini-consent',win=Shell.createWindow({id,title:'OpisAI — dyktowanie',icon:'opisai',width:610,height:290,minWidth:420,minHeight:250,className:'oa-host oa-theme-'+themeName(),content:html,resizable:false,maximizable:false,taskbar:false,onClose:()=>answer(false)}),root=win.content;
    windows.set(id,win);if(win.el)win.el.dataset.oaWindow=id;holdPosition();
    const max=win.el?.querySelector?.('[data-caption="max"]');if(max)max.hidden=true; // CompactDialog: only "×" in its title bar
    bind(root,'cancel',()=>win.close());
    bind(root,'start',()=>{if($('#oa-gemini-remember',root)?.checked){preferences.dictationConsent=true;savePreferences();}answer(true);win.close();});
    setTimeout(()=>$('[data-action="cancel"]',root)?.focus?.(),0); // "Anuluj" is the default button
  }
  /* _start_transcription_planned → SafeCoordinator.begin_dictation: the field is read now; a continuation
   * keeps its edited text only for the same window and an unchanged field. */
  function openDictation(options){
    if(!window.Clinic?.isEditorOpen?.()){errorCard('Nie znaleziono podokna wizyty — otwórz wizytę w Klinice.',{title:'⚠ Transkrypcja',accent:'#e74c3c'});restoreDictationReview(options);return;}
    const key='badanie',ctx=window.Clinic.getContext?.()||{},fields=getFields(),saved=options.continuation?dictationSaved(options):null;let base=fields[key]||'';
    if(options.continuation){
      if(options.session!==undefined&&options.session!==ctx.session||String(options.snapshot?.[key]??base)!==base){errorCard('Zmieniła się wizyta lub treść jej pola. Zachowano wcześniejszy tekst dyktowania.',{title:'⚠ Transkrypcja',accent:'#e74c3c'});restoreDictationReview(options);return;} // DictationContinuationInput.validate → _show_transcribe_info(error=True)
      base=String(options.base??saved?.edited?.[key]??'');
    }
    const engine=preferences.transcriber,chat=engine==='chatgpt_browser',two=chat&&preferences.cardMode==='two',after=options.continuation?(saved?.takes||1):0,heard=normal(base);
    const take=DICTATION_SAMPLES.findIndex((sample,i)=>i>=after&&!heard.includes(normal(sample[0]))); // the next sample not yet in the text: a written note or a continuation never repeats one; none left, silence
    const prep=chat?(two?1.4:1.6):engine==='gemini'?1.1:2.2,diarization=engine==='local_whisper'&&preferences.diarization;
    if(diarization)errorCard('Rozpoznawanie mówców pominięte: brak biblioteki pyannote. Konfiguracja → sekcja transkrypcji → Rozpoznawanie mówców → „Pobierz brakujące składniki”.',{title:'🎙 Transkrypcja',accent:'#2ecc71'});
    const rec=state.recording={id:++state.token,engine,chat,two,clip:chat&&preferences.chatgptClip,auto:chat&&preferences.autoEnter?preferences.autoEnterSeconds:0,key,label:FIELDS[key],snapshot:{[key]:fields[key]||''},session:ctx.session,base, // capture(hwnd,[key]): only the dictated field guards the note's write
      continuation:!!options.continuation,restore:options.continuation?options:null,takes:take<0?DICTATION_SAMPLES.length:take+1,t:0,at:performance.now(),prep,started:null,listening:false,stopping:null,stopAt:null,result:false,resultAt:0,cancelled:false,
      status:chat?(two?'Otwieram dyktowanie ChatGPT… Zacznij mówić po potwierdzeniu uruchomienia mikrofonu.':'Otwieram karty ChatGPT… Mikrofon otworzy OpisAI, gdy pierwsza karta będzie gotowa.'):engine==='gemini'?'🎙 Łączę z Gemini… za chwilę mów. Przytrzymaj bąbelek, aby zakończyć.':'🧠 Ładuję lokalny model Whisper… pierwsze użycie może chwilę potrwać. Przytrzymaj bąbelek, aby zakończyć.',
      command:null,text:'',shown:'',said:'',speech:dictationSpeech(DICTATION_SAMPLES[take]||[],prep+.9),audio:[],level:null,wave:{cols:[],clock:0,last:null,quiet:null,bucket:null},
      fragments:[],following:true,userHidden:false,details:!!preferences.dictationDetails,baseOpen:false};
    rec.words=rec.speech.flatMap(f=>f.words);
    setPhase('processing'); // dots until the microphone is confirmed
    dictationOverlay(rec);renderDictation(rec);followDictation(rec);
    rec.tick=setInterval(()=>dictationStep(rec),DT_STEP*1000);
  }
  function dictationSpeech(sample,from){ // the scripted speaker: word timings, a pause after each fragment
    let at=from;
    return sample.map(text=>{const words=text.split(' ').map(word=>{const w={word,at,end:at+.14+.042*word.length};at=w.end+.06;return w;});at+=1.3;return {text,words,start:words[0].at,end:words.at(-1).end};}); // about two words a second
  }
  const spokenWords=(rec,from,to)=>rec.words.filter(w=>w.at>=from-1e-6&&w.end<=Math.min(to,rec.stopAt??Infinity)+1e-6).map(w=>w.word).join(' ');
  function speechLevel(rec,t){ // a deterministic speech envelope: syllable-shaped words, quiet gaps and pauses
    if(t>(rec.stopAt??Infinity))return .0012;
    if(!rec.speech.some(f=>t>=f.start&&t<f.end))return .0012;
    const w=rec.words.find(x=>t>=x.at&&t<x.end),r=Math.sin((t*7.3+rec.id)*12.9898)*43758.5453,n=r-Math.floor(r);
    return w?.04+.14*(.35+.65*n)*(.6+.4*Math.sin(Math.PI*(t-w.at)/(w.end-w.at))):.014+.012*n;
  }
  /* TranscriptionTextEdit._append_audio_level: at most one column per 120 ms; after half a second of
   * measured silence the display clock slows (1/10, then logarithmically), so silence is compressed. */
  function waveSample(w,level,now){
    let elapsed=w.last==null?0:Math.max(0,now-w.last),wasSlow=w.quiet!=null&&now-w.quiet>=.5,slow=0,slowDisplay=0;
    if(elapsed>=.8){elapsed=DT_STEP;w.quiet=null;wasSlow=false;}
    if(level<=DT_QUIET){if(w.quiet==null)w.quiet=now;const age=Math.max(0,now-w.quiet-.5);slow=Math.min(elapsed,age);slowDisplay=3/10*Math.log1p(slow/(3+age-slow));}else w.quiet=null;
    if(elapsed)w.clock+=Math.min(elapsed,DT_STEP)*(elapsed-slow+slowDisplay)/elapsed;w.last=now;
    const bucket=Math.floor((w.clock+1e-9)/DT_STEP);
    if(w.cols.length&&bucket===w.bucket&&!(wasSlow&&level>DT_QUIET)){const c=w.cols.at(-1);c[0]=Math.max(c[0],level);c[1]=now;}else w.cols.push([level,now]);
    w.bucket=bucket;
  }
  /* One 120 ms step of the scripted session: capture, the speaker, commands, cards and the stop protocol. */
  function dictationStep(rec){
    if(state.recording!==rec){clearInterval(rec.tick);return;}
    const t=rec.t=Math.round((rec.t+DT_STEP)*1000)/1000;rec.at=performance.now();
    if(rec.started==null&&rec.stopping==null){
      if(rec.engine==='gemini'&&t>=.6)rec.status=t<rec.prep-.2?'Łączę z Gemini Live…':`Gemini Live — ${preferences.geminiMode==='agent'?'agent audio: gemini-3.1-flash-live-preview':'transkrypcja: gemini-3.5-transcribe-live'}`;
      if(t>=rec.prep){rec.started=t;rec.listening=true;if(rec.chat)openFragment(rec,t);setPhase('recording');} // red REC only once the microphone records
    }
    if(rec.listening){
      const level=speechLevel(rec,t);rec.audio.push([t,level]);if(rec.audio.length>600&&rec.audio[0][0]<t-30)rec.audio.splice(0,rec.audio.findIndex(a=>a[0]>=t-25));rec.level=level;waveSample(rec.wave,level,t);
      if(!rec.chat){const text=spokenWords(rec,0,t-(rec.engine==='gemini'?.45:.7));if(text!==rec.text){rec.text=text;rec.wave.cols=[];}} // live partials; a new snapshot restarts the tail
    }
    if(rec.chat)dictationCards(rec,t);
    if(rec.stopping!=null&&!rec.result){
      if(!rec.chat&&t-rec.stopping>=(rec.started==null?.6:1.2)){rec.text=rec.started==null?'':spokenWords(rec,0,rec.stopAt);rec.result=true;rec.resultAt=t;}
      else if(rec.chat&&t-rec.stopping>=.5&&!rec.fragments.some(f=>DT_ACTIVE.includes(f.stage))){rec.result=true;rec.resultAt=t;}
    }
    if(rec.result&&t-rec.resultAt>=.5){closeDictation(rec);return;}
    renderDictation(rec);
  }
  function dictationCards(rec,t){ // own audio: the open fragment's card plays it 1.5 s later, then transcribes; "two": the card records it
    const c=rec.command;
    if(c&&rec.listening){
      const open=rec.fragments.find(f=>f.end==null);
      if(c.phase==='accepted'&&t-c.at>=.3){
        if(!open||!spokenWords(rec,open.start,t))rec.command=null; // segment_empty: nothing said since the last cut
        else{const f=rec.speech.find(x=>t>=x.start&&t<x.end);if(f)Object.assign(c,{phase:'executing',reason:rec.two?'pause':'segment_pause',until:f.end});else{cutFragment(rec,t);rec.command=null;}}
      }else if(c.phase==='executing'&&t>=c.until){cutFragment(rec,t);rec.command=null;}
    }
    if(rec.auto&&rec.listening&&!rec.command){const open=rec.fragments.find(f=>f.end==null);if(open&&t-open.start>=rec.auto&&!rec.speech.some(f=>t>=f.start&&t<f.end)&&spokenWords(rec,open.start,t))cutFragment(rec,t);} // Autoenter: in the first pause after the interval
    for(const f of rec.fragments){
      if(f.stage==='queued'&&!rec.fragments.some(x=>x!==f&&x.card===f.card&&['starting','recording','transcribing','stabilizing'].includes(x.stage)))Object.assign(f,{stage:'starting',since:t,lag:rec.two?0:Math.max(DT_DELAY,t-f.start)});
      else if(f.stage==='starting'&&t-f.since>=.4)Object.assign(f,{stage:'recording',since:t});
      else if(f.stage==='recording'&&f.end!=null&&t>=f.end+f.lag)Object.assign(f,{stage:f.text?'transcribing':'discarded',since:t});
      else if(f.stage==='transcribing'&&t-f.since>=(rec.clip?2:1.6))Object.assign(f,{stage:'stabilizing',since:t});
      else if(f.stage==='stabilizing'&&t-f.since>=.4){Object.assign(f,{stage:'done',since:t});
        rec.text=rec.fragments.filter(x=>x.stage==='done'&&x.text).sort((a,b)=>a.n-b.n).map(x=>x.text).join(' ');
        rec.wave.cols=rec.wave.cols.filter(col=>col[1]>f.end);} // acknowledge_audio: transcribed audio leaves the inline wave
    }
  }
  function openFragment(rec,at){const n=rec.fragments.length+1;rec.fragments.push({n,card:n%2?'A':'B',start:at,end:null,stage:'queued',since:at,lag:0,text:''});}
  function cutFragment(rec,at){ // the fragment ends in a pause; the other card takes the next one
    const f=rec.fragments.find(x=>x.end==null);if(!f)return;
    f.end=at;f.text=spokenWords(rec,f.start,at);
    if(f.stage==='queued'||f.stage==='starting')f.stage=f.text?f.stage:'discarded';
    if(rec.stopping==null)openFragment(rec,at);
  }
  function cardState(rec,name,t){ // the card's current recording, as RecordingSnapshot.states would say
    const f=rec.fragments.filter(x=>x.card===name&&x.stage!=='queued'&&x.stage!=='discarded').at(-1);
    if(!f)return ['idle',null];
    if(f.stage==='done')return [t-f.since<1.2?'done':'idle',f];
    return [f.stage==='stabilizing'?'stabilizing_result':f.stage==='recording'&&f.end!=null&&!rec.two?'draining':f.stage,f];
  }
  function requestFlush(rec,source){ // Enter / "Przepisz fragment ↵": DictationCommands.request, accepted or coalesced
    if(!rec?.chat||!rec.listening||rec.stopping!=null||rec.cancelled)return false;
    const flush=rec.el?.querySelector('[data-dt="flush"]');
    if(flush&&document.activeElement===flush)rec.el.querySelector('[data-dt-scroll]')?.focus?.(); // the next Enter still belongs to the panel
    if(!rec.command)rec.command={phase:'accepted',reason:'accepted',at:rec.t,source};
    renderDictation(rec);return true;
  }
  function dictationEnterShortcut(event){ // ui/dictation_shortcut.py: during a ChatGPT dictation Enter in the dictated field never reaches it
    const rec=state.recording;
    if(!rec?.chat||event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||!event.target?.closest?.(`[data-clinic-field="${rec.key}"]`)||window.Clinic?.getContext?.().session!==rec.session)return;
    event.preventDefault();event.stopPropagation();
    if(!event.repeat&&rec.el&&!rec.el.hidden)requestFlush(rec,'keyboard'); // the next fragment needs the visible panel; otherwise the press is only kept out of the field
  }
  /* "Zakończ i sprawdź tekst", a second hold or "Zakończ": request_finish. The panel stays and says what
   * the stop still waits for; the review opens once the last text has arrived. */
  function finishDictation(){
    const rec=state.recording;if(!rec||rec.stopping!=null||rec.cancelled)return;
    if(document.activeElement?.matches?.('[data-dt="finish"],[data-dt="flush"]')&&rec.el?.contains(document.activeElement))rec.el.querySelector('[data-dt-scroll]')?.focus?.(); // both get disabled: keep the focus in the panel, where the stop is announced
    rec.stopping=rec.t;rec.stopAt=rec.t;rec.listening=false;rec.command=null;
    if(rec.chat)cutFragment(rec,rec.t);
    setPhase('processing');renderDictation(rec);
  }
  function dropDictation(){ // SafeCoordinator.cancel: the microphone start, the stop or the last-text receipt; never a review
    const rec=state.recording;state.recording=null;state.receipt=null;state.active=null;setPhase('idle');
    if(!rec)return;
    if(rec.el&&!rec.el.hidden){rec.cancelled=true;renderDictation(rec);setTimeout(()=>disposeDictation(rec),350);}else disposeDictation(rec);
    if(rec.continuation)restoreDictationReview(rec.restore);
  }
  function disposeDictation(rec){
    clearInterval(rec.tick);clearInterval(rec.follow);cancelAnimationFrame(rec.frame);rec.observer?.disconnect?.();
    const focused=!!rec.el?.contains(document.activeElement);
    if(rec.onResize)window.removeEventListener('resize',rec.onResize);rec.el?.remove();rec.el=null;if(focused)returnDictationFocus(rec);
  }
  function returnDictationFocus(rec){ // a hidden or closed panel never keeps the focus ("Zwiń" is NoFocus in rc32): the dictated field of the same window, else the bubble
    if(window.Clinic?.getContext?.().session!==rec.session||!window.Clinic?.focusField?.(rec.key))orb.el?.querySelector('.oa-orb')?.focus?.();
  }
  function closeDictation(rec){ // the worker finished: teardown, then the review of the text (DictationSession.release)
    state.recording=null;disposeDictation(rec);
    const transcript=rec.text.trim();
    if(!transcript){setPhase('idle');if(rec.continuation)restoreDictationReview(rec.restore);errorCard('Nagranie zakończone bez tekstu. Dotychczasowa notatka została zachowana.',{title:'🎙 Transkrypcja',accent:'#2ecc71'});return;}
    const after=rec.base+(rec.base?'\n':'')+transcript; // dictation_draft: the field's text once, then a single line break
    const result={id:rec.id,snapshot:rec.snapshot,sources:{[rec.key]:rec.continuation?after:transcript},output:{[rec.key]:after},variant:{rich:false,panel:false,diagnosis:false},field:rec.key,session:rec.session,
      mode:'dictation',route:'Przykładowe dyktowanie',transcription:dictationSource(rec),takes:rec.takes,created:new Date().toISOString()};
    state.lastDictation=result;review(result);
  }
  function dictationSource(rec){ // TranscriptionSource of the session, for the review's "Transkrypcja:" line
    if(rec.chat)return {backend:'chatgpt_browser',model:rec.two?'model niepotwierdzony (dyktowanie WWW)':'model niepotwierdzony (dyktowanie WWW, dźwięk nagrywa OpisAI)',language:'auto',mode:'dictation',realtime_model:''};
    if(rec.engine==='gemini'){const agent=preferences.geminiMode==='agent';return {backend:'gemini',model:agent?'gemini-3.1-flash-live-preview':'gemini-3.5-transcribe-live',language:'pl-PL',mode:agent?'agent':'transcribe',realtime_model:''};}
    const cpp=['integrated','cpu'].includes(preferences.whisperHardware);
    return {backend:'local_whisper',model:preferences.whisperModel,language:'pl',mode:cpp?'whisper_cpp':'realtime',realtime_model:cpp?'':'small'};
  }
  const dictationSaved=options=>options?.review||state.lastDictation||null;
  function restoreDictationReview(options){ // _restore_dictation_continuation: the edited review waits behind the bubble ("Sprawdź")
    if(!options?.continuation)return;
    const saved=dictationSaved(options);if(!saved)return;
    if(saved.edited&&options.base!==undefined)saved.edited[saved.field||'badanie']=options.base;
    state.review=saved;setPhase('review');
  }
  function showDictation(){ // the bubble's "Pokaż" or click: recall the preview (TranscriptOverlay.recall), focus for the keyboard
    const rec=state.recording;if(!rec?.el)return;
    rec.userHidden=false;followDictation(rec);if(!rec.el.hidden)rec.el.querySelector('[data-dt-scroll]')?.focus?.();
  }

  /* TranscriptOverlay: never a taskbar window and never activated by itself; its stacking follows the
   * Klinika sub-window, its geometry follows the field (FOLLOW_MS 300) and it hides without the field. */
  function dictationOverlay(rec){
    const el=document.createElement('section');el.className='oa-dictation oa-host oa-theme-'+themeName();el.setAttribute('aria-label','OpisAI — dyktowanie');el.hidden=true;el.dataset.engine=rec.engine;
    el.innerHTML=`<div class="oa-dt-target"><span data-dt-target></span>${rec.speech.length?'<span class="oa-dt-demo" title="Demonstracja nie używa mikrofonu: odtwarza zapisany przykład.">Przykładowe dyktowanie</span>':'<span class="oa-dt-demo" title="Demonstracja nie używa mikrofonu. Zapisane przykłady się skończyły, więc to nagranie pozostanie ciche.">Przykładowe dyktowanie — cisza</span>'}</div>`+
      `<div class="oa-dt-head"><span class="oa-dt-indicator" data-dt-indicator aria-hidden="true">●</span><div class="oa-dt-status" data-dt-status></div><span class="oa-dt-meter" data-dt-meter role="meter" aria-label="Poziom sygnału mikrofonu" aria-valuemin="0" aria-valuemax="100" hidden><i></i></span><button type="button" class="oa-dt-hide" data-dt="hide" aria-label="Ukryj podgląd; dyktowanie trwa dalej" title="Ukryj podgląd. Dyktowanie trwa dalej; ikoną OpisAI możesz przywołać podgląd.">Zwiń</button></div>`+
      `<div class="oa-dt-body"><button type="button" class="oa-dt-toggle" data-dt="base" aria-expanded="false" title="Rozwiń tekst zachowany przed tym nagraniem. Nowe dyktowanie pojawia się osobno poniżej." hidden>Dotychczasowy tekst</button><div class="oa-dt-base" data-dt-base tabindex="0" aria-label="Tekst przed nagraniem — tylko do podglądu" hidden></div>`+
      `<div class="oa-dt-stream"><div class="oa-dt-scroll" data-dt-scroll tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label="Nowe dyktowanie — rozpoznawany tekst" title="Zielona fala za tekstem pokazuje mikrofon przed klipem i opóźnieniem kart. To kompaktowy podgląd aktywności (cisza skrócona), nie liniowa oś czasu. Pełne pomiary i osie A/B/C/D są w szczegółach poniżej."><div class="oa-dt-text"><span data-dt-text></span><span data-dt-end></span><span class="oa-dt-placeholder" data-dt-placeholder></span><canvas data-dt-wave aria-hidden="true"></canvas></div></div><button type="button" class="oa-dt-flush" data-dt="flush" hidden disabled>Przepisz fragment ↵</button></div></div>`+
      `<button type="button" class="oa-dt-toggle" data-dt="details" aria-expanded="false">Szczegóły dyktowania — mikrofon</button><div class="oa-dt-summary" data-dt-summary hidden></div><canvas class="oa-dt-timeline" data-dt-timeline role="img" aria-label="Mikrofon teraz oraz wejścia rejestratorów — wspólna oś czasu" hidden></canvas><button type="button" class="oa-dt-toggle oa-dt-plain" data-dt="diagnostics" title="Identyfikatory, stany i liczniki; bez tekstu wizyty i bez nagrania." hidden>Kopiuj diagnostykę kart</button>`+
      `<div class="oa-dt-row"><span class="oa-dt-note">Tekst roboczy — jeszcze niewpisany do Kliniki.</span><button type="button" class="oa-dt-toggle oa-dt-plain" data-dt="latest" aria-label="Wróć do końca transkrypcji" title="Wróć do końca tekstu. Włącz podążanie za nową treścią." hidden>Na żywo ↓</button><button type="button" class="oa-dt-toggle oa-dt-plain" data-dt="browser" aria-label="Pokaż okno ChatGPT" title="Przywołaj własną kartę ChatGPT bez zmieniania zapamiętanego położenia i rozmiaru okna." hidden>Pokaż ChatGPT</button></div>`+
      `<button type="button" class="oa-dt-finish" data-dt="finish">Zakończ i sprawdź tekst</button><div class="sr-only" data-dt-live role="status" aria-live="polite"></div>`;
    (document.getElementById('windows')||document.body).append(el);rec.el=el;
    const q=sel=>el.querySelector(sel),on=(name,fn)=>q(`[data-dt="${name}"]`)?.addEventListener('click',fn);
    on('hide',()=>{rec.userHidden=true;followDictation(rec);});
    on('base',()=>{rec.baseOpen=!rec.baseOpen;renderDictation(rec);followDictation(rec);});
    on('details',()=>{rec.details=!rec.details;preferences.dictationDetails=rec.details;savePreferences();renderDictation(rec);followDictation(rec);}); // remembered at once, like rc32
    on('flush',()=>requestFlush(rec,'panel'));on('finish',()=>finishDictation());
    on('latest',()=>{rec.following=true;const s=q('[data-dt-scroll]');s.scrollTop=s.scrollHeight;renderDictation(rec);});
    on('browser',()=>toast('„Pokaż ChatGPT” jest niedostępne w demonstracji: dyktowanie nie otwiera przeglądarki ChatGPT.'));
    on('diagnostics',()=>copyText(JSON.stringify({wersja:VERSION,silnik:rec.engine,tryb:rec.two?'two':'own',karty:Object.fromEntries(['A','B'].map(n=>[n,cardState(rec,n,rec.t)[0]])),fragmenty:rec.fragments.map(f=>({klucz:f.card+f.n,etap:f.stage}))},null,2),q('[data-dt="diagnostics"]')));
    const scroll=q('[data-dt-scroll]');
    scroll.addEventListener('scroll',()=>{const following=scroll.scrollTop>=scroll.scrollHeight-scroll.clientHeight-2;if(following!==rec.following){rec.following=following;renderDictation(rec);}});
    el.addEventListener('keydown',event=>{ // Enter is "Przepisz fragment" wherever the focus is in this panel; Finish keeps its own Enter, the copy button copies
      if(event.key==='Enter'&&rec.chat&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.target.closest?.('[data-dt="finish"],[data-dt="diagnostics"],input,textarea,select')){event.preventDefault();if(!event.repeat)requestFlush(rec,'panel');}
      else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase?.()==='a'){event.preventDefault();selectNode(q('[data-dt-text]'));}
    });
    el.addEventListener('contextmenu',event=>{if(event.target.closest?.('button'))return;event.preventDefault();Shell.menu?.([{label:'Zaznacz wszystko',shortcut:'Ctrl+A',onClick:()=>selectNode(q('[data-dt-text]'))},{label:'Kopiuj dyktowanie',icon:'copy',onClick:()=>copyText(rec.text)}],event.clientX,event.clientY,{className:'oa-menu'+(preferences.theme==='dark'?' oa-theme-dark':'')});});
    el.addEventListener('pointerdown',event=>{ // dragging moves it until the next follow tick anchors it to the field again
      if(event.button!==0||event.target.closest?.('button,[data-dt-scroll],[data-dt-base]'))return;
      const r=el.getBoundingClientRect();rec.drag={id:event.pointerId,dx:event.clientX-r.left,dy:event.clientY-r.top};try{el.setPointerCapture(event.pointerId);}catch(_){}
    });
    el.addEventListener('pointermove',event=>{if(rec.drag?.id===event.pointerId){el.style.left=(event.clientX-rec.drag.dx)+'px';el.style.top=(event.clientY-rec.drag.dy)+'px';}});
    for(const type of ['pointerup','pointercancel'])el.addEventListener(type,event=>{if(rec.drag?.id===event.pointerId)rec.drag=null;});
    rec.follow=setInterval(()=>followDictation(rec),300);rec.onResize=()=>followDictation(rec);window.addEventListener('resize',rec.onResize);
    const editor=window.Shell?.windows?.get?.('clinic-editor')?.el;
    if(editor&&typeof MutationObserver==='function'){rec.observer=new MutationObserver(()=>followDictation(rec));rec.observer.observe(editor,{attributes:true,attributeFilter:['style','class','hidden']});}
  }
  function selectNode(node){if(!node||!window.getSelection||!document.createRange)return;const range=document.createRange();range.selectNodeContents(node);const s=window.getSelection();s.removeAllRanges();s.addRange(range);}
  function orbRect(){return orb.el&&!state.closed&&!orb.soaked?{x:orb.x-64,y:orb.y-64,w:128,h:128}:null;} // WindowManager._orb_rect: the disc with its hover growth
  /* ui/overlay_geometry.place_dictation_overlay and ui/state.place_around_orb / fit_rect. */
  function fitRect(d,work,margin=12){
    margin=Math.min(Math.max(0,margin),Math.max(0,Math.floor((Math.min(work.w,work.h)-1)/2)));
    const w=Math.min(Math.max(1,d.w),Math.max(1,work.w-2*margin)),h=Math.min(Math.max(1,d.h),Math.max(1,work.h-2*margin));
    return {x:Math.max(work.x+margin,Math.min(d.x,work.x+work.w-margin-w)),y:Math.max(work.y+margin,Math.min(d.y,work.y+work.h-margin-h)),w,h};
  }
  const overlaps=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  function placeAroundOrb(desired,work,orbBox,minimum,gap){
    const fit=fitRect(desired,work);if(!orbBox)return fit;
    const ob={x:orbBox.x-gap,y:orbBox.y-gap,w:orbBox.w+2*gap,h:orbBox.h+2*gap};if(!overlaps(fit,ob))return fit;
    const inner=fitRect(work,work),inside=r=>r.x>=inner.x&&r.y>=inner.y&&r.x+r.w<=inner.x+inner.w&&r.y+r.h<=inner.y+inner.h,distance=r=>(r.x-fit.x)**2+(r.y-fit.y)**2;
    let candidates=[[ob.x-fit.w,fit.y],[ob.x+ob.w,fit.y],[fit.x,ob.y-fit.h],[fit.x,ob.y+ob.h]].map(([x,y])=>({x,y,w:fit.w,h:fit.h})).filter(inside);
    if(candidates.length)return candidates.reduce((a,b)=>distance(b)<distance(a)?b:a);
    const minW=Math.min(minimum[0],fit.w),minH=Math.min(minimum[1],fit.h);
    candidates=[{x:inner.x,y:inner.y,w:Math.max(0,ob.x-inner.x),h:inner.h},{x:ob.x+ob.w,y:inner.y,w:Math.max(0,inner.x+inner.w-ob.x-ob.w),h:inner.h},{x:inner.x,y:inner.y,w:inner.w,h:Math.max(0,ob.y-inner.y)},{x:inner.x,y:ob.y+ob.h,w:inner.w,h:Math.max(0,inner.y+inner.h-ob.y-ob.h)}]
      .filter(region=>region.w>=minW&&region.h>=minH).map(region=>fitRect(fit,region,0)).filter(r=>!overlaps(r,ob));
    return candidates.length?candidates.reduce((a,b)=>{const ka=fit.w*fit.h-a.w*a.h,kb=fit.w*fit.h-b.w*b.h;return kb<ka||kb===ka&&distance(b)<distance(a)?b:a;}):fit;
  }
  function placeDictationPanel(anchor,work,orbBox,minimum,preferred=280){ // the field's width and bottom edge, at least 320 × 260, growing upward
    const width=Math.max(anchor.w,minimum[0]),height=Math.max(minimum[1],Math.min(anchor.h,preferred));
    return placeAroundOrb({x:anchor.x,y:anchor.y+anchor.h-height,w:width,h:height},work,orbBox,minimum,12);
  }
  function followDictation(rec){ // _follow_tick / _apply_follow_rect: a missing, minimized or reopened target hides, never retargets
    const el=rec?.el;if(!el)return;
    const win=window.Shell?.windows?.get?.('clinic-editor'),ctx=window.Clinic?.getContext?.();
    const field=win?.visible&&ctx?.session===rec.session?win.el?.querySelector?.(`[data-clinic-field="${rec.key}"]`):null,r=field?.getBoundingClientRect?.();
    if(!r||r.width<120||r.height<40||rec.userHidden){const focused=!el.hidden&&el.contains(document.activeElement);el.hidden=true;if(focused)returnDictationFocus(rec);return;}
    if(rec.drag)return;
    const wasHidden=el.hidden;el.hidden=false;el.style.zIndex=win.el.style?.zIndex||'';el.style.width=Math.max(320,r.width)+'px';el.style.height='auto';
    const body=el.querySelector('.oa-dt-body'),a=workArea(),natural=(el.offsetHeight||0)+Math.max(0,(body?.scrollHeight||0)-(body?.clientHeight||0)); // the body's content beyond its 44 px minimum
    const g=placeDictationPanel({x:r.left,y:r.top,w:r.width,h:r.height},{x:a.left,y:a.top,w:a.right-a.left,h:a.bottom-a.top},orbRect(),[320,Math.max(260,Math.ceil(natural))]);
    Object.assign(el.style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px'});
    if(wasHidden){renderDictation(rec);if(rec.following){const s=el.querySelector('[data-dt-scroll]');if(s)s.scrollTop=s.scrollHeight;}}
    dictationFrames(rec);
  }

  /* DictationSession.view(): one message for the observed state, the most specific first. */
  function dictationMessage(rec){
    const t=rec.t,frags=rec.fragments,pending=frags.filter(f=>f.stage==='transcribing'||f.stage==='stabilizing');
    const key=f=>f.card+f.n,wait=f=>Math.max(0,Math.floor(t-f.since));
    if(rec.cancelled)return 'Anuluję dyktowanie — czekam na zwolnienie zasobów…';
    if(rec.result)return 'Wyniki odebrane — zwalniam karty i przygotowuję tekst do sprawdzenia…';
    if(rec.stopping!=null){
      if(rec.started==null)return 'Kończę przygotowanie — czekam na zwolnienie zasobów…';
      if(!rec.chat)return 'Kończę — odbieram ostatnie słowa i zwalniam zasoby…';
      if(t-rec.stopping<.5)return 'Kończę nagrywanie — zatrzymuję wejścia mikrofonu…'; // dictation_presentation.ending_message
      const closing=frags.filter(f=>['starting','recording'].includes(f.stage)),details=pending.map(f=>f.stage==='stabilizing'?`Tekst ${key(f)} widoczny — sprawdzam stabilność wyniku.`:`Strona przetwarza ${key(f)}: ${wait(f)} s.`);
      if(closing.length)return ['Kończę nagrywanie — zamykam wejście '+closing.map(f=>key(f)+' (kończę nagranie)').join(', ')+'.',...details].join(' ');
      return ['Nagrywanie zakończone.',...(details.length?details:['Odbieram ostatnie teksty i porządkuję karty…'])].join(' ');
    }
    if(!rec.listening)return rec.status;
    if(!rec.chat)return rec.text?'Słucham.':'Słucham — tekst jeszcze nie wrócił.';
    let message=pending.length?`Słucham. Czekam na wyniki wcześniejszych fragmentów: ${pending.length}.`:rec.command?'Słucham — przygotowuję przepisanie fragmentu…':rec.text?'Słucham.':'Słucham — tekst jeszcze nie wrócił.';
    if(rec.command)message=DT_REASONS[rec.command.reason]+(rec.command.phase==='accepted'?' Bieżący fragment nie jest jeszcze zamykany.':'');
    const longest=pending.slice().sort((a,b)=>a.since-b.since)[0];
    if(longest){const live=['A','B'].filter(n=>cardState(rec,n,t)[0]==='recording');message=(live.length?'Nagrywam dalej w '+live.join('/')+'. ':'')+(longest.stage==='stabilizing'?`Tekst ${key(longest)} widoczny; sprawdzam stabilność wyniku.`:`Strona sygnalizuje przetwarzanie ${key(longest)}; czekam na wynik: ${wait(longest)} s.`);} // result_wait_message wins
    return message;
  }
  function renderDictation(rec){
    const el=rec?.el;if(!el)return;const q=sel=>el.querySelector(sel),set=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
    const message=dictationMessage(rec),listening=rec.listening&&!rec.cancelled,stopping=rec.stopping!=null||rec.cancelled;
    set(q('[data-dt-target]'),'Dyktowanie do: '+rec.label);
    const status=q('[data-dt-status]');set(status,message);status.title=message;
    const plain=message.replace(/\d+(?:,\d+)? s\b/g,''); // counters tick every second; announce the stage, not each second
    if(plain!==rec.announced){rec.announced=plain;set(q('[data-dt-live]'),message);}
    q('[data-dt-indicator]').classList.toggle('on',listening);
    const meter=q('[data-dt-meter]'),shown=!rec.chat&&listening&&rec.level!=null;meter.hidden=!shown;
    if(shown){const db=rec.level>0?20*Math.log10(rec.level):-60,value=Math.round(Math.max(0,Math.min(1,(db+60)/54))*100);meter.firstElementChild&&(meter.firstElementChild.style.width=value+'%');meter.setAttribute('aria-valuenow',String(value));meter.title=rec.level>DT_QUIET?'Mikrofon odbiera dźwięk':'Mikrofon: cisza';} // dBFS −60…−6 for readability only
    const baseToggle=q('[data-dt="base"]'),baseBox=q('[data-dt-base]');baseToggle.hidden=!rec.base;baseToggle.setAttribute('aria-expanded',String(rec.baseOpen&&!!rec.base));baseBox.hidden=!(rec.baseOpen&&rec.base);set(baseBox,rec.base);
    if(rec.text!==rec.shown){ // StreamTextEdit: each snapshot at once, only its newest characters briefly emphasized
      const span=q('[data-dt-text]'),old=rec.shown;rec.shown=rec.text;
      span.innerHTML=old&&rec.text.startsWith(old)&&!orbReduced()?esc(old)+`<span class="oa-dt-fresh">${esc(rec.text.slice(old.length))}</span>`:!old&&rec.text&&!orbReduced()?`<span class="oa-dt-fresh">${esc(rec.text)}</span>`:esc(rec.text);
      const added=rec.text.startsWith(rec.said)?rec.text.slice(rec.said.length).trim():rec.text;if(added&&(rec.chat||/[.!?]$/.test(added))){rec.said=rec.text;set(q('[data-dt-live]'),added);}
    }
    const placeholder=q('[data-dt-placeholder]');placeholder.hidden=!!(rec.text||rec.wave.cols.length);set(placeholder,rec.text?'':message);
    const flush=q('[data-dt="flush"]');flush.hidden=!rec.chat;
    if(rec.chat){
      const waiting=['A','B'].some(n=>['transcribing','stabilizing_result'].includes(cardState(rec,n,rec.t)[0]));
      const labels=stopping?['Kończę dyktowanie…','Kończę…']:rec.command?['Przepisanie przyjęte…','Przyjęto…']:waiting?['Czekam na wynik fragmentu…','Czekam na wynik…']:['Przepisz fragment ↵','Przepisz ↵','↵'];
      const narrow=(q('.oa-dt-stream')?.clientWidth||400)<250;set(flush,labels[narrow?1:0]);flush.setAttribute('aria-label',labels[0]);
      flush.title=stopping?'Kończę przechwytywanie i odbieram rozpoczęte wyniki.':rec.command?'Żądanie jest zachowane. Stan jego wykonania jest pokazany nad tekstem; nie trzeba ponawiać Entera.':'Przepisz fragment i kontynuuj dyktowanie zgodnie z wybranym trybem.';
      flush.disabled=!(listening&&!rec.command);
    }
    const cards=rec.chat&&rec.started!=null,details=q('[data-dt="details"]');set(details,'Szczegóły dyktowania — mikrofon'+(cards?' i karty A/B':''));details.setAttribute('aria-expanded',String(rec.details));
    const counts=cards?['A','B'].map(n=>`${n}: ${rec.fragments.filter(f=>f.card===n&&f.stage!=='queued').length}`).join(' · '):'',received=rec.fragments.filter(f=>f.stage==='done').length;
    const summary=q('[data-dt-summary]');set(summary,counts?'Przydziały kart — '+counts+(received?'   |   Wyniki — tekst: '+received:''):'');summary.hidden=!(rec.details&&counts);
    q('[data-dt-timeline]').hidden=!rec.details;q('[data-dt="diagnostics"]').hidden=!(rec.details&&cards);
    q('[data-dt="browser"]').hidden=!rec.chat;q('[data-dt="latest"]').hidden=rec.following;
    const finish=q('[data-dt="finish"]');finish.disabled=stopping;set(finish,rec.cancelled?'Anuluję…':rec.stopping!=null?'Kończę — czekam na wynik…':'Zakończ i sprawdź tekst');
    if(rec.following){const s=q('[data-dt-scroll]');if(s&&s.scrollHeight)s.scrollTop=s.scrollHeight;}
    dictationFrames(rec);
  }
  /* Canvases: the wave at the end of the text and the detailed timeline, repainted while visible (CardTimeline.FRAME_MS 50). */
  function dictationFrames(rec){
    if(!rec?.el||rec.el.hidden||rec.frame)return;
    rec.frame=requestAnimationFrame(now=>{rec.frame=0;if(!rec.el||rec.el.hidden)return;
      if(now-(rec.painted||0)>=45){rec.painted=now;const t=rec.t+Math.min(DT_STEP,Math.max(0,(performance.now()-rec.at)/1000));drawDictationWave(rec,now);if(rec.details)drawDictationTimeline(rec,t,now);}
      if(state.recording===rec||rec.cancelled)dictationFrames(rec);});
  }
  const dtAccent=()=>themeName()==='dark'?'#85dec2':'#147a62'; // StreamTextEdit._accent
  function canvasFor(canvas,width,height){ // a crisp 2D context of the CSS size; null where canvases are unavailable
    const ctx=canvas?.getContext?.('2d');if(!ctx)return null;const dpr=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);return ctx;
  }
  function drawDictationWave(rec,now){ // TranscriptionTextEdit.paintEvent: rows of 4 px columns from the end of the text
    const el=rec.el,box=el.querySelector('.oa-dt-text'),end=el.querySelector('[data-dt-end]'),canvas=el.querySelector('[data-dt-wave]');if(!box||!end||!canvas)return;
    const cols=rec.wave.cols,b=box.getBoundingClientRect(),e=end.getBoundingClientRect(),rowH=21,left=0,right=Math.max(4,b.width-3);
    const x0=rec.text?e.left-b.left+5:left,top0=rec.text?e.top-b.top+(e.height-rowH)/2:0,first=Math.max(0,Math.floor((right-x0)/4)),full=Math.max(1,Math.floor((right-left)/4));
    const rows=cols.length?1+Math.ceil(Math.max(0,cols.length-first)/full):0;box.style.paddingBottom=Math.max(0,rows-1)*rowH+'px';
    const ctx=canvasFor(canvas,b.width,Math.max(b.height,top0+rows*rowH));if(!ctx||!cols.length)return;
    const accent=hexRgb(dtAccent()),ink=`rgba(${accent},.75)`,fill=`rgba(${accent},.28)`;let index=0,lastRect=null;
    for(let row=0;row<rows&&index<cols.length;row++){
      const x=row?left:x0,y=top0+row*rowH,count=Math.min(cols.length-index,row?full:first);if(!count)continue;
      const center=y+rowH/2,max=rowH*.4,half=level=>level<=DT_QUIET?.5:Math.max(.5,max*Math.min(1,(level/.18)**.55)),slice=cols.slice(index,index+count);index+=count;
      ctx.beginPath();ctx.moveTo(x,center);slice.forEach(([level],i)=>ctx.lineTo(x+(i+.5)*4,center-half(level)));ctx.lineTo(x+count*4,center);
      for(let i=slice.length-1;i>=0;i--)ctx.lineTo(x+(i+.5)*4,center+half(slice[i][0]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1.1;ctx.stroke();lastRect={x:x+count*4,center};
    }
    const live=rec.listening&&!rec.cancelled||rec.stopping!=null&&!rec.result;
    if(lastRect&&live){const pulse=orbReduced()?1:.83+.13*Math.sin(now/1000*Math.PI*2*.8);ctx.fillStyle=`rgba(${accent},${Math.max(.2,Math.min(1,(pulse-.5)*1.7)).toFixed(3)})`;ctx.beginPath();ctx.arc(lastRect.x-1.5,lastRect.center,1.8,0,Math.PI*2);ctx.fill();}
  }
  function cardColors(accent){ // CardTimeline.card_colors: A in the accent's hue, B a third of the colour wheel further
    const [r,g,b]=hexRgb(accent).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min,s=d?d/(1-Math.abs(2*l-1)):0,h=(d?max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4:0)/6;
    const tone=hue=>{const S=Math.max(.45,s),L=Math.min(.6,Math.max(.4,l)),c=(1-Math.abs(2*L-1))*S,x=c*(1-Math.abs((hue*6)%2-1)),m=L-c/2,k=Math.floor(hue*6)%6;return rgbHex([[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][k].map(v=>(v+m)*255));};
    return {A:tone(h),B:tone((h+1/3)%1)};
  }
  function drawDictationTimeline(rec,now){ // CardTimeline: microphone now, then each card's recorder input; the last 20 s, now on the right
    const canvas=rec.el.querySelector('[data-dt-timeline]'),width=Math.floor((rec.el.clientWidth||0)-24),cards=rec.chat&&rec.started!=null?['A','B']:[];if(width<=0)return;
    const height=38+cards.length*32+12+3,ctx=canvasFor(canvas,width,height);if(!ctx)return;
    const css=window.getComputedStyle?.(rec.el)||{getPropertyValue:()=>''},ink=css.getPropertyValue('--oa-ink').trim()||'#222a36',muted=css.getPropertyValue('--oa-muted').trim()||'#5e6878',line=css.getPropertyValue('--oa-line').trim()||'#ccd4df',accent=css.getPropertyValue('--oa-accent').trim()||'#2563eb';
    const colors=cardColors(/^#[\da-f]{6}$/i.test(accent)?accent:'#2563eb'),mic='#63a998',area={x:164,y:1,w:Math.max(1,width-167),h:38+cards.length*32},X=at=>area.x+area.w-(now-at)*area.w/20;
    ctx.font='9px "Segoe UI",Selawik,Arial,sans-serif';ctx.textBaseline='middle';
    for(const s of [5,10,15]){const x=area.x+area.w-s*area.w/20;ctx.strokeStyle=line;ctx.globalAlpha=.55;ctx.setLineDash([1,2]);ctx.beginPath();ctx.moveTo(x,area.y);ctx.lineTo(x,area.y+area.h);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=muted;ctx.textAlign='center';ctx.fillText(`−${s} s`,x,area.y+area.h+7);}
    ctx.textAlign='right';ctx.fillStyle=muted;ctx.fillText('teraz',area.x+area.w,area.y+area.h+7);
    const elide=(text,max)=>{if(ctx.measureText(text).width<=max)return text;let s=text;while(s&&ctx.measureText(s+'…').width>max)s=s.slice(0,-1);return s+'…';}; // Qt.ElideRight
    const caption=(title,detail,y,color)=>{ctx.save();ctx.beginPath();ctx.rect(32,y,126,30);ctx.clip();ctx.textAlign='left';ctx.font='10px "Segoe UI",Selawik,Arial,sans-serif';ctx.fillStyle=color;ctx.fillText(elide(title,124),33,y+8);ctx.font='9px "Segoe UI",Selawik,Arial,sans-serif';ctx.fillStyle=muted;ctx.fillText(elide(detail,124),33,y+23);ctx.restore();};
    const envelope=(samples,y,h,color,alpha=.30)=>{ // runs break at gaps over 0.2 s (unmeasured time is not silence)
      const center=y+h/2,max=h*.36,half=level=>level<=DT_QUIET?.5:Math.max(.5,max*Math.min(1,(level/.18)**.55)),runs=[];let run=[];
      for(const p of samples){if(run.length&&p[0]-run.at(-1)[0]>.2){runs.push(run);run=[];}run.push(p);}if(run.length)runs.push(run);
      const rgb=hexRgb(color);ctx.fillStyle=`rgba(${rgb},${alpha})`;ctx.strokeStyle=`rgba(${rgb},.85)`;ctx.lineWidth=1;
      for(const r of runs){ctx.beginPath();ctx.moveTo(X(r[0][0]),center);r.forEach(([at,level])=>ctx.lineTo(X(at),center-half(level)));ctx.lineTo(X(r.at(-1)[0]),center);for(let i=r.length-1;i>=0;i--)ctx.lineTo(X(r[i][0]),center+half(r[i][1]));ctx.closePath();ctx.fill();ctx.stroke();}
    };
    const visible=rec.audio.filter(([at])=>at>=now-21),lastAt=rec.audio.at(-1)?.[0];
    caption('Mikrofon — teraz',!rec.audio.length?(rec.listening?'brak pomiarów':'brak nagrania'):!rec.listening?'pomiar zakończony':`pomiar: ${Math.max(0,now-lastAt).toFixed(1).replace('.',',')} s temu`,area.y,mic);
    ctx.save();ctx.beginPath();ctx.rect(area.x,area.y+2,area.w,34);ctx.clip();envelope(visible,area.y,38,mic);ctx.restore();
    const marks={starting:'◌',recording:'●',draining:'…',transcribing:'…',stabilizing_result:'…',done:'✓'},labels={idle:'czeka',starting:'uruchamia mikrofon',recording:'nagrywa',draining:'kończy opóźnione audio',transcribing:'strona przetwarza',stabilizing_result:'sprawdza tekst',done:'tekst odebrany'};
    cards.forEach((name,row)=>{
      const y=area.y+38+row*32,color=colors[name],[stateName,current]=cardState(rec,name,now),rgb=hexRgb(color);
      ctx.fillStyle=`rgba(${rgb},.22)`;ctx.beginPath();ctx.roundRect?.(2,y+2,14,28,3);ctx.fill();ctx.font='bold 9px "Segoe UI",Selawik,Arial,sans-serif';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(name,9,y+16);
      const mark=marks[stateName];if(mark){ctx.font='9px "Segoe UI",Selawik,Arial,sans-serif';ctx.fillStyle=stateName==='recording'?`rgba(209,36,47,${orbReduced()?1:(.55+.45*Math.abs(((now*1.6)%2)-1)).toFixed(2)})`:muted;ctx.fillText(mark,23,y+16);}
      const playing=current&&['starting','recording'].includes(current.stage)&&!rec.two,detail=playing?(current.stage==='starting'?`fragment ${current.n}: uruchamia nagrywanie`:`fragment ${current.n}, ${Math.max(0,now-Math.min(now-current.lag,current.end??Infinity)).toFixed(1).replace('.',',')} s później`)
        :current&&['transcribing','stabilizing'].includes(current.stage)?`${labels[stateName]}: ${Math.max(0,Math.floor(now-current.since))} s`:stateName==='recording'?'bez dodanego opóźnienia':labels[stateName];
      caption('Wejście rejestratora',detail,y,color);
      ctx.save();ctx.beginPath();ctx.rect(area.x,y+1,area.w,30);ctx.clip();
      for(const f of rec.fragments.filter(x=>x.card===name&&!['queued','discarded'].includes(x.stage))){
        const until=['starting','recording'].includes(f.stage)?Math.min(f.end??Infinity,now-f.lag):f.end,samples=rec.audio.filter(([at])=>at>=f.start&&at<=until&&at>=now-21);
        if(rec.clip&&f.stage!=='starting'){const a=X(f.start),z=Math.min(X(f.start+.9),X(until));if(z>a){ctx.fillStyle=`rgba(${rgb},.10)`;ctx.fillRect(a,y+2,z-a,28);}} // the language clip before each fragment
        envelope(samples,y,32,color);
        const x=samples.length?X(samples.at(-1)[0]):null;if(x==null)continue;
        ctx.textAlign='left';
        if(f.stage==='recording'){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y+16,2.2,0,Math.PI*2);ctx.fill();if(f.end!=null&&!rec.two){ctx.fillStyle=muted;ctx.fillText(area.x+area.w-x-6>ctx.measureText('końcówka audio…').width?'końcówka audio…':'…',x+5,y+16);}} // the live tip; after the cut it plays the delayed end
        else{ctx.strokeStyle=/^#[\da-f]{6}$/i.test(ink)?`rgba(${hexRgb(ink)},.7)`:ink;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,y+2);ctx.lineTo(x,y+30);ctx.stroke();ctx.fillStyle=f.stage==='done'?color:muted;const text=f.stage==='done'?'✓':f.stage==='transcribing'?'strona przetwarza…':'…';ctx.fillText(area.x+area.w-x-3>ctx.measureText(text).width?text:'…',x+3,y+16);}
      }
      ctx.restore();
    });
  }

  /* Konfiguracja → Dyktowanie: ConfigDialog._build_transcription_section with the engine panels it shows
   * (_on_transcriber_backend_changed). Controls that need a key, an installation or a recording work in
   * the application; here they are disabled and say so. */
  function dictationSettings(area,draft){
    const engine=DT_ENGINES[draft.transcriber]?draft.transcriber:'gemini',strategy=DT_STRATEGY[draft.cardMode]||DT_STRATEGY.own,inApp=' — w aplikacji';
    const options=(map,current)=>Object.entries(map).map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
    const select=(key,map,label,extra='')=>`<select data-setting="${key}" aria-label="${esc(label)}" ${extra}>${options(map,draft[key])}</select>`;
    const toggle=(key,label,title='')=>`<label class="oa-switch-row" ${title?`title="${esc(title)}"`:''}><input type="checkbox" data-setting="${key}" ${draft[key]?'checked':''}><div>${label}</div></label>`;
    const off=(label,title,kind='')=>`<button type="button" class="oa-btn ${kind}" disabled title="${esc(title+inApp)}"><span>${label}</span></button>`;
    const gemini=`<div class="oa-dt-engine" data-dt-engine="gemini">${formRow('Tryb Gemini:',select('geminiMode',{transcribe:'Dedykowana transkrypcja — zalecana',agent:'Gemini Live — wejście agenta'},'Tryb dyktowania Gemini'))}<p class="oa-form-help" data-dt-gemini-hint>${esc(draft.geminiMode==='agent'?'Zapisuje mowę rozpoznaną przez model Gemini Live. Korzysta z modelu audio agenta; preferuje język polski.':'Pokazuje tekst podczas mówienia i dopracowuje go po wypowiedzi. Wymaga dostępu do Gemini Transcribe Live; preferuje język polski.')}</p>`+
      formRow('Klucz Gemini:',`<span class="oa-dt-key"><input type="password" placeholder="Wklej klucz API lub skonfiguruj z Google" aria-label="Wspólny klucz API Gemini" title="Ten sam klucz Gemini jest dostępny również w ustawieniach generowania. Zmiany zapisujesz przyciskiem Zapisz w konfiguracji." disabled>${off('Pokaż','Pokaż klucz API Gemini')}</span>`)+
      `<p class="oa-form-help">Brak klucza Gemini. Wklej go lub skonfiguruj z Google.<br>W demonstracji klucz nie jest potrzebny: dyktowanie odtwarza przykład bez łączenia z Gemini.</p><div class="oa-inline-controls">${off('Skonfiguruj z Google','Zaloguj się do Google i przygotuj klucz API do dyktowania Gemini.')}${off('Sprawdź dyktowanie','Sprawdza połączenie i dostęp do wybranego trybu. Nie używa mikrofonu.','primary')}</div><p class="oa-form-help">Połączenie niesprawdzone. Test nie używa mikrofonu.</p>`+
      `<label class="oa-switch-row" title="Wyłączenie tej zgody przywraca pytanie przed kolejnym nagraniem. Tekst nadal sprawdzasz przed wpisaniem do Kliniki."><input type="checkbox" data-setting="dictationConsent" ${draft.dictationConsent?'checked':''}><div>Zezwalaj na wysyłanie audio do Gemini bez pytania</div></label></div>`;
    const chatgpt=`<div class="oa-dt-engine" data-dt-engine="chatgpt_browser"><p class="oa-dt-info">Dyktowanie korzysta z zalogowanego ChatGPT w przeglądarce OpisAI. Nagranie trafia do ChatGPT; klucz API nie jest potrzebny. ChatGPT przechowuje nagrania dyktowania na koncie przez 30 dni i nie pozwala ich usunąć — przy wrażliwych wizytach dyktuj lokalnym Whisperem. Dostępność zależy od Twojego konta. Przy pierwszym nagraniu przeglądarka może poprosić o dostęp do mikrofonu. Tekst pojawi się w podglądzie, gdy udostępni go ChatGPT — możliwe, że dopiero po zakończeniu nagrania. Przytrzymaj bąbelek ponownie, aby zakończyć i sprawdzić tekst. Możesz wrócić do poprzedniego silnika w tym samym miejscu.</p>`+
      toggle('chatgptClip','Podpowiadaj ChatGPT język polski','Wstęp i zakończenie: „To jest język polski.” w tym samym strumieniu karty, bez dźwięku w głośnikach i bez zmiany urządzenia. Przed końcową wstawką do rejestratora dociera opóźniona końcówka Twojej mowy. Rozpoznane znane frazy są oddzielane od tekstu; przy niepewności pozostaje wariant do sprawdzenia. Eksperyment — nie gwarantuje polskiego wyniku. Wstawka końcowa wydłuża każde zakończenie o około 2 sekundy. Gdy nagrywa OpisAI, wstęp poprzedza każdy fragment (bez wstawki końcowej) i wydłuża jego przepisanie o około 2 sekundy.')+
      formRow('Tryb kart:',select('cardMode',{own:DT_STRATEGY.own[0],two:DT_STRATEGY.two[0]},'Tryb pracy kart — jeden wybór dla następnego dyktowania','title="Wybierz jeden tryb. Zapis dotyczy następnego dyktowania, nie zmienia trwającego nagrania."'))+
      `<p class="oa-dt-info" data-dt-strategy-summary>${esc(strategy[1])}</p><button type="button" class="oa-dt-toggle oa-dt-howto" data-dt-howto aria-expanded="false">Jak działa ten tryb</button><p class="oa-dt-info" data-dt-strategy-details hidden>${esc(strategy[2])}</p>`+
      `<div class="oa-dt-auto"><label class="oa-dt-check" data-dt-auto-title title="${esc(strategy[4])}"><input type="checkbox" data-setting="autoEnter" ${draft.autoEnter?'checked':''}><span>Autoenter</span></label><span data-dt-interval>${esc(strategy[3])}</span><span class="oa-number"><input type="number" data-setting="autoEnterSeconds" min="5" max="600" step="1" value="${draft.autoEnterSeconds}" aria-label="${esc(strategy[3].replace(':',''))}" title="${esc(strategy[4])}" ${draft.autoEnter?'':'disabled'}><span>s</span></span></div></div>`;
    const hw=draft.whisperHardware,nvidia=hw==='nvidia_external'||hw==='nvidia_internal',cpp=hw==='integrated'||hw==='cpu'; // "Automatycznie" shows neither panel until the hardware is known
    const cppStatus=model=>`⬇ Silnik whisper.cpp — OpisAI przygotuje go przy pierwszym dyktowaniu\n⬇ Model mowy ${model} — pobierze się przy pierwszym dyktowaniu (${({'large-v3':'2,9 GB','large-v3-turbo':'1,5 GB',medium:'1,4 GB',small:'0,5 GB'})[model]||''})`;
    const whisper=`<div class="oa-dt-engine" data-dt-engine="local_whisper">${formRow('Liczy na:',select('whisperHardware',{auto:'Automatycznie (najlepszy dostępny)',nvidia_external:'Karta NVIDIA RTX — zewnętrzna (np. AORUS AI BOX)',nvidia_internal:'Karta NVIDIA RTX — wewnętrzna',integrated:'Karta wbudowana (AMD Radeon / Intel)',cpu:'Procesor'},'Liczy na','title="Automatycznie: najmocniejszy dostępny sprzęt (karta NVIDIA zewnętrzna, potem wewnętrzna, potem wbudowana, na końcu procesor). Wybór konkretnej karty jest ścisły: gdy jej nie ma, OpisAI powie o tym, zamiast po cichu liczyć na czymś innym."'))}`+
      formRow('Model:',select('whisperModel',{'large-v3':'large-v3','large-v3-turbo':'large-v3-turbo',medium:'medium',small:'small'},'Model','title="large-v3 = najlepsza jakość polskiego (zalecane). turbo = szybszy, ciut gorszy. medium/small = lżejsze, słabsze na terminologii."'))+
      `<p class="oa-dt-hint">🖥 W demonstracji sprzęt nie jest wykrywany; lokalny Whisper liczy w aplikacji na tym komputerze.</p>`+
      `<div data-dt-cpp ${cpp?'':'hidden'}><p class="oa-dt-info" data-dt-cpp-status>${esc(cppStatus(draft.whisperModel))}</p><div class="oa-inline-controls">${off('⬇ Przygotuj teraz','Rozkłada dołączony silnik whisper.cpp i pobiera wybrany model mowy (oficjalne pliki, sprawdzana suma kontrolna) do folderu OpisAI. Bez tego zrobi się to samo przy pierwszym dyktowaniu.')}</div></div>`+
      `<div data-dt-nvidia ${nvidia?'':'hidden'}><div class="oa-inline-controls">${off('🚀 Skonfiguruj automatycznie','Robi wszystko, co automatyzowalne: sprawdza GPU, instaluje PyTorch (CUDA 12.8) + RealtimeSTT, weryfikuje że PyTorch widzi kartę. Model dociągnie się sam przy pierwszym dyktowaniu. Jeśli GPU nie jest widoczne — pokaże JEDEN ręczny krok (sterownik/Thunderbolt) jako link.')}</div><p class="oa-form-help">Jeden przycisk przeprowadza całość automatycznie (GPU → biblioteki → weryfikacja). Sterownika NVIDIA / GIGABYTE Control Center / autoryzacji Thunderbolt nie da się zrobić w tle (admin + restart) — jeśli GPU nie jest widoczne, dostaniesz jeden link do kliknięcia i wracasz tu. Ustawienia zaawansowane (compute_type, język, initial_prompt) są przechowywane w SQLite.</p></div>`+
      `<h3 class="oa-dt-subhead">Rozpoznawanie mówców</h3><p class="oa-dt-info">Oznacza w transkrypcie, kto mówi — na podstawie Twojego profilu głosu (Ty = pierwsza etykieta, pozostałe osoby = druga). Wypowiedzi niepewne zostają bez etykiety. Audio nie opuszcza komputera.</p>`+
      toggle('diarization','Oznaczaj mówców w transkrypcie','Wymaga: biblioteki pyannote, modeli diaryzacji i profilu głosu (lista niżej). Gdy czegoś brakuje, dyktowanie działa normalnie — po prostu bez etykiet (dostaniesz komunikat).')+
      toggle('diarizationOverlay','Podgląd rozmowy przy dyktowaniu (dymki jak w komunikatorze)','Podczas dyktowania z rozpoznawaniem mówców przykrywa pole „Badanie kliniczne” widokiem-czatem: Ty po prawej, rozmówca po lewej, a gdy ktoś właśnie mówi — dymek z trzema kropkami. Czysty podgląd: pod spodem tekst normalnie trafia do pola, a po dyktowaniu podgląd znika i odsłania zapis.')+
      formRow('Etykieta — Ty:',`<input type="text" data-setting="labelDoctor" maxlength="24" placeholder="Lekarz" value="${esc(draft.labelDoctor)}">`)+formRow('Etykieta — rozmówca:',`<input type="text" data-setting="labelOther" maxlength="24" placeholder="Właściciel" value="${esc(draft.labelOther)}">`)+
      `<p class="oa-dt-info">⬇ Biblioteki rozpoznawania mówców — do pobrania<br>⬇ Modele głosu — do pobrania<br>Profil głosu — jeszcze nie nagrany<br>Aby nagrać profil, kliknij „Pobierz brakujące składniki”.</p><div class="oa-inline-controls">${off('Pobierz brakujące składniki','Pobiera biblioteki i modele potrzebne do nagrania profilu głosu. Pierwsze przygotowanie może potrwać kilka minut.')}</div><div class="oa-inline-controls" style="margin-top:8px">${off('🎤 Nagraj profil głosu…','Aby nagrać profil, kliknij „Pobierz brakujące składniki”.')}${off('📥 Importuj profil…','Wybierz wcześniej wyeksportowany profil głosu w pliku JSON.')}</div></div>`;
    area.innerHTML=`<div class="oa-dt-settings"><fieldset class="oa-group"><legend>Dyktowanie</legend><p class="oa-dt-info">Przytrzymaj bąbelek, aby dyktować. Silnik mowy wybierasz niezależnie od generatora opisu — możesz łączyć ChatGPT z dyktowaniem Gemini.</p>${formRow('Silnik:',select('transcriber',DT_ENGINES,'Silnik'))}<p class="oa-dt-info oa-dt-scope" data-dt-scope></p>${{gemini,chatgpt_browser:chatgpt,local_whisper:whisper}[engine]}</fieldset>`+
      `<div style="margin-top:16px">${notice('W demonstracji dyktowanie odtwarza zapisany przykład: mikrofon, przeglądarka ChatGPT, klucz Gemini ani lokalny model nie są używane. Wybór silnika zmienia przebieg i panel dyktowania tak jak w aplikacji.')}</div></div>`;
    const root=area.querySelector('.oa-dt-settings'),q=sel=>root.querySelector(sel);
    const scope=()=>{ // dictation_strategy.scope_message: the form, never the mode of a running recording
      const dirty=['transcriber','chatgptClip','cardMode','autoEnter','autoEnterSeconds','geminiMode','dictationConsent','whisperHardware','whisperModel','diarization','diarizationOverlay','labelDoctor','labelOther'].some(key=>draft[key]!==preferences[key]);
      q('[data-dt-scope]').textContent=(dirty?'Niezapisane zmiany w konfiguracji — kliknij „Zapisz”, aby je zachować.':'Ustawienia dla następnego dyktowania.')+'\nZmiana silnika, trybu kart, klipu i Autoenter nie przełącza trwającego nagrania.';
    };
    scope();
    q('[data-dt-howto]')?.addEventListener('click',event=>{const open=event.currentTarget.getAttribute('aria-expanded')!=='true';event.currentTarget.setAttribute('aria-expanded',String(open));q('[data-dt-strategy-details]').hidden=!open;});
    root.addEventListener('change',event=>{ // after the shared [data-setting] handler has updated the draft
      const key=event.target?.dataset?.setting;
      if(key==='autoEnterSeconds'){const s=Math.round(Number(event.target.value));draft.autoEnterSeconds=s>=5&&s<=600?s:10;event.target.value=draft.autoEnterSeconds;} // whole seconds 5–600, otherwise 10
      if(key==='autoEnter'){const spin=q('[data-setting="autoEnterSeconds"]');if(spin)spin.disabled=!event.target.checked;}
      if(key==='cardMode'){const copy=DT_STRATEGY[draft.cardMode]||DT_STRATEGY.own;q('[data-dt-strategy-summary]').textContent=copy[1];q('[data-dt-strategy-details]').textContent=copy[2];q('[data-dt-interval]').textContent=copy[3];q('[data-dt-auto-title]').title=copy[4];const spin=q('[data-setting="autoEnterSeconds"]');if(spin){spin.title=copy[4];spin.setAttribute('aria-label',copy[3].replace(':',''));}}
      if(key==='geminiMode')q('[data-dt-gemini-hint]').textContent=draft.geminiMode==='agent'?'Zapisuje mowę rozpoznaną przez model Gemini Live. Korzysta z modelu audio agenta; preferuje język polski.':'Pokazuje tekst podczas mówienia i dopracowuje go po wypowiedzi. Wymaga dostępu do Gemini Transcribe Live; preferuje język polski.';
      if(key==='whisperHardware'||key==='whisperModel'){const h=draft.whisperHardware;q('[data-dt-cpp]').hidden=!(h==='integrated'||h==='cpu');q('[data-dt-nvidia]').hidden=!(h==='nvidia_external'||h==='nvidia_internal');q('[data-dt-cpp-status]').textContent=cppStatus(draft.whisperModel);}
      if(root.isConnected)scope();
    });
  }

  /* Konfiguracja (ConfigDialog): the rc32 pages, search keywords and save rule. One page at a time: "Zapisz" is active
   * only with changes and saves the page without closing; another page, "Zamknij", × or Esc discard what was not saved
   * (_set_dirty, _on_tab_changed, reject). Controls that need Windows, a browser login, a key or a download are shown
   * as in the application and say that they work there. */
  const settingsNav=[
    ['GENEROWANIE'],['Połączenie i model','connection','send','klucz api token provider model gemini claude chatgpt edge transport autoryzacja'],['Sekcje opisu','sections','document','sekcje prompt pola epikryza wywiad badanie rozpoznanie polerka'],
    ['WEJŚCIE'],['Dyktowanie','dictation','mic','transkrypcja whisper gemini live mikrofon gpu glos nagrywanie mowcy diaryzacja profil glosu rozpoznawanie mowcow etykiety'],['Odczyt pola (Klinika)','fields','clinic','odczyt diagnoza pole klinika'],
    ['INTERFEJS'],['Wygląd','appearance','eye','motyw ciemny jasny tryb kolory wyglad theme dark light auto okna'],['Bąbelek','bubble','opisai','bounce odbijanie idle pasek zadan'],['Historia','history','history','historia retencja zapis generowan'],
    ['ZAAWANSOWANE'],['System','system','settings','skrot pulpit hash integralnosc system'],['Zgodność AI (RODO)','privacy','shield','rodo ai act zgodnosc matryca compliance']
  ];
  const PAGE_KEYS={connection:['provider','transport','auth','model'],dictation:['transcriber','chatgptClip','cardMode','autoEnter','autoEnterSeconds','geminiMode','dictationConsent','whisperHardware','whisperModel','diarization','diarizationOverlay','labelDoctor','labelOther'],appearance:['theme'],bubble:['idleBounce','bounceInterval','bounceMax'],history:['history']}; // what "Zapisz" stores from each page
  const formRow=(label,control)=>`<div class="oa-form-row"><label>${label}</label>${control}</div>`;
  const IN_APP=' — w aplikacji';
  const cfgButton=(label,action,title,kind='')=>`<button type="button" class="oa-btn ${kind}" data-cfg="${action}" title="${esc(title)}"><span>${label}</span></button>`;
  const offButton=(label,title,kind='')=>`<button type="button" class="oa-btn ${kind}" disabled title="${esc(title+IN_APP)}"><span>${label}</span></button>`;
  const lockedSwitch=(label,title,on)=>`<label class="oa-switch-row oa-cfg-locked" title="${esc(title)}"><input type="checkbox" ${on?'checked':''} disabled><div>${label}</div></label>`;
  const cfgHint=html=>`<p class="oa-cfg-hint">${html}</p>`; // _style_hint
  let settingsToast=null;
  const demoOnly=text=>{settingsToast?.remove?.();settingsToast=toast(text);}; // each replaces the last
  const HW_LLM={auto:'Automatycznie (najlepszy dostępny)',nvidia_external:'Karta NVIDIA RTX — zewnętrzna (np. AORUS AI BOX)',nvidia_internal:'Karta NVIDIA RTX — wewnętrzna',integrated:'Karta wbudowana (AMD Radeon / Intel)'}; // hardware.LLM_CHOICES
  function settings(initial='connection'){
    if(typeof initial!=='string'||!settingsNav.some(n=>n[1]===initial))initial='connection';
    let page=initial,draft=clone(preferences);
    const html=`<div class="oa-app oa-cfg"><div class="oa-settings-layout"><aside class="oa-settings-nav"><input class="oa-settings-search" type="search" placeholder="Szukaj ustawienia…" aria-label="Szukaj ustawienia"><nav aria-label="Sekcje konfiguracji">${settingsNav.map(([label,id,ic])=>id?`<button type="button" class="oa-nav-item" data-page="${id}">${icon(ic,16)}<span>${label}</span></button>`:`<div class="oa-nav-group">${label}</div>`).join('')}</nav></aside><section class="oa-settings-page" data-settings-page></section></div><footer class="oa-footer oa-cfg-foot"><span class="oa-cfg-folder"><small>Konfig:</small>${button('Otwórz folder','config-folder','','','title="Folder z plikiem konfiguracji OpisAI (opisai.sqlite3)"')}</span><span class="oa-pg-gap"></span><span class="sr-only" role="status" data-cfg-status></span>${button('Zapisz','save-settings','primary','','disabled title="Zapisz zmiany z TEJ karty (nie zamyka okna). Aktywny tylko gdy sa niezapisane zmiany; przelaczenie karty je odrzuca."')}${button('Zamknij','close-settings','','','title="Zamknij okno konfiguracji. Niezapisane zmiany z bieżącej karty zostaną odrzucone."')}</footer></div>`;
    const win=makeWindow('opisai-settings',`OpisAI ${VERSION} — konfiguracja`,880,700,html,()=>{themePreview=null;});const root=win.content;escapeCloses(win);
    const saveButton=$('[data-action="save-settings"]',root),status=$('[data-cfg-status]',root);
    const dirty=()=>(PAGE_KEYS[page]||[]).some(key=>JSON.stringify(draft[key])!==JSON.stringify(preferences[key]));
    const refreshSave=()=>{saveButton.disabled=!dirty();};
    function preview(theme){themePreview=theme===preferences.theme?null:theme;applyTheme(win);} // _on_theme_combo_changed: the open window follows the choice at once
    function go(next){ // _on_nav_changed → _on_tab_changed: unsaved changes of the page are dropped
      draft=clone(preferences);preview(preferences.theme);page=next;status.textContent='';draw();
    }
    function draw(){
      $$('[data-page]',root).forEach(el=>{const on=el.dataset.page===page;el.classList.toggle('active',on);el.setAttribute('aria-current',on?'page':'false');});
      const area=$('[data-settings-page]',root);area.setAttribute('aria-label',settingsNav.find(n=>n[1]===page)[0]);area.scrollTop=0;
      if(page==='connection')connectionPage(area,draft);
      else if(page==='sections')sectionsPage(area);
      else if(page==='dictation')dictationSettings(area,draft);
      else if(page==='fields')fieldsPage(area);
      else if(page==='appearance'){
        area.innerHTML=`<fieldset class="oa-group"><legend>Motyw okien</legend><div class="oa-form-row"><label for="oa-cfg-theme">Motyw:</label><select id="oa-cfg-theme" data-setting="theme" title="Kolory okna konfiguracji i okienek dialogowych. „Automatyczny” podąża za motywem aplikacji Windows (jasny/ciemny). Bąbelek i kolorowe popupy (RODO/parametry) mają własne kolory niezależnie od tego ustawienia.">${[['auto','Automatyczny (jak Windows)'],['light','Jasny'],['dark','Ciemny']].map(([value,label])=>`<option value="${value}" ${draft.theme===value?'selected':''}>${label}</option>`).join('')}</select></div>${cfgHint('Zmiana działa od razu — bez restartu. „Automatyczny” reaguje też na zmianę motywu Windows w trakcie pracy.')}<p class="oa-form-help">W demonstracji „Automatyczny” podąża za trybem kolorów tego pulpitu (Ustawienia → Personalizacja).</p></fieldset>`;
      } else if(page==='bubble'){
        /* rc32 ConfigDialog._build_bounce_section: the bubble's only settings. */
        area.innerHTML=`<fieldset class="oa-group"><legend>Animacja bezczynności</legend><label class="oa-switch-row" title="Po dłuższej bezczynności bąbelek spada na pasek zadań i odbija się jak gumowa piłka. Tylko gdy bąbelek jest wyżej niż pasek zadań (nie przecięty)."><input type="checkbox" data-setting="idleBounce" ${draft.idleBounce?'checked':''}><div>Bąbelek czasem odbija się od paska zadań</div></label>${formRow('Co ile sekund:',`<span class="oa-number"><input type="number" data-setting="bounceInterval" min="10" max="3600" step="10" value="${draft.bounceInterval}" title="Co ile sekund bąbelek odbija się podczas bezczynności" aria-label="Co ile sekund"><span>s</span></span>`)}${formRow('Maks. odbić w sesji:',`<span class="oa-number"><input type="number" data-setting="bounceMax" min="0" max="999" step="1" value="${draft.bounceMax}" title="Maks. liczba odbić w jednym oknie bezczynności (od ostatniej aktywności użytkownika). 0 = bez limitu - bąbelek odbija się co interval dopóki user nie wróci. Sensowne dla gabinetów gdzie komputer bywa włączony godzinami bez interakcji." aria-label="Maks. odbić w sesji"><span data-bounce-unit>${draft.bounceMax>0?'odbić':'bez limitu'}</span></span>`)}</fieldset>`;
      } else if(page==='history'){
        area.innerHTML=`<fieldset class="oa-group"><legend>Historia generowań</legend>${cfgButton('Otwórz historię generowań…','open-history','Otwiera przeglądarkę zapisanych epikryz (lista + notatka + epikryza). Osobne, skalowalne okno — możesz je porównywać z Kliniką.','oa-cfg-wide')}<label class="oa-switch-row" title="Wyłącz aby OpisAI nie zapisywał notatek/epikryz w bazie opisai.sqlite3 (chronione rekordy)."><input type="checkbox" data-setting="history" ${draft.history?'checked':''}><div>Zapisuj historię generowań</div></label>`+
          formRow('Maks. wpisów:',`<span class="oa-number"><input type="number" value="1000" disabled aria-label="Maks. wpisów" title="${esc('Hard cap: 2000 wpisów (limit konfiguracyjny history_hard_max_entries, przechowywany w SQLite)'+IN_APP)}"><span>wpisów</span></span>`)+
          formRow('Czas retencji:',`<span class="oa-number"><input type="number" value="90" disabled aria-label="Czas retencji" title="${esc('0 = brak limitu wieku. Hard cap = 730 dni (~24 miesiecy).'+IN_APP)}"><select disabled aria-label="Jednostka czasu retencji"><option selected>dni</option><option>tygodni</option><option>miesięcy</option></select></span>`)+
          cfgHint('Trim przy starcie: <b>najpierw</b> wpisy starsze niż czas retencji, <b>potem</b> jeśli zostało więcej niż maks. wpisów — najstarsze utnij.<br>Hard cap: 2000 wpisów / 730 dni (ustawienia przechowywane w SQLite).')+
          `</fieldset><div class="oa-cfg-note">${notice('W demonstracji historia dokumentów zostaje tylko w tej karcie przeglądarki i znika po odświeżeniu strony, więc limity wpisów i retencji dotyczą aplikacji. Ostatni wpis cofniesz w oknie wyniku albo z menu bąbelka: „Bezpieczny zapis i odzyskiwanie”.')}</div>`;
      } else if(page==='system'){
        area.innerHTML=`<fieldset class="oa-group"><legend>Integracja z Windows</legend>${cfgButton('🖥️  Stwórz skrót na pulpicie','shortcut','Tworzy skrót OpisAI na pulpicie. Uruchamia tę kopię programu dwukrotnym kliknięciem, bez okna konsoli.','oa-cfg-wide')}${lockedSwitch('Uruchamiaj OpisAI przy starcie Windows (autologon)','Dodaje skrót do folderu Startup użytkownika. OpisAI uruchomi się sam po zalogowaniu się do Windows.'+IN_APP,false)}${lockedSwitch('Dodaj OpisAI do menu Start','Tworzy OpisAI.lnk w menu Start (Start > Wszystkie aplikacje). Stamtąd możesz prawym klikiem przypiąć apkę do paska zadań. Odznaczenie usuwa skrót z menu Start.'+IN_APP,false)}${cfgHint('Skrót i autostart wskazują na <code>pythonw.exe</code> z .venv apki (bez konsoli). Działają tylko na Windows.')}</fieldset>`+
          `<fieldset class="oa-group"><legend>Hash skryptu (SHA-256)</legend><input type="text" class="oa-cfg-hash" readonly value="W demonstracji nie ma pliku programu — hash pokazuje aplikacja" aria-label="Hash skryptu (SHA-256)"><div class="oa-inline-controls">${offButton('📋  Kopiuj hash','Kopiuje hash do schowka')}${offButton('↻  Przelicz','Przelicz hash ponownie (np. po podmianie pliku).')}</div>${cfgHint('SHA-256 launchera i modułów źródłowych <code>opisai_app</code><br>W aplikacji pod spodem jest ścieżka programu; dwie kopie o tym samym hashu są identyczne.')}</fieldset><div class="oa-cfg-note">${notice('Przykładową wizytę, historię i ustawienia demonstracji przywrócisz w Ustawieniach pulpitu: Prywatność i zabezpieczenia.')}</div>`;
      } else {
        area.innerHTML=`<fieldset class="oa-group"><legend>AI Act / RODO</legend><p class="oa-cfg-text">Robocza matryca kwalifikacji OpisAI: kwalifikacja AI Act, ryzyka i kontrole oraz checklista wdrożeniowa. Sama edycja otwiera się w osobnym, większym oknie. Źródłem prawdy jest jeden plik XLSX.</p><div class="oa-inline-controls">${cfgButton('Otwórz edycję matrycy...','matrix','Otwiera osobne okno z trzema arkuszami: Kwalifikacja, Ryzyka_i_kontrole, Checklista.')}${cfgButton('Otwórz plik XLSX...','xlsx','Otwiera źródłowy skoroszyt OpisAI_matryca_kwalifikacji_AI_Act.xlsx.')}</div>${cfgHint('XLSX: OpisAI_matryca_kwalifikacji_AI_Act.xlsx (w folderze OpisAI)<br>Status: brak - zostanie utworzony z domyślnej matrycy.')}${cfgHint('To robocza matryca zgodności, nie opinia prawna. Przy zmianie funkcji klinicznych, dostawców AI albo sposobu użycia trzeba ją przejrzeć ponownie.')}</fieldset><div class="oa-cfg-note">${notice('Tryb demonstracyjny: witryna nie wysyła treści wizyty do modeli AI, nie uruchamia mikrofonu i nie zapisuje danych w zewnętrznej Klinice.')}</div>`;
      }
      $$('[data-setting]',area).forEach(el=>{
        el.addEventListener('change',()=>{
          const key=el.dataset.setting;draft[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
          if(key==='provider'||key==='transport'||key==='auth'){connectCascade(draft);draw();}
          if(key==='transcriber')draw();
          if(key==='theme')preview(draft.theme);
          if(key==='bounceMax'){const unit=$('[data-bounce-unit]',area);if(unit)unit.textContent=Number(el.value)>0?'odbić':'bez limitu';}
          status.textContent='';
        });
      });
      $$('[data-cfg]',area).forEach(el=>el.addEventListener('click',()=>settingsAction(el.dataset.cfg,draft)));
      refreshSave();
    }
    $('[data-settings-page]',root).addEventListener('change',refreshSave); // last, after a page's own handlers have normalized the draft
    $$('[data-page]',root).forEach(el=>el.addEventListener('click',()=>{if(el.dataset.page!==page)go(el.dataset.page);}));
    $$('[data-page]',root).forEach(el=>el.addEventListener('keydown',e=>{ // the section list moves with the arrows, as a QListWidget does
      if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;e.preventDefault();const items=$$('[data-page]',root).filter(x=>!x.hidden),next=items[items.indexOf(el)+(e.key==='ArrowDown'?1:-1)];if(next){go(next.dataset.page);next.focus();}
    }));
    $('.oa-settings-search',root).addEventListener('input',event=>{ // _filter_nav: name + keywords; a group header shows while it has a visible page
      const q=normal(event.target.value);let group=null,shown=false;
      for(const el of $$('[data-page], .oa-nav-group',root)){
        if(el.classList.contains('oa-nav-group')){if(group)group.hidden=!shown;group=el;shown=false;continue;}
        const entry=settingsNav.find(n=>n[1]===el.dataset.page);el.hidden=!!q&&!normal(entry[0]+' '+entry[3]).includes(q);shown=shown||!el.hidden;
      }
      if(group)group.hidden=!shown;
    });
    bind(root,'close-settings',()=>win.close());
    bind(root,'config-folder',()=>demoOnly('W demonstracji nie ma folderu konfiguracji: ustawienia OpisAI są zapisane w tej przeglądarce. W aplikacji przycisk otwiera folder z plikiem opisai.sqlite3.'));
    bind(root,'save-settings',()=>{ // _on_accept: stores this page and keeps the window open
      if(!dirty())return;
      for(const key of PAGE_KEYS[page])preferences[key]=draft[key];
      normalizeBounce(preferences);normalizeDictation(preferences);connectCascade(preferences);savePreferences();
      themePreview=null;refreshThemes();window.OpisAISpelling?.refresh?.();
      const compose=windows.get('opisai-compose');if(page==='connection'&&compose?.el?.isConnected)$('#oa-compose-ack',compose.content)?.dispatchEvent(new Event('change')); // the route and the consent follow the new connection
      refreshSave(); // the same draft object: a page's own handlers keep it
      const scope=$('[data-dt-scope]',root);if(scope)scope.textContent='Zapisano ustawienia dla następnego dyktowania.\nZmiana silnika, trybu kart, klipu i Autoenter nie przełącza trwającego nagrania.';
      status.textContent='Zapisano zmiany z tej karty.';$('[data-action="close-settings"]',root)?.focus();
    });
    draw();
    setTimeout(()=>$('.oa-nav-item.active',root)?.focus(),0);
  }
  /* Połączenie i model: _build_token_section (title and actions by the auth mode, creds_ui_for) above
   * _build_provider_section (Serwis → Transport → Autoryzacja → Model, then the Klinika window titles). */
  function connectionPage(area,draft){
    const s=providerSpec(draft),ids=uniq(PROVIDERS.map(x=>x.id)),transports=uniq(PROVIDERS.filter(x=>x.id===s.id).map(x=>x.transport)),auths=PROVIDERS.filter(x=>x.id===s.id&&x.transport===s.transport).map(x=>x.auth);
    const key=['cookie','edge_cookie','api_key'].includes(s.auth),title={cookie:'Logowanie - cookie sesji',edge_cookie:'Logowanie - cookie z Edge',profile:'Logowanie - w oknie przegladarki',anonymous:'Logowanie - niewymagane (Flash)',api_key:'Klucz API - Gemini',gcloud_oauth:'Logowanie - Gemini OAuth (Google Cloud)',local:'Model lokalny (offline)'}[s.auth];
    const creds=s.secret?(s.auth==='api_key'?'Brak klucza':'Brak tokenu'):AUTH_LABELS[s.auth]; // _refresh_status: what is configured, never a connection test
    const options=(values,labels,current)=>values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(labels[v]??v)}</option>`).join('');
    const tip={cookie:'',anonymous:'Działa bez logowania tylko z Gemini 3.5 Flash. Gemini Pro wymaga profilu OpisAI/Chrome albo cookie z Edge.',gcloud_oauth:'Łączy się z Gemini przez logowanie Google, bez klucza API w polu. OpisAI pobiera przenośne narzędzie Google do ./gcloud w folderze OpisAI i używa wybranego modelu Gemini.',local:'Model działa LOKALNIE na Twoim GPU — dane nie opuszczają komputera (RODO). Wymaga Ollamy i pobranego modelu — kliknij „Pobierz model lokalny” poniżej (jednorazowo, ~9 GB). Generacja zwalnia VRAM po sobie, więc dyktowanie (Whisper) i epikryza (Qwen) wymieniają się na karcie.'}[s.auth];
    const actions=s.auth==='profile'?`${cfgButton('Otwórz przeglądarkę z profilem OpisAI','profile',s.label+' — ten sam profil, którego OpisAI używa do generowania.','primary oa-cfg-wide')}<p class="oa-cfg-muted">${esc(s.label)} — ten sam profil co przy generowaniu. Możesz się zalogować i sprawdzić ustawienia serwisu.</p>`
      :`<div class="oa-inline-controls">${['cookie','edge_cookie'].includes(s.auth)?cfgButton('Wykryj ponownie','redetect','Szuka zapisanej sesji w przeglądarkach na tym komputerze.')+cfgButton('Zaloguj przez Edge...','edge','Otwiera Edge do zalogowania i pobiera lokalną sesję.'):''}${['api_key','gcloud_oauth'].includes(s.auth)?cfgButton('🔑 Pobierz klucz Gemini API','gemini-key','Pierwszy klik sam pobiera portable gcloud do folderu ./gcloud w folderze OpisAI i otwiera logowanie Google. Gdy konto nie ma projektu, tworzy projekt OpisAI, włącza wymagane API i tworzy klucz ograniczony do Gemini. Wznowienie używa tych samych zasobów. Nie podłącza rozliczeń ani płatnego planu.'):''}${s.auth==='local'?cfgButton('⬇ Pobierz model lokalny','local-model','Rozkłada silnik Ollama w folderze OpisAI (raz, ~1,4 GB) i pobiera wybrany model (tag z pola „Model”). Uruchamia go na sprzęcie z „Liczy na”. Generowanie robi to samo przy pierwszym użyciu; potem model działa w pełni offline.'):''}</div>${tip?cfgHint(esc(tip)):''}`;
    const ctx=window.Clinic?.getContext?.()||{},main=String(ctx.mainTitle||'[DEMO] Klinika XP - [Przebieg wizyty - Zwierzę domowe]'),sub=String(ctx.title||'[DEMO] Rejestracja wizyty: Wywiad - Badanie - Diagnoza');
    const keyRow=key?formRow('Klucz / token:',`<input type="password" disabled placeholder="${esc({cookie:'cookie / token sesji (auto Wykryj/Edge albo wklej recznie)',edge_cookie:'cookie jar JSON Gemini z Edge',api_key:'wklej klucz API albo pobierz automatycznie (AQ... / AIza...)'}[s.auth])}" aria-label="Klucz / token" title="${esc('W demonstracji klucze i tokeny nie są potrzebne ani zapisywane'+IN_APP)}">`)+`<label class="oa-switch-row oa-cfg-locked oa-cfg-indent"><input type="checkbox" disabled><div>pokaz klucz</div></label>`:'';
    const model=s.locked?`<select disabled aria-label="Model" title="Model wybiera interfejs serwisu; OpisAI go nie wysyła."><option>${esc(s.locked)}</option></select>`:`<select data-setting="model" aria-label="Model" ${s.models.length===1?'disabled':''}>${options(s.models,{},modelFor(s,draft.model))}</select>`;
    area.innerHTML=`<fieldset class="oa-group"><legend>${esc(title)}</legend><p class="oa-cfg-status" data-connection-status>${esc(s.label+' — '+creds)}<br>Ten status nie jest testem połączenia.</p>${actions}</fieldset>`+
      `<fieldset class="oa-group"><legend>Generowanie</legend>${formRow('Serwis:',`<select data-setting="provider" aria-label="Serwis">${options(ids,Object.fromEntries(ids.map(id=>[id,PROVIDERS.find(x=>x.id===id).label])),s.id)}</select>`)}${formRow('Transport:',`<select data-setting="transport" aria-label="Transport">${options(transports,TRANSPORT_LABELS,s.transport)}</select>`)}`+
      (auths.length>1?formRow('Autoryzacja:',`<select data-setting="auth" aria-label="Autoryzacja" title="Profil OpisAI/Chrome: otwórz przeglądarkę przyciskiem w sekcji logowania, aby przygotować konto. Cookie z Edge: pobiera lokalną sesję przyciskiem „Zaloguj przez Edge”.">${options(auths,AUTH_LABELS,s.auth)}</select>`):'')+keyRow+formRow('Model:',model)+
      (s.auth==='local'?formRow('Liczy na:',`<select disabled aria-label="Liczy na" title="${esc('Automatycznie: najmocniejsza dostępna karta graficzna (NVIDIA zewnętrzna, potem wewnętrzna, potem wbudowana). Procesora nie ma na liście: model tej wielkości liczyłby na nim za wolno. Wybór konkretnej karty jest ścisły: gdy jej nie ma, OpisAI powie o tym.'+IN_APP)}">${options(Object.keys(HW_LLM),HW_LLM,'auto')}</select>`):'')+
      formRow('Tytuł okna głównego:',`<input type="text" readonly value="Klinika" placeholder="Klinika" aria-label="Tytuł okna głównego" title="Fragment tytułu okna GŁÓWNEGO Kliniki (lista pacjentów / mainform). Z niego czytane są rączki (Pacjent/Właściciel) i tu celuje przycisk „Uruchom Klinikę”.">`)+
      formRow('Tytuł podokna opisu:',`<input type="text" readonly value="Rejestracja wizyty" placeholder="np. 'Wizyta' / 'Edycja opisu' — puste = wybierz później" aria-label="Tytuł podokna opisu" title="Fragment tytułu PODOKNA opisu wizyty (otwierane na konkretną wizytę). Tu czytamy notatkę i wpisujemy wygenerowaną epikryzę. Pusty = nieskonfigurowane (przy generacji apka poprosi o picker).">`)+
      `<p class="oa-form-help oa-cfg-windows">W demonstracji oba okna Kliniki XP są przypisane na stałe: okno główne „${esc(main)}” i podokno opisu „${esc(sub)}”, otwierane z okna głównego (F2). Fragment podokna nie zawiera słowa „Klinika”, więc OpisAI nie bierze okna głównego za podokno.</p></fieldset>`+
      `<div class="oa-cfg-note">${notice('W demonstracji OpisAI nie łączy się z serwisem: odpowiedź AI jest lokalną symulacją, a przeglądarka, cookie, klucze i model lokalny nie są używane. Wybór serwisu zmienia opis połączenia i zgodę w oknie przygotowania tak jak w aplikacji. Nowa instalacja OpisAI zaczyna od Claude · Cookie HTTP · claude-sonnet-4-6; demonstracja od ChatGPT w przeglądarce.')}</div>`;
  }
  function settingsAction(action,draft){
    const s=providerSpec(draft);
    if(action==='open-history')history();
    else if(action==='profile')demoOnly(`W demonstracji przeglądarka się nie otwiera. W aplikacji ten przycisk otwiera osobny profil OpisAI dla ${s.label} — ten sam, którego OpisAI używa do generowania.`);
    else if(action==='redetect')demoOnly(`W demonstracji OpisAI nie szuka sesji w przeglądarkach. W aplikacji „Wykryj ponownie” odczytuje zapisaną sesję ${s.label} z tego komputera.`);
    else if(action==='edge')demoOnly('W demonstracji Edge się nie otwiera. W aplikacji „Zaloguj przez Edge...” pobiera lokalną sesję po zalogowaniu.');
    else if(action==='gemini-key')demoOnly('W demonstracji nic nie jest pobierane ani logowane. W aplikacji przycisk pobiera przenośne narzędzie Google do folderu OpisAI i przygotowuje klucz Gemini.');
    else if(action==='local-model')demoOnly('W demonstracji model nie jest pobierany. W aplikacji OpisAI rozkłada silnik Ollama w swoim folderze i pobiera wybrany model (jednorazowo).');
    else if(action==='diagnose')diagnoseFields();
    else if(action==='shortcut')demoOnly('W demonstracji skrót nie jest tworzony. W aplikacji przycisk dodaje skrót OpisAI na pulpicie Windows.');
    else if(action==='matrix')matrixWindow();
    else if(action==='xlsx')demoOnly('W demonstracji nie ma pliku XLSX. W aplikacji przycisk otwiera skoroszyt matrycy w Excelu, a gdy go brak — najpierw tworzy go z domyślnej matrycy.');
  }
  /* Sekcje opisu (_build_polish_sections_section, _build_prompt_section): fields on top, the subsections of the selected
   * field below, panel row with its parameter rows. The demonstration uses the rc32 defaults; editing works in the app. */
  const DISABLED_SUBSECTIONS={'Dotychczasowe leczenie i choroby współistniejące':'wcześniejsze/obecne leczenie i leki, choroby współistniejące, profilaktyka, dieta, środowisko','Uzasadnienie':'opcjonalnie maksymalnie jedno krótkie zdanie z faktami z notatki; bez planu i zaleceń'}; // document_defaults: off by default
  function sectionsPage(area){
    const sections=DOC_KEYS.map(k=>Doc().sectionByKey(k));let active=0;
    area.innerHTML=`<fieldset class="oa-group"><legend>Sekcje opisu wizyty</legend><div class="oa-cfg-table"><table class="oa-options-table oa-doc-layout oa-cfg-grid" role="grid" aria-label="Pola wizyty"><thead><tr><th>ON</th><th>Etykieta</th><th>Pole tekstowe</th><th>Instrukcja (dla AI)</th></tr></thead><tbody>${sections.map((s,i)=>`<tr data-section="${i}"><td><input type="checkbox" checked disabled aria-label="Sekcja włączona"></td><td>${esc(s.label)}</td><td title="W demonstracji pole Kliniki jest przypisane na stałe. W aplikacji: identyfikator kontrolki (ClassNN) wskazany z menu bąbelka.">${esc(s.field)}</td><td class="oa-cfg-clip" title="${esc(s.instruction)}">${esc(s.instruction)}</td></tr>`).join('')}</tbody></table></div>`+
      `<div class="oa-inline-controls oa-cfg-split">${offButton('Wyczyść pole tekstowe','Usuń przypisane pole tekstowe ClassNN dla zaznaczonej sekcji. Sekcja pozostanie w konfiguracji, ale nie będzie generowana, dopóki ponownie nie użyjesz „Wskaż pole tekstowe...”.')}<span class="oa-pg-gap"></span>${offButton('Reset (domyślne)','Przywróć domyślne sekcje i prompty kondycjonujące. Przypisane pola tekstowe ClassNN zostaną zachowane.')}</div>`+
      `<h3 class="oa-cfg-subhead" data-sub-label></h3><div class="oa-cfg-table"><table class="oa-options-table oa-cfg-subs" aria-label="Podsekcje pola"><thead><tr><th>ON</th><th>Nazwa (nagłówek)</th><th>Opis (podpowiedź dla AI)</th><th>Parametry</th></tr></thead><tbody data-subs></tbody></table></div>`+
      `<div class="oa-inline-controls">${offButton('+','Dodaj podsekcję')}${offButton('−','Usuń zaznaczoną podsekcję')}${offButton('↑','Przesuń podsekcję w górę')}${offButton('↓','Przesuń podsekcję w dół')}${offButton('Panel + opis badania','Dodaj albo usuń podsekcję: panel parametrów + opis badania ze źródeł. Ma jeden nagłówek. Jej opis dla AI możesz edytować w tabeli; wiersze parametrów ustawisz przyciskiem „Konfiguruj” w tym wierszu. Kolejność zmieniasz przeciąganiem albo ↑↓.')}</div>`+
      lockedSwitch('Kontroluj powtórzenia panelu w epikryzie','Dotyczy opisu pod panelem w tej samej podsekcji, gdy wybrano wariant „+ parametry”.',true)+cfgHint('Opis pod aktywnym panelem uzupełnia jego parametry pozostałymi ustaleniami z badania.')+
      cfgHint('Góra = pola; dół = podsekcje wybranego pola (nagłówki w wygenerowanym opisie). Dwuklik nazwy lub opisu = edycja. „Nazwa” trafia do opisu jako nagłówek; „Opis” to tylko podpowiedź dla AI (nie pojawia się w wyniku). <b>Kolejność: przeciągnij wiersz łapką</b> (albo ↑↓). <b>Prawy klik na podsekcji</b> = przenieś ją do innego pola. <b>Panel parametrów + opis badania ze źródeł</b> to jedna podsekcja z jednym nagłówkiem. Przy wariancie „+ parametry” lokalny panel poprzedza opis kliniczny ze źródeł. Przycisk <b>Konfiguruj</b> otwiera wiersze parametrów; podpowiedź dla opisu edytujesz obok. Bez wariantu „+ parametry” pozostaje sam opis. „Pole tekstowe” (ClassNN) ustawiasz z menu traya; zaznaczone możesz wyczyścić przyciskiem nad tabelą.')+`</fieldset>`+
      `<details class="oa-cfg-prompt"><summary>Prompt kondycjonujący (zaawansowane)</summary><div>${cfgHint('Te reguły określają sposób pisania w wariancie <b>Bogato</b>. Nazwy i kolejność podsekcji ustawiasz w tabeli. Puste pole oznacza domyślny wbudowany tekst.')}<label for="oa-cfg-prompt-head">Zasady stylu:</label><textarea id="oa-cfg-prompt-head" readonly placeholder="W demonstracji treść promptu nie jest pokazywana."></textarea><label for="oa-cfg-prompt-foot">Kontrola końcowa:</label><textarea id="oa-cfg-prompt-foot" readonly placeholder="W demonstracji treść promptu nie jest pokazywana."></textarea><div class="oa-inline-controls oa-cfg-end">${offButton('Przywróć domyślny prompt','Przywraca wbudowane zasady stylu i kontrolę końcową')}</div></div></details>`+
      `<div class="oa-cfg-note">${notice(`W demonstracji sekcje, podsekcje i wzorzec panelu są stałe: to ustawienia domyślne OpisAI ${VERSION}, z których korzysta przygotowanie opisu. W aplikacji edytujesz je w tych tabelach, a pola tekstowe wskazujesz z menu bąbelka.`)}</div>`;
    const rows=$$('[data-section]',area);
    function select(i,focus){
      active=i;rows.forEach((tr,j)=>{tr.classList.toggle('selected',j===i);tr.setAttribute('aria-selected',String(j===i));tr.tabIndex=j===i?0:-1;});if(focus)rows[i].focus();
      const s=sections[i];$('[data-sub-label]',area).textContent='Podsekcje pola: '+s.label;
      $('[data-subs]',area).innerHTML=[...s.subsections.map(x=>({...x,enabled:true})),...(s.disabled||[]).map(name=>({name,description:DISABLED_SUBSECTIONS[name]||'',enabled:false}))].map(x=>x.panel
        ?`<tr class="oa-cfg-panel-row"><td aria-label="Panel parametrów">⚙</td><td title="Panel parametrów + opis badania ze źródeł. Jeden nagłówek dla obu części. Dwuklik: zmień nazwę."><b>${esc(x.name)}</b></td><td title="${esc(x.description+'\n\nPodpowiedź dla opisu badania ze źródeł. Dwuklik: edytuj. Wiersze parametrów ustawisz przyciskiem obok.')}">${esc(x.description)}</td><td><button type="button" class="oa-link-btn oa-cfg-link" data-vitals title="Konfiguruj wiersze panelu parametrów życiowych.">Konfiguruj</button></td></tr>`
        :`<tr><td><input type="checkbox" ${x.enabled?'checked':''} disabled aria-label="Podsekcja włączona"></td><td title="${esc(x.name)}">${esc(x.name)}</td><td title="${esc(x.description)}">${esc(x.description)}</td><td></td></tr>`).join('');
      $$('[data-vitals]',area).forEach(b=>b.addEventListener('click',vitalsWindow));
    }
    rows.forEach((tr,i)=>{tr.addEventListener('click',()=>select(i,true));tr.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();select(Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1))),true);}});});
    select(0,false);
  }
  function vitalsWindow(){ // VitalParamsConfigDialog: the small-animal template the workflow uses, fixed here
    const rows=Doc().TEMPLATE.map(r=>`<tr><td><input type="checkbox" checked disabled aria-label="Parametr włączony"></td><td>${esc(r.label)}</td><td>${esc(r.reference)}</td><td>${esc(r.unit)}</td></tr>`).join('');
    const html=`<div class="oa-app oa-vitals"><div class="oa-content"><h2>Wiersze panelu parametrów życiowych</h2><p class="oa-vitals-lead">Wariant „+ parametry” dołącza cały szablon do opisu badania klinicznego. Tutaj ustawiasz jego wiersze, ich kolejność, treść i jednostki. Wartości z notatki zastępują odpowiednie pozycje szablonu.</p><div class="oa-form-row"><label for="oa-vitals-species">Gatunek pacjentów:</label><select id="oa-vitals-species" disabled title="${esc('Wybór gatunku ładuje DOMYŚLNY panel parametrów dla tego gatunku. Psy/koty mają inne normy niż konie (tętno, oddechy, temperatura, osłuchanie jelit w 4 kwadrantach, tętno palcowe/kopyta...). Po załadowaniu możesz dalej edytować wiersze.'+IN_APP)}"><option selected>Psy / koty</option><option>Konie</option></select></div><table class="oa-options-table"><thead><tr><th>ON</th><th>Nazwa</th><th>Treść szablonu</th><th>Jednostka</th></tr></thead><tbody>${rows}</tbody></table><div class="oa-inline-controls oa-vitals-tools">${offButton('+','Dodaj parametr')}${offButton('−','Usuń zaznaczony parametr')}${offButton('↑','Przesuń parametr w górę')}${offButton('↓','Przesuń parametr w dół')}${offButton('Reset','Przywróć domyślne parametry życiowe')}</div>${cfgHint('Panel pojawia się automatycznie razem z opisem badania. Przed wpisaniem możesz poprawić całą treść w podglądzie wyniku. Jednostkę wybierz z listy albo wpisz własną.')}<p class="oa-form-help">W demonstracji wzorzec jest stały: domyślne wiersze dla psów i kotów z OpisAI ${VERSION}, z których korzysta panel w przygotowaniu opisu.</p></div><footer class="oa-footer"><span class="oa-pg-gap"></span>${button('Anuluj','close')}${button('Zapisz parametry','save-vitals','primary','',`disabled title="${esc('Zapisuje wiersze panelu'+IN_APP)}"`)}</footer></div>`;
    const win=makeWindow('opisai-vitals','OpisAI — konfiguracja parametrów życiowych',900,640,html);escapeCloses(win);bind(win.content,'close',()=>win.close());setTimeout(()=>$('[data-action="close"]',win.content)?.focus(),0);
  }
  /* Odczyt pola (zaawansowane): WM_GETTEXT, then UI Automation + MSAA, both always on; the read-only field diagnostics. */
  function fieldsPage(area){
    area.innerHTML=`<fieldset class="oa-group"><legend>Odczyt pola (zaawansowane)</legend><p class="oa-cfg-text">Gdy zwykły odczyt pola zwraca pusto (pole oparte na TRichView, Addict albo innym nie-natywnym toolkicie — np. Tk — nie oddającym tekstu przez WM_GETTEXT), OpisAI może spróbować nieinwazyjnego odczytu przez Windows UI Automation / MSAA.</p>`+
      lockedSwitch('0. Standardowy odczyt — WM_GETTEXT (Win32, domyślny)','Podstawowy, najszybszy i nieinwazyjny odczyt pola (Win32 SendMessage); robiony jako PIERWSZY i działa dla zwykłych pól EDIT/RichEdit. Metoda jest zawsze włączona, bo stanowi bazowy etap kaskady odczytu.',true)+cfgHint('Metoda zapasowa (uruchamiana tylko gdy odczyt powyżej zwróci pusto lub jest wyłączony):')+
      lockedSwitch('1. UI Automation + MSAA (nieinwazyjne)','Odczyt przez Windows UI Automation (TextPattern / ValuePattern / LegacyIAccessible; też ElementFromPoint ze środka pola) oraz MSAA/IAccessible (oleacc) jako zapas. Nie rusza fokusu, kursora ani schowka — bezpieczne, dlatego metoda jest zawsze włączona.',true)+
      cfgHint('Włącz, jeśli generowanie kończy się błędem „Pole notatki jest puste”, mimo że w polu widać tekst. Każdy etap jest logowany w konsoli lub opcjonalnym logu plikowym (linie [read]). Odczyt zapasowy działa wyłącznie na Windows i tylko z włączoną bramką RODO (odczyt na głównym wątku).')+
      cfgButton('🔧 Diagnostyka pola','diagnose','Bezpieczna (read-only) diagnostyka skonfigurowanych pól: nazwa klasy kontrolki, co widzi każda metoda odczytu (WM_GETTEXT / UIA / MSAA) i czy UIA pozwala pisać (ValuePattern). NIE modyfikuje pól. Wymaga otwartego okna Kliniki. Wynik w okienku; przy uruchomieniu z --log-file także w pliku logu (linie [diag]).','oa-cfg-wide')+
      `</fieldset><div class="oa-cfg-note">${notice('W demonstracji OpisAI czyta trzy pola podokna opisu makiety Kliniki XP, przypisane na stałe. W aplikacji okna i pola wskazujesz z menu bąbelka: „Wybierz okno główne...”, „Wybierz podokno opisu...” i „Wskaż pole tekstowe”. Podkreślenia pisowni włączasz w menu bąbelka: „Podpowiedzi pisowni”.')}</div>`;
  }
  function diagnoseFields(){ // _on_diagnose_field: needs the open description sub-window and never changes the fields
    const id='opisai-settings-message';
    if(!window.Clinic?.getContext?.()?.editorOpen){messageBox({id,title:'Diagnostyka pola',icon:'warning',text:'Nie znaleziono podokna opisu wizyty. Otwórz wizytę w Klinice i spróbuj ponownie.'});return;}
    const values=getFields(),report=DOC_KEYS.map(k=>{const n=String(values[k]||'').length,c=n+' zn.'+(n?'':'  (PUSTE)');return [`=== ${Doc().sectionByKey(k).label} — pole „${DOC_FIELD[k]}” ===`,'WM_GETTEXT: '+c,'UIA odczyt: '+c,'MSAA odczyt: '+c].join('\n');}).join('\n\n');
    messageBox({id,title:'Diagnostyka pola',icon:'info',heading:'Diagnostyka pola',text:report,informative:'Przykładowy raport demonstracji: liczby znaków pochodzą z pól makiety. W aplikacji raport podaje też klasę kontrolki, wzorce UI Automation i ocenę drogi zapisu; pól nie zmienia.'});
  }
  /* AiActMatrixDialog: three sheets of the working AI Act / RODO matrix. A read-only sample of the default rows. */
  const AI_ACT_SAMPLE=[
    ['Kwalifikacja',['Obszar','Kwalifikacja / decyzja','Uzasadnienie / dowód'],[28,52,76],[
      ['System','OpisAI','Asystent przygotowania roboczej dokumentacji wizyty weterynaryjnej.'],
      ['Intended use','Przygotowanie roboczego tekstu epikryzy / opisu wizyty oraz opcjonalnego rozpoznania roboczego na podstawie notatek lekarza.','System porządkuje notatki, rozdziela sekcje, proponuje wstępne wnioskowanie, rozpoznanie robocze i zalecenia do weryfikacji.'],
      ['Excluded use','Brak samodzielnej diagnozy ostatecznej, brak automatycznej ordynacji leczenia, brak triage, brak automatycznej decyzji klinicznej.','Pole Rozpoznanie robocze jest propozycją do weryfikacji; każdy output wymaga kontroli i akceptacji lekarza weterynarii/operatora.'],
      ['Użytkownik docelowy','Lekarz weterynarii / upoważniony operator kliniki.','Narzędzie nie jest przeznaczone dla właściciela zwierzęcia ani do samodzielnej interpretacji.'],
      ['Rola AI','Asystent redakcyjny i porządkujący dokumentację, z opcjonalną propozycją rozpoznania roboczego.','AI nie zastępuje badania klinicznego ani decyzji lekarza; rozpoznanie robocze nie jest diagnozą ostateczną.'],
      ['AI Act - high-risk','Wstępnie: nie high-risk przy obecnym przeznaczeniu.','System tworzy roboczą dokumentację weterynaryjną i opcjonalne rozpoznanie robocze do obowiązkowej weryfikacji przez lekarza; nie wykonuje triage, scoringu, autonomicznego dawkowania ani automatycznych decyzji klinicznych. Do ponownej kwalifikacji przy zmianie funkcji lub sprzedaży jako narzędzie diagnostyczne/terapeutyczne.'],
      ['RODO / dane osobowe','Założenie projektowe: do OpisAI trafiają dane kliniczne pacjenta-zwierzęcia, nie dane ludzi.','Dane zwierzęcia zwykle nie są danymi osobowymi. Dane właściciela, lekarza, pracownika, identyfikatory klienta i inne informacje pozwalające zidentyfikować osobę nie są potrzebne do działania OpisAI i nie powinny trafiać do promptu. Bramka RODO/podgląd służy jako kontrola błędu operatora przed wysłaniem treści do zewnętrznego providera AI.'],
      ['Decyzja kwalifikacyjna','Używać jako narzędzie wsparcia dokumentacji, nie jako narzędzie diagnostyczne.','Tak opisywać w UI, dokumentacji i materiałach wdrożeniowych.'],
      ['Zastrzeżenie','Robocza matryca produktowa, nie opinia prawna.','Wdrożenie komercyjne powinno przejść review prawny/RODO.']]],
    ['Ryzyka_i_kontrole',['ID','Ryzyko','Skutek','Prawdop.','Waga','Kontrole obecne','Działania zalecane','Właściciel'],[8,34,36,14,14,42,52,22],[
      ['R-01','Halucynacja rozpoznania lub zaleceń.','Błędna dokumentacja / ryzyko kliniczne.','Średnie','Wysoka','Prompt: dane tylko z notatki; wnioskowanie jako wstępne; human review.','UI notice + testy regresji + zakaz gotowych dawek/leków bez notatki.','OpisAI / klinika'],
      ['R-04','Błędne pole Kliniki zostaje nadpisane.','Utrata lub pomieszanie dokumentacji.','Niskie/Śr.','Wysoka','Field picker, undo bubble, snapshot przed zapisem.','Czytelny podgląd targetów; test cofania.','OpisAI'],
      ['R-06','Operator ufa AI bez kontroli.','Błędy kliniczne w dokumentacji.','Średnie','Wysoka','RODO/confirm flow częściowo.','AI literacy notice + checkbox pierwszego uruchomienia.','Klinika / OpisAI'],
      ['R-07','Przypadkowe dane osobowe ludzi w promptach.','Niepotrzebna ekspozycja danych właściciela/personelu u providera.','Niskie','Wysoka','RODO okno potwierdzenia.','Instrukcja minimalizacji: do OpisAI wpisywać opis pacjenta-zwierzęcia i wizyty, bez danych właściciela/personelu.','Klinika / OpisAI'],
      ['R-09','Rozpoznanie robocze brzmi jak diagnoza ostateczna.','Nadmierny autorytet tekstu AI w dokumentacji.','Średnie','Wysoka',"Osobne pole, etykieta 'robocze', RODO wybór '+ rozpoznanie', human review.",'Testy regresji fraz kategorycznych; instrukcja AI literacy: rozpoznanie zatwierdza lekarz.','OpisAI / klinika']]],
    ['Checklista',['Priorytet','Zadanie','Opis','Status','Dowód / plik'],[12,30,76,18,32],[
      ['P0','UI notice AI draft','Komunikat: AI przygotowuje wersję roboczą, lekarz musi zweryfikować.','Do zrobienia','Config / first-run dialog'],
      ['P1','Instrukcja AI literacy','Krótka lokalna instrukcja: sprawdzaj fakty, leki, dawki, rozpoznania, dane osobowe.','Do zrobienia','Okno Pomoc / Zgodność AI'],
      ['P1','Provider disclosure','Tabela providerów: OpenAI/Anthropic/Google, co jest wysyłane, linki do terms/DPA.','Do zrobienia','Dokumentacja / UI'],
      ['P2','Change review trigger','Przy funkcjach: dawki, triage, automatyczne decyzje - ponowna kwalifikacja.','Do zrobienia','Procedura release checklist']]]];
  function matrixWindow(){
    let sheet=0;
    const html=`<div class="oa-app oa-matrix"><div class="oa-content"><p>Edytuj roboczą matrycę zgodności. Źródłem prawdy jest plik XLSX; zmiany zapisane w Excelu i zmiany zapisane tutaj trafiają do tego samego skoroszytu.</p><p class="oa-form-help">Demonstracja: wybrane wiersze domyślnej matrycy OpisAI ${VERSION}, tylko do odczytu. W aplikacji arkusze edytujesz i zapisujesz do pliku XLSX.</p><div class="oa-tabs" role="tablist" aria-label="Arkusze matrycy" data-sheets></div><div class="oa-matrix-table" role="tabpanel" tabindex="0" data-sheet></div><div class="oa-inline-controls">${offButton('+','Dodaj wiersz do aktywnego arkusza')}${offButton('−','Usuń zaznaczony wiersz')}${offButton('↑','Przesuń zaznaczony wiersz w górę')}${offButton('↓','Przesuń zaznaczony wiersz w dół')}<span class="oa-pg-gap"></span>${offButton('Zapisz XLSX','Zapisze aktualne tabele do pliku XLSX')}${offButton('Odśwież z XLSX','Wczytuje ponownie skoroszyt, np. po edycji i zapisie w Excelu.')}${offButton('Otwórz w Excelu','Otwiera plik matrycy')}${offButton('Reset domyślnych','Przywraca domyślną matrycę z kodu. Zapisz, aby nadpisać XLSX.')}</div></div><footer class="oa-footer"><span class="oa-pg-gap"></span>${button('Zamknij','close','primary')}</footer></div>`;
    const win=makeWindow('opisai-matrix','OpisAI — matryca AI Act / RODO',1180,760,html),root=win.content;escapeCloses(win);
    function draw(){
      $('[data-sheets]',root).innerHTML=AI_ACT_SAMPLE.map(([name],i)=>`<button type="button" role="tab" class="oa-tab ${i===sheet?'active':''}" aria-selected="${i===sheet}" tabindex="${i===sheet?0:-1}" data-tab="${i}">${esc(name)}</button>`).join('');
      const [,headers,widths,rows]=AI_ACT_SAMPLE[sheet],total=widths.reduce((a,b)=>a+b,0);
      $('[data-sheet]',root).innerHTML=`<table class="oa-options-table oa-matrix-cells"><colgroup>${widths.map(w=>`<col style="width:${(w/total*100).toFixed(1)}%">`).join('')}</colgroup><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      $$('[data-tab]',root).forEach(t=>{t.addEventListener('click',()=>{sheet=+t.dataset.tab;keepFocus(root,draw);});t.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();sheet=(sheet+(e.key==='ArrowRight'?1:AI_ACT_SAMPLE.length-1))%AI_ACT_SAMPLE.length;draw();$(`[data-tab="${sheet}"]`,root)?.focus();});});
    }
    bind(root,'close',()=>win.close());draw();setTimeout(()=>$('[data-tab].active',root)?.focus(),0);
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
      sources: result.generated ? result.generated.request.sources.map(s => ({label: s.label, text: s.text, included: s.included !== false})) : [{label: 'Dyktowanie', text: result.sent}],
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
  const historyCopy = entry => (entry.approved || entry.reviewed).map(f => f.text).join('\n\n'); // entry['epikryza']: field texts joined by blank lines, no labels
  const historyStamp = (date, seconds) => { const p = n => String(n).padStart(2, '0'); return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}${seconds ? ':' + p(date.getSeconds()) : ''}`; };
  function history() {
    let filter = '', selectedId = null, page = 'result';
    const html = `<div class="oa-app oa-hist"><input type="search" class="oa-hist-search" placeholder="Szukaj w źródłach, propozycji lub wyniku…" aria-label="Szukaj w historii dokumentów"><div class="oa-hist-split"><div class="oa-hist-list" role="listbox" tabindex="0" aria-label="Dokumenty w historii" data-list></div><div class="oa-hist-doc"><p class="oa-hist-summary" data-summary></p><div class="oa-tabs" role="tablist" aria-label="Zapisany dokument" data-doc-tabs></div><textarea readonly class="oa-rv-doc" data-doc-text aria-label="Zapisany dokument"></textarea></div></div><footer class="oa-footer">${button('Kopiuj wynik', 'copy-history', '', '', 'disabled')}${button('Usuń wpis', 'delete-history', '', '', 'disabled')}<span class="oa-pg-gap"></span>${button('Odśwież', 'refresh')}${button('Zamknij', 'close')}</footer></div>`;
    const win = makeWindow('opisai-history', 'OpisAI — Historia dokumentów', 1100, 740, html, () => { historyRefresh = null; }), root = win.content; escapeCloses(win);
    const visible = () => state.history.filter(e => !filter || [historyStamp(e.ts), ...e.sources.map(s => s.text), ...e.proposal.map(f => f.text), ...(e.approved || e.reviewed).map(f => f.text)].join('\n').toLowerCase().includes(filter));
    function draw() { keepFocus(root, render); }
    function render() {
      const items = visible(), entry = items.find(e => e.id === selectedId) || items[0] || null; selectedId = entry?.id || null;
      $('[data-list]', root).innerHTML = items.map(e => `<button type="button" role="option" class="oa-hist-item ${e.id === selectedId ? 'selected' : ''}" aria-selected="${e.id === selectedId}" data-entry="${e.id}"><span>${esc(historyStamp(e.ts) + ' · ' + (HISTORY_MODE[e.mode] || 'Dokument'))}</span><span>${esc(HISTORY_STATUS[e.status] || 'Sprawdź wynik')}</span></button>`).join('');
      $$('[data-entry]', root).forEach(el => el.addEventListener('click', () => { selectedId = el.dataset.entry; draw(); }));
      const pages = entry ? historyPages(entry) : []; if (!pages.some(p => p[0] === page)) page = 'result';
      $('[data-summary]', root).textContent = entry ? `${HISTORY_SUMMARY[entry.status] || 'Zapisany wynik'} · ${historyStamp(entry.ts, true)}\nZapisany stan dokumentu; ten podgląd nie zmienia bieżącej wizyty.` : 'Ten wpis nie zawiera zapisanego przebiegu przygotowania dokumentu.';
      $('[data-doc-tabs]', root).innerHTML = pages.map(([id, label, title]) => `<button type="button" role="tab" class="oa-tab ${page === id ? 'active' : ''}" aria-selected="${page === id}" data-page="${id}" title="${esc(title)}">${esc(label)}</button>`).join('');
      $$('[data-page]', $('[data-doc-tabs]', root)).forEach(el => el.addEventListener('click', () => { page = el.dataset.page; draw(); }));
      const text = $('[data-doc-text]', root); text.hidden = !entry; text.value = pages.find(p => p[0] === page)?.[3] || '';
      const copy = $('[data-action="copy-history"]', root); copy.disabled = !(entry && historyCopy(entry)); $('span', copy).textContent = entry?.approved ? 'Kopiuj wynik' : 'Kopiuj wersję roboczą';
      $('[data-action="delete-history"]', root).disabled = !entry;
    }
    $('[data-list]', root).addEventListener('keydown', e => { if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; e.preventDefault(); const items = visible(), i = items.findIndex(x => x.id === selectedId), next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (next) { selectedId = next.id; draw(); $('.oa-hist-item.selected', root)?.focus(); } });
    $('.oa-hist-search', root).addEventListener('input', e => { filter = e.target.value.trim().toLowerCase(); draw(); });
    bind(root, 'copy-history', () => { const e = state.history.find(x => x.id === selectedId); if (e && historyCopy(e)) copyText(historyCopy(e), $('[data-action="copy-history"]', root)); });
    bind(root, 'delete-history', () => { const id = selectedId; if (!id) return; messageBox({id: 'opisai-history-delete', title: 'Usuń wpis z historii?', icon: 'question', text: 'Usunąć ten dokument z historii OpisAI?', buttons: [{label: 'Nie', action: 'close', default: true}, {label: 'Tak', action: 'yes', primary: true, onClick: () => { state.history = state.history.filter(e => e.id !== id); draw(); }}]}); });
    bind(root, 'refresh', draw); bind(root, 'close', () => win.close());
    historyRefresh = () => { if (win.el?.isConnected) draw(); };
    draw();
  }
  /* O aplikacji OpisAI (ui/about.py, domain/app_info.py): header above the tabs, short pages that never scroll, copy
   * buttons without settings or keys. Contact: name, company and e-mail only (the full data are in the application);
   * licences as in rc32, with a third entry for the demonstration page itself. */
  const APP_RELEASE_NOTES=['Panel badania ma poprawioną pisownię notatki; cytat lekarza w szczegółach.','Tylko pisownia: inne słowa, liczby i przeczenia zostają jak w notatce.','„Szmerów” zostaje przy drogach oddechowych; nazwa wiersza się nie dubluje.','„Sygnalment” zamiast „Sygnalement”; kreski nie chowają się pod Kliniką.']; // RELEASE_NOTES["0.12.0rc32"]
  const APP_CAPABILITIES=['Epikryzy z notatek i wpisywanie zatwierdzonej treści do Kliniki.','Dyktowanie: Gemini, Whisper lokalnie, ChatGPT w przeglądarce (próba).','Podgląd tekstu na żywo i kontrola układu dokumentacji.','Konfiguracja Gemini z logowaniem Google.']; // capability_summary()
  const TRANSCRIPTION_SUMMARY='Gemini, Whisper lokalnie, ChatGPT w przeglądarce (próba)'; // transcription.TRANSCRIPTION_BACKENDS labels
  const APP_UPDATE_STATUS='Aktualizacje online: nie skonfigurowano źródła wydań.',LICENSE_NAME='PolyForm Internal Use 1.0.0',CONTACT_EMAIL='guziczak@proton.me';
  const providerNames=()=>uniq(PROVIDERS.map(s=>s.id)).map(id=>PROVIDERS.find(s=>s.id===id).label); // provider_names()
  const applicationInfoText=()=>[`OpisAI ${VERSION}`,'Asystent dokumentacji weterynaryjnej','Generowanie: '+providerNames().join(', '),'Dyktowanie: '+TRANSCRIPTION_SUMMARY,'Kontrola informacji o wydaniu (lokalnie): spójne',APP_UPDATE_STATUS,'Licencja: '+LICENSE_NAME].join('\n'); // application_info_text()
  const THIRD_PARTY_LICENSES=[['PySide6 (Qt for Python)','LGPL v3'],['shiboken6','LGPL v3'],['pywinauto','BSD-3-Clause'],['pywin32','PSF License'],['cryptography','Apache 2.0 / BSD-3'],['cloudscraper','MIT'],['patchright','Apache 2.0'],['Chromium','BSD-3-Clause i inne'],['whisper.cpp (silnik dyktowania osadzony w programie)','MIT'],['Ollama (pobierana przy pierwszym użyciu lokalnego AI)','MIT']];
  const LICENSE_TEXTS={ // LICENSE.txt of 0.12.0rc32, license_summary() with THIRD_PARTY_LICENSES, and this page
    app:`OpisAI
Copyright (c) 2026 Łukasz Guziczak (GUITS). Wszelkie prawa zastrzeżone.

Licencja: PolyForm Internal Use License 1.0.0
https://polyformproject.org/licenses/internal-use/1.0.0

Rozpowszechnianie, odsprzedaż lub udostępnianie OpisAI innym podmiotom
wymaga pisemnej zgody Łukasza Guziczaka (GUITS).

================================================================================

# PolyForm Internal Use License 1.0.0

<https://polyformproject.org/licenses/internal-use/1.0.0>

## Acceptance

In order to get any license under these terms, you must agree
to them as both strict obligations and conditions to all
your licenses.

## Copyright License

The licensor grants you a copyright license for the software
to do everything you might do with the software that would
otherwise infringe the licensor's copyright in it for any
permitted purpose.  However, you may only make changes or
new works based on the software according to [Changes and New
Works License](#changes-and-new-works-license), and you may
not distribute the software.

## Changes and New Works License

The licensor grants you an additional copyright license to
make changes and new works based on the software for any
permitted purpose.

## Patent License

The licensor grants you a patent license for the software that
covers patent claims the licensor can license, or becomes able
to license, that you would infringe by using the software.

## Fair Use

You may have "fair use" rights for the software under the
law. These terms do not limit them.

## Internal Business Use

Use of the software for the internal business operations of
you and your company is use for a permitted purpose.

## No Other Rights

These terms do not allow you to sublicense or transfer any of
your licenses to anyone else, or prevent the licensor from
granting licenses to anyone else.  These terms do not imply
any other licenses.

## Patent Defense

If you make any written claim that the software infringes or
contributes to infringement of any patent, your patent license
for the software granted under these terms ends immediately. If
your company makes such a claim, your patent license ends
immediately for work on behalf of your company.

## Violations

The first time you are notified in writing that you have
violated any of these terms, or done anything with the software
not covered by your licenses, your licenses can nonetheless
continue if you come into full compliance with these terms,
and take practical steps to correct past violations, within
32 days of receiving notice.  Otherwise, all your licenses
end immediately.

## No Liability

***As far as the law allows, the software comes as is, without
any warranty or condition, and the licensor will not be liable
to you for any damages arising out of these terms or the use
or nature of the software, under any kind of legal claim.***

## Definitions

The **licensor** is the individual or entity offering these
terms, and the **software** is the software the licensor makes
available under these terms.

**You** refers to the individual or entity agreeing to these
terms.

**Your company** is any legal entity, sole proprietorship,
or other kind of organization that you work for, plus all
organizations that have control over, are under the control of,
or are under common control with that organization.  **Control**
means ownership of substantially all the assets of an entity,
or the power to direct its management and policies by vote,
contract, or otherwise.  Control can be direct or indirect.

**Your licenses** are all the licenses granted to you for the
software under these terms.

**Use** means anything you do with the software requiring one
of your licenses.

================================================================================

MEDICAL DISCLAIMER (DODATKOWY)

OpisAI jest narzędziem pomocniczym do tworzenia dokumentacji weterynaryjnej.
Treści generowane przez aplikację (epikryzy, rozpoznania, zalecenia) opierają
się na modelach AI i MUSZĄ być zweryfikowane przez wykwalifikowanego
lekarza weterynarii przed wykorzystaniem w dokumentacji medycznej pacjenta.

Aplikacja NIE zastępuje profesjonalnej oceny lekarskiej, badania klinicznego
ani decyzji diagnostyczno-terapeutycznej. Autorzy i kontrybutorzy nie ponoszą
odpowiedzialności za błędy diagnostyczne, terapeutyczne ani administracyjne
wynikłe z użycia tego oprogramowania.

Lekarz weterynarii korzystający z aplikacji ponosi pełną odpowiedzialność
zawodową za treść dokumentacji medycznej pacjenta.
`,
    deps:['Licencja programu: '+LICENSE_NAME+' — do użytku wewnętrznego licencjobiorcy, bez prawa rozpowszechniania. Biblioteki i modele zachowują własne licencje; ich pełne teksty są dołączone do pakietów poszczególnych zależności.','','Wybrane biblioteki:','',...THIRD_PARTY_LICENSES.map(([name,license])=>name+' — '+license),'','Pełne teksty licencji bibliotek i ich zależności są dołączone do odpowiednich pakietów.'].join('\n'),
    demo:`Interaktywna demonstracja OpisAI (ta strona)
© 2026 Łukasz Guziczak (GUITS). Wszelkie prawa zastrzeżone, o ile nie zaznaczono inaczej.

Strona odtwarza interfejs OpisAI ${VERSION} w HTML, CSS i JavaScript. Nie zawiera programu OpisAI ani jego bibliotek; licencja PolyForm Internal Use 1.0.0 opisana wyżej dotyczy aplikacji.

Zasoby strony:
Selawik (zapasowa czcionka zamiast Segoe UI) — SIL Open Font License 1.1, © Microsoft Corporation; pełny tekst w assets/fonts/LICENSE.txt.
Tapety Horyzont i ikony narzędzi — przygotowane dla tej demonstracji (assets/ASSET_SOURCES.md).

Znaki towarowe:
Klinika XP jest produktem firmy BRI. Makieta okna Kliniki w tej demonstracji to niezależna rekonstrukcja z fikcyjnymi danymi, a nie produkt BRI.
Windows jest znakiem towarowym Microsoft Corporation. Pulpit demonstracji to jego własna stylizacja.

Dane wizyt są fikcyjne. Wynik demonstracji nie jest poradą weterynaryjną.`};
  function about(initial='about'){
    let page=['about','changes','contact','licenses'].includes(initial)?initial:'about',license='app';
    const tabs=[['about','O aplikacji'],['changes','Co nowego'],['contact','Kontakt'],['licenses','Licencje']];
    const html=`<div class="oa-app oa-about"><header class="oa-about-head"><span class="oa-about-mark" aria-hidden="true">${icon('opisai',30)}</span><div class="oa-about-id"><div class="oa-about-title"><h1>OpisAI</h1><span class="oa-about-version">Wersja ${VERSION}</span></div><p>Asystent dokumentacji weterynaryjnej</p></div></header><div class="oa-tabs oa-about-tabs" role="tablist" aria-label="Informacje o aplikacji">${tabs.map(([id,label])=>`<button type="button" role="tab" class="oa-tab" data-about="${id}">${label}</button>`).join('')}</div><div class="oa-about-page" role="tabpanel" data-about-page></div><p class="oa-about-demo">Interaktywna demonstracja w przeglądarce — bez połączeń z AI i bez mikrofonu.</p><footer class="oa-footer oa-about-foot">${button('Kopiuj wersję','copy-version')}${button('Kopiuj informacje','copy-about','','','title="Kopiuj wersję i możliwości aplikacji — bez ustawień i kluczy"')}<span class="oa-pg-gap"></span>${button('Zamknij','close','primary')}</footer></div>`;
    const win=makeWindow('opisai-about','O aplikacji OpisAI',840,540,html),root=win.content;escapeCloses(win);
    if(win.options)Object.assign(win.options,{minWidth:Math.min(640,innerWidth-16),minHeight:Math.min(460,innerHeight-60)}); // AboutDialog.setMinimumSize(640, 460)
    function draw(){
      $$('[data-about]',root).forEach(el=>{const on=el.dataset.about===page;el.classList.toggle('active',on);el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;});
      const target=$('[data-about-page]',root);target.setAttribute('aria-label',tabs.find(t=>t[0]===page)[1]);
      if(page==='about')target.innerHTML=`<section class="oa-about-card oa-about-grow"><h2>Możliwości</h2><ul>${APP_CAPABILITIES.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><p>Generowanie: ${esc(providerNames().join(' · '))}</p><p>Przed wpisaniem do dokumentacji lekarz weterynarii sprawdza i zatwierdza treść. OpisAI nie zastępuje oceny lekarskiej.</p>`;
      else if(page==='changes')target.innerHTML=`<h2>Zmiany w wersji ${VERSION}</h2><ul class="oa-about-notes">${APP_RELEASE_NOTES.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><span class="oa-pg-gap"></span><p title="Automatyczna kontrola informacji zapisanych w tym wydaniu aplikacji.">Wersja i informacje o wydaniu są spójne.</p><p>${esc(APP_UPDATE_STATUS)}</p>`;
      else if(page==='contact'){
        target.innerHTML=`<div class="oa-about-columns"><section class="oa-about-card"><h2>Autor i kontakt</h2><h3>Łukasz Guziczak</h3><p class="oa-about-select">${CONTACT_EMAIL}</p></section><section class="oa-about-card"><h2>GUITS</h2><p class="oa-muted">Pełne dane kontaktowe autora i firmy (telefon, adres, NIP i REGON) są w aplikacji, w tej samej zakładce. Demonstracja pokazuje tylko imię i nazwisko, nazwę firmy i e-mail.</p></section></div><div class="oa-inline-controls"><a class="oa-btn" href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('OpisAI — wsparcie')}" title="Otwórz nową wiadomość w programie pocztowym">Napisz e-mail</a>${button('Kopiuj e-mail','copy-email')}${button('Kopiuj dane kontaktowe','copy-contact')}</div>`;
        bind(target,'copy-email',()=>copyText(CONTACT_EMAIL,$('[data-action="copy-email"]',target)));
        bind(target,'copy-contact',()=>copyText(`Łukasz Guziczak — GUITS\n${CONTACT_EMAIL}`,$('[data-action="copy-contact"]',target)));
      } else {
        target.innerHTML=`<select data-license aria-label="Wybierz dokument licencyjny">${[['app','Licencja OpisAI — pełny tekst'],['deps','Wybrane biblioteki i licencje'],['demo','Ta demonstracja — prawa i zasoby strony']].map(([value,label])=>`<option value="${value}" ${value===license?'selected':''}>${label}</option>`).join('')}</select><textarea readonly class="oa-about-license" aria-label="Treść dokumentu licencyjnego"></textarea>`;
        const view=$('textarea',target),select=$('[data-license]',target);view.value=LICENSE_TEXTS[license];
        select.addEventListener('change',()=>{license=select.value;view.value=LICENSE_TEXTS[license]||'';view.scrollTop=0;});
      }
    }
    $$('[data-about]',root).forEach(el=>{
      el.addEventListener('click',()=>{page=el.dataset.about;draw();});
      el.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const i=tabs.findIndex(t=>t[0]===page);page=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length][0];draw();$(`[data-about="${page}"]`,root)?.focus();});
    });
    bind(root,'close',()=>win.close());
    bind(root,'copy-version',()=>copyText(`OpisAI ${VERSION}`,$('[data-action="copy-version"]',root)));
    bind(root,'copy-about',()=>copyText(applicationInfoText(),$('[data-action="copy-about"]',root)));
    draw();setTimeout(()=>$('[data-about].active',root)?.focus(),0);
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
  function hintText(){return orb.phys?'⌨ TRYB FIZYKI (30s)\n←→ poruszanie\nSPACJA hold = ladowanie odbicia (zwolnij = launch!)':`OpisAI · ${modelLabel()}\nOpisAI ${VERSION}`;}
  function showHint(text=hintText()){
    if(!orb.el||state.closed)return;
    let hint=$('.oa-orb-hint');if(!hint){hint=document.createElement('div');hint.className='oa-orb-hint';hint.setAttribute('role','tooltip');hint.id='oa-orb-hint';(document.getElementById('overlay-layer')||document.body).append(hint);}
    hint.textContent=text;hint.hidden=false;hint.classList.toggle('oa-theme-dark',themeName()==='dark'); // BubbleHint uses shell.colors(): the OpisAI theme
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
    const el=Shell.menu(orbMenuItems(),x,y,{className:'oa-menu'+(themeName()==='dark'?' oa-theme-dark':''),flip:true,onClose:()=>{orb.menuBlock=nowS()+.35;}}); // submenus share the class
    if(options.keyboard&&el?.querySelector)el.querySelector('button:not(:disabled)')?.focus();
    return el;
  }
  function orbMenuItems(){ // MacroController._setup_tray: same order, separators and submenus
    const unavailable=name=>()=>{unavailableToast?.remove?.();unavailableToast=toast(`„${name}” jest niedostępne w demonstracji. Okna i pola Kliniki XP są tu przypisane na stałe.`);}; // each replaces the last, so they never stack over the bubble
    const dot='<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="#22c55e"/></svg>';
    return [
      {label:'Wybierz okno główne...',icon:'computer',onClick:unavailable('Wybierz okno główne')},
      {label:'Wybierz podokno opisu...',icon:'window',onClick:unavailable('Wybierz podokno opisu')},
      {label:'Wskaż pole tekstowe',icon:'view',children:()=>Object.keys(FIELDS).map(key=>({label:{wywiad:'Wywiad:',badanie:'Badanie kliniczne:',diagnoza:'Diagnoza:'}[key],iconHtml:dot,title:key==='diagnoza'?'Wskaż trzecie pole tekstowe Kliniki dla diagnozy.':'Pole już wskazane — kliknij, by wskazać ponownie.',onClick:unavailable('Wskaż pole tekstowe')}))},
      {label:'Skonfiguruj rączki (main)...',icon:'cursor',onClick:unavailable('Skonfiguruj rączki')},
      {separator:true},
      {label:'🎤  Dyktowanie (lub przytrzymaj bąbelek)',icon:'volume',onClick:()=>dictate()},
      {label:'🎙  Profil głosu (rozpoznawanie mówców)…',title:'Kalibracja głosu do oznaczania mówców w dyktowaniu (czytanka ~2 min)',onClick:()=>settings('dictation')},
      {label:'Podpowiedzi pisowni',children:()=>{const sp=window.OpisAISpelling,ready=!!(preferences.spelling&&sp?.available());return [ // _refresh_spelling_menu on aboutToShow
        {label:'Podkreślaj podejrzane słowa w Klinice',checked:!!preferences.spelling,onClick:()=>{preferences.spelling=!preferences.spelling;savePreferences();sp?.refresh();}}, // _set_spelling_enabled: the one source
        {label:'Sugestie dla aktywnej wizyty…',disabled:!ready,onClick:()=>sp.showIssues()},
        {label:'Cofnij ostatnią poprawkę pisowni',disabled:!ready,onClick:()=>sp.undo()},
        {label:'Mój słownik…',onClick:sp?()=>sp.editWords():unavailable('Mój słownik')},
        {label:sp?.status()||'Sprawdzanie pisowni',disabled:true}];}}, // the spelling status (SpellingController.status_changed)
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
  /* MacroController._spelling_target: no spelling lines while OpisAI reads, generates, reviews, writes, dictates or
   * has its settings open. SafeCoordinator.busy names its work, and so do these views: compose, review and the undo
   * confirmation (_review_open), progress (job, _capture_busy, _writing), settings (_settings_open), dictation and its
   * discard question (dictation_state.active). Other OpisAI windows are not work: notices and recovery reports (_say,
   * _show_problem), history, About, a profile view. The operation record is not either: "Odrzuć" or × leave it behind. */
  const SPELLING_WORK=['opisai-compose','opisai-review','opisai-undo','opisai-progress','opisai-settings','opisai-dictation','opisai-discard'];
  const spellingBusy=()=>!!(state.job||state.review||state.recording||state.receipt)||['processing','recording','review'].includes(state.phase)||SPELLING_WORK.some(id=>!!windows.get(id)?.el?.isConnected);
  window.OpisAISpelling?.connect({enabled:()=>!!preferences.spelling,busy:spellingBusy,running:()=>!state.closed,theme:()=>themeName()}); // assets/opisai-spelling.js
  function trayTooltip(){return state.closed?'OpisAI — zamknięte\nKliknij, aby uruchomić':`OpisAI — ${modelLabel()}\nKlik: opisz · Przytrzymaj: dyktuj · Prawy: menu`;}
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
    Shell.registerApp({id:'opisai',title:'OpisAI',icon:'opisai',open:showBubble}); // a second start raises the running bubble
    window.addEventListener('clinic:focus',event=>{state.activeField=event.detail?.field||state.activeField;});
    document.addEventListener('keydown',dictationEnterShortcut,true); // Enter in the dictated Badanie field: "Przepisz fragment" (ChatGPT)
    window.OpisAI={open:describe,prepare:describe,describe,dictate,settings,history,about,showBubble,launch,undo,showMenu,trayTooltip,isClosed:()=>state.closed,getState:()=>({phase:state.phase,history:state.history.length,recording:!!state.recording,closed:state.closed,preferences:{...preferences}})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
