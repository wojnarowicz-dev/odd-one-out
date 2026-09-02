// odd-one-out — run snapshot and the diff between runs.
//
// WHY. Without this, every run makes you read the same findings from scratch
// and you cannot see what was added. The question is not "what is wrong" but
// "what is wrong SINCE LAST TIME".
//
// THE FINGERPRINT CONTAINS NO LINE NUMBER. That is the one decision here that
// really matters. Line numbers shift on every unrelated edit of a file — if
// they entered the fingerprint, adding an import at the top of a file would
// wipe out every old finding and re-issue them as NEW. The fingerprint rests on
// semantic identity: detector + rule + file + anchor (receiver, function name,
// artefact coordinates). The line number travels alongside, as information.
//
// FILE PATH ≠ IMMUTABLE FINGERPRINT. Moving a class to another package changes
// the path, and the finding shows up as NEW + GONE. That is a deliberate
// trade-off: the alternative is a fingerprint without the path, under which two
// different sites sharing an anchor merge into one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { t } from './lang.mjs';
import { valueOf, hasFlag } from './args.mjs';

export const SNAPSHOT_VERSION = 1;

export function fingerprint(f) {
  const key = [f.detector, f.rule, f.file, f.anchor].join(String.fromCharCode(0));
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

// The snapshot file path is not a threshold. If it stayed in `args`, every run
// written to a different file would look like a run with different settings and
// the diff would warn about it on EVERY comparison.
function stripSnapshotFlags(args) {
  const out = [];
  for (let i = 0; i < (args || []).length; i++) {
    if (args[i] === '--json') { i++; continue; }
    out.push(args[i]);
  }
  return out;
}

// COLLISIONS. A semantic anchor is not enough: two different lambdas in the
// same file, calling on the same receiver, have an identical anchor. Measured
// on a real project: 15 findings → 12 fingerprints, i.e. three pairs collapsed
// into one and the diff lost half of them.
//
// They are told apart by the ordinal of their occurrence IN DOCUMENT ORDER
// (`~2`, `~3`). This is not a perfect identifier — inserting a new matching
// site BEFORE an existing one shifts the numbering and shows up as NEW + GONE.
// That, however, is rare, whereas line numbers shift on every edit of a file.
export function buildSnapshot({ detector, root, args, counts, findings, cfg }) {
  const seen = new Map();
  let withIds = findings.map(f => {
    const base = { detector, ...f };
    const fp = fingerprint(base);
    const n = (seen.get(fp) || 0) + 1;
    seen.set(fp, n);
    return { id: n === 1 ? fp : fp + '~' + n, ...base };
  });

  // MUTES ARE APPLIED HERE, not while reading files. The place was read and
  // counted towards the population — it only disappeared from the report. If a
  // mute worked like an exclusion it would weaken the very rule that caught it.
  //
  // UNIT IDENTIFIER. One site often violates several rules at once —
  // `bindPlayButtonToPlayerStatus` produced four separate findings. Muting by
  // `id` would then need four entries for one decision, which is a sign that
  // the wrong thing is being muted: the decision is about the SITE, not the
  // rule. `unitId` is computed the same way as `id` (no line number, with an
  // ordinal discriminator), so it is just as stable between runs.
  const unitSeen = new Map();
  const unitIds = new Map();
  for (const f of withIds) {
    const ukey = [detector, f.file, (f.meta && f.meta.unit) || f.anchor].join('|');
    if (!unitIds.has(ukey)) {
      const base = fingerprint({ detector, rule: '', file: f.file, anchor: f.anchor });
      const n = (unitSeen.get(base) || 0) + 1;
      unitSeen.set(base, n);
      unitIds.set(ukey, n === 1 ? base : base + '~' + n);
    }
    f.unitId = unitIds.get(ukey);
  }

  let mutedCount = 0;
  if (cfg && cfg.mute && cfg.mute.size) {
    const przed = withIds.length;
    withIds = withIds.filter(f => !cfg.isMuted(f.id) && !cfg.isMuted(f.unitId));
    mutedCount = przed - withIds.length;
  }

  return {
    mutedCount,
    version: SNAPSHOT_VERSION,
    tool: 'odd-one-out',
    detector,
    root,
    args: stripSnapshotFlags(args),
    createdAt: new Date().toISOString(),
    counts: counts || {},
    findings: withIds,
  };
}

// A FAILED WRITE IS A USAGE ERROR, NOT A CRASH. `--json` pointing at an
// existing directory used to throw EISDIR out of the top level of an async
// module; Node printed the stack and then libuv aborted the process
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"), exit 3221226505.
// Nothing about that told anyone their --json argument was a directory.
// Missing parent directories are still created — that case was already right.
// THE WRITE IS IN TWO PHASES. A single writeFileSync onto the snapshot means an
// interrupted run — Ctrl+C, a full disk, a killed terminal — leaves a half
// written file where the baseline used to be. The next run cannot read it, and
// until the fix above it did not even say so. Writing beside the target and
// renaming into place makes the swap atomic: after any interruption the file on
// disk is either the whole previous snapshot or the whole new one, never a
// prefix of either. Rename is only atomic within one directory, so the
// temporary file is a sibling, never in the system temp folder.
//
// THE BYTES ARE UNCHANGED. `JSON.stringify(snap, null, 2) + '\n'` is the same
// expression as before, deliberately untouched: this is the layer where
// removing a NUL byte once silently changed every finding id. Verified after
// the change by comparing whole snapshot files byte for byte, not just their
// fingerprints.
export function writeSnapshot(file, snap) {
  const target = path.resolve(file);
  const dir = path.dirname(target);
  const tmp = path.join(dir, '.' + path.basename(target) + '.tmp-' + process.pid);
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Checked before writing anything: renaming ONTO a directory fails with a
    // platform-dependent code, and the hint below has to stay accurate.
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      const e = new Error('cannot write over a directory');
      e.code = 'EISDIR';
      throw e;
    }
    fs.writeFileSync(tmp, JSON.stringify(snap, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* nothing else to do */ }
    console.error('');
    console.error(t('snapshotWriteFailed', file, e.code || e.message));
    if (e.code === 'EISDIR') console.error(t('snapshotWriteHintDir'));
    // NOT process.exit(2). By this point the tree-sitter wasm module is loaded
    // and holds async handles; exiting from under them aborts the process on
    // Windows with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)",
    // which replaced a clean exit 2 with a 3221226505 crash — the message above
    // printed and then the process died anyway. Setting the code and letting
    // the run finish on its own reaches the same exit status without the abort.
    // Early exits (a missing path, a missing argument) are safe because they
    // happen before any parser is loaded.
    process.exitCode = 2;
    return null;
  }
  return file;
}

export function readSnapshot(file) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (s.version !== SNAPSHOT_VERSION)
    throw new Error(t('snapshotBadVersion', s.version, SNAPSHOT_VERSION));
  return s;
}

// What counts as a CHANGE at the same fingerprint: strength of evidence or
// state. A shifted line number alone is not a change.
const CHANGED_FIELDS = ['kind', 'sup', 'supA', 'conf', 'viol', 'via', 'odd'];

export function diffSnapshots(oldSnap, newSnap) {
  const before = new Map((oldSnap ? oldSnap.findings : []).map(f => [f.id, f]));
  const after = new Map(newSnap.findings.map(f => [f.id, f]));

  const nowe = [], zniklo = [], zmienione = [], bezZmian = [];
  for (const [id, f] of after) {
    const b = before.get(id);
    if (!b) { nowe.push(f); continue; }
    const zmiany = [];
    for (const k of CHANGED_FIELDS) {
      const ov = b.meta ? b.meta[k] : undefined;
      const nv = f.meta ? f.meta[k] : undefined;
      if (ov !== undefined || nv !== undefined) {
        const os = Array.isArray(ov) ? ov.length : ov;
        const ns = Array.isArray(nv) ? nv.length : nv;
        if (String(os) !== String(ns)) zmiany.push(k + ': ' + os + ' -> ' + ns);
      }
    }
    if (zmiany.length) zmienione.push({ ...f, zmiany, wasLine: b.line });
    else bezZmian.push(f);
  }
  for (const [id, f] of before) if (!after.has(id)) zniklo.push(f);

  return { nowe, zniklo, zmienione, bezZmian };
}

export function printDiff(oldSnap, newSnap, { showUnchanged = false } = {}) {
  const d = diffSnapshots(oldSnap, newSnap);
  const when = s => (s ? new Date(s.createdAt).toISOString().replace('T', ' ').slice(0, 19) : '—');

  console.log(t('diffTitle'));
  console.log(t('diffDetector', newSnap.detector, newSnap.root));
  console.log(t('diffWhen', when(oldSnap), when(newSnap)));
  if (oldSnap && oldSnap.detector !== newSnap.detector)
    console.log(t('diffWarnDetectors', oldSnap.detector, newSnap.detector));
  if (oldSnap && JSON.stringify(oldSnap.args) !== JSON.stringify(newSnap.args))
    console.log(t('diffWarnThresholds', oldSnap.args.join(' '), newSnap.args.join(' ')));
  console.log('');
  console.log(t('diffCounts', d.nowe.length, d.zniklo.length, d.zmienione.length, d.bezZmian.length));
  console.log('');

  const line = f => '   ' + f.file + (f.line ? ':' + f.line : '') + '   ' + f.label;

  if (d.nowe.length) {
    console.log(t('diffSecNew'));
    for (const f of d.nowe) console.log(line(f));
    console.log('');
  }
  if (d.zniklo.length) {
    console.log(t('diffSecGone'));
    for (const f of d.zniklo) console.log(line(f));
    console.log('');
  }
  if (d.zmienione.length) {
    console.log(t('diffSecChanged'));
    for (const f of d.zmienione) {
      console.log(line(f));
      console.log('      ' + f.zmiany.join(', '));
    }
    console.log('');
  }
  if (showUnchanged && d.bezZmian.length) {
    console.log(t('diffSecUnchanged'));
    for (const f of d.bezZmian) console.log(line(f));
    console.log('');
  }
  if (!d.nowe.length && !d.zniklo.length && !d.zmienione.length)
    console.log(t('diffNoChange'));

  return d;
}

/**
 * Shared preparation of a detector's result: mutes, the diff against the
 * previous run, and the decision about what to show at all.
 *
 * WHY THE DIFF IS THE DEFAULT. By the third run a person is scrolling past the
 * same findings and stops running the tool. If `--json` points at a file that
 * already exists, we show only what is NEW relative to it. `--all` restores the
 * full list.
 *
 * Returns { snap, toShow, diff, mutedByCommentList, newCount }.
 * `newCount` drives the exit code: 0 = no new deviations, 1 = there are some.
 */
// THE RESULT CODE MUST NOT OVERWRITE AN INPUT ERROR. Detectors finish with
// "1 if there are new findings, else 0", and that assignment ran after a
// failed --json write had already set 2 — the run reported the problem and
// then exited 1, which reads as an ordinary result. 2 wins once it is set.
export function resultExit(code) {
  if (process.exitCode === 2) return;
  process.exitCode = code;
}

export function prepare(argv, payload) {
  const cfg = payload.cfg;
  const file = valueOf(argv, 'json');
  const showAll = hasFlag(argv, 'all');

  const snap = buildSnapshot(payload);

  // comment mutes — applied after building, because only here do we know the file and line
  const mutedByCommentList = [];
  if (cfg && cfg.mutedByComment) {
    snap.findings = snap.findings.filter(f => {
      let abs = null;
      try {
        abs = path.resolve(payload.root, f.file);
        if (!fs.existsSync(abs)) abs = fs.existsSync(f.file) ? f.file : null;
      } catch { abs = null; }
      const powod = abs ? cfg.mutedByComment(abs, f.line) : null;
      if (powod) { mutedByCommentList.push({ ...f, powod }); return false; }
      return true;
    });
  }

  let poprzedni = null;
  if (file) {
    // AN UNREADABLE PREVIOUS RUN IS SAID OUT LOUD. This used to swallow the
    // error, and the only trace was the ABSENCE of the "diff vs previous run"
    // line — the full list came back as if this were the first run ever, and
    // the damaged file was then overwritten. Losing the baseline showed up as
    // one missing line of output, which nobody notices.
    try {
      if (fs.existsSync(file)) poprzedni = readSnapshot(file);
    } catch (e) {
      poprzedni = null;
      console.error('');
      console.error(t('snapshotUnreadable', file, e.code || e.message));
      console.error(t('snapshotUnreadableHint'));
    }
  }

  const diff = poprzedni ? diffSnapshots(poprzedni, snap) : null;
  const toShow = (!diff || showAll)
    ? snap.findings
    : [...diff.nowe, ...diff.zmienione];

  if (file) writeSnapshot(file, snap);

  return {
    snap, toShow, diff, mutedByCommentList, file, showAll,
    newCount: diff ? diff.nowe.length : snap.findings.length,
  };
}

/** One header about mutes and the diff — the same in every detector. */
export function diffHeader(w) {
  if (w.mutedByCommentList.length) {
    console.log(t('mutedByComment', w.mutedByCommentList.length));
    for (const f of w.mutedByCommentList.slice(0, 5))
      console.log('   ' + f.file + ':' + f.line + '  — ' + f.powod);
  }
  if (w.snap.mutedCount) console.log(t('mutedByConfig', w.snap.mutedCount));
  if (w.diff) {
    const d = w.diff;
    console.log(t('diffVsPrevious', d.nowe.length, d.zniklo.length, d.zmienione.length, d.bezZmian.length));
  }
  if (w.file) console.log(t('savedRun', w.file, w.snap.findings.length));
}

// Shared handling of --json <file> for the detectors.
export function maybeWriteSnapshot(argv, payload) {
  if (!hasFlag(argv, 'json')) return null;
  const file = valueOf(argv, 'json');
  if (!file) {
    // Same reasoning as in writeSnapshot: this runs at the end of a detector,
    // with the parser already loaded, so exiting here would abort rather than
    // exit. (The message also used to bypass the dictionary.)
    console.error(t('snapshotNeedsPath'));
    process.exitCode = 2;
    return null;
  }
  const snap = buildSnapshot(payload);
  if (!writeSnapshot(file, snap)) return null;   // it said why, and set the code
  console.log('');
  console.log(t('savedRun', file, snap.findings.length));
  if (payload.cfg) console.log(t('settings') + payload.cfg.describe());
  return snap;
}
