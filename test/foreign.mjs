// odd-one-out — regression on somebody else's code.
//
// WHY NOT JUST THE AUTHOR'S PROJECTS. A detector tuned on one codebase learns
// that codebase. Three defects found during development were invisible on the
// author's own sources and only appeared on netty. Fingerprints recorded here
// mean a change that quietly alters what the tool says about foreign code fails
// instead of passing.
//
// THREE PROJECTS, DELIBERATELY UNALIKE:
//
//   netty       large, low-level, hand-written concurrency and buffers
//   json-java   small, plain, no framework, one package
//   petclinic   annotation-driven Spring: dependency injection, JPA, MVC —
//               the opposite convention to a desktop JavaFX application
//
// Three is the whole point. Nine would be hours of downloading for the same
// answer; one would only re-learn the author's habits.
//
// MATERIAL. The clones are not in this repository. Each is optional and each
// prints the exact command to fetch it. A missing project is a SKIP with the
// reason, never a pass — "could not check" and "checked, fine" must not look
// alike. Paths are overridable:
//
//     OOO_NETTY       a netty checkout      (uses common/src/main/java)
//     OOO_JSONJAVA    a JSON-java checkout  (uses src/main/java)
//     OOO_PETCLINIC   a petclinic checkout  (uses src/main/java)
//
//     node test/foreign.mjs            check
//     node test/foreign.mjs --update   re-record, after reading the diff
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const RECORD = path.join(HERE, 'foreign-baseline.json');
const UPDATE = process.argv.includes('--update');

const PROJECTS = [
  {
    key: 'netty',
    env: 'OOO_NETTY',
    sub: ['common', 'src', 'main', 'java'],
    clone: 'git clone --depth 1 https://github.com/netty/netty.git',
  },
  {
    key: 'json-java',
    env: 'OOO_JSONJAVA',
    sub: ['src', 'main', 'java'],
    clone: 'git clone --depth 1 https://github.com/stleary/JSON-java.git',
  },
  {
    key: 'petclinic',
    env: 'OOO_PETCLINIC',
    sub: ['src', 'main', 'java'],
    clone: 'git clone --depth 1 https://github.com/spring-projects/spring-petclinic.git',
  },
];

const DETECTORS = ['java', 'deps'];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ooo-foreign-'));
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

function sourceRoot(p) {
  const base = process.env[p.env];
  if (!base) return null;
  const full = path.join(base, ...p.sub);
  return exists(full) ? full : null;
}

/** Counts and the sorted fingerprints — never counts alone. */
function measure(detector, root) {
  const snap = path.join(TMP, detector + '-' + Math.random().toString(36).slice(2) + '.json');
  const r = spawnSync(process.execPath, [CLI, detector, root, '--lang', 'en', '--json', snap],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  try {
    const f = JSON.parse(fs.readFileSync(snap, 'utf8')).findings;
    return { count: f.length, ids: f.map(x => x.id).sort().join(',') };
  } catch {
    return { count: 'ERROR', ids: 'ERROR', exit: r.status };
  }
}

const recorded = exists(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
const fresh = {};
const rows = [];

console.log('odd-one-out — regression on foreign code\n');

for (const p of PROJECTS) {
  const root = sourceRoot(p);
  if (!root) {
    rows.push({
      name: p.key, state: 'SKIP',
      detail: 'set ' + p.env + ' to a checkout — ' + p.clone,
    });
    continue;
  }
  for (const det of DETECTORS) {
    const key = p.key + '/' + det;
    const t0 = Date.now();
    const got = measure(det, root);
    const ms = Date.now() - t0;
    fresh[key] = got;

    const was = recorded[key];
    if (UPDATE || !was) {
      rows.push({
        name: key, state: was ? 'UPDATED' : 'RECORDED',
        detail: got.count + ' findings, ' + ms + ' ms' +
          (was && was.count !== got.count ? '   (was ' + was.count + ')' : ''),
      });
      continue;
    }
    const sameCount = String(was.count) === String(got.count);
    const sameIds = was.ids === got.ids;
    rows.push({
      name: key,
      state: sameCount && sameIds ? 'PASS' : 'FAIL',
      detail: sameCount && sameIds
        ? got.count + ' findings, fingerprints identical, ' + ms + ' ms'
        : (sameCount ? 'count ' + got.count + ' unchanged but FINGERPRINTS CHANGED'
          : 'count ' + was.count + ' -> ' + got.count +
            (sameIds ? '' : ', fingerprints changed')),
    });
  }
}

for (const r of rows) console.log('  ' + r.state.padEnd(9) + r.name.padEnd(18) + r.detail);

if (UPDATE || Object.keys(recorded).length === 0) {
  // Only the projects actually measured are rewritten; a skipped project keeps
  // whatever was recorded for it rather than silently vanishing from the file.
  fs.writeFileSync(RECORD, JSON.stringify({ ...recorded, ...fresh }, null, 2) + '\n');
  console.log('\n  recorded to ' + path.relative(ROOT, RECORD).split(path.sep).join('/'));
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best effort */ }

const failed = rows.filter(r => r.state === 'FAIL').length;
const skipped = rows.filter(r => r.state === 'SKIP').length;
console.log('\n  ' + rows.filter(r => r.state === 'PASS').length + ' passed, ' +
  failed + ' failed' + (skipped ? ', ' + skipped + ' project(s) skipped' : ''));

if (failed) {
  console.log('\n  What the tool says about somebody else\'s code changed. Either the change is\n' +
    '  an improvement worth re-recording, or it is a regression that never showed up\n' +
    '  on the author\'s own projects.');
  process.exit(1);
}
if (skipped) process.exit(2);
