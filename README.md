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

Badanie dwóch tysięcy komentarzy z przeglądów kodu w Javie wykazało, że
**obsługa błędów oraz projekt klas i metod zbierają znaczący odsetek uwag** —
bo nie ma jednego poprawnego sposobu ich realizacji. Właśnie dlatego skanery
regułowe niewiele tam wnoszą: producent narzędzia nie może napisać reguły na
coś, co w każdym projekcie wygląda inaczej.

W obrębie **jednego** projektu sposób jest jeden, a odstępstwo od niego
widoczne. To jest obszar, w którym ten algorytm ma najwięcej do powiedzenia —
i powód, dla którego porównuje kod do reszty tego samego repozytorium zamiast
do progów z sufitu.

Liczba odniesienia dla drugiej strony problemu: GitHub podaje, że **34%
komentarzy z przeglądu generowanych przez AI jest ignorowanych lub
odrzucanych**. Uzasadnienie przy każdym zgłoszeniu (ile razy wzorzec występuje,
gdzie, i dlaczego to miejsce odstaje) oraz jawne rozdzielenie stanów
`ROZJAZD` / `MIGRACJA W TOKU` / `ZA MAŁO DANYCH` istnieją po to, żeby nie
dokładać się do tych 34%.

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
