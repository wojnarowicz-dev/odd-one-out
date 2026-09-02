// odd-one-out — PR-Miner-style deviation finder for Java.
// Unit of analysis: (innermost function-like node, receiver expression).
// Itemset: set of method names invoked on that receiver inside that unit.
// Rule A->B mined over units; a violation is a unit that has A but not B.
import { javaParser } from './parser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const MINSUP = +flag('minsup', 3);
const MINCONF = +flag('minconf', 0.6);
const MAXVIOL = +flag('maxviol', 4);
const TOP = +flag('top', 10);
const ONLY = flag('only', null) ? String(flag('only', '')).split(',') : null;

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

function javaFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) javaFiles(p, acc);
    else if (e.name.endsWith('.java')) acc.push(p);
  }
  return acc;
}

const parser = await javaParser();

// ZASIEG PARY — jak blisko siebie musza stac dwa wywolania, zeby liczyc sie
// jako para. Trzy poziomy, od najszerszego:
//
//   file    — gdziekolwiek w pliku na tym samym odbiorniku. Obsluga stojaca
//             w innej metodzie tego samego pliku ZOSTANIE zauwazona, wiec
//             miejsce nie bedzie zglaszane. Najmniej falszywych alarmow tej
//             klasy, ale i najslabsze pojecie "pary" — dwa wywolania oddalone
//             o tysiac linii nie sa para w zadnym sensownym znaczeniu.
//   method  — w obrebie metody lub konstruktora; lambdy licza sie do metody,
//             w ktorej siedza.
//   lambda  — w obrebie najglebszej funkcji, lambda wlacznie (domyslny).
//             Najostrzejsze pojecie pary; jednoczesnie kazda obsluga
//             przeniesiona o jeden poziom w gore wyglada na brak.
const SCOPES = {
  lambda: new Set(['method_declaration', 'constructor_declaration',
    'compact_constructor_declaration', 'lambda_expression', 'static_initializer']),
  method: new Set(['method_declaration', 'constructor_declaration',
    'compact_constructor_declaration', 'static_initializer']),
  file: new Set(),
};
const SCOPE = String(flag('scope', 'lambda'));
if (!SCOPES[SCOPE]) {
  console.error('Nieznany zasieg: ' + SCOPE + '. Dozwolone: file, method, lambda.');
  process.exit(2);
}
const FUNC_LIKE = SCOPES[SCOPE];

const files = javaFiles(ROOT);
const units = new Map();
const parseErrors = [];
let parsed = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const tree = parser.parse(src);
  parsed++;
  if (tree.rootNode.hasError) parseErrors.push(file);

  const walk = (node, unit) => {
    if (FUNC_LIKE.has(node.type)) {
      const nameNode = node.childForFieldName ? node.childForFieldName('name') : null;
      unit = {
        line: node.startPosition.row + 1,
        kind: node.type === 'lambda_expression' ? 'lambda' : (nameNode ? nameNode.text : node.type),
      };
    }
    if (node.type === 'method_invocation') {
      const obj = node.childForFieldName('object');
      const nm = node.childForFieldName('name');
      if (nm) {
        const recv = obj ? obj.text.replace(/\s+/g, '') : 'this';
        const key = file + ' ' + (unit ? unit.line + ':' + unit.kind : 'top') + ' ' + recv;
        let u = units.get(key);
        if (!u) {
          u = { file, unitLine: unit ? unit.line : 0, unitKind: unit ? unit.kind : 'top', recv, items: new Map() };
          units.set(key, u);
        }
        if (!u.items.has(nm.text)) u.items.set(nm.text, []);
        u.items.get(nm.text).push(nm.startPosition.row + 1);
      }
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i), unit);
  };
  walk(tree.rootNode, null);
}

// ---- mine ----
const all = [...units.values()];
const supA = new Map();
for (const u of all) for (const it of u.items.keys()) supA.set(it, (supA.get(it) || 0) + 1);
const frequent = new Set([...supA].filter(e => e[1] >= MINSUP).map(e => e[0]));

const supAB = new Map();
for (const u of all) {
  const its = [...u.items.keys()].filter(i => frequent.has(i)).sort();
  for (let i = 0; i < its.length; i++)
    for (let j = i + 1; j < its.length; j++) {
      const k = its[i] + ' ' + its[j];
      supAB.set(k, (supAB.get(k) || 0) + 1);
    }
}

const rules = [];
for (const [k, ab] of supAB) {
  if (ab < MINSUP) continue;
  const [x, y] = k.split(' ');
  for (const [A, B] of [[x, y], [y, x]]) {
    if (ONLY && ONLY.indexOf(A) < 0 && ONLY.indexOf(B) < 0) continue;
    const conf = ab / supA.get(A);
    const viol = supA.get(A) - ab;
    if (conf < MINCONF || viol < 1 || viol > MAXVIOL) continue;
    rules.push({ A, B, sup: ab, supA: supA.get(A), conf, viol, score: ab * conf * conf });
  }
}
rules.sort((a, b) => b.score - a.score);

// ---- report ----
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
console.log('# odd-one-out');
console.log('root=' + ROOT);
console.log('files=' + parsed + ' parseErrors=' + parseErrors.length + ' units=' + all.length +
  ' distinctItems=' + supA.size + ' frequent=' + frequent.size);
if (parseErrors.length) console.log('  !! parse errors in: ' + parseErrors.slice(0, 5).map(rel).join(', '));
console.log('scope=' + SCOPE + '  rules(minsup=' + MINSUP + ' minconf=' + MINCONF + ' maxviol=' + MAXVIOL + ')=' + rules.length);
console.log('');

let shown = 0;
for (const r of rules) {
  if (shown >= TOP) break;
  shown++;
  console.log('## [' + shown + '] ' + r.A + ' -> ' + r.B +
    '   sup=' + r.sup + '/' + r.supA + ' conf=' + (r.conf * 100).toFixed(0) + '% odd=' + r.viol);
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    console.log('   ' + rel(u.file) + ':' + u.items.get(r.A)[0] + '  recv=' + u.recv +
      '  in ' + u.unitKind + '@' + u.unitLine);
    console.log('      calls here: ' + [...u.items.keys()].join(', '));
  }
  console.log('');
}

// ---- zapis przebiegu ----
const { maybeWriteSnapshot } = await import('./snapshot.mjs');
const snapFindings = [];
let taken = 0;
for (const r of rules) {
  if (taken >= TOP) break;
  taken++;
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    snapFindings.push({
      rule: r.A + '->' + r.B,
      file: rel(u.file),
      anchor: u.unitKind + '|' + u.recv,
      line: u.items.get(r.A)[0],
      label: r.A + ' -> ' + r.B + '   (recv=' + u.recv + ', ' + u.unitKind + ')',
      meta: { sup: r.sup, supA: r.supA, conf: +r.conf.toFixed(2), viol: r.viol, unit: u.unitKind + '@' + u.unitLine },
    });
  }
}
maybeWriteSnapshot(argv, {
  detector: 'java', root: ROOT, args: argv.slice(1), cfg,
  counts: { pliki: parsed, zasieg: SCOPE, bledyParsowania: parseErrors.length, jednostki: all.length, regul: rules.length },
  findings: snapFindings,
});
