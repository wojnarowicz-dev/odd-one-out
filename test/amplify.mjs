// odd-one-out — amplification: the fixtures, deliberately perturbed.
//
// WHAT THIS ADDS OVER THE GOLDEN TESTS. Golden tests pin one output for one
// input. They prove the tool still says the same thing; they do not prove it
// says anything ABOUT the input. A detector hard-wired to report exactly one
// finding at Player.java:27 would pass every golden test in this repository.
//
// So each fixture is perturbed in a way whose consequence is known in advance,
// and the finding count must move accordingly:
//
//   * remove the planted deviation      -> the finding must disappear
//   * plant a second one                -> the count must go up
//   * thin the convention below its threshold -> nothing may be reported,
//     because the tool compares code to the rest of THIS project and there is
//     no longer enough of it
//
// EVERY CASE IS ITS OWN NEGATIVE CHECK. A perturbation whose count does not
// move is reported as a failure even when the tool "worked": it means the
// output does not depend on the thing that was changed, and a test that cannot
// tell the difference is measuring its own echo. That mistake has been made
// four times in this repository — exit 1 read as an alarm, the word `snapshot`
// matching a healthy run, a shell loop cut at the drive letter, and a patch
// script whose substitution silently never applied.
//
// The fixtures themselves are never touched: every case works on a copy.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-amp-'));

let n = 0;
function copyFixture(name) {
  const into = path.join(TMP, name + '-' + (++n));
  fs.mkdirSync(into, { recursive: true });
  const from = path.join(HERE, 'fixtures', name);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isFile()) fs.copyFileSync(path.join(from, e.name), path.join(into, e.name));
  }
  return into;
}

const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const write = (d, f, s) => fs.writeFileSync(path.join(d, f), s);

function findings(detector, dir, extra = []) {
  const snap = path.join(TMP, 'snap-' + (++n) + '.json');
  spawnSync(process.execPath, [CLI, detector, dir, ...extra, '--lang', 'en', '--json', snap],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  try { return JSON.parse(fs.readFileSync(snap, 'utf8')).findings.length; } catch { return null; }
}

const CASES = [];
const amplify = (name, detector, fixture, expect, perturb) =>
  CASES.push({ name, detector, fixture, expect, perturb });

// ---------------------------------------------------------------- java
amplify('java: deviation removed -> gone', 'java', 'java', 0, d => {
  write(d, 'Player.java', read(d, 'Player.java').replace(
    'public void openFourth(String url) {\n        player.stop();',
    'public void openFourth(String url) {\n        player.stop();\n        player.dispose();'));
});

amplify('java: second deviation -> two', 'java', 'java', 2, d => {
  write(d, 'Player.java', read(d, 'Player.java').replace(
    /\}\s*$/,
    '    public void openFifth(String url) {\n        player.stop();\n    }\n}\n'));
});

amplify('java: convention thinned -> silent', 'java', 'java', 0, d => {
  // three conforming methods down to one: below minsup=3, no convention left
  let s = read(d, 'Player.java');
  s = s.replace('    public void openSecond(String url) {\n        player.stop();\n        player.dispose();\n    }\n\n', '');
  s = s.replace('    public void openThird(String url) {\n        player.stop();\n        player.dispose();\n    }\n\n', '');
  write(d, 'Player.java', s);
});

// ---------------------------------------------------------------- sql
amplify('sql: grant added -> gone', 'sql', 'sql', 0, d => {
  const f = '20260104000000_release_slot.sql';
  write(d, f, read(d, f).replace(
    '-- planted deviation: no grant execute, so nobody can call it',
    'grant execute on function public.release_slot(uuid) to authenticated;'));
});

amplify('sql: convention thinned -> silent', 'sql', 'sql', 0, d => {
  fs.rmSync(path.join(d, '20260101000000_take_slot.sql'));
  fs.rmSync(path.join(d, '20260102000000_free_slot.sql'));
});

// ---------------------------------------------------------------- js
amplify('js: missing function defined -> gone', 'js', 'js', 0, d => {
  write(d, 'page.html', read(d, 'page.html').replace(
    '      function togglePanel()',
    '      function resetPanelState() { }\n      function togglePanel()'));
});

// ---------------------------------------------------------------- deps
amplify('deps: one stray routed through the layer -> one left', 'deps', 'deps', 1, d => {
  write(d, 'Direct1.java', read(d, 'Direct1.java')
    .replace('import java.nio.file.Files;', 'import fixture.io.Fs;')
    .replace('Files.readAllLines(p)', 'Fs.readAllLinesSafe(p)'));
});

amplify('deps: every stray routed -> gone', 'deps', 'deps', 0, d => {
  for (const f of ['Direct1.java', 'Direct2.java']) {
    write(d, f, read(d, f)
      .replace('import java.nio.file.Files;', 'import fixture.io.Fs;')
      .replace('Files.readAllLines(p)', 'Fs.readAllLinesSafe(p)'));
  }
});

// ---------------------------------------------------------------- run
console.log('odd-one-out — amplification\n');

const baselineOf = new Map();
for (const f of ['java', 'sql', 'js', 'deps']) {
  const det = f;
  baselineOf.set(f, findings(det, copyFixture(f)));
}

let failed = 0;
for (const c of CASES) {
  const dir = copyFixture(c.fixture);
  const before = baselineOf.get(c.fixture);
  c.perturb(dir);
  const after = findings(c.detector, dir);

  const asExpected = after === c.expect;
  const moved = after !== before;
  const ok = asExpected && moved;
  if (!ok) failed++;

  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + c.name.padEnd(46) +
    before + ' -> ' + after + '  (expected ' + c.expect + ')' +
    (asExpected && !moved ? '   NOT DISCRIMINATING: unchanged by the perturbation' : ''));
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }

console.log('\n  ' + (CASES.length - failed) + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\n  A perturbation did not produce the consequence it must produce. Either the\n' +
    '  detector stopped depending on what was changed, or the expectation is wrong.');
  process.exit(1);
}
