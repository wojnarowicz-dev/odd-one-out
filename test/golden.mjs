// odd-one-out — golden tests: a full detector run over a fixture directory,
// its --json output compared field by field with a recorded expectation.
//
// WHY A SYNTHETIC PROJECT. The known-answer suite (test/known-answers.mjs)
// measures five real defects and therefore needs two private repositories; it
// says SKIP with a reason when they are absent. That is right for it and wrong
// here: a golden test that cannot run after a clone protects nobody. Everything
// these tests read lives in test/fixtures/, and each fixture has exactly one
// planted deviation described in test/fixtures/README.md.
//
// WHAT IS COMPARED. Everything the snapshot holds except the two fields that
// cannot be stable: `createdAt`, and `root` (an absolute path on this machine).
// The FINGERPRINTS ARE COMPARED. A NUL byte once vanished from the fingerprint
// key and every count stayed exactly the same while every id changed — counts
// alone would have called that run identical.
//
//     node test/golden.mjs            check
//     node test/golden.mjs --update   re-record the expectations
//
// --update rewrites the recorded files. Read the diff it produces before
// committing it: an expectation updated without looking is a test deleted.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const GOLD = path.join(HERE, 'golden');
const UPDATE = process.argv.includes('--update');

// Every case pins its own flags. Thresholds are pinned on purpose: a golden
// test must not change its verdict because a default moved — that is what the
// measurements on real projects are for.
// EVERY CASE PINS --config, and that is not decoration. loadConfig() looks for
// .odd-one-out.json in the scanned directory and then in the CURRENT WORKING
// DIRECTORY, so this repository's own config — which excludes test/fixtures so
// that `npm run self-check` does not report the bait planted there — reached
// into the golden runs and emptied every one of them: "No .java files found",
// exit 0, no snapshot. A golden test that changes its verdict because of a file
// somewhere above it is measuring the machine, not the tool.
const CONFIG = 'test/fixtures/golden.config.json';

const CASES = [
  { name: 'java', args: ['java', 'test/fixtures/java'] },
  { name: 'js', args: ['js', 'test/fixtures/js'] },
  { name: 'sql', args: ['sql', 'test/fixtures/sql'] },
  { name: 'pom', args: ['pom', '--pom', 'test/fixtures/pom/pom.xml', '--tree', 'test/fixtures/pom/deptree.txt'] },
  { name: 'deps', args: ['deps', 'test/fixtures/deps'] },
].map(c => ({ ...c, args: [...c.args, '--config', CONFIG] }));

const slash = s => String(s).split(path.sep).join('/');

/** Drops what cannot be stable between machines and runs; keeps everything else. */
function normalise(snap) {
  const { createdAt, root, ...rest } = snap;
  return {
    ...rest,
    root: slash(path.relative(ROOT, root)) || '.',
    findings: (rest.findings || []).map(f => ({ ...f, file: slash(f.file) })),
  };
}

/** Field-level difference, so a failure says WHAT moved rather than "not equal". */
function differences(a, b, prefix = '') {
  const out = [];
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  for (const k of keys) {
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    const p = prefix ? prefix + '.' + k : k;
    const obj = v => v && typeof v === 'object' && !Array.isArray(v);
    if (obj(x) && obj(y)) { out.push(...differences(x, y, p)); continue; }
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) out.push(p + ': ' + x.length + ' entries -> ' + y.length);
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) {
        if (obj(x[i]) && obj(y[i])) out.push(...differences(x[i], y[i], p + '[' + i + ']'));
        else if (JSON.stringify(x[i]) !== JSON.stringify(y[i]))
          out.push(p + '[' + i + ']: ' + JSON.stringify(x[i]) + ' -> ' + JSON.stringify(y[i]));
      }
      continue;
    }
    if (JSON.stringify(x) !== JSON.stringify(y))
      out.push(p + ': ' + JSON.stringify(x) + ' -> ' + JSON.stringify(y));
  }
  return out;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-golden-'));
fs.mkdirSync(GOLD, { recursive: true });

let failed = 0, updated = 0, passed = 0;
console.log('odd-one-out — golden tests\n');

for (const c of CASES) {
  // A FRESH snapshot path every time: several detectors diff against whatever
  // the file already holds, so reusing one would make the result depend on the
  // order the cases ran in.
  const out = path.join(TMP, c.name + '.json');
  const r = spawnSync(process.execPath, [CLI, ...c.args, '--lang', 'en', '--json', out],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });

  if (!fs.existsSync(out)) {
    console.log('  FAIL  ' + c.name.padEnd(6) + 'no snapshot written (exit ' + r.status + ')');
    console.log('        ' + String(r.stderr || r.stdout).trim().split(/[\r\n]+/).slice(-3).join(' | ').slice(0, 200));
    failed++;
    continue;
  }

  const got = normalise(JSON.parse(fs.readFileSync(out, 'utf8')));
  const expFile = path.join(GOLD, c.name + '.json');

  if (UPDATE || !fs.existsSync(expFile)) {
    const had = fs.existsSync(expFile);
    const before = had ? JSON.parse(fs.readFileSync(expFile, 'utf8')) : null;
    fs.writeFileSync(expFile, JSON.stringify(got, null, 2) + '\n');
    const d = had ? differences(before, got) : [];
    console.log('  ' + (had ? 'UPDATED' : 'RECORDED').padEnd(6) + ' ' + c.name.padEnd(6) +
      got.findings.length + ' findings' + (had && d.length ? '  (' + d.length + ' fields changed)' : ''));
    for (const line of d.slice(0, 10)) console.log('          ' + line);
    updated++;
    continue;
  }

  const exp = JSON.parse(fs.readFileSync(expFile, 'utf8'));
  const d = differences(exp, got);
  if (d.length === 0) {
    console.log('  PASS  ' + c.name.padEnd(6) + got.findings.length + ' findings, fingerprints identical');
    passed++;
  } else {
    console.log('  FAIL  ' + c.name.padEnd(6) + d.length + ' field(s) differ from ' +
      slash(path.relative(ROOT, expFile)));
    for (const line of d.slice(0, 12)) console.log('          ' + line);
    if (d.length > 12) console.log('          ... and ' + (d.length - 12) + ' more');
    failed++;
  }
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }

console.log('\n  ' + passed + ' passed, ' + failed + ' failed' + (updated ? ', ' + updated + ' recorded' : ''));
if (failed) {
  console.log('\n  A recorded run changed. Either the change is wrong, or the recording is\n' +
    '  out of date — decide which before running --update.');
  process.exit(1);
}
