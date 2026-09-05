# odd-one-out

Dla każdego, kto pracuje w kodzie, którego reguł nikt nie spisał — własnym
sprzed dwóch lat albo cudzym sprzed tygodnia. Nawyki siedzą w kodzie, tyle że
nie ma ich w żadnym dokumencie i nic nie mówi, które z nich były zamierzone.

odd-one-out wyczytuje te nawyki z repozytorium i pokazuje miejsca, które je
łamią: to jedno wywołanie z pięćdziesięciu, które zapomniało zwolnić odtwarzacz,
tę jedną migrację, która odbiera uprawnienia i nigdy ich nie oddaje.
Zasada jest jedna: **N razy tak, raz inaczej.**

Klasa z tysiącem linii w projekcie, gdzie wszystkie mają tysiąc, nie odstaje.
Cztery `MediaPlayer` z `setOnError` i jeden bez — odstaje. Narzędzie nie ma
progów z sufitu; porównuje kod do reszty tego samego repozytorium.

**Nie zmienia plików.** Przy każdym zgłoszeniu pokazuje gotową poprawkę do
wklejenia.

*English version of this document: [README.md](README.md).*

## Jak wygląda jedno zgłoszenie

Każde zgłoszenie odpowiada na trzy pytania, a trzecie jest powodem, dla którego
to narzędzie istnieje: podaje poprawkę i jej nie stosuje.

```
## [1] Button#setOnMouseEntered -> Button#setStyle   sup=45/49 conf=92% odd=4

   CO JEST NIESPOJNE
     setStyle nie jest tu wolane, choc 45 z 49 miejsc wolajacych
     setOnMouseEntered na tym samym odbiorniku je wola. Te 4 nie:
     SharedButtonEffects.java:52  recv=btn  in setupHoverEffects@38
      wolania tutaj: Button#setOnMouseEntered, Button#setOnMouseExited

   JAK ZROBIONO W POZOSTALYCH MIEJSCACH
     KeyMomentCategoryStyles.java:214  recv=targetButton  in applyPreviewToButton@211
      wola oba: setOnMouseEntered oraz setStyle

   GOTOWA POPRAWKA (nie zastosowana)
     // SharedButtonEffects.java:52 — w setupHoverEffects@38, obok wolania, ktore juz tam jest:
     + btn.setStyle(...);
     // sprawdz argumenty wzgledem 45 miejsc, ktore je wolaja — regula wie,
     // ze wolania brakuje, nie wie, co mu podac
```

**CO JEST NIESPÓJNE** nazywa populację, na której stoi werdykt — 45 z 49 — więc
błędne zgłoszenie da się odrzucić w kilka sekund zamiast je badać.
**JAK ZROBIONO W POZOSTAŁYCH MIEJSCACH** wskazuje prawdziwe linie trzymające
wzorzec, bo „to odstaje" jest nic niewarte bez czegoś, do czego można porównać.
**GOTOWA POPRAWKA** to wywołanie do wklejenia, z powiedzianą wprost jedyną
rzeczą, której reguła nie wie: wie, którego wywołania brakuje i na czym, nie wie,
co mu podać. Nic nigdy nie trafia do pliku — narzędzie, które samo poprawia kod,
wymaga testów mierzących, czy pomogło, a takich nie ma.

## Instalacja

```bash
git clone <repo> && cd odd-one-out
npm install
npm start          # wypisuje pomoc
```

Trzy sposoby uruchomienia, równoważne:

```bash
npx odd-one-out java ./src/main/java            # w sklonowanym repo, bez instalowania
node bin/odd-one-out.mjs java ./src/main/java   # to samo, bez npx
npm i -g . && odd-one-out java ./src/main/java  # instaluje komendę w systemie
```

Gołe `odd-one-out` istnieje dopiero po tym ostatnim. `package.json` deklaruje
`bin`, ale zwykły klon niczego nie dokłada do PATH — dlatego ekran pomocy
drukuje `npx odd-one-out ...`.

**Dla Claude Code instalacja przez rynek wtyczek** (`.claude-plugin/marketplace.json`
— `claude plugin marketplace add <repo>`, potem `claude plugin install odd-one-out`).
**Dla pozostałych agentów skopiuj katalog `skills/`**: `SKILL.md` nie jest formatem
wyłącznie Claude Code — Cursor, Codex i Gemini CLI czytają te same katalogi.
Silnik jest zwykłą paczką npm i działa bez żadnego z nich.

> **Uwaga o nazwach.** Pomiary poniżej pochodzą z prywatnych repozytoriów
> autora. Nazwy projektów i plików z nich wzięte są zastąpione neutralnymi
> (`Screen.java`, `app.html`); numery linii, liczby, pozycje i werdykty
> prawda/fałsz są te zmierzone, bez zmian. Nazwy, które i tak są ogólne
> (`Loading.java`, `Menu.java`), zostały jak były.

## Użycie

```bash
odd-one-out java  <katalog-zrodel-java>      # pary wywołań na tym samym odbiorniku
odd-one-out deps  <katalog-zrodel-java>      # warstwa wspólna vs użycie bezpośrednie
odd-one-out sql   <katalog-migracji>         # revoke bez grant execute
odd-one-out pom   --pom <pom.xml> --tree <deptree.txt>
```

`pom` wymaga wcześniejszego `mvn -o -B dependency:tree > deptree.txt`.

### Język komunikatów

`--lang en` (domyślnie) albo `--lang pl`. Wszystkie napisy siedzą w jednym pliku
`src/lang.mjs` — klucz i dwa tłumaczenia; detektor woła `t('klucz', …)` i nie wie,
w jakim języku pisze. Rozsypanie tłumaczeń po detektorach kończy się tym, że
połowa wyniku zostaje w jednym języku, a widzi to dopiero ktoś, kto tego języka
nie zna.

**Tłumaczone są tylko etykiety i nagłówki.** Nazwy metod, typów, ścieżki,
identyfikatory zgłoszeń i nazwy reguł zostają bez zmian — to dane, nie tekst.
Zweryfikowane: ten sam zapis wyświetlony w obu językach daje **identyczne
pozycje, oceny i ścieżki**; różni się wyłącznie tekst etykiet.

### Samosprawdzanie

```bash
npm run self-check      # detektor js na własnym kodzie; kod wyjścia 1 przy nowych odstępstwach
```

**Narzędzie przechodzi własny test i nie zgłasza nic — mimo że dziewięć jego
plików samodzielnie czyta `process.argv`, a parsowanie flag ma pięć osobnych
implementacji; `deps` działa już na JavaScripcie, ale tej wady nie widzi, bo
mierzy omijanie *istniejącej* warstwy, a tu żadnej warstwy nie ma.**

To rozróżnienie jest sednem, nie wymówką. `deps` odpowiada na pytanie „N miejsc
idzie przez X, K bezpośrednio". Pięć kopii parsowania flag to inna wada:
**duplikat bez warstwy**. `via = 0`, więc regule nie ma czego porównać —
w przebiegu na własnym kodzie widać to wprost jako `operacji opakowanych=0`.
Wykrycie tego wymaga reguły szukającej powtórzonego kodu, a nie odstępstwa od
konwencji; to inne narzędzie.

Port `deps` na gramatykę JS/TS jest **sprawdzony i działa** — na próbce
kontrolnej (pięć modułów przez `safeio.mjs`, jeden wprost do `fs.readFileSync`)
zgłasza rozjazd poprawnie. Jedno ograniczenie zmierzone przy okazji:

- **Reguła cienkiego opakowania słabo przenosi się na JavaScript.** Wymaga, by
  nazwa opakowania zawierała nazwę operacji — `movePathWithRetry` ⊃ `move`
  działa, ale `readFileWithRetry` ⊅ `readFileSync` już nie. Nazwy API Node są
  długimi złożeniami, więc warunek rzadko bywa spełniony. Ta sama próbka
  kontrolna przechodzi dopiero po przemianowaniu opakowania na
  `readFileSyncWithRetry`.

Zero zgłoszeń przy samosprawdzaniu jest więc miarą zasięgu reguł, nie jakości
kodu — i teraz wiadomo dokładnie, której reguły brakuje.

## Detektor js — JavaScript i TypeScript

Jedna gramatyka (`tree-sitter-typescript`) na oba języki: TypeScript jest
nadzbiorem JavaScriptu. Sprawdzone na materiale — **40 plików `.js` i 10 `.ts`,
zero błędów parsowania**. Skrypty inline wycinane są z HTML-a, z zachowaniem
przesunięcia linii, więc numery w raporcie wskazują linię w HTML-u.

Reguła `sierota`: nazwa wołana jak funkcja, **której strona nie zna**. Strona zna
własne definicje ze swoich skryptów inline, globalne z ładowanych plików
`<script src>` oraz wbudowane przeglądarki i języka. **To nie jest reguła
z listy dobrych praktyk** — wynik zależy od tego, które pliki dana strona
ładuje, więc bez wiedzy o projekcie nie da się jej postawić.

| rewizja | stron | zgłoszeń | prawdziwych | trafność |
|---|---|---|---|---|
| przed naprawą (`c45f7a6^`) | 88 | **1** | 1 | **100%** |
| bieżąca | 88 | 0 | — | kontrola negatywna |

Znaleziona sierota to `closeAiReqLightbox` w `app.html:9464` —
dokładnie ta linia, którą usunął commit `c45f7a6`.

Pierwszy przebieg dał 5 zgłoszeń, z czego 4 fałszywe. Przyczyna była w moim
wycinaniu skryptów: słowo `<script>` napisane **w komentarzu HTML** brałem za
otwarcie bloku i parowałem z zamknięciem sto linii dalej, przez co CSS i proza
trafiały do parsera jako JavaScript. Komentarze są teraz wygaszane przed
szukaniem `<script>`, ze spacjami zamiast treści, żeby nie rozjechać numeracji.

## Wyciszanie

Bez tego przy trzecim uruchomieniu człowiek przewija te same zgłoszenia
i przestaje uruchamiać narzędzie. Dwie drogi, obie działają równocześnie.

**Komentarz w kodzie** — decyzja stoi tam, gdzie zapadła, i wędruje razem
z kodem przez przenosiny i scalenia:

```java
closeAiReqLightbox();   // odd-one-out: ok — celowo, funkcja wraca w następnym wydaniu
```

Szukany jest w linii zgłoszenia i w linii powyżej, więc obie formy są naturalne.
Powód po myślniku trafia do raportu, żeby dało się przejrzeć, co zostało
wyciszone i dlaczego.

**Plik `.odd-one-out.json`** — do decyzji zbiorczych, po `unitId` (całe miejsce)
albo `id` (pojedyncza reguła); patrz [Wykluczenia i wyciszenia](#wykluczenia-i-wyciszenia).

Wyciszenie **nie usuwa miejsca z populacji** — znika tylko z raportu, więc nie
osłabia reguły, która je złapała.

## Różnica między uruchomieniami — domyślna

Pytanie brzmi nie „co jest nie tak", tylko **„co jest nie tak od ostatniego
razu"**. Dlatego różnica jest zachowaniem domyślnym, a nie osobnym poleceniem:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # 1. raz: pełna lista
# ...praca nad kodem...
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # 2. raz: tylko nowe
odd-one-out java ./src/main/java --json .odd-one-out/java.json --all   # cała lista
```

Gdy plik wskazany przez `--json` już istnieje, jest czytany jako poprzedni
przebieg, a raport pokazuje **tylko nowe i zmienione** zgłoszenia. Nagłówek
podaje pełny bilans:

```
roznica wobec poprzedniego przebiegu: NOWE=0  ZNIKNELO=0  ZMIENIONE=0  bez zmian=12
```

`--all` przywraca pełną listę. Osobne polecenie `odd-one-out diff <a> <b>`
zostaje do porównywania dwóch dowolnych zapisów.

## Kod wyjścia

`0` — brak nowych odstępstw. `1` — są nowe. Dotyczy każdego detektora, nie tylko
polecenia `diff`, więc nadaje się wprost do CI:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json || echo "nowe odstępstwa"
```

Przy pierwszym uruchomieniu (brak zapisu) wszystkie zgłoszenia są nowe, więc kod
to `1`. Przy kolejnym bez zmian w kodzie — `0`. Błąd użycia (zła ścieżka, brak
argumentu) kończy się kodem `2`.

### Szczegóły różnicy

Wyjście dzieli się na **NOWE**, **ZNIKNĘŁO**, **ZMIENIONE** (to samo miejsce,
inna siła dowodu — np. `sup: 8 -> 9, conf: 0.8 -> 0.9, viol: 2 -> 1`) i bez
zmian.

**Odcisk zgłoszenia nie zawiera numeru linii.** To jedyna decyzja, która tu
naprawdę waży: numery przesuwają się przy każdej niezwiązanej edycji, więc
gdyby wchodziły do odcisku, dopisanie importu na górze pliku kasowałoby
wszystkie stare zgłoszenia i wystawiało je jako nowe. Odcisk stoi na tożsamości
semantycznej: detektor + reguła + plik + kotwica.

Zmierzone: przesunięcie całego pliku o trzy linie i naprawa jednego z dwóch
odstępstw dały `ZNIKNĘŁO=1`, `bez zmian=8` — żadnego fałszywego „nowego"
z powodu przesuniętych linii.

Dwie rzeczy, o których trzeba wiedzieć:

- **Naprawa jednego odstępstwa potrafi wygenerować nowe.** W demie dodanie
  `setOnError` usunęło jedno zgłoszenie i utworzyło trzy — bo to miejsce ma
  teraz `setOnError`, ale nie ma `setCycleCount`, `setOnHalted` ani
  `setOnEndOfMedia`. To nie usterka, tylko własność miningu: naprawa zmienia
  populację, do której wszystko jest porównywane.
- **Przeniesienie klasy do innego pakietu** zmienia ścieżkę, więc zgłoszenie
  wyjdzie jako `NOWE` + `ZNIKNĘŁO`. Świadomy kompromis — odcisk bez ścieżki
  zlewałby ze sobą różne miejsca.

## Pary czystych akcesorów — odsiewane, włączone domyślnie

Kopanie reguł nie wie, co metoda robi, więc `getName` obok `getBirthDate`
wyglądało dokładnie jak `stop` obok `dispose`. Przeczytanie jednego pola bez
drugiego nie jest wadą; niezwolnienie odtwarzacza jest.

Reguła wypada tylko wtedy, gdy OBIE strony są czystym czytaniem. `hasNext ->
next` i `getInputStream -> close` zostają: czytanie w parze z czymś, co działa,
to właśnie kształt wart zgłoszenia.

Na własnym kodzie tego nie było widać, na cudzym rzucało się w oczy — i po to
właśnie zestaw regresyjny chodzi po trzech obcych projektach:

| projekt | przed | po | usunięte |
|---|---|---|---|
| spring-petclinic (adnotacje, głównie czytanie) | 7 | 2 | 71% |
| JSON-java (mały, zwykły) | 31 | 17 | 45% |
| netty/common (niskopoziomowy) | 100 | 79 | 21% |
| projekt autora (pełen zmian stanu) | 462 | 387 | 16% |

Nic prawdziwego nie przepadło. Pięć znanych odpowiedzi nadal przechodzi, czwórka
na czele rankingu bez zmian, a jedyny wpis, który wypadł z piątki, to
`MediaView#getFitHeight -> getFitWidth` w metodzie `zoomBaseH()` — czytanie
wysokości bez szerokości w metodzie, która z definicji liczy wysokość.
`--accessors keep` przywraca stare zachowanie.

**Reguły A→B i B→A są zgłaszane obie i tak ma być.** Wygląda to na duplikat,
a nie jest: „ma A, nie ma B" i „ma B, nie ma A" to dwa różne miejsca. Zmierzone
na wszystkich czterech projektach: miejsc zgłoszonych dwa razy dla tej samej
pary jest **zero** — w netty `error -> info` wskazuje linię 89, a `info ->
error` linię 79.

## Odsiewanie „setter obok settera" — włączone domyślnie

Mechaniczne współwystąpienia wywołań konfiguracyjnych zajmowały pierwsze
dwanaście pozycji rankingu: `setMinHeight -> setMinWidth`,
`initModality -> initOwner`, `setCycleCount -> play`. Kolejność i komplet są tam
przypadkowe, a brak jednego z nich nie jest błędem.

Trzy sygnały, każdy włączany osobno (`--odsiej 1`, `--odsiej 1,3`,
`--odsiej none`):

1. **obie strony to zwykłe settery** — `set[A-Z]`, ale **nie** `setOn[A-Z]`;
2. **odbiornik powstał w tej samej jednostce** (`new X()` obok);
3. **obie ustawiają stan** — żadna nie jest zdarzeniowa ani czynnością cyklu
   życia (`play`, `stop`, `dispose`, `close`, …).

Granica jest tu istotna: `setOnError` zaczyna się od `set`, ale **podpina obsługę
zdarzenia**, a nie ustawia wartość, więc nie jest setterem dla żadnego z sygnałów.

| sygnał | zgłoszeń (odkrywanie, projekt autora) | pozycja `Loading.java:397` |
|---|---|---|
| brak | 1086 | 88 z 99 |
| 1 | 645 | 56 |
| 2 | 708 | 70 |
| 3 | 628 | 55 |
| **1,2,3** | **462** | **47 z 99** |

Na cudzym kodzie (netty/common, 204 pliki) odsiewanie zdejmuje **101 → 100** —
czyli praktycznie nic. Ten kod nie ma masowej konfiguracji setterami, którą
sygnały 1 i 3 mają wycinać.

> **Wcześniejsza wersja tej tabeli podawała 161 zgłoszeń i pozycję 13 z 30.**
> Te liczby mierzyły **zepsuty sygnał 3**, który definiował „ustawia stan" przez
> negację i ukrywał około trzystu poprawnych zgłoszeń, a na cudzym kodzie wycinał
> całą treść raportu. Po naprawie poprawa jest realna, ale znacznie skromniejsza:
> z pozycji 88 na 47, a nie na 13.

**Żaden sygnał nie zabrał ani jednej znanej odpowiedzi.**
`MediaPlayer#dispose -> MediaPlayer#setOnError`, `Loading.java:397`, `:411`,
`Menu.java:5753/5754` przeżywają wszystkie trzy i ich złożenie.

W trybie zawężonym `--only setOnError`: **14 → 12 zgłoszeń**; ranking skrócił się do 7 pozycji, a wszystkie cztery znane odpowiedzi weszły do pierwszej piątki.
Usunięte to `Menu.java:2690` i `Preview.java:498` — oba wcześniej ocenione jako
fałszywe, oba złapane sygnałem 2 (kompletna konfiguracja świeżo utworzonego
`MediaPlayer`).

Osobna słabość raportu, widoczna przy odkrywaniu: **nagłówek scalonej pozycji
wybierany jest po ocenie**, więc regułą wiodącą bywa szumowa (`dispose ->
getStatus`), a prawdziwa (`dispose -> setOnError`) ląduje w liście „także".

## Odkrywanie par — zmierzone, szum zalewa wynik

Detektor `java` **domyślnie odkrywa pary sam**: dla każdego typu odbiornika
zbiera wszystkie wołane na nim metody i liczy każdą parę. `--only <nazwy>` jest
filtrem zawężającym do wybranej rodziny, nie warunkiem działania.

| próg | reguł | zgłoszeń | pozycji w rankingu | czas |
|---|---|---|---|---|
| `--minsup 5` | 327 | **711** | 99 | 2,1 s |
| `--minsup 3` (domyślny) | 615 | 1086 | — | 2,1 s |

**Koszt nie jest problemem** — 2,1 sekundy na 11 581 jednostkach. Obawa
o dziesiątki tysięcy par się nie potwierdziła.

**Szum jest problemem.** Pierwsze dwanaście pozycji rankingu to w całości
mechaniczne współwystąpienia setterów JavaFX:

```
 1. [97] Button#setMinHeight -> Button#setMinWidth     konwencja=97% populacja=36
 2. [97] Stage#getIcons      -> Stage#setScene         konwencja=97% populacja=28
 5. [96] Timeline#setCycleCount -> Timeline#play
 7. [96] Stage#initModality  -> Stage#initOwner
```

Zweryfikowane trafienia `Loading.java:397` i `:411` lądują na pozycjach
**73 i 74 ze 99**. Trafność w pierwszej dziesiątce: **0%**. Pozycja 1 ma przy
sobie 36 innych naruszonych reguł — jako zgłoszenie dla człowieka to nie jest
czytelne.

Progów **nie dostrajałem** pod ten pomiar. Wniosek jest inny: odkrywanie par
jest dobre do **znalezienia rodzin reguł**, których się nie znało (327 par
z typem odbiornika to materiał do przejrzenia), a nie do czytania zgłoszeń.
Do przeglądu zawężaj `--only`.

### Znana para przy progu 5 znika

`MediaPlayer#dispose -> MediaPlayer#setOnError` **nie znajduje się** wśród
odkrytych przy `--minsup 5` — jej wsparcie wynosi 3. Pojawia się dopiero przy
domyślnym `--minsup 3` i wskazuje wtedy `Menu.java:5754` oraz `Loading.java:974`.
Przy progu 5 znikają też oba prawdziwe zgłoszenia z `Menu.java`.

Innymi słowy: próg pięciu wystąpień, choć brzmi ostrożniej, **kosztuje jedno
z czterech znanych prawdziwych trafień**. Domyślny próg pozostaje 3.

## Typ odbiornika i aliasy

Dwie próby podniesienia trafności detektora `java`, obie zmierzone na tym samym
zbiorze (111 plików, reguła `setOn*`, zasięg `lambda`):

| wariant | zgłoszeń | prawdziwych | trafność | `Loading.java:397/411` |
|---|---|---|---|---|
| baza | 15 | 3 | 20% | poz. 3 / 4 |
| **+ typ odbiornika** | 14 | **4** | **29%** | poz. 4 / 5 |
| + typ + aliasy | 14 | 3 | 21% | poz. 4 / 5 |

**Typ odbiornika — zostaje włączony** (`--typy off` wyłącza). Bez niego
`mediaControl.setOnEndOfMedia()` (klasa projektu, metoda bezargumentowa)
i `mediaPlayer.setOnEndOfMedia(Runnable)` liczą się jako ta sama pozycja.
Usunęło dokładnie te dwa fałszywe alarmy i wypromowało prawdziwe zgłoszenie
`Menu.java:5753` z pozycji 10 na 3.

Rozpoznawanie typu ma dwa źródła: deklaracje w pliku oraz mapę
**wyrażenie → typ** zbieraną z całego projektu (`MediaPlayer player =
mediaView.getMediaPlayer();` uczy, że to wyrażenie ma typ `MediaPlayer`).
Drugie źródło jest konieczne — bez niego odbiorniki będące wywołaniem metody
zostają nierozpoznane i wypadają z populacji **razem z prawdziwymi
odstępstwami**.

**Aliasy — zmierzone, pogarszają wynik, domyślnie wyłączone** (`--aliasy on`
włącza). Idea jest słuszna: `final MediaPlayer toDispose = player;` to ten sam
obiekt. Poprawka usuwa dokładnie ten fałszywy alarm, dla którego powstała
(`Loading.java:974`), ale przypisanie wywołań do jednostki deklaracji scala też
wywołania niezwiązane i tworzy nowe reguły na metodach zapytujących
(`setOnError -> getStatus`). Bilans: −1 fałszywy alarm, +2 nowe.

## Zasięg pary

Jak blisko siebie muszą stać dwa wywołania, żeby liczyć się jako para.
`--scope file|method|lambda` (domyślnie `lambda`).

| zasięg | jednostka | zgłoszeń | prawdziwych | trafność |
|---|---|---|---|---|
| `file` | plik + odbiornik | **9** | 2 | **22%** |
| `method` | metoda/konstruktor + odbiornik | 14 | 1 | 7% |
| `lambda` | najgłębsza funkcja + odbiornik | 15 | 2 (w 3 zgłoszeniach) | 20% |

Zmierzone na 111 plikach, regule `setOn*`. „Prawdziwe" = defekty, które prześledziłem
w kodzie: brak zwolnienia playera w `Loading` (dwa miejsca) i `dispose()` bez
zerowania handlerów w `Menu`.

> Ta tabela pochodzi **sprzed** wprowadzenia typu odbiornika — jest punktem
> wyjścia, nie stanem bieżącym. Domyślny zasięg `lambda` daje dziś 29%, a nie
> 20%. Porównanie trzech zasięgów między sobą pozostaje ważne, bo wszystkie
> trzy zmierzono na tej samej wersji.

**Zwężanie zasięgu nie poprawia trafności — poprawia ją poszerzanie.** Fałszywe
alarmy tej klasy biorą się stąd, że obsługa stoi o poziom wyżej niż wywołanie;
wąski zasięg tego nie widzi i zgłasza brak. Zasięg `file` znajduje **te same
defekty przy 40% mniejszej liczbie zgłoszeń**. Zasięg `method` jest najgorszy:
gubi `Menu.java:5754` całkowicie, bo reguła `dispose->setOnError` traci przy tym
podziale wsparcie.

Domyślny zasięg został przy `lambda` — różnica 22% vs 20% na jednym projekcie
i jednej rodzinie reguł to za cienki dowód, żeby zmieniać zachowanie. Do
przeglądu warto uruchomić `--scope file`.

## Stabilność wzorca — czwarty składnik oceny, domyślnie wyłączony

`odd-one-out rank ... --stabilnosc`

Wzorzec obecny w **każdym** podzbiorze populacji jest pewniejszy niż taki, który
powstaje dopiero z całości — ten drugi często oznacza regułę zlepioną z kilku
niezależnych zwyczajów panujących w różnych częściach projektu.

Populacja dzielona jest na cztery podzbiory **po pliku** (klasa nie rozjeżdża
się między podzbiory), a reguła liczona w każdym osobno oraz narastająco na
prefiksach. `stab` to średnia z obu udziałów.

**To jest sprawdzenie, nie zmiana populacji.** Reguły są wydobywane z całego
zbioru; podzbiory służą wyłącznie do policzenia, jak równo wzorzec się rozkłada.
Dzielenie populacji, na której *pracuje* detektor, pogarsza wynik — zmierzone
przy zasięgu `method` (7%).

Zmierzone:

| pozycja | bez `--stabilnosc` | z `--stabilnosc` | `stab` |
|---|---|---|---|
| `Screen.java:1496` (szum) | 1 | **1** | 1,00 |
| `Screen.java:9861` (szum) | 2 | **2** | 1,00 |
| `Menu.java:5753` (prawdziwe) | 3 | **5** | 0,71 |
| `Loading.java:397` (zweryfikowane) | 4 | **3** | 0,83 |
| `Loading.java:411` (zweryfikowane) | 5 | **4** | 0,83 |

**Pozycja zweryfikowanych trafień drgnęła — w górę o jedno miejsce.** Ale ruch
nie jest poprawą: awans wziął się stąd, że w dół spadło **inne prawdziwe
zgłoszenie** (`Menu.java:5753`), a dwa fałszywe alarmy z czoła listy są na ten
składnik odporne — ich reguły są idealnie stabilne (1,00). Liczba prawdziwych
zgłoszeń w pierwszej trójce i piątce nie zmieniła się wcale.

Dlatego **zostaje wyłączone domyślnie**: ruch w rankingu to nie to samo co
poprawa rankingu. Składnik jest poprawny i tani — warto spróbować w projekcie,
gdzie reguły nie są tak jednorodnie stabilne jak tutaj.

## Wywołania HTTP bez timeoutu — zmierzone, przesłanka nie trzyma

Detektor Pythona miał dostać regułę, która wygląda oczywiście: `requests.get`
bez `timeout=` może wisieć w nieskończoność, więc jeśli dziesięć wywołań
w projekcie ma timeout, a jedno nie ma, to jedno jest podejrzane.

Przesłankę zmierzyłem, zanim reguła powstała, na czterech prawdziwych projektach:

| projekt | wywołań HTTP | z timeoutem |
|---|---|---|
| redash | 43 | **1** |
| prefect | 38 | **1** |
| certbot | 5 | 1 |
| sherlock | 4 | 4 |

W redash i prefekcie konwencją jest **brak** timeoutu. Reguła „dziesięć ma,
jedno nie ma" nie ma się tam czego uchwycić — a czytana dosłownie zgłosiłaby
jako odstępstwo to jedno wywołanie, które timeout MA. W sherlocku wszystkie
cztery go mają i nie ma czego znajdować.

Reguła nie powstała. Jako sprawdzenie uniwersalne („każde wywołanie HTTP musi
mieć timeout") byłaby zupełnie dobrą regułą lintera i są lintery, które to
robią — ale nie jest zdaniem o konwencji TEGO projektu, a tylko takie zdania
to narzędzie wypowiada.

## Odłożone — i czego każdemu brakuje

Wszystko, co nie jest zbudowane, leży tutaj, w jednym miejscu, z konkretną
rzeczą, która by je odblokowała. Żadna z nich nie jest obietnicą; dwie są
pomysłami, a jedna jest luką w pomiarze.

### Detektor Pythona — napisany, zmierzony, niewydany

Model z Javy został przeniesiony na Pythona: te same jednostki, to samo
wydobywanie reguł, te same progi. Trudny jest odbiornik — Python nie deklaruje
typów, więc „ten sam obiekt" rozpoznaje się po nazwie zmiennej w zasięgu
funkcji, ze znacznikiem z konstruktora (`sock = socket.socket(...)` znaczy
`sock` jako socket), z listy importów dla odbiorników modułowych albo z klauzuli
`with ... as`. Co przy tym przepada, jest wypisane: obiekt przychodzący
parametrem, czytany z pola albo rozpakowany z indeksu wpada do `?`, tam gdzie
w Javie byłaby deklaracja do przeczytania.

**Detektor działa.** Na siedmiu prawdziwych projektach, przy progach domyślnych,
bez żadnego strojenia:

| projekt | plików .py | jednostek | reguł, które przeszły | naruszeń |
|---|---|---|---|---|
| django | 2930 | 68 971 | 552 | 931 |
| prefect | 1819 | 54 341 | 336 | 596 |
| scrapy | 487 | 8 628 | 72 | 128 |
| celery | 423 | 13 526 | 71 | 139 |
| paramiko | 70 | 2 869 | 71 | 126 |
| urllib3 | 81 | 3 447 | 39 | 57 |
| certbot | 33 | 920 | 6 | 10 |

Reguły czytają się sensownie — `Signal#connect -> Signal#disconnect` w celery,
`ExecutionEngine#open_spider_async -> close_spider_async` w scrapy,
`HTTPConnection#request -> HTTPConnection#getresponse` w urllib3 przy 19 na 22.
Model ma w Pythonie materiał i to nigdy nie było pytaniem.

**NIE JEST WYDANY, BO NIE MA ZNANEJ ODPOWIEDZI.** Każdy detektor tutaj zasługuje
na swoje miejsce tym, że wskazuje defekt, który ktoś naprawdę naprawił,
sprawdzony na rewizji sprzed naprawy (patrz `test/known-answers.mjs`). Python
takiej nie ma. Dwie próby znalezienia jej ręcznie padły z powodów wartych
zapisania: w docker-py jedyne `requests.get` bez timeoutu było JEDYNYM
wywołaniem HTTP w repozytorium — brak populacji, więc nie ma konwencji, od której
można odstawać; w streamlink i urllib3 zasób, którego zamknięcie dopisano, nigdy
nie był odbiornikiem w naprawianej funkcji, więc model par nie miał czego parować.

Wtedy kolejność została odwrócona: zamiast szukać naprawy i pytać, czy narzędzie
ją widzi, puścić narzędzie na rewizji z 2022 i zapytać, czy cokolwiek z tego, co
zgłosiło, zostało później poprawione.

| repozytorium | naruszeń w 2022 | naprawionych | nadal narusza | zniknęło z kodem | commitów od tamtej pory |
|---|---|---|---|---|---|
| urllib3 | 37 | **0** | 20 | 15 | 656 |
| paramiko | 137 | **0** | 107 | 30 | 368 |
| docker-py | 86 | **0** | 86 | 0 | 245 |
| **razem** | **260** | **0** | **213** | 45 | |

**213 z 260 naruszeń przeżyło trzy lata i 1269 commitów nietkniętych.** To jest
uczciwa miara tego, co ta klasa narzędzi zgłasza: w większości nie defekty.
Własne 18,1% PR-Minera mówi to samo jedną liczbą.

Jeden przypis o metodzie, bo o mało nie poszło inaczej. Pierwszy przebieg
sprawdzianu zgłosił dwa naruszenia urllib3 jako naprawione. Nie były: sprawdzian
dopasowywał miejsca po trójce (plik, nazwa funkcji, odbiornik), a w tym pliku są
CZTERY funkcje o nazwie `socket_handler` i tylko jedna woła brakującą metodę —
przy czym wołała ją już w 2022. Commit, który ruszył tamtą okolicę,
`d560e21d "Consume connections better in socket-level tests"`, to infrastruktura
testów, nie naprawa defektu. Przyrząd pomiarowy, który zgadza się z hipotezą, to
pierwsza rzecz, której nie należy ufać.

### Detektor szwów — pomysł, nie pomiar

Ta sama zasada przyłożona do testowalności. Nie „wstrzykuj zależności" — to
reguła uniwersalna, a takich to narzędzie nie stawia. Raczej: **piętnaście klas
dostaje zależność z góry, ta jedna tworzy ją sama.**

Czego by szukał — każde to brakujący szew w miejscu, w którym reszta projektu
go ma:

- konstruktor wołany wprost wewnątrz metody, gdzie indziej obiekt przychodzi
  z zewnątrz
- wywołanie statyczne tam, gdzie reszta kodu trzyma pole
- zegar albo system plików sięgnięty ze środka logiki
- singleton czytany z wnętrza funkcji zamiast podany

**Brakuje znanej odpowiedzi.** Każdy detektor, który tu jedzie, wskazuje defekt,
który ktoś naprawdę naprawił, sprawdzony na rewizji sprzed naprawy. Ten nie ma
żadnej, więc jest hipotezą, a nie detektorem.

Python jest pomiarem tego, ile taki brak kosztuje. Detektor został napisany,
przeszedł progi na siedmiu projektach, a w trzech repozytoriach z pełną historią
zgłosił 260 naruszeń, z których **ani jedno nie zostało przez nikogo
poprawione**. Bez znanej odpowiedzi nie da się odróżnić detektora, który działa,
od takiego, który tylko coś wypisuje — a wypisują tak samo.

### Mutacje poza src/snapshot.mjs

`npm run full` uruchamia Strykera. **Zmierzony jest dokładnie jeden plik:**
`src/snapshot.mjs` — 316 mutantów, **216 przeżyło**. To wynik 31,65% przy
czterech zestawach jako sędzim i 23,42% przy samych testach złotych. Każdy inny
plik w `src/` jest niezmierzony, więc o nich nie wiadomo nic.

**Podejrzenie, nie ustalenie:** większość ocalałych wygląda, jakby siedziała
w wypisywanym tekście, a nie w logice — `t('settings')` zamienione na `t("")`
przechodzi, bo testy złote porównują zapis JSON, a nie ekran. To jest odczyt
listy ocalałych, nie pomiar. Nikt ich nie sklasyfikował i dopóki tego nie zrobi,
zostaje domysłem.

Powód, dla którego kończy się na jednym pliku, to koszt: ten jeden zajął
**118 minut**. Całe `src/` to byłby prawie cały dzień i dlatego mutacje siedzą
za `npm run full`, a nie w `npm test`.
## Ranking wedle formuły JADET — zmierzony, pogorszył

Ranking premiuje liczebność i to jest prawdziwa słabość: trzy zweryfikowane
defekty stały na pozycjach 34, 41 i 42 ze 167, wszystkie z identyczną oceną 32.
Identyczna ocena to nie ranking, tylko lista.

JADET (Wasylkowski, Zeller, Lindig, 2007) ocenia naruszenie jako **u × s / v** —
unikalność wzorca razy wsparcie, przez liczbę naruszeń — i wymaga, by odstępstwo
było co najmniej dziesięć razy rzadsze niż wzorzec. Zostało to zasymulowane na
tych samych zapisach, zanim tknąłem linijkę narzędzia.

| znana odpowiedź | obecna | u × s / v | u × s / v + wymóg 10× |
|---|---|---|---|
| `closeAiReqLightbox` (js) | **1** | **1** | **1** |
| `release_rate_slot` (sql) | **5** | 6 | 6 |
| `io.thorntail:javafx` (pom) | **8** | 18 | **wypadła** |
| `Menu.java:5753/5754` (java) | **34** | 47 | **wypadła** |
| `Loading.java:397` (java) | **41** | 61 | **wypadła** |
| `Loading.java:411` (java) | **42** | 62 | **wypadła** |

**Każda pozycja, na której zależało, pogorszyła się.** Trzy odpowiedzi z `java` —
te zakopane za głęboko, żeby ktokolwiek doczytał, czyli cały powód tej próby —
spadły z 34/41/42 na 47/61/62. Lista skurczyła się ze 167 pozycji do 13 przy
wymogu 10×, a wśród skasowanych znalazły się cztery z pięciu znanych odpowiedzi.

Przyczyna jest arytmetyczna, nie implementacyjna. `u × s / v` premiuje
**wsparcie**, a tutaj prawdziwe defekty stoją na małych populacjach:
`Menu.java:5754` na wzorcu trzymanym 4 razy, `Loading.java:397` na trzymanym 8
razy. Szum stoi na dużych — `Button#setOnMouseEntered -> setStyle` jest trzymany
45 razy na 49. Obecna formuła ogranicza nagrodę za liczebność do dziesięciu
przykładów (`min(1, sup/10)`) i właśnie ten limit nie pozwala zakopać defektów
o małej populacji. Surowe `s` z JADET-a go znosi.

Wymóg 10× zawodzi z tego samego powodu, tylko mocniej: 29 z 31 zgłoszeń stojących
za pięcioma znanymi odpowiedziami ma liczbę naruszeń większą niż jedna dziesiąta
wsparcia. Z sześciu miejsc przechodzą dwa. Ta reguła powstała dla zbioru tysięcy
projektów, gdzie wzorzec jest trzymany setki razy; tutaj cała populacja reguły to
4 do 15 miejsc, bo to jedna aplikacja desktopowa.

**Nieprzyjęte.** W `src/` nie zmieniło się nic — symulacja wystarczyła do decyzji,
a pomiar kosztował mniej niż kosztowałaby zmiana.

Liczby wskazują natomiast na co innego: scalanie zachowuje **najwyższą** ocenę
spośród reguł naruszonych w danym miejscu, więc miejsce naruszające 36 reguł ma
trzydzieści sześć losowań o wysoką ocenę, a naruszające jedną — jedno. To jest
strukturalna przewaga mechanicznego współwystępowania i to jest następna rzecz
warta zmierzenia — ale to inny pomysł i nie został jeszcze zmierzony.

## Wiek odstępstwa — zmierzony, nie pomógł, domyślnie wyłączony

`odd-one-out rank ... --wiek <katalog-repo>`

Sygnał: odstępstwo nowsze niż linie zgodne z wzorcem jest podejrzane —
najstarsze jest zwykle oryginałem, od którego reszta odeszła świadomie.
Działa **wyłącznie jako podbicie oceny** (×1,3); nic nie jest na tej podstawie
usuwane ani obniżane.

Zmierzone na tym samym zbiorze:

| | bez wieku | z wiekiem |
|---|---|---|
| pozycja `Loading.java:397` (zweryfikowane) | 3 | **3** |
| pozycja `Loading.java:411` (zweryfikowane) | 4 | **4** |
| pozycja `Screen.java:9861` (szum) | 2 | **1** |

**Nie ruszyło prawdziwych trafień, a wypromowało jedno fałszywe.** Przyczyna
jest ta sama, przed którą ostrzega zastrzeżenie o `git blame`, tylko w wersji
skrajnej: repozytorium ma 235 commitów, ale **wszystkie 1116 linii
`Loading.java` noszą datę jednego commitu importującego projekt**. Wiek mierzy
wtedy moment wrzucenia kodu do gita, a nie moment jego napisania — prawdziwe
odstępstwa mają dokładnie tę samą datę co wzorzec i nie dostają podbicia, a
przypadkowo dotknięte później linie dostają.

Dlatego `--wiek` **zostaje wyłączone domyślnie**. Ma szansę działać w repozytorium
z ciągłą historią, gdzie kod powstawał w gicie od początku — tu nie działa i nie
udaję, że działa.

## Wykluczenia i wyciszenia

Dwie **różne** rzeczy, celowo rozdzielone:

- **`exclude`** — czego nie czytać. Wpływa na populację, więc zmienia też
  wzorzec: wykluczenie testów potrafi podnieść albo obniżyć konwencję.
- **`mute`** — czego nie pokazywać. Miejsce jest czytane i **liczy się do
  populacji**, znika tylko z raportu i rankingu.

Pomylenie ich psuje wynik po cichu: wyciszenie zrobione jako wykluczenie usuwa
miejsce z populacji i osłabia regułę, która je złapała.

Plik `.odd-one-out.json` w badanym katalogu albo `--config <ścieżka>`:

```json
{
  "exclude": ["**/legacy/**", "**/*Generated.java"],
  "mute": [
    { "id": "f7946d7a0259", "powod": "setCycleCount to konfiguracja, nie obsługa błędu" }
  ]
}
```

Domyślna lista wykluczeń (`build`, `target`, `out`, `dist`, `node_modules`,
`.git`, `.idea`, `generated`, `coverage`, `*Test.java`, `*Tests.java`,
`*IT.java`) działa bez konfiguracji; `"excludeDefaults": false` ją zastępuje
zamiast dokładać. Identyfikatory do `mute` bierze się z pliku zapisu (`--json`).

## Ranking — co czytać pierwsze

Cztery detektory dają cztery listy w czterech skalach. `rank` sprowadza je do
jednej liczby:

```bash
odd-one-out rank .odd-one-out/java.json .odd-one-out/sql.json --top 20
```

`ocena = 100 × konwencja × populacja × rzadkość` — **iloczyn, nie suma**:
zgłoszenie ma być wysoko tylko wtedy, gdy wszystkie trzy składniki są wysokie.
Silna konwencja na trzech przykładach nic nie znaczy, tak samo jak duża
populacja przy połowie miejsc odstających. Suma pozwoliłaby jednemu wysokiemu
składnikowi przykryć zerowy; iloczyn nie.

Skala jest porządkowa. `94` nie znaczy „94% szans, że to błąd", tylko „czytaj
to przed zgłoszeniem o 32".

Stany `MIGRACJA W TOKU`, `ZA MAŁO DANYCH` i `DO SPRAWDZENIA` nie wchodzą do
rankingu w ogóle. Zgłoszenia z tego samego miejsca są scalane w jedną pozycję —
to jedna decyzja dla człowieka — a pozostałe naruszone reguły idą obok jako
uzasadnienie.

## Jak czytać wynik

```
## [2] setOnReady -> setOnError   sup=8/10 conf=80% odd=2
```

10 miejsc woła `setOnReady`, 8 z nich woła też `setOnError`, 2 odstają.
**`odd=1` przy wysokim `sup` to najmocniejszy sygnał**; `odd` bliskie połowie
`sup` znaczy, że konwencji nie ma.

Każde zgłoszenie ma trzy sekcje: co jest niespójne, jak zrobiono w pozostałych
miejscach (z przykładem i ścieżką), gotowa poprawka.

### Stany, których nie wolno wziąć za zgłoszenie

- **ROZJAZD** — warstwa jest konwencją, kilka miejsc ją omija. Jedyny stan,
  który jest zgłoszeniem.
- **MIGRACJA W TOKU** — obie drogi są liczne. Nie ma czego nazwać odstępstwem;
  to niedokończone przejście, nie błąd do naprawienia w jednym miejscu.
- **ZA MAŁO DANYCH** — za mało wystąpień, by mówić o konwencji.

Detektor `pom` dzieli podobnie: **MARTWY** (nieobecny w drzewie i nigdzie
niezadeklarowany — dwaj niezależni świadkowie) wobec **DO SPRAWDZENIA**
(nieobecny w drzewie, ale zadeklarowany — zwykle drzewo z innej rewizji).

Pusty wynik jest poprawnym wynikiem.

## Liczby, nie przymiotniki

Trafność referencyjna tej klasy narzędzi — **PR-Miner (2005): 18,1%**.
Zmierzone na projekcie autora (114 plików Javy, 21 migracji SQL):

**Mierzymy pierwszą piątkę i dziesiątkę, nie całą listę.** Trafność całej listy
jest myląca, bo nikt całej listy nie czyta — liczy się, ile prawdziwych trafień
zobaczysz, zanim przestaniesz czytać.

`odd-one-out java <src> --only setOnError` na projekcie autora, ustawienia
domyślne — ranking ma **7 pozycji** (12 zgłoszeń scalonych po miejscu):

| miara | wynik |
|---|---|
| prawdziwych w pierwszych **5** | **3 z 5 — 60%** |
| prawdziwych w pierwszych **10** | **3 z 7 — 43%** (lista krótsza niż 10) |

| pozycja | miejsce | ocena |
|---|---|---|
| 1 | `Screen.java:1496` | fałszywe |
| 2 | `Screen.java:9861` | fałszywe |
| **3** | **`Menu.java:5753` + `:5754`** | **prawdziwe** |
| **4** | **`Loading.java:397`** | **prawdziwe (zweryfikowane)** |
| **5** | **`Loading.java:411`** | **prawdziwe (zweryfikowane)** |
| 6 | `Screen.java:2121` | fałszywe |
| 7 | `Loading.java:974` | fałszywe |

**Dwie liczby, nie jedna.** Sama trafność narzędziu pochlebia; czas zabiera druga
połowa. Obie są tutaj, policzone na tej samej liście:

| | pierwsze 5 | pierwsze 7 (cała scalona lista) |
|---|---|---|
| trafnych | 3 — **60%** | 3 — **43%** |
| **fałszywych alarmów** | 2 — **40%** | 4 — **57%** |

W trybie odkrywania, bez `--only`, ten sam projekt daje 4 trafne z 14 —
**29% trafności, 71% fałszywych alarmów**.

Dla skali: komercyjne analizatory statyczne podają wskaźniki fałszywych alarmów
od około **1%** (SonarQube na OWASP Benchmark; Veracode deklaruje poniżej 1,1%
w zastosowaniach firmowych) po **36,3%** dla Checkmarksa w raporcie Tolly 2024.
To są liczby producentów i benchmarków na syntetycznych zestawach
bezpieczeństwa, więc nie porównują się wprost z powyższymi — ale wyznaczają
skalę, a to narzędzie stoi na jej niewłaściwym końcu. Tyle w praktyce znaczy
„PR-Miner: 18,1%" i taka jest uczciwa cena szukania konwencji zamiast znanych
wzorców błędów.


**Wszystkie cztery znane odpowiedzi mieszczą się w pierwszej piątce.** Nad nimi
stoją dokładnie dwa fałszywe alarmy — i to nie jest przypadek, tylko znane
ograniczenie opisane niżej.

Pozostałe detektory, każdy na parze ze znaną odpowiedzią:

| detektor | zgłoszeń | prawdziwych |
|---|---|---|
| `sql` | 1 | 1 — `release_rate_slot` |
| `pom` | 1 | 1 — `io.thorntail:javafx` |
| `js` | 1 | 1 — `closeAiReqLightbox` |
| `deps` | 0 (z 51 przed odsianiem) | brak podstaw do zgłoszenia |

`java` startował z 3 z 5 dopiero po trzech zmierzonych poprawkach: **typ
odbiornika** i **odsiewanie setterów** (obie włączone domyślnie) oraz **aliasy**,
które wynik pogorszyły i są **wyłączone**.

Zastrzeżenie do tych 100%: `sql`, `pom` i `js` to wąskie detektory jednoregułowe
na małym, jednorodnym zbiorze. `java` mieli 11 581 jednostek i tam trafność
siedzi blisko PR-Minerowej. Szum jest oczekiwany i nie jest porażką.

### Znane ograniczenie: obsługa o poziom wyżej niż wywołanie

Pozycje 1 i 2 (`Screen.java:1496` i `:9861`) są fałszywe z tej samej
przyczyny: **obsługa błędu stoi tam o poziom wyżej niż wywołanie**.
`bindPlayButtonToPlayerStatus` wiąże status przycisku, a błąd obsługuje ten, kto
ją wywołał. Para liczona w zasięgu jednostki tego nie widzi i zgłasza brak.

To nie jest usterka implementacji, tylko granica metody. Ta sama klasa fałszywych
alarmów jest wymieniana przez lintery Fluttera przy sprzątaniu delegowanym do
metody pomocniczej: reguła widzi, że `dispose()` nie stoi obok utworzenia
kontrolera, choć stoi w metodzie, którą `dispose()` woła.

Poszerzenie zasięgu do `--scope file` część takich alarmów usuwa — kosztem
osłabienia samego pojęcia pary (patrz [Zasięg pary](#zasięg-pary)). Wyciszenie
komentarzem `// odd-one-out: ok — obsługa u wołającego` załatwia je na stałe
w konkretnym miejscu.

## Nisza: tam, gdzie skanery regułowe są bezradne

Obsługa błędów oraz projekt klas i metod to obszary, w których **nie ma jednego
poprawnego sposobu realizacji** — każdy projekt rozstrzyga je po swojemu.
Właśnie dlatego skanery regułowe niewiele tam wnoszą: producent narzędzia nie
może napisać reguły na coś, co w każdym repozytorium wygląda inaczej.

W obrębie **jednego** projektu sposób jest jeden, a odstępstwo od niego
widoczne. To jest obszar, w którym ten algorytm ma najwięcej do powiedzenia —
i powód, dla którego porównuje kod do reszty tego samego repozytorium zamiast
do progów z sufitu.

Druga strona problemu: narzędzia generujące uwagi z przeglądu są masowo
ignorowane, gdy nie potrafią uzasadnić zgłoszenia. Uzasadnienie przy każdym
znalezisku (ile razy wzorzec występuje, gdzie, i dlaczego to miejsce odstaje)
oraz jawne rozdzielenie stanów `ROZJAZD` / `MIGRACJA W TOKU` /
`ZA MAŁO DANYCH` istnieją właśnie po to.

> Ten akapit celowo nie podaje liczb. Dwie, które tu wcześniej stały —
> „badanie dwóch tysięcy komentarzy z przeglądów w Javie" i „GitHub: 34%
> komentarzy AI ignorowanych" — nie dały się potwierdzić u źródła i zostały
> usunięte. Jedyne liczby w tym dokumencie to te zmierzone niżej, na konkretnym
> repozytorium, plus 18,1% PR-Minera z publikacji.

## Dlaczego tak, a nie inaczej

**Dlaczego tree-sitter, a nie wyrażenia regularne (Java).** Reguła działa na
parach wywołań na *tym samym odbiorniku* wewnątrz *tej samej funkcji*. Regex nie
wie, gdzie kończy się lambda ani co jest odbiornikiem. tree-sitter parsuje ten
projekt czysto: 111 plików, 3 z lokalnym błędem — wszystkie na wzorcach
rekordowych z kwalifikowaną nazwą typu (`o instanceof R.Ok(String s)`), luka
gramatyki `tree-sitter-java` 0.23.5. Błąd jest lokalny, parser wraca do siebie
w następnej instrukcji.

**Dlaczego NIE tree-sitter dla SQL.** `GRANT`/`REVOKE` to regularne DDL. Jedyna
realna pułapka to cytowanie dolarowe — ciała `plpgsql` między `$$ ... $$` pełne
średników, na których naiwny podział się rozjeżdża. Dwadzieścia linii tokenizera
rozwiązuje to dokładnie; osobna gramatyka byłaby większym ryzykiem niż zyskiem.

**Dlaczego `pom` wymaga Mavena.** `dependencyManagement` tylko przypina wersje
zależnościom zadeklarowanym gdzie indziej. Wpisu, którego nikt nie deklaruje, nie
da się wykryć z samego pliku — deklaracja bywa tranzytywna albo w profilu. Bez
`dependency:tree` narzędzie zgadywałoby, więc go wymaga zamiast zgadywać.

**Dlaczego progi są takie, a nie inne.** `minsup 3` — poniżej trzech wystąpień
nie ma populacji, do której można porównywać. `minconf 0.6` — niżej „konwencja"
znaczy tyle co rzut monetą. `maxodd 3` — gdy odstaje więcej miejsc, to nie
odstępstwo, tylko niedokończona migracja, i narzędzie nazywa to osobno. Wszystkie
są flagami; żaden nie jest wpisany w kod na stałe.

**Dlaczego narzędzie nie stosuje poprawek.** Narzędzie, które samo poprawia kod,
wymaga testów mierzących, czy pomogło. Bez nich pokazanie poprawki jest użyteczne
od pierwszego dnia i nic nie ryzykuje.

**Dlaczego trzy rozłączne stany zamiast jednej listy.** `ROZJAZD` (warstwa jest
konwencją, kilka miejsc jej nie używa) to jedyny stan będący zgłoszeniem.
`MIGRACJA W TOKU` (obie drogi liczne) i `ZA MAŁO DANYCH` są raportowane osobno,
bo przedstawienie ich jako błędu to najprostszy sposób na utratę zaufania
użytkownika. Pusty wynik jest poprawnym wynikiem.

## Ograniczenia

- Reguły dla Javy opierają się na **nazwach**, nie na typach — dwa różne typy
  o podobnie nazwanych metodach potrafią trafić do jednej reguły.
- To samo miejsce potrafi wyjść w kilku regułach; duplikaty trzeba odsiać.
- Brak wywołania nie dowodzi błędu — sprawdź, czy nie jest robione gdzie indziej.
- `pom` wymaga drzewa z **tej samej rewizji** `pom.xml` i tego samego zestawu
  profili. `mvn -P X` wyłącza profile `activeByDefault`.
- **Źródła spoza UTF-8** są po cichu parsowane na śmieci (plik w Latin-2 daje
  znaki zastępcze i bezsensowne drzewo, bez ostrzeżenia).
- **Pamięć**: `deps` trzyma źródło każdego pliku w pamięci — 547 MB przy 100 tys.
  linii; ekstrapolowany sufit to kilkaset tysięcy linii.
- **Dwa równoległe przebiegi piszące do jednego pliku zapisu**: wygrywa ten,
  który pisze później, po cichu. Nie ma blokady, a zapis nie jest niepodzielny.
- Skrypty przeglądarkowe komunikujące się przez `window` są poza zasięgiem
  `deps`, który stoi na grafie importów (w webowym projekcie autora żaden z 85
  plików `.js` nie używa `import` ani `require`).
