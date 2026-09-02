// odd-one-out — the two languages must actually be two languages.
//
// WHY THIS EXISTS. Translating the project into English was done with a
// mechanical word substitution, and it reached inside the Polish strings too:
// "calls tutaj" instead of "wolania tutaj", "porownuje code do reszty",
// "{0} wystapien, threshold {1}", "Pary callCount na tym samym odbiorniku".
// Thirteen messages were damaged that way.
//
// NOTHING ELSE WOULD HAVE CAUGHT IT. Fingerprints do not cover prose. The
// golden tests compare the JSON snapshot, and human-readable text is not in it.
// The known-answer suite reads findings, not sentences. Every one of the
// thirteen would have shipped, and only a Polish reader would ever have seen
// them — which is the same trap as a message stuck in a language the author
// does not read.
//
// THE CHECK. For every dictionary key, take the words of the Polish string.
// If a word also occurs in the English string for that key, it came from the
// translation unless it is a technical term. The technical terms live in
// test/technical-terms.txt, as data — see the comment at the top of that file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { messages } from '../src/lang.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TERMS_FILE = path.join(HERE, 'technical-terms.txt');

// Entries are split on non-letters, so "pom.xml" allows "pom" and "xml", and
// "PR-Miner" allows "miner".
function loadTerms(file) {
  const allowed = new Set();
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const text = line.split('#')[0].trim();
    if (!text) continue;
    for (const w of text.match(/[A-Za-z]+/g) || []) allowed.add(w.toLowerCase());
  }
  return allowed;
}

const allowed = loadTerms(TERMS_FILE);

// Words of three letters or more. Shorter ones ("id", "do", "na") carry no
// signal and would only add noise.
const words = s => s.match(/[A-Za-z]{3,}/g) || [];

const leaks = [];
let checked = 0, missingPl = [], missingEn = [];

for (const [key, entry] of Object.entries(messages)) {
  if (!entry || typeof entry !== 'object') continue;
  const { en, pl } = entry;
  if (typeof en !== 'string') { missingEn.push(key); continue; }
  if (typeof pl !== 'string') { missingPl.push(key); continue; }
  checked++;

  const inEnglish = new Set(words(en).map(w => w.toLowerCase()));
  const seen = new Set();
  for (const w of words(pl)) {
    const lower = w.toLowerCase();
    if (!inEnglish.has(lower)) continue;      // not from the English string
    if (allowed.has(lower)) continue;         // a technical term, on purpose
    if (seen.has(lower)) continue;
    seen.add(lower);
    leaks.push({ key, word: w, pl });
  }
}

console.log('odd-one-out — dictionary\n');
console.log('  keys checked: ' + checked);
console.log('  technical terms allowed: ' + allowed.size + '  (' +
  path.relative(path.join(HERE, '..'), TERMS_FILE).split(path.sep).join('/') + ')');

if (missingEn.length) console.log('  keys without an English string: ' + missingEn.join(', '));
if (missingPl.length) console.log('  keys without a Polish string: ' + missingPl.join(', '));

if (leaks.length === 0 && !missingEn.length && !missingPl.length) {
  console.log('\n  0 English words left in Polish messages');
} else {
  console.log('\n  ' + leaks.length + ' English word(s) left in Polish messages:\n');
  for (const l of leaks) {
    console.log('    ' + l.key.padEnd(22) + '"' + l.word + '"');
    console.log('        ' + l.pl.slice(0, 100));
  }
  console.log('\n  Either translate the word, or — if it is a technical term that must stay');
  console.log('  English — add it to ' + path.basename(TERMS_FILE) + ' with a reason.');
}

if (leaks.length || missingEn.length || missingPl.length) process.exit(1);
