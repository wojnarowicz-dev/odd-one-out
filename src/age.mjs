// odd-one-out — wiek odstępstwa.
//
// SYGNAL. Odstępstwo NOWSZE niż linie zgodne z wzorcem jest podejrzane:
// najstarsze jest zwykle oryginałem, od którego reszta odeszła świadomie.
// Nowe miejsce, które nie trzyma się konwencji panującej dokoła, częściej
// oznacza przeoczenie niż decyzję.
//
// ZASTRZEZENIE, KTORE PRZESADZA O SPOSOBIE UZYCIA. `git blame` pokazuje
// OSTATNIA REKE, nie autora treści. Jedna zmiana formatowania, przeniesienie
// pliku albo masowe `reformat code` fałszuje wiek całego pliku i robi
// z dziesięcioletniego kodu "wczorajszy". Dlatego wiek działa WYLACZNIE jako
// podbicie w rankingu — nigdy jako podstawa do odsiania czegokolwiek.
// Zgłoszenie bez danych o wieku zachowuje swoją ocenę bez zmian.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { t } from './lang.mjs';

const cache = new Map();

/** Znacznik czasu ostatniej zmiany danej linii (epoch, sekundy) albo null. */
export function blameEpoch(repoDir, absFile, line) {
  const key = absFile + ':' + line;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const txt = execFileSync('git',
      ['blame', '-L', line + ',' + line, '--porcelain', '--', absFile],
      { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
    const m = txt.match(/^author-time (\d+)$/m);
    if (m) out = +m[1];
  } catch {
    out = null;   // plik nieśledzony, brak gita, linia poza zakresem
  }
  cache.set(key, out);
  return out;
}

export function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

const mediana = xs => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : Math.round((s[i - 1] + s[i]) / 2);
};

const dzien = t => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '—');

/**
 * Dokłada do zgłoszenia dane o wieku. Zwraca { wiekOdstepstwa, wiekWzorca,
 * nowsze, mnoznik } — mnoznik 1.0 znaczy "brak sygnału", nigdy "gorsze".
 */
export function ageSignal(finding, root, repoDir, { boost = 1.3 } = {}) {
  const abs = path.resolve(root, finding.file);
  const dev = blameEpoch(repoDir, abs, finding.line);
  const wzorzec = (finding.meta && finding.meta.wzorzec) || [];
  const daty = wzorzec
    .map(w => blameEpoch(repoDir, path.resolve(root, w.file), w.line))
    .filter(Boolean);
  const med = mediana(daty);

  if (!dev || med === null) return { dev, med, nowsze: null, mnoznik: 1, opis: t('ageNoData') };

  const nowsze = dev > med;
  return {
    dev, med, nowsze,
    mnoznik: nowsze ? boost : 1,
    opis: t('ageDesc', dzien(dev), daty.length, dzien(med), nowsze ? t('ageNewer', boost) : t('ageNotNewer')),
  };
}

export { dzien };
