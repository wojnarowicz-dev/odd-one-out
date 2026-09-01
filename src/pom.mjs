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

console.log('# odd-one-out / pom.xml: martwy wpis w dependencyManagement');
console.log('pom=' + POM);
console.log('drzewa=' + TREES.length + ' (artefaktow w sumie: ' + inTree.size + ')');
console.log('profile: ' + (profiles.length
  ? profiles.map(p => p.id + (p.active ? '*' : '')).join(', ') + '   (* = activeByDefault)'
  : 'brak'));
console.log('wpisow w dependencyManagement=' + managed.length +
  '  zywych=' + live.length + '  MARTWYCH=' + dead.length +
  '  do sprawdzenia=' + suspect.length);
console.log('');

for (const s of suspect) {
  console.log('!! DO SPRAWDZENIA (nie zgloszenie): ' + s.key);
  console.log('   Nie ma go w drzewie, ale JEST zadeklarowany w <dependencies> (' + POM + ':' + s.line + ').');
  console.log('   Najpewniej drzewo pochodzi z innej rewizji pom.xml niz badana, albo profil');
  console.log('   byl nieaktywny przy tamtym przebiegu. Zdejmij drzewo z TEJ rewizji i powtorz.');
  console.log('');
}

if (dead.length === 0) {
  console.log('Brak martwych wpisow.');
} else {
  dead.forEach((e, i) => {
    console.log('## [' + (i + 1) + '] ' + e.key + (e.v ? ':' + e.v : ''));
    console.log('');
    console.log('   CO JEST NIESPOJNE');
    console.log('     ' + POM + ':' + e.line + ' przypina wersje zaleznosci, ktorej nikt nie deklaruje.');
    console.log('     Nie ma jej w drzewie ' + (e.profile ? '(profil ' + e.profile +
      (e.profileActive ? ', activeByDefault' : ', NIEaktywny domyslnie') + ')' : '(zakres glowny)') + '.');
    console.log('     W <dependencies> tego pom.xml: ' + (e.declaredInPom ? 'jest' : 'NIE MA') +
      '. Wpis nie robi nic.');
    console.log('');
    console.log('   JAK ZROBIONO W POZOSTALYCH MIEJSCACH');
    const sameScope = live.filter(l => l.profile === e.profile).slice(0, 2);
    if (sameScope.length) {
      for (const l of sameScope)
        console.log('     ' + POM + ':' + l.line + '   ' + l.key +
          ' — przypiete i obecne w drzewie' + (l.declaredInPom ? ', zadeklarowane w <dependencies>' : ''));
    } else {
      console.log('     (brak zywego wpisu w tym samym zakresie do porownania)');
    }
    console.log('');
    console.log('   GOTOWA POPRAWKA (nie zastosowana)');
    console.log('     // ' + POM + ':' + e.line + ' — usun caly blok:');
    console.log('     -     <dependency>');
    console.log('     -         <groupId>' + e.g + '</groupId>');
    console.log('     -         <artifactId>' + e.a + '</artifactId>');
    if (e.v) console.log('     -         <version>' + e.v + '</version>');
    console.log('     -     </dependency>');
    console.log('     // albo, jesli ta zaleznosc MIALA byc uzywana, dodaj ja do <dependencies>');
    console.log('     //   w tym samym profilu (bez <version> — wersje da dependencyManagement).');
    console.log('');
  });
}

// ---- zapis przebiegu ----
const { maybeWriteSnapshot } = await import('./snapshot.mjs');
maybeWriteSnapshot(argv, {
  detector: 'pom',
  root: POM,
  args: argv.slice(argv.indexOf('--pom') + 2),
  counts: { wpisow: managed.length, zywych: live.length, martwych: dead.length, doSprawdzenia: suspect.length },
  findings: [
    ...dead.map(e => ({
      rule: 'martwy-wpis-dependencyManagement',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — przypina wersje, ktorej nikt nie deklaruje',
      meta: { kind: 'MARTWY', profil: e.profile || '(glowny)' },
    })),
    ...suspect.map(e => ({
      rule: 'wpis-nieobecny-w-drzewie',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — brak w drzewie, ale zadeklarowany',
      meta: { kind: 'DO SPRAWDZENIA', profil: e.profile || '(glowny)' },
    })),
  ],
});
