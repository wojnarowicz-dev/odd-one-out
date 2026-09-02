// odd-one-out / para pom.xml — martwy wpis w dependencyManagement.
//
// dependencyManagement tylko PRZYPINA WERSJE zależnościom zadeklarowanym gdzie
// indziej. Wpis, którego nikt nie deklaruje, nie robi nic — ale samo czytanie
// pom.xml tego nie pokaże, bo deklaracja może być tranzytywna albo w profilu.
//
// Dlatego porównujemy dwie rzeczy:
//   - wpisy w dependencyManagement (z pom.xml, z atrybucją do profilu)
//   - rzeczywiste drzewo z `mvn dependency:tree`
// Wpis, który jest w pierwszym i nie występuje w drugim, jest martwy.
//
// UWAGA na profile: `mvn -P X` WYŁĄCZA profile z activeByDefault. Drzewo trzeba
// zdjąć tym samym zestawem profili, w którym wpis żyje — inaczej narzędzie
// zgłosi jako martwe wszystko z profili domyślnych. Stąd --tree przyjmuje wiele
// plików: sumujemy artefakty ze wszystkich przebiegów.
import fs from 'node:fs';
import { t } from './lang.mjs';

const argv = process.argv.slice(2);
const flagAll = (n) => {
  const out = [];
  for (let i = 0; i < argv.length; i++)
    if (argv[i] === '--' + n) { let j = i + 1; while (j < argv.length && !argv[j].startsWith('--')) out.push(argv[j++]); }
  return out;
};
const POM = flagAll('pom')[0];
const TREES = flagAll('tree');
if (!POM || TREES.length === 0) {
  console.error('uzycie: node src/pom.mjs --pom <pom.xml> --tree <deptree.txt> [wiecej...]');
  process.exit(2);
}

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, POM.replace(/[^\/]+$/, ''));

const xml = fs.readFileSync(POM, 'utf8');

// --- properties, żeby rozwinąć ${...} w wersjach ---
const props = new Map();
const propBlock = xml.match(/<properties>([\s\S]*?)<\/properties>/);
if (propBlock)
  for (const m of propBlock[1].matchAll(/<([A-Za-z0-9_.\-]+)>([^<]*)<\/\1>/g))
    props.set(m[1], m[2].trim());
const expand = v => (v || '').replace(/\$\{([^}]+)\}/g, (_, k) => props.get(k) ?? '${' + k + '}');

// --- w którym profilu leży dany offset w pliku ---
const profiles = [];
for (const m of xml.matchAll(/<profile>([\s\S]*?)<\/profile>/g)) {
  const id = (m[1].match(/<id>([^<]+)<\/id>/) || [, '?'])[1];
  const active = /<activeByDefault>\s*true\s*<\/activeByDefault>/.test(m[1]);
  profiles.push({ id, active, start: m.index, end: m.index + m[0].length });
}
const profileAt = i => profiles.find(p => i >= p.start && i < p.end) || null;

const parseDeps = (block) => {
  const out = [];
  for (const d of block.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const g = (d[1].match(/<groupId>([^<]+)<\/groupId>/) || [])[1];
    const a = (d[1].match(/<artifactId>([^<]+)<\/artifactId>/) || [])[1];
    const v = (d[1].match(/<version>([^<]+)<\/version>/) || [])[1];
    if (g && a) out.push({ g: g.trim(), a: a.trim(), v: expand(v), at: d.index });
  }
  return out;
};

// --- wpisy dependencyManagement, z atrybucją do profilu ---
const managed = [];
for (const m of xml.matchAll(/<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/g)) {
  const prof = profileAt(m.index);
  for (const d of parseDeps(m[1])) {
    const line = xml.slice(0, m.index + d.at).split('\n').length;
    managed.push({ ...d, line, profile: prof ? prof.id : null, profileActive: prof ? prof.active : true });
  }
}

// --- deklaracje: <dependencies> poza dependencyManagement ---
const dmRanges = [...xml.matchAll(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g)]
  .map(m => [m.index, m.index + m[0].length]);
const inDm = i => dmRanges.some(([s, e]) => i >= s && i < e);
const declared = new Set();
for (const m of xml.matchAll(/<dependencies>([\s\S]*?)<\/dependencies>/g)) {
  if (inDm(m.index)) continue;
  for (const d of parseDeps(m[1])) declared.add(d.g + ':' + d.a);
}

// --- artefakty z drzewa ---
const inTree = new Set();
for (const f of TREES) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/([A-Za-z0-9_.\-]+):([A-Za-z0-9_.\-]+):[a-z-]+:([^:\s]+)(:[a-z]+)?\s*$/);
    if (m) inTree.add(m[1] + ':' + m[2]);
  }
}

// --- rozstrzygnięcie ---
// Dwa poziomy dowodu, których nie wolno mylić:
//   MARTWY    — nieobecny w drzewie ORAZ nigdzie niezadeklarowany w <dependencies>.
//               Dwa niezależne świadectwa; werdykt nie zależy od świeżości drzewa.
//   DO SPRAWDZENIA — nieobecny w drzewie, ale ZADEKLAROWANY w <dependencies>.
//               Najczęstsza przyczyna to drzewo zdjęte z innej rewizji pom.xml niż
//               badana (albo profil nieaktywny przy tamtym przebiegu), a nie martwy
//               wpis. Zgłaszamy osobno i słabiej.
const dead = [], suspect = [], live = [];
for (const e of managed) {
  const key = e.g + ':' + e.a;
  const rec = { ...e, key, declaredInPom: declared.has(key) };
  if (inTree.has(key)) live.push(rec);
  else if (rec.declaredInPom) suspect.push(rec);
  else dead.push(rec);
}

console.log(t('pomTitle'));
console.log('pom=' + POM);
console.log(t('pomTrees', TREES.length, inTree.size));
console.log(t('pomProfiles', profiles.length ? profiles.map(p => p.id + (p.active ? '*' : '')).join(', ') + t('pomActiveByDefault') : t('pomProfilesNone')));
console.log(t('pomCounts', managed.length, live.length, dead.length, suspect.length));
console.log('');

// ---- zapis przebiegu i roznica ----
const { przygotuj, naglowekRoznicy } = await import('./snapshot.mjs');
const w = przygotuj(argv, {
  detector: 'pom',
  root: POM,
  cfg,
  args: argv.slice(argv.indexOf('--pom') + 2),
  counts: { wpisow: managed.length, zywych: live.length, martwych: dead.length, doSprawdzenia: suspect.length },
  findings: [
    ...dead.map(e => ({
      rule: 'martwy-wpis-dependencyManagement',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — przypina wersje, ktorej nikt nie deklaruje',
      meta: { kind: 'MARTWY', profil: e.profile || '(glowny)', via: live.length, odd: dead.length },
    })),
    ...suspect.map(e => ({
      rule: 'wpis-nieobecny-w-drzewie',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — brak w drzewie, ale zadeklarowany',
      meta: { kind: 'DO SPRAWDZENIA', profil: e.profile || '(glowny)', via: live.length, odd: suspect.length },
    })),
  ],
});
const pokaz = new Set(w.doPokazania.map(f => f.anchor));
naglowekRoznicy(w);
console.log('');
process.exitCode = w.nowych ? 1 : 0;

for (const s of suspect.filter(x => pokaz.has(x.key))) {
  console.log(t('pomSuspect1', s.key));
  console.log(t('pomSuspect2', POM, s.line));
  console.log(t('pomSuspect3'));
  console.log(t('pomSuspect4'));
  console.log('');
}

if (dead.length === 0) {
  console.log(t('pomNoDead'));
} else {
  dead.filter(e => pokaz.has(e.key)).forEach((e, i) => {
    console.log('## [' + (i + 1) + '] ' + e.key + (e.v ? ':' + e.v : ''));
    console.log('');
    console.log(t('secInconsistent'));
    console.log(t('pomBody1', POM, e.line));
    console.log(t('pomBody2', e.profile ? t('pomScopeProfile', e.profile, e.profileActive ? t('pomActiveSuffix') : t('pomInactiveSuffix')) : t('pomScopeMain')));
    console.log(t('pomBody3', e.declaredInPom ? t('pomYes') : t('pomNo')));
    console.log('');
    console.log(t('secElsewhere'));
    const sameScope = live.filter(l => l.profile === e.profile).slice(0, 2);
    if (sameScope.length) {
      for (const l of sameScope)
        console.log(t('pomLive', POM, l.line, l.key, l.declaredInPom ? t('pomAlsoDeclared') : ''));
    } else {
      console.log(t('pomNoComparable'));
    }
    console.log('');
    console.log(t('secFix'));
    console.log(t('pomFix1', POM, e.line));
    console.log('     -     <dependency>');
    console.log('     -         <groupId>' + e.g + '</groupId>');
    console.log('     -         <artifactId>' + e.a + '</artifactId>');
    if (e.v) console.log('     -         <version>' + e.v + '</version>');
    console.log('     -     </dependency>');
    console.log(t('pomFix2'));
    console.log(t('pomFix3'));
    console.log('');
  });
}

