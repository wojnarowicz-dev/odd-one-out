// odd-one-out — the two languages must actually be two languages.
//
// WHY THIS EXISTS. Translating the project into English was done with a
// mechanical word substitution, and it reached inside the Polish strings too:
// "calls tutaj" instead of "wolania tutaj", "porownuje code do reszty",
// "{0} wystapien, threshold {1}". Thirteen messages were damaged that way.
//
// NOTHING ELSE WOULD HAVE CAUGHT IT. Fingerprints do not cover prose. The
// golden tests compare the JSON snapshot, and human-readable text is not in it.
// The known-answer suite reads findings, not sentences. Every one of the
// thirteen would have shipped, and only a Polish reader would ever have seen
// them — which is the same trap as a message stuck in a language the author
// does not read.
//
// THREE CHECKS, because the first version had three blind spots and a
// first-contact audit walked straight into all of them. `--only nazwa1,nazwa2`
// sat in the ENGLISH help, as POLISH text, in bin/odd-one-out.mjs — that is
// the wrong direction, and outside the dictionary. It shipped.
//
//   1. English inside a Polish message      (technical-terms.txt allows terms)
//   2. Polish inside an English message      (polish-words.txt, plus any of
//                                             ąćęłńóśźż, which is a leak alone)
//   3. Prose printed without going through the dictionary at all
//   4. The two sentences npm shows a stranger, against src/scope.mjs
//
// Check 4 arrived last and for the same reason as the rest: the description
// named four things, the keywords named one, and neither named all six.
//
// Both word lists are data, not code: deciding what counts as a technical term
// is editorial and changes as messages change, and burying it in a script makes
// it invisible to whoever writes the next message.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { messages } from '../src/lang.mjs';
import { SCOPE, CLAIMED_DETECTORS } from '../src/scope.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TERMS_FILE = path.join(HERE, 'technical-terms.txt');
const POLISH_FILE = path.join(HERE, 'polish-words.txt');

// Entries are split on non-letters, so "pom.xml" allows "pom" and "xml", and
// "PR-Miner" allows "miner".
function loadWords(file) {
  const out = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.split('#')[0].trim();
    if (!text) continue;
    for (const w of text.match(/[A-Za-z]+/g) || []) out.add(w.toLowerCase());
  }
  return out;
}

const allowed = loadWords(TERMS_FILE);
const polish = loadWords(POLISH_FILE);

// Words of three letters or more. Shorter ones ("id", "do", "na") carry no
// signal and would only add noise.
const words = s => s.match(/[A-Za-z]{3,}/g) || [];
const DIACRITICS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;

const problems = [];
let checked = 0;

// ---------------------------------------------------------------- 1 and 2
for (const [key, entry] of Object.entries(messages)) {
  if (!entry || typeof entry !== 'object') continue;
  const { en, pl } = entry;
  if (typeof en !== 'string') { problems.push({ kind: 'no English', key, text: '' }); continue; }
  if (typeof pl !== 'string') { problems.push({ kind: 'no Polish', key, text: '' }); continue; }
  checked++;

  const inEnglish = new Set(words(en).map(w => w.toLowerCase()));
  const seenEn = new Set();
  for (const w of words(pl)) {
    const lower = w.toLowerCase();
    if (!inEnglish.has(lower) || allowed.has(lower) || seenEn.has(lower)) continue;
    seenEn.add(lower);
    problems.push({ kind: 'English in the Polish', key, word: w, text: pl });
  }

  const seenPl = new Set();
  for (const w of words(en)) {
    const lower = w.toLowerCase();
    if (!polish.has(lower) || allowed.has(lower) || seenPl.has(lower)) continue;
    seenPl.add(lower);
    problems.push({ kind: 'Polish in the English', key, word: w, text: en });
  }
  if (DIACRITICS.test(en))
    problems.push({ kind: 'Polish letters in the English', key, word: en.match(DIACRITICS)[0], text: en });
}

// ---------------------------------------------------------------- 3
// Anything printed to a person has to come from the dictionary, otherwise it
// exists in one language only and no amount of checking the dictionary will
// find it. Only PROSE is flagged: a literal with at least two words of three
// letters or more. Separators, indentation and glue between values are not
// prose and are left alone.
const SCAN_DIRS = ['src', 'bin'];
const SKIP_FILES = new Set(['lang.mjs']);
const PRINT = /console\.(?:log|error)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;

function scanForLooseProse(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let m;
  while ((m = PRINT.exec(src))) {
    const literal = m[2];
    const ws = words(literal);
    if (ws.length < 2) continue;                                  // not prose
    // A literal made only of technical terms is not prose in any language:
    // `grant execute on function ` is SQL to paste, not a sentence to translate.
    if (ws.every(w => allowed.has(w.toLowerCase()))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push({ kind: 'text outside the dictionary', key: rel + ':' + line, text: literal });
  }
}

for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    if (!name.endsWith('.mjs') || SKIP_FILES.has(name)) continue;
    scanForLooseProse(path.join(full, name));
  }
}

// ---------------------------------------------------------------- 4
// The two sentences npm shows a stranger: the description and the keywords.
// These cannot be BUILT from src/scope.mjs the way a message can be — package.json
// is data npm reads, not code this tool runs — so they are checked instead. That
// is the weaker of the two, and being the weaker one is why it is worth having.
//
// The list is itself checked against the detectors that exist, otherwise adding
// a detector and forgetting the list would leave this green and the npm page wrong.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const kw = (pkg.keywords || []).map(k => k.toLowerCase());

// `Java` sits inside `JavaScript`, so a plain substring test would let a
// description naming only one of them pass as naming both. No regular
// expression here on purpose: a name is data from src/scope.mjs, and escaping
// it for a pattern is one more thing that can quietly stop matching.
const LETTER = c => c !== undefined && /[A-Za-z]/.test(c);
function namesIt(text, name) {
  let at = text.indexOf(name);
  while (at !== -1) {
    if (!LETTER(text[at - 1]) && !LETTER(text[at + name.length])) return true;
    at = text.indexOf(name, at + 1);
  }
  return false;
}
for (const row of SCOPE) {
  if (!namesIt(pkg.description, row.name))
    problems.push({ kind: 'not named in the description', key: 'package.json', word: row.name });
  if (!kw.includes(row.keyword))
    problems.push({ kind: 'not in the keywords', key: 'package.json', word: row.keyword });
}
if (kw.length !== new Set(kw).size)
  problems.push({ kind: 'duplicate keyword', key: 'package.json' });
for (const k of pkg.keywords || [])
  if (k !== k.toLowerCase())
    problems.push({ kind: 'keyword not lowercase', key: 'package.json', word: k });
if (DIACRITICS.test(pkg.description))
  problems.push({ kind: 'Polish letters in the description', key: 'package.json', text: pkg.description });
for (const w of words(pkg.description))
  if (polish.has(w.toLowerCase()) && !allowed.has(w.toLowerCase()))
    problems.push({ kind: 'Polish in the description', key: 'package.json', word: w });

// The detectors in bin/ are the ground truth for what is claimed above.
const binSrc = fs.readFileSync(path.join(ROOT, 'bin', 'odd-one-out.mjs'), 'utf8');
const real = [...binSrc.matchAll(/^ {2}(\w+): \{\n(?:.*\n)*?\s*module: (null|'[^']+')/gm)]
  .filter(m => m[2] !== 'null').map(m => m[1]).sort();
if (real.length < 5)
  problems.push({ kind: 'cannot read the detectors out of bin/', key: 'bin/odd-one-out.mjs', word: real.join(' ') });
for (const d of real)
  if (!CLAIMED_DETECTORS.includes(d))
    problems.push({ kind: 'detector claimed by no row of SCOPE', key: 'src/scope.mjs', word: d });
for (const d of CLAIMED_DETECTORS)
  if (!real.includes(d))
    problems.push({ kind: 'SCOPE claims a detector that does not exist', key: 'src/scope.mjs', word: d });

// ---------------------------------------------------------------- report
console.log('odd-one-out — dictionary\n');
console.log('  keys checked: ' + checked);
console.log('  technical terms allowed: ' + allowed.size + ', Polish words watched: ' + polish.size);
console.log('  files scanned for loose prose: ' + SCAN_DIRS.join(', '));
console.log('  scope rows checked against package.json: ' + SCOPE.length);

if (problems.length === 0) {
  console.log('\n  both directions clean, nothing outside the dictionary, npm page agrees with src/scope.mjs');
} else {
  console.log('\n  ' + problems.length + ' problem(s):\n');
  // THE WIDTH WAS NEVER DEFINED, and nobody found out because this branch had
  // never run: the layer counted its problems and then crashed instead of
  // naming them. A failure path that has never executed is not a failure path
  // — it is a sentence nobody has read.
  const w = Math.max(...problems.map(p => p.kind.length)) + 2;
  for (const p of problems) {
    console.log('    ' + p.kind.padEnd(w) + p.key + (p.word ? '   "' + p.word + '"' : ''));
    if (p.text) console.log('        ' + p.text.slice(0, 100));
  }
  if (problems.some(p => p.key !== 'package.json' && p.key !== 'src/scope.mjs')) {
    console.log('\n  Translate it, move it into src/lang.mjs, or — if it is a technical term');
    console.log('  that must stay as it is — add it to technical-terms.txt with a reason.');
  }
  if (problems.some(p => p.key === 'package.json' || p.key === 'src/scope.mjs')) {
    console.log('\n  package.json is the first impression on npm. Name the thing in the');
    console.log('  description and add its keyword — or drop the row from src/scope.mjs');
    console.log('  if this build no longer reads it.');
  }
  process.exit(1);
}
