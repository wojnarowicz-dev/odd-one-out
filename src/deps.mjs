// odd-one-out / category 5 — dependencies spread inconsistently.
//
// It does not report the mere use of a library. It reports a DIVERGENCE:
// "N classes do this through layer X, K do it directly".
//
// The crucial part: "through the layer" means CALLS A SPECIFIC WRAPPING METHOD,
// not "touches that class anywhere". Without that, a constants class imported by
// half the project (FilePaths) poses as an I/O facade and the whole result is
// noise.
//
// The layer is not hard-coded. It is detected like this: a public method of a
// project class that calls an external operation T.m is a "wrapper" of T.m.
// Whoever calls that method goes through the layer. Whoever calls T.m directly
// deviates.
import { javaParser } from './parser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { makeFlag } from './args.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';

const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = makeFlag(argv);
const MINVIA = +flag('minvia', 5);   // count klas musi iść przez warstwę, by to była konwencja
const MAXODD = +flag('maxodd', 3);   // ilu odstających jeszcze zgłaszamy (więcej = to nie rozjazd)
const TOP = +flag('top', 10);

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

// TWO GRAMMARS, ONE DETECTOR. The algorithm below (layer vs direct use) is
// language-independent — only the FACT EXTRACTION differs. Java and JavaScript
// say the same thing in a different syntactic shape:
//
//   Java:  SafeIo.writeStringUtf8(path, txt)   — a call on a TYPE
//   JS:    import { prepare } from './snapshot.mjs';  prepare(argv, ...)
//                                              — a call on a BARE NAME from an import
//
// So the JS adapter reduces one to the other: a name imported from a module is
// given a synthetic "type" (#name) pointing at the source module. From that
// point on the rest of the detector does not know which language it is in.
function collectSources(dir, acc = { java: [], js: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) { collectSources(p, acc); continue; }
    if (e.name.endsWith('.java')) acc.java.push(p);
    else if (/\.(js|mjs|cjs|ts|mts)$/i.test(e.name)) acc.js.push(p);
  }
  return acc;
}

const parser = await javaParser();
const sources = collectSources(ROOT);
{
  const { noSourcesIn } = await import('./population.mjs');
  const missing = noSourcesIn(sources.java.length + sources.js.length, '.java/.js/.ts', ROOT);
  if (missing) { console.log(missing); process.exit(0); }
}

let parserJs = null;
if (sources.js.length) {
  const { Parser, Language } = await import('web-tree-sitter');
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  await Parser.init();
  parserJs = new Parser();
  parserJs.setLanguage(await Language.load(req.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm')));
}

const classes = new Map();

for (const file of sources.java) {
  const src = readSource(file);
  const tree = parser.parse(src);

  let pkg = '';
  const imports = new Map();
  const starPkgs = [];
  const methods = [];        // {name, isPublic, sig, line, calls:[{type,method,line,text}]}
  const calls = [];          // wszystkie statyczne wywołania Typ.metoda w pliku

  const collectCalls = (node, sink) => {
    if (node.type === 'method_invocation') {
      const obj = node.childForFieldName('object');
      const nm = node.childForFieldName('name');
      if (obj && nm && obj.type === 'identifier' && /^[A-Z]/.test(obj.text)) {
        sink.push({
          type: obj.text, method: nm.text,
          line: nm.startPosition.row + 1,
          text: node.text.replace(/\s+/g, ' ').slice(0, 200),
        });
      }
    }
    for (let i = 0; i < node.childCount; i++) collectCalls(node.child(i), sink);
  };

  const walk = (node) => {
    if (node.type === 'package_declaration') {
      pkg = node.text.replace(/^package\s+/, '').replace(/;\s*$/, '').trim();
    } else if (node.type === 'import_declaration') {
      const raw = node.text;
      const t = raw.replace(/^import\s+(static\s+)?/, '').replace(/;\s*$/, '').trim();
      if (t.endsWith('.*')) starPkgs.push(t.slice(0, -2));
      else {
        const parts = t.split('.');
        const isStatic = /^import\s+static/.test(raw);
        const idx = isStatic && /^[a-z]/.test(parts[parts.length - 1]) ? parts.length - 2 : parts.length - 1;
        if (idx >= 0) imports.set(parts[idx], parts.slice(0, idx + 1).join('.'));
      }
    } else if (node.type === 'method_declaration') {
      const nm = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      const header = src.slice(node.startIndex, body ? body.startIndex : node.endIndex)
        .replace(/\s+/g, ' ').trim();
      const inner = [];
      if (body) collectCalls(body, inner);
      methods.push({
        name: nm ? nm.text : '?',
        isPublic: /(^|\s)public(\s|$)/.test(header),
        sig: header,
        line: node.startPosition.row + 1,
        calls: inner,
      });
    }
    for (let i = 0; i < node.childCount; i++) walk(node.child(i));
  };
  walk(tree.rootNode);
  collectCalls(tree.rootNode, calls);

  const simple = path.basename(file, '.java');
  const fqn = pkg ? pkg + '.' + simple : simple;
  classes.set(fqn, { fqn, simple, pkg, file, src, imports, starPkgs, methods, calls });
}

// ---- JavaScript / TypeScript adapter ----
for (const file of sources.js) {
  const src = readSource(file);
  const tree = parserJs.parse(src);

  const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
  const targets = new Map();     // "#nazwaLokalna" -> id modulu (projekt) albo specyfikator (zewn.)
  const exportedName = new Map();     // nazwaLokalna -> name eksportowana (przy aliasach)
  const methods = [];
  const calls = [];

  // a project module is recognised by a relative specifier; the rest is external
  const importTarget = (spec) => {
    if (!spec.startsWith('.')) return spec;                       // 'node:fs', 'web-tree-sitter'
    const abs = path.resolve(path.dirname(file), spec);
    return path.relative(ROOT, abs).replace(/\\/g, '/');
  };

  const recordImport = (lokalna, eksportowana, spec) => {
    targets.set('#' + lokalna, importTarget(spec));
    exportedName.set(lokalna, eksportowana || lokalna);
  };

  const collectJsCalls = (node, sink) => {
    if (node.type === 'call_expression') {
      const f = node.childForFieldName('function');
      if (f && f.type === 'identifier' && targets.has('#' + f.text)) {
        // a bare name from an import — the equivalent of Facade.method() in Java
        sink.push({
          type: '#' + f.text, method: exportedName.get(f.text) || f.text,
          line: f.startPosition.row + 1,
          text: node.text.replace(/\s+/g, ' ').slice(0, 200),
        });
      } else if (f && f.type === 'member_expression') {
        const o = f.childForFieldName('object');
        const pr = f.childForFieldName('property');
        if (o && pr && o.type === 'identifier' && targets.has('#' + o.text))
          sink.push({
            type: '#' + o.text, method: pr.text,
            line: pr.startPosition.row + 1,
            text: node.text.replace(/\s+/g, ' ').slice(0, 200),
          });
      }
    }
    for (let i = 0; i < node.childCount; i++) collectJsCalls(node.child(i), sink);
  };

  // 1. imports — static and dynamic (`const { x } = await import('...')`)
  const collectImports = (node) => {
    if (node.type === 'import_statement') {
      const zrodlo = node.childForFieldName('source');
      const spec = zrodlo ? zrodlo.text.slice(1, -1) : null;
      if (spec) {
        const wIdent = (n) => {
          if (n.type === 'import_specifier') {
            const nm = n.childForFieldName('name');
            const al = n.childForFieldName('alias');
            if (nm) recordImport((al || nm).text, nm.text, spec);
          } else if (n.type === 'namespace_import' || n.type === 'identifier') {
            const nm = n.type === 'identifier' ? n : n.child(n.childCount - 1);
            if (nm && n.parent && n.parent.type !== 'import_specifier') recordImport(nm.text, null, spec);
          }
          for (let i = 0; i < n.childCount; i++) wIdent(n.child(i));
        };
        wIdent(node);
      }
    } else if (node.type === 'variable_declarator') {
      // const { prepare } = await import('./snapshot.mjs');
      const nm = node.childForFieldName('name');
      const val = node.childForFieldName('value');
      const text = val ? val.text : '';
      const m = text.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (m && nm) {
        if (nm.type === 'object_pattern') {
          for (let i = 0; i < nm.childCount; i++) {
            const p = nm.child(i);
            if (p.type === 'shorthand_property_identifier_pattern') recordImport(p.text, p.text, m[1]);
            else if (p.type === 'pair_pattern') {
              const k = p.childForFieldName('key');
              const v = p.childForFieldName('value');
              if (k && v) recordImport(v.text, k.text, m[1]);
            }
          }
        } else if (nm.type === 'identifier') recordImport(nm.text, null, m[1]);
      }
    }
    for (let i = 0; i < node.childCount; i++) collectImports(node.child(i));
  };
  collectImports(tree.rootNode);

  // 2. publiczne metody modulu = funkcje eksportowane
  const collectFunctions = (node) => {
    if (node.type === 'function_declaration') {
      const nm = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      const eksportowana = node.parent && node.parent.type === 'export_statement';
      const inner = [];
      if (body) collectJsCalls(body, inner);
      if (nm) methods.push({
        name: nm.text,
        isPublic: !!eksportowana,
        sig: src.slice(node.startIndex, body ? body.startIndex : node.endIndex).replace(/\s+/g, ' ').trim(),
        line: node.startPosition.row + 1,
        calls: inner,
      });
    }
    for (let i = 0; i < node.childCount; i++) collectFunctions(node.child(i));
  };
  collectFunctions(tree.rootNode);
  collectJsCalls(tree.rootNode, calls);

  classes.set(relPath, {
    fqn: relPath, simple: path.basename(file), pkg: path.dirname(relPath),
    file, src, imports: new Map(), starPkgs: [], targets, methods, calls,
  });
}

const isProject = f => classes.has(f);
function resolve(c, name) {
  if (c.targets && c.targets.has(name)) return c.targets.get(name);   // JS: #name -> modul
  if (c.imports.has(name)) return c.imports.get(name);
  const same = c.pkg + '.' + name;
  if (classes.has(same)) return same;
  for (const sp of c.starPkgs) if (classes.has(sp + '.' + name)) return sp + '.' + name;
  return null;
}

// ---- 1. kto woła jaką operację zewnętrzną wprost ----
const extCallers = new Map();   // "T#m" -> Map(fqn -> [{line,text,file}])
// ---- 2. who calls which method of a project class ----
const projCallers = new Map();  // "Fqn#m" -> Set(fqn)

for (const c of classes.values()) {
  for (const call of c.calls) {
    const target = resolve(c, call.type);
    if (!target) continue;
    if (isProject(target)) {
      const k = target + '#' + call.method;
      if (!projCallers.has(k)) projCallers.set(k, new Set());
      projCallers.get(k).add(c.fqn);
    } else {
      const k = target + '#' + call.method;
      if (!extCallers.has(k)) extCallers.set(k, new Map());
      if (!extCallers.get(k).has(c.fqn)) extCallers.get(k).set(c.fqn, []);
      extCallers.get(k).get(c.fqn).push({ line: call.line, text: call.text, file: c.file });
    }
  }
}

// ---- 3. layers: a public project method wrapping an external operation ----
//
// The mere fact that a public method calls T.m does NOT make it a wrapper of
// T.m — almost every method calls something.
// ProjectFileBundle.resolveAnchorVideoMediaPath() calls Files.readAllLines(),
// but it is a domain operation, not an I/O wrapper.
//
// A thin wrapper is told apart by two conditions:
//   1. NAME — a wrapper is named after what it wraps.
//      movePathWithRetry ⊃ "move", readStringUtf8WithRetry ⊃ "readString",
//      but resolveAnchorVideoMediaPath ⊅ "readAllLines".
//   2. THINNESS — a wrapper does not do many other external things beside it.
const NAME_MIN = 4;      // krótsze nazwy (get, put, of) są za pospolite, by cokolwiek znaczyć
const MAX_OTHER_OPS = 6; // count innych operacji zewn. metoda może wołać, wciąż będąc opakowaniem

// A SECOND WAY TO RECOGNISE A WRAPPER, and the measurement that forced it.
//
// The name rule above missed a real deviation in this very repository:
// `parser.mjs` exports `javaParser()`, which wraps `Language.load(...)` from
// web-tree-sitter, while `parsecheck.mjs` called `Language.load` directly with a
// path relative to the working directory. That is exactly "N through the layer,
// K directly" — and the detector stayed silent, because `javaParser` ⊅ `load`.
// Proven by experiment: renaming it to `loadJavaParser` and changing nothing
// else made the detector report `src/parsecheck.mjs:4` immediately.
//
// So a wrapper is also recognised when EVERY external operation it calls comes
// from ONE external module and there are at most three of them — a function
// that touches a single library and nothing else is a layer over that library
// whatever it is called. `javaParser` calls only `Parser.init` and
// `Language.load`, both from web-tree-sitter.
//
// MEASURED, AND NOT ADOPTED AS THE DEFAULT. The module criterion was tried as
// the default and it is too wide. On the author's project it turned 3 recognised
// wrappers into 25, and what it added is led by `Platform.runLater` (111
// entries): `runLater` is called from everywhere, so every short method that
// happens to touch only JavaFX was counted as a layer over it. That is the same
// false-wrapper mistake as `resolveAnchorVideoMediaPath` "wrapping"
// `readAllLines`, arrived at from the other side.
//
//   project                --wrapper name         --wrapper both
//   the author's project    3 wrappers,  15 recs   25 wrappers, 211 recs
//   netty (common)          6 wrappers,   4 recs   34 wrappers,  42 recs
//   odd-one-out itself      0 wrappers             9 wrappers
//
// Divergences stayed at 0 on all three projects, so none of it became a finding
// at default thresholds — but migrations on the author's project went 2 -> 10 and
// the saved run went from 15 records to 211, changing every fingerprint in it.
//
// So the default stays `name` and THE PARSECHECK GAP STAYS OPEN AND KNOWN.
// `--wrapper both --minvia 2` does report it — the layer has only three users,
// below the default of five — but nobody runs that by accident. A wrapper test
// that is both tighter and name-independent is the real fix, and is not written.
const WRAPPER_MODE = String(flag('wrapper', 'name'));
const MAX_SINGLE_MODULE_OPS = 3;

const wrappers = new Map();     // "T#m" -> [{facade, method, sig, line}]
for (const c of classes.values()) {
  for (const m of c.methods) {
    if (!m.isPublic) continue;
    const distinctOps = new Set(m.calls.map(x => x.type + '#' + x.method));
    // which external modules does this method touch at all?
    const externalTargets = new Set();
    for (const call of m.calls) {
      const tg = resolve(c, call.type);
      if (tg && !isProject(tg)) externalTargets.add(tg);
    }
    const singleModuleThin = externalTargets.size === 1 &&
      [...distinctOps].length <= MAX_SINGLE_MODULE_OPS;

    for (const call of m.calls) {
      const target = resolve(c, call.type);
      if (!target || isProject(target)) continue;
      if (call.method.length < NAME_MIN) continue;
      const byName = m.name.toLowerCase().includes(call.method.toLowerCase());
      const byModule = singleModuleThin;
      const ok = WRAPPER_MODE === 'name' ? byName
        : WRAPPER_MODE === 'module' ? byModule
          : (byName || byModule);
      if (!ok) continue;
      if (distinctOps.size > MAX_OTHER_OPS) continue;
      const k = target + '#' + call.method;
      if (!wrappers.has(k)) wrappers.set(k, []);
      if (!wrappers.get(k).some(w => w.facade === c.fqn && w.method === m.name))
        wrappers.get(k).push({ facade: c.fqn, method: m.name, sig: m.sig, line: m.line });
    }
  }
}

// ---- 4. rozjazdy ----
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const short = f => f.replace(/^com\.example\.main\.app\./, '');

const findings = [];
for (const [op, wraps] of wrappers) {
  const byFacade = new Map();
  for (const w of wraps) {
    if (!byFacade.has(w.facade)) byFacade.set(w.facade, []);
    byFacade.get(w.facade).push(w);
  }
  for (const [facade, ms] of byFacade) {
    // who goes through the layer = calls any of the wrapping methods
    const via = new Set();
    for (const m of ms)
      for (const u of (projCallers.get(facade + '#' + m.method) || []))
        if (u !== facade) via.add(u);

    // who deviates = calls the operation directly, without being the layer itself
    const direct = extCallers.get(op) || new Map();
    const odd = [...direct.keys()].filter(f => f !== facade);
    if (odd.length === 0) continue;

    // Three different states that must not be confused:
    //   DIVERGENCE — the layer is the convention, a few sites bypass it
    //   MIGRATION  — both routes are common; there is nothing to call a deviation
    //   TOO_LITTLE — the layer has too few users to claim anything
    let kind;
    if (via.size >= MINVIA && odd.length <= MAXODD) kind = 'DIVERGENCE';
    else if (via.size >= 2 && odd.length > MAXODD) kind = 'MIGRATION';
    else kind = 'TOO_LITTLE';

    findings.push({
      kind, op, facade, methods: ms, via: [...via], odd,
      sites: odd.map(f => ({ fqn: f, hits: direct.get(f) })),
      score: (kind === 'DIVERGENCE' ? 1000 : kind === 'MIGRATION' ? 100 : 0) +
        via.size / (via.size + odd.length) * via.size,
    });
  }
}
findings.sort((a, b) => b.score - a.score);

// ---- 5. raport z gotową poprawką ----
console.log(t('depsTitle'));
console.log(t('root') + ROOT);
console.log(t('depsStats', classes.size, extCallers.size, wrappers.size));
console.log(t('depsThresholds', MINVIA, MAXODD));
const nOf = k => findings.filter(f => f.kind === k).length;
console.log(t('depsCounts', nOf('DIVERGENCE'), nOf('MIGRATION'), nOf('TOO_LITTLE')));
if (nOf('DIVERGENCE') === 0)
  console.log(t('depsNoDivergence'));
console.log('');

findings.slice(0, TOP).forEach((f, i) => {
  const [extType, extMethod] = f.op.split('#');
  const facadeSimple = classes.get(f.facade).simple;
  const best = f.methods[0];

  console.log('## [' + (i + 1) + '] ' + f.kind + ' — ' +
    extType.split('.').pop() + '.' + extMethod +
    ': ' + f.via.length + ' klas przez ' + short(f.facade) + ', ' + f.odd.length + ' bezposrednio');
  if (f.kind === 'TOO_LITTLE') {
    console.log(t('depsTooFew', f.via.length, MINVIA));
    console.log('');
    return;
  }
  if (f.kind === 'MIGRATION') {
    console.log(t('depsMigration'));
    console.log(t('depsMigration2', short(f.facade)));
  }
  console.log('');
  console.log(t('secInconsistent'));
  console.log(t('depsBody', extType, extMethod, f.odd.length, f.via.length, facadeSimple));
  for (const s of f.sites)
    for (const h of s.hits.slice(0, 2))
      console.log('       ' + rel(h.file) + ':' + h.line + '   ' + h.text);
  console.log('');
  console.log(t('secElsewhere'));
  const exampleUser = f.via[0];
  const eu = classes.get(exampleUser);
  let exLine = 0, exText = '';
  // Java: the receiver is a class name (SafeIo.writeString).
  // JS: the receiver is a synthetic "#name" from an import, so we compare via
  // resolve — otherwise the example comes out with line number 0.
  for (const c of eu.calls) {
    const celWywolania = resolve(eu, c.type);
    if ((c.type === facadeSimple || celWywolania === f.facade) &&
        f.methods.some(m => m.method === c.method)) {
      exLine = c.line; exText = c.text; break;
    }
  }
  console.log('     ' + rel(eu.file) + ':' + exLine + '   ' + exText);
  console.log(t('depsLayer', rel(classes.get(f.facade).file), best.line));
  console.log('       ' + best.sig);
  console.log('');
  console.log(t('secFix'));
  const site = f.sites[0].hits[0];
  const argsMatch = site.text.match(/\(([\s\S]*)\)\s*$/);
  const args = argsMatch ? argsMatch[1] : '...';
  console.log('     // ' + rel(site.file) + ':' + site.line);
  console.log('     - ' + site.text);
  console.log('     + ' + facadeSimple + '.' + best.method + '(' + args + ');');
  console.log(t('depsCheckReturn', best.sig));
  if (!classes.get(f.sites[0].fqn).imports.has(facadeSimple) &&
      classes.get(f.sites[0].fqn).pkg !== classes.get(f.facade).pkg)
    console.log(t('depsAddImport', f.facade));
  console.log('');
});

// ---- run snapshot ----
const { maybeWriteSnapshot } = await import('./snapshot.mjs');
const snapFindings = [];
for (const f of findings.slice(0, TOP)) {
  const [extType, extMethod] = f.op.split('#');
  for (const o of f.odd) {
    const c = classes.get(o);
    snapFindings.push({
      rule: extType + '.' + extMethod,
      file: rel(c.file),
      anchor: short(f.facade),
      line: (f.sites.find(s => s.fqn === o) || { hits: [{}] }).hits[0].line || 0,
      label: f.kind + ' — ' + extType.split('.').pop() + '.' + extMethod +
        ' wprost, zamiast przez ' + short(f.facade),
      meta: { kind: f.kind, via: f.via.length, odd: f.odd.length },
    });
  }
}
maybeWriteSnapshot(argv, {
  detector: 'deps', root: ROOT, args: argv.slice(1), cfg,
  counts: { classes: classes.size, wrappedOps: wrappers.size, divergences: findings.filter(f => f.kind === 'DIVERGENCE').length },
  findings: snapFindings,
});

// One sentence if any source was not valid UTF-8. Printed last, so it is the
// line left on screen rather than something scrolled past.
reportNonUtf8(rel);
