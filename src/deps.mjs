// odd-one-out / kategoria 5 — zależności rozłożone niespójnie.
//
// Nie zgłasza samego użycia biblioteki. Zgłasza ROZJAZD:
// "N klas robi to przez warstwę X, K bezpośrednio".
//
// Kluczowe: "przez warstwę" znaczy WOŁA KONKRETNĄ METODĘ OPAKOWUJĄCĄ, a nie
// "gdziekolwiek dotyka tej klasy". Bez tego klasa stałych importowana przez pół
// projektu (FilePaths) udaje fasadę I/O i cały wynik jest szumem.
//
// Warstwa nie jest wpisana na sztywno. Wykrywana tak: publiczna metoda klasy
// projektu, która woła operację zewnętrzną T.m, jest "opakowaniem" T.m.
// Kto woła tę metodę — idzie przez warstwę. Kto woła T.m wprost — odstaje.
import { javaParser } from './parser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';

const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const MINVIA = +flag('minvia', 5);   // ile klas musi iść przez warstwę, by to była konwencja
const MAXODD = +flag('maxodd', 3);   // ilu odstających jeszcze zgłaszamy (więcej = to nie rozjazd)
const TOP = +flag('top', 10);

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

// DWIE GRAMATYKI, JEDEN DETEKTOR. Algorytm nizej (warstwa vs uzycie
// bezposrednie) jest jezykowo niezalezny — rozni sie tylko WYDOBYCIE faktow.
// Java i JavaScript mowia to samo innym ksztaltem skladni:
//
//   Java:  SafeIo.writeStringUtf8(path, txt)   — wywolanie na TYPIE
//   JS:    import { przygotuj } from './snapshot.mjs';  przygotuj(argv, ...)
//                                              — wywolanie GOLEJ NAZWY z importu
//
// Dlatego adapter JS sprowadza jedno do drugiego: nazwa zaimportowana z modulu
// dostaje sztuczny "typ" (#nazwa), ktory wskazuje na modul zrodlowy. Od tego
// miejsca reszta detektora nie wie, w jakim jest jezyku.
function zrodla(dir, acc = { java: [], js: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) { zrodla(p, acc); continue; }
    if (e.name.endsWith('.java')) acc.java.push(p);
    else if (/\.(js|mjs|cjs|ts|mts)$/i.test(e.name)) acc.js.push(p);
  }
  return acc;
}

const parser = await javaParser();
const pliki = zrodla(ROOT);
{
  const { brakZrodel } = await import('./populacja.mjs');
  const brak = brakZrodel(pliki.java.length + pliki.js.length, '.java/.js/.ts', ROOT);
  if (brak) { console.log(brak); process.exit(0); }
}

let parserJs = null;
if (pliki.js.length) {
  const { Parser, Language } = await import('web-tree-sitter');
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  await Parser.init();
  parserJs = new Parser();
  parserJs.setLanguage(await Language.load(req.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm')));
}

const classes = new Map();

for (const file of pliki.java) {
  const src = fs.readFileSync(file, 'utf8');
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

// ---- adapter JavaScript / TypeScript ----
for (const file of pliki.js) {
  const src = fs.readFileSync(file, 'utf8');
  const tree = parserJs.parse(src);

  const wzgledna = path.relative(ROOT, file).replace(/\\/g, '/');
  const targets = new Map();     // "#nazwaLokalna" -> id modulu (projekt) albo specyfikator (zewn.)
  const eksport = new Map();     // nazwaLokalna -> nazwa eksportowana (przy aliasach)
  const methods = [];
  const calls = [];

  // modul projektu rozpoznajemy po specyfikatorze wzglednym; reszta jest zewnetrzna
  const celImportu = (spec) => {
    if (!spec.startsWith('.')) return spec;                       // 'node:fs', 'web-tree-sitter'
    const abs = path.resolve(path.dirname(file), spec);
    return path.relative(ROOT, abs).replace(/\\/g, '/');
  };

  const zapiszImport = (lokalna, eksportowana, spec) => {
    targets.set('#' + lokalna, celImportu(spec));
    eksport.set(lokalna, eksportowana || lokalna);
  };

  const zbierzWywolania = (node, sink) => {
    if (node.type === 'call_expression') {
      const f = node.childForFieldName('function');
      if (f && f.type === 'identifier' && targets.has('#' + f.text)) {
        // gola nazwa z importu — odpowiednik Facade.method() w Javie
        sink.push({
          type: '#' + f.text, method: eksport.get(f.text) || f.text,
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
    for (let i = 0; i < node.childCount; i++) zbierzWywolania(node.child(i), sink);
  };

  // 1. importy — statyczne i dynamiczne (`const { x } = await import('...')`)
  const zbierzImporty = (node) => {
    if (node.type === 'import_statement') {
      const zrodlo = node.childForFieldName('source');
      const spec = zrodlo ? zrodlo.text.slice(1, -1) : null;
      if (spec) {
        const wIdent = (n) => {
          if (n.type === 'import_specifier') {
            const nm = n.childForFieldName('name');
            const al = n.childForFieldName('alias');
            if (nm) zapiszImport((al || nm).text, nm.text, spec);
          } else if (n.type === 'namespace_import' || n.type === 'identifier') {
            const nm = n.type === 'identifier' ? n : n.child(n.childCount - 1);
            if (nm && n.parent && n.parent.type !== 'import_specifier') zapiszImport(nm.text, null, spec);
          }
          for (let i = 0; i < n.childCount; i++) wIdent(n.child(i));
        };
        wIdent(node);
      }
    } else if (node.type === 'variable_declarator') {
      // const { przygotuj } = await import('./snapshot.mjs');
      const nm = node.childForFieldName('name');
      const val = node.childForFieldName('value');
      const tekst = val ? val.text : '';
      const m = tekst.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (m && nm) {
        if (nm.type === 'object_pattern') {
          for (let i = 0; i < nm.childCount; i++) {
            const p = nm.child(i);
            if (p.type === 'shorthand_property_identifier_pattern') zapiszImport(p.text, p.text, m[1]);
            else if (p.type === 'pair_pattern') {
              const k = p.childForFieldName('key');
              const v = p.childForFieldName('value');
              if (k && v) zapiszImport(v.text, k.text, m[1]);
            }
          }
        } else if (nm.type === 'identifier') zapiszImport(nm.text, null, m[1]);
      }
    }
    for (let i = 0; i < node.childCount; i++) zbierzImporty(node.child(i));
  };
  zbierzImporty(tree.rootNode);

  // 2. publiczne metody modulu = funkcje eksportowane
  const zbierzFunkcje = (node) => {
    if (node.type === 'function_declaration') {
      const nm = node.childForFieldName('name');
      const body = node.childForFieldName('body');
      const eksportowana = node.parent && node.parent.type === 'export_statement';
      const inner = [];
      if (body) zbierzWywolania(body, inner);
      if (nm) methods.push({
        name: nm.text,
        isPublic: !!eksportowana,
        sig: src.slice(node.startIndex, body ? body.startIndex : node.endIndex).replace(/\s+/g, ' ').trim(),
        line: node.startPosition.row + 1,
        calls: inner,
      });
    }
    for (let i = 0; i < node.childCount; i++) zbierzFunkcje(node.child(i));
  };
  zbierzFunkcje(tree.rootNode);
  zbierzWywolania(tree.rootNode, calls);

  classes.set(wzgledna, {
    fqn: wzgledna, simple: path.basename(file), pkg: path.dirname(wzgledna),
    file, src, imports: new Map(), starPkgs: [], targets, methods, calls,
  });
}

const isProject = f => classes.has(f);
function resolve(c, name) {
  if (c.targets && c.targets.has(name)) return c.targets.get(name);   // JS: #nazwa -> modul
  if (c.imports.has(name)) return c.imports.get(name);
  const same = c.pkg + '.' + name;
  if (classes.has(same)) return same;
  for (const sp of c.starPkgs) if (classes.has(sp + '.' + name)) return sp + '.' + name;
  return null;
}

// ---- 1. kto woła jaką operację zewnętrzną wprost ----
const extCallers = new Map();   // "T#m" -> Map(fqn -> [{line,text,file}])
// ---- 2. kto woła jaką metodę klasy projektu ----
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

// ---- 3. warstwy: publiczna metoda projektu opakowująca operację zewnętrzną ----
//
// Sam fakt, że publiczna metoda woła T.m, NIE czyni jej opakowaniem T.m —
// prawie każda metoda coś woła. ProjectFileBundle.resolveAnchorVideoMediaPath()
// woła Files.readAllLines(), ale jest operacją dziedzinową, nie opakowaniem I/O.
//
// Cienkie opakowanie odróżniamy dwoma warunkami:
//   1. NAZWA — opakowanie nazywa się od tego, co opakowuje.
//      movePathWithRetry ⊃ "move", readStringUtf8WithRetry ⊃ "readString",
//      ale resolveAnchorVideoMediaPath ⊅ "readAllLines".
//   2. CIENKOŚĆ — opakowanie nie robi wielu innych rzeczy zewnętrznych obok.
const NAME_MIN = 4;      // krótsze nazwy (get, put, of) są za pospolite, by cokolwiek znaczyć
const MAX_OTHER_OPS = 6; // ile innych operacji zewn. metoda może wołać, wciąż będąc opakowaniem

const wrappers = new Map();     // "T#m" -> [{facade, method, sig, line}]
for (const c of classes.values()) {
  for (const m of c.methods) {
    if (!m.isPublic) continue;
    const distinctOps = new Set(m.calls.map(x => x.type + '#' + x.method));
    for (const call of m.calls) {
      const target = resolve(c, call.type);
      if (!target || isProject(target)) continue;
      if (call.method.length < NAME_MIN) continue;
      if (!m.name.toLowerCase().includes(call.method.toLowerCase())) continue;
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
    // kto idzie przez warstwę = woła którąkolwiek z metod opakowujących
    const via = new Set();
    for (const m of ms)
      for (const u of (projCallers.get(facade + '#' + m.method) || []))
        if (u !== facade) via.add(u);

    // kto odstaje = woła operację wprost, nie będąc samą warstwą
    const direct = extCallers.get(op) || new Map();
    const odd = [...direct.keys()].filter(f => f !== facade);
    if (odd.length === 0) continue;

    // Trzy różne stany, których nie wolno mylić:
    //   ROZJAZD      — warstwa jest konwencją, kilka miejsc jej nie używa
    //   MIGRACJA     — obie drogi są liczne; nie ma czego nazwać odstępstwem
    //   ZA MALO DANYCH — warstwa ma za mało użyć, by cokolwiek twierdzić
    let kind;
    if (via.size >= MINVIA && odd.length <= MAXODD) kind = 'ROZJAZD';
    else if (via.size >= 2 && odd.length > MAXODD) kind = 'MIGRACJA W TOKU';
    else kind = 'ZA MALO DANYCH';

    findings.push({
      kind, op, facade, methods: ms, via: [...via], odd,
      sites: odd.map(f => ({ fqn: f, hits: direct.get(f) })),
      score: (kind === 'ROZJAZD' ? 1000 : kind === 'MIGRACJA W TOKU' ? 100 : 0) +
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
console.log(t('depsCounts', nOf('ROZJAZD'), nOf('MIGRACJA W TOKU'), nOf('ZA MALO DANYCH')));
if (nOf('ROZJAZD') === 0)
  console.log(t('depsNoDivergence'));
console.log('');

findings.slice(0, TOP).forEach((f, i) => {
  const [extType, extMethod] = f.op.split('#');
  const facadeSimple = classes.get(f.facade).simple;
  const best = f.methods[0];

  console.log('## [' + (i + 1) + '] ' + f.kind + ' — ' +
    extType.split('.').pop() + '.' + extMethod +
    ': ' + f.via.length + ' klas przez ' + short(f.facade) + ', ' + f.odd.length + ' bezposrednio');
  if (f.kind === 'ZA MALO DANYCH') {
    console.log(t('depsTooFew', f.via.length, MINVIA));
    console.log('');
    return;
  }
  if (f.kind === 'MIGRACJA W TOKU') {
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
  // Java: odbiornikiem jest nazwa klasy (SafeIo.writeString).
  // JS: odbiornikiem jest sztuczny "#nazwa" z importu, wiec porownujemy przez
  // resolve — inaczej przyklad wychodzi z numerem linii 0.
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

// ---- zapis przebiegu ----
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
  counts: { klasy: classes.size, operacjeOpakowane: wrappers.size, rozjazdy: findings.filter(f => f.kind === 'ROZJAZD').length },
  findings: snapFindings,
});
