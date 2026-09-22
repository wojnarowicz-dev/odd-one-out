// odd-one-out — does a second run know about the first?
//
// WHY THIS LAYER EXISTS. Every detector's help screen promises a DIFFERENTIAL
// contract: "1 — NEW deviations". A project with two hundred known deviations
// must not be red every day, because a build that is red every day teaches
// people to switch the tool off. That promise rests entirely on one thing —
// that a run reads the previous run and subtracts it — and nothing in this
// repository measured it. The golden suite compares the CONTENTS of a snapshot
// file; not one layer ran a detector twice.
//
// It was not measured, and it was not true. `deps` used maybeWriteSnapshot(),
// which writes and never reads: the second run reported the same deviations as
// the first, word for word, and returned the same code. Its help screen said
// "1 — NEW deviations" and it had no idea what was new. Five detectors claimed
// the contract, four kept it.
//
// WHAT IS CHECKED, for every detector the dispatcher offers:
//
//   1. a first run with a fresh --json exits 1 when it reported something —
//      on a first run everything IS new, so the differential and the state
//      contracts agree here and the code has to be 1;
//   2. a second run against the same file prints the diff line at all — the
//      absence of that line is how the missing baseline looked from outside,
//      and it is one missing line of output, which nobody notices;
//   3. it says NEW=0 — the code has not changed between the two runs;
//   4. and it exits 0. This is the whole promise: a known state is green.
//
// EVERY DETECTOR, NOT THE MAIN ONE. `deps` was the one that was broken, and it
// is the fifth of five — a layer that checked `java` and stopped would have
// been green over the defect it was written for.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-baseline-'));

// --config is pinned for the same reason the golden suite pins it: without it
// this repository's own .odd-one-out.json reaches the fixture runs through the
// current working directory, every detector says "nothing found", and the
// layer measures the machine instead of the tool.
const CONFIG = 'test/fixtures/golden.config.json';

const CASES = [
  { name: 'java', args: ['java', 'test/fixtures/java'] },
  { name: 'js', args: ['js', 'test/fixtures/js'] },
  { name: 'sql', args: ['sql', 'test/fixtures/sql'] },
  { name: 'pom', args: ['pom', '--pom', 'test/fixtures/pom/pom.xml', '--tree', 'test/fixtures/pom/deptree.txt'] },
  { name: 'deps', args: ['deps', 'test/fixtures/deps'] },
];

// THE DISPATCHER IS ASKED WHICH COMMANDS EXIST, rather than the list above
// being trusted. A detector added later and not listed here would leave this
// layer green over code it has never run.
//
// Two commands are named as exceptions, with the reason, rather than quietly
// missing: `diff` and `rank` do not scan anything. They READ snapshots that a
// detector wrote, so there is no "previous run" of their own to compare
// against — the baseline is their input, not their memory.
const NOT_DETECTORS = { diff: 'czyta dwa zrzuty, nie skanuje', rank: 'czyta zrzuty, nie skanuje' };
const offered = [...spawnSync(process.execPath, [CLI, '--help'],
  { cwd: ROOT, encoding: 'utf8' }).stdout.matchAll(/^\s{2}([a-z]+)\s{2,}\S/gm)]
  .map(m => m[1]);

const run = (args, out) => {
  const r = spawnSync(process.execPath,
    [CLI, ...args, '--config', CONFIG, '--lang', 'en', '--json', out],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

const problems = [];
const note = (co, powod) => problems.push({ co, powod });

console.log('odd-one-out — does a second run know about the first?\n');

for (const c of CASES) {
  const snap = path.join(TMP, c.name + '.json');
  const first = run(c.args, snap);

  if (!fs.existsSync(snap)) {
    note(c.name, 'pierwszy przebieg nie zapisal zrzutu — nie ma z czym porownywac');
    continue;
  }
  const reported = (JSON.parse(fs.readFileSync(snap, 'utf8')).findings || []).length;

  if (reported > 0 && first.status !== 1)
    note(c.name + ' / przebieg 1', 'zglosil ' + reported + ', a wyszedl z kodem ' +
      first.status + ' — na pierwszym przebiegu wszystko jest nowe, wiec ma byc 1');

  const second = run(c.args, snap);
  const diff = second.out.match(/diff vs previous run: NEW=(\d+)\s+GONE=(\d+)\s+CHANGED=(\d+)\s+unchanged=(\d+)/);

  if (!diff) {
    note(c.name + ' / przebieg 2', 'nie wypisal linii roznicy — ten detektor nie czyta poprzedniego przebiegu');
    continue;
  }
  if (diff[1] !== '0' || diff[3] !== '0')
    note(c.name + ' / przebieg 2', 'kod sie nie zmienil, a rozne jest NEW=' + diff[1] + ' CHANGED=' + diff[3]);
  if (second.status !== 0)
    note(c.name + ' / przebieg 2', 'nic nowego, a kod wyjscia ' + second.status +
      ' — taki build jest czerwony codziennie nad stanem, ktory ktos juz widzial');

  console.log('  ' + c.name.padEnd(6) + '  przebieg 1: kod ' + first.status +
    ', zgloszen ' + reported + '   przebieg 2: NEW=' + diff[1] +
    ' unchanged=' + diff[4] + ', kod ' + second.status);
}

const brak = offered.filter(d => !CASES.some(c => c.name === d) && !NOT_DETECTORS[d]);
if (brak.length) note('pokrycie', 'dyspozytor oferuje detektory, ktorych ta warstwa nie uruchamia: ' + brak.join(', '));
for (const [d, powod] of Object.entries(NOT_DETECTORS))
  if (offered.includes(d)) console.log('  ' + d.padEnd(6) + '  pominiete — ' + powod);

fs.rmSync(TMP, { recursive: true, force: true });

console.log('');
if (!problems.length) {
  console.log('  ' + CASES.length + ' detektorow: drugi przebieg wie o pierwszym, NEW=0, kod 0');
  process.exit(0);
}
for (const p of problems) console.log('  FAIL  ' + p.co + '\n        ' + p.powod);
console.log('');
console.log('  Kod obiecuje "1 = NOWE odchylenia". Detektor, ktory nie czyta');
console.log('  poprzedniego przebiegu, tej obietnicy nie ma czym spelnic.');
process.exit(1);
