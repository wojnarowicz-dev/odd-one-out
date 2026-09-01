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

| detektor | zgłoszeń | prawdziwych |
|---|---|---|
| `java` (pary `setOn*`) | 10 | 1 pewne + 1 prawdopodobne |
| `deps` | 0 (z 51 przed odsianiem) | brak podstaw do zgłoszenia |
| `pom` | 1 | 1 — trafiona znana odpowiedź |
| `sql` | 1 | 1 — trafiona znana odpowiedź |

Zastrzeżenie: `pom` i `sql` to wąskie detektory jednoregułowe na małym zbiorze —
łatwiejsze zadanie niż `java`, który mieli 11 581 jednostek i tam trafność spada
do poziomu PR-Minera. Szum jest oczekiwany i nie jest porażką.

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
