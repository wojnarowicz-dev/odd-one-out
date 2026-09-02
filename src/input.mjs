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
