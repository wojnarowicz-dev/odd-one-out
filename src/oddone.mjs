// odd-one-out — PR-Miner-style deviation finder for Java.
// Unit of analysis: (innermost function-like node, receiver expression).
// Itemset: set of method names invoked on that receiver inside that unit.
// Rule A->B mined over units; a violation is a unit that has A but not B.
import { javaParser } from './parser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { makeFlag } from './args.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';

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

// PAIR SCOPE — how close two calls must stand to count as a pair. Three
// levels, widest first:
//
//   file    — anywhere in the file on the same receiver. Handling that sits in
//             another method of the same file WILL be seen, so the place is not
//             reported. Fewest false positives of that class, but also the
//             weakest notion of a "pair" — two calls a thousand lines apart are
//             not a pair in any useful sense.
//   method  — within a method or constructor; lambdas count towards the method
//             they sit in.
//   lambda  — within the innermost function, lambdas included (the default).
//             The sharpest notion of a pair; at the same time any handling
//             moved one level up looks like an omission.
const SCOPES = {
  lambda: new Set(['method_declaration', 'constructor_declaration',
    'compact_constructor_declaration', 'lambda_expression', 'static_initializer']),
  method: new Set(['method_declaration', 'constructor_declaration',
    'compact_constructor_declaration', 'static_initializer']),
  file: new Set(),
};
const SCOPE = String(flag('scope', 'lambda'));
if (!SCOPES[SCOPE]) {
  console.error(t('javaUnknownScope', SCOPE));
  process.exit(2);
}
const FUNC_LIKE = SCOPES[SCOPE];

const files = javaFiles(ROOT);
{
  const { noSourcesIn } = await import('./population.mjs');
  const missing = noSourcesIn(files.length, '.java', ROOT);
  if (missing) { console.log(missing); process.exit(0); }
}
const units = new Map();
const parseErrors = [];
let parsed = 0;

// RECEIVER TYPE. Without it `mediaControl.setOnEndOfMedia()` (MediaControl, a
// no-argument method of a project class) and `mediaPlayer.setOnEndOfMedia(...)`
// (javafx.MediaPlayer) count as the same item — because the rule looks at the
// method name, not at what it is called on.
//
// Type resolution is deliberately shallow and has two sources:
//   1. declarations of variables, fields and parameters in the file (name -> type),
//   2. an EXPRESSION -> TYPE map collected across the whole project from
//      declarations with an initialiser: `MediaPlayer player =
//      mediaView.getMediaPlayer();` teaches that `mediaView.getMediaPlayer()`
//      has type MediaPlayer.
// The second source is essential here: without it, receivers that are method
// calls stay unresolved and drop out of the population together with the real
// deviations.
//
// The scope is per file, not per block — shadowing is rare and deliberately
// ignored; a wrong type guess yields the same outcome as no type at all, the
// "?" item.
const TYPY = String(flag('types', 'on')) !== 'off';
const exprTypes = new Map();   // znormalizowane wyrazenie -> typ (caly projekt)

const bareType = t => String(t).replace(/<.*/s, '').replace(/\[\]/g, '').trim();
const norm = s => s.replace(/\s+/g, '');

// first pass: expression -> type map for the whole project
if (TYPY) {
  for (const file of files) {
    const src = readSource(file);
    const tree = parser.parse(src);
    const collect = (node) => {
      if (node.type === 'local_variable_declaration' || node.type === 'field_declaration') {
        const t = node.childForFieldName('type');
        if (t && t.text !== 'var') {
          for (let i = 0; i < node.childCount; i++) {
            const d = node.child(i);
            if (d.type !== 'variable_declarator') continue;
            const val = d.childForFieldName('value');
            if (val && (val.type === 'method_invocation' || val.type === 'field_access'))
              exprTypes.set(norm(val.text), bareType(t.text));
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) collect(node.child(i));
    };
    collect(tree.rootNode);
  }
}

for (const file of files) {
  const src = readSource(file);
  const tree = parser.parse(src);
  parsed++;
  if (tree.rootNode.hasError) parseErrors.push(file);

  // declarations in this file: name -> type
  const varTypes = new Map();
  if (TYPY) {
    const collectDeclarations = (node) => {
      if (node.type === 'local_variable_declaration' || node.type === 'field_declaration') {
        const t = node.childForFieldName('type');
        if (t && t.text !== 'var')
          for (let i = 0; i < node.childCount; i++) {
            const d = node.child(i);
            if (d.type === 'variable_declarator') {
              const n = d.childForFieldName('name');
              if (n) varTypes.set(n.text, bareType(t.text));
            }
          }
      } else if (node.type === 'formal_parameter' || node.type === 'catch_formal_parameter') {
        const t = node.childForFieldName('type');
        const n = node.childForFieldName('name');
        if (t && n && t.text !== 'var') varTypes.set(n.text, bareType(t.text));
      }
      for (let i = 0; i < node.childCount; i++) collectDeclarations(node.child(i));
    };
    collectDeclarations(tree.rootNode);
  }

  // ALIASES. `final MediaPlayer toDispose = player;` and one line later
  // `toDispose.dispose()` inside a lambda — the same object, but to the detector
  // these were two different receivers in two different units, so `dispose`
  // looked orphaned. The finding came purely from renaming a variable.
  //
  // Two steps, both required:
  //   1. canonicalise the name: x = y  =>  calls on x count as calls on y;
  //   2. attribute the call to the unit in which the variable was DECLARED,
  //      not the one the call stands in. Without that, an alias inside a lambda
  //      still sits in a unit separate from the rest of the object's life.
  // OFF BY DEFAULT — measured, it makes results worse. It removes exactly the
  // false positive it was written for (Loading.java:974, the toDispose alias),
  // but attributing calls to the declaring unit also merges unrelated calls and
  // creates new rules on query methods (setOnError -> getStatus). Balance on the
  // author's project: -1 false positive, +2 new ones; accuracy 29% -> 21%.
  // It stays as an option: in code that passes handles between variables more
  // often, the balance may go the other way.
  const ALIASES = String(flag('aliases', 'off')) === 'on';
  const alias = new Map();       // name -> name kanoniczna
  const declarations = new Map();  // name -> [{unit, start, end}]

  // SCOPES, NOT THE BARE NAME. A file-wide "name -> unit" map is wrong:
  // `player` may be declared in three methods, and then every call would be
  // attributed to the last of them. So we record the span of the function the
  // declaration sits in, and at the call site pick the span that contains it.
  if (ALIASES) {
    const collectAliases = (node, unit, span) => {
      if (FUNC_LIKE.has(node.type)) {
        const nn = node.childForFieldName ? node.childForFieldName('name') : null;
        unit = {
          line: node.startPosition.row + 1,
          kind: node.type === 'lambda_expression' ? 'lambda' : (nn ? nn.text : node.type),
        };
        span = { start: node.startIndex, end: node.endIndex };
      }
      if (node.type === 'local_variable_declaration') {
        for (let i = 0; i < node.childCount; i++) {
          const d = node.child(i);
          if (d.type !== 'variable_declarator') continue;
          const n = d.childForFieldName('name');
          const v = d.childForFieldName('value');
          if (!n) continue;
          if (v && v.type === 'identifier') alias.set(n.text, v.text);
          if (unit && span) {
            if (!declarations.has(n.text)) declarations.set(n.text, []);
            declarations.get(n.text).push({ unit, start: span.start, end: span.end });
          }
        }
      } else if (node.type === 'assignment_expression') {
        const l = node.childForFieldName('left');
        const r = node.childForFieldName('right');
        if (l && r && l.type === 'identifier' && r.type === 'identifier') alias.set(l.text, r.text);
      }
      for (let i = 0; i < node.childCount; i++) collectAliases(node.child(i), unit, span);
    };
    collectAliases(tree.rootNode, null, null);
  }

  // the declaration that encloses this call; with several, take the narrowest
  const declaringUnitFor = (name, poz) => {
    const lista = declarations.get(name);
    if (!lista) return null;
    let best = null;
    for (const d of lista) {
      if (poz < d.start || poz > d.end) continue;
      if (!best || (d.end - d.start) < (best.end - best.start)) best = d;
    }
    return best ? best.unit : null;
  };

  const canonical = (n) => {
    let x = n, i = 0;
    while (alias.has(x) && i++ < 8) x = alias.get(x);   // licznik chroni przed cyklem x=y, y=x
    return x;
  };

  // RECEIVER CREATED IN THIS VERY UNIT (signal 2). Collected before the main
  // pass, because `new X()` may stand after the calls as well as before them.
  const createdInUnit = new Map();   // "line:kind" -> Set(nazw)
  {
    const collectCreated = (node, unit) => {
      if (FUNC_LIKE.has(node.type)) {
        const nn = node.childForFieldName ? node.childForFieldName('name') : null;
        unit = (node.startPosition.row + 1) + ':' +
          (node.type === 'lambda_expression' ? 'lambda' : (nn ? nn.text : node.type));
      }
      const remember = (name) => {
        const k = unit || 'top';
        if (!createdInUnit.has(k)) createdInUnit.set(k, new Set());
        createdInUnit.get(k).add(name);
      };
      if (node.type === 'variable_declarator') {
        const n = node.childForFieldName('name');
        const v = node.childForFieldName('value');
        if (n && v && v.type === 'object_creation_expression') remember(n.text);
      } else if (node.type === 'assignment_expression') {
        const l = node.childForFieldName('left');
        const r = node.childForFieldName('right');
        if (l && r && l.type === 'identifier' && r.type === 'object_creation_expression')
          remember(l.text);
      }
      for (let i = 0; i < node.childCount; i++) collectCreated(node.child(i), unit);
    };
    collectCreated(tree.rootNode, null);
  }

  const receiverType = (obj, recvText) => {
    if (!TYPY) return null;
    if (!obj) return null;
    if (obj.type === 'identifier') {
      if (varTypes.has(obj.text)) return varTypes.get(obj.text);
      if (/^[A-Z]/.test(obj.text)) return obj.text;      // wywolanie statyczne
      return null;
    }
    return exprTypes.get(recvText) || null;
  };

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
        let recv = obj ? obj.text.replace(/\s+/g, '') : 'this';
        // a receiver that is a plain name is reduced to its canonical name, and
        // the call is attributed to the unit in which that name was created
        let unitForCall = unit;
        if (ALIASES && obj && obj.type === 'identifier') {
          recv = canonical(obj.text);
          const d = declaringUnitFor(recv, node.startIndex);
          if (d) unitForCall = d;
        }
        const key = file + ' ' + (unitForCall ? unitForCall.line + ':' + unitForCall.kind : 'top') + ' ' + recv;
        let u = units.get(key);
        if (!u) {
          u = {
            file,
            unitLine: unitForCall ? unitForCall.line : 0,
            unitKind: unitForCall ? unitForCall.kind : 'top',
            recv, typ: receiverType(obj, recv), items: new Map(),
            freshlyCreated: (createdInUnit.get(
              (unitForCall ? unitForCall.line + ':' + unitForCall.kind : 'top')) || new Set()).has(recv),
          };
          units.set(key, u);
        }
        // The item carries the receiver type: MediaPlayer#setOnError is not the
        // same as MediaControl#setOnEndOfMedia. An unresolved type gives "?".
        const item = TYPY ? (u.typ || '?') + '#' + nm.text : nm.text;
        if (!u.items.has(item)) u.items.set(item, []);
        u.items.get(item).push(nm.startPosition.row + 1);
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

// A PAIR OF PURE READS IS NOT A CONVENTION.
//
// The mining does not care what a method does, so `getName` followed by
// `getBirthDate` looked exactly like `stop` followed by `dispose`. Reading one
// field and not the other is not a defect; failing to release a player is. On
// the author's own code this barely showed — 15% of findings — because that
// code is full of calls that change state. On spring-petclinic, where most
// calls are reads, it was 71% and sat at the top of the list.
//
// ONLY WHEN BOTH SIDES ARE READS. `hasNext -> next` and `getInputStream ->
// close` stay: a read paired with something that acts is exactly the shape
// worth reporting.
//
// The prefixes require the next character to be a capital (or the end), so
// `toggleX` is not mistaken for a `to...` conversion and `issueX` not for an
// `is...` test. `--accessors keep` restores the old behaviour for comparison.
const ACCESSOR_PREFIX = /^(get|is|has|to|as)([A-Z]|$)/;
const ACCESSOR_EXACT = new Set([
  'size', 'length', 'count', 'charAt', 'codePointAt', 'indexOf', 'lastIndexOf',
  'contains', 'containsKey', 'containsValue', 'startsWith', 'endsWith',
  'equals', 'hashCode', 'compareTo', 'name', 'ordinal', 'value', 'values',
  'keySet', 'entrySet', 'iterator', 'stream', 'substring', 'trim', 'split',
  'elementAt', 'peek', 'first', 'last',
]);
const ACCESSORS = String(flag('accessors', 'drop'));
const itemName = s => (s.includes('#') ? s.slice(s.indexOf('#') + 1) : s);
// TWO SIBLING PREDICATES ARE THE EXCEPTION. Forgetting to read one of two
// fields is not a defect; forgetting one of two sibling STATE CHECKS is a
// whole class of them. Measured on the author's project, the first version of
// this filter removed `Duration#isUnknown -> Duration#isIndefinite` at
// VideoAnalyzerPro.java:877, where the code guards isUnknown() and the same
// file guards both twenty lines further down. For media of indefinite length
// toMillis() is infinite, the `<= 0` guard does not catch it, and the (int)
// cast yields 2147483647 seconds instead of -1. That is a real defect and the
// filter was eating it.
//
// So a pair is dropped when both sides are reads, UNLESS both sides are
// boolean predicates. `getName -> isNew` is still dropped: a value read next
// to a predicate carries no obligation either way.
const PREDICATE_PREFIX = /^(is|has)([A-Z]|$)/;
const isPredicate = s => PREDICATE_PREFIX.test(itemName(s));
const isAccessor = s => {
  const m = itemName(s);
  return ACCESSOR_PREFIX.test(m) || ACCESSOR_EXACT.has(m);
};
const bothPureReads = (A, B) =>
  isAccessor(A) && isAccessor(B) && !(isPredicate(A) && isPredicate(B));

const rules = [];
let droppedAccessorRules = 0;
for (const [k, ab] of supAB) {
  if (ab < MINSUP) continue;
  const [x, y] = k.split(' ');
  for (const [A, B] of [[x, y], [y, x]]) {
    // --only takes METHOD NAMES; items may carry a type prefix (Type#name)
    const name = s => s.includes('#') ? s.slice(s.indexOf('#') + 1) : s;
    if (ONLY && ONLY.indexOf(name(A)) < 0 && ONLY.indexOf(name(B)) < 0) continue;
    if (ACCESSORS !== 'keep' && bothPureReads(A, B)) { droppedAccessorRules++; continue; }
    const conf = ab / supA.get(A);
    const viol = supA.get(A) - ab;
    if (conf < MINCONF || viol < 1 || viol > MAXVIOL) continue;
    rules.push({ A, B, sup: ab, supA: supA.get(A), conf, viol, score: ab * conf * conf });
  }
}
rules.sort((a, b) => b.score - a.score);

// ---- pattern stability ----
//
// A pattern present in EVERY subset of the population is more trustworthy than
// one that only emerges from the whole. The latter often means the rule was
// glued together from several independent habits living in different parts of
// the project.
//
// NOTE — this is a CHECK, not a change of population. The rules are mined from
// the whole set (above) and nothing here touches that; the subsets serve only
// to count how evenly the pattern is spread. Splitting the population the
// detector WORKS ON makes results worse — measured with scope `method` (7%).
//
// The split is BY FILE, not by unit: a class must not be spread across subsets,
// because then each subset would see a truncated fragment of its habits.
const SUBSETS = Math.max(2, +flag('subsets', 4));
const fileHash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % SUBSETS;
};
for (const u of all) u.subset = fileHash(u.file);

for (const r of rules) {
  const supAi = new Array(SUBSETS).fill(0);
  const supABi = new Array(SUBSETS).fill(0);
  for (const u of all) {
    if (!u.items.has(r.A)) continue;
    supAi[u.subset]++;
    if (u.items.has(r.B)) supABi[u.subset]++;
  }

  // a "decisive" subset is one in which the antecedent occurs at all
  let decisive = 0, holds = 0;
  for (let i = 0; i < SUBSETS; i++) {
    if (supAi[i] === 0) continue;
    decisive++;
    if (supABi[i] / supAi[i] >= MINCONF) holds++;
  }

  // cumulative: does the rule hold on every prefix of the subsets
  let kumA = 0, kumAB = 0, prefixes = 0, prefixesHold = 0;
  for (let i = 0; i < SUBSETS; i++) {
    kumA += supAi[i]; kumAB += supABi[i];
    if (kumA === 0) continue;
    prefixes++;
    if (kumAB / kumA >= MINCONF) prefixesHold++;
  }

  r.stab = decisive === 0 ? null
    : +(((holds / decisive) + (prefixes ? prefixesHold / prefixes : 1)) / 2).toFixed(2);
  r.stabDesc = decisive === 0 ? t('ageNoData')
    : t('javaStabDesc', holds, decisive, prefixesHold, prefixes);
}

// ---- the "setter next to setter" sieve ----
//
// Mechanical co-occurrences of configuration calls occupied the first twelve
// positions of the ranking in discovery mode: setMinHeight -> setMinWidth,
// initModality -> initOwner, setCycleCount -> play. Their order and
// completeness are accidental, and a missing one of them is not a bug.
//
// Three signals, each switchable on its own (--filter 1 / 2 / 3 / 1,3) so that
// it is possible to measure what each removes. The sieve acts on RULES and
// FINDINGS — the population the rules were mined from is left untouched.
//
// MIND THE BOUNDARY: `setOnError` starts with "set" but ATTACHES AN EVENT
// HANDLER rather than setting a value. It has to survive every signal, or we
// lose the known answer MediaPlayer#dispose -> MediaPlayer#setOnError.
// ALL THREE ARE ON BY DEFAULT — measured; they take away no known answer and
// improve both modes:
//   discovery mode: verified hits move from position 88 to 47 of 99
//   --only setOnError: 14 -> 12 findings; the two removed are Menu.java:2690
//   and Preview.java:498, both judged false beforehand
// `--filter none` turns the sieve off.
const FILTER_RAW = String(flag('filter', '1,2,3'));
const FILTER = new Set(
  /^(none|off|missing)$/i.test(FILTER_RAW) ? []
    : FILTER_RAW.split(',').map(s => s.trim()).filter(Boolean));

const methodName = s => (s.includes('#') ? s.slice(s.indexOf('#') + 1) : s);
// setter = sets a value; setOnX is NOT a setter, it attaches an event handler
const isSetter = s => /^set[A-Z]/.test(methodName(s)) && !/^setOn[A-Z]/.test(methodName(s));
// signal 1: both sides are plain setters
const s1 = r => isSetter(r.A) && isSetter(r.B);

// signal 3: both sides SET STATE — recognised by the shape of the name, not by
// exclusion.
//
// THE FIRST VERSION WAS WRONG and it is worth knowing why. It defined "sets
// state" as "is neither an event nor a lifecycle action" — that is, by negating
// two short lists. On the author's own project it barely fired, because almost
// everything there was `setOn*` (event-shaped). On somebody else's code the
// same definition covered EVERYTHING ELSE: `charAt`/`length`, `get`/`size`,
// every pair of getters. On netty/common it removed nearly the whole report.
//
// Now the signal says exactly what its name promises: both sides have the shape
// of a configuration method name. `setMinHeight`, `initModality`,
// `putHeader`, `withTimeout` — yes. `charAt`, `size`, `error` — no.
// `setOnError` is still NOT a setter: it attaches an event handler.
//
// Signal 3 subsumes signal 1 (every setter is a configuration call). Signal 1
// is kept separately because it lets us measure its own contribution.
const isConfigCall = s => /^(set|init|put|with)[A-Z]/.test(methodName(s)) &&
  !/^setOn[A-Z]/.test(methodName(s));
const s3 = r => isConfigCall(r.A) && isConfigCall(r.B);
// signal 2 works on the FINDING: the receiver was created in this very unit
const s2 = u => u.freshlyCreated === true;

function sieved(r, u) {
  if (FILTER.has('1') && s1(r)) return 'setter obok settera';
  if (FILTER.has('3') && s3(r)) return 'obie ustawiaja stan';
  if (FILTER.has('2') && u && s2(u)) return 'odbiornik utworzony w tej jednostce';
  return null;
}

let sievedCount = 0;

const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

// ---- run snapshot ----
const { prepare, diffHeader, resultExit } = await import('./snapshot.mjs');
const snapFindings = [];
// THE SNAPSHOT HOLDS EVERYTHING; --top limits THE PRINTOUT ONLY.
// The snapshot used to be truncated by the same threshold as the report, so the
// contents of the file — and therefore the diff between runs and the ranking —
// depended on a display flag. Two runs with a different --top reported
// different "new deviations" over untouched code.
for (const r of rules) {
  // Sites that CONFORM to the pattern — needed to compare the age of the
  // deviation against the age of the rest. Without them the age signal has no
  // reference point.
  const pattern = [];
  for (const u of all) {
    if (!u.items.has(r.A) || !u.items.has(r.B)) continue;
    pattern.push({ file: rel(u.file), line: u.items.get(r.B)[0] });
    if (pattern.length >= 5) break;
  }
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    if (sieved(r, u)) continue;
    snapFindings.push({
      rule: r.A + '->' + r.B,
      file: rel(u.file),
      anchor: u.unitKind + '|' + u.recv,
      line: u.items.get(r.A)[0],
      label: r.A + ' -> ' + r.B + '   (recv=' + u.recv + ', ' + u.unitKind + ')',
      meta: {
        sup: r.sup, supA: r.supA, conf: +r.conf.toFixed(2), viol: r.viol,
        unit: u.unitKind + '@' + u.unitLine,
        stab: r.stab, stabDesc: r.stabDesc,
        pattern,
      },
    });
  }
}
const w = prepare(argv, {
  detector: 'java', root: ROOT, args: argv.slice(1), cfg,
  counts: { sources: parsed, zasieg: SCOPE, bledyParsowania: parseErrors.length, jednostki: all.length, regul: rules.length },
  findings: snapFindings,
});
const visible = new Set(w.toShow.map(f => f.rule + '|' + f.file + '|' + f.line));
resultExit(w.newCount ? 1 : 0);

// ---- report ----
console.log(t('javaTitle'));
console.log(t('root') + ROOT);
console.log(t('javaStats', parsed, parseErrors.length, all.length, supA.size, frequent.size));
if (parseErrors.length) console.log(t('javaParseErrors', parseErrors.slice(0, 5).map(rel).join(', ')));
if (FILTER.size) console.log(t('javaSieve', [...FILTER].join(',')));
const { notEnoughData } = await import('./population.mjs');
diffHeader(w);
if ([...supA.keys()].some(k => k.startsWith('?#'))) console.log(t('legendUnknownType'));
console.log(t('javaRules', SCOPE, MINSUP, MINCONF, MAXVIOL, rules.length));
if (droppedAccessorRules > 0) console.log(t('javaAccessorsDropped', droppedAccessorRules));
console.log('');

// No population: one judgement shared by all detectors (src/population.mjs).
const missing = notEnoughData(frequent.size, MINSUP);
if (missing) { console.log(missing); }

// PRINT THE HEADER ONLY ONCE WE KNOW SOMETHING WILL FOLLOW IT.
// The rule header used to go out immediately, with the sites printed under it —
// so when every site had been sieved away or dropped by the diff, a bare header
// was left on screen. On a stranger's repository that produced ten empty
// sections in a row, which reads as a broken tool rather than as "no results".
// A rule with no sites also no longer consumes a TOP slot; otherwise an empty
// rule pushed a rule that does have content off the list.
let shown = 0;
for (const r of rules) {
  if (shown >= TOP) break;

  const violations = [];
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    if (sieved(r, u)) { sievedCount++; continue; }
    if (!visible.has((r.A + '->' + r.B) + '|' + rel(u.file) + '|' + u.items.get(r.A)[0])) continue;
    violations.push(u);
  }
  if (violations.length === 0) continue;

  // THE PLACES THAT HOLD THE PATTERN. Until this was added, a java finding was a
  // rule header and a list of sites, and the reader had to take "45 of 49" on
  // faith — the evidence the rule rests on was never shown. Every other detector
  // has said WHAT IS INCONSISTENT, HOW IT IS DONE ELSEWHERE and offered a
  // ready-made fix from the start; java, which produces almost every finding on
  // a real project, had none of the three. It stayed invisible because these
  // findings were only ever read through `rank` and the known-answer suite.
  const conforming = [];
  for (const u of all) {
    if (!u.items.has(r.A) || !u.items.has(r.B)) continue;
    conforming.push(u);
    if (conforming.length >= 2) break;
  }

  shown++;
  console.log(t('javaRuleHead', shown, r.A, r.B, r.sup, r.supA, (r.conf * 100).toFixed(0), r.viol) +
    (r.stab === null ? '' : t('javaStab', r.stab, r.stabDesc)));
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

  // The fix is a call, not a patch. The rule knows WHICH call is missing and on
  // what; it does not know the arguments, and says so. Same reason nothing here
  // is ever written to a file.
  console.log('');
  console.log(t('secFix'));
  const first = violations[0];
  console.log(t('javaFixWhere', rel(first.file), first.items.get(r.A)[0],
    first.unitKind + '@' + first.unitLine));
  console.log('     + ' + first.recv + '.' + methodName(r.B) + '(...);');
  console.log(t('javaFixNote', r.sup));
  console.log('');
}

// WHAT IS ON SCREEN IS NOT THE WHOLE LIST. Ten rule blocks used to be printed
// next to a line saying 518 rules had been mined, with nothing connecting the
// two and no hint that `rank` is where the full, ordered list lives.
// ONLY WHEN THE CAP IS WHAT CUT THE LIST. `shown < rules.length` is also true on
// a second run where the diff hid everything unchanged — saying "shown 0 of 518"
// there would blame the cap for something the diff did, and the diff line above
// has already explained it.
if (shown >= TOP && rules.length > shown) {
  console.log(t('javaMoreRules', shown, rules.length, flag('json', null) || '<snapshot.json>'));
  console.log('');
}

// One sentence if any source was not valid UTF-8. Printed last, so it is the
// line left on screen rather than something scrolled past.
reportNonUtf8(rel);
