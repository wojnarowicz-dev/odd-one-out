// odd-one-out — input validation, one place for every detector.
//
// WHY. A non-existent path is the most common user mistake: a typo in the
// directory name, a path copied from another machine, a project that has been
// moved. Without this check each of the five detectors printed a raw `ENOENT`
// with a Node stack trace, which looks like the tool crashed when in fact
// somebody mistyped a path.
//
// ONE PLACE, NOT FIVE. The check lives in the dispatcher (`bin/odd-one-out.mjs`)
// and runs before any detector starts. The detectors carry no copies of it —
// otherwise adding a sixth detector would again leave the code one copy short,
// which is exactly the kind of deviation this tool is built to find.
//
// Exit code 2 — the same as for a missing argument. Codes 0 and 1 are taken by
// the analysis result (no new deviations / there are new ones), so a usage
// error needs one of its own.
import fs from 'node:fs';
import { t } from './lang.mjs';

const USAGE_ERROR_CODE = 2;

function fail(message, hint) {
  console.error(message);
  if (hint) console.error(hint);
  process.exit(USAGE_ERROR_CODE);
}

/** The path must exist and be a directory we can list. */
export function requireDirectory(pathArg, label) {
  if (!pathArg) fail(t('inputMissingArg', label));
  let st;
  try {
    st = fs.statSync(pathArg);
  } catch (e) {
    if (e.code === 'ENOENT') fail(t('inputNoSuchPath', pathArg), t('inputHintPath'));
    fail(t('inputUnreadable', pathArg, e.code), t('inputHintPath'));
  }
  if (!st.isDirectory()) fail(t('inputNotDir', pathArg), t('inputHintDir'));
  try {
    fs.readdirSync(pathArg);
  } catch (e) {
    fail(t('inputUnreadable', pathArg, e.code), t('inputHintPath'));
  }
  return pathArg;
}

/** The path must exist, be a regular file, and be readable. */
export function requireFile(pathArg, label) {
  if (!pathArg) fail(t('inputMissingArg', label));
  let st;
  try {
    st = fs.statSync(pathArg);
  } catch (e) {
    if (e.code === 'ENOENT') fail(t('inputNoSuchPath', pathArg), t('inputHintPath'));
    fail(t('inputUnreadable', pathArg, e.code), t('inputHintPath'));
  }
  if (!st.isFile()) fail(t('inputNotFile', pathArg), t('inputHintFile'));
  try {
    fs.accessSync(pathArg, fs.constants.R_OK);
  } catch (e) {
    fail(t('inputUnreadable', pathArg, e.code), t('inputHintPath'));
  }
  return pathArg;
}

// ---------------------------------------------------------------- reading

// WHY SOURCES GO THROUGH ONE READER. Every detector used to call
// `fs.readFileSync(file, 'utf8')` directly — eleven such calls in seven
// modules. Node's utf8 decoding never fails: a byte that is not valid UTF-8
// becomes U+FFFD and the read succeeds. A file saved in cp1250 therefore parsed
// cleanly, reported `parseErrors=0`, and the run said nothing at all, while the
// text the detector actually mined was not the text in the file. The resilience
// suite classified that as a SILENT zero, which is the one outcome this tool is
// not allowed to produce.
//
// The decode is NOT refused: a project with one badly saved file should still
// be analysable. It is reported once, at the end of the run, naming the files.
//
// `buf.toString('utf8')` stays the returned value on purpose. Decoding through
// TextDecoder instead would strip a BOM and shift every offset in the file by
// one character, which would move line numbers and therefore fingerprints. The
// strict decoder here only ANSWERS THE QUESTION "was this valid UTF-8"; it
// never supplies the text.
const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const notUtf8 = [];

/** Reads a source file exactly as before, and remembers if it was not UTF-8. */
export function readSource(file) {
  const buf = fs.readFileSync(file);
  try {
    strict.decode(buf);
  } catch {
    if (!notUtf8.includes(file)) notUtf8.push(file);
  }
  return buf.toString('utf8');
}

/** The files read so far that were not valid UTF-8. */
export function nonUtf8Files() {
  return notUtf8.slice();
}

/**
 * One sentence, printed at the end of a run, or nothing at all.
 * `rel` shortens the paths the same way the detector shortens its own.
 */
export function reportNonUtf8(rel = (p => p)) {
  if (notUtf8.length === 0) return;
  const shown = notUtf8.slice(0, 5).map(rel);
  const more = notUtf8.length > 5 ? ', ...' : '';
  console.log('');
  console.log(t('nonUtf8Files', notUtf8.length, shown.join(', ') + more));
}
