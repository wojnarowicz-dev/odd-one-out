// odd-one-out — jeden osąd „czy jest z czym porównywać", dla wszystkich detektorów.
//
// PO CO. `deps` i `sql` miały jawny stan ZA MAŁO DANYCH, a `java` — czyli ten
// detektor, od którego każdy zaczyna — nie miał go wcale. Przy trzech plikach
// wypisywał `rules=0` i pustkę, nieodróżnialną od „twój kod jest spójny".
// To najgorszy możliwy pierwszy kontakt: człowiek nie wie, czy narzędzie nic
// nie znalazło, czy nie miało czego szukać.
//
// JEDNO MIEJSCE, NIE TRZECIA KOPIA. Decyzja i komunikat są tutaj; detektory
// podają tylko swoją liczebność i swój próg.
//
// PRÓG ZOSTAJE PER DETEKTOR i to jest świadome. Kusi, żeby ujednolicić także
// liczbę, ale progi są tu nośne, nie kosmetyczne: `java` ma minsup 3, a znana
// odpowiedź `MediaPlayer#dispose -> setOnError` ma wsparcie dokładnie 3 —
// podniesienie progu do 5 skasowałoby ją (zmierzone wcześniej). Ujednolicony
// jest OSĄD i KOMUNIKAT, nie wartość.
import { t } from './lang.mjs';

/**
 * @param ile   ile wystąpień faktycznie znaleziono (pozycji częstych, par, klas)
 * @param prog  próg tego detektora
 * @returns null gdy populacja wystarcza, albo gotowy komunikat do wypisania
 */
export function zaMaloDanych(ile, prog) {
  if (ile >= prog) return null;
  return t('tooLittleData', ile, prog) + '\n' + t('tooLittleDataHint', prog);
}

/**
 * Zero plików danego rodzaju. `files=0` przy projekcie w Pythonie wyglądało
 * dokładnie tak samo jak czysty projekt w Javie — ta sama struktura wyjścia,
 * to samo zero, ten sam kod wyjścia. Człowiek wyciągał wniosek „nic nie
 * znalazło", a nie „nie czyta tego języka".
 *
 * @param ile      ile plików znaleziono
 * @param rodzaj   czego szukaliśmy, np. ".java"
 * @param root     przeszukany katalog
 * @returns null gdy coś znaleziono, albo komunikat z listą obsługiwanych wejść
 */
export function brakZrodel(ile, rodzaj, root) {
  if (ile > 0) return null;
  return t('noSourcesFound', rodzaj, root) + '\n' + t('noSourcesHint');
}
