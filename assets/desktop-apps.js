/* Native-style desktop utilities for the OpisAI browser demonstration. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const icon = (name, size = 20) => Icons.svg(name, size);
  const esc = value => Shell.escape(value);
  let settingsWin = null, settingsPage = 'system', helpWin = null, helpPage = 'start';
  const sections = [
    ['system','System','computer'],['bluetooth','Bluetooth i urządzenia','bluetooth'],
    ['network','Sieć i Internet','wifi'],['personalization','Personalizacja','sun'],
    ['apps','Aplikacje','view'],['accessibility','Ułatwienia dostępu','accessibility'],
    ['privacy','Prywatność i zabezpieczenia','shield'],['about','Informacje','info']
  ];
  const shortcuts = [
    ['Ctrl + Esc','Menu Start'],['Win + E','Eksplorator plików'],['Win + I','Ustawienia'],
    ['Win + D','Pokaż / przywróć pulpit'],['Win + S','Wyszukiwanie'],['Win + ← / →','Przyciągnij okno do krawędzi'],
    ['Win + ↑','Maksymalizuj okno'],['Alt + Spacja','Menu aktywnego okna'],
    ['Alt + F4','Zamknij aktywne okno'],['F1','Pomoc'],['Esc','Zamknij menu'],
    ['Ctrl + S','Zapisz wizytę lub notatkę'],['Ctrl + Z','Cofnij zmianę'],['Ctrl + P','Podgląd wydruku wizyty']
  ];
  function card(ic,title,description,control='') {
    return `<div class="settings-card">${icon(ic,24)}<div class="settings-card-copy"><strong>${esc(title)}</strong><small>${esc(description)}</small></div>${control}</div>`;
  }
  function toggle(key,label,value) {
    return `<label class="setting-toggle"><span>${value?'Włączone':'Wyłączone'}</span><input type="checkbox" role="switch" data-setting="${key}" aria-label="${esc(label)}" ${value?'checked':''}><i aria-hidden="true"></i></label>`;
  }
  function settingButton(id,label,primary=false) {
    const aria=({display:'Ustawienia ekranu',about:'Informacje o pulpicie'})[id];
    return `<button class="win-button${primary?' primary':''}" data-action="${id}" ${aria?`aria-label="${aria}"`:''}>${label}</button>`;
  }
  function openSettings(page='system') {
    Shell.closePopups();
    settingsPage = page==='shortcuts'?'accessibility':page;
    if(!sections.some(s=>s[0]===settingsPage))settingsPage='system';
    if(settingsWin&&!settingsWin.closed){settingsWin.show();renderSettings();return settingsWin;}
    settingsWin=Shell.createWindow({id:'settings',title:'Ustawienia',icon:'settings',width:1030,height:720,minWidth:560,minHeight:390,className:'system-settings-window',content:`<div class="settings-layout"><aside class="settings-sidebar"><div class="settings-profile"><span class="avatar">${icon('user',30)}</span><div><strong>Gabinet</strong><small>Konto lokalne</small></div></div><label class="settings-search-label">${icon('search',16)}<input class="win-input" placeholder="Znajdź ustawienie" aria-label="Znajdź ustawienie"></label><nav class="settings-nav" aria-label="Kategorie ustawień">${sections.map(([id,title,ic])=>`<button data-settings-page="${id}">${icon(ic,20)}<span>${title}</span></button>`).join('')}</nav></aside><main class="settings-page"></main></div>`});
    $$('[data-settings-page]',settingsWin.content).forEach(b=>b.onclick=()=>{settingsPage=b.dataset.settingsPage;renderSettings();});
    $('.settings-search-label input',settingsWin.content).oninput=e=>{const q=e.target.value.toLocaleLowerCase('pl');$$('[data-settings-page]',settingsWin.content).forEach(b=>b.hidden=!b.textContent.toLocaleLowerCase('pl').includes(q));};
    renderSettings();return settingsWin;
  }
  function renderSettings() {
    if(!settingsWin||settingsWin.closed)return;
    const p=Shell.prefs, root=$('.settings-page',settingsWin.content);
    $$('[data-settings-page]',settingsWin.content).forEach(b=>{b.classList.toggle('active',b.dataset.settingsPage===settingsPage);b.setAttribute('aria-current',b.dataset.settingsPage===settingsPage?'page':'false');});
    const heading=sections.find(s=>s[0]===settingsPage)[1];
    let html=`<h1>${heading}</h1>`;
    if(settingsPage==='system') {
      html+=`<div class="device-summary"><div class="device-picture"><div></div></div><div><h2>GABINET</h2><p>Pulpit OpisAI</p><button class="text-link" data-action="about">Informacje o pulpicie</button></div></div>`;
      html+=card('computer','Ekran','Jasność, tryb pełnoekranowy i wygląd pulpitu',settingButton('display',icon('chevronRight',12)));
      html+=card('volume','Dźwięk','Głośność pulpitu',`<input class="setting-range" type="range" min="0" max="100" value="${p.volume}" aria-label="Głośność pulpitu" data-range="volume"><span class="range-value">${p.volume}%</span>`);
      html+=card('notification','Powiadomienia','Powiadomienia z aplikacji i centrum powiadomień',settingButton('notifications','Otwórz'));
      html+=card('moon','Nie przeszkadzać','Wycisz wyskakujące powiadomienia',toggle('quiet','Nie przeszkadzać',p.quiet));
      html+=card('fullScreen','Pełny ekran',document.fullscreenElement?'Pulpit zajmuje cały ekran. Naciśnij Esc, aby wyjść.':'Ukryj pasek adresu i karty przeglądarki',settingButton('fullscreen',document.fullscreenElement?'Opuść pełny ekran':'Włącz pełny ekran'));
      html+=card('info','Informacje','Wersja i funkcje demonstracji',settingButton('about',icon('chevronRight',12)));
    } else if(settingsPage==='personalization') {
      html+=`<p class="setting-description">Wybierz motyw do zastosowania</p><div class="theme-swatches"><button class="theme-swatch" aria-label="Jasny motyw Bloom" aria-pressed="${p.theme==='light'&&p.wallpaper==='bloom'}" data-theme="light"></button><button class="theme-swatch dark" aria-label="Ciemny motyw Bloom" aria-pressed="${p.theme==='dark'&&p.wallpaper==='bloom'}" data-theme="dark"></button><button class="theme-swatch solid" aria-label="Niebieskie tło" aria-pressed="${p.wallpaper==='solid'}" data-theme="solid"></button></div>`;
      html+=card('sun','Tryb kolorów','Kolory menu Start, paska zadań i okien',`<select class="win-select" data-setting="theme" aria-label="Tryb kolorów"><option value="light" ${p.theme==='light'?'selected':''}>Jasny</option><option value="dark" ${p.theme==='dark'?'selected':''}>Ciemny</option></select>`);
      html+=card('taskview','Wyrównanie paska zadań','Położenie przycisku Start i ikon aplikacji',`<select class="win-select" data-setting="alignment" aria-label="Wyrównanie paska zadań"><option value="center" ${p.alignment==='center'?'selected':''}>Na środku</option><option value="left" ${p.alignment==='left'?'selected':''}>Po lewej</option></select>`);
      html+=card('play','Efekty animacji','Przejścia okien, menu i powiadomień',toggle('motion','Efekty animacji',p.motion));
      html+=card('opisai','Wygląd OpisAI','Motyw, wielkość tekstu i zachowanie bąbelka',settingButton('opisai-settings','Otwórz ustawienia'));
    } else if(settingsPage==='bluetooth') {
      html+=card('bluetooth','Bluetooth','Widoczność przełącznika w szybkim dostępie',toggle('bluetooth','Bluetooth',p.bluetooth));
      html+=`<h2>Urządzenia wejściowe</h2>`;
      html+=card('computer','Klawiatura','Polski (programisty) · standardowe skróty pulpitu',settingButton('shortcuts','Skróty klawiaturowe'));
      html+=card('mic','Dyktowanie OpisAI','Wypróbuj nagranie przykładowej wizyty',settingButton('dictate','Rozpocznij'));
      html+=`<p class="setting-description">Ta wersja pulpitu działa w przeglądarce. Przełączniki urządzeń dotyczą demonstracji; nie zmieniają ustawień Twojego komputera.</p>`;
    } else if(settingsPage==='network') {
      html+=`<div class="network-hero">${icon('wifi',48)}<div><h2>${p.wifi?'Połączono':'Wi-Fi wyłączone'}</h2><p>${p.wifi?'Gabinet · profil prywatny':'Włącz Wi-Fi w ustawieniach pulpitu'}</p></div></div>`;
      html+=card('wifi','Wi-Fi','Połączenie pulpitu demonstracyjnego',toggle('wifi','Wi-Fi',p.wifi));
      html+=card('shield','Prywatność danych','Dane wizyty pozostają w tej przeglądarce',settingButton('privacy','Szczegóły'));
      html+=card('opisai','Silnik generowania i transkrypcji','Dostawcę wybierzesz w ustawieniach OpisAI',settingButton('opisai-settings','Otwórz'));
      html+=`<p class="setting-description">Demo odtwarza przebieg pracy na lokalnym przykładzie. Nie wymaga kluczy API, połączenia z modelem ani dostępu do mikrofonu.</p>`;
    } else if(settingsPage==='apps') {
      html+=`<p class="setting-description">Aplikacje dostępne na pulpicie</p>`;
      [['clinic','Klinika XP','Wizyty, karta pacjenta i dokumentacja'],['opisai','OpisAI','Opracowanie opisu i dyktowanie'],['explorer','Eksplorator plików','Dokumenty demonstracji'],['notepad','Notatnik','Edycja lokalnych notatek'],['terminal','Terminal','Polecenia pulpitu']].forEach(([id,title,desc])=>html+=card(id,title,desc,settingButton('open-'+id,'Otwórz')));
    } else if(settingsPage==='accessibility') {
      html+=card('play','Efekty animacji','Ogranicz ruch interfejsu',toggle('motion','Efekty animacji',p.motion));
      html+=card('fullScreen','Tryb pełnoekranowy','Więcej miejsca na okna i dokumentację',settingButton('fullscreen',document.fullscreenElement?'Opuść pełny ekran':'Włącz'));
      html+=`<h2>Skróty klawiaturowe</h2><div class="keyboard-grid">${shortcuts.map(([key,desc])=>`<div><kbd>${esc(key)}</kbd></div><div>${esc(desc)}</div>`).join('')}</div><p class="setting-description keyboard-note">Niektóre kombinacje z klawiszem Win lub Alt może przechwycić Twój system albo przeglądarka. Te same funkcje są dostępne w menu i pod przyciskami.</p>`;
    } else if(settingsPage==='privacy') {
      html+=card('shield','Dane demonstracyjne','Wizyta i ustawienia są zapisywane lokalnie w pamięci tej przeglądarki.',settingButton('privacy-details','Dowiedz się więcej'));
      html+=card('mic','Mikrofon','W demonstracji dyktowanie odtwarza gotowy przykład. Mikrofon nie jest włączany.');
      html+=card('lock','Klucze API','Ta strona nie prosi o hasła, logowanie ani klucze dostawców modeli.');
      html+=card('history','Wyczyść dane demonstracji','Przywróć przykładową wizytę, notatki, historię i ustawienia pulpitu.',settingButton('reset','Przywróć ustawienia'));
      html+=`<p class="setting-description">Ustawienia prawdziwego programu OpisAI są niezależne od tej demonstracji. Do testów używaj przykładowych danych.</p>`;
    } else {
      html+=`<div class="about-desktop-brand">${icon('windows',54)}<div><h2>Pulpit OpisAI</h2><p>Interaktywna demonstracja · Windows 11</p></div></div><h2>Informacje o aplikacji</h2><dl class="specification-list"><dt>OpisAI</dt><dd>0.12.0rc32</dd><dt>Środowisko</dt><dd>Przeglądarka internetowa</dd><dt>Dane</dt><dd>Lokalna przykładowa wizyta</dd><dt>Obsługa</dt><dd>Mysz, klawiatura i dotyk</dd></dl>`;
      html+=card('opisai','O programie OpisAI','Asystent dokumentacji weterynaryjnej',settingButton('opisai-about','Otwórz'));
      html+=card('help','Pomoc i pierwsze kroki','Przygotowanie, dyktowanie i sprawdzanie wyniku',settingButton('help','Otwórz pomoc'));
      html+=`<p class="setting-description">Jest to samodzielna prezentacja interfejsu OpisAI, a nie produkt Microsoft. Funkcje pulpitu są odtwarzane lokalnie w przeglądarce. Windows i tapeta Bloom należą do Microsoft.</p>`;
    }
    root.innerHTML=html;
    $$('[data-setting]',root).forEach(control=>control.onchange=()=>{const key=control.dataset.setting;p[key]=control.type==='checkbox'?control.checked:control.value;Shell.applyPrefs();renderSettings();});
    $$('[data-theme]',root).forEach(b=>b.onclick=()=>{p.wallpaper=b.dataset.theme==='solid'?'solid':'bloom';if(b.dataset.theme!=='solid')p.theme=b.dataset.theme;Shell.applyPrefs();renderSettings();});
    $$('[data-range]',root).forEach(input=>input.oninput=()=>{p[input.dataset.range]=+input.value;input.nextElementSibling.textContent=input.value+'%';Shell.applyPrefs();});
    $$('[data-action]',root).forEach(b=>b.onclick=()=>action(b.dataset.action));
  }
  function action(id) {
    if(id.startsWith('open-'))return Shell.openApp(id.slice(5));
    if(['about','privacy','personalization'].includes(id))return openSettings(id);
    if(id==='opisai-settings')return window.OpisAI?.settings();
    if(id==='opisai-about')return window.OpisAI?.about();
    if(id==='help')return openHelp();
    if(id==='dictate')return window.OpisAI?.dictate();
    if(id==='shortcuts')return openSettings('accessibility');
    if(id==='notifications')return Shell.showCalendar();
    if(id==='display')return openDisplay();
    if(id==='privacy-details')return openHelp('privacy');
    if(id==='fullscreen')return fullscreen();
    if(id==='reset')return Shell.confirm({title:'Przywróć dane demonstracji',icon:'settings',message:'Usunąć zapisane w tej przeglądarce wizyty demonstracyjne, historię OpisAI, notatki i ustawienia? Strona uruchomi się ponownie z przykładową wizytą.',confirmLabel:'Przywróć',onConfirm:()=>{Object.keys(localStorage).filter(k=>k.startsWith('opisai.demo.')||k==='opisai-demo-settings-v12').forEach(k=>localStorage.removeItem(k));location.reload();}});
  }
  async function fullscreen() {
    try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch {Shell.toast('Użyj klawisza F11, aby włączyć pełny ekran przeglądarki.');}
    renderSettings();
  }
  function openDisplay(){
    const win=Shell.createWindow({id:'display',title:'Ekran',icon:'computer',width:540,height:370,minWidth:330,minHeight:250,taskbar:false,content:`<div class="display-dialog"><div class="display-monitor">1</div><h3>Jasność</h3><div class="display-slider">${icon('sun',20)}<input type="range" min="35" max="100" value="${Shell.prefs.brightness}" aria-label="Jasność ekranu"><span>${Shell.prefs.brightness}%</span></div><p class="setting-description">Dostosuj jasność pulpitu demonstracyjnego.</p><button class="win-button" id="display-fullscreen">${icon('fullScreen',16)} Tryb pełnoekranowy</button></div>`});
    $('input',win.content).oninput=e=>{Shell.prefs.brightness=+e.target.value;$('#desktop').style.opacity=e.target.value/100;e.target.nextElementSibling.textContent=e.target.value+'%';Shell.applyPrefs();};$('#display-fullscreen',win.content).onclick=fullscreen;
  }
  const helpSections=[['start','Pierwsze kroki','opisai'],['describe','Opisywanie wizyty','document'],['dictate','Dyktowanie','mic'],['review','Przegląd i wpisanie','check'],['spelling','Sprawdzanie pisowni','eye'],['desktop','Obsługa pulpitu','computer'],['privacy','Dane i prywatność','shield']];
  function openHelp(page='start') {
    helpPage=page;
    if(helpWin&&!helpWin.closed){helpWin.show();renderHelp();return;}
    helpWin=Shell.createWindow({id:'help',title:'OpisAI — pomoc',icon:'help',width:890,height:665,minWidth:480,minHeight:360,content:`<div class="help-layout"><aside class="help-sidebar"><div class="help-brand">${icon('opisai',36)}<strong>OpisAI</strong></div>${helpSections.map(([id,title,ic])=>`<button data-help="${id}">${icon(ic,18)}<span>${title}</span></button>`).join('')}<small>Wersja 0.12.0rc32</small></aside><article class="help-page"></article></div>`});
    $$('[data-help]',helpWin.content).forEach(b=>b.onclick=()=>{helpPage=b.dataset.help;renderHelp();});renderHelp();
  }
  function renderHelp() {
    const root=$('.help-page',helpWin.content);
    $$('[data-help]',helpWin.content).forEach(b=>b.classList.toggle('active',b.dataset.help===helpPage));
    const content={
      start:`<div class="help-eyebrow">TWÓJ ASYSTENT DOKUMENTACJI</div><h1>Od notatki do opisu wizyty</h1><p class="help-lead">OpisAI pracuje obok programu gabinetowego. Przygotuj tekst lub podyktuj notatkę, sprawdź wynik i zdecyduj, co trafi do dokumentacji.</p><div class="help-feature"><span>1</span><div><h3>Otwórz wizytę</h3><p>W Klinice czeka przykładowa wizyta Fistaszka. Możesz edytować wywiad, badanie i diagnozę.</p></div></div><div class="help-feature"><span>2</span><div><h3>Kliknij bąbelek OpisAI</h3><p>Krótkie kliknięcie rozpoczyna opisywanie. Przytrzymanie otwiera dyktowanie. Prawy przycisk pokazuje pozostałe opcje.</p></div></div><div class="help-feature"><span>3</span><div><h3>Sprawdź i wpisz</h3><p>Wybierz sposób opracowania, zatwierdź źródło, a następnie przejrzyj wynik przed wpisaniem do pól wizyty.</p></div></div><div class="help-actions"><button class="win-button primary" data-go="describe">${icon('opisai',18)} Opisz wizytę</button><button class="win-button" data-go="dictate">${icon('mic',18)} Wypróbuj dyktowanie</button></div>`,
      describe:`<h1>Opisywanie wizyty</h1><p>Kliknij bąbelek albo wybierz <strong>Opisz wizytę</strong> w menu OpisAI. Okno przygotowania pokaże odczytany wywiad, badanie i diagnozę.</p><h2>Sprawdź materiał wejściowy</h2><p>Możesz poprawić i uzupełnić źródło. Wybierz wariant <strong>Bogato</strong> lub <strong>Wiernie</strong> oraz sposób wykorzystania istniejącego rozpoznania. Zmiana źródła lub wariantu unieważnia wcześniejsze zatwierdzenie.</p><h2>Zatwierdź źródło</h2><p>Potwierdź, że materiał jest gotowy. Dopiero wtedy uruchom opracowanie. W prawdziwym programie wywoływany jest skonfigurowany model; tutaj formatowanie odbywa się lokalnie na przykładzie.</p><button class="win-button primary" data-go="describe">Otwórz przygotowanie</button>`,
      dictate:`<h1>Dyktowanie</h1><p>Przytrzymaj bąbelek lub wybierz <strong>Dyktuj</strong>. W demonstracji zobaczysz przebieg przykładowego nagrania: wskaźnik aktywności, czas i dopisywaną transkrypcję.</p><h2>Zakończ albo kontynuuj</h2><p>Po zakończeniu popraw rozpoznany tekst. Możesz kontynuować dyktowanie, przejść do opracowania albo użyć samej transkrypcji.</p><h2>Wybierz pole docelowe</h2><p>Przy wpisywaniu surowej notatki wybierz pole wizyty. Podgląd pozwala sprawdzić treść przed jej wstawieniem.</p><p class="help-note">Przykładowe nagranie jest zapisane w demo. Ta strona nie uruchamia Twojego mikrofonu.</p><button class="win-button primary" data-go="dictate">Uruchom przykład</button>`,
      review:`<h1>Przegląd przed wpisaniem</h1><p>Każdy wynik możesz przeczytać i zmienić. Porównaj go ze źródłem, zaznacz pola do wpisania i potwierdź, że opis został sprawdzony.</p><h2>Ochrona aktualnej wizyty</h2><p>Jeśli w czasie przeglądu zmienisz tekst w Klinice, OpisAI wykryje różnicę i zatrzyma wpisanie. Najpierw rozstrzygnij, którego tekstu chcesz użyć.</p><h2>Historia i cofanie</h2><p>Po wpisaniu możesz cofnąć ostatnią operację lub wrócić do wcześniejszego opracowania. Cofanie również sprawdza, czy w polach nie pojawiły się późniejsze zmiany.</p><p class="help-note">Wpisanie tekstu nie zapisuje wizyty. Zapis wykonujesz osobno w Klinice.</p><button class="win-button" data-go="history">${icon('history',18)} Otwórz historię</button>`,
      spelling:`<h1>Sprawdzanie pisowni</h1><p>W polach Kliniki przykładowe pomyłki są podkreślone. Najedź na słowo, aby zobaczyć podpowiedź, lub kliknij oznaczenie, aby przypiąć okienko.</p><h2>Wybierz poprawkę</h2><p>Możesz zastosować proponowaną pisownię, zignorować wyraz albo dodać go do lokalnego słownika. Poprawkę można cofnąć.</p><div class="spelling-key"><span><i class="red-underline">błąd</i> Pisownia</span><span><i class="amber-underline">termin</i> Nieznany wyraz</span><span><i class="blue-underline">powtórzenie</i> Powtórzony wyraz</span></div><button class="win-button" data-go="clinic">Otwórz wizytę</button>`,
      desktop:`<h1>Obsługa pulpitu</h1><p>Przeciągaj okna za pasek tytułu i zmieniaj ich rozmiar przy krawędziach. Podwójne kliknięcie paska tytułu maksymalizuje okno.</p><h2>Przyciąganie i pasek zadań</h2><p>Przesuń okno do lewej, prawej lub górnej krawędzi ekranu. Najedź na maksymalizację, aby wybrać układ. Ikona na pasku zadań pozwala minimalizować i przywracać aplikację.</p><h2>Menu i skróty</h2><p>Prawy przycisk działa na pulpicie, ikonach i paskach tytułu. Menu Start wyszukuje aplikacje. Zegar otwiera kalendarz, a ikony sieci i głośności — szybkie ustawienia.</p><div class="help-actions"><button class="win-button" data-go="shortcuts">Skróty klawiaturowe</button><button class="win-button" data-go="fullscreen">${icon('fullScreen',16)} Pełny ekran</button></div>`,
      privacy:`<h1>Dane i prywatność</h1><p>Ta strona pokazuje działanie OpisAI na przykładowej wizycie. Generowanie i dyktowanie są lokalną demonstracją. Nie wykonujemy zapytań do modeli AI i nie włączamy mikrofonu.</p><h2>Co zapamiętuje demo?</h2><p>Zmiany wizyty, notatki i ustawienia są zapamiętywane w tej przeglądarce. Historia operacji OpisAI jest dostępna do odświeżenia lub zamknięcia karty. Możesz je usunąć przez <strong>Ustawienia → Prywatność i zabezpieczenia</strong>.</p><h2>Prawdziwa aplikacja</h2><p>Program OpisAI uruchomiony na komputerze ma własną konfigurację dostawców, urządzeń i integracji. Nie przenosimy do niego ustawień zapisanych na tej stronie.</p><p>Do przeglądania demonstracji nie potrzebujesz konta, hasła ani klucza API.</p><button class="win-button" data-go="privacy">Ustawienia prywatności</button>`
    };
    root.innerHTML=content[helpPage]||content.start;root.scrollTop=0;
    $$('[data-go]',root).forEach(b=>b.onclick=()=>{const id=b.dataset.go;if(id==='describe')window.OpisAI?.prepare();else if(id==='dictate')window.OpisAI?.dictate();else if(id==='history')window.OpisAI?.history();else if(id==='clinic')window.Clinic?.open();else action(id);});
  }
  function openTerminal() {
    const existing=Shell.windows.get('terminal');if(existing){existing.show();return;}
    const win=Shell.createWindow({id:'terminal',title:'Terminal — Wiersz polecenia',icon:'terminal',width:810,height:470,minWidth:380,minHeight:260,content:'<div class="terminal-area"><pre class="terminal-output"></pre><label class="terminal-prompt"><span>C:\\Users\\Gabinet&gt;</span><input class="terminal-input" aria-label="Polecenie" spellcheck="false" autocomplete="off"></label></div>'});
    const area=$('.terminal-area',win.content),output=$('.terminal-output',area),input=$('.terminal-input',area),history=[];let h=0;
    output.textContent='Pulpit OpisAI — terminal demonstracyjny\nWpisz HELP, aby wyświetlić dostępne polecenia.\n\n';
    function run(command){const [cmd,...args]=command.trim().split(/\s+/),value=args.join(' ');let response='';switch((cmd||'').toLowerCase()){
      case '':break;
      case 'help':response='HELP            Lista poleceń\nCLS             Wyczyść ekran\nVER             Informacje o pulpicie\nDIR             Dokumenty demonstracji\nDATE / TIME     Aktualna data / godzina\nECHO tekst      Wyświetl tekst\nSTART aplikacja Otwórz clinic, opisai, explorer, notepad lub settings\nEXIT            Zamknij terminal';break;
      case 'cls':output.textContent='';return;
      case 'ver':response='OpisAI 0.12.0rc32 · pulpit demonstracyjny w przeglądarce';break;
      case 'dir':response=' Katalog C:\\Users\\Gabinet\n\n <DIR>  Pulpit\n <DIR>  Dokumenty\n <DIR>  Pobrane\n\nOtwórz Eksplorator: START explorer';break;
      case 'date':response=new Date().toLocaleDateString('pl-PL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});break;
      case 'time':response=new Date().toLocaleTimeString('pl-PL');break;
      case 'echo':response=value;break;
      case 'whoami':response='gabinet\\użytkownik';break;
      case 'start':{const alias={klinika:'clinic',opisai:'opisai',explorer:'explorer',notepad:'notepad',settings:'settings',help:'help'};const app=alias[value.toLowerCase()]||value.toLowerCase();if(Shell.apps.has(app))Shell.openApp(app);else response='Nie znaleziono aplikacji. Wpisz HELP.';break;}
      case 'exit':win.close();return;
      default:response=`'${cmd}' nie jest poleceniem tego pulpitu. Wpisz HELP.`;
    }if(response)output.textContent+=response+'\n';output.textContent+='\n';area.scrollTop=area.scrollHeight;}
    input.onkeydown=e=>{if(e.key==='Enter'){const command=input.value;output.textContent+='C:\\Users\\Gabinet>'+command+'\n';if(command)history.push(command);h=history.length;input.value='';run(command);e.preventDefault();}else if(e.key==='ArrowUp'){input.value=history[Math.max(0,--h)]||'';e.preventDefault();}else if(e.key==='ArrowDown'){h=Math.min(history.length,h+1);input.value=history[h]||'';e.preventDefault();}};
    area.onclick=e=>{if(!window.getSelection()?.toString())input.focus();};input.focus();
  }
  function init(){
    Shell.openSettings=openSettings;Shell.openHelp=openHelp;
    Shell.registerApp({id:'settings',title:'Ustawienia',icon:'settings',keywords:'system ekran kolory motyw',open:()=>openSettings()});
    Shell.registerApp({id:'help',title:'Pomoc OpisAI',icon:'help',keywords:'pomoc przewodnik pierwsze kroki',open:()=>openHelp()});
    Shell.registerApp({id:'history',title:'Historia OpisAI',icon:'history',keywords:'wyniki opisy',open:()=>window.OpisAI?.history()});
    Shell.registerApp({id:'terminal',title:'Terminal',icon:'terminal',keywords:'cmd polecenia',open:openTerminal});
    Shell.registerApp({id:'contact',title:'O aplikacji',icon:'info',keywords:'kontakt opisai autor',open:()=>window.OpisAI?.about()});
    Shell.registerApp({id:'personalization',title:'Personalizacja',icon:'sun',keywords:'tapeta motyw tło wygląd',open:()=>openSettings('personalization')});
    Shell.registerApp({id:'shortcuts',title:'Skróty klawiaturowe',icon:'accessibility',keywords:'klawiatura skróty',open:()=>openSettings('accessibility')});
    document.addEventListener('fullscreenchange',()=>{if(settingsWin&&!settingsWin.closed)renderSettings();});
  }
  document.addEventListener('DOMContentLoaded',init);
})();
