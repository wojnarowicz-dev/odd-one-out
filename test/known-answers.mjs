// odd-one-out — the known-answer regression suite.
//
// WHY THIS FILE EXISTS. Five defects were traced by hand in real repositories
// and each one is the reason a detector exists at all. Every one of them MUST
// still be found after any change. Keeping that contract in prose guarantees
// that one day something quietly drops out of it; keeping it here means a
// change that loses a known answer fails loudly.
//
// A missing answer exits 1. Material that cannot be reached exits 2 and says
// what to do — it is never reported as a pass, because "nothing to check" and
// "everything checks out" must not look alike.
//
// MATERIAL. Four of the five answers live in private repositories, so this
// suite cannot run on a bare clone. Paths are overridable:
//     OOO_VAA      VideoAudioAnalyzer checkout
//     OOO_WEB      VideoAnalyzerProWeb checkout
//     OOO_DEPTREE  output of `mvn -o -B dependency:tree` for VideoAudioAnalyzer
// Where a fixture can be reconstructed cheaply from git it is reconstructed
// here (git show / git archive); Maven is never run for you, because a tree
// taken from the wrong revision produces false findings.
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'bin', 'odd-one-out.mjs');

// DEFAULTS ARE SIBLINGS OF THIS REPOSITORY, not absolute paths. An absolute
// path would carry one machine's account name into a public repository and
// would be wrong for everyone else anyway. Override with OOO_VAA / OOO_WEB.
const NEXT_TO_REPO = path.join(HERE, '..', '..');
const VAA = process.env.OOO_VAA || path.join(NEXT_TO_REPO, 'VideoAudioAnalyzer');
const WEB = process.env.OOO_WEB || path.join(NEXT_TO_REPO, 'VideoAnalyzerProWeb');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-known-'));

const results = [];
const record = (name, state, detail) => results.push({ name, state, detail });

function run(args) {
  const snap = path.join(TMP, 'run-' + Math.random().toString(36).slice(2) + '.json');
  const r = spawnSync(process.execPath, [CLI, ...args, '--json', snap],
    { encoding: 'utf8', maxBuffer: 1e9 });
  let findings = null;
  try { findings = JSON.parse(fs.readFileSync(snap, 'utf8')).findings; } catch { /* left null */ }
  return { findings, stdout: r.stdout || '', status: r.status };
}

const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

// ---------------------------------------------------------------- 1. sql
{
  const dir = path.join(VAA, 'supabase', 'migrations');
  if (!exists(dir)) {
    record('release_rate_slot (sql)', 'SKIP', 'no migrations at ' + dir + ' — set OOO_VAA');
  } else {
    const { findings } = run(['sql', dir]);
    const hit = (findings || []).find(f =>
      f.anchor === 'public.release_rate_slot' && f.file.startsWith('20260901130000'));
    record('release_rate_slot (sql)', hit ? 'PASS' : 'FAIL',
      hit ? hit.file + ':' + hit.line : 'not among ' + (findings ? findings.length : '?') + ' findings');
  }
}

// ---------------------------------------------------------------- 2. pom
{
  const before = path.join(TMP, 'pom-before.xml');
  let ready = false;
  if (exists(VAA)) {
    try {
      // the entry was removed by 0dee1b9, so the material is its parent revision
      const xml = execFileSync('git', ['show', '0dee1b9^:main/pom.xml'],
        { cwd: VAA, encoding: 'utf8', maxBuffer: 1e8 });
      fs.writeFileSync(before, xml);
      ready = true;
    } catch { /* not a checkout, or the commit is absent */ }
  }
  const tree = process.env.OOO_DEPTREE || path.join(VAA, 'main', 'deptree.txt');
  if (!ready) {
    record('io.thorntail:javafx (pom)', 'SKIP', 'cannot read 0dee1b9^:main/pom.xml from ' + VAA);
  } else if (!exists(tree)) {
    record('io.thorntail:javafx (pom)', 'SKIP',
      'no dependency tree. Run in ' + path.join(VAA, 'main') +
      ': mvn -o -B dependency:tree > deptree.txt   (or set OOO_DEPTREE)');
  } else {
    const { findings } = run(['pom', '--pom', before, '--tree', tree]);
    const hit = (findings || []).find(f =>
      f.anchor === 'io.thorntail:javafx' && f.rule === 'dead-managed-dep' ||
      f.anchor === 'io.thorntail:javafx' && /martwy|dead/i.test(f.rule));
    record('io.thorntail:javafx (pom)', hit ? 'PASS' : 'FAIL',
      hit ? 'line ' + hit.line : 'not among ' + (findings ? findings.length : '?') + ' findings');
  }
}

// ---------------------------------------------------------------- 3. js
{
  const outDir = path.join(TMP, 'web-before');
  let ready = false;
  let why = 'no checkout at ' + WEB + ' — set OOO_WEB';
  if (exists(WEB)) {
    try {
      fs.mkdirSync(outDir, { recursive: true });
      // the dead call was removed by c45f7a6, so we need its parent revision
      const tar = execFileSync('git', ['archive', 'c45f7a6^', 'main'],
        { cwd: WEB, maxBuffer: 5e8 });
      // THE ARCHIVE IS UNPACKED WITH A RELATIVE NAME, FROM INSIDE outDir, ON
      // PURPOSE. `tar` on Windows may be either bsdtar (System32) or the GNU
      // tar shipped with Git, and whichever comes first on PATH decides. GNU
      // tar reads an absolute Windows path as a remote host spec and fails with
      // "Cannot connect to C: resolve failed" — the whole extraction died on
      // the drive letter. No colon reaches the command line now, so both tars
      // behave the same.
      fs.writeFileSync(path.join(outDir, 'web.tar'), tar);
      execFileSync('tar', ['-xf', 'web.tar'], { cwd: outDir, stdio: 'ignore' });
      fs.rmSync(path.join(outDir, 'web.tar'), { force: true });
      // The whole subtree is needed, not just the page: the js detector reads
      // globals out of the .js files a page loads, so a lone HTML file would
      // make a called function look orphaned and pass the test for the wrong
      // reason.
      ready = exists(path.join(outDir, 'main'));
      if (!ready) why = 'extracted c45f7a6^ but no main/ inside it';
    } catch (e) {
      // Not swallowed: a broken fixture must not read as "material unavailable".
      why = 'extracting c45f7a6^ failed — ' +
        String(e.message).replace(/[\r\n]+/g, ' ').slice(0, 120);
    }
  }
  if (!ready) {
    record('closeAiReqLightbox (js)', 'SKIP', why);
  } else {
    const { findings } = run(['js', path.join(outDir, 'main')]);
    const hit = (findings || []).find(f =>
      f.anchor === 'closeAiReqLightbox' && f.file.endsWith('VideoAnalyzerPro.html') && f.line === 9464);
    record('closeAiReqLightbox (js)', hit ? 'PASS' : 'FAIL',
      hit ? hit.file + ':' + hit.line : 'not among ' + (findings ? findings.length : '?') + ' findings');
  }
}

// ---------------------------------------------------------------- 4. java
{
  const src = path.join(VAA, 'main', 'src', 'main', 'java');
  if (!exists(src)) {
    record('Loading.java:397 / :411 (java)', 'SKIP', 'no sources at ' + src + ' — set OOO_VAA');
    record('Menu.java:5754 (java)', 'SKIP', 'no sources at ' + src + ' — set OOO_VAA');
  } else {
    const { findings } = run(['java', src, '--only', 'setOnError']);
    const at = (name, line) => (findings || []).some(f => f.file.includes(name) && f.line === line);

    const loading = at('Loading.java', 397) && at('Loading.java', 411);
    record('Loading.java:397 / :411 (java)', loading ? 'PASS' : 'FAIL',
      loading ? 'both sites reported' :
        '397=' + at('Loading.java', 397) + ' 411=' + at('Loading.java', 411));

    // The Menu site violates two rules (stop-> and dispose->setOnError) and the
    // ranking merges them, so either line counts as the same known answer.
    const menu = at('Menu.java', 5754) || at('Menu.java', 5753);
    record('Menu.java:5754 (java)', menu ? 'PASS' : 'FAIL',
      menu ? 'reported at ' + (at('Menu.java', 5754) ? '5754' : '5753 (same unit)') : 'absent');
  }
}

// ---------------------------------------------------------------- report
console.log('odd-one-out — known answers\n');
for (const r of results) {
  console.log('  ' + (r.state === 'PASS' ? 'PASS' : r.state === 'FAIL' ? 'FAIL' : 'SKIP') +
    '  ' + r.name.padEnd(34) + r.detail);
}
const failed = results.filter(r => r.state === 'FAIL').length;
const skipped = results.filter(r => r.state === 'SKIP').length;
const passed = results.filter(r => r.state === 'PASS').length;
console.log('\n  ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }

if (failed) {
  console.log('\n  A known answer was lost. That is a regression, not a tuning question.');
  process.exit(1);
}
if (skipped) {
  console.log('\n  Some material was unreachable — this run proves nothing about those answers.');
  process.exit(2);
}
