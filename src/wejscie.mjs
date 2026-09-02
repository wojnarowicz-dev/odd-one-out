// odd-one-out — sprawdzenie wejścia, jedno miejsce dla wszystkich detektorów.
//
// PO CO. Nieistniejąca ścieżka to najczęstsza pomyłka użytkownika — literówka
// w katalogu, skopiowana ścieżka z innej maszyny, projekt przeniesiony. Bez
// tego sprawdzenia każdy z pięciu detektorów wywalał surowy `ENOENT` ze śladem
// stosu Node, co wygląda na awarię narzędzia, a jest zwykłą omyłką wpisania.
//
// JEDNO MIEJSCE, NIE PIĘĆ. Sprawdzenie stoi w dyspozytorze (`bin/odd-one-out.mjs`),
// przed wywołaniem detektora, i korzysta z tych funkcji. Detektory nie mają
// własnych kopii — inaczej po dołożeniu szóstego znów byłaby jedna kopia mniej
// niż trzeba, czyli dokładnie ten rodzaj odstępstwa, którego to narzędzie szuka.
//
// Kod wyjścia 2 — ten sam, co przy braku argumentu. 0 i 1 są zajęte na wynik
// analizy (brak nowych odstępstw / są nowe), więc błąd użycia musi mieć własny.
import fs from 'node:fs';
import { t } from './lang.mjs';

const KOD_BLEDU_UZYCIA = 2;

function przerwij(komunikat, wskazowka) {
  console.error(komunikat);
  if (wskazowka) console.error(wskazowka);
  process.exit(KOD_BLEDU_UZYCIA);
}

/** Katalog musi istnieć i być katalogiem. */
export function wymagajKatalog(sciezka, etykieta) {
  if (!sciezka) przerwij(t('inputMissingArg', etykieta));
  let st;
  try {
    st = fs.statSync(sciezka);
  } catch (e) {
    if (e.code === 'ENOENT') przerwij(t('inputNoSuchPath', sciezka), t('inputHintPath'));
    przerwij(t('inputUnreadable', sciezka, e.code), t('inputHintPath'));
  }
  if (!st.isDirectory()) przerwij(t('inputNotDir', sciezka), t('inputHintDir'));
  try {
    fs.readdirSync(sciezka);
  } catch (e) {
    przerwij(t('inputUnreadable', sciezka, e.code), t('inputHintPath'));
  }
  return sciezka;
}

/** Plik musi istnieć, być plikiem i dać się przeczytać. */
export function wymagajPlik(sciezka, etykieta) {
  if (!sciezka) przerwij(t('inputMissingArg', etykieta));
  let st;
  try {
    st = fs.statSync(sciezka);
  } catch (e) {
    if (e.code === 'ENOENT') przerwij(t('inputNoSuchPath', sciezka), t('inputHintPath'));
    przerwij(t('inputUnreadable', sciezka, e.code), t('inputHintPath'));
  }
  if (!st.isFile()) przerwij(t('inputNotFile', sciezka), t('inputHintFile'));
  try {
    fs.accessSync(sciezka, fs.constants.R_OK);
  } catch (e) {
    przerwij(t('inputUnreadable', sciezka, e.code), t('inputHintPath'));
  }
  return sciezka;
}
