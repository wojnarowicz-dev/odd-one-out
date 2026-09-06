// odd-one-out / pom.xml pair — a dead entry in dependencyManagement.
//
// dependencyManagement only PINS VERSIONS for dependencies declared elsewhere.
// An entry nobody declares does nothing — but reading pom.xml alone will not
// show that, because the declaration may be transitive or live in a profile.
//
// So we compare two things:
//   - the entries in dependencyManagement (from pom.xml, attributed to profiles)
//   - the actual tree from `mvn dependency:tree`
// An entry present in the first and absent from the second is dead.
//
// MIND THE PROFILES: `mvn -P X` DISABLES profiles marked activeByDefault. The
// tree has to be taken with the same profile set the entry lives in — otherwise
// the tool reports everything from the default profiles as dead. That is why
// --tree accepts several files: we take the union of artefacts from all runs.
import fs from 'node:fs';
import { flagAll as allValues } from './args.mjs';
import { t } from './lang.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';

const argv = process.argv.slice(2);
const flagAll = (n) => allValues(argv, n);
const POM = flagAll('pom')[0];
const TREES = flagAll('tree');
if (!POM || TREES.length === 0) {
  console.error(t('pomUsage'));
  process.exit(2);
}

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, POM.replace(/[^\/]+$/, ''));

const xml = readSource(POM);

// --- properties, żeby rozwinąć ${...} w wersjach ---
const props = new Map();
const propBlock = xml.match(/<properties>([\s\S]*?)<\/properties>/);
if (propBlock)
  for (const m of propBlock[1].matchAll(/<([A-Za-z0-9_.\-]+)>([^<]*)<\/\1>/g))
    props.set(m[1], m[2].trim());
const expand = v => (v || '').replace(/\$\{([^}]+)\}/g, (_, k) => props.get(k) ?? '${' + k + '}');

// --- which profile a given offset in the file falls into ---
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

// --- declarations: <dependencies> poza dependencyManagement ---
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
  const txt = readSource(f);
  for (const line of txt.split('\n')) {
    const m = line.match(/([A-Za-z0-9_.\-]+):([A-Za-z0-9_.\-]+):[a-z-]+:([^:\s]+)(:[a-z]+)?\s*$/);
    if (m) inTree.add(m[1] + ':' + m[2]);
  }
}

// --- rozstrzygnięcie ---
// Two levels of evidence that must not be confused:
//   DEAD      — absent from the tree AND declared nowhere in <dependencies>.
//               Two independent witnesses; the verdict does not depend on how
//               fresh the tree is.
//   TO_CHECK  — absent from the tree, but DECLARED in <dependencies>. The usual
//               cause is a tree taken from a different pom.xml revision than the
//               one examined (or an inactive profile during that run), not a
//               dead entry. Reported separately and more weakly.
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

// ---- run snapshot and diff ----
const { prepare, diffHeader, resultExit } = await import('./snapshot.mjs');
const w = prepare(argv, {
  detector: 'pom',
  root: POM,
  cfg,
  args: argv.slice(argv.indexOf('--pom') + 2),
  counts: { managed: managed.length, live: live.length, dead: dead.length, toCheck: suspect.length },
  findings: [
    ...dead.map(e => ({
      rule: 'martwy-wpis-dependencyManagement',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — przypina wersje, ktorej nikt nie deklaruje',
      meta: { kind: 'DEAD', profil: e.profile || '(glowny)', via: live.length, odd: dead.length },
    })),
    ...suspect.map(e => ({
      rule: 'wpis-nieobecny-w-drzewie',
      file: POM, anchor: e.key, line: e.line,
      label: e.key + ' — missing w drzewie, ale zadeklarowany',
      meta: { kind: 'TO_CHECK', profil: e.profile || '(glowny)', via: live.length, odd: suspect.length },
    })),
  ],
});
const visible = new Set(w.toShow.map(f => f.anchor));
diffHeader(w);
console.log('');
resultExit(w.newCount ? 1 : 0);

for (const s of suspect.filter(x => visible.has(x.key))) {
  console.log(t('pomSuspect1', s.key));
  console.log(t('pomSuspect2', POM, s.line));
  console.log(t('pomSuspect3'));
  console.log(t('pomSuspect4'));
  console.log('');
}

if (dead.length === 0) {
  console.log(t('pomNoDead'));
} else {
  dead.filter(e => visible.has(e.key)).forEach((e, i) => {
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

// One sentence if any source was not valid UTF-8. Printed last, so it is the
// line left on screen rather than something scrolled past.
reportNonUtf8();
