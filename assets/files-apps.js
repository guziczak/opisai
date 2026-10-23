/* Explorer and Notepad for the local OpisAI demonstration. */
(() => {
  'use strict';
  const STORAGE = 'opisai.demo.files.v1';
  const MAX_TEXT = 200000;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = s => Shell.escape(s);
  const icon = (name, size = 20) => Icons.svg(name, size);
  const id = () => 'f-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fixedFolders = [
    {id:'desktop',parent:'computer',name:'Pulpit',type:'folder',icon:'computer',fixed:true},
    {id:'documents',parent:'computer',name:'Dokumenty',type:'folder',icon:'document',fixed:true},
    {id:'downloads',parent:'computer',name:'Pobrane',type:'folder',icon:'downloads',fixed:true},
  ];
  const now = Date.now();
  const seed = () => [
    ...fixedFolders.map(f=>({...f,modified:now})),
    {id:'guide-folder',parent:'documents',name:'OpisAI',type:'folder',modified:now},
    {id:'shortcut-opisai',parent:'desktop',name:'OpisAI',type:'app',appId:'opisai',icon:'opisai',modified:now},
    {id:'shortcut-clinic',parent:'desktop',name:'System gabinetowy',type:'app',appId:'clinic',icon:'clinic',modified:now},
    {id:'visit-note',parent:'documents',name:'Notatka z wizyty.txt',type:'text',modified:now,text:'NOTATKA Z WIZYTY — PRZYKŁAD\n\nPacjent: szczur, samiec, 1 rok i 9 miesięcy, 420 g.\n\nWywiad:\nOd około 2 tygodni kichanie i świszczący oddech. Mniejszy apetyt i aktywność.\n\nBadanie:\nPostawa zgarbiona, sierść nastroszona, oddech przyspieszony.\n\nTo fikcyjny przykład do poznania interfejsu.\n'},
    {id:'quick-guide',parent:'guide-folder',name:'Jak korzystać z OpisAI.txt',type:'text',modified:now,text:'OPISAI — SZYBKI START\n\n1. Otwórz System gabinetowy i zapoznaj się z przykładową wizytą.\n2. Kliknij bąbelek OpisAI, aby przygotować opis.\n3. Sprawdź treść i potwierdź, że nie zawiera danych właściciela.\n4. Wybierz styl i zakres opisu.\n5. Przejrzyj wynik przed użyciem.\n\nPrawy przycisk na bąbelku otwiera menu OpisAI.\nOkna można przesuwać, minimalizować, maksymalizować i przypinać do krawędzi pulpitu.\n\nTa strona jest interaktywną demonstracją aplikacji desktopowej.\n'},
    {id:'privacy-note',parent:'guide-folder',name:'O plikach tej demonstracji.txt',type:'text',modified:now,text:'PLIKI W DEMONSTRACJI\n\nEksplorator pokazuje przykładowe foldery i notatki tej strony. Nie przegląda dysku komputera.\n\nPolecenie Zapisz w Notatniku zapisuje notatkę w tej przeglądarce.\nPolecenie Pobierz kopię tworzy zwykły plik tekstowy do pobrania.\n\nUsunięte elementy trafiają do Kosza demonstracji. Można je przywrócić.\nWyczyszczenie danych strony usuwa lokalnie zapisane notatki.\n'},
    {id:'download-example',parent:'downloads',name:'Przykładowy opis.txt',type:'text',modified:now,text:'PRZYKŁADOWY OPIS WIZYTY\n\nWywiad\nSzczur, samiec, w wieku 1 roku i 9 miesięcy, o masie 420 g. Od około dwóch tygodni występują kichanie i świszczący oddech. Według notatki pacjent jest mniej aktywny i pobiera mniej pokarmu.\n\nBadanie kliniczne\nOdnotowano zgarbioną postawę, nastroszoną sierść i przyspieszony oddech.\n\nDokument demonstracyjny — wynik wymaga weryfikacji przez lekarza.\n'},
  ];
  let entries = seed(), explorer = null, fileClipboard = null, textClipboard = '', noteSerial = 0;
  let explorerTabs = [], tabSerial = 0;
  const notebooks = new Map();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if(stored?.version===1 && Array.isArray(stored.entries)) {
      const valid = stored.entries.filter(x=>x && typeof x.id==='string' && /^[a-zA-Z0-9_-]+$/.test(x.id) && typeof x.parent==='string' && /^[a-zA-Z0-9_-]+$/.test(x.parent) && typeof x.name==='string' && ['folder','text','app'].includes(x.type)).slice(0,250);
      entries = valid.map(x=>({...x,name:x.name.slice(0,120),text:String(x.text||'').slice(0,MAX_TEXT)}));
      for(const folder of fixedFolders) if(!entries.some(x=>x.id===folder.id)) entries.push({...folder,modified:now});
    }
  } catch {}
  const get = key => entries.find(x=>x.id===key);
  const isTrashed = entry => {
    let node=entry; const seen=new Set();
    while(node && !seen.has(node.id)){if(node.deletedAt)return true;seen.add(node.id);node=get(node.parent);}
    return false;
  };
  function persist() {
    try {localStorage.setItem(STORAGE,JSON.stringify({version:1,entries}));}
    catch {Shell.notify({app:'Notatnik',icon:'notepad',title:'Nie udało się zapisać w przeglądarce',message:'Pobierz kopię notatki, aby zachować tekst.'});return false;}
    refreshExplorer();return true;
  }
  function folderLabel(key) {return ({home:'Strona główna',computer:'Ten komputer',recycleBin:'Kosz'})[key] || get(key)?.name || 'Dokumenty';}
  function folderIcon(key) {return ({home:'home',computer:'computer',recycleBin:'recycleBin'})[key] || get(key)?.icon || 'folder';}
  function normalizePath(value) {
    const raw=String(value||'home').trim();
    if(get(raw)?.type==='folder'&&!isTrashed(get(raw)))return raw;
    const key=raw.toLocaleLowerCase('pl').replace(/[\\/]+$/,'');
    return ({home:'home','strona główna':'home',pulpit:'desktop',desktop:'desktop',documents:'documents',dokumenty:'documents',downloads:'downloads',pobrane:'downloads',computer:'computer','ten komputer':'computer',pc:'computer',kosz:'recycleBin',recyclebin:'recycleBin',recycle:'recycleBin'})[key] || null;
  }
  function breadcrumb(key) {
    if(['home','computer','recycleBin'].includes(key))return [key];
    const result=[],seen=new Set();let current=key;
    while(current&&current!=='computer'&&!seen.has(current)){seen.add(current);result.unshift(current);current=get(current)?.parent;}
    return ['computer',...result];
  }
  const locationName = entry => breadcrumb(entry.parent).map(folderLabel).join(' > ');
  const typeName = entry => entry.type==='folder'?'Folder plików':entry.type==='app'?'Skrót':'Dokument tekstowy';
  const entryIcon = entry => entry.icon || (entry.type==='folder'?'folder':entry.type==='app'?'opisai':'notepad');
  const dateLabel = entry => new Date(entry.modified||now).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const fileSize = entry => entry.type==='text'?Math.max(1,Math.ceil(new Blob([entry.text||'']).size/1024))+' KB':'';
  function uniqueName(name,parent,except) {
    const taken=n=>entries.some(x=>x.parent===parent&&x.id!==except&&!isTrashed(x)&&x.name.toLocaleLowerCase('pl')===n.toLocaleLowerCase('pl'));
    if(!taken(name))return name;
    const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
    let n=2;while(taken(`${base} (${n})${ext}`))n++;return `${base} (${n})${ext}`;
  }
  function validateName(name) {return name.trim()&&!/[\\/:*?"<>|\x00-\x1f]/.test(name)&&name.trim()!=='.'&&name.trim()!=='..';}
  function nameDialog({title,value='',label='Nazwa',folder=false,parent='documents',submit='Zapisz',onSubmit}) {
    const dialog=Shell.createWindow({id:'files-name-'+id(),title,icon:folder?'folder':'notepad',width:460,height:folder?290:250,minWidth:300,minHeight:220,resizable:false,maximizable:false,taskbar:false,
      content:`<form class="files-name-form"><label>${esc(label)}<input class="win-input files-name-input" maxlength="120" autocomplete="off" value="${esc(value)}" required></label>${folder?`<label>Folder<select class="win-select files-folder-select">${entries.filter(f=>f.type==='folder'&&!isTrashed(f)).map(f=>`<option value="${f.id}"${f.id===parent?' selected':''}>${esc(breadcrumb(f.id).slice(1).map(folderLabel).join(' > '))}</option>`).join('')}</select></label>`:''}<p class="files-form-error" role="alert"></p><div class="files-dialog-buttons"><button type="submit" class="win-button primary">${esc(submit)}</button><button type="button" class="win-button" data-cancel>Anuluj</button></div></form>`});
    const input=$('.files-name-input',dialog.content);setTimeout(()=>{input.focus();input.select();},0);
    $('[data-cancel]',dialog.content).onclick=()=>dialog.close();
    $('form',dialog.content).onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!validateName(name)){$('.files-form-error',dialog.content).textContent='Wpisz nazwę bez znaków \\ / : * ? " < > |.';return;}const target=$('.files-folder-select',dialog.content)?.value||parent;if(onSubmit(name,target)!==false)dialog.close();};
    return dialog;
  }
  function selectedEntries() {return explorer?[...explorer.selected].map(get).filter(Boolean):[];}
  function refreshExplorer() {if(explorer&&!explorer.win.closed)renderExplorer();}
  function newTabState(win,path) {return {win,tabId:'explorer-tab-'+(++tabSerial),path,stack:[path],position:0,selected:new Set(),anchor:null,query:'',sort:'name',visible:[],scrollTop:0};}
  function rememberTabScroll() {if(explorer&&!explorer.win.closed)explorer.scrollTop=$('.explorer-files',explorer.win.content)?.scrollTop||0;}
  function addExplorerTab(path='home') {
    const target=normalizePath(path)||'home';
    if(!explorer||explorer.win.closed)return openExplorer(target);
    rememberTabScroll();const tab=newTabState(explorer.win,target);explorerTabs.push(tab);explorer=tab;renderExplorer();return tab.win;
  }
  function switchExplorerTab(key) {const tab=explorerTabs.find(x=>x.tabId===key);if(!tab||tab===explorer)return;rememberTabScroll();explorer=tab;renderExplorer();}
  function closeExplorerTab(key=explorer?.tabId) {
    const index=explorerTabs.findIndex(x=>x.tabId===key);if(index<0)return;
    if(explorerTabs.length===1){explorer.win.close();explorerTabs=[];return;}
    const active=explorer.tabId===key;explorerTabs.splice(index,1);
    if(active){explorer=explorerTabs[Math.min(index,explorerTabs.length-1)];renderExplorer();}else renderExplorerTabs();
  }
  function renderExplorerTabs() {
    const win=explorer.win,header=$('.titlebar',win.el);let host=$('.files-title-tabs',header);
    if(!host){host=document.createElement('div');host.className='explorer-tabs files-title-tabs';header.insertBefore(host,$('.caption-buttons',header));}
    host.innerHTML=`<div class="files-tab-strip" role="tablist" aria-label="Karty Eksploratora">${explorerTabs.map(tab=>`<div class="explorer-tab${tab===explorer?' active':''}" data-tab="${tab.tabId}"><button type="button" class="files-tab-select" role="tab" id="select-${tab.tabId}" aria-selected="${tab===explorer}" aria-controls="files-explorer-panel" tabindex="${tab===explorer?0:-1}" title="${esc(folderLabel(tab.path))}" data-tab-select="${tab.tabId}">${icon(folderIcon(tab.path),16)}<span>${esc(folderLabel(tab.path))}</span></button><button type="button" class="files-tab-close" aria-label="Zamknij kartę: ${esc(folderLabel(tab.path))}" title="Zamknij kartę (Ctrl+W)" data-tab-close="${tab.tabId}">${icon('close',9)}</button></div>`).join('')}</div><button type="button" class="files-new-tab" aria-label="Nowa karta" title="Nowa karta (Ctrl+T)">${icon('plus',14)}</button>`;
    $$('[data-tab-select]',host).forEach(button=>{
      button.onclick=()=>switchExplorerTab(button.dataset.tabSelect);
      button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const index=explorerTabs.findIndex(x=>x.tabId===button.dataset.tabSelect);const next=e.key==='Home'?0:e.key==='End'?explorerTabs.length-1:(index+(e.key==='ArrowRight'?1:explorerTabs.length-1))%explorerTabs.length;const key=explorerTabs[next].tabId;switchExplorerTab(key);$(`[data-tab-select="${key}"]`,header)?.focus();};
    });
    $$('[data-tab-close]',host).forEach(button=>button.onclick=()=>closeExplorerTab(button.dataset.tabClose));
    $$('.explorer-tab',host).forEach(tab=>tab.onauxclick=e=>{if(e.button===1){e.preventDefault();closeExplorerTab(tab.dataset.tab);}});
    $('.files-new-tab',host).onclick=()=>addExplorerTab();
    const active=$('.explorer-tab.active',host);active?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function navigate(path,record=true) {
    if(!explorer)return;const target=normalizePath(path);if(!target)return;
    if(record&&target!==explorer.path){explorer.stack=explorer.stack.slice(0,explorer.position+1);explorer.stack.push(target);explorer.position++;}
    explorer.path=target;explorer.selected.clear();explorer.anchor=null;explorer.query='';explorer.scrollTop=0;renderExplorer();
  }
  function goHistory(direction) {const i=explorer.position+direction;if(i<0||i>=explorer.stack.length)return;explorer.position=i;navigate(explorer.stack[i],false);}
  function writableFolder() {return get(explorer?.path)?.type==='folder'?explorer.path:'documents';}
  function createEntry(folder) {
    const parent=writableFolder();
    nameDialog({title:folder?'Nowy folder':'Nowy dokument tekstowy',label:folder?'Nazwa folderu':'Nazwa dokumentu',value:folder?'Nowy folder':'Nowy dokument.txt',submit:'Utwórz',parent,onSubmit:name=>{
      if(entries.length>=250){Shell.toast('W demonstracji można zapisać do 250 elementów.');return false;}
      if(!folder&&!/\.txt$/i.test(name))name+='.txt';
      const entry={id:id(),parent,name:uniqueName(name,parent),type:folder?'folder':'text',text:'',modified:Date.now()};entries.push(entry);
      if(!persist())return false;navigate(parent);explorer.selected.add(entry.id);renderExplorer();
    }});
  }
  function renameEntry(entry) {
    if(!entry||entry.fixed||isTrashed(entry))return;
    nameDialog({title:'Zmień nazwę',value:entry.name,submit:'Zmień nazwę',parent:entry.parent,onSubmit:name=>{
      if(entries.some(x=>x.id!==entry.id&&x.parent===entry.parent&&!isTrashed(x)&&x.name.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl'))){Shell.toast('Element o tej nazwie już istnieje.');return false;}
      entry.name=name;entry.modified=Date.now();persist();const note=[...notebooks.values()].find(n=>n.fileId===entry.id);if(note){note.name=name;updateNote(note);}
    }});
  }
  function descendants(root) {const result=[root];for(let i=0;i<result.length;i++)for(const child of entries)if(child.parent===result[i]&&!result.includes(child.id))result.push(child.id);return result;}
  function deleteEntries() {
    const list=selectedEntries().filter(x=>!x.fixed);if(!list.length)return;
    if(explorer.path==='recycleBin'){
      Shell.confirm({title:'Usuń pliki',icon:'recycleBin',message:`Trwale usunąć ${list.length===1?'„'+list[0].name+'”':list.length+' elementów'} z Kosza demonstracji?`,confirmLabel:'Usuń',onConfirm:()=>{const ids=new Set(list.flatMap(x=>descendants(x.id)));entries=entries.filter(x=>!ids.has(x.id));explorer.selected.clear();persist();}});
    }else{for(const entry of list)entry.deletedAt=Date.now();explorer.selected.clear();persist();Shell.toast(list.length===1?'Przeniesiono do Kosza.':`Przeniesiono ${list.length} elementów do Kosza.`);}
  }
  function restoreEntries(list=selectedEntries()) {for(const entry of list){delete entry.deletedAt;const parent=get(entry.parent);if(!parent||isTrashed(parent))entry.parent='documents';entry.name=uniqueName(entry.name,entry.parent,entry.id);}explorer?.selected.clear();persist();}
  function emptyRecycle() {const list=entries.filter(x=>isTrashed(x));if(!list.length)return;Shell.confirm({title:'Opróżnij Kosz',icon:'recycleBin',message:'Trwale usunąć wszystkie elementy z Kosza demonstracji?',confirmLabel:'Opróżnij Kosz',onConfirm:()=>{const ids=new Set(list.map(x=>x.id));entries=entries.filter(x=>!ids.has(x.id));persist();}});}
  function copyEntries(cut=false) {const list=selectedEntries().filter(x=>!x.fixed&&!isTrashed(x));if(!list.length)return;fileClipboard={ids:list.map(x=>x.id),cut};Shell.toast(cut?'Wycięto elementy. Wybierz folder i wklej.':'Skopiowano elementy.');renderExplorer();}
  function pasteEntries() {
    if(!fileClipboard||explorer.path==='recycleBin')return;
    const parent=writableFolder();let count=0;
    for(const key of fileClipboard.ids){const original=get(key);if(!original||isTrashed(original)||descendants(key).includes(parent))continue;
      if(fileClipboard.cut){original.name=uniqueName(original.name,parent,original.id);original.parent=parent;original.modified=Date.now();count++;}
      else{const sourceIds=descendants(key),source=entries.filter(x=>sourceIds.includes(x.id));if(entries.length+source.length>250){Shell.toast('Osiągnięto limit 250 elementów demonstracji.');break;}const mapping=new Map(source.map(x=>[x.id,id()]));for(const entry of source)entries.push({...entry,id:mapping.get(entry.id),parent:entry.id===key?parent:mapping.get(entry.parent),name:entry.id===key?uniqueName(entry.name,parent):entry.name,modified:Date.now(),fixed:false});count++;}
    }
    if(fileClipboard.cut)fileClipboard=null;if(count){persist();if(explorer.path!==parent)navigate(parent);}else Shell.toast('Wybierz inny folder docelowy.');
  }
  function showProperties(entry) {Shell.confirm({title:'Właściwości: '+entry.name,icon:entryIcon(entry),heading:entry.name,message:`Typ: ${typeName(entry)}\nLokalizacja: ${locationName(entry)}\nZmodyfikowano: ${dateLabel(entry)}${entry.type==='text'?'\nRozmiar: '+fileSize(entry):''}\n\nElement demonstracji zapisany w tej przeglądarce.`});}
  function openEntry(entry) {
    if(!entry)return;
    if(isTrashed(entry)){Shell.confirm({title:entry.name,icon:'recycleBin',message:'Ten element znajduje się w Koszu demonstracji. Przywrócić go do folderu?',confirmLabel:'Przywróć',onConfirm:()=>restoreEntries([entry])});return;}
    if(entry.type==='folder')navigate(entry.id);else if(entry.type==='app')Shell.openApp(entry.appId);else openNotepad(entry.name,entry.text,entry.id);
  }
  function explorerMenu(event,entry) {
    event.preventDefault();event.stopPropagation();
    if(entry&&!explorer.selected.has(entry.id)){explorer.selected.clear();explorer.selected.add(entry.id);renderSelection();}
    const selected=selectedEntries(),has=selected.length>0,one=selected.length===1,editable=has&&!selected.some(x=>x.fixed),trash=explorer.path==='recycleBin';
    const items=trash?[
      {label:'Przywróć',icon:'undo',disabled:!has,onClick:()=>restoreEntries()},
      {label:'Usuń',icon:'delete',disabled:!has,onClick:deleteEntries},
      {label:'Opróżnij Kosz',icon:'recycleBin',disabled:!entries.some(isTrashed),onClick:emptyRecycle},
    ]:[
      {label:'Otwórz',icon:'arrowRight',disabled:!one,onClick:()=>openEntry(selected[0])},
      {separator:true},
      {label:'Wytnij',icon:'cut',shortcut:'Ctrl+X',disabled:!editable,onClick:()=>copyEntries(true)},
      {label:'Kopiuj',icon:'copy',shortcut:'Ctrl+C',disabled:!editable,onClick:()=>copyEntries()},
      {label:'Wklej',icon:'paste',shortcut:'Ctrl+V',disabled:!fileClipboard,onClick:pasteEntries},
      {label:'Zmień nazwę',icon:'rename',shortcut:'F2',disabled:!one||!editable,onClick:()=>renameEntry(selected[0])},
      {label:'Usuń',icon:'delete',shortcut:'Delete',disabled:!editable,onClick:deleteEntries},
      {separator:true},
      {label:'Nowy',icon:'plus',children:[{label:'Folder',icon:'folder',onClick:()=>createEntry(true)},{label:'Dokument tekstowy',icon:'notepad',onClick:()=>createEntry(false)}]},
      {label:'Odśwież',icon:'refresh',shortcut:'F5',onClick:renderExplorer},
    ];
    if(one)items.push({separator:true},{label:'Właściwości',icon:'info',shortcut:'Alt+Enter',onClick:()=>showProperties(selected[0])});
    Shell.menu(items,event.clientX,event.clientY);
  }
  function listForPath() {
    let list;
    if(explorer.path==='recycleBin')list=entries.filter(x=>x.deletedAt);
    else if(explorer.path==='home')list=entries.filter(x=>x.type==='text'&&!isTrashed(x)).sort((a,b)=>b.modified-a.modified);
    else list=entries.filter(x=>x.parent===explorer.path&&!isTrashed(x));
    const query=explorer.query.toLocaleLowerCase('pl');if(query)list=list.filter(x=>(x.name+' '+(x.type==='text'?x.text:'')).toLocaleLowerCase('pl').includes(query));
    if(explorer.path!=='home'||explorer.sort!=='name')list.sort((a,b)=>Number(b.type==='folder')-Number(a.type==='folder')||(explorer.sort==='modified'?(b.modified||0)-(a.modified||0):a.name.localeCompare(b.name,'pl')));
    return list;
  }
  function renderSelection() {
    const root=explorer.win.content;
    $$('[data-entry]',root).forEach(el=>{const yes=explorer.selected.has(el.dataset.entry);el.classList.toggle('selected',yes);el.setAttribute('aria-selected',String(yes));});
    const count=explorer.visible.length,selected=explorer.selected.size;
    $('.explorer-status',root).textContent=`Liczba elementów: ${count}${selected?' · zaznaczono: '+selected:''} · Pliki demonstracji`;
    $$('[data-needs-selection]',root).forEach(b=>b.disabled=!selected||selectedEntries().some(x=>x.fixed));
  }
  function selectEntry(event,key) {
    const selected=explorer.selected;
    if(event.shiftKey&&explorer.anchor){const ids=explorer.visible.map(x=>x.id),a=ids.indexOf(explorer.anchor),b=ids.indexOf(key);if(a>=0&&b>=0){if(!event.ctrlKey&&!event.metaKey)selected.clear();ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>selected.add(x));}}
    else if(event.ctrlKey||event.metaKey){if(selected.has(key))selected.delete(key);else selected.add(key);explorer.anchor=key;}
    else{selected.clear();selected.add(key);explorer.anchor=key;}
    renderSelection();
  }
  function renderExplorer() {
    if(!explorer||explorer.win.closed)return;
    if(!normalizePath(explorer.path))explorer.path='documents';
    const root=explorer.win.content,path=explorer.path,trash=path==='recycleBin',list=listForPath();explorer.visible=list;
    explorer.selected=new Set([...explorer.selected].filter(key=>list.some(x=>x.id===key)));
    explorer.win.setTitle(folderLabel(path)+' — Eksplorator plików');
    renderExplorerTabs();root.id='files-explorer-panel';root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','select-'+explorer.tabId);
    root.innerHTML=`<div class="explorer-toolbar">${trash?`<button data-command="restore">${icon('undo',18)}<span>Przywróć</span></button><button data-command="empty">${icon('delete',18)}<span>Opróżnij Kosz</span></button>`:`<button data-command="new">${icon('plus',18)}<span>Nowy</span>${icon('chevronDown',10)}</button><span class="toolbar-sep"></span><button data-command="cut" title="Wytnij (Ctrl+X)" aria-label="Wytnij" data-needs-selection>${icon('cut',18)}</button><button data-command="copy" title="Kopiuj (Ctrl+C)" aria-label="Kopiuj" data-needs-selection>${icon('copy',18)}</button><button data-command="paste" title="Wklej (Ctrl+V)" aria-label="Wklej"${!fileClipboard?' disabled':''}>${icon('paste',18)}</button><button data-command="rename" title="Zmień nazwę (F2)" aria-label="Zmień nazwę" data-needs-selection>${icon('rename',18)}</button><button data-command="delete" title="Usuń (Delete)" aria-label="Usuń" data-needs-selection>${icon('delete',18)}</button><span class="toolbar-sep"></span><button data-command="sort">${icon('sort',18)}<span>Sortuj</span>${icon('chevronDown',10)}</button>`}<button data-command="more" aria-label="Więcej opcji">${icon('more',18)}</button></div>
      <div class="explorer-location"><div class="files-navigation"><button data-nav="back" aria-label="Wstecz" title="Wstecz (Alt+←)"${explorer.position<=0?' disabled':''}>${icon('arrowLeft',16)}</button><button data-nav="forward" aria-label="Dalej" title="Dalej (Alt+→)"${explorer.position>=explorer.stack.length-1?' disabled':''}>${icon('arrowRight',16)}</button><button data-nav="up" aria-label="W górę" title="W górę"${['home','computer','recycleBin'].includes(path)?' disabled':''}>${icon('arrowUp',16)}</button><button data-nav="refresh" aria-label="Odśwież" title="Odśwież">${icon('refresh',16)}</button></div><div class="explorer-address" title="Adres (Ctrl+L)">${icon(folderIcon(path),16)}<div class="files-breadcrumbs">${breadcrumb(path).map((key,i)=>`${i?icon('chevronRight',10):''}<button data-path="${esc(key)}">${esc(folderLabel(key))}</button>`).join('')}</div><input class="files-address-input" aria-label="Adres folderu" hidden></div><input type="search" class="win-input explorer-search" placeholder="Wyszukaj w: ${esc(folderLabel(path))}" value="${esc(explorer.query)}" aria-label="Wyszukaj w folderze"></div>
      <div class="explorer-workspace"><nav class="explorer-sidebar" aria-label="Foldery">${['home','desktop','documents','downloads','computer','recycleBin'].map(key=>`${key==='computer'?'<div class="sidebar-rule"></div>':''}<button data-path="${key}" class="${path===key?'selected':''}">${icon(folderIcon(key),19)}<span>${esc(folderLabel(key))}</span></button>`).join('')}</nav><div class="explorer-files" tabindex="0" aria-label="Pliki i foldery">
      ${path==='home'&&!explorer.query?`<h3>Szybki dostęp</h3><div class="folder-grid files-quick-access">${fixedFolders.map(f=>`<button class="folder-tile" data-path="${f.id}">${icon(folderIcon(f.id),38)}<span>${esc(f.name)}<small>Folder demonstracji</small></span></button>`).join('')}</div><h3>Ostatnio używane</h3>`:''}
      ${list.length?`<table class="file-table" role="grid" aria-label="Lista plików"><thead><tr><th scope="col">Nazwa</th><th scope="col">Data modyfikacji</th><th scope="col">${trash?'Pierwotna lokalizacja':'Typ'}</th><th scope="col">Rozmiar</th></tr></thead><tbody>${list.map(entry=>`<tr data-entry="${esc(entry.id)}" tabindex="0" aria-selected="false"><td><span>${icon(entryIcon(entry),20)}<span>${esc(entry.name)}</span></span></td><td>${esc(dateLabel(entry))}</td><td>${esc(trash?locationName(entry):typeName(entry))}</td><td>${fileSize(entry)}</td></tr>`).join('')}</tbody></table>`:`<div class="empty-folder">${icon(trash?'recycleBin':explorer.query?'search':'folder',56)}<span>${explorer.query?'Żaden element nie pasuje do wyszukiwania.':trash?'Kosz jest pusty.':'Ten folder jest pusty.'}</span></div>`}</div></div><div class="explorer-status" aria-live="polite"></div>`;
    $$('[data-path]',root).forEach(b=>b.onclick=()=>navigate(b.dataset.path));
    $$('[data-nav]',root).forEach(b=>b.onclick=()=>({back:()=>goHistory(-1),forward:()=>goHistory(1),up:()=>navigate(get(path)?.parent||'computer'),refresh:renderExplorer}[b.dataset.nav])());
    $$('[data-command]',root).forEach(b=>b.onclick=e=>{const r=b.getBoundingClientRect();const at=items=>Shell.menu(items,r.left,r.bottom+4);switch(b.dataset.command){case'new':at([{label:'Folder',icon:'folder',onClick:()=>createEntry(true)},{label:'Dokument tekstowy',icon:'notepad',onClick:()=>createEntry(false)}]);break;case'cut':copyEntries(true);break;case'copy':copyEntries();break;case'paste':pasteEntries();break;case'rename':renameEntry(selectedEntries()[0]);break;case'delete':deleteEntries();break;case'restore':restoreEntries();break;case'empty':emptyRecycle();break;case'sort':at([{label:'Nazwa',checked:explorer.sort==='name',onClick:()=>{explorer.sort='name';renderExplorer();}},{label:'Data modyfikacji',checked:explorer.sort==='modified',onClick:()=>{explorer.sort='modified';renderExplorer();}}]);break;default:explorerMenu({preventDefault(){},stopPropagation(){},clientX:r.left,clientY:r.bottom+4},null);}});
    const search=$('.explorer-search',root);search.oninput=()=>{explorer.query=search.value;const start=search.selectionStart;renderExplorer();const fresh=$('.explorer-search',root);fresh.focus();try{fresh.setSelectionRange(start,start);}catch{}};
    const address=$('.explorer-address',root);address.ondblclick=()=>focusAddress();
    $('.files-address-input',root).onkeydown=e=>{if(e.key==='Escape'){renderExplorer();return;}if(e.key==='Enter'){const raw=e.target.value,segments=raw.split(/[\\/>]+/).map(x=>x.trim()).filter(Boolean);let target=normalizePath(raw)||normalizePath(segments.at(-1));if(!target&&segments.length){let parent=normalizePath(segments[0])||'computer';for(const segment of segments.slice(1)){const node=entries.find(x=>x.parent===parent&&x.type==='folder'&&!isTrashed(x)&&x.name.toLocaleLowerCase('pl')===segment.toLocaleLowerCase('pl'));parent=node?.id||'';}target=parent;}if(target&&normalizePath(target))navigate(target);else Shell.toast('Nie znaleziono takiego folderu w demonstracji.');}};
    const files=$('.explorer-files',root);files.oncontextmenu=e=>{if(!e.target.closest('[data-entry]')){explorer.selected.clear();renderSelection();explorerMenu(e,null);}};files.onclick=e=>{if(!e.target.closest('[data-entry],button')){explorer.selected.clear();renderSelection();}};
    $$('[data-entry]',root).forEach(row=>{row.onclick=e=>selectEntry(e,row.dataset.entry);row.ondblclick=()=>openEntry(get(row.dataset.entry));row.oncontextmenu=e=>explorerMenu(e,get(row.dataset.entry));});
    renderSelection();files.scrollTop=explorer.scrollTop;
  }
  function focusAddress() {const root=explorer.win.content,input=$('.files-address-input',root);$('.files-breadcrumbs',root).hidden=true;input.hidden=false;input.value=breadcrumb(explorer.path).map(folderLabel).join(' > ');input.focus();input.select();}
  function explorerKeys(e) {
    const shortcut=e.ctrlKey||e.metaKey,keyPressed=e.key.toLowerCase();
    if(shortcut&&['t','w'].includes(keyPressed)){e.preventDefault();e.stopPropagation();if(keyPressed==='t')addExplorerTab();else closeExplorerTab();return;}
    if(shortcut&&e.key==='Tab'){e.preventDefault();e.stopPropagation();const index=explorerTabs.indexOf(explorer),next=(index+(e.shiftKey?explorerTabs.length-1:1))%explorerTabs.length;switchExplorerTab(explorerTabs[next].tabId);return;}
    const editing=e.target.matches('input,textarea');if(editing&&!(e.ctrlKey&&['f','l'].includes(e.key.toLowerCase())))return;
    const command=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(command&&['c','x','v','a','f','l'].includes(key)){e.preventDefault();e.stopPropagation();if(key==='c')copyEntries();if(key==='x')copyEntries(true);if(key==='v')pasteEntries();if(key==='a'){explorer.visible.forEach(x=>explorer.selected.add(x.id));renderSelection();}if(key==='f')$('.explorer-search',explorer.win.content).focus();if(key==='l')focusAddress();return;}
    if(e.altKey&&['ArrowLeft','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')goHistory(-1);else if(e.key==='ArrowRight')goHistory(1);else navigate(get(explorer.path)?.parent||'computer');return;}
    if(e.key==='F2'){e.preventDefault();renameEntry(selectedEntries()[0]);}else if(e.key==='Delete'){e.preventDefault();deleteEntries();}else if(e.key==='Enter'&&!e.target.closest('button')){e.preventDefault();openEntry(selectedEntries()[0]||get(e.target.dataset.entry));}else if(e.key==='Backspace'){e.preventDefault();navigate(get(explorer.path)?.parent||'computer');}else if(e.key==='F5'){e.preventDefault();renderExplorer();}
    else if(['ArrowDown','ArrowUp'].includes(e.key)&&!e.target.closest('button')){e.preventDefault();const list=explorer.visible;if(!list.length)return;const current=list.findIndex(x=>x.id===[...explorer.selected].at(-1));const next=Math.max(0,Math.min(list.length-1,current+(e.key==='ArrowDown'?1:-1)));selectEntry(e,list[next].id);$(`[data-entry="${list[next].id}"]`,explorer.win.content)?.focus();}
  }
  function openExplorer(path='home') {
    const target=normalizePath(path)||'home';
    if(explorer&&!explorer.win.closed){explorer.win.show();navigate(target);return explorer.win;}
    const win=Shell.createWindow({id:'explorer',appId:'explorer',title:'Eksplorator plików',icon:'explorer',className:'files-explorer',width:1010,height:660,minWidth:430,minHeight:340});
    explorer=newTabState(win,target);explorerTabs=[explorer];
    win.el.addEventListener('keydown',explorerKeys);renderExplorer();return win;
  }
  function updateNote(note) {
    if(note.win.closed)return;
    note.dirty=note.editor.value!==note.savedText;
    note.win.setTitle((note.dirty?'● ':'')+note.name+' — Notatnik');
    const before=note.editor.value.slice(0,note.editor.selectionStart),line=before.split('\n').length,col=before.length-(before.lastIndexOf('\n')+1)+1;
    $('.notepad-status',note.win.content).innerHTML=`<span>Wiersz ${line}, kolumna ${col}<span class="files-note-characters"> · ${note.editor.value.length.toLocaleString('pl-PL')} znaków</span></span><span>${Math.round(note.zoom/14*100)}%<span class="files-note-encoding"> · UTF-8</span>${note.fileId?' · Zapis lokalny':''}</span>`;
  }
  function noteSave(note,{forceAs=false,after}={}) {
    if(note.editor.value.length>MAX_TEXT){Shell.toast('Notatka przekracza limit 200 000 znaków. Pobierz kopię, aby zachować całość.');return;}
    const existing=get(note.fileId);
    if(!forceAs&&existing&&!isTrashed(existing)){existing.text=note.editor.value;existing.modified=Date.now();if(persist()){note.savedText=note.editor.value;updateNote(note);after?.();Shell.toast('Zapisano „'+note.name+'” w demonstracji.');}return;}
    nameDialog({title:'Zapisz jako',value:note.name==='Bez tytułu'?'Notatka.txt':note.name,folder:true,parent:existing&&!isTrashed(existing)?existing.parent:'documents',onSubmit:(name,parent)=>{
      if(!/\.txt$/i.test(name))name+='.txt';
      const previous=entries.find(x=>x.parent===parent&&x.name.toLocaleLowerCase('pl')===name.toLocaleLowerCase('pl')&&!isTrashed(x));
      const perform=()=>{const entry=previous||{id:id(),parent,type:'text',name};if(entry.type!=='text'){Shell.toast('Ta nazwa jest już używana przez folder.');return false;}entry.text=note.editor.value;entry.modified=Date.now();if(!previous){if(entries.length>=250){Shell.toast('Osiągnięto limit 250 elementów demonstracji.');return false;}entries.push(entry);}if(!persist())return false;note.fileId=entry.id;note.name=entry.name;note.savedText=note.editor.value;updateNote(note);after?.();Shell.toast('Zapisano w folderze '+folderLabel(parent)+'.');};
      if(previous&&previous.id!==note.fileId){Shell.confirm({title:'Zastąp plik',icon:'notepad',message:'Plik „'+name+'” już istnieje. Zastąpić jego zawartość?',confirmLabel:'Zastąp',onConfirm:perform});return;}
      return perform();
    }});
  }
  function downloadNote(note) {const text=note.editor.value;const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=note.name==='Bez tytułu'?'Notatka.txt':note.name.replace(/[\\/:*?"<>|]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);Shell.toast('Przygotowano kopię pliku do pobrania.');}
  function askCloseNote(note) {
    if(note.allowClose||!note.dirty){notebooks.delete(note.win.id);return true;}
    const key='notepad-unsaved-'+note.win.id,existing=Shell.windows.get(key);if(existing){existing.show();return false;}
    const dialog=Shell.createWindow({id:key,title:'Notatnik',icon:'notepad',width:480,height:230,minWidth:320,minHeight:210,resizable:false,maximizable:false,taskbar:false,content:`<div class="message-body">${icon('notepad',34)}<div><h3>Zapisać zmiany?</h3><p>Zmiany w pliku „${esc(note.name)}” nie zostały zapisane.</p></div></div><div class="dialog-footer"><button class="win-button primary" data-choice="save">Zapisz</button><button class="win-button" data-choice="discard">Nie zapisuj</button><button class="win-button" data-choice="cancel">Anuluj</button></div>`});
    $('[data-choice=save]',dialog.content).onclick=()=>{dialog.close();noteSave(note,{after:()=>{note.allowClose=true;note.win.close();}});};
    $('[data-choice=discard]',dialog.content).onclick=()=>{dialog.close();note.allowClose=true;note.win.close();};
    $('[data-choice=cancel]',dialog.content).onclick=()=>{dialog.close();note.win.show();note.editor.focus();};return false;
  }
  function insertText(note,text) {note.editor.focus();const start=note.editor.selectionStart,end=note.editor.selectionEnd;note.editor.setRangeText(text,start,end,'end');note.editor.dispatchEvent(new Event('input',{bubbles:true}));}
  function copyText(note,cut=false) {const value=note.editor.value.slice(note.editor.selectionStart,note.editor.selectionEnd);if(!value)return;textClipboard=value;navigator.clipboard?.writeText(value).catch(()=>{});if(cut)insertText(note,'');else note.editor.focus();}
  function showFind(note) {const bar=$('.files-find-bar',note.win.content);bar.hidden=false;const selected=note.editor.value.slice(note.editor.selectionStart,note.editor.selectionEnd);const input=$('input',bar);if(selected)input.value=selected;input.focus();input.select();}
  function findText(note,back=false) {const root=note.win.content,query=$('.files-find-input',root).value;if(!query)return;const all=note.editor.value.toLocaleLowerCase('pl'),q=query.toLocaleLowerCase('pl');let position=back?all.lastIndexOf(q,Math.max(0,note.editor.selectionStart-1)):all.indexOf(q,note.editor.selectionEnd);if(position<0)position=back?all.lastIndexOf(q):all.indexOf(q);$('.files-find-message',root).textContent=position<0?'Nie znaleziono':'';if(position>=0){note.editor.focus();note.editor.setSelectionRange(position,position+query.length);const line=note.editor.value.slice(0,position).split('\n').length;note.editor.scrollTop=Math.max(0,(line-4)*note.zoom*1.6);updateNote(note);}}
  function setZoom(note,delta) {note.zoom=delta===0?14:Math.min(28,Math.max(10,note.zoom+delta));note.editor.style.fontSize=note.zoom+'px';updateNote(note);}
  function filePicker() {
    const list=entries.filter(x=>x.type==='text'&&!isTrashed(x));
    const win=Shell.createWindow({id:'notepad-open',title:'Otwórz notatkę',icon:'notepad',width:600,height:420,minWidth:320,minHeight:260,content:`<div class="files-picker"><p>Notatki zapisane w demonstracji</p>${list.map(x=>`<button class="files-picker-item" data-file="${esc(x.id)}">${icon('notepad',24)}<span><strong>${esc(x.name)}</strong><small>${esc(locationName(x))}</small></span>${icon('chevronRight',12)}</button>`).join('')||'<p>Brak zapisanych notatek.</p>'}</div><div class="dialog-footer"><button class="win-button" data-cancel>Anuluj</button></div>`});
    $$('[data-file]',win.content).forEach(b=>b.onclick=()=>{const entry=get(b.dataset.file);win.close();openNotepad(entry.name,entry.text,entry.id);});$('[data-cancel]',win.content).onclick=()=>win.close();
  }
  function noteMenu(note,which,button) {
    const r=button.getBoundingClientRect(),selected=note.editor.selectionEnd>note.editor.selectionStart;
    const file=[{label:'Nowe okno',icon:'notepad',shortcut:'Ctrl+N',onClick:()=>openNotepad()},{label:'Otwórz…',icon:'folder',shortcut:'Ctrl+O',onClick:filePicker},{separator:true},{label:'Zapisz',icon:'save',shortcut:'Ctrl+S',onClick:()=>noteSave(note)},{label:'Zapisz jako…',icon:'save',shortcut:'Ctrl+Shift+S',onClick:()=>noteSave(note,{forceAs:true})},{label:'Pobierz kopię…',icon:'download',onClick:()=>downloadNote(note)},{separator:true},{label:'Zamknij',icon:'close',shortcut:'Alt+F4',onClick:()=>note.win.close()}];
    const edit=[{label:'Cofnij',icon:'undo',shortcut:'Ctrl+Z',onClick:()=>{note.editor.focus();document.execCommand('undo');updateNote(note);}},{separator:true},{label:'Wytnij',icon:'cut',shortcut:'Ctrl+X',disabled:!selected,onClick:()=>copyText(note,true)},{label:'Kopiuj',icon:'copy',shortcut:'Ctrl+C',disabled:!selected,onClick:()=>copyText(note)},{label:'Wklej',icon:'paste',shortcut:'Ctrl+V',onClick:()=>{if(textClipboard)insertText(note,textClipboard);else{note.editor.focus();Shell.toast('Wklej tekst skrótem Ctrl+V.');}}},{label:'Usuń',icon:'delete',disabled:!selected,onClick:()=>insertText(note,'')},{separator:true},{label:'Znajdź',icon:'search',shortcut:'Ctrl+F',onClick:()=>showFind(note)},{label:'Zaznacz wszystko',shortcut:'Ctrl+A',onClick:()=>{note.editor.focus();note.editor.select();updateNote(note);}},{label:'Godzina/data',icon:'calendar',shortcut:'F5',onClick:()=>insertText(note,new Date().toLocaleString('pl-PL'))}];
    const view=[{label:'Zawijanie wierszy',checked:note.wrap,onClick:()=>{note.wrap=!note.wrap;note.editor.wrap=note.wrap?'soft':'off';note.editor.style.whiteSpace=note.wrap?'pre-wrap':'pre';}},{label:'Pasek stanu',checked:!$('.notepad-status',note.win.content).hidden,onClick:()=>{const status=$('.notepad-status',note.win.content);status.hidden=!status.hidden;}},{separator:true},{label:'Powiększ',icon:'zoom',shortcut:'Ctrl++',onClick:()=>setZoom(note,1)},{label:'Pomniejsz',icon:'zoomOut',shortcut:'Ctrl+−',onClick:()=>setZoom(note,-1)},{label:'Przywróć powiększenie',shortcut:'Ctrl+0',onClick:()=>setZoom(note,0)}];
    Shell.menu(which==='file'?file:which==='edit'?edit:view,r.left,r.bottom+3);
  }
  function openNotepad(name='Bez tytułu',text='',fileId=null) {
    if(fileId){const open=[...notebooks.values()].find(n=>n.fileId===fileId&&!n.win.closed);if(open){open.win.show();return open.win;}}
    let note;
    const win=Shell.createWindow({id:'notepad-'+(++noteSerial),appId:'notepad',title:name+' — Notatnik',icon:'notepad',className:'files-notepad',width:800,height:580,minWidth:350,minHeight:250,onClose:()=>askCloseNote(note),content:`<div class="notepad-menu"><button data-note-menu="file">Plik</button><button data-note-menu="edit">Edycja</button><button data-note-menu="view">Widok</button><span class="files-notepad-space"></span><button class="files-note-save" title="Zapisz (Ctrl+S)" aria-label="Zapisz">${icon('save',16)}</button></div><div class="files-find-bar" hidden><input class="win-input files-find-input" type="search" placeholder="Znajdź w notatce" aria-label="Znajdź w notatce"><button data-find="prev" aria-label="Poprzedni wynik">${icon('chevronUp',14)}</button><button data-find="next" aria-label="Następny wynik">${icon('chevronDown',14)}</button><span class="files-find-message" aria-live="polite"></span><button data-find="close" aria-label="Zamknij wyszukiwanie">${icon('close',10)}</button></div><textarea class="notepad-editor" spellcheck="false" aria-label="Treść notatki" wrap="soft"></textarea><div class="notepad-status"></div>`});
    const editor=$('.notepad-editor',win.content);editor.value=String(text||'').slice(0,MAX_TEXT);
    note={win,editor,name:String(name||'Bez tytułu'),fileId,savedText:fileId?editor.value:'',dirty:!fileId&&!!editor.value,allowClose:false,wrap:true,zoom:14};notebooks.set(win.id,note);
    $$('[data-note-menu]',win.content).forEach(b=>b.onclick=()=>noteMenu(note,b.dataset.noteMenu,b));$('.files-note-save',win.content).onclick=()=>noteSave(note);
    editor.oninput=()=>updateNote(note);editor.onkeyup=()=>updateNote(note);editor.onclick=()=>updateNote(note);editor.onselect=()=>updateNote(note);
    $$('[data-find]',win.content).forEach(b=>b.onclick=()=>{if(b.dataset.find==='close'){$('.files-find-bar',win.content).hidden=true;editor.focus();}else findText(note,b.dataset.find==='prev');});
    $('.files-find-input',win.content).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findText(note,e.shiftKey);}if(e.key==='Escape'){$('.files-find-bar',win.content).hidden=true;editor.focus();}};
    win.content.addEventListener('keydown',e=>{
      const ctrl=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
      if(ctrl&&['s','n','o','f','+','=','-','0'].includes(key)){e.preventDefault();e.stopPropagation();if(key==='s')noteSave(note,{forceAs:e.shiftKey});if(key==='n')openNotepad();if(key==='o')filePicker();if(key==='f')showFind(note);if(key==='+'||key==='=')setZoom(note,1);if(key==='-')setZoom(note,-1);if(key==='0')setZoom(note,0);return;}
      if(e.key==='F5'){e.preventDefault();e.stopPropagation();insertText(note,new Date().toLocaleString('pl-PL'));}
      if(e.key==='Tab'&&e.target===editor&&!ctrl&&!e.altKey){e.preventDefault();insertText(note,'\t');}
    });
    editor.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();const holder={getBoundingClientRect:()=>({left:e.clientX,bottom:e.clientY})};noteMenu(note,'edit',holder);};
    updateNote(note);setTimeout(()=>editor.focus(),0);return win;
  }
  function init() {
    Shell.openExplorer=openExplorer;Shell.openNotepad=openNotepad;
    Shell.registerApp({id:'explorer',title:'Eksplorator plików',icon:'explorer',description:'Foldery i dokumenty demonstracji',open:()=>openExplorer('home')});
    Shell.registerApp({id:'notepad',title:'Notatnik',icon:'notepad',description:'Edytuj i zapisuj lokalne notatki',open:()=>openNotepad()});
    Shell.registerApp({id:'recycleBin',title:'Kosz',icon:'recycleBin',description:'Przywracanie usuniętych elementów',open:()=>openExplorer('recycleBin')});
    document.addEventListener('keydown',e=>{if(explorer&&!explorer.win.closed&&Shell.activeWindow===explorer.win&&(e.ctrlKey||e.metaKey)&&(e.key==='Tab'||['t','w'].includes(e.key.toLowerCase())))explorerKeys(e);},true);
    window.addEventListener('beforeunload',e=>{if([...notebooks.values()].some(n=>n.dirty)){e.preventDefault();e.returnValue='';}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
