/* OpisAI 0.12.0rc32. A local, interactive reconstruction of the Windows app.
 * Demonstration only: no microphone access, cloud requests or clinical writes.
 * Editable visit data stays locally in this browser. */
(() => {
  'use strict';
  const VERSION = '0.12.0rc32';
  const FIELDS = {wywiad: 'Wywiad', badanie: 'Badanie kliniczne', diagnoza: 'Rozpoznanie'};
  const PREF_KEY = 'opisai-demo-settings-v12';
  const defaults = {provider:'ChatGPT',transport:'Przeglądarka',model:'Wybrany w ChatGPT',theme:'light',transcriber:'ChatGPT',cardMode:'Nagrywa OpisAI',spelling:true,animations:true,orbSize:96,history:true,retention:'30 dni',fontSize:13,livePreview:true,language:'Polski',sentenceLines:false,dictationConsent:false,panel:true,rich:false,diagnosis:false,clinicalSections:['Wywiad','Badanie kliniczne','Rozpoznanie'],panelRows:{temperature:true,heart:true,bcs:true,mass:true},customPrompt:''};
  let preferences = {...defaults};
  try { const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); for (const key of Object.keys(defaults)) if (key in saved && typeof saved[key] === typeof defaults[key]) preferences[key] = saved[key]; } catch (_) {}
  if(!Array.isArray(preferences.clinicalSections)||preferences.clinicalSections.length!==3)preferences.clinicalSections=[...defaults.clinicalSections];
  if(!preferences.panelRows||typeof preferences.panelRows!=='object')preferences.panelRows={...defaults.panelRows};
  if(!['light','dark','blue'].includes(preferences.theme))preferences.theme='light';
  preferences.orbSize=Number.isFinite(preferences.orbSize)?Math.max(72,Math.min(120,preferences.orbSize)):defaults.orbSize;
  const state = {phase:'idle',active:null,operation:null,review:null,history:[],lastWrite:null,token:0,recording:null,orb:null,orbX:0,orbY:0,orbHidden:false,activeField:null};
  let orbMotion=null,orbFrame=0,orbFrameTime=0,orbMotionQuery=null,orbCancelDrag=()=>{};
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
  function setPhase(phase,label) {
    state.phase=phase;
    if(state.orb){
      state.orb.dataset.phase=phase;
      const caption=$('.oa-orb-caption',state.orb);
      caption.hidden=phase==='idle';
      caption.textContent=label || ({idle:'OpisAI',preparing:'Przygotuj opis',processing:'Przygotowuję opis',recording:'Słucham…',review:'Sprawdź tekst',done:'Gotowe',error:'Sprawdź komunikat'}[phase]||'OpisAI');
      renderOrbActions();refreshOrbBounds();
    }
  }
  function applyTheme(win,theme=preferences.theme) { if(!win?.el)return; win.el.classList.remove('oa-theme-light','oa-theme-dark','oa-theme-blue');win.el.classList.add('oa-host','oa-theme-'+theme); }
  function makeWindow(id,title,width,height,html,onClose) {
    let win=windows.get(id);
    if(win?.el?.isConnected){win.setTitle(title);win.setContent(html);win.show();win.focus();}
    else {win=Shell.createWindow({id,title,icon:'opisai',width,height,minWidth:Math.min(width,500),minHeight:Math.min(height,360),className:'oa-host oa-theme-'+preferences.theme,content:html,resizable:true,maximizable:true,taskbar:true,onClose:()=>{if(onClose)onClose();}});windows.set(id,win);}
    applyTheme(win); if(win?.el)win.el.dataset.oaWindow=id; return win;
  }
  function closeWin(id) { windows.get(id)?.close(); }
  function showActive() {
    if(state.recording){showDictation();return;}
    if(state.review){review(state.review);return;}
    if(state.phase==='processing'){const w=windows.get('opisai-progress');if(w){w.show();w.focus();}return;}
    if(state.active?.el?.isConnected){state.active.show();state.active.focus();return;}
    prepare();
  }
  function getFields() { return clone(window.Clinic?.getFields?.() || {wywiad:'',badanie:'',diagnoza:''}); }
  function validOption(options) {return options && typeof options==='object' && !('target' in options && options.target instanceof Element)?options:{};}
  function prepare(options={}) {
    options=typeof options==='string'?{field:options}:validOption(options);
    if(state.phase==='recording'||state.phase==='processing'){showActive();return;}
    closeWin('opisai-review');Clinic.open(); showBubble();
    const snapshot=clone(options.snapshot||getFields());
    const sources=clone(options.sources||snapshot);
    const field=FIELDS[options.field]?options.field:null;
    const variant={rich:preferences.rich,panel:preferences.panel,diagnosis:preferences.diagnosis};
    if(field && field!=='badanie')variant.panel=false;
    if(field==='diagnoza')variant.diagnosis=true;
    const op={id:++state.token,snapshot,sources,variant,field,fromDictation:!!options.fromDictation,approved:false,details:false};
    state.operation=op;state.review=null;setPhase('preparing');
    const cards=Object.entries(FIELDS).filter(([key])=>!field||key===field).map(([key,label])=>`<div class="oa-source-card ${key==='diagnoza'&&!variant.diagnosis?'out-of-scope':''}" data-source-card="${key}"><h3>${esc(label)}</h3><textarea data-source="${key}" aria-label="${esc(label)} — źródło do opracowania, edytowalne" spellcheck="false">${esc(sources[key]||'')}</textarea><div class="oa-source-status">${key==='diagnoza'&&!variant.diagnosis?'Poza wybranym zakresem — rozpoznanie nie będzie opracowywane.':''}</div></div>`).join('');
    const html=`<div class="oa-app oa-compose"><header class="oa-header"><div class="oa-header-row"><div><h1>${field?'Przygotuj opis pola':'Przygotuj opis wizyty'}</h1><p class="oa-route">${icon('shield',13)} <span data-route>${esc(route())}</span></p></div>${button('Połączenie i model','connection','link small','settings')}</div></header><div class="oa-content"><div class="oa-compose-body"><section class="oa-source-panel"><div class="oa-section-label" data-source-heading>Treść pól</div><div data-sources>${cards}</div><textarea class="oa-rules" readonly aria-label="Zasady i źródła" hidden></textarea>${button('Pokaż zasady i źródła','rules','small','document')}</section><section class="oa-options-panel"><div class="oa-section-label">Sposób opracowania</div><div class="oa-variant-grid">${[true,false].map(rich=>`<div class="oa-variant-row-label">${rich?'Bogato':'Wiernie'}</div>${[0,1,2].map(col=>`<button class="oa-variant ${variant.rich===rich&&(variant.diagnosis?2:variant.panel?1:0)===col?'selected':''}" type="button" data-variant="${rich?'rich':'faithful'}-${col}" aria-label="${rich?'Bogato':'Wiernie'} — ${['sam opis','z panelem parametrów','z panelem i rozpoznaniem'][col]}" ${field&&((col===1&&field!=='badanie')||(col===2&&field==='wywiad'))?'disabled':''}><span class="oa-tick">${icon('check',13)}</span>${col===0?'Sam opis':col===1?'+ panel<br>parametrów':'+ panel<br>+ rozpoznanie'}</button>`).join('')}`).join('')}</div><div class="oa-variant-explanation" data-variant-description></div>${notice('Dane pacjenta i właściciela pozostają w oknie Kliniki. Sprawdź treść pól przed przygotowaniem opisu.')}<div style="margin-top:12px">${button('Ustawienia sekcji opisu','sections','link small','settings')}</div></section></div><div class="oa-notice error" data-compose-error hidden></div></div><div class="oa-ack-area">${check(`Sprawdzone: tylko te pola, bez danych osobowych właściciela i personelu.`,'oa-compose-ack')}<div class="oa-ack-note" data-ack-note>Potwierdzenie dotyczy pokazanych źródeł i wybranego zakresu.</div></div><footer class="oa-footer"><span class="oa-footnote" data-compose-foot>Pola wizyty pozostaną bez zmian.<br>OpisAI ${VERSION}</span>${button('Anuluj','cancel')}${button('Przygotuj podgląd','generate','primary','play','disabled')}</footer></div>`;
    const win=makeWindow('opisai-compose','OpisAI — przygotuj opis wizyty',800,680,html,()=>{if(state.phase==='preparing')setPhase('idle');});state.active=win;
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
    const token=++state.token;state.operation=op;state.review=null;setPhase('processing');
    const outputs=formatSources(op),fullText=Object.entries(outputs).map(([key,value])=>`${FIELDS[key]}\n${value}`).join('\n\n');
    const html=`<div class="oa-app"><div class="oa-content"><div class="oa-progress-center"><div class="oa-progress-mark">${icon('opisai',34)}</div><div class="oa-progress-title" data-progress-title>Przygotowuję źródła</div><div class="oa-progress-sub">${esc(route())}</div><div class="oa-progress-track"><div data-progress-bar></div></div><div class="oa-progress-steps"><span class="active" data-step="0">Odczyt pól</span><span data-step="1">Opracowanie</span><span data-step="2">Sprawdzenie wyniku</span></div></div>${notice('Powstaje wersja robocza. W następnym oknie sprawdzisz tekst i zdecydujesz o wpisaniu.')}<div style="margin-top:14px;text-align:center">${button('Pokaż tekst na żywo','live','primary','eye')}</div><section class="oa-live-preview ${preferences.livePreview?'open':''}"><div class="oa-live-head"><span>Wersja robocza</span>${button('Ukryj','hide-live','link small')}</div><pre data-stream></pre></section></div><footer class="oa-footer"><span class="oa-footnote">Pola wizyty pozostają bez zmian.</span>${button('Anuluj','cancel')}</footer></div>`;
    const win=makeWindow('opisai-progress','OpisAI — przygotowanie opisu',610,540,html);state.active=win;const root=win.content;
    bind(root,'live',()=>{$('.oa-live-preview',root).classList.add('open');preferences.livePreview=true;savePreferences();});bind(root,'hide-live',()=>{$('.oa-live-preview',root).classList.remove('open');preferences.livePreview=false;savePreferences();});
    let done=0;
    const timer=setInterval(()=>{
      if(token!==state.token){clearInterval(timer);return;}
      done+=1;const progress=Math.min(100,done/28*100),step=done<5?0:done<23?1:2;
      $('[data-progress-bar]',root).style.width=progress+'%';
      $('[data-progress-title]',root).textContent=['Czytam zatwierdzone pola','Przygotowuję opis wizyty','Sprawdzam strukturę i parametry'][step];
      $$('[data-step]',root).forEach(x=>x.classList.toggle('active',Number(x.dataset.step)===step));
      $('[data-stream]',root).textContent=fullText.slice(0,Math.floor(fullText.length*Math.max(0,(done-4)/21)));
      const live=$('.oa-live-preview',root);live.scrollTop=live.scrollHeight;
      if(done>=28){clearInterval(timer);win.close();const result={id:op.id,snapshot:op.snapshot,sources:op.sources,output:outputs,variant:op.variant,field:op.field,mode:'generation',route:route(),created:new Date().toISOString()};state.review=result;review(result);}
    },preferences.animations?120:35);
    bind(root,'cancel',()=>{++state.token;clearInterval(timer);win.close();state.active=null;state.operation=null;setPhase('idle');toast('Przygotowanie opisu anulowane. Pola wizyty pozostają bez zmian.');});
  }
  function review(result) {
    state.review=result;setPhase('review');
    const keys=Object.keys(result.output);if(!keys.length){setPhase('error');toast('Brak treści do sprawdzenia. Uzupełnij źródła.');return;}
    result.edited=result.edited||clone(result.output);result.selected=result.selected||keys.slice();result.tab=result.tab||keys[0];result.compare=!!result.compare;
    const isDict=result.mode==='dictation';
    const html=`<div class="oa-app oa-review"><header class="oa-header"><div class="oa-header-row"><div><h1>${isDict?'Sprawdź transkrypcję':'Sprawdź opis przed wpisaniem'}</h1><p>Sprawdź fakty, liczby i przeczenia. Treść „Do wpisania” możesz poprawić.</p></div><span class="oa-version">${VERSION}</span></div></header><nav class="oa-tabs" aria-label="Pola wyniku">${keys.map(key=>`<button class="oa-tab ${result.tab===key?'active':''}" data-tab="${key}">${esc(FIELDS[key])}</button>`).join('')}<button class="oa-tab ${result.tab==='details'?'active':''}" data-tab="details">Szczegóły</button></nav><div class="oa-content oa-review-body" data-review-body></div><div class="oa-notice error oa-review-warning" data-write-error hidden></div><div class="oa-ack-area">${check(isDict?'Transkrypcja i właściwa wizyta sprawdzone. Zatwierdzam wpisanie tej notatki.':'Tekst przygotowany przez AI i właściwa wizyta sprawdzone. Zatwierdzam dokładnie te zmiany.','oa-review-ack')}<div class="oa-ack-note" data-review-ack-note></div></div><footer class="oa-footer"><span class="oa-footnote">Wpisanie do pól nie zapisuje wizyty w Klinice.</span>${button('Odrzuć','reject')}${isDict?button('Kontynuuj dyktowanie','continue','','mic'):''}${isDict?button('Generuj opis','compose','primary','document'):''}${button(isDict?'Wpisz samą notatkę':'Wpisz do pól','apply',isDict?'':'primary','check','disabled')}</footer></div>`;
    const win=makeWindow('opisai-review',`OpisAI — ${isDict?'przegląd transkrypcji':'podgląd wyniku'}`,1000,660,html);state.active=win;const root=win.content,ack=$('#oa-review-ack',root),apply=$('[data-action="apply"]',root);
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
      const applied=Clinic.setFields(changes,{expected:result.snapshot,source:'OpisAI'});
      if(!applied.ok){const err=$('[data-write-error]',root);err.hidden=false;err.innerHTML=icon('info',16)+`<div><strong>Zmieniła się treść wizyty.</strong><br>${esc(applied.reason||'Pola nie odpowiadają wcześniejszemu odczytowi.')} Odczytaj źródła ponownie.</div>`+button('Odczytaj ponownie','reread','small');bind(err,'reread',()=>{win.close();state.review=null;prepare({field:result.field});});invalidate();setPhase('error');return;}
      const record={id:result.id,time:stamp(),mode:result.mode,variant:result.variant,route:result.route||'Przykładowe dyktowanie',before:clone(result.snapshot),after:clone(changes),status:'Wpis potwierdzony'};
      state.lastWrite=record;if(preferences.history)state.history.unshift(record);
      state.review=null;state.operation=null;win.close();state.active=null;setPhase('done');Clinic.open();if(result.selected[0])Clinic.focusField(result.selected[0]);
      Shell.notify({title:'OpisAI — gotowe',message:`Wpisano ${result.selected.length===1?'tekst do pola':`tekst do ${result.selected.length} pól`}. Wizyta czeka na zapis w Klinice.`,icon:'opisai',actionLabel:'Cofnij wpis',onAction:undo});
      const token=state.token;setTimeout(()=>{if(state.phase==='done'&&token===state.token)setPhase('idle');},4000);
    });
    bind(root,'compose',()=>{win.close();state.review=null;prepare({sources:{...result.snapshot,...result.edited},snapshot:result.snapshot,fromDictation:true});});
    bind(root,'continue',()=>{win.close();state.review=null;dictate({field:result.field||keys[0],base:result.edited[result.field||keys[0]],snapshot:result.snapshot,continuation:true});});
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
    bind(root,'undo',()=>{if(!$('#oa-undo-ack',root).checked)return;const before={};fields.forEach(k=>before[k]=last.before[k]);const result=Clinic.setFields(before,{expected:last.after,source:'OpisAI — cofnięcie'});if(!result.ok){const error=$('[data-undo-error]',root);error.hidden=false;error.innerHTML=icon('info',16)+'<div>'+esc(result.reason||'Pola zmieniły się po wpisie. Nie cofnięto zmian.')+'</div>';return;}last.status='Cofnięto';state.lastWrite=null;win.close();setPhase('idle');toast('Przywrócono poprzednią treść pól.');});
  }

  /* Recording is deliberately scripted: the microphone is never requested. */
  const DICTATION_TEXT='Pacjent jest dziś spokojniejszy. Właściciel zgłasza poprawę apetytu od wczoraj. Nadal obserwuje kichanie i wydzielinę wokół nozdrzy. Kontynuujemy obserwację objawów. Notatka do sprawdzenia przed wpisaniem.';
  function dictate(options={}){
    options=validOption(options);
    if(state.recording){finishDictation();return;}
    if(state.phase==='processing'){showActive();return;}
    Clinic.open();showBubble();
    const field=FIELDS[options.field]?options.field:(Clinic.getActiveField?.()||state.activeField||'wywiad');
    const snapshot=clone(options.snapshot||getFields());
    state.review=null;closeWin('opisai-compose');closeWin('opisai-review');
    state.recording={id:++state.token,field,snapshot,base:options.base||'',text:'',wordIndex:0,seconds:0,paused:false,started:Date.now(),tick:null,canvasFrame:null,continuation:!!options.continuation};
    const rec=state.recording;setPhase('recording');showDictation();
    const words=DICTATION_TEXT.split(' ');
    rec.tick=setInterval(()=>{if(state.recording!==rec){clearInterval(rec.tick);return;}if(rec.paused)return;rec.seconds+=.45;if(rec.wordIndex<words.length){rec.text+=(rec.wordIndex?' ':'')+words[rec.wordIndex++];}updateDictation();},450);
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
    const withBefore=rec.base?text:[rec.snapshot[rec.field],text].filter(Boolean).join('\n\n');
    review({id:rec.id,snapshot:rec.snapshot,sources:{...rec.snapshot,[rec.field]:withBefore},output:{[rec.field]:withBefore},variant:{rich:false,panel:false,diagnosis:false},field:rec.field,mode:'dictation',route:'Przykładowe dyktowanie',created:new Date().toISOString()});
  }
  function confirmDiscardDictation(){
    const html=`<div class="oa-app"><header class="oa-header"><h2>Odrzucić bieżące dyktowanie?</h2></header><div class="oa-content"><p>Tekst tego dyktowania nie zostanie wpisany do pól. Możesz też zakończyć nagranie i sprawdzić zachowaną notatkę.</p></div><footer class="oa-footer">${button('Wróć do nagrania','back')}${button('Odrzuć','discard','danger')}${button('Sprawdź tekst','review','primary')}</footer></div>`;
    const win=makeWindow('opisai-discard','OpisAI — zakończenie dyktowania',560,250,html);bind(win.content,'back',()=>win.close());bind(win.content,'review',()=>{win.close();finishDictation();});bind(win.content,'discard',()=>{const rec=state.recording;if(rec){clearInterval(rec.tick);cancelAnimationFrame(rec.canvasFrame);}state.recording=null;win.close();closeWin('opisai-dictation');state.active=null;setPhase('idle');});
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
        bind(area,'test-dictation',()=>{const el=$('[data-dictation-test]',area);el.textContent='Sprawdzam interfejs dyktowania…';setTimeout(()=>{if(el.isConnected)el.innerHTML='<span class="oa-success-text">Przykład jest gotowy. Mikrofon pozostaje wyłączony.</span>';},750);});bind(area,'sample-dictation',()=>{win.minimize();dictate();});
      } else if(page==='fields'){
        const values=getFields();
        area.innerHTML=`<h2>Odczyt pola (Klinika)</h2><p>Powiązanie OpisAI z polami w oknie opisu wizyty.</p><fieldset class="oa-group"><legend>Okno docelowe</legend>${formRow('Program','<div class="oa-form-control"><strong>Klinika XP</strong><div class="oa-form-help">Bieżąca wizyta · przykład interaktywny</div></div>')}<div class="oa-inline-controls">${button('Pokaż Klinikę','show-clinic','','clinic')}${button('Odczytaj ponownie','read-fields','','document')}</div></fieldset><fieldset class="oa-group"><legend>Przypisane pola</legend><table class="oa-options-table"><thead><tr><th>Pole</th><th>Stan</th><th></th></tr></thead><tbody>${Object.entries(FIELDS).map(([key,label])=>`<tr><td>${esc(label)}</td><td><span class="oa-success-text">${icon('check',12)} Przypisane</span><br><small class="oa-muted">${String(values[key]||'').length} znaków</small></td><td>${button('Pokaż','field-'+key,'small','eye')}</td></tr>`).join('')}</tbody></table></fieldset><fieldset class="oa-group"><legend>Pisownia</legend>${switchControl('spelling','Podkreślaj podejrzane słowa w Klinice','Sugestie dotyczą widocznego przykładu. Poprawkę wybierasz samodzielnie.',draft)}</fieldset>`;
        bind(area,'show-clinic',()=>Clinic.open());bind(area,'read-fields',()=>{draw();toast('Odczytano bieżącą treść trzech pól.');});Object.keys(FIELDS).forEach(key=>bind(area,'field-'+key,()=>{win.minimize();Clinic.open();Clinic.focusField(key);Clinic.markTarget?.(key,true);setTimeout(()=>Clinic.markTarget?.(key,false),1800);}));
      } else if(page==='appearance'){
        area.innerHTML=`<h2>Wygląd</h2><p>Kolory i czytelność okien OpisAI.</p><fieldset class="oa-group"><legend>Motyw aplikacji</legend><div class="oa-theme-choice">${[['light','Jasny'],['dark','Ciemny'],['blue','Niebieski']].map(([value,label])=>`<button type="button" class="oa-theme-card ${draft.theme===value?'selected':''}" data-theme="${value}"><span class="oa-theme-preview ${value}"><i></i><i></i></span>${label}</button>`).join('')}</div></fieldset><fieldset class="oa-group"><legend>Tekst i podgląd</legend>${formRow('Rozmiar tekstu',`<input data-setting="fontSize" type="range" min="12" max="16" value="${draft.fontSize}"><span data-font-size>${draft.fontSize} px</span>`)}<p data-font-preview style="font-size:${draft.fontSize}px;padding:11px;border:1px solid var(--oa-line);border-radius:7px;background:var(--oa-field)">Przykładowy opis wizyty. Czytelny tekst ułatwia sprawdzenie faktów, liczb i jednostek.</p>${switchControl('livePreview','Pokaż tekst na żywo podczas generowania','Wersja robocza pozostaje oddzielona od zatwierdzanego wyniku.',draft)}${switchControl('animations','Animacje interfejsu','Ruch bąbelka i płynne przygotowywanie przykładu.',draft)}</fieldset>`;
        $$('[data-theme]',area).forEach(el=>el.addEventListener('click',()=>{draft.theme=el.dataset.theme;applyTheme(win,draft.theme);dirty();draw();}));
      } else if(page==='bubble'){
        area.innerHTML=`<h2>Bąbelek</h2><p>Mały pomocnik zawsze pod ręką.</p><fieldset class="oa-group"><legend>Obsługa</legend><table class="oa-options-table"><tbody><tr><td>Kliknięcie</td><td>Przygotuj opis wizyty</td></tr><tr><td>Przytrzymanie</td><td>Rozpocznij lub zakończ dyktowanie</td></tr><tr><td>Prawy przycisk</td><td>Menu OpisAI</td></tr><tr><td>Przeciągnięcie na pole</td><td>Opracuj wybrane pole</td></tr></tbody></table></fieldset><fieldset class="oa-group"><legend>Położenie i wygląd</legend>${formRow('Wielkość',`<input type="range" min="72" max="120" step="8" data-setting="orbSize" value="${draft.orbSize}"><span data-orb-size>${Math.round(draft.orbSize/96*100)}%</span>`)}${switchControl('animations','Animuj bąbelek','Sprężyste przeciąganie i łagodne wyhamowanie po puszczeniu.',draft)}<div class="oa-inline-controls">${button('Przywróć położenie','reset-orb','','undo')}${button(state.orbHidden?'Pokaż bąbelek':'Ukryj bąbelek','toggle-orb','','eye')}</div></fieldset><div style="margin-top:16px">${notice('Po najechaniu pojawiają się przyciski „Opisz” i „Dyktuj”. Nie musisz pamiętać gestów.')}</div>`;
        bind(area,'reset-orb',()=>{resetOrbPosition();showBubble();toast('Przywrócono położenie bąbelka.');});bind(area,'toggle-orb',()=>{state.orbHidden?showBubble():hideBubble();draw();});
      } else if(page==='history'){
        area.innerHTML=`<h2>Historia</h2><p>Potwierdzone wpisy wykonane w tej demonstracji.</p><fieldset class="oa-group"><legend>Historia generowań</legend>${switchControl('history','Zapisuj historię tej sesji','Treść pozostaje w bieżącej karcie. Zamknięcie lub odświeżenie strony usuwa wpisy.',draft)}<div class="oa-inline-controls">${button('Otwórz historię','open-history','','history')}${button('Wyczyść historię','clear-history','','close',state.history.length?'':'disabled')}</div><div class="oa-setting-state">W tej sesji: ${state.history.length} ${state.history.length===1?'operacja':'operacji'}.</div></fieldset><fieldset class="oa-group"><legend>Cofanie</legend><p class="oa-form-help">Możesz cofnąć ostatni potwierdzony wpis, jeśli od tego czasu pola nie zostały zmienione.</p>${button('Cofnij ostatni wpis','last-undo','','undo',state.lastWrite?'':'disabled')}</fieldset>`;
        bind(area,'open-history',history);bind(area,'clear-history',()=>clearHistory(()=>draw()));bind(area,'last-undo',undo);
      } else if(page==='system'){
        area.innerHTML=`<h2>System</h2><p>Informacje o działającej wersji i ustawieniach przykładu.</p><fieldset class="oa-group"><legend>Aplikacja</legend><dl class="oa-system-info"><dt>Wersja</dt><dd>${VERSION}</dd><dt>Interfejs</dt><dd>OpisAI dla Windows · demonstracja w przeglądarce</dd><dt>Dane wizyty</dt><dd>Lokalnie w tej przeglądarce</dd><dt>Ustawienia wyglądu</dt><dd>Zapamiętane w tej przeglądarce</dd></dl><div class="oa-inline-controls">${button('Kopiuj informacje','copy-info','','copy')}${button('O aplikacji','about','','info')}</div></fieldset><fieldset class="oa-group"><legend>Przywracanie</legend><p class="oa-form-help">Przywróć domyślne ustawienia OpisAI. Treść wizyty nie zostanie zmieniona.</p>${button('Przywróć ustawienia domyślne','reset-settings','','undo')}</fieldset>`;
        bind(area,'copy-info',()=>copyText(`OpisAI ${VERSION}\nInteraktywna demonstracja interfejsu Windows\nGenerator: ${draft.provider}\nDyktowanie: ${draft.transcriber}\nBez danych wizyty i poświadczeń.`,$('[data-action="copy-info"]',area)));bind(area,'about',about);bind(area,'reset-settings',()=>{draft=clone(defaults);dirty();applyTheme(win,draft.theme);draw();});
      } else {
        area.innerHTML=`<h2>Zgodność AI (RODO)</h2><p>Jawne źródła, nadzór lekarza i zatwierdzanie wpisu.</p><fieldset class="oa-group"><legend>Kontrola danych</legend><div class="oa-about-block"><p>Przed opracowaniem opisu widzisz dokładną treść pól. Możesz poprawić źródła i usunąć dane, których nie chcesz przekazać do wybranego połączenia.</p><p style="margin-top:10px">Zmiana treści lub zakresu unieważnia potwierdzenie. Nowe źródła wymagają ponownego sprawdzenia.</p></div></fieldset><fieldset class="oa-group"><legend>Nadzór nad wynikiem</legend><div class="oa-about-block"><p>OpisAI pokazuje wynik jako propozycję. Przed wpisaniem sprawdzasz tekst, właściwą wizytę i wybrane pola.</p><p style="margin-top:10px">Wpis jest wstrzymywany, jeśli zmienił się kontekst lub treść pól od wcześniejszego odczytu.</p></div></fieldset><div style="margin-top:16px">${notice('Tryb demonstracyjny: witryna nie wysyła treści wizyty do modeli AI, nie uruchamia mikrofonu i nie zapisuje danych w zewnętrznej Klinice. Pokazuje interfejs oraz przebieg pracy aplikacji.')}</div><p class="oa-form-help" style="margin-top:12px">Te funkcje wspierają kontrolę pracy. Sama demonstracja nie stanowi potwierdzenia zgodności prawnej konkretnego wdrożenia.</p>`;
      }
      $$('[data-setting]',area).forEach(el=>{
        el.addEventListener(el.type==='range'?'input':'change',()=>{
          const key=el.dataset.setting;draft[key]=el.type==='checkbox'?el.checked:el.type==='range'?Number(el.value):el.value;dirty();
          if(key==='provider'){draft.transport=draft.provider==='Lokalny'?'Lokalnie (offline)':'Przeglądarka';draw();}
          if(key==='transcriber')draw();
          if(key==='fontSize'){const text=$('[data-font-size]',area);if(text)text.textContent=draft.fontSize+' px';const preview=$('[data-font-preview]',area);if(preview)preview.style.fontSize=draft.fontSize+'px';}
          if(key==='orbSize'){const size=$('[data-orb-size]',area);if(size)size.textContent=Math.round(draft.orbSize/96*100)+'%';}
        });
      });
    }
    $$('[data-page]',root).forEach(el=>el.addEventListener('click',()=>{page=el.dataset.page;draw();}));
    $('.oa-settings-search',root).addEventListener('input',event=>{const q=normal(event.target.value);$$('[data-page]',root).forEach(el=>el.hidden=!!q&&!normal(el.textContent).includes(q));$$('.oa-nav-group',root).forEach(el=>el.hidden=!!q);});
    bind(root,'cancel-settings',()=>{applyTheme(win);win.close();});
    bind(root,'save-settings',()=>{
      preferences=clone(draft);savePreferences();Object.keys(FIELDS).forEach((key,i)=>FIELDS[key]=preferences.clinicalSections[i]||defaults.clinicalSections[i]);windows.forEach(w=>applyTheme(w));
      document.documentElement.style.setProperty('--oa-font-size',preferences.fontSize+'px');Clinic.setSpellingEnabled?.(preferences.spelling);updateOrbSize();
      if(state.phase==='preparing'){const active=windows.get('opisai-compose');if(active?.content){const label=$('[data-route]',active.content);if(label)label.textContent=route();const ack=$('#oa-compose-ack',active.content);if(ack){ack.checked=false;ack.dispatchEvent(new Event('change'));}}}
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
      if(page==='about')target.innerHTML=`<div class="oa-about-brand"><div class="oa-about-logo">${icon('opisai',44)}</div><div><h1>OpisAI</h1><p>Asystent dokumentacji weterynaryjnej</p><p class="oa-small">Wersja ${VERSION}</p></div></div><div class="oa-about-features">${[['document','Opis z notatki','Uporządkowanie źródeł i wybór wariantu.'],['mic','Dyktowanie','Od transkrypcji do sprawdzonego wpisu.'],['eye','Przegląd wyniku','Porównanie, edycja i świadome zatwierdzenie.'],['clinic','Obok Twojego programu','Praca na polach istniejącej wizyty.']].map(([ic,title,text])=>`<div class="oa-about-feature">${icon(ic,20)}<div><strong>${title}</strong><small>${text}</small></div></div>`).join('')}</div>${notice('To interaktywne demo aplikacji Windows. Przykładowe generowanie i dyktowanie działają lokalnie. Strona nie łączy się z modelami AI i nie używa mikrofonu.')}<div class="oa-about-block"><h3>Jak zacząć</h3><p>Kliknij niebieski bąbelek, aby opracować notatkę. Przytrzymaj go, aby zobaczyć dyktowanie. Prawy przycisk otwiera menu z konfiguracją i historią.</p></div>`;
      else if(page==='changes')target.innerHTML=`<div class="oa-about-block"><h2>Co nowego</h2><p class="oa-muted">Funkcje odwzorowane z aplikacji ${VERSION}</p><h3>Kontrolowany przebieg dokumentacji</h3><ul><li>Edytowalne źródła i sześć wariantów opracowania.</li><li>Podgląd wersji roboczej podczas generowania.</li><li>Porównanie źródła z edytowalnym wynikiem.</li><li>Osobne zatwierdzenie dokładnej treści przed wpisaniem.</li><li>Kontrola konfliktów oraz cofanie potwierdzonego wpisu.</li></ul><h3>Dyktowanie i wygoda</h3><ul><li>Panel transkrypcji, fala mikrofonu i stany kart.</li><li>Kontynuacja nagrania lub przygotowanie opisu z notatki.</li><li>Podpisane akcje przy bąbelku.</li><li>Ustawienia połączeń, wyglądu, pisowni i historii.</li></ul></div>`;
      else if(page==='contact'){target.innerHTML=`<div class="oa-about-block"><h2>Porozmawiajmy o OpisAI</h2><p class="oa-muted">Chcesz zobaczyć aplikację w swoim gabinecie?</p><div class="oa-contact-card"><strong>Łukasz Guziczak</strong><p>Autor OpisAI</p><a class="oa-contact-mail" href="mailto:guziczak@proton.me?subject=OpisAI%20%E2%80%94%20zapytanie%20z%20dema">guziczak@proton.me</a><div class="oa-inline-controls"><a class="oa-btn primary" href="mailto:guziczak@proton.me?subject=OpisAI%20%E2%80%94%20zapytanie%20z%20dema">${icon('send',15)} Napisz wiadomość</a>${button('Kopiuj adres','copy-email','','copy')}</div></div><p>W wiadomości możesz podać nazwę programu gabinetowego i opisać, jak dziś przygotowujesz dokumentację.</p></div>`;bind(target,'copy-email',()=>copyText('guziczak@proton.me',$('[data-action="copy-email"]',target)));}
      else target.innerHTML=`<div class="oa-about-block"><h2>Licencje i informacje</h2><p class="oa-muted">Demonstracja odtwarza interfejs OpisAI.</p><h3>Aplikacja desktopowa</h3><p>OpisAI wykorzystuje między innymi Python, PySide6, silniki rozpoznawania mowy i składniki przeglądarki. Pełne informacje o licencjach są dostępne w dostarczonym programie.</p><h3>Ta witryna</h3><p>Interfejs demonstracyjny jest napisany w HTML, CSS i JavaScript. Nie uruchamia programu Python ani dołączonych do niego bibliotek.</p><h3>Dane przykładu</h3><p>Przypadek kliniczny ma charakter demonstracyjny. Wynik pokazuje funkcje interfejsu i wymaga weryfikacji — nie jest poradą weterynaryjną.</p></div>`;
    }
    $$('[data-about]',root).forEach(el=>el.addEventListener('click',()=>{page=el.dataset.about;draw();}));bind(root,'close',()=>win.close());bind(root,'copy-about',()=>copyText(`OpisAI ${VERSION}\nAsystent dokumentacji weterynaryjnej\nInteraktywna demonstracja interfejsu Windows\nhttps://guziczak.github.io/opisai/\nguziczak@proton.me`,$('[data-action="copy-about"]',root)));draw();
  }

  /* The floating orb follows the native app's size, identity and spring drag. */
  function createOrb(){
    const host=document.getElementById('overlay-layer')||document.body;
    const wrap=document.createElement('div');wrap.className='oa-orb-wrap';wrap.dataset.phase='idle';
    wrap.innerHTML=`<button class="oa-orb" type="button" aria-label="OpisAI. Kliknij: opisz. Przytrzymaj: dyktuj. Prawy przycisk: menu.">
      <span class="oa-orb-surface" aria-hidden="true">
        <span class="oa-orb-face"></span><span class="oa-orb-identity"><svg class="oa-orb-mark" viewBox="0 0 48 44" focusable="false"><rect x="17" y="6" width="14" height="12" rx="4" fill="none" stroke="white" stroke-width="3"/><rect x="3" y="12" width="42" height="31" rx="8" fill="white"/><path class="oa-orb-cross" d="M22 19h4a1 1 0 0 1 1 1v6h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-6v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6v-6a1 1 0 0 1 1-1Z"/></svg><span class="oa-orb-name">OpisAI</span><span class="oa-orb-version">${VERSION}</span></span>
        <span class="oa-orb-progress"></span><span class="oa-orb-meter"><i></i><i></i><i></i><i></i><i></i></span>
      </span>
    </button><div class="oa-orb-caption" role="status" hidden></div><div class="oa-orb-actions"></div><div class="oa-orb-tooltip">Trzymaj: dyktowanie</div>`;
    host.append(wrap);state.orb=wrap;
    orbMotionQuery=matchMedia('(prefers-reduced-motion: reduce)');
    orbMotion=OpisAIOrbMotion.create({bounds:orbBounds(),diameter:orbSize(),reducedMotion:orbReducedMotion()});
    updateOrbSize();resetOrbPosition();renderOrbActions();
    const orb=$('.oa-orb',wrap);
    let pointer=null,hold=null,drag=false,held=false,dropTarget=null;
    const eventTime=event=>Number.isFinite(event.timeStamp)?event.timeStamp:performance.now();
    const clearHold=()=>{clearTimeout(hold);hold=null;wrap.classList.remove('holding');};
    const activate=()=>{stopOrb();if(['idle','done','error'].includes(state.phase))prepare();else showActive();};
    function targetAt(x,y){
      return document.elementsFromPoint(x,y).map(el=>el.closest?.('[data-clinic-field]')).find(Boolean)?.dataset.clinicField||null;
    }
    function clearTarget(){if(dropTarget)Clinic.markTarget?.(dropTarget,false);dropTarget=null;}
    function finishPointer(){
      if(!pointer)return;
      const id=pointer.id;
      clearTimeout(pointer.longTimer);clearHold();pointer=null;drag=false;held=false;
      wrap.classList.remove('dragging');clearTarget();
      try{if(orb.hasPointerCapture(id))orb.releasePointerCapture(id);}catch(_){}
    }
    orbCancelDrag=()=>{finishPointer();stopOrb();};
    function trackDrag(event){
      if(!pointer||pointer.id!==event.pointerId)return;
      const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(!drag&&Math.hypot(dx,dy)>6){
        drag=true;clearHold();clearTimeout(pointer.longTimer);wrap.classList.add('dragging');
      }
      if(!drag)return;
      const bounds=orbBounds();
      const x=Math.max(bounds.minX,Math.min(bounds.maxX,pointer.orbX+dx));
      const y=Math.max(bounds.minY,Math.min(bounds.maxY,pointer.orbY+dy));
      const time=eventTime(event);
      if(x!==pointer.lastX||y!==pointer.lastY){
        pointer.samples.push({x,y,time});pointer.lastX=x;pointer.lastY=y;pointer.lastMove=time;
        while(pointer.samples.length>2&&(pointer.samples[1].time<time-90||pointer.samples.length>32))pointer.samples.shift();
      }
      orbMotion.follow(x,y);renderOrb();requestOrbFrame();
      const key=targetAt(event.clientX,event.clientY);
      if(key!==dropTarget){clearTarget();dropTarget=key;if(key)Clinic.markTarget?.(key,true);}
    }
    function releaseVelocity(event){
      const now=eventTime(event),samples=pointer.samples;
      if(now-pointer.lastMove>80||samples.length<2)return {velocityX:0,velocityY:0};
      const first=samples[0],last=samples[samples.length-1];
      const dt=Math.max(.008,(Math.max(now,last.time)-first.time)/1000);
      return {velocityX:(last.x-first.x)/dt,velocityY:(last.y-first.y)/dt};
    }
    orb.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false||pointer)return;
      event.preventDefault();stopOrb();orbMotion.begin();
      const time=eventTime(event);
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,orbX:state.orbX,orbY:state.orbY,lastX:state.orbX,lastY:state.orbY,lastMove:time,samples:[{x:state.orbX,y:state.orbY,time}]};
      drag=false;held=false;
      $('.oa-orb-teach',wrap)?.remove();
      try{orb.setPointerCapture(event.pointerId);}catch(_){orbCancelDrag();return;}
      if(['idle','done','error','recording'].includes(state.phase)){
        $('.oa-orb-tooltip',wrap).textContent=state.recording?'Trzymaj: zakończ':'Trzymaj: dyktowanie';
        hold=setTimeout(()=>{if(pointer&&!drag)wrap.classList.add('holding');},150);
        pointer.longTimer=setTimeout(()=>{if(pointer&&!drag){held=true;clearHold();if(state.recording)finishDictation();else dictate();}},650);
      }
    });
    orb.addEventListener('pointermove',trackDrag);
    orb.addEventListener('pointerup',event=>{
      if(!pointer||pointer.id!==event.pointerId)return;
      trackDrag(event);
      const wasDrag=drag,wasHeld=held,target=dropTarget,velocity=releaseVelocity(event);
      finishPointer();
      if(wasDrag){
        // Only the explicit release point can start a field action, never inertia.
        if(target){stopOrb();if(!['processing','recording'].includes(state.phase))prepare({field:target});}
        else{orbMotion.release(velocity);renderOrb();requestOrbFrame();}
      }else{stopOrb();if(!wasHeld)activate();}
    });
    for(const type of ['pointercancel','lostpointercapture'])orb.addEventListener(type,event=>{
      if(pointer?.id===event.pointerId)orbCancelDrag();
    });
    orb.addEventListener('contextmenu',event=>{event.preventDefault();orbCancelDrag();orbMenu(event.clientX,event.clientY);});
    orb.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();orbCancelDrag();activate();}
      else if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();orbCancelDrag();orbMenu(state.orbX,state.orbY+orbSize());}
      else if(event.key==='Escape')orbCancelDrag();
    });
    // Assistive technologies can activate a button without a pointer/key sequence.
    orb.addEventListener('click',event=>{if(event.detail===0){orbCancelDrag();activate();}});
    window.addEventListener('blur',()=>orbCancelDrag());
    window.addEventListener('resize',()=>{orbCancelDrag();refreshOrbBounds();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)orbCancelDrag();});
    orbMotionQuery.addEventListener('change',()=>{orbCancelDrag();orbMotion.setReducedMotion(orbReducedMotion());renderOrb();});
    let taught=false;try{taught=sessionStorage.getItem('opisai-orb-intro')==='1';}catch(_){}
    if(!taught){setTimeout(()=>{if(!wrap.isConnected||state.phase!=='idle'||state.orbHidden)return;const intro=document.createElement('div');intro.className='oa-orb-teach';intro.innerHTML=`<button type="button" aria-label="Zamknij podpowiedź">${icon('close',13)}</button><strong>OpisAI jest gotowe</strong>Kliknij bąbelek, aby opracować wizytę.<span class="oa-orb-keyhint">Przytrzymaj — dyktowanie · Prawy — menu</span>`;wrap.append(intro);$('button',intro).addEventListener('click',()=>intro.remove());setTimeout(()=>intro.remove(),12000);try{sessionStorage.setItem('opisai-orb-intro','1');}catch(_){}},1200);}
  }
  function renderOrbActions(){
    const wrap=state.orb;if(!wrap)return;const recording=!!state.recording;
    const actions=recording?[['finish','Zakończ','stop'],['show','Pokaż','eye']]:state.phase==='processing'?[['show','Pokaż','eye'],['cancel','Anuluj','close']]:['review','preparing'].includes(state.phase)?[['show','Pokaż','eye']]:[['describe','Opisz','document'],['dictate','Dyktuj','mic']];
    $('.oa-orb-actions',wrap).innerHTML=actions.map(([action,label,ic])=>`<button type="button" data-orb-action="${action}">${icon(ic,13)}${label}</button>`).join('');
    $$('[data-orb-action]',wrap).forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();$('.oa-orb-teach',wrap)?.remove();switch(el.dataset.orbAction){case'describe':prepare();break;case'dictate':dictate();break;case'finish':finishDictation();break;case'show':showActive();break;case'cancel':{const cancel=$('[data-action="cancel"]',windows.get('opisai-progress')?.content||document.createElement('div'));cancel?.click();break;}}}));
  }
  function orbMenu(x,y){
    const menu=[
      {label:'Przygotuj opis wizyty',icon:'document',onClick:()=>prepare()},
      {label:state.recording?'Zakończ i sprawdź tekst':'Dyktowanie',icon:state.recording?'stop':'mic',shortcut:'Przytrzymaj',onClick:()=>state.recording?finishDictation():dictate()},
      {separator:true},
      {label:'Pokaż Klinikę',icon:'clinic',onClick:()=>Clinic.open()},
      {label:'Odczyt i przypisanie pól…',icon:'eye',onClick:()=>settings('fields')},
      {label:'Podpowiedzi pisowni',icon:'document',checked:preferences.spelling,onClick:()=>{preferences.spelling=!preferences.spelling;Clinic.setSpellingEnabled?.(preferences.spelling);savePreferences();}},
      {separator:true},
      {label:'Konfiguracja…',icon:'settings',onClick:()=>settings()},
      {label:'Historia generowań…',icon:'history',onClick:history},
      {label:'Cofnij ostatni wpis…',icon:'undo',disabled:!state.lastWrite,onClick:undo},
      {separator:true},
      {label:'O aplikacji…',icon:'info',onClick:()=>about()},
      {label:'Kontakt',icon:'send',onClick:()=>about('contact')},
      {separator:true},
      {label:'Ukryj bąbelek',icon:'close',onClick:hideBubble}
    ];
    Shell.menu(menu,x,y);
  }
  function orbSize(){return 100*preferences.orbSize/96;}
  function orbReducedMotion(){return !preferences.animations||!!orbMotionQuery?.matches;}
  function orbBounds(){
    const size=orbSize(),taskbarTop=$('#taskbar')?.getBoundingClientRect().top;
    const bottom=Number.isFinite(taskbarTop)&&taskbarTop>0?Math.min(innerHeight,taskbarTop):innerHeight-48;
    const controls=state.phase==='idle'?62:82;
    return {minX:8,minY:8,maxX:Math.max(8,innerWidth-size-8),maxY:Math.max(8,bottom-size-controls)};
  }
  function renderOrb(){
    if(!state.orb||!orbMotion)return;
    const motion=orbMotion.snapshot(),wrap=state.orb;
    state.orbX=motion.x;state.orbY=motion.y;
    wrap.style.transform=`translate3d(${motion.x.toFixed(2)}px,${motion.y.toFixed(2)}px,0)`;
    const reduced=orbReducedMotion();
    wrap.style.setProperty('--oa-orb-angle',`${motion.angle}rad`);
    wrap.style.setProperty('--oa-orb-stretch',motion.stretch.toFixed(4));
    wrap.style.setProperty('--oa-orb-squash',motion.squash.toFixed(4));
    wrap.classList.toggle('reduced-motion',reduced);
    wrap.classList.toggle('coasting',motion.mode==='coast'&&motion.moving);
    wrap.classList.toggle('near-left',motion.x<64);
    wrap.classList.toggle('near-right',motion.x>innerWidth-orbSize()-64);
    wrap.classList.toggle('left-half',motion.x+orbSize()/2<innerWidth/2);
  }
  function requestOrbFrame(){
    if(orbFrame||state.orbHidden||document.hidden||!orbMotion?.snapshot().moving)return;
    orbFrameTime=performance.now();
    orbFrame=requestAnimationFrame(stepOrb);
  }
  function stepOrb(now){
    orbFrame=0;
    if(!state.orb?.isConnected||state.orbHidden||document.hidden){stopOrb();return;}
    orbMotion.step((now-orbFrameTime)/1000);orbFrameTime=now;renderOrb();
    if(orbMotion.snapshot().moving)orbFrame=requestAnimationFrame(stepOrb);
  }
  function stopOrb(){
    if(orbFrame)cancelAnimationFrame(orbFrame);
    orbFrame=0;orbMotion?.stop();renderOrb();
  }
  function refreshOrbBounds(){orbMotion?.setBounds(orbBounds());renderOrb();}
  function positionOrb(x,y){orbMotion?.place(x,y);renderOrb();}
  function resetOrbPosition(){orbCancelDrag();positionOrb(Math.max(8,innerWidth-orbSize()-40),Math.max(8,innerHeight*.38));}
  function updateOrbSize(){
    if(!state.orb)return;
    orbCancelDrag();state.orb.style.setProperty('--oa-orb-size',orbSize()+'px');
    orbMotion?.setDiameter(orbSize());orbMotion?.setReducedMotion(orbReducedMotion());refreshOrbBounds();
  }
  function showBubble(){state.orbHidden=false;state.orb?.classList.remove('hidden');refreshOrbBounds();}
  function hideBubble(){orbCancelDrag();state.orbHidden=true;state.orb?.classList.add('hidden');}
  function init(){
    if(!window.Shell||!window.Icons)return;
    createOrb();
    document.documentElement.style.setProperty('--oa-font-size',preferences.fontSize+'px');
    Shell.registerApp({id:'opisai',title:'OpisAI',icon:'opisai',open:()=>{showBubble();if(state.phase==='idle')prepare();else showActive();}});
    Object.keys(FIELDS).forEach((key,i)=>FIELDS[key]=preferences.clinicalSections[i]||defaults.clinicalSections[i]);
    window.addEventListener('clinic:focus',event=>{state.activeField=event.detail?.field||state.activeField;});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.orb)state.orb.classList.remove('show-actions');});
    document.addEventListener('keydown',event=>{if(state.recording&&Shell.activeWindow?.id==='opisai-dictation'&&event.key==='Enter'&&!event.shiftKey&&!['TEXTAREA','INPUT','BUTTON','SELECT'].includes(event.target.tagName)){event.preventDefault();finishDictation();}});
    window.OpisAI={open:prepare,prepare,dictate,settings,history,about,showBubble,hideBubble,undo,getState:()=>({phase:state.phase,history:state.history.length,recording:!!state.recording,preferences:{...preferences}})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
