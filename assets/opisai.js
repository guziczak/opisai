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
    else {win=Shell.createWindow({id,title,icon:'opisai',width,height,minWidth:Math.min(width,500),minHeight:Math.min(height,360),className:'oa-host oa-theme-'+preferences.theme,content:html,resizable:true,maximizable:true,taskbar:true,onClose:()=>{if(onClose)onClose();}});windows.set(id,win);}
    applyTheme(win); if(win?.el)win.el.dataset.oaWindow=id; holdPosition(); return win; // a work view stops the idle bounce where it is
  }
  function closeWin(id) { windows.get(id)?.close(); }
  function getFields() { return clone(window.Clinic?.getFields?.() || {wywiad:'',badanie:'',diagnoza:''}); }
  function validOption(options) {return options && typeof options==='object' && !('target' in options && options.target instanceof Element)?options:{};}
  /* The compose view. The bubble stays at rest (blue "OpisAI") while it is open; its actions recall it. */
  function prepare(options={}) {
    options=typeof options==='string'?{field:options}:validOption(options);
    if(!visitReady())return;
    closeWin('opisai-review');
    const snapshot=clone(options.snapshot||getFields());
    const sources=clone(options.sources||snapshot);
    const field=FIELDS[options.field]?options.field:null;
    const variant={rich:preferences.rich,panel:preferences.panel,diagnosis:preferences.diagnosis};
    if(field && field!=='badanie')variant.panel=false;
    if(field==='diagnoza')variant.diagnosis=true;
    const op={id:++state.token,snapshot,sources,variant,field,fromDictation:!!options.fromDictation,approved:false,details:false};
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
      if(done>=28){clearInterval(timer);state.job=null;win.close();const result={id:op.id,snapshot:op.snapshot,sources:op.sources,output:outputs,variant:op.variant,field:op.field,mode:'generation',route:route(),created:new Date().toISOString()};state.review=result;review(result);}
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
      const applied=Clinic.setFields(changes,{expected:result.snapshot,source:'OpisAI'});
      if(!applied.ok){const err=$('[data-write-error]',root);err.hidden=false;err.innerHTML=icon('info',16)+`<div><strong>Zmieniła się treść wizyty.</strong><br>${esc(applied.reason||'Pola nie odpowiadają wcześniejszemu odczytowi.')} Odczytaj źródła ponownie.</div>`+button('Odczytaj ponownie','reread','small');bind(err,'reread',()=>{win.close();state.review=null;prepare({field:result.field});});invalidate();return;}
      const record={id:result.id,time:stamp(),mode:result.mode,variant:result.variant,route:result.route||'Przykładowe dyktowanie',before:clone(result.snapshot),after:clone(changes),status:'Wpis potwierdzony'};
      state.lastWrite=record;if(preferences.history)state.history.unshift(record);
      state.review=null;state.operation=null;win.close();state.active=null;setPhase('done');if(result.selected[0])Clinic.focusField(result.selected[0]);
      Shell.notify({title:'OpisAI — gotowe',message:`Wpisano ${result.selected.length===1?'tekst do pola':`tekst do ${result.selected.length} pól`}. Wizyta czeka na zapis w Klinice.`,icon:'opisai',actionLabel:'Cofnij wpis',onAction:undo});
    });
    bind(root,'compose',()=>{win.close();state.review=null;prepare({sources:{...result.snapshot,...result.edited},snapshot:result.snapshot,fromDictation:true});});
    bind(root,'continue',()=>{win.close();state.review=null;dictate({field:result.field||keys[0],base:result.edited[result.field||keys[0]],snapshot:result.snapshot,continuation:true,direct:true});});
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
    bind(root,'undo',()=>{if(!$('#oa-undo-ack',root).checked)return;const before={};fields.forEach(k=>before[k]=last.before[k]);const result=Clinic.setFields(before,{expected:last.after,source:'OpisAI — cofnięcie'});if(!result.ok){const error=$('[data-undo-error]',root);error.hidden=false;error.innerHTML=icon('info',16)+'<div>'+esc(result.reason||'Pola zmieniły się po wpisie. Nie cofnięto zmian.')+'</div>';return;}last.status='Cofnięto';state.lastWrite=null;win.close();setPhase('done');toast('Przywrócono poprzednią treść pól.');});
  }

  /* Recording is deliberately scripted: the microphone is never requested. */
  const DICTATION_TEXT='Pacjent jest dziś spokojniejszy. Właściciel zgłasza poprawę apetytu od wczoraj. Nadal obserwuje kichanie i wydzielinę wokół nozdrzy. Kontynuujemy obserwację objawów. Notatka do sprawdzenia przed wpisaniem.';
  /* Hold, "Dyktuj" and the menu (MacroController._on_triple_click): a second hold stops the
   * recording; an open OpisAI window is recalled instead; no dictation during generation. */
  function dictate(options={}){
    options=validOption(options);
    if(state.closed)launch();
    if(state.recording){finishDictation();return;}
    if(state.receipt||(!options.direct&&raiseActive()))return;
    if(state.job)return;
    if(!window.Clinic?.isEditorOpen?.()){errorCard('Nie znaleziono podokna wizyty — otwórz wizytę w Klinice.',{title:'⚠ Transkrypcja',accent:'#e74c3c'});return;}
    beginOperation();startDictation(options);
  }
  function startDictation(options){
    const field=FIELDS[options.field]?options.field:(Clinic.getActiveField?.()||state.activeField||'wywiad');
    const snapshot=clone(options.snapshot||getFields());
    state.review=null;closeWin('opisai-compose');closeWin('opisai-review');
    state.recording={id:++state.token,field,snapshot,base:options.base||'',text:'',wordIndex:0,seconds:0,paused:false,listening:false,started:Date.now(),tick:null,canvasFrame:null,continuation:!!options.continuation};
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
    setTimeout(()=>{if(state.receipt!==receipt)return;state.receipt=null;review({id:rec.id,snapshot:rec.snapshot,sources:{...rec.snapshot,[rec.field]:withBefore},output:{[rec.field]:withBefore},variant:{rich:false,panel:false,diagnosis:false},field:rec.field,mode:'dictation',route:'Przykładowe dyktowanie',created:new Date().toISOString()});},600);
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
        bind(area,'test-dictation',()=>{const el=$('[data-dictation-test]',area);el.textContent='Sprawdzam interfejs dyktowania…';setTimeout(()=>{if(el.isConnected)el.innerHTML='<span class="oa-success-text">Przykład jest gotowy. Mikrofon pozostaje wyłączony.</span>';},750);});bind(area,'sample-dictation',()=>{win.minimize();dictate({direct:true});});
      } else if(page==='fields'){
        const values=getFields();
        area.innerHTML=`<h2>Odczyt pola (Klinika)</h2><p>Powiązanie OpisAI z polami w oknie opisu wizyty.</p><fieldset class="oa-group"><legend>Okno docelowe</legend>${formRow('Program','<div class="oa-form-control"><strong>Klinika XP</strong><div class="oa-form-help">Bieżąca wizyta · przykład interaktywny</div></div>')}<div class="oa-inline-controls">${button('Pokaż Klinikę','show-clinic','','clinic')}${button('Odczytaj ponownie','read-fields','','document')}</div></fieldset><fieldset class="oa-group"><legend>Przypisane pola</legend><table class="oa-options-table"><thead><tr><th>Pole</th><th>Stan</th><th></th></tr></thead><tbody>${Object.entries(FIELDS).map(([key,label])=>`<tr><td>${esc(label)}</td><td><span class="oa-success-text">${icon('check',12)} Przypisane</span><br><small class="oa-muted">${String(values[key]||'').length} znaków</small></td><td>${button('Pokaż','field-'+key,'small','eye')}</td></tr>`).join('')}</tbody></table></fieldset><fieldset class="oa-group"><legend>Pisownia</legend>${switchControl('spelling','Podkreślaj podejrzane słowa w Klinice','Sugestie dotyczą widocznego przykładu. Poprawkę wybierasz samodzielnie.',draft)}</fieldset>`;
        bind(area,'show-clinic',()=>Clinic.open());bind(area,'read-fields',()=>{draw();toast('Odczytano bieżącą treść trzech pól.');});Object.keys(FIELDS).forEach(key=>bind(area,'field-'+key,()=>{if(!visitReady())return;win.minimize();Clinic.focusField(key);Clinic.markTarget?.(key,true);setTimeout(()=>Clinic.markTarget?.(key,false),1800);}));
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
      preferences=clone(draft);savePreferences();Object.keys(FIELDS).forEach((key,i)=>FIELDS[key]=preferences.clinicalSections[i]||defaults.clinicalSections[i]);windows.forEach(w=>applyTheme(w));
      document.documentElement.style.setProperty('--oa-font-size',preferences.fontSize+'px');Clinic.setSpellingEnabled?.(preferences.spelling);normalizeBounce(preferences);
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
  const orb={el:null,x:0,y:0,scale:0,scaleVel:0,scaleTarget:1,amp:0,ampTarget:0,hp1:0,hp2:0,chips:false,chipsAlpha:0,dip:0,pressed:false,armed:false,fired:false,arming:0,pressAt:0,hintState:'',sx:1,sy:1,lastY:null,decay:false,bulge:0,bulgeAngle:0,split:null,soak:null,soaked:false,exit:null,bounce:null,back:null,jellyR:null,contact:0,phys:null,physAcc:0,recAt:0,frame:0,last:0,hover:false,pressOrigin:null,drops:[],stateTimer:0,stateRev:0,menuBlock:0,timers:{}};
  let orbMotion=null,orbGesture=null,orbMotionQuery=null,pointer=null,dropTarget=null,lastInput=0,bounceWindow={last:null,count:0},card=null,cardSerial=0;
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
    if(orb.el){orb.el.dataset.phase=phase;renderOrbActions();$('.oa-orb',orb.el)?.setAttribute('aria-label',`OpisAI${phase==='idle'?'':' — '+{processing:'przetwarzanie',recording:'nagrywanie (REC)',review:'Sprawdź',done:'Gotowe',error:'Błąd'}[phase]}. Kliknij: opisz. Przytrzymaj: dyktuj. Prawy przycisk: menu.`);}
    orbKick();
  }
  function beginOperation(){ // _begin_bubble_operation: a new action owns its feedback
    if(state.phase==='done'||state.phase==='error')setPhase('idle');else{clearTimeout(orb.stateTimer);orb.stateRev++;}
    dismissCard(true);state.handlingFailure=false;
  }
  /* SafeCoordinator.intercept_trigger: clicking recalls the open view, it never starts a second operation. */
  function recall(){
    if(state.receipt)return true;
    if(state.recording){showDictation();return true;}
    if(raiseActive())return true;
    if(state.job){const w=windows.get('opisai-progress');if(w){w.show();w.focus();}return true;}
    if(state.review){review(state.review);return true;}
    return false;
  }
  function visitReady(){ // MacroController.on_trigger: the sub-window is required, OpisAI never opens a visit
    if(window.Clinic?.isEditorOpen?.())return true;
    if(!window.Clinic?.isOpen?.())failure("Nie znaleziono Kliniki (main: 'Klinika', sub: 'Rejestracja wizyty').\nUruchom Klinikę (przycisk na dymku) albo wybierz okno ponownie (prawy klik na bąbelek).",{actionLabel:'▶ Uruchom Klinikę',actionHint:'Uruchom Klinikę XP (wizytę otwierasz sam)',onAction:()=>{dismissCard();window.Clinic?.open();}});
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
    else if(action==='show')recall();else if(action==='cancel')state.job?.cancel();
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
    const el=document.createElement('section');el.className='oa-error-card';el.setAttribute('role','alertdialog');el.setAttribute('aria-labelledby',id+'-t');el.setAttribute('aria-describedby',id+'-b');
    el.innerHTML=`<svg class="oa-error-blob" aria-hidden="true"><defs><radialGradient id="${id}-f" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${shade(accent,1.13)}"/><stop offset=".55" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent,1/1.1)}"/></radialGradient><linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".157"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="${id}-p"><stop offset="0" stop-color="${shade(accent,1.4)}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><g id="${id}-g"><path data-shape="body"/><path data-shape="neck"/></g><clipPath id="${id}-c"><use href="#${id}-g"/></clipPath></defs><g data-trail></g>${[[14,.035],[9,.059],[4,.086]].map(([dy,a])=>`<use href="#${id}-g" transform="translate(0 ${dy})" fill="#000" opacity="${a}"/>`).join('')}<use href="#${id}-g" fill="url(#${id}-f)"/><use data-stroke href="#${id}-g" fill="none" stroke="${shade(accent,1/1.2)}" stroke-width="1"/><rect data-sheen clip-path="url(#${id}-c)" fill="url(#${id}-s)"/></svg><div class="oa-error-content"><div class="oa-error-head"><strong id="${id}-t">${esc(title)}</strong><button type="button" class="oa-error-close" aria-label="Zamknij komunikat" title="Zamknij ten komunikat (Esc)">×</button></div><p class="oa-error-body" id="${id}-b">${esc(message)}</p><div class="oa-error-hints">${actionLabel&&onAction?`<button type="button" class="oa-error-action" title="${esc(actionHint)}">${esc(actionLabel)}</button>`:''}<button type="button" class="oa-error-copy" aria-label="Kopiuj komunikat do schowka" title="Kopiuj komunikat do schowka">📋</button></div></div>`;
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
    const finish=()=>{state.closed=true;orb.exit=null;stopPhysics();if(orb.el)orb.el.classList.add('is-hidden');hideHint();toast('OpisAI zostało zamknięte. W demonstracji bąbelek wróci po kliknięciu ikony OpisAI w zasobniku albo na pulpicie.');};
    cancelGesture();releaseIdleMotion();stopPhysics();hideHint();
    if(orbReduced()){finish();return;}
    orb.exit={start:nowS(),done:finish};orb.scale=1;orb.scaleTarget=1;orb.scaleVel=0;orb.amp=orb.ampTarget=0;orb.sx=orb.sy=1;orbKick();
  }
  function launch(){ // start (or restart after "Zamknij"): scale from zero with the entrance spring
    if(!orb.el)return;
    const was=state.closed;state.closed=false;orb.exit=null;orb.el.classList.remove('is-hidden');
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
    hint.textContent=text;hint.hidden=false;
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
    button.addEventListener('contextmenu',event=>{event.preventDefault();if(orbGesture.phase==='held')return; /* a touch long press after the hold */cancelGesture();if(orb.bounce||orb.back)captureAtCurrent();showMenu(event.clientX,event.clientY);});
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
    const el=Shell.menu(orbMenuItems(),x,y,{className:'oa-menu',flip:true,onClose:()=>{orb.menuBlock=nowS()+.35;}});
    if(options.keyboard&&el?.querySelector)el.querySelector('button:not(:disabled)')?.focus();
    return el;
  }
  function orbMenuItems(){ // MacroController._setup_tray: same order, separators and submenus
    const unavailable=name=>()=>toast(`„${name}” jest niedostępne w demonstracji. Okna i pola Kliniki XP są tu przypisane na stałe.`);
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

  /* One animation loop, active only while something moves (Bubble._tick and its settle rule). */
  function orbKick(){if(!orb.el||orb.frame||document.hidden)return;orb.last=performance.now();orb.frame=requestAnimationFrame(orbFrame);}
  function orbFrame(now){
    orb.frame=0;if(!orb.el?.isConnected)return;
    const dt=Math.min(.1,Math.max(0,(now-orb.last)/1000));orb.last=now;
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
    orb.chipsAlpha+=(chipsTarget-orb.chipsAlpha)*ease(.3,dt);if(Math.abs(chipsTarget-orb.chipsAlpha)<.02)orb.chipsAlpha=chipsTarget;
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
      ||(orb.chipsAlpha!==0&&orb.chipsAlpha!==1)||orb.sx!==1||orb.sy!==1;
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
    if(logo)drawLogo(wrap,phase==='recording'?Math.min(1,(now-orb.recAt)/.32):0,phase==='recording'&&!reduced?now-orb.recAt:-1,color);
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
