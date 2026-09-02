import { t } from './lang.mjs';
// odd-one-out — jeden ranking ponad detektorami.
//
// PO CO. Cztery detektory dają cztery osobne listy w czterech skalach:
// `conf=80% odd=2`, `15 funkcji ma wzorzec, ta jedna nie`, `MARTWY`. Człowiek
// nie ma jak porównać zgłoszenia z pom.xml ze zgłoszeniem z Javy i nie wie, co
// czytać pierwsze. Ranking sprowadza je do jednej liczby z jawnych składników.
//
// SKŁADNIKI. Każde zgłoszenie niesie w `meta` te same trzy wielkości, niezależnie
// od detektora:
//   konwencja  — jak mocno wzorzec się trzyma (0..1)
//   populacja  — na ilu przykładach stoi (nasycenie przy 10)
//   rzadkosc   — im mniej miejsc odstaje, tym mocniejszy sygnał (1/odd)
//
// Mnożenie, nie suma. Zgłoszenie ma być wysoko tylko wtedy, gdy WSZYSTKIE trzy
// są wysokie — silna konwencja na trzech przykładach nic nie znaczy, tak samo
// jak duża populacja przy połowie miejsc odstających. Suma pozwoliłaby jednemu
// wysokiemu składnikowi przykryć zerowy; iloczyn nie.
//
// Skala jest porządkowa, nie prawdopodobieństwem. 94 nie znaczy "94% szans, że
// to błąd" — znaczy "czytaj to przed zgłoszeniem o 32".

export function components(meta = {}) {
  const m = meta || {};
  const odd = Number(m.odd ?? m.viol ?? 1) || 1;

  // konwencja: wprost z conf (Java), albo z proporcji via/(via+odd) (reszta)
  let konwencja = null;
  if (m.conf !== undefined) konwencja = Number(m.conf);
  else if (m.via !== undefined) {
    const via = Number(m.via) || 0;
    konwencja = via + odd > 0 ? via / (via + odd) : 0;
  }
  if (konwencja === null || Number.isNaN(konwencja)) konwencja = 0.5;

  // populacja: ile przykładów podpiera wzorzec; nasycenie przy 10
  const pop = Number(m.sup ?? m.via ?? 0) || 0;
  const populacja = Math.min(1, pop / 10);

  const rzadkosc = 1 / odd;

  return { konwencja, populacja, rzadkosc, odd, pop };
}

export function score(meta) {
  const c = components(meta);
  return Math.round(100 * c.konwencja * c.populacja * c.rzadkosc);
}

// Stany, które NIE są zgłoszeniem, nie mają czego robić w rankingu —
// niezależnie od tego, jak wysoko wyszłyby z arytmetyki.
const NIE_ZGLOSZENIE = new Set(['MIGRACJA W TOKU', 'ZA MALO DANYCH', 'DO SPRAWDZENIA']);

// SCALANIE. Jedno miejsce potrafi naruszyc kilka regul naraz — w tym projekcie
// `bindPlayButtonToPlayerStatus` wychodzil trzy razy (setOnPlaying/setOnPaused/
// setOnStopped -> setOnError), zajmujac pozycje 4, 5 i 6 rankingu i spychajac
// zgloszenia z innych miejsc. To jedna decyzja do podjecia przez czlowieka,
// wiec jest jedna pozycja; pozostale reguly ida obok jako uzasadnienie.
//
// Jednostka bierze sie z meta.unit (Java: rodzaj+linia funkcji otaczajacej),
// a gdy jej nie ma — z pary plik+linia. Numer linii jest tu bezpieczny, bo
// scalanie dziala W OBREBIE JEDNEGO przebiegu, nie miedzy przebiegami.
function unitKey(f, detector) {
  return [detector, f.file, (f.meta && f.meta.unit) || f.line || 0].join('|');
}

export function rankSnapshots(snapshots) {
  const grupy = new Map();
  for (const s of snapshots)
    for (const f of s.findings) {
      const kind = f.meta && f.meta.kind;
      if (kind && NIE_ZGLOSZENIE.has(kind)) continue;
      const detector = f.detector || s.detector;
      const k = unitKey(f, detector);
      const rec = { ...f, detector, root: s.root, score: score(f.meta), comp: components(f.meta) };
      const prev = grupy.get(k);
      if (!prev) { grupy.set(k, { ...rec, takze: [] }); continue; }
      // zostaje najmocniejsza regula; slabsze ida obok
      if (rec.score > prev.score) grupy.set(k, { ...rec, takze: [...prev.takze, prev.rule] });
      else prev.takze.push(rec.rule);
    }
  const out = [...grupy.values()];
  out.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return out;
}

export async function printRanking(snapshots, { top = 20, wiek = null, stabilnosc = false } = {}) {
  const ranked = rankSnapshots(snapshots);

  // STABILNOSC WZORCA — czwarty skladnik oceny, opcjonalny.
  // Wzorzec obecny w kazdym podzbiorze populacji jest pewniejszy niz taki,
  // ktory powstaje dopiero z calosci. Wartosc liczy detektor (patrz
  // src/oddone.mjs) na PODZBIORACH SPRAWDZAJACYCH — populacja, na ktorej
  // wydobyto reguly, pozostaje cala.
  let stabOpis = null;
  if (stabilnosc) {
    let zeSkladnikiem = 0;
    for (const f of ranked) {
      const s = f.meta && f.meta.stab;
      if (typeof s === 'number') { f.score = Math.round(f.score * s); zeSkladnikiem++; }
    }
    ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    stabOpis = t('stabApplied', zeSkladnikiem, ranked.length);
  }

  // WIEK — sygnal opcjonalny, domyslnie wylaczony. Wylacznie podbicie oceny;
  // nic nie jest na tej podstawie usuwane ani obnizane (patrz src/age.mjs).
  let wiekOpis = null;
  if (wiek) {
    const { ageSignal, isGitRepo } = await import('./age.mjs');
    if (!isGitRepo(wiek)) {
      wiekOpis = t('ageNotRepo', wiek);
    } else {
      let podbitych = 0;
      for (const f of ranked) {
        const a = ageSignal(f, f.root, wiek);
        f.wiek = a;
        if (a.mnoznik !== 1) podbitych++;
        f.score = Math.round(f.score * a.mnoznik);
      }
      ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
      wiekOpis = t('ageSignal', podbitych, ranked.length);
    }
  }
  const pominiete = snapshots.reduce((n, s) =>
    n + s.findings.filter(f => f.meta && NIE_ZGLOSZENIE.has(f.meta.kind)).length, 0);

  console.log(t('rankTitle'));
  console.log(t('rankSnapshots', snapshots.length, snapshots.map(s => s.detector).join(', ')));
  console.log(t('rankFindings', ranked.length) + (pominiete ? t('rankSkipped', pominiete) : ''));
  console.log('');
  console.log(t('rankFormula'));
  if (wiekOpis) console.log(wiekOpis);
  if (stabOpis) console.log(stabOpis);
  console.log('');

  ranked.slice(0, top).forEach((f, i) => {
    const c = f.comp;
    console.log(String(i + 1).padStart(3) + '. [' + String(f.score).padStart(3) + ']  ' +
      f.detector.padEnd(5) + '  ' + f.file + (f.line ? ':' + f.line : ''));
    console.log('       ' + f.label);
    console.log(t('rankComponents', (c.konwencja * 100).toFixed(0), c.pop, c.odd));
    if (f.takze && f.takze.length) console.log(t('rankAlsoViolates', f.takze.join(', ')));
    if (f.wiek) console.log(t('rankAge', f.wiek.opis));
    if (stabilnosc && f.meta && f.meta.stabOpis)
      console.log(t('rankStability', f.meta.stab, f.meta.stabOpis));
  });

  if (ranked.length > top) console.log(t('rankMore', ranked.length - top));
  return ranked;
}
