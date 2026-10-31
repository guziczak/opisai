/* OpisAI 0.12.0rc32. A local, interactive reconstruction of the desktop app.
 * Demonstration only: no microphone access, cloud requests or clinical writes.
 * Editable visit data stays locally in this browser. */
(() => {
  'use strict';
  const VERSION = '0.12.0rc32';
  const FIELDS = {wywiad: 'Wywiad', badanie: 'Badanie kliniczne', diagnoza: 'Rozpoznanie'};
  const PREF_KEY = 'opisai-demo-settings-v12';
  const defaults = {provider:'ChatGPT',transport:'Przeglądarka',model:'Wybrany w ChatGPT',theme:'light',transcriber:'ChatGPT',cardMode:'Nagrywa OpisAI',spelling:true,animations:true,idleBounce:true,bounceInterval:10,bounceMax:0,history:true,retention:'30 dni',fontSize:13,livePreview:true,language:'Polski',sentenceLines:false,dictationConsent:false,panel:true,rich:false,diagnosis:false,clinicalSections:['Wywiad','Badanie kliniczne','Rozpoznanie'],panelRows:{temperature:true,heart:true,bcs:true,mass:true},customPrompt:''};
  /* Dyktowanie (rc32 Config): engine (default Gemini Live), ChatGPT language clip, card mode and Autoenter, Gemini mode and
   * consent, local Whisper hardware, model and speakers, and the remembered details view. rc32 has no language or
   * one-sentence-per-line control. */
  Object.assign(defaults,{transcriber:'gemini',chatgptClip:true,cardMode:'own',autoEnter:false,autoEnterSeconds:10,geminiMode:'transcribe',dictationConsent:false,whisperHardware:'auto',whisperModel:'large-v3',diarization:false,diarizationOverlay:true,labelDoctor:'Lekarz',labelOther:'Właściciel',dictationDetails:false});delete defaults.language;delete defaults.sentenceLines;
  let preferences = {...defaults};
  try { const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); for (const key of Object.keys(defaults)) if (key in saved && typeof saved[key] === typeof defaults[key]) preferences[key] = saved[key]; } catch (_) {}
  if(!Array.isArray(preferences.clinicalSections)||preferences.clinicalSections.length!==3)preferences.clinicalSections=[...defaults.clinicalSections];
  if(!preferences.panelRows||typeof preferences.panelRows!=='object')preferences.panelRows={...defaults.panelRows};
  if(!['light','dark','blue'].includes(preferences.theme))preferences.theme='light';
  /* Config idle_bounce_*: 10–3600 s between bounces, 0 = no limit per idle window. */
  const normalizeBounce=p=>{p.bounceInterval=Number.isFinite(+p.bounceInterval)?Math.max(10,Math.min(3600,Math.round(+p.bounceInterval))):defaults.bounceInterval;p.bounceMax=Number.isFinite(+p.bounceMax)?Math.max(0,Math.min(999,Math.round(+p.bounceMax))):defaults.bounceMax;};
  normalizeBounce(preferences);
  /* Saved dictation choices as rc32 identifiers (the demo's earlier labels map onto them); Autoenter whole seconds 5–600, otherwise 10. */
  const normalizeDictation=p=>{p.transcriber={ChatGPT:'chatgpt_browser','Gemini Live':'gemini','Whisper (lokalnie)':'local_whisper'}[p.transcriber]||(['gemini','local_whisper','chatgpt_browser'].includes(p.transcriber)?p.transcriber:defaults.transcriber);p.cardMode={'Nagrywa OpisAI':'own','Dwie karty':'two'}[p.cardMode]||(['own','two'].includes(p.cardMode)?p.cardMode:'own');if(!['transcribe','agent'].includes(p.geminiMode))p.geminiMode='transcribe';const s=Math.round(Number(p.autoEnterSeconds));p.autoEnterSeconds=s>=5&&s<=600?s:10;if(!['auto','nvidia_external','nvidia_internal','integrated','cpu'].includes(p.whisperHardware))p.whisperHardware='auto';if(!['large-v3','large-v3-turbo','medium','small'].includes(p.whisperModel))p.whisperModel='large-v3';};
  normalizeDictation(preferences);
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
    else {win=Shell.createWindow({id,title,icon:'opisai',width,height,minWidth:Math.min(width,500),minHeight:Math.min(height,360),className:'oa-host oa-theme-'+preferences.theme,content:html,resizable:true,maximizable:true,taskbar:true,onClose:()=>{if(onClose)onClose();}});windows.set(id,win);}
    applyTheme(win); if(win?.el)win.el.dataset.oaWindow=id; holdPosition(); return win; // a work view stops the idle bounce where it is
  }
  function closeWin(id) { windows.get(id)?.close(); }
  function getFields() { return clone(window.Clinic?.getFields?.() || {wywiad:'',badanie:'',diagnoza:''}); }
  function validOption(options) {return options && typeof options==='object' && !('target' in options && options.target instanceof Element)?options:{};}
  /* The compose view. The bubble stays at rest (blue "OpisAI") while it is open; its actions recall it. */
  function prepare(options={}) {
    options=typeof options==='string'?{field:options}:validOption(options);
    beginOperation();if(!visitReady())return; // also "Odczytaj ponownie" and "Generuj opis" from the review
    closeWin('opisai-review');
    const snapshot=clone(options.snapshot||getFields());
    const sources=clone(options.sources||snapshot);
    const field=FIELDS[options.field]?options.field:null;
    const variant={rich:preferences.rich,panel:preferences.panel,diagnosis:preferences.diagnosis};
    if(field && field!=='badanie')variant.panel=false;
    if(field==='diagnoza')variant.diagnosis=true;
    const session=options.session??window.Clinic?.getContext?.().session;
    const op={id:++state.token,snapshot,sources,variant,field,session,fromDictation:!!options.fromDictation,approved:false,details:false};
    state.operation=op;state.review=null;
    const cards=Object.entries(FIELDS).filter(([key])=>!field||key===field).map(([key,label])=>`<div class="oa-source-card ${key==='diagnoza'&&!variant.diagnosis?'out-of-scope':''}" data-source-card="${key}"><h3>${esc(label)}</h3><textarea data-source="${key}" aria-label="${esc(label)} — źródło do opracowania, edytowalne" spellcheck="false">${esc(sources[key]||'')}</textarea><div class="oa-source-status">${key==='diagnoza'&&!variant.diagnosis?'Poza wybranym zakresem — rozpoznanie nie będzie opracowywane.':''}</div></div>`).join('');
    const html=`<div class="oa-app oa-compose"><header class="oa-header"><div class="oa-header-row"><div><h1>${field?'Przygotuj opis pola':'Przygotuj opis wizyty'}</h1><p class="oa-route">${icon('shield',13)} <span data-route>${esc(route())}</span></p></div>${button('Połączenie i model','connection','link small','settings')}</div></header><div class="oa-content"><div class="oa-compose-body"><section class="oa-source-panel"><div class="oa-section-label" data-source-heading>Treść pól</div><div data-sources>${cards}</div><textarea class="oa-rules" readonly aria-label="Zasady i źródła" hidden></textarea>${button('Pokaż zasady i źródła','rules','small','document')}</section><section class="oa-options-panel"><div class="oa-section-label">Sposób opracowania</div><div class="oa-variant-grid">${[true,false].map(rich=>`<div class="oa-variant-row-label">${rich?'Bogato':'Wiernie'}</div>${[0,1,2].map(col=>`<button class="oa-variant ${variant.rich===rich&&(variant.diagnosis?2:variant.panel?1:0)===col?'selected':''}" type="button" data-variant="${rich?'rich':'faithful'}-${col}" aria-label="${rich?'Bogato':'Wiernie'} — ${['sam opis','z panelem parametrów','z panelem i rozpoznaniem'][col]}" ${field&&((col===1&&field!=='badanie')||(col===2&&field==='wywiad'))?'disabled':''}><span class="oa-tick">${icon('check',13)}</span>${col===0?'Sam opis':col===1?'+ panel<br>parametrów':'+ panel<br>+ rozpoznanie'}</button>`).join('')}`).join('')}</div><div class="oa-variant-explanation" data-variant-description></div>${notice('Dane pacjenta i właściciela pozostają w oknie Kliniki. Sprawdź treść pól przed przygotowaniem opisu.')}<div style="margin-top:12px">${button('Ustawienia sekcji opisu','sections','link small','settings')}</div></section></div><div class="oa-notice error" data-compose-error hidden></div></div><div class="oa-ack-area">${check(`Sprawdzone: tylko te pola, bez danych osobowych właściciela i personelu.`,'oa-compose-ack')}<div class="oa-ack-note" data-ack-note>Potwierdzenie dotyczy pokazanych źródeł i wybranego zakresu.</div></div><footer class="oa-footer"><span class="oa-footnote" data-compose-foot>Pola wizyty pozostaną bez zmian.<br>OpisAI ${VERSION}</span>${button('Anuluj','cancel')}${button('Przygotuj podgląd','generate','primary','play','disabled')}</footer></div>`;
    const win=makeWindow('opisai-compose','OpisAI — przygotuj opis wizyty',800,680,html,()=>{state.operation=null;});state.active=win;
    const root=win.content,ack=$('#oa-compose-ack',root),submit=$('[data-action="generate"]',root);
    function refresh(reset=false) {
      if(reset){ack.checked=false;op.approved=false;$('[data-ack-note]',root).textContent='Zmieniła się treść lub zakres — zaznacz potwierdzenie ponownie.';}
      const col=op.variant.diagnosis?2:op.variant.panel?1:0;
      $$('[data-variant]',root).forEach(el=>{const [r,c]=el.dataset.variant.split('-');const active=(r==='rich')===op.variant.rich && Number(c)===col;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
      const style=op.variant.rich?'Bogato':'Wiernie';
      $('[data-variant-description]',root).innerHTML=`<strong>${style} · ${col===0?'sam opis':col===1?'panel parametrów':'panel i rozpoznanie'}</strong>${op.variant.rich?'Uporządkowany, rozwinięty opis na podstawie przekazanych ustaleń. Rozpoznanie pozostaje propozycją do sprawdzenia.':'Uporządkowanie języka z zachowaniem informacji i znaczenia źródła.'}<span class="oa-muted">${col>0?'Panel zbiera parametry występujące w źródłach. Brakujących wartości nie uzupełniamy.':'Bez dodawania panelu parametrów.'}</span>`;
      const diag=$('[data-source-card="diagnoza"]',root);if(diag){diag.classList.toggle('out-of-scope',!op.variant.diagnosis);$('.oa-source-status',diag).textContent=op.variant.diagnosis?'':'Poza wybranym zakresem — rozpoznanie nie będzie opracowywane.';}
      const nonempty=Object.entries(op.sources).some(([key,value])=>(!field||field===key)&&(key!=='diagnoza'||op.variant.diagnosis)&&String(value).trim());
      submit.disabled=!ack.checked||!nonempty;
      $('.oa-rules',root).value=`ZASADY OPRACOWANIA\n\nZachowaj fakty, liczby, jednostki i przeczenia. Nie dopisuj nieobecnych ustaleń. Rozdziel dane z wizyty od wnioskowania.\n\nWARIANT: ${style}${col>0?' + panel parametrów':''}${col>1?' + rozpoznanie':''}\n\nŹRÓDŁA\n\n`+Object.entries(op.sources).filter(([key])=>(!field||key===field)&&(key!=='diagnoza'||op.variant.diagnosis)).map(([key,value])=>`${FIELDS[key]}:\n${value}`).join('\n\n');
    }
    $$('[data-source]',root).forEach(editor=>editor.addEventListener('input',()=>{op.sources[editor.dataset.source]=editor.value;refresh(true);}));
    $$('[data-variant]',root).forEach(el=>el.addEventListener('click',()=>{const[r,c]=el.dataset.variant.split('-');const next={rich:r==='rich',panel:+c>0,diagnosis:+c===2};if(field==='diagnoza')next.diagnosis=true;const scopeChanged=next.panel!==op.variant.panel||next.diagnosis!==op.variant.diagnosis;op.variant=next;refresh(scopeChanged);}));
    ack.addEventListener('change',()=>{op.approved=ack.checked;refresh();});
    bind(root,'rules',()=>{op.details=!op.details;$('[data-sources]',root).hidden=op.details;$('.oa-rules',root).hidden=!op.details;$('[data-source-heading]',root).textContent=op.details?'Zasady i źródła':'Treść pól';$('[data-action="rules"] span',root).textContent=op.details?'Wróć do edycji źródeł':'Pokaż zasady i źródła';refresh();});
    bind(root,'connection',()=>settings('connection'));bind(root,'sections',()=>settings('sections'));
    bind(root,'cancel',()=>{win.close();state.operation=null;state.active=null;setPhase('idle');});
    bind(root,'generate',()=>{if(submit.disabled||!ack.checked)return;op.approved=true;preferences.rich=op.variant.rich;preferences.panel=op.variant.panel;preferences.diagnosis=op.variant.diagnosis;savePreferences();win.close();generate(op);});
    refresh();
  }
  const SAMPLE = {
    wywiad:'Szczur, samiec, fancy rat, 1 rok 9 mies., ok. 420 g. Od ~2 tygodni nasilające się kichanie i świszczący oddech, czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych.',
    badanie:'Stan ogólny obniżony, postawa zgarbiona, sierść nastroszona. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchowo nad polami płucnymi rzężenia i świsty. BCS 2/5. T 37,8°C, HR ok. 360/min.',
    diagnoza:'Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych.'
  };
  const normal=text=>String(text).replace(/\s+/g,' ').trim().toLowerCase();
  const polish=text=>String(text).replace(/nastroszna/g,'nastroszona').replace(/Osłuchwo/g,'Osłuchowo').replace(/rzęzenia/g,'rzężenia').replace(/rózowe/g,'różowe').replace(/osłuchowoo/g,'osłuchowo').replace(/temperatuta/g,'temperatura').replace(/[ \t]+\n/g,'\n').trim();
  function formatSources(op) {
    const output={};
    const keys=op.field?[op.field]:['wywiad','badanie',...(op.variant.diagnosis?['diagnoza']:[])];
    for(const key of keys){
      let text=polish(op.sources[key]||'');
      if(normal(text)===normal(SAMPLE[key])){
        if(key==='wywiad')text=op.variant.rich?'Pacjent: szczur, samiec, odmiana hodowlana (fancy rat), w wieku 1 roku i 9 miesięcy, o masie ciała około 420 g.\n\nOd około dwóch tygodni występują nasilające się kichanie i świszczący oddech. Wokół nozdrzy i oczu widoczna jest czerwonobrązowa wydzielina porfirynowa. Zgłoszono apatię, zmniejszony apetyt i spadek masy ciała. Zwierzę utrzymywane jest na ściółce z trocin sosnowych.':'Szczur, samiec, fancy rat, 1 rok i 9 miesięcy, masa ciała ok. 420 g. Od ok. 2 tygodni nasilające się kichanie i świszczący oddech. Porfiryna wokół nozdrzy i oczu. Apatia, zmniejszony apetyt i chudnięcie. Ściółka z trocin sosnowych.';
        if(key==='badanie')text=op.variant.rich?'Stan ogólny obniżony. Zwierzę przyjmuje zgarbioną postawę; sierść nastroszona. Wokół nozdrzy i w kątach oczu widoczna zaschnięta porfiryna.\n\nOddech przyspieszony, z wysiłkiem brzusznym. Osłuchowo nad polami płucnymi stwierdzono rzężenia i świsty. Kondycja ciała: BCS 2/5. Temperatura: 37,8 °C. Częstość pracy serca: około 360/min.':'Stan ogólny obniżony, postawa zgarbiona, sierść nastroszona. Zaschnięta porfiryna wokół nozdrzy i w kątach oczu. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchowo nad polami płucnymi rzężenia i świsty. BCS 2/5. Temperatura 37,8 °C, HR ok. 360/min.';
        if(key==='diagnoza')text='Rozpoznanie robocze na podstawie notatki:\nPodejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych.\n\nRozpoznanie wymaga oceny lekarza prowadzącego.';
      }
      if(text || op.field)output[key]=text;
    }
    if(op.variant.panel && 'badanie' in output){
      const source=Object.entries(op.sources).filter(([key])=>(!op.field||key===op.field)&&(key!=='diagnoza'||op.variant.diagnosis)).map(([,value])=>value).join('\n'),rows=[];
      const temp=source.match(/(?:\bT\s*|temperatura\s*:?\s*)(\d{2}[,.]\d)\s*°?\s*C/i);
      const hr=source.match(/(?:\bHR|czynność serca|częstość pracy serca)\s*:?[ \t]*(?:ok\.?\s*)?(\d{2,3})\s*\/\s*min/i);
      const bcs=source.match(/\bBCS\s*:?\s*(\d\s*\/\s*\d)/i);
      const mass=source.match(/(?:ok\.?\s*)?(\d{2,4}(?:[,.]\d+)?)\s*(kg|g)\b/i);
      if(temp&&preferences.panelRows.temperature)rows.push('Temperatura: '+temp[1].replace('.',',')+' °C');if(hr&&preferences.panelRows.heart)rows.push('Czynność serca: ok. '+hr[1]+'/min');if(bcs&&preferences.panelRows.bcs)rows.push('BCS: '+bcs[1]);if(mass&&preferences.panelRows.mass)rows.push('Masa ciała: '+mass[1]+' '+mass[2]);
      if(rows.length)output.badanie='Parametry ze źródeł\n'+rows.join('\n')+'\n\nBadanie kliniczne\n'+output.badanie;
    }
    return output;
  }
  function generate(op) {
    if(!op?.approved)return;
    const token=++state.token;state.operation=op;state.review=null;
    const outputs=formatSources(op),fullText=Object.entries(outputs).map(([key,value])=>`${FIELDS[key]}\n${value}`).join('\n\n');
    const html=`<div class="oa-app"><div class="oa-content"><div class="oa-progress-center"><div class="oa-progress-mark">${icon('opisai',34)}</div><div class="oa-progress-title" data-progress-title>Przygotowuję źródła</div><div class="oa-progress-sub">${esc(route())}</div><div class="oa-progress-track"><div data-progress-bar></div></div><div class="oa-progress-steps"><span class="active" data-step="0">Odczyt pól</span><span data-step="1">Opracowanie</span><span data-step="2">Sprawdzenie wyniku</span></div></div>${notice('Powstaje wersja robocza. W następnym oknie sprawdzisz tekst i zdecydujesz o wpisaniu.')}<div style="margin-top:14px;text-align:center">${button('Pokaż tekst na żywo','live','primary','eye')}</div><section class="oa-live-preview ${preferences.livePreview?'open':''}"><div class="oa-live-head"><span>Wersja robocza</span>${button('Ukryj','hide-live','link small')}</div><pre data-stream></pre></section></div><footer class="oa-footer"><span class="oa-footnote">Pola wizyty pozostają bez zmian.</span>${button('Anuluj','cancel')}</footer></div>`;
    const win=makeWindow('opisai-progress','OpisAI — przygotowanie opisu',610,540,html);state.active=win;const root=win.content;
    bind(root,'live',()=>{$('.oa-live-preview',root).classList.add('open');preferences.livePreview=true;savePreferences();});bind(root,'hide-live',()=>{$('.oa-live-preview',root).classList.remove('open');preferences.livePreview=false;savePreferences();});
    let done=0;
    const timer=setInterval(()=>{
      if(token!==state.token){clearInterval(timer);if(state.job?.token===token)state.job=null;return;}
      done+=1;const progress=Math.min(100,done/28*100),step=done<5?0:done<23?1:2;
      $('[data-progress-bar]',root).style.width=progress+'%';
      $('[data-progress-title]',root).textContent=['Czytam zatwierdzone pola','Przygotowuję opis wizyty','Sprawdzam strukturę i parametry'][step];
      $$('[data-step]',root).forEach(x=>x.classList.toggle('active',Number(x.dataset.step)===step));
      $('[data-stream]',root).textContent=fullText.slice(0,Math.floor(fullText.length*Math.max(0,(done-4)/21)));
      const live=$('.oa-live-preview',root);live.scrollTop=live.scrollHeight;
      if(done>=28){clearInterval(timer);state.job=null;win.close();const result={id:op.id,snapshot:op.snapshot,sources:op.sources,session:op.session,output:outputs,variant:op.variant,field:op.field,mode:'generation',route:route(),created:new Date().toISOString()};state.review=result;review(result);}
    },preferences.animations?120:35);
    const cancel=()=>{if(state.job?.token!==token)return;++state.token;clearInterval(timer);state.job=null;win.close();state.active=null;state.operation=null;setPhase('idle');toast('Przygotowanie opisu anulowane. Pola wizyty pozostają bez zmian.');};
    state.job={token,cancel};setPhase('processing');bind(root,'cancel',cancel);
  }
  function review(result) {
    const keys=Object.keys(result.output);if(!keys.length){state.review=null;setPhase('idle');toast('Brak treści do sprawdzenia. Uzupełnij źródła.');return;}
    state.review=result;setPhase('review'); // amber "Sprawdź" for the whole review
    result.edited=result.edited||clone(result.output);result.selected=result.selected||keys.slice();result.tab=result.tab||keys[0];result.compare=!!result.compare;
    const isDict=result.mode==='dictation';
    const html=`<div class="oa-app oa-review"><header class="oa-header"><div class="oa-header-row"><div><h1>${isDict?'Sprawdź transkrypcję':'Sprawdź opis przed wpisaniem'}</h1><p>Sprawdź fakty, liczby i przeczenia. Treść „Do wpisania” możesz poprawić.</p></div><span class="oa-version">${VERSION}</span></div></header><nav class="oa-tabs" aria-label="Pola wyniku">${keys.map(key=>`<button class="oa-tab ${result.tab===key?'active':''}" data-tab="${key}">${esc(FIELDS[key])}</button>`).join('')}<button class="oa-tab ${result.tab==='details'?'active':''}" data-tab="details">Szczegóły</button></nav><div class="oa-content oa-review-body" data-review-body></div><div class="oa-notice error oa-review-warning" data-write-error hidden></div><div class="oa-ack-area">${check(isDict?'Transkrypcja i właściwa wizyta sprawdzone. Zatwierdzam wpisanie tej notatki.':'Tekst przygotowany przez AI i właściwa wizyta sprawdzone. Zatwierdzam dokładnie te zmiany.','oa-review-ack')}<div class="oa-ack-note" data-review-ack-note></div></div><footer class="oa-footer"><span class="oa-footnote">Wpisanie do pól nie zapisuje wizyty w Klinice.</span>${button('Odrzuć','reject')}${isDict?button('Kontynuuj dyktowanie','continue','','mic'):''}${isDict?button('Generuj opis','compose','primary','document'):''}${button(isDict?'Wpisz samą notatkę':'Wpisz do pól','apply',isDict?'':'primary','check','disabled')}</footer></div>`;
    const win=makeWindow('opisai-review',`OpisAI — ${isDict?'przegląd transkrypcji':'podgląd wyniku'}`,1000,660,html,()=>{if(state.review){state.review=null;state.active=null;if(state.phase==='review')setPhase('idle');}});state.active=win;const root=win.content,ack=$('#oa-review-ack',root),apply=$('[data-action="apply"]',root);
    function invalidate(){ack.checked=false;apply.disabled=true;$('[data-review-ack-note]',root).textContent='Treść lub zakres zmienione — sprawdź i potwierdź ponownie.';}
    function draw(){
      const body=$('[data-review-body]',root);$$('[data-tab]',root).forEach(tab=>tab.classList.toggle('active',tab.dataset.tab===result.tab));
      if(result.tab==='details'){
        body.innerHTML=`<section class="oa-review-details"><h2>Pochodzenie i zakres wyniku</h2><dl><dt>Sposób przygotowania</dt><dd>${isDict?'Przykładowa transkrypcja':esc(result.route)}</dd><dt>Wariant</dt><dd>${isDict?'Sama notatka':`${result.variant.rich?'Bogato':'Wiernie'}${result.variant.panel?' · panel parametrów':''}${result.variant.diagnosis?' · rozpoznanie':''}`}</dd><dt>Zakres</dt><dd>${keys.map(k=>esc(FIELDS[k])).join(', ')}</dd><dt>Źródła</dt><dd>Treść sprawdzona w oknie przygotowania.</dd><dt>Stan pól Kliniki</dt><dd>Kontrolowany ponownie przed wpisaniem.</dd></dl>${notice('Jest to demonstracja interfejsu. Tekst przygotowano lokalnie na podstawie przykładu lub wpisanych źródeł. Żadne dane nie zostały wysłane do usługi AI.')}<h3>Zatwierdzone źródła</h3><pre>${esc(Object.entries(result.sources).filter(([k])=>keys.includes(k)).map(([k,v])=>FIELDS[k]+':\n'+v).join('\n\n'))}</pre><h3>Kontrola przed wpisaniem</h3><p class="oa-muted">Program sprawdzi, czy od odczytu nie zmieniły się pola w oknie wizyty. Wynik możesz poprawić i wybrać pola, które mają zostać zastąpione.</p></section>`;return;
      }
      const key=result.tab,included=result.selected.includes(key);
      body.innerHTML=`<div class="oa-review-top"><span class="oa-status">${included?'Do wpisania':'Poza zakresem wpisu'} · ${esc(FIELDS[key])}</span>${button(included?'Pomiń to pole':'Uwzględnij pole','toggle-field','link small',included?'close':'check')}</div><div class="oa-review-split"><section class="oa-review-side oa-comparison" ${result.compare?'':'hidden'}><div class="oa-editor-head"><select aria-label="Rodzaj porównania"><option value="sources">Źródła użyte do przygotowania</option><option value="before">Pole przed wpisaniem</option></select></div><textarea readonly spellcheck="false" aria-label="Źródło do porównania">${esc(result.sources[key]||'')}</textarea></section><section class="oa-review-side"><div class="oa-editor-head"><span>Do wpisania</span>${button(result.compare?'Ukryj porównanie':'Porównaj','compare','link small','eye')}${button('Kopiuj','copy','link small','copy')}</div><textarea data-output="${key}" spellcheck="false" aria-label="Dokładna treść do wpisania: ${esc(FIELDS[key])}">${esc(result.edited[key]||'')}</textarea></section></div><div class="oa-review-info">${icon('info',13)}<span>${isDict?'Możesz wpisać samą notatkę albo przygotować na jej podstawie opis wizyty.':result.variant.panel&&key==='badanie'?'Panel zawiera parametry odczytane z zatwierdzonych źródeł. Sprawdź ich wartości i jednostki.':'Do pola trafi dokładnie tekst widoczny powyżej.'}</span></div>`;
      $('[data-output]',body).addEventListener('input',e=>{result.edited[key]=e.target.value;invalidate();});
      $('select',body).addEventListener('change',e=>{$('.oa-comparison textarea',body).value=e.target.value==='before'?(result.snapshot[key]||''):(result.sources[key]||'');});
      bind(body,'compare',()=>{result.compare=!result.compare;draw();});
      bind(body,'copy',()=>copyText(result.edited[key],$('[data-action="copy"]',body)));
      bind(body,'toggle-field',()=>{result.selected=included?result.selected.filter(k=>k!==key):[...result.selected,key];invalidate();draw();});
    }
    $$('[data-tab]',root).forEach(tab=>tab.addEventListener('click',()=>{result.tab=tab.dataset.tab;draw();}));
    ack.addEventListener('change',()=>{apply.disabled=!ack.checked||!result.selected.length;if(ack.checked)$('[data-review-ack-note]',root).textContent='';});
    bind(root,'reject',()=>{win.close();state.review=null;state.active=null;setPhase('idle');});
    bind(root,'apply',()=>{
      if(!ack.checked||!result.selected.length)return;
      const changes={};result.selected.forEach(key=>changes[key]=result.edited[key]);
      if(Object.values(changes).some(value=>!String(value).trim())){
        const err=$('[data-write-error]',root);err.hidden=false;err.innerHTML=icon('info',16)+'<div>Puste pole nie zastąpi dotychczasowej treści. Uzupełnij wynik lub pomiń to pole.</div>';return;
      }
      const applied=Clinic.setFields(changes,{expected:result.snapshot,session:result.session,source:'OpisAI'});
      if(!applied.ok){const err=$('[data-write-error]',root);err.hidden=false;const reason=applied.reason||'Pola nie odpowiadają wcześniejszemu odczytowi. Odczytaj pola ponownie.';err.innerHTML=icon('info',16)+`<div><strong>${/^Zmieniło się okno/.test(reason)?'Zmieniło się okno wizyty.':/^Nie znaleziono/.test(reason)?'Nie ma okna wizyty.':'Zmieniła się treść wizyty.'}</strong><br>${esc(reason)}</div>`+button('Odczytaj ponownie','reread','small');bind(err,'reread',()=>{win.close();state.review=null;prepare({field:result.field});});invalidate();return;}
      const record={id:result.id,time:stamp(),mode:result.mode,variant:result.variant,route:result.route||'Przykładowe dyktowanie',before:clone(result.snapshot),after:clone(changes),session:result.session,status:'Wpis potwierdzony'};
      state.lastWrite=record;if(preferences.history)state.history.unshift(record);
      state.review=null;state.operation=null;win.close();state.active=null;setPhase('done');if(result.selected[0])Clinic.focusField(result.selected[0]);
      Shell.notify({title:'OpisAI — gotowe',message:`Wpisano ${result.selected.length===1?'tekst do pola':`tekst do ${result.selected.length} pól`}. Wizyta czeka na zapis w Klinice.`,icon:'opisai',actionLabel:'Cofnij wpis',onAction:undo});
    });
    bind(root,'compose',()=>{win.close();state.review=null;const now=getFields();prepare({sources:{...now,...result.edited},snapshot:{...now,...result.snapshot},session:result.session,fromDictation:true});}); // _compose_dictation: the visit is read again; the dictated field keeps its read from the start of the dictation
    bind(root,'continue',()=>{win.close();state.review=null;dictate({field:result.field||keys[0],base:result.edited[result.field||keys[0]],snapshot:result.snapshot,session:result.session,continuation:true,direct:true});});
    draw();
  }
  async function copyText(value,control){
    let ok=false;try{await navigator.clipboard.writeText(String(value));ok=true;}catch(_){const t=document.createElement('textarea');t.value=String(value);t.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(t);t.select();try{ok=document.execCommand('copy');}catch(__){}t.remove();}
    if(control&&ok){const span=$('span',control);if(span){const old=span.textContent;span.textContent='Skopiowano';setTimeout(()=>{if(span.isConnected)span.textContent=old;},1800);}}else toast(ok?'Skopiowano do schowka.':'Zaznacz tekst i użyj Ctrl+C, aby skopiować.');
  }
  function undo(){
    const last=state.lastWrite;if(!last){toast('Brak potwierdzonego wpisu do cofnięcia.');return;}
    const fields=Object.keys(last.after),html=`<div class="oa-app"><header class="oa-header"><h1>Cofnij ostatni potwierdzony wpis</h1><p>Operacja z ${esc(last.time)} · ${fields.map(k=>esc(FIELDS[k])).join(', ')}</p></header><div class="oa-content">${notice('Przywrócona zostanie treść sprzed wpisu OpisAI. Późniejsza edycja w Klinice zatrzyma cofnięcie.')}<div class="oa-history-detail">${esc(fields.map(k=>FIELDS[k]+'\n'+(last.before[k]||'(puste pole)')).join('\n\n'))}</div><div class="oa-notice error" data-undo-error hidden></div></div><div class="oa-ack-area">${check('Sprawdzone: przywracam pokazane pola tej wizyty.','oa-undo-ack')}</div><footer class="oa-footer"><span class="oa-footnote">Cofnięcie obejmuje tylko ostatni wpis OpisAI.</span>${button('Anuluj','cancel')}${button('Przywróć poprzednią treść','undo','primary','undo','disabled')}</footer></div>`;
    const win=makeWindow('opisai-undo','OpisAI — cofnięcie wpisu',650,490,html),root=win.content;
    $('#oa-undo-ack',root).addEventListener('change',e=>$('[data-action="undo"]',root).disabled=!e.target.checked);bind(root,'cancel',()=>win.close());
    bind(root,'undo',()=>{if(!$('#oa-undo-ack',root).checked)return;const before={};fields.forEach(k=>before[k]=last.before[k]);const result=Clinic.setFields(before,{expected:last.after,session:last.session,source:'OpisAI — cofnięcie'});if(!result.ok){const error=$('[data-undo-error]',root);error.hidden=false;error.innerHTML=icon('info',16)+'<div>'+esc(result.reason||'Pola zmieniły się po wpisie. Nie cofnięto zmian.')+'</div>';return;}last.status='Cofnięto';state.lastWrite=null;win.close();setPhase('done');toast('Przywrócono poprzednią treść pól.');});
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
    const id='opisai-gemini-consent',win=Shell.createWindow({id,title:'OpisAI — dyktowanie',icon:'opisai',width:610,height:290,minWidth:420,minHeight:250,className:'oa-host oa-theme-'+preferences.theme,content:html,resizable:false,maximizable:false,taskbar:false,onClose:()=>answer(false)}),root=win.content;
    windows.set(id,win);if(win.el)win.el.dataset.oaWindow=id;holdPosition();
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
    const el=document.createElement('section');el.className='oa-dictation oa-host oa-theme-'+preferences.theme;el.setAttribute('aria-label','OpisAI — dyktowanie');el.hidden=true;el.dataset.engine=rec.engine;
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
  const dtAccent=()=>preferences.theme==='dark'?'#85dec2':'#147a62'; // StreamTextEdit._accent
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
        dictationSettings(area,draft);
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
        bind(area,'copy-info',()=>copyText(`OpisAI ${VERSION}\nInteraktywna demonstracja OpisAI\nGenerator: ${draft.provider}\nDyktowanie: Gemini, Whisper lokalnie, ChatGPT w przeglądarce (próba)\nBez danych wizyty i poświadczeń.`,$('[data-action="copy-info"]',area)));bind(area,'about',about);bind(area,'reset-settings',()=>{draft=clone(defaults);dirty();applyTheme(win,draft.theme);draw();});
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
  function history(){
    let filter='',selected=null;
    const html=`<div class="oa-app"><header class="oa-header"><h1>Historia generowań</h1><p>Potwierdzone operacje w bieżącej sesji.</p></header><div class="oa-content"><div class="oa-history-toolbar"><input type="search" placeholder="Szukaj w historii" aria-label="Szukaj w historii">${button('Odśwież','refresh','small','history')}${button('Wyczyść','clear','small','close')}</div><div data-history-list></div><div class="oa-history-detail" data-history-detail hidden></div></div><footer class="oa-footer"><span class="oa-footnote" data-history-count></span>${button('Kopiuj wynik','copy-history','','copy','disabled')}${button('Cofnij ostatni wpis','undo-history','','undo',state.lastWrite?'':'disabled')}${button('Zamknij','close')}</footer></div>`;
    const win=makeWindow('opisai-history','OpisAI — historia generowań',840,560,html),root=win.content;
    function draw(){
      const rows=state.history.filter(rec=>normal([rec.time,rec.route,...Object.values(rec.after)].join(' ')).includes(normal(filter))),target=$('[data-history-list]',root);
      target.innerHTML=rows.length?`<table class="oa-history-table"><thead><tr><th>Godzina</th><th>Operacja</th><th>Pola</th><th>Stan</th></tr></thead><tbody>${rows.map((rec,i)=>`<tr data-record="${state.history.indexOf(rec)}" tabindex="0"><td>${esc(rec.time)}</td><td>${rec.mode==='dictation'?'Dyktowanie':rec.variant.rich?'Opis · Bogato':'Opis · Wiernie'}</td><td>${Object.keys(rec.after).map(k=>esc(FIELDS[k])).join(', ')}</td><td>${esc(rec.status)}</td></tr>`).join('')}</tbody></table>`:`<div class="oa-empty">${icon('history',42)}<h3>${filter?'Nie znaleziono operacji':'Historia jest pusta'}</h3><p>${filter?'Zmień szukany tekst.':'Potwierdzone wpisy OpisAI pojawią się tutaj.'}</p></div>`;
      $('[data-history-count]',root).textContent=`${state.history.length} operacji · dane tylko w tej karcie`;
      $$('[data-record]',root).forEach(row=>{const choose=()=>{selected=state.history[Number(row.dataset.record)];$$('[data-record]',root).forEach(x=>x.classList.toggle('selected',x===row));const detail=$('[data-history-detail]',root);detail.hidden=false;detail.textContent=Object.entries(selected.after).map(([k,v])=>FIELDS[k]+'\n'+v).join('\n\n');$('[data-action="copy-history"]',root).disabled=false;};row.addEventListener('click',choose);row.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();choose();}});});
    }
    $('input',root).addEventListener('input',e=>{filter=e.target.value;draw();});bind(root,'refresh',draw);bind(root,'clear',()=>clearHistory(()=>{selected=null;$('[data-history-detail]',root).hidden=true;draw();}));bind(root,'copy-history',()=>{if(selected)copyText(Object.values(selected.after).join('\n\n'),$('[data-action="copy-history"]',root));});bind(root,'undo-history',undo);bind(root,'close',()=>win.close());draw();
  }
  function clearHistory(after){
    if(!state.history.length){toast('Historia jest już pusta.');return;}
    const win=makeWindow('opisai-clear-history','OpisAI — wyczyść historię',460,245,`<div class="oa-app"><header class="oa-header"><h2>Wyczyścić historię tej sesji?</h2></header><div class="oa-content"><p>Wpisy znikną z listy. Treść wizyty w Klinice pozostanie bez zmian.</p></div><footer class="oa-footer"><span class="oa-footnote"></span>${button('Anuluj','cancel')}${button('Wyczyść historię','clear','primary')}</footer></div>`);bind(win.content,'cancel',()=>win.close());bind(win.content,'clear',()=>{state.history=[];win.close();after?.();});
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
    document.addEventListener('keydown',dictationEnterShortcut,true); // Enter in the dictated Badanie field: "Przepisz fragment" (ChatGPT)
    window.OpisAI={open:describe,prepare:describe,describe,dictate,settings,history,about,showBubble,launch,undo,showMenu,trayTooltip,isClosed:()=>state.closed,getState:()=>({phase:state.phase,history:state.history.length,recording:!!state.recording,closed:state.closed,preferences:{...preferences}})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
