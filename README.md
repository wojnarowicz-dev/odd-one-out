# odd-one-out

Szuka miejsc **odstających od konwencji panującej w projekcie**. Zasada jest
jedna: **N razy tak, raz inaczej.**

Klasa z tysiącem linii w projekcie, gdzie wszystkie mają tysiąc, nie odstaje.
Cztery `MediaPlayer` z `setOnError` i jeden bez — odstaje. Narzędzie nie ma
progów z sufitu; porównuje kod do reszty tego samego repozytorium.

**Nie zmienia plików.** Przy każdym zgłoszeniu pokazuje gotową poprawkę do
wklejenia.

## Instalacja

```bash
git clone <repo> && cd odd-one-out
npm install
npm start          # wypisuje pomoc
```

**Dla Claude Code instalacja przez rynek wtyczek** (`.claude-plugin/marketplace.json`
— `claude plugin marketplace add <repo>`, potem `claude plugin install odd-one-out`).
**Dla pozostałych agentów skopiuj katalog `skills/`**: `SKILL.md` nie jest formatem
wyłącznie Claude Code — Cursor, Codex i Gemini CLI czytają te same katalogi.
Silnik jest zwykłą paczką npm i działa bez żadnego z nich.

## Użycie

```bash
odd-one-out java  <katalog-zrodel-java>      # pary wywołań na tym samym odbiorniku
odd-one-out deps  <katalog-zrodel-java>      # warstwa wspólna vs użycie bezpośrednie
odd-one-out sql   <katalog-migracji>         # revoke bez grant execute
odd-one-out pom   --pom <pom.xml> --tree <deptree.txt>
```

`pom` wymaga wcześniejszego `mvn -o -B dependency:tree > deptree.txt`.

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

Znaleziona sierota to `closeAiReqLightbox` w `VideoAnalyzerPro.html:9464` —
dokładnie ta linia, którą usunął commit `c45f7a6`.

Pierwszy przebieg dał 5 zgłoszeń, z czego 4 fałszywe. Przyczyna była w moim
wycinaniu skryptów: słowo `<script>` napisane **w komentarzu HTML** brałem za
otwarcie bloku i parowałem z zamknięciem sto linii dalej, przez co CSS i proza
trafiały do parsera jako JavaScript. Komentarze są teraz wygaszane przed
szukaniem `<script>`, ze spacjami zamiast treści, żeby nie rozjechać numeracji.

## Różnica między uruchomieniami

Bez tego przy każdym uruchomieniu czyta się te same zgłoszenia od nowa. Pytanie
brzmi nie „co jest nie tak", tylko **„co jest nie tak od ostatniego razu"**.

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json   # zapis przebiegu
# ...praca nad kodem...
odd-one-out java ./src/main/java --json .odd-one-out/nowy.json
odd-one-out diff .odd-one-out/java.json .odd-one-out/nowy.json
```

Wyjście dzieli się na **NOWE**, **ZNIKNĘŁO**, **ZMIENIONE** (to samo miejsce,
inna siła dowodu — np. `sup: 8 -> 9, conf: 0.8 -> 0.9, viol: 2 -> 1`) i bez
zmian. Kod wyjścia `1`, gdy są nowe zgłoszenia — do użycia w CI.

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
| `VideoAnalyzerPro.java:1496` (szum) | 1 | **1** | 1,00 |
| `VideoAnalyzerPro.java:9861` (szum) | 2 | **2** | 1,00 |
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
| pozycja `VideoAnalyzerPro.java:9861` (szum) | 2 | **1** |

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

## Liczby, nie przymiotniki

Trafność referencyjna tej klasy narzędzi — **PR-Miner (2005): 18,1%**.
Zmierzone na projekcie autora (114 plików Javy, 21 migracji SQL):

| detektor | zgłoszeń | prawdziwych | trafność |
|---|---|---|---|
| `java` (pary `setOn*`, ustawienia domyślne) | 14 | 4 | **29%** |
| `deps` | 0 (z 51 przed odsianiem) | brak podstaw do zgłoszenia | n/d |
| `pom` | 1 | 1 — trafiona znana odpowiedź | 100% |
| `sql` | 1 | 1 — trafiona znana odpowiedź | 100% |

`java` startował z **20%** i doszedł do 29% dzięki **typowi odbiornika**
(włączonemu domyślnie). Druga próba — **aliasy** — trafność obniżyła
(29% → 21%) i jest **domyślnie wyłączona**; obie zmierzone w sekcji
[Typ odbiornika i aliasy](#typ-odbiornika-i-aliasy).

Zastrzeżenie: `pom` i `sql` to wąskie detektory jednoregułowe na małym zbiorze —
łatwiejsze zadanie niż `java`, który mieli 11 tysięcy jednostek. Szum jest
oczekiwany i nie jest porażką.

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
