// odd-one-out — wykluczenia i wyciszenia.
//
// DWIE ROZNE RZECZY, celowo rozdzielone:
//
//   exclude  — czego NIE CZYTAC. Wpływa na populację, więc zmienia też wzorzec:
//              wykluczenie testów potrafi podnieść albo obniżyć konwencję.
//   mute     — czego NIE POKAZYWAC. Miejsce jest czytane i liczy się do
//              populacji, ale nie trafia do raportu ani rankingu.
//
// Pomylenie ich psuje wynik po cichu: wyciszenie zaimplementowane jako
// wykluczenie usuwa miejsce z populacji i osłabia regułę, która je złapała.
//
// Domyślna lista jest wbudowana, żeby narzędzie działało bez konfiguracji.
// Plik `.odd-one-out.json` w badanym katalogu (albo wskazany przez --config)
// dokłada się do niej; `"exclude"` zastępuje domyślne tylko wtedy, gdy poda się
// `"excludeDefaults": false`.
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';

export const DEFAULT_EXCLUDE = [
  '**/build/**', '**/target/**', '**/out/**', '**/dist/**',
  '**/node_modules/**', '**/.git/**', '**/.idea/**',
  '**/generated/**', '**/coverage/**',
  '**/*Test.java', '**/*Tests.java', '**/*IT.java',
];

export const CONFIG_NAME = '.odd-one-out.json';

// Minimalny dopasowywacz wzorców: ** (dowolne segmenty), * (w obrębie segmentu).
// Świadomie nie wciągam biblioteki — to kilkanaście linii, a każda zależność
// w narzędziu, które ma działać po `npm i -g`, to koszt.
const META = '.+^${}()|[]\\';
function toRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') { i++; out += '(?:.*/)?'; }  // **/ = zero lub wiecej segmentow
        else out += '.*';
      } else {
        out += '[^/]*';                                          // * = w obrebie jednego segmentu
      }
    } else if (META.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp('^' + out + '$');
}

export function loadConfig(argv = [], root = process.cwd()) {
  const i = argv.indexOf('--config');
  const explicit = i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;

  let file = explicit;
  if (!file) {
    for (const dir of [root, process.cwd()]) {
      try {
        const p = path.join(dir, CONFIG_NAME);
        if (fs.existsSync(p)) { file = p; break; }
      } catch { /* katalog moze nie istniec */ }
    }
  }

  let raw = {};
  if (file) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('!! Nie udalo sie wczytac ' + file + ': ' + e.message);
      console.error('   Ide dalej z ustawieniami domyslnymi.');
      raw = {};
      file = null;
    }
  }

  const useDefaults = raw.excludeDefaults !== false;
  const exclude = [...(useDefaults ? DEFAULT_EXCLUDE : []), ...(raw.exclude || [])];
  const regexes = exclude.map(toRegExp);

  // mute: lista identyfikatorow zgloszen albo obiektow {id, powod}
  const mute = new Map();
  for (const m of raw.mute || []) {
    if (typeof m === 'string') mute.set(m, '');
    else if (m && m.id) mute.set(m.id, m.powod || m.reason || '');
  }

  const norm = p => String(p).replace(/\\/g, '/');
  const plikiCache = new Map();   // sciezka -> linie pliku (albo null, gdy nieczytelny)

  return {
    file,
    exclude,
    mute,
    /** czy sciezke pominac przy CZYTANIU */
    isExcluded(p) {
      const s = norm(p);
      return regexes.some(r => r.test(s));
    },
    /** czy zgloszenie o tym id ukryc w RAPORCIE (populacja zostaje) */
    isMuted(id) {
      return mute.has(id);
    },
    /**
     * Wyciszenie KOMENTARZEM w kodzie: `// odd-one-out: ok — powod`.
     *
     * Plik z wyciszeniami jest dobry do decyzji zbiorczych, ale zmusza do
     * skakania miedzy kodem a konfiguracja i zapisuje odcisk, ktorego nie da
     * sie przeczytac w miejscu. Komentarz stoi tam, gdzie decyzja zapadla,
     * i przechodzi razem z kodem przez przenosiny i scalenia.
     *
     * Szukamy w linii zgloszenia i w linii POWYZEJ — obie formy sa naturalne:
     *     foo.bar();   // odd-one-out: ok — obsluga stoi u wolajacego
     *     // odd-one-out: ok — jw.
     *     foo.bar();
     */
    mutedByComment(absFile, line) {
      if (!absFile || !line) return null;
      let linie = plikiCache.get(absFile);
      if (linie === undefined) {
        try { linie = fs.readFileSync(absFile, 'utf8').split(/\r?\n/); }
        catch { linie = null; }
        plikiCache.set(absFile, linie);
      }
      if (!linie) return null;
      for (const nr of [line - 1, line - 2]) {
        const tresc = linie[nr];
        if (!tresc) continue;
        const m = tresc.match(/odd-one-out:\s*ok\b[ \t]*[—:-]?[ \t]*(.*)$/i);
        if (m) return (m[1] || '').replace(/\s*(\*\/|-->)\s*$/, '').trim() || t('noReason');
      }
      return null;
    },
    muteReason(id) {
      return mute.get(id) || '';
    },
    opis() {
      return t('exclusions', exclude.length) +
        (this.file ? ' (config: ' + norm(this.file) + ')' : t('defaults')) +
        (mute.size ? t('mutes', mute.size) : '');
    },
  };
}
