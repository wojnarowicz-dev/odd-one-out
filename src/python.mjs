// odd-one-out — PR-Miner-style deviation finder for Python.
//
// THE ALGORITHM IS THE JAVA ONE, UNCHANGED. Unit of analysis: (innermost
// function-like node, receiver expression). Itemset: the method names called on
// that receiver inside that unit. Rule A->B mined over units; a violation is a
// unit that has A but not B. Same thresholds, same reporting.
//
// WHAT IS HARDER HERE: THE RECEIVER. Java says `MediaPlayer player = ...` and
// the type is written down. Python says `sock = socket.socket(...)` and there is
// nothing to read but the name. So "the same object" is recognised by the
// variable name inside one function, qualified four ways:
//
//   1. TAG FROM THE CONSTRUCTOR. `s = requests.Session()` tags `s` as Session;
//      `f = open(path)` tags `f` as open; `sock = socket.socket(...)` tags it
//      socket. This is the counterpart of Java's expression->type map, except
//      the source is the name of the callee rather than a declaration.
//   2. MODULE. `requests.get(...)` — if `requests` was imported, the receiver is
//      the module itself and the tag is its name.
//   3. `with open(p) as f:` — the same tagging as an assignment, from the
//      as-clause.
//   4. NOTHING MATCHED -> `?#name`, exactly like Java's unresolved `?`.
//
// WHAT THIS LOSES, said plainly: an object arriving as a parameter
// (`def send(session)`), one read from a field without a local assignment, one
// unpacked from a tuple (`sock = listener.accept()[0]` — a subscript, not a
// call), and anything from a factory that returns different types. In Java a
// declaration rescues all four. Here they fall through to `?`, which still
// groups by name but no longer distinguishes two different objects that happen
// to share one.
//
// ONE DEVIATION FROM THE FIRST PLAN, on purpose: `self.field` receivers were
// going to be scoped to the class, so that a field used in two methods stayed
// one unit. They are not — a unit is a function here exactly as in Java, where
// `player.stop()` in one method and `player.dispose()` in another are also two
// units. Consistency with the Java model beats the improvement, and `--scope`
// is the flag for widening it.
//
// NOT PORTED FROM JAVA: the setter sieve (Python has no setX/getX convention to
// sieve), aliases, stability and age. All four were measured on Java and three
// of them are off by default there anyway.
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { makeFlag } from './args.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';
import { pythonParser } from './parser.mjs';

const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = makeFlag(argv);
const MINSUP = +flag('minsup', 3);
const MINCONF = +flag('minconf', 0.6);
const MAXVIOL = +flag('maxviol', 4);
const TOP = +flag('top', 10);
const ONLY = flag('only', null) ? String(flag('only', '')).split(',') : null;

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

function pythonFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) pythonFiles(p, acc);
    else if (e.name.endsWith('.py')) acc.push(p);
  }
  return acc;
}

const SCOPES = {
  lambda: new Set(['function_definition', 'lambda']),
  function: new Set(['function_definition']),
};
const SCOPE = String(flag('scope', 'lambda'));
if (!SCOPES[SCOPE]) {
  console.error(t('pythonUnknownScope', SCOPE));
  process.exit(2);
}
const FUNC_LIKE = SCOPES[SCOPE];

const parser = await pythonParser();
const files = pythonFiles(ROOT);
{
  const { noSourcesIn } = await import('./population.mjs');
  const missing = noSourcesIn(files.length, '.py', ROOT);
  if (missing) { console.log(missing); process.exit(0); }
}

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const norm = s => s.replace(/\s+/g, '');
const lastName = s => String(s).split('.').pop();

const units = new Map();
const parseErrors = [];
let parsed = 0;

for (const file of files) {
  const src = readSource(file);
  const tree = parser.parse(src);
  parsed++;
  if (tree.rootNode.hasError) parseErrors.push(file);

  // Module-level imports: which bare names ARE modules.
  const modules = new Set();
  const collectImports = (n) => {
    if (n.type === 'import_statement' || n.type === 'import_from_statement') {
      for (let i = 0; i < n.childCount; i++) {
        const c = n.child(i);
        if (c.type === 'dotted_name' || c.type === 'identifier') modules.add(lastName(c.text));
        if (c.type === 'aliased_import') {
          const alias = c.childForFieldName('alias');
          if (alias) modules.add(alias.text);
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) collectImports(n.child(i));
  };
  collectImports(tree.rootNode);

  // name -> tag, from `x = Callee(...)` and `with Callee(...) as x`.
  const tags = new Map();
  const collectTags = (n) => {
    if (n.type === 'assignment') {
      const left = n.childForFieldName('left');
      const right = n.childForFieldName('right');
      if (left && right && left.type === 'identifier' && right.type === 'call') {
        const fn = right.childForFieldName('function');
        if (fn) tags.set(left.text, lastName(fn.text));
      }
    } else if (n.type === 'as_pattern') {
      const val = n.child(0);
      const alias = n.childForFieldName('alias');
      if (val && alias && val.type === 'call') {
        const fn = val.childForFieldName('function');
        if (fn) tags.set(alias.text.replace(/[()]/g, ''), lastName(fn.text));
      }
    }
    for (let i = 0; i < n.childCount; i++) collectTags(n.child(i));
  };
  collectTags(tree.rootNode);

  const unitKey = (node) => {
    let u = node.parent;
    while (u && !FUNC_LIKE.has(u.type)) u = u.parent;
    if (!u) return null;
    const nameNode = u.childForFieldName('name');
    return {
      key: file + '|' + u.startIndex,
      kind: nameNode ? nameNode.text : u.type,
      line: u.startPosition.row + 1,
    };
  };

  const walk = (n) => {
    if (n.type === 'call') {
      const fn = n.childForFieldName('function');
      if (fn && fn.type === 'attribute') {
        const obj = fn.childForFieldName('object');
        const attr = fn.childForFieldName('attribute');
        if (obj && attr) {
          const recv = norm(obj.text);
          const method = attr.text;
          const tag = obj.type === 'identifier'
            ? (tags.get(obj.text) || (modules.has(obj.text) ? obj.text : null))
            : null;
          const item = (tag || '?') + '#' + method;
          const u = unitKey(n);
          if (u) {
            const k = u.key + '|' + recv;
            if (!units.has(k)) {
              units.set(k, {
                file, recv, items: new Map(),
                unitKind: u.kind, unitLine: u.line,
              });
            }
            const unit = units.get(k);
            if (!unit.items.has(item)) unit.items.set(item, []);
            unit.items.get(item).push(n.startPosition.row + 1);
          }
        }
      }
    }
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(tree.rootNode);
}

const all = [...units.values()];

// ---- mining, identical to the Java detector ----
const supA = new Map();
const supAB = new Map();
for (const u of all) {
  const items = [...u.items.keys()].sort();
  for (const a of items) supA.set(a, (supA.get(a) || 0) + 1);
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const k = items[i] + ' ' + items[j];
      supAB.set(k, (supAB.get(k) || 0) + 1);
    }
}
const frequent = new Set([...supA].filter(e => e[1] >= MINSUP).map(e => e[0]));

const methodName = s => (s.includes('#') ? s.slice(s.indexOf('#') + 1) : s);

const rules = [];
for (const [k, ab] of supAB) {
  if (ab < MINSUP) continue;
  const [x, y] = k.split(' ');
  for (const [A, B] of [[x, y], [y, x]]) {
    if (ONLY && ONLY.indexOf(methodName(A)) < 0 && ONLY.indexOf(methodName(B)) < 0) continue;
    const conf = ab / supA.get(A);
    const viol = supA.get(A) - ab;
    if (conf < MINCONF || viol < 1 || viol > MAXVIOL) continue;
    rules.push({ A, B, sup: ab, supA: supA.get(A), conf, viol, score: ab * conf * conf });
  }
}
rules.sort((a, b) => b.score - a.score);

// ---- snapshot and diff ----
const snapFindings = [];
for (const r of rules) {
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    snapFindings.push({
      rule: r.A + '->' + r.B,
      file: rel(u.file),
      anchor: u.recv,
      line: u.items.get(r.A)[0],
      label: r.A + ' -> ' + r.B + ' on ' + u.recv,
      meta: { sup: r.sup, supA: r.supA, conf: +(r.conf * 100).toFixed(0), viol: r.viol, unit: u.unitKind },
    });
  }
}

const { prepare, diffHeader, resultExit } = await import('./snapshot.mjs');
const w = prepare(argv, {
  detector: 'python',
  root: ROOT,
  cfg,
  args: argv.slice(1),
  counts: { pliki: parsed, jednostki: all.length, pozycje: supA.size, czeste: frequent.size },
  findings: snapFindings,
});
const visible = new Set(w.toShow.map(f => f.rule + '|' + f.file + '|' + f.line));
resultExit(w.newCount ? 1 : 0);

// ---- report ----
console.log(t('pythonTitle'));
console.log(t('root') + ROOT);
console.log(t('pythonStats', parsed, parseErrors.length, all.length, supA.size, frequent.size));
if (parseErrors.length) console.log(t('javaParseErrors', parseErrors.slice(0, 5).map(rel).join(', ')));
diffHeader(w);
if ([...supA.keys()].some(k => k.startsWith('?#'))) console.log(t('legendUnknownType'));
console.log(t('javaRules', SCOPE, MINSUP, MINCONF, MAXVIOL, rules.length));
console.log('');

const { notEnoughData } = await import('./population.mjs');
const missing = notEnoughData(frequent.size, MINSUP);
if (missing) console.log(missing);

let shown = 0;
for (const r of rules) {
  if (shown >= TOP) break;

  const violations = [];
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    if (!visible.has((r.A + '->' + r.B) + '|' + rel(u.file) + '|' + u.items.get(r.A)[0])) continue;
    violations.push(u);
  }
  if (violations.length === 0) continue;

  const conforming = [];
  for (const u of all) {
    if (!u.items.has(r.A) || !u.items.has(r.B)) continue;
    conforming.push(u);
    if (conforming.length >= 2) break;
  }

  shown++;
  console.log(t('javaRuleHead', shown, r.A, r.B, r.sup, r.supA, (r.conf * 100).toFixed(0), r.viol));
  console.log('');
  console.log(t('secInconsistent'));
  console.log(t('javaWhatBody', methodName(r.B), r.sup, r.supA, methodName(r.A), r.viol));
  for (const u of violations) {
    console.log('     ' + rel(u.file) + ':' + u.items.get(r.A)[0] + '  recv=' + u.recv +
      '  in ' + u.unitKind + '@' + u.unitLine);
    console.log(t('javaCallsHere', [...u.items.keys()].join(', ')));
  }
  if (conforming.length) {
    console.log('');
    console.log(t('secElsewhere'));
    for (const u of conforming) {
      console.log('     ' + rel(u.file) + ':' + u.items.get(r.B)[0] + '  recv=' + u.recv +
        '  in ' + u.unitKind + '@' + u.unitLine);
      console.log(t('javaCallsBoth', methodName(r.A), methodName(r.B)));
    }
  }
  console.log('');
  console.log(t('secFix'));
  const first = violations[0];
  console.log(t('javaFixWhere', rel(first.file), first.items.get(r.A)[0],
    first.unitKind + '@' + first.unitLine));
  console.log('     + ' + first.recv + '.' + methodName(r.B) + '(...)');
  console.log(t('javaFixNote', r.sup));
  console.log('');
}

if (shown >= TOP && rules.length > shown) {
  console.log(t('javaMoreRules', shown, rules.length, flag('json', null) || '<snapshot.json>'));
  console.log('');
}

reportNonUtf8(rel);
