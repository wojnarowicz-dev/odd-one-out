import { t } from './lang.mjs';
// odd-one-out — one ranking across all detectors.
//
// WHY. Four detectors produce four separate lists on four different scales:
// `conf=80% odd=2`, `15 functions have the pattern, this one does not`, `DEAD`.
// A person has no way to compare a pom.xml finding with a Java finding and does
// not know what to read first. The ranking reduces them to a single number
// built from explicit components.
//
// COMPONENTS. Every finding carries the same three quantities in `meta`,
// regardless of detector:
//   conventionality — how strongly the pattern holds (0..1)
//   population      — how many examples it rests on (saturates at 10)
//   rarity          — the fewer sites deviate, the stronger the signal (1/odd)
//
// Multiplication, not a sum. A finding should rank high only when ALL THREE are
// high — a strong convention over three examples means nothing, and so does a
// large population with half the sites deviating. A sum would let one high
// component mask a zero one; a product does not.
//
// The scale is ordinal, not a probability. 94 does not mean "94% chance this is
// a bug" — it means "read this before the finding scored 32".

export function components(meta = {}) {
  const m = meta || {};
  const odd = Number(m.odd ?? m.viol ?? 1) || 1;

  // conventionality: straight from conf (Java), or from via/(via+odd) (the rest)
  let conventionality = null;
  if (m.conf !== undefined) conventionality = Number(m.conf);
  else if (m.via !== undefined) {
    const via = Number(m.via) || 0;
    conventionality = via + odd > 0 ? via / (via + odd) : 0;
  }
  if (conventionality === null || Number.isNaN(conventionality)) conventionality = 0.5;

  // population: how many examples support the pattern; saturates at 10
  const pop = Number(m.sup ?? m.via ?? 0) || 0;
  const population = Math.min(1, pop / 10);

  const rarity = 1 / odd;

  return { conventionality, population, rarity, odd, pop };
}

export function score(meta) {
  const c = components(meta);
  return Math.round(100 * c.conventionality * c.population * c.rarity);
}

// States that are NOT findings have no business in the ranking — no matter how
// high the arithmetic would put them.
const NOT_A_FINDING = new Set(['MIGRATION', 'TOO_LITTLE', 'TO_CHECK']);

// MERGING. One site can violate several rules at once — in this project
// `bindPlayButtonToPlayerStatus` came out three times (setOnPlaying/setOnPaused/
// setOnStopped -> setOnError), taking ranking positions 4, 5 and 6 and pushing
// findings from other sites down. That is one decision for a human to make, so
// it is one entry; the remaining rules stand beside it as justification.
//
// The unit comes from meta.unit (Java: kind + line of the enclosing function),
// and where that is absent, from the file+line pair. The line number is safe
// here because merging happens WITHIN A SINGLE run, not between runs.
function unitKey(f, detector) {
  return [detector, f.file, (f.meta && f.meta.unit) || f.line || 0].join('|');
}

export function rankSnapshots(snapshots) {
  const groups = new Map();
  for (const s of snapshots)
    for (const f of s.findings) {
      const kind = f.meta && f.meta.kind;
      if (kind && NOT_A_FINDING.has(kind)) continue;
      const detector = f.detector || s.detector;
      const k = unitKey(f, detector);
      const rec = { ...f, detector, root: s.root, score: score(f.meta), comp: components(f.meta) };
      const prev = groups.get(k);
      if (!prev) { groups.set(k, { ...rec, takze: [] }); continue; }
      // the strongest rule stays; weaker ones are listed beside it
      if (rec.score > prev.score) groups.set(k, { ...rec, takze: [...prev.takze, prev.rule] });
      else prev.takze.push(rec.rule);
    }
  const out = [...groups.values()];
  out.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return out;
}

export async function printRanking(snapshots, { top = 20, wiek = null, stabilnosc = false } = {}) {
  const ranked = rankSnapshots(snapshots);

  // PATTERN STABILITY — an optional fourth component of the score.
  // A pattern present in every subset of the population is more trustworthy
  // than one that only emerges from the whole. The value is computed by the
  // detector (see src/oddone.mjs) on CHECKING SUBSETS — the population the
  // rules were mined from stays whole.
  let stabDesc = null;
  if (stabilnosc) {
    let zeSkladnikiem = 0;
    for (const f of ranked) {
      const s = f.meta && f.meta.stab;
      if (typeof s === 'number') { f.score = Math.round(f.score * s); zeSkladnikiem++; }
    }
    ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
    stabDesc = t('stabApplied', zeSkladnikiem, ranked.length);
  }

  // AGE — an optional signal, off by default. A score boost only; nothing is
  // removed or lowered on its basis (see src/age.mjs).
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
        if (a.multiplier !== 1) podbitych++;
        f.score = Math.round(f.score * a.multiplier);
      }
      ranked.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
      wiekOpis = t('ageSignal', podbitych, ranked.length);
    }
  }
  const pominiete = snapshots.reduce((n, s) =>
    n + s.findings.filter(f => f.meta && NOT_A_FINDING.has(f.meta.kind)).length, 0);

  console.log(t('rankTitle'));
  console.log(t('rankSnapshots', snapshots.length, snapshots.map(s => s.detector).join(', ')));
  console.log(t('rankFindings', ranked.length) + (pominiete ? t('rankSkipped', pominiete) : ''));
  console.log('');
  console.log(t('rankFormula'));
  if (wiekOpis) console.log(wiekOpis);
  if (stabDesc) console.log(stabDesc);
  console.log('');

  ranked.slice(0, top).forEach((f, i) => {
    const c = f.comp;
    console.log(String(i + 1).padStart(3) + '. [' + String(f.score).padStart(3) + ']  ' +
      f.detector.padEnd(5) + '  ' + f.file + (f.line ? ':' + f.line : ''));
    console.log('       ' + f.label);
    console.log(t('rankComponents', (c.conventionality * 100).toFixed(0), c.pop, c.odd));
    if (f.takze && f.takze.length) console.log(t('rankAlsoViolates', f.takze.join(', ')));
    if (f.wiek) console.log(t('rankAge', f.wiek.describe));
    if (stabilnosc && f.meta && f.meta.stabDesc)
      console.log(t('rankStability', f.meta.stab, f.meta.stabDesc));
  });

  if (ranked.length > top) console.log(t('rankMore', ranked.length - top));
  return ranked;
}
