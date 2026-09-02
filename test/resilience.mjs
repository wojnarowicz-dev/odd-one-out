// odd-one-out — failure resilience.
//
// ONE CRITERION: fail loudly, or carry on — never quietly return zero.
//
// The middle case is the dangerous one, and it is not hypothetical. While the
// golden tests were being written, an exclusion in this repository's own
// .odd-one-out.json reached the fixture runs through the current working
// directory. Every detector printed "No .java files found", wrote no snapshot,
// and exited 0. Nothing was broken as far as any exit code could tell; the
// suite had simply stopped measuring anything. That is the shape this file
// hunts for.
//
// Each scenario damages something on purpose, then the run is classified:
//
//   CRASH   the process died — loud, but not on purpose
//   LOUD    exit 2, the tool's code for "your input is the problem"
//   SPOKE   ran normally (exit 0 or 1), and said something a healthy run does not
//   SILENT  ran normally and said nothing new                <-- the failure
//
// EVERY SCENARIO RUNS TWICE: once damaged, once healthy. A phrase only counts
// as speaking about the damage if it appears in the damaged run AND NOT in the
// healthy one. This is not caution, it is the correction of two measurement
// errors this file has already made:
//
//   * exit codes were read as alarms. Exit 1 means "findings were reported",
//     and every fixture here has a planted deviation, so exit 1 arrived whether
//     or not the damage was noticed. Eight of eleven scenarios were reported as
//     handled; four had simply found the planted deviation.
//   * then the keywords matched healthy output. "truncated snapshot" passed on
//     the word `snapshot` in the ordinary line `run snapshot saved`, and
//     "snapshot from a future version" passed on its own file name in that same
//     line. Both were silent in reality and both showed green.
//
// A criterion that a healthy run satisfies measures nothing. The control run
// makes that impossible to get wrong by choosing words carelessly.
//
// A scenario whose damage cannot be staged on this machine (denying read
// permission needs icacls on Windows) reports SKIP with the reason. It is never
// counted as a pass — "could not test" and "tested fine" must not look alike.
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-resil-'));

// Fixtures are copied rather than damaged in place: a test that mutated
// test/fixtures/ would break the golden suite the moment it crashed halfway.
// The copies also sit outside the repository, so the root .odd-one-out.json —
// which excludes test/fixtures so self-check stays quiet — does not reach them.
function copyFixture(name, into) {
  fs.mkdirSync(into, { recursive: true });
  const from = path.join(HERE, 'fixtures', name);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.isFile()) fs.copyFileSync(path.join(from, e.name), path.join(into, e.name));
  }
  return into;
}

let counter = 0;
const dir = n => {
  const d = path.join(TMP, n + '-' + (++counter));
  fs.mkdirSync(d, { recursive: true });
  return d;
};

/** An undamaged copy of a fixture, for the control run. */
const pristine = (name, det = 'java') => [det, copyFixture(name, dir('zdrowy-' + name))];

function run(args) {
  const r = spawnSync(process.execPath, [CLI, ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// ---------------------------------------------------------------- scenarios
const SCENARIOS = [];
const scenario = (name, damage, build, speaks, control) =>
  SCENARIOS.push({ name, damage, build, speaks, control });

scenario('empty directory (java)', 'nothing to read at all',
  () => ['java', dir('pusty-java')],
  ['No .java files'],
  () => pristine('java'));

scenario('empty directory (sql)', 'nothing to read at all',
  () => ['sql', dir('pusty-sql')],
  ['No .sql files'],
  () => pristine('sql', 'sql'));

scenario('empty directory (deps)', 'nothing to read at all',
  () => ['deps', dir('pusty-deps')],
  ['No .java'],
  () => pristine('deps', 'deps'));

scenario('binary junk in a .java file', 'one source file is not source at all',
  () => {
    const d = copyFixture('java', dir('smiec-java'));
    const junk = Buffer.alloc(2048);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 37) % 256;
    fs.writeFileSync(path.join(d, 'Broken.java'), junk);
    return ['java', d];
  },
  ['Broken.java', 'parse errors', 'bledow'],
  () => pristine('java'));

scenario('truncated source file', 'a class that stops mid-method',
  () => {
    const d = copyFixture('java', dir('uciety-java'));
    const s = fs.readFileSync(path.join(d, 'Player.java'), 'utf8');
    fs.writeFileSync(path.join(d, 'Half.java'), s.slice(0, Math.floor(s.length / 2)));
    return ['java', d];
  },
  ['Half.java', 'parse errors', 'bledow'],
  () => pristine('java'));

scenario('non-UTF-8 source (cp1250)', 'bytes that are not valid UTF-8',
  () => {
    const d = copyFixture('java', dir('cp1250-java'));
    // Windows-1250 bytes for a Polish comment; 0x9c 0xe6 0xb3 0xea are not
    // valid UTF-8 and Node replaces each with U+FFFD when read as utf8.
    const head = Buffer.from('package fixture;\n\n// zapisano w cp1250: ', 'utf8');
    const bytes = Buffer.from([0x9c, 0xe6, 0xb3, 0xea, 0x0a]);
    const tail = Buffer.from('\npublic class Cp1250 {\n    public void a() { }\n}\n', 'utf8');
    fs.writeFileSync(path.join(d, 'Cp1250.java'), Buffer.concat([head, bytes, tail]));
    return ['java', d];
  },
  ['outside UTF-8', 'spoza UTF-8', 'Cp1250.java'],
  () => pristine('java'));

scenario('unreadable source file', 'read permission denied',
  () => {
    const d = copyFixture('java', dir('bez-prawa'));
    const target = path.join(d, 'Locked.java');
    fs.copyFileSync(path.join(d, 'Player.java'), target);
    const who = process.env.USERNAME || process.env.USER;
    if (!who) return { skip: 'no USERNAME to deny' };
    try {
      execFileSync('icacls', [target, '/deny', who + ':(R)'], { stdio: 'ignore' });
    } catch (e) {
      return { skip: 'icacls failed: ' + String(e.message).slice(0, 60) };
    }
    try {
      fs.readFileSync(target);
      return { skip: 'icacls /deny did not actually block reading' };
    } catch {
      return ['java', d];
    }
  },
  ['Locked.java', 'EPERM', 'EACCES', 'permission'],
  () => pristine('java'));

// A snapshot damaged the way an interrupted write leaves it. The control uses
// a snapshot written properly by a first run, so everything the tool prints
// about a healthy comparison is subtracted.
scenario('truncated snapshot to diff against', 'previous run cut in half',
  () => {
    const d = copyFixture('java', dir('uciety-zapis'));
    const snap = path.join(d, 'zapis.json');
    fs.writeFileSync(snap, '{\n  "version": 1,\n  "detector": "java",\n  "findings": [\n    {"id": "abc');
    return ['java', d, '--json', snap];
  },
  ['could not be read', 'nie da sie odczytac', 'unreadable'],
  () => {
    const d = copyFixture('java', dir('zdrowy-zapis'));
    const snap = path.join(d, 'zapis.json');
    run(['java', d, '--json', snap]);          // a real previous run
    return ['java', d, '--json', snap];
  });

scenario('snapshot from a future version', 'a version the tool does not know',
  () => {
    const d = copyFixture('java', dir('przyszly-zapis'));
    const snap = path.join(d, 'zapis.json');
    fs.writeFileSync(snap, JSON.stringify(
      { version: 999, tool: 'odd-one-out', detector: 'java', findings: [] }));
    return ['java', d, '--json', snap];
  },
  ['could not be read', 'nie da sie odczytac', 'unreadable'],
  () => {
    const d = copyFixture('java', dir('zdrowy-zapis2'));
    const snap = path.join(d, 'zapis.json');
    run(['java', d, '--json', snap]);
    return ['java', d, '--json', snap];
  });

scenario('--json points at a directory', 'the snapshot cannot be written',
  () => {
    const d = copyFixture('java', dir('zapis-katalog'));
    return ['java', d, '--json', dir('to-jest-katalog')];
  },
  ['EISDIR', 'that is a directory', 'to jest katalog'],
  () => {
    const d = copyFixture('java', dir('zapis-plik'));
    return ['java', d, '--json', path.join(d, 'zapis.json')];
  });

scenario('root does not exist', 'the scanned path is not there',
  () => ['java', path.join(TMP, 'nie-ma-mnie')],
  ['nie-ma-mnie'],
  () => pristine('java'));

// ---------------------------------------------------------------- run
console.log('odd-one-out — failure resilience\n');
const rows = [];
for (const s of SCENARIOS) {
  if (typeof s.control !== 'function') {
    rows.push({ ...s, state: 'SKIP', detail: 'no control run defined — the criterion cannot be trusted' });
    continue;
  }

  let args;
  try { args = s.build(); } catch (e) { args = { skip: String(e.message).slice(0, 70) }; }
  if (args && args.skip) { rows.push({ ...s, state: 'SKIP', detail: args.skip }); continue; }

  const damaged = run(args);
  const healthy = run(s.control());

  // The phrase must distinguish. Present in both means it says nothing about
  // the damage, however alarming it reads.
  const said = s.speaks.filter(k => damaged.out.includes(k) && !healthy.out.includes(k));
  const useless = s.speaks.filter(k => damaged.out.includes(k) && healthy.out.includes(k));

  const status = damaged.status;
  const state = (status !== 0 && status !== 1 && status !== 2) ? 'CRASH'
    : status === 2 ? 'LOUD'
      : said.length ? 'SPOKE' : 'SILENT';

  let detail = 'exit ' + status;
  if (state === 'SPOKE') detail += '   "' + said[0] + '"';
  if (state === 'SILENT' && useless.length)
    detail += '   ("' + useless[0] + '" also printed by a healthy run)';
  rows.push({ ...s, state, detail });
}

for (const r of rows) console.log('  ' + r.state.padEnd(7) + r.name.padEnd(34) + r.detail);

// ---------------------------------------------------------------- property
// THE NEGATIVE CHECK FOR THE TWO-PHASE WRITE. What the temp-file-and-rename
// buys is one property: a write that fails does not destroy the snapshot that
// was already there. Asserting it needs the write to fail AFTER the run has
// produced its results, which cannot be staged from outside the process — so
// this one calls writeSnapshot directly.
//
// The temp path is predictable in-process (".<name>.tmp-<pid>", and the pid is
// ours), so putting a directory in its place makes the write fail at exactly
// the moment that matters. Under a single-phase write there would be no temp
// file, the target would have been truncated first, and the baseline would be
// gone. Here it must survive whole.
let propertyFailed = false;
{
  const { writeSnapshot } = await import('../src/snapshot.mjs');
  const d = dir('wlasnosc-zapisu');
  const target = path.join(d, 'zapis.json');
  const good = { version: 1, tool: 'odd-one-out', detector: 'java', root: d, args: [], counts: {}, findings: [] };

  writeSnapshot(target, good);
  const before = fs.readFileSync(target, 'utf8');

  // block the temp path this process would use
  fs.mkdirSync(path.join(d, '.' + path.basename(target) + '.tmp-' + process.pid));

  const kod = process.exitCode;
  const result = writeSnapshot(target, { ...good, findings: [{ id: 'nowe' }] });
  process.exitCode = kod;                       // the suite decides its own code

  const after = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const survived = after === before;
  const refused = result === null;

  console.log('');
  console.log('  (the EISDIR message above is this check working, not a failure)');
  console.log('  ' + (survived && refused ? 'PASS  ' : 'FAIL  ') +
    'a failed write leaves the previous snapshot intact   ' +
    (survived ? 'baseline whole' : 'BASELINE DAMAGED') +
    (refused ? ', write refused' : ', write claimed success'));
  propertyFailed = !(survived && refused);
}

const silent = rows.filter(r => r.state === 'SILENT');
const crashed = rows.filter(r => r.state === 'CRASH');
const skipped = rows.filter(r => r.state === 'SKIP');
const loud = rows.filter(r => r.state === 'LOUD').length;
const spoke = rows.filter(r => r.state === 'SPOKE').length;

console.log('\n  ' + loud + ' loud, ' + spoke + ' spoke, ' + crashed.length + ' CRASH, ' +
  silent.length + ' SILENT' + (skipped.length ? ', ' + skipped.length + ' skipped' : ''));

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* denied ACLs may resist */ }

if (crashed.length) {
  console.log('\n  Crashed:');
  for (const r of crashed)
    console.log('    ' + r.name + ' — ' + r.damage + ', and the process died instead of saying so');
}
if (silent.length) {
  console.log('\n  Silent zeros:');
  for (const r of silent) console.log('    ' + r.name + ' — ' + r.damage + ', and nothing said');
  console.log('\n  A run that returns nothing without saying why cannot be told from a clean run.');
}
if (silent.length || crashed.length || propertyFailed) process.exit(1);
if (skipped.length) process.exit(2);
