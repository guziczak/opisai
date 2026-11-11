# OpisAI — interaktywna demonstracja

[Otwórz demo](https://guziczak.github.io/opisai/)

Demonstracja przeglądarkowa OpisAI, odtwarzająca okna i przebieg pracy aplikacji **0.12.0rc32**; świadome różnice opisują sekcje „Konfiguracja, O aplikacji i przewodnik” oraz „Dane i granice demonstracji”. Okno Kliniki XP jest makietą odtworzoną z testowego mocka `kxp_mock.c` 2.4.1, czyli z układu prawdziwego programu, z fikcyjnymi danymi. Całość działa na własnym pulpicie demonstracyjnym z motywami Horyzont.

## Przebieg wizyty

Kolejne kroki odpowiadają sekcji „Opracowanie dokumentacji” z README aplikacji 0.12.0rc32.

1. W Klinice XP opis wizyty jest w osobnym podoknie „Rejestracja wizyty: Wywiad - Badanie - Diagnoza” (F2). Edytuj w nim wywiad, badanie i diagnozę.
2. Kliknij bąbelek OpisAI albo upuść go na jednym polu. OpisAI najpierw odczytuje otwarte podokno („Odczytuję pola”). Nie otwiera wizyty za Ciebie: gdy podokna nie ma, pokazuje błąd jak aplikacja.
3. Wybierz zakres i wariant: Wiernie albo Bogato, z panelem parametrów lub bez, z rozpoznaniem lub bez. Domyślny wariant to „Wiernie · sam opis”. Wariant całej wizyty jest zapamiętywany po rozpoczęciu generowania; opracowanie pojedynczego pola go nie zmienia. Pod kafelkami widać, czego wariant wymaga od AI, np. że panel uzupełnia brakujące parametry normą z Ustawień.
4. Sprawdź i zatwierdź źródła oraz wybrane połączenie. Zgoda nazywa usługę AI („Sprawdzone: wysyłam do ChatGPT tylko te pola…”). Zmiana treści, zakresu albo połączenia odznacza ją, a sama zmiana stylu Bogato/Wiernie nie. „Pokaż zasady i źródła” pokazuje układ polecenia z rc32: kolejność reguł, sloty, zestawienie panelu, format odpowiedzi i źródła. Treść każdej reguły jest w demonstracji skrócona do jednego zdania.
5. W tym samym oknie widać postęp, a potem przegląd. Najpierw pojawia się panel złożony lokalnie, potem tekst na żywo. W przeglądzie tekst „Do wpisania” edytujesz w stałych podsekcjach. Wiersze panelu mają podpis pochodzenia („Ze źródła”, „Z wzorca”), a wnioski AI są osobnymi blokami „Wnioskowanie”. Zamknięcie okna (także klawiszem Esc) podczas generowania anuluje je, a zamknięcie przeglądu odrzuca wynik.
6. Zatwierdź dokładnie tę treść. Wpis wykonuje się tylko wtedy, gdy podokno i pola są takie jak przy odczycie. Okno wyniku potwierdza każde pole odczytem kontrolnym i oferuje „Cofnij wpisanie”. Wpisanie do pól nie zapisuje wizyty w Klinice.
7. Zapisz wizytę osobno w Klinice (OK w podoknie albo „Zapisz wizytę”). Zapisana wizyta otwiera się w przeglądzie tylko do odczytu; ponowna edycja wymaga „Przejdź do edycji”. Historia dokumentów (Konfiguracja → Historia → „Otwórz historię generowań…”) obejmuje opracowania przygotowane, odrzucone, wpisane i niewpisane z powodu zmiany pól.

Świadome uproszczenia: odpowiedź AI jest lokalną, powtarzalną symulacją. Dla przykładowej wizyty Fistaszka teksty mają ustalone brzmienie zgodne z regułami rc32, a inną notatkę rozdziela na podsekcje prosty lokalny podział zdań. Panel parametrów, poprawioną pisownię jego cytatów, usuwanie powtórzeń, uwagi do treści i kontrole liczy kod przeniesiony z rc32. Jako model widnieje „przykład demonstracyjny — bez AI”, a „Pokaż polecenie i odpowiedź” zawiera skrócone polecenie i przykładową odpowiedź.

Przytrzymanie bąbelka uruchamia przykładowe dyktowanie do pola „Badanie kliniczne”. Jak nakładka w aplikacji, panel nad tym polem pokazuje nową transkrypcję i stan nagrywania, a treść pola sprzed dyktowania można rozwinąć osobno. Silnik (domyślnie Gemini Live ze zgodą przed pierwszym nagraniem, lokalny Whisper albo ChatGPT w przeglądarce jako próba) wybiera się w Konfiguracji → Dyktowanie. Przy ChatGPT Enter przekazuje bieżący fragment do przepisania, a nagrywanie trwa. Dyktowanie kończy „Zakończ i sprawdź tekst” albo ponowne przytrzymanie; potem można poprawić i kontynuować transkrypcję, przygotować z niej opis albo przejść do wpisania surowej notatki.

## Konfiguracja, O aplikacji i przewodnik

- Konfiguracja („Konfiguracja...” w menu bąbelka) ma strony, etykiety i słowa kluczowe wyszukiwarki z rc32 (np. „klucz api” znajduje „Połączenie i model”), tytuł „OpisAI 0.12.0rc32 — konfiguracja” i stopkę „Konfig: Otwórz folder”. „Zapisz” jest aktywne tylko przy zmianach i zapisuje bieżącą stronę bez zamykania okna; inna strona, „Zamknij”, × albo Esc odrzucają niezapisane zmiany.
- Działają tu: połączenie (serwis → transport → autoryzacja → model jak w `domain/providers.py`; wybór zmienia opis połączenia i zgodę w oknie przygotowania), Dyktowanie, motyw okien (Automatyczny / Jasny / Ciemny; wybór od razu widać w oknie Konfiguracji, a „Automatyczny” podąża za trybem kolorów pulpitu), animacja bezczynności bąbelka i zapisywanie historii. Demonstracja zaczyna od ChatGPT w przeglądarce, a nowa instalacja rc32 od Claude · Cookie HTTP · claude-sonnet-4-6.
- Do wglądu: sekcje opisu z podsekcjami i wzorcem panelu (ustawienia domyślne rc32, z których korzysta przygotowanie; treść promptu kondycjonującego zostaje w aplikacji), odczyt pola z diagnostyką na przykładowym raporcie, limity historii, integracja z Windows, hash skryptu i fragment matrycy AI Act / RODO. Przyciski, które w aplikacji logują, pobierają albo tworzą pliki, mówią, że działają w aplikacji. Okno główne i podokno Kliniki mają osobne fragmenty tytułu („Klinika” i „Rejestracja wizyty”), jak w rc32.
- Zapisane wcześniej ustawienia usuniętych opcji (rozmiar tekstu, animacje, motyw „Niebieski”, nazwy sekcji, wiersze panelu, przełączniki wariantu) nie są już odczytywane i znikają przy następnym zapisie; „Niebieski” przechodzi w „Jasny”, a dawne nazwy dostawców w warianty rc32.
- O aplikacji ma nagłówek z wersją, „Możliwości”, „Co nowego” z czterema notatkami wydania 0.12.0rc32, Kontakt i Licencje (pełny tekst licencji OpisAI, wybrane biblioteki i prawa tej strony). „Kopiuj informacje” kopiuje te same fakty co aplikacja, bez ustawień i kluczy. Kontakt pokazuje tylko imię i nazwisko autora, nazwę firmy GUITS i e-mail; telefon, adres, NIP i REGON są w aplikacji.
- „Przewodnik po demonstracji” (ikona na pulpicie, menu Start) opisuje tę stronę: gesty bąbelka, opis, dyktowanie, przegląd, pisownię i Konfigurację. W aplikacji OpisAI nie ma okna pomocy.

## Pulpit

- Ruchome okna z fokusem, ośmioma uchwytami zmiany rozmiaru, minimalizacją, maksymalizacją, przyciąganiem do krawędzi i menu systemowym.
- Pasek zadań z grupowaniem aplikacji, wskaźnikami i podglądami okien; menu Start, wyszukiwanie, widok zadań, kalendarz, powiadomienia i szybkie ustawienia.
- Eksplorator z kartami, lokalnym drzewem dokumentów, osobną historią nawigacji w każdej karcie, wyszukiwaniem, operacjami na plikach i Koszem.
- Notatnik z zapisem lokalnym, pobraniem pliku, wyszukiwaniem i ochroną niezapisanych zmian.
- Jasny i ciemny motyw Horyzont, własne wektorowe tła i ikony narzędzi oraz lokalny Segoe UI z otwartym fontem Selawik jako zamiennikiem na innych systemach. Dotychczasowe ustawienia motywu są zachowane po wymianie tapet.
- Bąbelek odwzorowany z OpisAI 0.12.0rc32. Stan widać wewnątrz koła: niebieskie „OpisAI” w spoczynku (także przy otwartym oknie przygotowania), mieniące się kropki podczas generowania, czerwone „REC” z korektorem w torbie podczas nagrywania, bursztynowe „Sprawdź” w trakcie przeglądu, zielone „Gotowe” przez 4 s i czerwony „Błąd” przez 3 s. Przytrzymany lub przeciągany bąbelek odkłada powrót do spoczynku do chwili puszczenia. Po chwili najechania albo po przejściu klawiszem Tab pod kołem pojawiają się podpisane akcje, a podpowiedź obok pokazuje model i wersję. Zmianę stanu ogłasza czytnikom ekranu ukryty region statusu, a treść dymka błędu jest ogłaszana od razu.
- Kliknięcie opisuje wizytę albo przywołuje już otwarte okno OpisAI, nie zaczynając drugiej operacji. Przytrzymanie przez 0,45 s włącza lub kończy dyktowanie; pierścień i podpis zapowiadają ten gest. Przesuwanie zaczyna się najwcześniej po 180 ms. Puszczenie po wcześniejszym poruszeniu kończy gest bez akcji, a po włączeniu dyktowania ruch jest ignorowany. Bąbelek podąża za wskaźnikiem bez przeregulowania i po puszczeniu krótko wyhamowuje. Odkształca się wyłącznie jego obrys (elipsa z wybrzuszeniem z przodu); logo i napisy zachowują kształt.
- Upuszczony na widocznym polu Kliniki bąbelek wsiąka w nie i wynurza się w miejscu sprzed przeciągnięcia. Pole zasłonięte innym oknem nie przyjmuje upuszczenia, a podczas przeciągania nad właściwym polem widać przerywaną, maszerującą ramkę. OpisAI czyta tylko otwarte podokno opisu wizyty i nigdy samo go nie otwiera. Gdy go brakuje, opisywanie (kliknięcie bąbelka albo „Opisz”) kończy się czerwonym „Błędem”, z którego wyrasta dymek „⚠ Błąd”. Gdy Klinika nie działa, dymek ma przycisk „▶ Uruchom Klinikę”, który otwiera okno główne, ale nie wizytę. Dyktowanie bez podokna, jak w aplikacji, nie zmienia koloru bąbelka i pokazuje tylko dymek „⚠ Transkrypcja”.
- Prawy przycisk na bąbelku i na ikonie OpisAI w zasobniku (z klawiatury Shift+F10 albo klawisz menu) otwiera to samo menu co w aplikacji, z podmenu pisowni, wskazywania pól i bezpiecznego zapisu. Menu i podpowiedź bąbelka są jasne albo ciemne według motywu OpisAI (Konfiguracja → Wygląd → Motyw), a nie pulpitu; tylko „Automatyczny (jak Windows)” podąża za trybem kolorów pulpitu. Kliknięcie ikony w zasobniku opisuje wizytę, jak zapowiada jej podpowiedź z aplikacji („Klik: opisz · Przytrzymaj: dyktuj · Prawy: menu”); w aplikacji ta ikona reaguje tylko na prawy przycisk. Pozycje wymagające prawdziwego pulpitu Windows pokazują komunikat „niedostępne w demonstracji”; kolejny zastępuje poprzedni, więc komunikaty nie zasłaniają bąbelka. „Zamknij” odtwarza animację wyjścia; w demonstracji bąbelek wraca po kliknięciu ikony OpisAI w zasobniku albo na pulpicie. Ukryty „Tryb fizyki” uruchamia się tylko z menu: przez 30 s strzałki poruszają bąbelkiem, Spacja ładuje i wybija go, a Esc kończy tryb.
- Pisownia OpisAI w podoknie opisu działa jak w rc32: to osobna warstwa OpisAI nad oknem Kliniki, o której Klinika nic nie wie. Literówka ma czerwoną linię ciągłą, nieznane słowo (np. imię wielką literą w środku zdania) bursztynowe kreski, a powtórzone słowo niebieskie kropki. Mysz przejmuje tylko pasek pod słowem: kliknięcie w litery stawia kursor w polu, lewy przycisk na pasku przypina kartę, a prawy otwiera menu pisowni OpisAI. Po 0,22 s najechania na słowo karta pokazuje rodzaj uwagi i do pięciu propozycji: pierwsza „przed → po”, propozycja obejmująca sąsiednie słowo z bursztynowym podglądem zakresu w polu. „Pomiń” działa tylko do odświeżenia strony, a „Dodaj do słownika” zapamiętuje słowo w `opisai.demo.spelling.v1`. Poprawka zamienia dokładnie wybrany fragment, potwierdza ją krótka zielona linia, a Ctrl+Z w polu ją cofa. Linie znikają, gdy OpisAI pracuje (przygotowanie, przegląd, wpis, dyktowanie, Konfiguracja) albo gdy aktywne nie jest podokno opisu.
- Pisownię obsługuje się z menu bąbelka → „Podpowiedzi pisowni”: włącznik „Podkreślaj podejrzane słowa w Klinice” (jedno ustawienie OpisAI, zapisywane razem z jego ustawieniami), „Sugestie dla aktywnej wizyty…” (lista podkreślonych słów dla klawiatury), „Cofnij ostatnią poprawkę pisowni”, „Mój słownik…” i wiersz stanu. Słownik demonstracyjny zna tylko słowa przykładowej wizyty i kilka wymyślonych literówek. Ich propozycje to wynik zapasowego słownika rc32 (Hunspell pl_PL i słownik weterynaryjny) dla tego tekstu, więc dla „Osłuchwo” pierwsza jest propozycja kontekstowa „Osłuch wona”. Polski słownik Windows, którego aplikacja używa najpierw, może podać inne propozycje.
- Po 10 s bez ruchu myszy i klawiatury bąbelek spada na pasek zadań, sprężyście się spłaszcza, odbija kilka razy z drobnymi kroplami i wraca na miejsce. Interwał i limit odbić ustawisz w Konfiguracji, na stronie Bąbelek. Domyślne położenie to prawy dolny róg pulpitu; przeciągnięty bąbelek zapamiętuje miejsce. Bąbelek, który znalazł się całkowicie poza pulpitem, wraca w prawy dolny róg. Systemowe ograniczenie ruchu wyłącza falowanie, bezwładność, wsiąkanie i odbijanie; przeciąganie staje się bezpośrednie, akcje pojawiają się bez przenikania, a korektor „REC” stoi nieruchomo.

Wszystkie funkcje dotyczą pulpitu demonstracyjnego. Przeglądarka nie zmienia konfiguracji Windows, sieci ani urządzeń na komputerze odwiedzającego. Tryb pełnoekranowy jest dostępny w Ustawieniach; część skrótów klawiaturowych może przejąć system lub przeglądarka.

## Klinika XP (makieta)

Układ, etykiety i zachowanie okna pochodzą z `kxp_mock.c` 2.4.1 z repozytorium zasobów OpisAI, odtworzonego ze zdjęć prawdziwej Kliniki XP. To niezależna rekonstrukcja do pokazania pracy z OpisAI, a nie produkt BRI ani kompletna Klinika XP. Nie zawiera grafik wydawcy: ikony to własne rysunki SVG tej demonstracji, które zachowują nazwy i motywy z mocka. Wygląd okna jest lekko odświeżony (czytelniejsze podpisy, kontrast, stany najechania i fokusu) przy zachowaniu układu, wymiarów i etykiet.

- Okno „Przebieg wizyty – Zwierzę domowe”: menu, pasek narzędzi (Zapisz wizytę, Na razie zatrzymaj, Anuluj), ramki NOWA WIZYTA / WŁAŚCICIEL / ZWIERZĘ, miejsce na zdjęcie, etapy wizyty 1–9 i historia wizyt pacjenta.
- Podokno opisu z trzema sekcjami i ich narzędziami (Mowa, Zredaguj, Typowe… OK, ANULUJ). Narzędzia Kliniki (także etapy 2–7) nie są odtworzone i mówią o tym po kliknięciu; działają OK i ANULUJ. Tytuł podokna ma dopisek z imieniem pacjenta i numerem wizyty, jak w mocku. Wysokość pól zmienia się przeciągnięciem separatora.
- Tryby jak w mocku: nowa wizyta, edycja, zapisana wizyta w przeglądzie tylko do odczytu i historia po anulowaniu. „Na razie zatrzymaj” chowa podokno bez zapisu; F2 je przywraca.
- F2 — opis wizyty, F4 — nowa wizyta z danymi (data, godzina, typ, lekarz, waga, temperatura), Ctrl+L — lista wizyt z filtrami i przeglądem dowolnej wizyty. W podoknie Ctrl+S zapisuje, a Esc anuluje. Skróty działają, gdy fokus jest w oknie Kliniki; inaczej Ctrl+L przejmie przeglądarka.
- Ctrl+Z cofa ostatnią zmianę w polu, jak w zwykłym polu tekstowym Windows. Wpis wykonany przez OpisAI czyści to cofanie; wpisy cofa się w OpisAI („Cofnij wpisanie” w oknie wyniku albo menu bąbelka „Bezpieczny zapis i odzyskiwanie”).
- Wpis OpisAI wymaga tego samego podokna, które było odczytane: po zamknięciu i ponownym otwarciu opisu trzeba odczytać pola od nowa.
- Pole opisu prawdziwej Kliniki ma własny słownik i rysuje cienkie czerwone zygzaki (notatka rc31). Makieta, tak jak `kxp_mock.c`, ich nie rysuje; gładkie linie pod słowami to warstwa OpisAI.
- Moduły spoza zdjęć (Leczenie, Rozliczenie, Multimedia, Apteka, Finanse…) są wyłączone albo pokazują informację, że nie są odwzorowane. Wydruki nie są generowane.
- Kartoteka ma też wizyty kota Meli i psa Bruna. Notatki części z nich to wymyślone przypadki testowe z `kxp_mock.c`, każda wizyta z jednego przypadku. Pokazują, co rc32 robi z kilkoma albo opisanymi w czasie pomiarami (np. dwa pomiary tętna oznaczone do sprawdzenia); panel, który OpisAI z nich odczytuje, jest sprawdzany z prawdziwym panelem rc32. Lekarz w makiecie to etykieta „Lekarz testowy”, jak w mocku, a numery wizyt mają format „NNN/RRRR”.

## Dane i granice demonstracji

Generowanie jest lokalną symulacją odpowiedzi AI (zob. „Przebieg wizyty”), a dyktowanie odtwarza zapisaną transkrypcję. Demo nie łączy się z usługami AI, nie prosi o klucze API i nie włącza mikrofonu. Dowolny tekst wprowadzony przez użytkownika pozostaje źródłem wyniku; przykład Fistaszka nie zastępuje innej notatki.

Wizyty makiety Kliniki, dokumenty, ustawienia pulpitu i położenie bąbelka (`opisai.demo.bubble.v1`) są zapisywane w `localStorage`, pod kluczami zaczynającymi się od `opisai.demo.` (wizyty: `opisai.demo.visit.v3`; dawny klucz `opisai.demo.visit.v2` jest usuwany przy przywróceniu przykładu). Ustawienia OpisAI są zapisywane pod kluczem `opisai-demo-settings-v12`, a ostatni zatwierdzony wariant całej wizyty pod `opisai.demo.variant.v1`. Historia dokumentów OpisAI pozostaje w bieżącej karcie i jest czyszczona po odświeżeniu strony. Ustawienia → Prywatność i zabezpieczenia → Przywróć ustawienia usuwa dane demonstracji, w tym oba zestawy ustawień. Do testowania należy używać fikcyjnych danych.

Świadome różnice wobec aplikacji: brak połączeń z AI i mikrofonu, stałe sekcje opisu i wzorzec panelu, historia tylko w karcie przeglądarki, Kontakt bez telefonu, adresu, NIP i REGON (pełne dane są w aplikacji) oraz przewodnik po demonstracji, którego aplikacja nie ma.

## Prawa

© 2026 Łukasz Guziczak (GUITS). Wszelkie prawa zastrzeżone, o ile nie zaznaczono inaczej.

- Aplikacja OpisAI jest objęta licencją PolyForm Internal Use 1.0.0 (do użytku wewnętrznego licencjobiorcy, bez prawa rozpowszechniania). Demonstracja pokazuje jej tekst w oknie O aplikacji → Licencje; ta strona nie zawiera programu OpisAI.
- Selawik, zapasowa czcionka zamiast Segoe UI: SIL Open Font License 1.1, © Microsoft Corporation; pełny tekst w `assets/fonts/LICENSE.txt`.
- Klinika XP jest produktem firmy BRI. Makieta jej okna w tej demonstracji to niezależna rekonstrukcja z fikcyjnymi danymi, a nie produkt BRI.
- Windows jest znakiem towarowym Microsoft Corporation. Pulpit demonstracji to jego własna stylizacja z własnymi tapetami i ikonami (`assets/ASSET_SOURCES.md`).

## Struktura

| Pliki | Odpowiedzialność |
| --- | --- |
| `index.html` | Dokument startowy i kolejność ładowania |
| `assets/shell.js`, `assets/windows.css` | Pulpit, okna, pasek zadań i wspólne kontrolki |
| `assets/desktop-apps.js` | Ustawienia pulpitu, przewodnik po demonstracji i terminal |
| `assets/files-apps.js`, `assets/files-apps.css` | Eksplorator, lokalne dokumenty, Kosz i Notatnik |
| `assets/clinic.js`, `assets/clinic.css` | Makieta Kliniki XP: przebieg wizyty, podokno opisu, przegląd tylko do odczytu, lista wizyt |
| `assets/clinic-icons.js` | Ikony makiety Kliniki (własne rysunki o nazwach i motywach z `kxp_mock.c`) |
| `assets/opisai.js`, `assets/opisai.css` | Bąbelek, przygotowanie, dyktowanie, przegląd, Konfiguracja i okno „O aplikacji” OpisAI |
| `assets/opisai-document.js` | Niezależny od DOM model dokumentu przeniesiony z rc32: podsekcje, wzorzec panelu i jego lokalny odczyt, pisownia cytatów, usuwanie powtórzeń, uwagi do treści, dokument przeglądu i symulowana odpowiedź |
| `assets/orb-motion.js` | Niezależne od DOM modele bąbelka przeniesione z rc32: podążanie i wyhamowanie, rozpoznawanie gestów, obrys, odbicie od paska zadań i krople |
| `assets/opisai-spelling.js`, `assets/opisai-spelling.css` | Pisownia OpisAI nad polami podokna opisu (rc32 `spelling_overlay`, `spelling_suggestions`): podkreślenia, karta podpowiedzi, menu pisowni, cofanie i „Mój słownik” |
| `assets/icons.js`, `assets/fonts/`, `assets/desktop-*.svg` | Zasoby wizualne |
| `assets/ASSET_SOURCES.md` | Źródła i licencje zasobów |

Projekt jest statyczny i nie wymaga kompilacji ani instalowania zależności. GitHub Pages publikuje pliki z gałęzi `main`. Do pracy lokalnej wystarczy serwer plików statycznych uruchomiony w katalogu repozytorium.

## Kontrola zmian

Kontrola składni: `node --check` dla zmienianych plików JavaScript. Testy bez dodatkowych zależności uruchomisz w Node.js 22 poleceniem:

```sh
node --test tests/*.test.cjs
```

GitHub Actions wykonuje te same kontrole dla push i pull requestów. Testy okien odtwarzają regresję ponownego otwierania po przeciągnięciu. Testy bąbelka sprawdzają zachowanie z rc32: podążanie bez przeregulowania (20% odległości na takt 33 ms) i wyhamowanie ×0,82, brak odbijania od krawędzi, odkształcanie samego obrysu, gesty (przeciąganie po 180 ms, przytrzymanie po 450 ms, anulowanie), odbicie i krople zgodne z wartościami z modułów Pythona, menu 1:1 z zasobnikiem, akcje w poszczególnych stanach (także przy ograniczeniu ruchu i z klawiatury, gdy klatka animacji ma znacznik sprzed wywołania), „Anuluj” i „Pokaż” podczas startu i odbioru dyktowania, wsiąkanie w widoczne pole i geometrię maszerującej ramki, czerwony „Błąd” z dymkiem, ogłaszanie stanu, motyw menu i zapamiętywanie położenia. Testy modelu dokumentu porównują panel, pisownię, usuwanie powtórzeń i wygenerowane dokumenty z danymi z prawdziwego potoku rc32 (`tests/fixtures/rc32-document-golden.json`, wyłącznie wymyślone notatki). Testy przebiegu dokumentacji sprawdzają odczyt przed przygotowaniem, reset zgody (także po zmianie źródła poza zakresem), macierz wariantów dla pola, zapamiętywanie wariantu, anulowanie z powrotem do notatki, konflikt pól, zgodę na wyczyszczenie pola, cofnięcie (także odmowę po konflikcie), historię z kopią samego tekstu pól, klawisz Esc, fokus po przebudowie kontrolek i kolejność reguł kompaktowania przeglądu. Testy dyktowania sprawdzają pole docelowe „Badanie kliniczne”, Enter jako „Przepisz fragment” przy ChatGPT, zgodę Gemini, położenie panelu (wartości z modułu rc32 `overlay_geometry`), chowanie panelu bez podokna, kontynuację z „Dotychczasowym tekstem” i stronę Dyktowanie w konfiguracji. Testy Konfiguracji i okna O aplikacji (`tests/settings.test.cjs`) porównują rejestr połączeń, etykiety, notatki wydania, możliwości, tekst „Kopiuj informacje”, sekcje domyślne i sumę SHA-256 licencji z danymi odczytanymi z modułów rc32 (`tests/fixtures/rc32-settings.json`), a także zasadę zapisu („Zapisz” tylko przy zmianach, bez zamykania okna, odrzucenie przy zmianie strony), motyw „Automatyczny” i migrację usuniętych opcji. Testy kartoteki (`tests/catalog.test.cjs`) sprawdzają, że każda dodatkowa wizyta pochodzi z jednego wymyślonego przypadku i że jej panel zgadza się z panelem rc32. Harness DOM nie zastępuje oceny wyglądu w przeglądarce.

Najważniejsze ścieżki do sprawdzenia w przeglądarce:

- Przygotowanie → zmiana źródła unieważnia zatwierdzenie → opracowanie → edycja przeglądu → wpis → cofnięcie.
- Zmiana pola w Klinice w trakcie przeglądu → konflikt zatrzymuje wpis; OK w podoknie i „Przejdź do edycji” przed wpisem → „Zmieniło się okno…”.
- Anulowanie generowania → „Anulowano przygotowanie” → „Wróć do notatki” z zachowanymi źródłami i odznaczoną zgodą.
- Zamknięte podokno opisu (ANULUJ albo „Na razie zatrzymaj”) → kliknięcie bąbelka kończy się czerwonym „Błędem” i dymkiem „Nie znaleziono podokna opisu wizyty”, a przytrzymanie samym dymkiem „⚠ Transkrypcja”; przy zamkniętej całej Klinice dymek ma „▶ Uruchom Klinikę”, który otwiera tylko okno główne.
- OK w podoknie → przegląd tylko do odczytu → „Przejdź do edycji” (F2); Ctrl+L → przegląd innej wizyty; F4 → nowa wizyta.
- Dyktowanie (Gemini Live, ChatGPT z Enterem, lokalny Whisper) → panel nad „Badanie kliniczne” → zakończenie → kontynuacja / opracowanie / wpisanie notatki; zamknięcie podokna w trakcie dyktowania chowa panel, a po ponownym otwarciu wpis wymaga nowego odczytu.
- Minimalizowanie i przywracanie, maksymalizacja, zmiana rozmiaru, przyciąganie i menu klawiaturowe.
- Zapis i ponowne otwarcie notatki, przeniesienie do Kosza i przywrócenie.
- Zmiana motywu oraz zachowanie okien na węższym ekranie.
- Konfiguracja: zmiana na stronie Bąbelek → „Zapisz” (okno zostaje, przycisk gaśnie) → kolejna zmiana → inna strona (zmiana odrzucona); Wygląd → Ciemny (podgląd w oknie) → Zamknij; „Automatyczny” i tryb kolorów pulpitu; Połączenie i model → Claude → Zapisz → zgoda „wysyłam do Claude” w oknie przygotowania; Sekcje opisu → Konfiguruj; Zgodność AI → matryca.
- Przeciągnięcie Kliniki → puszczenie bez ponownego odtwarzania animacji otwarcia.
- Przeciągnięcie bąbelka → wyhamowanie bez otwarcia okna; upuszczenie na pole → wsiąknięcie i przygotowanie wyłącznie tego pola; systemowe ograniczenie ruchu → brak bezwładności.
- 10 s bez ruchu → odbicie od paska zadań; prawy przycisk → menu jak w zasobniku → „Zamknij” → powrót z ikony w zasobniku.
- Pisownia: najechanie na „nastroszna” → karta; lewy przycisk na pasku pod „rzęzenia” → przypięta karta; prawy → menu OpisAI (Esc zamyka je, nie anulując wizyty); menu bąbelka → „Sugestie dla aktywnej wizyty…” → strzałki i Enter → zielone potwierdzenie → „Cofnij ostatnią poprawkę pisowni”; wpisane „Obserwować też Kajtusia.” → nieznane słowo, „zakażeni edróg” → propozycja kontekstowa, „brat brat” → powtórzenie; „Odrzuć” albo × w podglądzie opisu → po kliknięciu w podokno linie wracają; „Na razie zatrzymaj” → linie znikają, a F2 przywraca tę samą sesję podokna, więc „Cofnij ostatnią poprawkę pisowni” nadal działa; ANULUJ („Odrzuć zmiany”) i ponowne otwarcie podokna (nowa sesja) → cofnięcie dawnej poprawki jest odrzucane.

Testy pisowni (`tests/spelling.test.cjs`) uruchamiają prawdziwy moduł na małym DOM z przewidywalnym układem tekstu. Sprawdzają rodzaje uwag i powtórzenia z rc26, propozycje (kontekstowa przed słownikowymi), linie tylko nad aktywnym podoknem i nigdy w trakcie pracy OpisAI, częściowe zasłonięcie słowa, kartę, pasek pod słowem, menu, dokładną zamianę z cofnięciem, „Pomiń” na sesję i trwały słownik, listę dla klawiatury oraz odrzucenie cofnięcia w ponownie otwartym podoknie. Testy bąbelka sprawdzają podmenu „Podpowiedzi pisowni” i to, że linie znikają tylko przy oknach roboczych OpisAI (przygotowanie, postęp, przegląd, cofnięcie wpisu, Konfiguracja, dyktowanie), a nie przy komunikatach czy historii, i wracają po odrzuceniu podglądu.
