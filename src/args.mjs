// odd-one-out — command-line argument reading, one implementation.
//
// WHY THIS FILE EXISTS. Four detectors carried their own copy of the same
// `argv.indexOf` helper, and three more modules (config, lang, snapshot) read
// their own flag inline. Nine files reached into `process.argv` on their own.
// That is precisely the class of defect this tool is meant to find — and the one
// it could not see in itself, because `deps` measures bypassing an EXISTING
// layer and there was no layer to bypass.
//
// This module has NO IMPORTS on purpose: `lang.mjs` needs it to read `--lang`,
// so anything it imported would risk a cycle.
//
// THE BEHAVIOUR IS DELIBERATELY BYTE-FOR-BYTE THE OLD ONE, including the parts
// that look odd:
//   * a flag with no value yields `true`, not an empty string — that is what
//     `--filter`, `--stability` and `--all` rely on;
//   * a value beginning with `--` is treated as ABSENT, so `--only --top 5`
//     reads as "--only with no value" rather than swallowing the next flag.
// Changing either would silently alter how several switches behave, and no
// count in any report would move.

/** Builds the classic `flag(name, default)` reader over a given argv. */
export function makeFlag(argv) {
  return (name, def) => {
    const i = argv.indexOf('--' + name);
    if (i < 0) return def;
    const v = argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : v;
  };
}

/**
 * All values of a repeatable flag: `--tree a.txt b.txt --pom x.xml` gives
 * ['a.txt', 'b.txt']. Collecting stops at the next `--flag`.
 */
export function flagAll(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--' + name) {
      let j = i + 1;
      while (j < argv.length && !argv[j].startsWith('--')) out.push(argv[j++]);
    }
  }
  return out;
}

/**
 * A single value, or `fallback` when the flag is missing or has no value.
 * Unlike `flag`, a valueless flag does NOT become `true` here — this is the
 * reader for `--config`, `--lang` and `--json`, where `true` would be a path.
 */
export function valueOf(argv, name, fallback = null) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : fallback;
}

/** Presence of a valueless switch, e.g. `--all`. */
export function hasFlag(argv, name) {
  return argv.includes('--' + name);
}

/**
 * Every flag that consumes the token after it. The dispatcher needs this to
 * tell a value from a path.
 *
 * WHY A LIST AND NOT A GUESS. "The first argument that does not start with --"
 * looked like a fine definition of the scanned path, and it was wrong three
 * times in a row: `--top 8` made `8` the path, `--lang pl` made `pl` the path,
 * and `--wrapper name` made `name` the path. Every one of those failed as a
 * usage error on stderr, so no count in any report moved and the mistake was
 * invisible in the numbers. A new value-taking flag MUST be added here.
 */
export const VALUE_FLAGS = new Set([
  'json', 'lang', 'config', 'only', 'top', 'scope', 'filter', 'types', 'aliases',
  'wrapper', 'rule', 'age', 'subsets',
  'minsup', 'minconf', 'maxviol', 'minvia', 'maxodd', 'minconv',
  'pom', 'tree',
]);

/**
 * The first positional argument (the scanned path): the first token that is
 * neither a flag nor the value of a value-taking flag.
 */
export function firstPositional(argv, valueFlags = VALUE_FLAGS) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (valueFlags.has(a.slice(2))) i++;   // skip its value
      continue;
    }
    return a;
  }
  return undefined;
}
