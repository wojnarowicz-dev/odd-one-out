---
name: odd-one-out
description: Znajduje miejsca odstające od konwencji panującej w tym projekcie — "N razy tak, raz inaczej". Użyj przy przeglądzie kodu, audycie, przed wydaniem, przy pytaniach typu "czy coś tu odstaje", "czy o czymś zapomniałem", "sprawdź spójność", a także gdy użytkownik dodał nowy kod obok istniejącej rodziny podobnych miejsc. Obsługuje Javę (pary wywołań, warstwy wspólne), pom.xml (martwe wpisy dependencyManagement), migracje SQL/Supabase (revoke bez grant execute) oraz JavaScript/TypeScript i strony HTML (nazwa wołana, której strona nie zna).
---

# odd-one-out

Narzędzie szuka **odstępstw od konwencji tego projektu**, a nie naruszeń
uniwersalnych reguł. Klasa z tysiącem linii w projekcie, gdzie wszystkie mają
tysiąc, nie odstaje. Cztery `MediaPlayer` z `setOnError` i jeden bez — odstaje.

Nie zmienia plików. Zwraca gotową poprawkę do wklejenia.

## Kiedy to uruchomić

- przegląd kodu, audyt, sprawdzenie przed wydaniem,
- „czy coś tu odstaje", „czy o czymś zapomniałem", „sprawdź spójność",
- użytkownik właśnie dopisał kod obok rodziny podobnych miejsc,
- po dodaniu migracji SQL nadającej lub odbierającej uprawnienia,
- po zmianie `pom.xml`.

Nie uruchamiaj do szukania błędów w pojedynczej funkcji bez kontekstu reszty
projektu — narzędzie potrzebuje populacji do porównania.

## Jak uruchomić

Silnik jest osobną paczką npm. Z katalogu wtyczki albo po `npm i -g odd-one-out`:

```bash
odd-one-out java  <katalog-zrodel-java>      # pary wywołań na tym samym odbiorniku
odd-one-out deps  <katalog-zrodel-java>      # warstwa wspólna vs użycie bezpośrednie
odd-one-out sql   <katalog-migracji>         # revoke bez grant execute
odd-one-out pom   --pom <pom.xml> --tree <deptree.txt>
odd-one-out js    <katalog-web>              # nazwa wołana, której strona nie zna
```

Gdy paczka nie jest zainstalowana globalnie, wołaj przez `node`:
`node <katalog-wtyczki>/bin/odd-one-out.mjs java ./src/main/java`.

### `pom` wymaga przygotowania

`dependencyManagement` tylko przypina wersje zależnościom zadeklarowanym gdzie
indziej — z samego pliku nie da się orzec, czy wpis coś robi. Najpierw zdejmij
drzewo, dopiero potem uruchom detektor:

```bash
mvn -o -B dependency:tree > deptree.txt
odd-one-out pom --pom pom.xml --tree deptree.txt
```

Drzewo musi pochodzić z **tej samej rewizji `pom.xml`** i tego samego zestawu
profili. `mvn -P X` wyłącza profile `activeByDefault` — drzewo zdjęte z inną
listą profili generuje fałszywe zgłoszenia. Jeśli Mavena nie da się uruchomić,
powiedz to wprost i pomiń `pom`; bez drzewa narzędzie zgadywałoby.

## Różnica między uruchomieniami

Gdy projekt był już skanowany, **nie czytaj całej listy od nowa** — pokaż
użytkownikowi, co doszło od ostatniego razu:

```bash
odd-one-out java ./src/main/java --json .odd-one-out/java.json
odd-one-out diff .odd-one-out/poprzedni.json .odd-one-out/java.json
```

Sekcje: **NOWE**, **ZNIKNĘŁO** (poprawione albo kod usunięty), **ZMIENIONE**
(to samo miejsce, inna siła dowodu), bez zmian. Kod wyjścia `1` = są nowe.

Odcisk zgłoszenia nie zawiera numeru linii, więc przesunięcia w pliku **nie**
generują fałszywych „nowych". Dwie rzeczy warte powiedzenia użytkownikowi:
naprawa jednego odstępstwa potrafi wygenerować nowe (zmienia populację, do
której wszystko jest porównywane), a przeniesienie klasy do innego pakietu
wychodzi jako `NOWE` + `ZNIKNĘŁO`.

## Typ odbiornika

Włączony domyślnie (`--typy off` wyłącza): pozycje niosą typ odbiornika, więc
`MediaControl#setOnEndOfMedia` nie miesza się z `MediaPlayer#setOnEndOfMedia`.
Zmierzone: trafność 20% → 29%.

`--aliasy on` (domyślnie wyłączone) scala wywołania na aliasach tej samej
zmiennej. Zmierzone: pogarsza wynik (29% → 21%) — usuwa jeden fałszywy alarm,
tworzy dwa nowe na metodach zapytujących. Nie włączaj bez pomiaru.

## Zasięg pary

`--scope file|method|lambda` (domyślnie `lambda`) ustala, jak blisko siebie muszą
stać dwa wywołania, żeby liczyć się jako para.

Zmierzone na 111 plikach: **zwężanie zasięgu NIE poprawia trafności** — fałszywe
alarmy tej klasy biorą się stąd, że obsługa stoi o poziom wyżej niż wywołanie,
a wąski zasięg tego nie widzi i zgłasza brak. Do przeglądu proponuj
`--scope file`: te same defekty przy około 40% mniejszej liczbie zgłoszeń
(9 zamiast 15). Zasięg `method` jest najgorszy z trzech — gubi zgłoszenia,
bo dzieli populację tak, że reguły tracą wsparcie.

## Stabilność wzorca

`--stabilnosc` przy `rank` mnoży ocenę przez to, jak równo wzorzec rozkłada się
na podzbiorach populacji. **Domyślnie wyłączone.**

Zmierzone: pozycja zweryfikowanych trafień podniosła się o jedno miejsce, ale
kosztem zepchnięcia w dół innego prawdziwego zgłoszenia; dwa fałszywe alarmy
z czoła listy mają stabilność 1,00 i są odporne. Liczba prawdziwych zgłoszeń
w pierwszej trójce i piątce bez zmian. Ruch w rankingu to nie to samo co
poprawa rankingu.

## Wiek odstępstwa

`--wiek <katalog-repo>` przy `rank` podbija ocenę odstępstw nowszych niż linie
zgodne z wzorcem. **Domyślnie wyłączone i zwykle tak zostaw.**

Zmierzone na projekcie autora: nie ruszyło pozycji prawdziwych trafień, za to
wypromowało jedno fałszywe. `git blame` pokazuje ostatnią rękę, nie autora
treści — w repozytorium założonym jednym commitem importującym cały kod
wszystkie linie mają tę samą datę i sygnał nie niesie informacji. Włączaj tylko
tam, gdzie kod od początku powstawał w gicie, i nigdy nie traktuj wieku jako
podstawy do odrzucenia zgłoszenia.

## Ranking

Przy kilku detektorach naraz **nie pokazuj użytkownikowi czterech list** — scal
je: `odd-one-out rank .odd-one-out/java.json .odd-one-out/sql.json`.

Ocena to iloczyn konwencji, populacji i rzadkości; skala porządkowa, nie
procent — nie mów „94% szans na błąd". Zgłoszenia z tego samego miejsca są już
scalone w jedną pozycję, a stany niebędące zgłoszeniem do rankingu nie wchodzą.

## Jak czytać wynik

Nagłówek zgłoszenia niesie siłę dowodu:

```
## [2] setOnReady -> setOnError   sup=8/10 conf=80% odd=2
```

- `sup=8/10` — 10 miejsc woła `setOnReady`, 8 z nich woła też `setOnError`.
- `conf=80%` — siła konwencji.
- `odd=2` — tyle miejsc odstaje. **`odd=1` przy wysokim `sup` to najmocniejszy
  sygnał**; `odd` bliskie połowie `sup` znaczy, że konwencji nie ma.

Każde zgłoszenie ma trzy sekcje: **CO JEST NIESPÓJNE**, **JAK ZROBIONO
W POZOSTAŁYCH MIEJSCACH** (z przykładem i ścieżką) oraz **GOTOWA POPRAWKA**.

### Stany, których nie wolno mylić ze znaleziskiem

Detektory `deps` i `sql` rozróżniają trzy rozłączne stany i mówią to wprost:

- **ROZJAZD** — warstwa jest konwencją, kilka miejsc jej nie używa. To jedyny
  stan, który jest zgłoszeniem.
- **MIGRACJA W TOKU** — obie drogi są liczne. Nie ma czego nazwać odstępstwem;
  to niedokończone przejście, nie błąd do poprawienia punktowo.
- **ZA MAŁO DANYCH** — za mało wystąpień, by mówić o konwencji.

Detektor `pom` rozdziela podobnie: **MARTWY** (nieobecny w drzewie i nigdzie
niezadeklarowany — dwa niezależne świadectwa) od **DO SPRAWDZENIA** (nieobecny
w drzewie, ale zadeklarowany — najczęściej niedopasowana rewizja drzewa).

Nie przedstawiaj „MIGRACJI W TOKU", „ZA MAŁO DANYCH" ani „DO SPRAWDZENIA" jako
błędu. Pusty wynik jest poprawnym wynikiem.

## Czego się spodziewać po trafności

Trafność referencyjna tej klasy narzędzi (PR-Miner, 2005) to **18,1%**. Szum
jest oczekiwany i nie jest porażką.

Zmierzone na projekcie autora: detektory wąskie (`sql`, `pom`) trafiały 1/1,
szeroki `java` — **29%** (4 prawdziwe na 14 zgłoszeń) przy ustawieniach
domyślnych. Podniósł ją **typ odbiornika** (z 20%, włączony domyślnie); próba
z **aliasami** ją obniżyła (do 21%) i dlatego jest **domyślnie wyłączona**.

Podawaj użytkownikowi liczby, nie przymiotniki: ile zgłoszeń, ile prawdziwych.

## Zasady pracy z wynikiem

1. **Nie stosuj poprawek automatycznie.** Narzędzie ich nie stosuje i Ty też nie
   — dopóki użytkownik nie poprosi. Poprawka bez testu mierzącego, czy pomogła,
   jest ryzykiem, nie wartością.
2. **Zweryfikuj przepływ, zanim nazwiesz coś błędem.** Brak wywołania nie
   dowodzi błędu — sprawdź, czy nie jest robione gdzie indziej (inna metoda,
   try-with-resources, inny hak cyklu życia).
3. **Odsiewaj duplikaty.** To samo miejsce potrafi wyjść w kilku regułach.
4. **Uwaga na odbiornik.** Reguła oparta na nazwach potrafi zestawić dwa różne
   typy o podobnie nazwanych metodach.
