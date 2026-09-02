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

const classes = new Map();

for (const file of javaFiles(ROOT)) {
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

const isProject = f => classes.has(f);
function resolve(c, name) {
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
console.log('# odd-one-out / kategoria 5: zaleznosci rozlozone niespojnie');
console.log('root=' + ROOT);
console.log('klasy=' + classes.size + ' operacji zewn.=' + extCallers.size +
  ' operacji opakowanych=' + wrappers.size);
console.log('progi: minvia=' + MINVIA + ' maxodd=' + MAXODD);
const nOf = k => findings.filter(f => f.kind === k).length;
console.log('rozjazdow=' + nOf('ROZJAZD') +
  '  migracji w toku=' + nOf('MIGRACJA W TOKU') +
  '  za malo danych=' + nOf('ZA MALO DANYCH'));
if (nOf('ROZJAZD') === 0)
  console.log('\n-> Zadnego rozjazdu przy tych progach. Ponizej to NIE sa odstepstwa —\n' +
    '   to stany, w ktorych narzedzie nie ma podstaw, by cokolwiek zglosic.');
console.log('');

findings.slice(0, TOP).forEach((f, i) => {
  const [extType, extMethod] = f.op.split('#');
  const facadeSimple = classes.get(f.facade).simple;
  const best = f.methods[0];

  console.log('## [' + (i + 1) + '] ' + f.kind + ' — ' +
    extType.split('.').pop() + '.' + extMethod +
    ': ' + f.via.length + ' klas przez ' + short(f.facade) + ', ' + f.odd.length + ' bezposrednio');
  if (f.kind === 'ZA MALO DANYCH') {
    console.log('     Za malo wystapien, by mowic o konwencji (' + f.via.length +
      ' przez warstwe, prog=' + MINVIA + '). Wroc, gdy bedzie ich ' + MINVIA + '.');
    console.log('');
    return;
  }
  if (f.kind === 'MIGRACJA W TOKU') {
    console.log('     Obie drogi sa liczne — nie ma czego nazwac odstepstwem.');
    console.log('     To nie blad do poprawienia punktowo, tylko niedokonczone przejscie na ' +
      short(f.facade) + '.');
  }
  console.log('');
  console.log('   CO JEST NIESPOJNE');
  console.log('     ' + extType + '.' + extMethod + ' jest wolane wprost w ' +
    f.odd.length + ' klasie/ach, choc ' + f.via.length +
    ' innych idzie przez ' + facadeSimple + '.');
  for (const s of f.sites)
    for (const h of s.hits.slice(0, 2))
      console.log('       ' + rel(h.file) + ':' + h.line + '   ' + h.text);
  console.log('');
  console.log('   JAK ZROBIONO W POZOSTALYCH MIEJSCACH');
  const exampleUser = f.via[0];
  const eu = classes.get(exampleUser);
  let exLine = 0, exText = '';
  for (const c of eu.calls)
    if (c.type === facadeSimple && f.methods.some(m => m.method === c.method)) {
      exLine = c.line; exText = c.text; break;
    }
  console.log('     ' + rel(eu.file) + ':' + exLine + '   ' + exText);
  console.log('     warstwa: ' + rel(classes.get(f.facade).file) + ':' + best.line);
  console.log('       ' + best.sig);
  console.log('');
  console.log('   GOTOWA POPRAWKA (nie zastosowana)');
  const site = f.sites[0].hits[0];
  const argsMatch = site.text.match(/\(([\s\S]*)\)\s*$/);
  const args = argsMatch ? argsMatch[1] : '...';
  console.log('     // ' + rel(site.file) + ':' + site.line);
  console.log('     - ' + site.text);
  console.log('     + ' + facadeSimple + '.' + best.method + '(' + args + ');');
  console.log('     // sprawdz zwracany typ — ' + best.sig);
  if (!classes.get(f.sites[0].fqn).imports.has(facadeSimple) &&
      classes.get(f.sites[0].fqn).pkg !== classes.get(f.facade).pkg)
    console.log('     // dolóz import: import ' + f.facade + ';');
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
