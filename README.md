# OpisAI — interaktywna demonstracja

[Otwórz demo](https://guziczak.github.io/opisai/)

Demonstracja przeglądarkowa OpisAI, dostosowana do przebiegu pracy aplikacji **0.12.0rc32**. Okno Kliniki XP jest makietą odtworzoną z testowego mocka `kxp_mock.c` 2.4.1, czyli z układu prawdziwego programu, z fikcyjnymi danymi. Całość działa na własnym pulpicie demonstracyjnym z motywami Horyzont.

## Przebieg wizyty

1. W Klinice XP opis wizyty jest w osobnym podoknie „Rejestracja wizyty: Wywiad - Badanie - Diagnoza” (F2). Edytuj w nim wywiad, badanie i diagnozę.
2. Kliknij bąbelek OpisAI i sprawdź odczytane źródła. OpisAI czyta tylko otwarte podokno opisu i nie otwiera wizyty za Ciebie; gdy podokna nie ma, pokazuje błąd jak aplikacja.
3. Wybierz wariant Bogato lub Wiernie, zatwierdź materiał i rozpocznij opracowanie.
4. Przejrzyj wynik, porównaj go ze źródłem, popraw tekst i wybierz pola do wpisania.
5. Zatwierdź przegląd. Wpis zostanie wykonany wyłącznie wtedy, gdy stan pól zgadza się z odczytanym wcześniej.
6. Zapisz wizytę osobno w Klinice (OK w podoknie albo „Zapisz wizytę”). Zapisana wizyta otwiera się w przeglądzie tylko do odczytu; ponowna edycja wymaga „Przejdź do edycji”. Historię i cofanie wpisów znajdziesz w OpisAI.

Przytrzymanie bąbelka uruchamia przykładowe dyktowanie. Można zatrzymać, poprawić i kontynuować transkrypcję, przygotować z niej opis albo przejść do wpisania surowej notatki.

## Pulpit

- Ruchome okna z fokusem, ośmioma uchwytami zmiany rozmiaru, minimalizacją, maksymalizacją, przyciąganiem do krawędzi i menu systemowym.
- Pasek zadań z grupowaniem aplikacji, wskaźnikami i podglądami okien; menu Start, wyszukiwanie, widok zadań, kalendarz, powiadomienia i szybkie ustawienia.
- Eksplorator z kartami, lokalnym drzewem dokumentów, osobną historią nawigacji w każdej karcie, wyszukiwaniem, operacjami na plikach i Koszem.
- Notatnik z zapisem lokalnym, pobraniem pliku, wyszukiwaniem i ochroną niezapisanych zmian.
- Jasny i ciemny motyw Horyzont, własne wektorowe tła i ikony narzędzi oraz lokalny Segoe UI z otwartym fontem Selawik jako zamiennikiem na innych systemach. Dotychczasowe ustawienia motywu są zachowane po wymianie tapet.
- Bąbelek odwzorowany z OpisAI 0.12.0rc32. Stan widać wewnątrz koła: niebieskie „OpisAI” w spoczynku (także przy otwartym oknie przygotowania), mieniące się kropki podczas generowania, czerwone „REC” z korektorem w torbie podczas nagrywania, bursztynowe „Sprawdź” w trakcie przeglądu, zielone „Gotowe” przez 4 s i czerwony „Błąd” przez 3 s. Przytrzymany lub przeciągany bąbelek odkłada powrót do spoczynku do chwili puszczenia. Po chwili najechania albo po przejściu klawiszem Tab pod kołem pojawiają się podpisane akcje, a podpowiedź obok pokazuje model i wersję. Zmianę stanu ogłasza czytnikom ekranu ukryty region statusu, a treść dymka błędu jest ogłaszana od razu.
- Kliknięcie opisuje wizytę albo przywołuje już otwarte okno OpisAI, nie zaczynając drugiej operacji. Przytrzymanie przez 0,45 s włącza lub kończy dyktowanie; pierścień i podpis zapowiadają ten gest. Przesuwanie zaczyna się najwcześniej po 180 ms. Puszczenie po wcześniejszym poruszeniu kończy gest bez akcji, a po włączeniu dyktowania ruch jest ignorowany. Bąbelek podąża za wskaźnikiem bez przeregulowania i po puszczeniu krótko wyhamowuje. Odkształca się wyłącznie jego obrys (elipsa z wybrzuszeniem z przodu); logo i napisy zachowują kształt.
- Upuszczony na widocznym polu Kliniki bąbelek wsiąka w nie i wynurza się w miejscu sprzed przeciągnięcia. Pole zasłonięte innym oknem nie przyjmuje upuszczenia, a podczas przeciągania nad właściwym polem widać przerywaną, maszerującą ramkę. OpisAI czyta tylko otwarte podokno opisu wizyty i nigdy samo go nie otwiera. Gdy go brakuje, opisywanie (kliknięcie bąbelka albo „Opisz”) kończy się czerwonym „Błędem”, z którego wyrasta dymek „⚠ Błąd”. Gdy Klinika nie działa, dymek ma przycisk „▶ Uruchom Klinikę”, który otwiera okno główne, ale nie wizytę. Dyktowanie bez podokna, jak w aplikacji, nie zmienia koloru bąbelka i pokazuje tylko dymek „⚠ Transkrypcja”.
- Prawy przycisk na bąbelku i na ikonie OpisAI w zasobniku (z klawiatury Shift+F10 albo klawisz menu) otwiera to samo menu co w aplikacji, z podmenu pisowni, wskazywania pól i bezpiecznego zapisu. Menu i podpowiedź bąbelka są jasne albo ciemne według motywu OpisAI (Wygląd → Motyw aplikacji), a nie pulpitu. Kliknięcie ikony w zasobniku opisuje wizytę, jak zapowiada jej podpowiedź z aplikacji („Klik: opisz · Przytrzymaj: dyktuj · Prawy: menu”); w aplikacji ta ikona reaguje tylko na prawy przycisk. Pozycje wymagające prawdziwego pulpitu Windows pokazują komunikat „niedostępne w demonstracji”; kolejny zastępuje poprzedni, więc komunikaty nie zasłaniają bąbelka. „Zamknij” odtwarza animację wyjścia; w demonstracji bąbelek wraca po kliknięciu ikony OpisAI w zasobniku albo na pulpicie. Ukryty „Tryb fizyki” uruchamia się tylko z menu: przez 30 s strzałki poruszają bąbelkiem, Spacja ładuje i wybija go, a Esc kończy tryb.
- Pisownia OpisAI w podoknie opisu działa jak w rc32: to osobna warstwa OpisAI nad oknem Kliniki, o której Klinika nic nie wie. Literówka ma czerwoną linię ciągłą, nieznane słowo (np. imię wielką literą w środku zdania) bursztynowe kreski, a powtórzone słowo niebieskie kropki. Mysz przejmuje tylko pasek pod słowem: kliknięcie w litery stawia kursor w polu, lewy przycisk na pasku przypina kartę, a prawy otwiera menu pisowni OpisAI. Po 0,22 s najechania na słowo karta pokazuje rodzaj uwagi i do pięciu propozycji: pierwsza „przed → po”, propozycja obejmująca sąsiednie słowo z bursztynowym podglądem zakresu w polu. „Pomiń” działa tylko do odświeżenia strony, a „Dodaj do słownika” zapamiętuje słowo w `opisai.demo.spelling.v1`. Poprawka zamienia dokładnie wybrany fragment, potwierdza ją krótka zielona linia, a Ctrl+Z w polu ją cofa. Linie znikają, gdy OpisAI pracuje (przygotowanie, przegląd, wpis, dyktowanie, Konfiguracja) albo gdy aktywne nie jest podokno opisu.
- Pisownię obsługuje się z menu bąbelka → „Podpowiedzi pisowni”: włącznik „Podkreślaj podejrzane słowa w Klinice” (jedno ustawienie OpisAI, zapisywane razem z jego ustawieniami), „Sugestie dla aktywnej wizyty…” (lista podkreślonych słów dla klawiatury), „Cofnij ostatnią poprawkę pisowni”, „Mój słownik…” i wiersz stanu. Słownik demonstracyjny zna tylko słowa przykładowej wizyty i kilka wymyślonych literówek. Ich propozycje to wynik zapasowego słownika rc32 (Hunspell pl_PL i słownik weterynaryjny) dla tego tekstu, więc dla „Osłuchwo” pierwsza jest propozycja kontekstowa „Osłuch wona”. Polski słownik Windows, którego aplikacja używa najpierw, może podać inne propozycje.
- Po 10 s bez ruchu myszy i klawiatury bąbelek spada na pasek zadań, sprężyście się spłaszcza, odbija kilka razy z drobnymi kroplami i wraca na miejsce. Interwał i limit odbić ustawisz w Konfiguracji, na stronie Bąbelek. Domyślne położenie to prawy dolny róg pulpitu; przeciągnięty bąbelek zapamiętuje miejsce. Bąbelek, który znalazł się całkowicie poza pulpitem, wraca w prawy dolny róg. Systemowe ograniczenie ruchu wyłącza falowanie, bezwładność, wsiąkanie i odbijanie; przeciąganie staje się bezpośrednie, akcje pojawiają się bez przenikania, a korektor „REC” stoi nieruchomo.

Wszystkie funkcje dotyczą pulpitu demonstracyjnego. Przeglądarka nie zmienia konfiguracji Windows, sieci ani urządzeń na komputerze odwiedzającego. Tryb pełnoekranowy jest dostępny w Ustawieniach; część skrótów klawiaturowych może przejąć system lub przeglądarka.

## Klinika XP (makieta)

Układ, etykiety i zachowanie okna pochodzą z `kxp_mock.c` 2.4.1 z repozytorium zasobów OpisAI, odtworzonego ze zdjęć prawdziwej Kliniki XP. To niezależna rekonstrukcja do pokazania pracy z OpisAI, a nie produkt BRI ani kompletna Klinika XP. Nie zawiera grafik wydawcy; ikony są przeniesionymi 1:1 rysunkami mocka.

- Okno „Przebieg wizyty – Zwierzę domowe”: menu, pasek narzędzi (Zapisz wizytę, Na razie zatrzymaj, Anuluj), ramki NOWA WIZYTA / WŁAŚCICIEL / ZWIERZĘ, miejsce na zdjęcie, etapy wizyty 1–9 i historia wizyt pacjenta.
- Podokno opisu z trzema sekcjami i ich narzędziami (Mowa, Zredaguj, Typowe… OK, ANULUJ). Narzędzia Kliniki (także etapy 2–7) nie są odtworzone i mówią o tym po kliknięciu; działają OK i ANULUJ. Tytuł podokna ma dopisek z imieniem pacjenta i numerem wizyty, jak w mocku. Wysokość pól zmienia się przeciągnięciem separatora.
- Tryby jak w mocku: nowa wizyta, edycja, zapisana wizyta w przeglądzie tylko do odczytu i historia po anulowaniu. „Na razie zatrzymaj” chowa podokno bez zapisu; F2 je przywraca.
- F2 — opis wizyty, F4 — nowa wizyta z danymi (data, godzina, typ, lekarz, waga, temperatura), Ctrl+L — lista wizyt z filtrami i przeglądem dowolnej wizyty. W podoknie Ctrl+S zapisuje, a Esc anuluje. Skróty działają, gdy fokus jest w oknie Kliniki; inaczej Ctrl+L przejmie przeglądarka.
- Ctrl+Z cofa ostatnią zmianę w polu, jak w zwykłym polu tekstowym Windows. Wpis wykonany przez OpisAI czyści to cofanie; wpisy cofa się w OpisAI („Cofnij ostatni wpis”).
- Wpis OpisAI wymaga tego samego podokna, które było odczytane: po zamknięciu i ponownym otwarciu opisu trzeba odczytać pola od nowa.
- Pole opisu prawdziwej Kliniki ma własny słownik i rysuje cienkie czerwone zygzaki (notatka rc31). Makieta, tak jak `kxp_mock.c`, ich nie rysuje; gładkie linie pod słowami to warstwa OpisAI.
- Moduły spoza zdjęć (Leczenie, Rozliczenie, Multimedia, Apteka, Finanse…) są wyłączone albo pokazują informację, że nie są odwzorowane. Wydruki nie są generowane.

## Dane i granice demonstracji

Generowanie jest lokalnym formatowaniem przykładu, a dyktowanie odtwarza zapisaną transkrypcję. Demo nie łączy się z usługami AI, nie prosi o klucze API i nie włącza mikrofonu. Dowolny tekst wprowadzony przez użytkownika pozostaje źródłem wyniku; przykład Fistaszka nie zastępuje innej notatki.

Wizyty makiety Kliniki, dokumenty, ustawienia pulpitu i położenie bąbelka (`opisai.demo.bubble.v1`) są zapisywane w `localStorage`, pod kluczami zaczynającymi się od `opisai.demo.` (wizyty: `opisai.demo.visit.v3`; dawny klucz `opisai.demo.visit.v2` jest usuwany przy przywróceniu przykładu). Ustawienia OpisAI są zapisywane pod kluczem `opisai-demo-settings-v12`. Historia operacji OpisAI pozostaje w bieżącej karcie i jest czyszczona po odświeżeniu strony. Ustawienia → Prywatność i zabezpieczenia → Przywróć ustawienia usuwa dane demonstracji, w tym oba zestawy ustawień. Do testowania należy używać fikcyjnych danych.

## Struktura

| Pliki | Odpowiedzialność |
| --- | --- |
| `index.html` | Dokument startowy i kolejność ładowania |
| `assets/shell.js`, `assets/windows.css` | Pulpit, okna, pasek zadań i wspólne kontrolki |
| `assets/desktop-apps.js` | Ustawienia, pomoc i terminal demonstracyjny |
| `assets/files-apps.js`, `assets/files-apps.css` | Eksplorator, lokalne dokumenty, Kosz i Notatnik |
| `assets/clinic.js`, `assets/clinic.css` | Makieta Kliniki XP: przebieg wizyty, podokno opisu, przegląd tylko do odczytu, lista wizyt |
| `assets/clinic-icons.js` | Ikony makiety Kliniki przeniesione z `kxp_mock.c` |
| `assets/opisai.js`, `assets/opisai.css` | Bąbelek, przygotowanie, dyktowanie, przegląd i ustawienia OpisAI |
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

GitHub Actions wykonuje te same kontrole dla push i pull requestów. Testy okien odtwarzają regresję ponownego otwierania po przeciągnięciu. Testy bąbelka sprawdzają zachowanie z rc32: podążanie bez przeregulowania (20% odległości na takt 33 ms) i wyhamowanie ×0,82, brak odbijania od krawędzi, odkształcanie samego obrysu, gesty (przeciąganie po 180 ms, przytrzymanie po 450 ms, anulowanie), odbicie i krople zgodne z wartościami z modułów Pythona, menu 1:1 z zasobnikiem, akcje w poszczególnych stanach (także przy ograniczeniu ruchu i z klawiatury, gdy klatka animacji ma znacznik sprzed wywołania), „Anuluj” i „Pokaż” podczas startu i odbioru dyktowania, wsiąkanie w widoczne pole i geometrię maszerującej ramki, czerwony „Błąd” z dymkiem, ogłaszanie stanu, motyw menu i zapamiętywanie położenia. Harness DOM nie zastępuje oceny wyglądu w przeglądarce.

Najważniejsze ścieżki do sprawdzenia w przeglądarce:

- Przygotowanie → zmiana źródła unieważnia zatwierdzenie → opracowanie → edycja przeglądu → wpis → cofnięcie.
- Zmiana pola w Klinice w trakcie przeglądu → konflikt zatrzymuje wpis.
- Zamknięte podokno opisu (ANULUJ albo „Na razie zatrzymaj”) → kliknięcie bąbelka kończy się czerwonym „Błędem” i dymkiem „Nie znaleziono podokna opisu wizyty”, a przytrzymanie samym dymkiem „⚠ Transkrypcja”; przy zamkniętej całej Klinice dymek ma „▶ Uruchom Klinikę”, który otwiera tylko okno główne.
- OK w podoknie → przegląd tylko do odczytu → „Przejdź do edycji” (F2); Ctrl+L → przegląd innej wizyty; F4 → nowa wizyta.
- Dyktowanie → zakończenie → kontynuacja / opracowanie / wpisanie notatki.
- Minimalizowanie i przywracanie, maksymalizacja, zmiana rozmiaru, przyciąganie i menu klawiaturowe.
- Zapis i ponowne otwarcie notatki, przeniesienie do Kosza i przywrócenie.
- Zmiana motywu oraz zachowanie okien na węższym ekranie.
- Przeciągnięcie Kliniki → puszczenie bez ponownego odtwarzania animacji otwarcia.
- Przeciągnięcie bąbelka → wyhamowanie bez otwarcia okna; upuszczenie na pole → wsiąknięcie i przygotowanie wyłącznie tego pola; systemowe ograniczenie ruchu → brak bezwładności.
- 10 s bez ruchu → odbicie od paska zadań; prawy przycisk → menu jak w zasobniku → „Zamknij” → powrót z ikony w zasobniku.
- Pisownia: najechanie na „nastroszna” → karta; lewy przycisk na pasku pod „rzęzenia” → przypięta karta; prawy → menu OpisAI (Esc zamyka je, nie anulując wizyty); menu bąbelka → „Sugestie dla aktywnej wizyty…” → strzałki i Enter → zielone potwierdzenie → „Cofnij ostatnią poprawkę pisowni”; wpisane „Obserwować też Kajtusia.” → nieznane słowo, „zakażeni edróg” → propozycja kontekstowa, „brat brat” → powtórzenie; „Odrzuć” albo × w podglądzie opisu → po kliknięciu w podokno linie wracają; „Na razie zatrzymaj” → linie znikają, a F2 przywraca tę samą sesję podokna, więc „Cofnij ostatnią poprawkę pisowni” nadal działa; ANULUJ („Odrzuć zmiany”) i ponowne otwarcie podokna (nowa sesja) → cofnięcie dawnej poprawki jest odrzucane.

Testy pisowni (`tests/spelling.test.cjs`) uruchamiają prawdziwy moduł na małym DOM z przewidywalnym układem tekstu. Sprawdzają rodzaje uwag i powtórzenia z rc26, propozycje (kontekstowa przed słownikowymi), linie tylko nad aktywnym podoknem i nigdy w trakcie pracy OpisAI, częściowe zasłonięcie słowa, kartę, pasek pod słowem, menu, dokładną zamianę z cofnięciem, „Pomiń” na sesję i trwały słownik, listę dla klawiatury oraz odrzucenie cofnięcia w ponownie otwartym podoknie. Testy bąbelka sprawdzają podmenu „Podpowiedzi pisowni” i to, że linie znikają tylko przy oknach roboczych OpisAI (przygotowanie, postęp, przegląd, cofnięcie wpisu, Konfiguracja, dyktowanie), a nie przy komunikatach czy historii, i wracają po odrzuceniu podglądu.
