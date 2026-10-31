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
      html+=`<p class="setting-description">Wybierz motyw do zastosowania</p><div class="theme-swatches"><button class="theme-swatch" aria-label="Horyzont — jasny motyw" aria-pressed="${p.theme==='light'&&p.wallpaper==='horizon'}" data-theme="light"></button><button class="theme-swatch dark" aria-label="Horyzont — ciemny motyw" aria-pressed="${p.theme==='dark'&&p.wallpaper==='horizon'}" data-theme="dark"></button><button class="theme-swatch solid" aria-label="Niebieskie tło" aria-pressed="${p.wallpaper==='solid'}" data-theme="solid"></button></div>`;
      html+=card('sun','Tryb kolorów','Kolory menu Start, paska zadań i okien',`<select class="win-select" data-setting="theme" aria-label="Tryb kolorów"><option value="light" ${p.theme==='light'?'selected':''}>Jasny</option><option value="dark" ${p.theme==='dark'?'selected':''}>Ciemny</option></select>`);
      html+=card('taskview','Wyrównanie paska zadań','Położenie przycisku Start i ikon aplikacji',`<select class="win-select" data-setting="alignment" aria-label="Wyrównanie paska zadań"><option value="center" ${p.alignment==='center'?'selected':''}>Na środku</option><option value="left" ${p.alignment==='left'?'selected':''}>Po lewej</option></select>`);
      html+=card('play','Efekty animacji','Przejścia okien, menu i powiadomień',toggle('motion','Efekty animacji',p.motion));
      html+=card('opisai','Wygląd OpisAI','Motyw okien OpisAI: automatyczny, jasny albo ciemny (Konfiguracja → Wygląd)',settingButton('opisai-appearance','Otwórz ustawienia'));
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
      html+=card('opisai','Serwis generowania i silnik dyktowania','Wybierzesz je w Konfiguracji OpisAI: Połączenie i model, Dyktowanie',settingButton('opisai-settings','Otwórz'));
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
      html+=`<div class="about-desktop-brand">${icon('opisai',54)}<div><h2>Pulpit OpisAI</h2><p>Interaktywna demonstracja gabinetu</p></div></div><h2>Informacje o demonstracji</h2><dl class="specification-list"><dt>Odtwarzana aplikacja</dt><dd>OpisAI 0.12.0rc32 dla Windows</dd><dt>Środowisko</dt><dd>Przeglądarka internetowa</dd><dt>Dane</dt><dd>Fikcyjne wizyty makiety Kliniki XP</dd><dt>Obsługa</dt><dd>Mysz, klawiatura i dotyk</dd></dl>`;
      html+=card('opisai','O programie OpisAI','Asystent dokumentacji weterynaryjnej',settingButton('opisai-about','Otwórz'));
      html+=card('help','Przewodnik po demonstracji','Pierwsze kroki: bąbelek, opis wizyty, dyktowanie i przegląd',settingButton('help','Otwórz przewodnik'));
      html+=`<p class="setting-description">Pulpit demonstracyjny OpisAI działa lokalnie w przeglądarce. Motywy Horyzont i ikony narzędzi zostały przygotowane dla tej prezentacji. Ustawienia pulpitu dotyczą wyłącznie tej strony. Windows jest znakiem towarowym Microsoft; ten pulpit to własna stylizacja demonstracji, a okno Kliniki XP (produkt firmy BRI) to niezależna makieta z fikcyjnymi danymi.</p>`;
    }
    root.innerHTML=html;
    $$('[data-setting]',root).forEach(control=>control.onchange=()=>{const key=control.dataset.setting;p[key]=control.type==='checkbox'?control.checked:control.value;Shell.applyPrefs();renderSettings();});
    $$('[data-theme]',root).forEach(b=>b.onclick=()=>{p.wallpaper=b.dataset.theme==='solid'?'solid':'horizon';if(b.dataset.theme!=='solid')p.theme=b.dataset.theme;Shell.applyPrefs();renderSettings();});
    $$('[data-range]',root).forEach(input=>input.oninput=()=>{p[input.dataset.range]=+input.value;input.nextElementSibling.textContent=input.value+'%';Shell.applyPrefs();});
    $$('[data-action]',root).forEach(b=>b.onclick=()=>action(b.dataset.action));
  }
  function action(id) {
    if(id.startsWith('open-'))return Shell.openApp(id.slice(5));
    if(['about','privacy','personalization'].includes(id))return openSettings(id);
    if(id==='opisai-settings')return window.OpisAI?.settings();
    if(id==='opisai-appearance')return window.OpisAI?.settings('appearance');
    if(id==='opisai-about')return window.OpisAI?.about();
    if(id==='help')return openHelp();
    if(id==='dictate')return tryDictation();
    if(id==='shortcuts')return openSettings('accessibility');
    if(id==='notifications')return Shell.showCalendar();
    if(id==='display')return openDisplay();
    if(id==='privacy-details')return openHelp('privacy');
    if(id==='fullscreen')return fullscreen();
    if(id==='reset')return Shell.confirm({title:'Przywróć dane demonstracji',icon:'settings',message:'Usunąć zapisane w tej przeglądarce wizyty demonstracyjne, historię OpisAI, notatki i ustawienia? Strona uruchomi się ponownie z przykładową wizytą.',confirmLabel:'Przywróć',onConfirm:()=>{Object.keys(localStorage).filter(k=>k.startsWith('opisai.demo.')||k==='opisai-demo-settings-v12').forEach(k=>localStorage.removeItem(k));location.reload();}});
  }
  /* "Rozpocznij", "Wypróbuj dyktowanie" and "Uruchom przykład" start the bubble's dictation. Its panel is stacked with the
   * Klinika sub-window, as the rc32 overlay is, so an open visit comes forward first instead of staying under this window. */
  function tryDictation(){if(window.Clinic?.isEditorOpen?.()){Shell.windows.get('clinic')?.focus();Shell.windows.get('clinic-editor')?.focus();}return window.OpisAI?.dictate();}
  async function fullscreen() {
    try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch {Shell.toast('Użyj klawisza F11, aby włączyć pełny ekran przeglądarki.');}
    renderSettings();
  }
  function openDisplay(){
    const win=Shell.createWindow({id:'display',title:'Ekran',icon:'computer',width:540,height:370,minWidth:330,minHeight:250,taskbar:false,content:`<div class="display-dialog"><div class="display-monitor">1</div><h3>Jasność</h3><div class="display-slider">${icon('sun',20)}<input type="range" min="35" max="100" value="${Shell.prefs.brightness}" aria-label="Jasność ekranu"><span>${Shell.prefs.brightness}%</span></div><p class="setting-description">Dostosuj jasność pulpitu demonstracyjnego.</p><button class="win-button" id="display-fullscreen">${icon('fullScreen',16)} Tryb pełnoekranowy</button></div>`});
    $('input',win.content).oninput=e=>{Shell.prefs.brightness=+e.target.value;$('#desktop').style.opacity=e.target.value/100;e.target.nextElementSibling.textContent=e.target.value+'%';Shell.applyPrefs();};$('#display-fullscreen',win.content).onclick=fullscreen;
  }
  /* Przewodnik po demonstracji: a guide to this page, not an OpisAI window (0.12.0rc32 has no help window). */
  const helpSections=[['start','Pierwsze kroki','opisai'],['describe','Opisywanie wizyty','document'],['dictate','Dyktowanie','mic'],['review','Przegląd i wpisanie','check'],['spelling','Pisownia OpisAI','eye'],['settings','Konfiguracja OpisAI','settings'],['desktop','Obsługa pulpitu','computer'],['privacy','Dane i prywatność','shield']];
  function openHelp(page='start') {
    helpPage=helpSections.some(h=>h[0]===page)?page:'start';
    if(helpWin&&!helpWin.closed){helpWin.show();renderHelp();return;}
    helpWin=Shell.createWindow({id:'help',title:'Przewodnik po demonstracji',icon:'help',width:890,height:665,minWidth:480,minHeight:360,content:`<div class="help-layout"><aside class="help-sidebar" aria-label="Strony przewodnika"><div class="help-brand">${icon('help',36)}<strong>Przewodnik</strong></div>${helpSections.map(([id,title,ic])=>`<button data-help="${id}">${icon(ic,18)}<span>${title}</span></button>`).join('')}<small>Demonstracja OpisAI 0.12.0rc32 w przeglądarce</small></aside><article class="help-page"></article></div>`});
    $$('[data-help]',helpWin.content).forEach(b=>b.onclick=()=>{helpPage=b.dataset.help;renderHelp();});renderHelp();
  }
  function renderHelp() {
    const root=$('.help-page',helpWin.content);
    $$('[data-help]',helpWin.content).forEach(b=>{b.classList.toggle('active',b.dataset.help===helpPage);b.setAttribute('aria-current',b.dataset.help===helpPage?'page':'false');});
    const content={
      start:`<div class="help-eyebrow">PRZEWODNIK PO DEMONSTRACJI</div><h1>Od notatki do opisu wizyty</h1><p class="help-lead">Ten przewodnik należy do strony demonstracyjnej — w aplikacji OpisAI nie ma okna pomocy. OpisAI pracuje obok programu gabinetowego: czyta otwarte podokno opisu wizyty, pokazuje propozycję do sprawdzenia i wpisuje tylko zatwierdzoną treść.</p><div class="help-feature"><span>1</span><div><h3>Otwórz wizytę</h3><p>W makiecie Kliniki XP czeka przykładowa wizyta szczura Fistaszka, w podoknie „Rejestracja wizyty: Wywiad - Badanie - Diagnoza” (F2). Możesz zmienić wywiad, badanie i diagnozę.</p></div></div><div class="help-feature"><span>2</span><div><h3>Użyj bąbelka OpisAI</h3><table class="help-gestures"><tbody><tr><th scope="row">Kliknięcie</th><td>Opisz wizytę — okno przygotowania opisu</td></tr><tr><th scope="row">Przytrzymanie (0,45 s)</th><td>Rozpocznij albo zakończ dyktowanie</td></tr><tr><th scope="row">Przeciągnięcie na pole Kliniki</th><td>Opracuj tylko to pole</td></tr><tr><th scope="row">Prawy przycisk (Shift+F10)</th><td>Menu OpisAI, to samo co w zasobniku</td></tr><tr><th scope="row">Najechanie albo Tab</th><td>Akcje „Opisz” i „Dyktuj” pod bąbelkiem</td></tr></tbody></table></div></div><div class="help-feature"><span>3</span><div><h3>Sprawdź i wpisz</h3><p>Wybierz sposób opracowania, potwierdź źródła i przejrzyj wynik. Do pól wizyty trafia tylko zatwierdzona treść; wizytę zapisujesz osobno w Klinice.</p></div></div><div class="help-actions"><button class="win-button primary" data-go="describe">${icon('opisai',18)} Opisz wizytę</button><button class="win-button" data-go="dictate">${icon('mic',18)} Wypróbuj dyktowanie</button></div>`,
      describe:`<h1>Opisywanie wizyty</h1><p>Kliknij bąbelek albo akcję <strong>Opisz</strong>, która pojawia się pod nim po najechaniu. Bąbelek przeciągnięty na pole Kliniki wsiąka w nie i przygotowuje opis tylko tego pola.</p><p>OpisAI czyta wyłącznie otwarte podokno opisu wizyty i nigdy samo go nie otwiera. Bez niego kliknięcie bąbelka kończy się czerwonym „Błędem” z dymkiem, który podpowiada, co zrobić, a dyktowanie pokazuje tylko dymek „⚠ Transkrypcja”.</p><h2>Źródła i sposób opracowania</h2><p>Okno przygotowania pokazuje treść pól, którą możesz poprawić. Wybierz styl <strong>Wiernie</strong> albo <strong>Bogato</strong> oraz zakres: sam opis, z panelem parametrów albo także z rozpoznaniem roboczym. Panel bierze wartości z notatki, a parametry, o których notatka nie wspomina, dostają wartość ze wzorca (Konfiguracja → Sekcje opisu → Konfiguruj).</p><h2>Zatwierdź źródła</h2><p>Potwierdzenie nazywa usługę AI wybraną w Konfiguracji (Połączenie i model). Zmiana treści, zakresu albo połączenia je odznacza; sama zmiana stylu nie. W aplikacji notatka trafia do wybranego serwisu; tutaj odpowiedź jest lokalną symulacją.</p><button class="win-button primary" data-go="describe">Otwórz przygotowanie</button>`,
      dictate:`<h1>Dyktowanie</h1><p>Przytrzymaj bąbelek, aż pierścień wokół niego się zamknie, albo wybierz akcję <strong>Dyktuj</strong> pod bąbelkiem lub „Dyktowanie” w jego menu. Dyktowanie zawsze trafia do pola „Badanie kliniczne” otwartej wizyty. Nad tym polem pojawia się panel z nową transkrypcją i stanem nagrywania, a treść pola sprzed dyktowania rozwiniesz osobno („Dotychczasowy tekst”). Podczas nagrywania bąbelek jest czerwony i pokazuje „REC”.</p><h2>Silnik dyktowania</h2><p>Silnik wybierasz w Konfiguracji OpisAI, na stronie <strong>Dyktowanie</strong>. Gemini Live i lokalny Whisper pokazują tekst podczas mówienia; Gemini przed pierwszym nagraniem pyta o zgodę na wysyłanie dźwięku. Przy ChatGPT (próba) tekst wraca fragmentami: <strong>Enter</strong> w panelu lub w polu „Badanie kliniczne” albo przycisk <strong>Przepisz fragment ↵</strong> przekazuje bieżący fragment do przepisania, a nagrywanie trwa dalej. ChatGPT przechowuje nagrania dyktowania na koncie przez 30 dni; przy wrażliwych wizytach aplikacja zaleca lokalny Whisper.</p><h2>Zakończ albo kontynuuj</h2><p><strong>Zakończ i sprawdź tekst</strong> albo ponowne przytrzymanie bąbelka kończy dyktowanie. Gdy dotrze ostatni tekst, poprawisz go w przeglądzie: możesz kontynuować dyktowanie, przygotować z niego opis wizyty albo wpisać samą notatkę.</p><p class="help-note">Demonstracja odtwarza zapisany przykład. Ta strona nie uruchamia Twojego mikrofonu.</p><button class="win-button primary" data-go="dictate">Uruchom przykład</button>`,
      review:`<h1>Przegląd przed wpisaniem</h1><p>Wynik przeczytasz i zmienisz w stałych podsekcjach. Wiersze panelu mają podpis pochodzenia („Ze źródła”, „Z wzorca”), a wnioski AI są osobnymi blokami. Zaznacz pola do wpisania i potwierdź, że treść jest sprawdzona.</p><h2>Ochrona aktualnej wizyty</h2><p>Jeśli w czasie przeglądu zmienisz tekst w Klinice albo zamkniesz podokno opisu, OpisAI zatrzyma wpisanie: wpis wymaga tego samego podokna i tych samych pól co przy odczycie.</p><h2>Cofanie i historia</h2><p>Ostatni wpis cofniesz przyciskiem „Cofnij wpisanie” w oknie wyniku albo z menu bąbelka: „Bezpieczny zapis i odzyskiwanie” → „Cofnij ostatni potwierdzony wpis…”. Cofanie również sprawdza, czy w polach nie pojawiły się późniejsze zmiany. W historii dokumentów (Konfiguracja → Historia → „Otwórz historię generowań…”) przejrzysz i skopiujesz wcześniejsze opisy.</p><p class="help-note">Wpisanie tekstu nie zapisuje wizyty. Zapis wykonujesz osobno w Klinice.</p><button class="win-button" data-go="history">${icon('history',18)} Konfiguracja → Historia</button>`,
      spelling:`<h1>Pisownia OpisAI</h1><p>Nad polami podokna opisu OpisAI rysuje własne podkreślenia — to warstwa OpisAI, nie Kliniki. Po chwili najechania na podkreślone słowo pojawia się karta z rodzajem uwagi i propozycjami; lewy przycisk na pasku pod słowem przypina kartę, a prawy otwiera menu pisowni. Kliknięcie w litery stawia kursor w polu.</p><div class="spelling-key"><span><i class="red-underline">nastroszna</i> Literówka</span><span><i class="amber-underline">Kajtusia</i> Nieznane słowo</span><span><i class="blue-underline">brat brat</i> Powtórzone słowo</span></div><h2>Poprawka i słownik</h2><p>Propozycja zamienia dokładnie wskazany fragment, a Ctrl+Z w polu ją cofa. „Pomiń” działa do odświeżenia strony, a „Dodaj do słownika” zapamiętuje słowo. Podkreślenia znikają, gdy OpisAI pracuje (przygotowanie, przegląd, wpis, dyktowanie, Konfiguracja) albo gdy aktywne nie jest podokno opisu.</p><h2>Menu „Podpowiedzi pisowni”</h2><p>W menu bąbelka znajdziesz włącznik „Podkreślaj podejrzane słowa w Klinice”, „Sugestie dla aktywnej wizyty…” (lista do obsługi klawiaturą), „Cofnij ostatnią poprawkę pisowni”, „Mój słownik…” i wiersz stanu. To jedyne miejsce, w którym włączasz i wyłączasz pisownię.</p><p class="help-note">Słownik demonstracji zna tylko słowa przykładowej wizyty i kilka wymyślonych literówek. Aplikacja korzysta z polskiego słownika Windows i słownika weterynaryjnego, więc może podać inne propozycje.</p><button class="win-button" data-go="clinic">Otwórz wizytę</button>`,
      settings:`<h1>Konfiguracja OpisAI</h1><p>Konfigurację otworzysz z menu bąbelka („Konfiguracja...”). Ma te same strony co aplikacja 0.12.0rc32, a wyszukiwarka zna też ich słowa kluczowe, np. „klucz api”. <strong>Zapisz</strong> jest aktywne tylko przy zmianach i zapisuje bieżącą stronę bez zamykania okna; przejście na inną stronę albo <strong>Zamknij</strong> odrzuca niezapisane zmiany.</p><h2>Co działa w demonstracji</h2><p>Wybór serwisu w „Połączenie i model” zmienia opis połączenia i zgodę w oknie przygotowania. Silnik i opcje dyktowania, motyw okien, animacja bezczynności bąbelka i zapisywanie historii działają jak w aplikacji. Sekcje opisu, odczyt pola, integracja z Windows i matryca AI Act / RODO są do wglądu; przyciski, które w aplikacji logują, pobierają albo tworzą pliki, mówią, że działają w aplikacji.</p><button class="win-button" data-go="opisai-settings">${icon('settings',18)} Otwórz Konfigurację</button>`,
      desktop:`<h1>Obsługa pulpitu</h1><p>Przeciągaj okna za pasek tytułu i zmieniaj ich rozmiar przy krawędziach. Podwójne kliknięcie paska tytułu maksymalizuje okno.</p><h2>Przyciąganie i pasek zadań</h2><p>Przesuń okno do lewej, prawej lub górnej krawędzi ekranu. Najedź na maksymalizację, aby wybrać układ. Ikona na pasku zadań pozwala minimalizować i przywracać aplikację.</p><h2>Menu i skróty</h2><p>Prawy przycisk działa na pulpicie, ikonach i paskach tytułu. Menu Start wyszukuje aplikacje. Zegar otwiera kalendarz, a ikony sieci i głośności — szybkie ustawienia.</p><div class="help-actions"><button class="win-button" data-go="shortcuts">Skróty klawiaturowe</button><button class="win-button" data-go="fullscreen">${icon('fullScreen',16)} Pełny ekran</button></div>`,
      privacy:`<h1>Dane i prywatność</h1><p>Ta strona pokazuje działanie OpisAI na fikcyjnych wizytach. Generowanie i dyktowanie są lokalną symulacją: demonstracja nie wysyła zapytań do modeli AI i nie włącza mikrofonu.</p><h2>Co zapamiętuje demo?</h2><p>Zmiany wizyt, notatki i ustawienia są zapamiętywane w tej przeglądarce. Historia dokumentów OpisAI zostaje w bieżącej karcie do jej odświeżenia lub zamknięcia. Wszystko usuniesz przez <strong>Ustawienia → Prywatność i zabezpieczenia</strong>.</p><h2>Prawdziwa aplikacja</h2><p>Program OpisAI na komputerze ma własną konfigurację serwisów, urządzeń i integracji, a historię dokumentów trzyma lokalnie, w chronionej bazie. Ustawienia zapisane na tej stronie nie są do niego przenoszone.</p><p>Do przeglądania demonstracji nie potrzebujesz konta, hasła ani klucza API.</p><button class="win-button" data-go="privacy">Ustawienia prywatności</button>`
    };
    root.innerHTML=content[helpPage]||content.start;root.scrollTop=0;
    $$('[data-go]',root).forEach(b=>b.onclick=()=>{const id=b.dataset.go;if(id==='describe')window.OpisAI?.prepare();else if(id==='dictate')tryDictation();else if(id==='history')window.OpisAI?.settings('history');else if(id==='clinic')window.Clinic?.open();else action(id);});
  }
  function openTerminal() {
    const existing=Shell.windows.get('terminal');if(existing){existing.show();return;}
    const win=Shell.createWindow({id:'terminal',title:'Terminal — Wiersz polecenia',icon:'terminal',width:810,height:470,minWidth:380,minHeight:260,content:'<div class="terminal-area"><pre class="terminal-output"></pre><label class="terminal-prompt"><span>C:\\Users\\Gabinet&gt;</span><input class="terminal-input" aria-label="Polecenie" spellcheck="false" autocomplete="off"></label></div>'});
    const area=$('.terminal-area',win.content),output=$('.terminal-output',area),input=$('.terminal-input',area),history=[];let h=0;
    output.textContent='Pulpit OpisAI — terminal demonstracyjny\nWpisz HELP, aby wyświetlić dostępne polecenia.\n\n';
    function run(command){const [cmd,...args]=command.trim().split(/\s+/),value=args.join(' ');let response='';switch((cmd||'').toLowerCase()){
      case '':break;
      case 'help':response='HELP            Lista poleceń\nCLS             Wyczyść ekran\nVER             Wersja pulpitu i odtwarzanej aplikacji\nDIR             Dokumenty demonstracji\nDATE / TIME     Aktualna data / godzina\nECHO tekst      Wyświetl tekst\nSTART aplikacja Otwórz clinic, opisai, explorer, notepad lub settings\nEXIT            Zamknij terminal';break;
      case 'cls':output.textContent='';return;
      case 'ver':response='Pulpit demonstracji OpisAI (przeglądarka)\nOdtwarzana aplikacja: OpisAI 0.12.0rc32 dla Windows';break;
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
    Shell.registerApp({id:'help',title:'Przewodnik po demonstracji',icon:'help',keywords:'pomoc przewodnik pierwsze kroki opisai demonstracja',open:()=>openHelp()});
    Shell.registerApp({id:'history',title:'Historia dokumentów OpisAI',icon:'history',keywords:'historia wyniki opisy dokumenty',open:()=>window.OpisAI?.history()});
    Shell.registerApp({id:'terminal',title:'Terminal',icon:'terminal',keywords:'cmd polecenia',open:openTerminal});
    Shell.registerApp({id:'contact',title:'O aplikacji OpisAI',icon:'info',keywords:'kontakt opisai autor licencja wersja',open:()=>window.OpisAI?.about()});
    Shell.registerApp({id:'personalization',title:'Personalizacja',icon:'sun',keywords:'tapeta motyw tło wygląd',open:()=>openSettings('personalization')});
    Shell.registerApp({id:'shortcuts',title:'Skróty klawiaturowe',icon:'accessibility',keywords:'klawiatura skróty',open:()=>openSettings('accessibility')});
    document.addEventListener('fullscreenchange',()=>{if(settingsWin&&!settingsWin.closed)renderSettings();});
  }
  document.addEventListener('DOMContentLoaded',init);
})();
