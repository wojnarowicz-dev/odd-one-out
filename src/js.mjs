// odd-one-out / js detector — JavaScript and TypeScript with one grammar.
//
// GRAMMAR. We use `tree-sitter-typescript` for BOTH languages. TypeScript is a
// superset of JavaScript, so one grammar is enough — verified on this material:
// 40 .js files and 10 .ts files, zero parse errors. A separate JS grammar would
// be a second thing to maintain for no gain.
//
// INLINE SCRIPTS. Pages keep JavaScript in <script> inside HTML. We cut them
// out with a regular expression (the one place where a regex is appropriate —
// <script> boundaries are simple), remembering the line offset so the numbers
// in the report point at the line in the HTML, not in the excerpt.
//
// THE "ORPHAN" RULE: a name called like a function that the page does not know.
// A page knows three kinds of names: its own definitions in its inline scripts,
// globals from the <script src="..."> files it loads, and browser/language
// built-ins. This is NOT a rule off a best-practice list — the result depends on
// which files a given page loads, so it cannot be stated without knowing the
// project.
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { makeFlag } from './args.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';
import { Parser, Language } from 'web-tree-sitter';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = makeFlag(argv);
const TOP = +flag('top', 20);
const RULE = String(flag('rule', 'sierota'));

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

await Parser.init();
const TS = await Language.load(require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'));
const parser = new Parser();
parser.setLanguage(TS);

// ---- wbudowane: przeglądarka, język, Deno (funkcje brzegowe) ----
const BUILTINS = new Set(`
alert atob btoa clearInterval clearTimeout confirm decodeURI decodeURIComponent
encodeURI encodeURIComponent escape eval fetch isFinite isNaN parseFloat parseInt
prompt queueMicrotask requestAnimationFrame cancelAnimationFrame setInterval
setTimeout structuredClone unescape reportError
Array ArrayBuffer Blob Boolean Date Error EvalError File FileReader Float32Array
Function Headers Image Infinity Int32Array Intl JSON Map Math NaN Number Object
Promise Proxy Range RangeError Reflect RegExp Request Response Set String Symbol
SyntaxError TextDecoder TextEncoder TypeError URL URLSearchParams Uint8Array
WeakMap WeakSet WebSocket Worker XMLHttpRequest AbortController FormData
console document window navigator location history screen localStorage
sessionStorage performance crypto globalThis undefined null true false
Deno Object.keys require module exports process Buffer
`.trim().split(/\s+/));

// ---- collecting files ----
function collect(dir, acc = { html: [], script: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) { collect(p, acc); continue; }
    if (/\.html?$/i.test(e.name)) acc.html.push(p);
    else if (/\.(js|mjs|cjs|ts|mts)$/i.test(e.name)) acc.script.push(p);
  }
  return acc;
}

// ---- extracting <script> from HTML ----
// HTML COMMENTS must be blanked out BEFORE looking for <script>. Without that,
// the word "<script>" written inside a comment — which is how pages get
// documented — is taken as an opening tag and paired with a closing tag a
// hundred lines later, so CSS and prose reach the parser as JavaScript.
// Measured: that produced 4 of 5 findings (`rgba`, `wspolnego`) on one page.
//
// We blank the comment body with spaces, KEEPING the newlines — otherwise the
// line numbers in the report drift.
function blankOutHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
}

function scriptsFromHtml(raw) {
  const src = blankOutHtmlComments(raw);
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1] || '';
    const srcAttr = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcAttr) { out.push({ external: srcAttr[1] }); continue; }
    if (/\btype\s*=\s*["']([^"']*)["']/i.test(attrs)) {
      const t = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i)[1].toLowerCase();
      // application/ld+json and the like are not JavaScript
      if (t && !/javascript|module|ecmascript/.test(t)) continue;
    }
    const content = m[2];
    const przed = src.slice(0, m.index + m[0].indexOf(content));
    out.push({ content, lineOffset: przed.split('\n').length - 1 });
  }
  return out;
}

// ---- definitions i wywołania z drzewa ----
function analyse(tree, src) {
  const definitions = new Set();
  const calls = [];   // {name, line}
  const globals = new Set();   // window.X = ...

  const walk = (n) => {
    switch (n.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
      case 'class_declaration': {
        const nm = n.childForFieldName('name');
        if (nm) definitions.add(nm.text);
        break;
      }
      case 'variable_declarator': {
        const nm = n.childForFieldName('name');
        if (nm && nm.type === 'identifier') definitions.add(nm.text);
        break;
      }
      case 'required_parameter':
      case 'optional_parameter': {
        const nm = n.childForFieldName('pattern');
        if (nm && nm.type === 'identifier') definitions.add(nm.text);
        break;
      }
      case 'identifier':
        if (n.parent && n.parent.type === 'formal_parameters') definitions.add(n.text);
        break;
      case 'import_specifier':
      case 'namespace_import': {
        const nm = n.childForFieldName('name') || n.child(n.childCount - 1);
        if (nm) definitions.add(nm.text);
        break;
      }
      case 'assignment_expression': {
        const l = n.childForFieldName('left');
        if (l && l.type === 'member_expression') {
          const o = l.childForFieldName('object');
          const pr = l.childForFieldName('property');
          if (o && pr && (o.text === 'window' || o.text === 'globalThis')) {
            definitions.add(pr.text); globals.add(pr.text);
          }
        } else if (l && l.type === 'identifier') {
          definitions.add(l.text);
        }
        break;
      }
      case 'call_expression': {
        const f = n.childForFieldName('function');
        if (f && f.type === 'identifier')
          calls.push({ name: f.text, line: f.startPosition.row + 1 });
        break;
      }
      default: break;
    }
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(tree.rootNode);
  return { definitions, calls, globals };
}

// ---- przebieg ----
const sources = collect(ROOT);
{
  const { noSourcesIn } = await import('./population.mjs');
  const missing = noSourcesIn(sources.html.length + sources.script.length, '.html/.js/.ts', ROOT);
  if (missing) { console.log(missing); process.exit(0); }
}
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

// globals exposed by script files (window.X = ..., top-level functions)
const globalsFromFile = new Map();   // pathArg relPath -> Set(nazw)
for (const f of sources.script) {
  const src = readSource(f);
  const a = analyse(parser.parse(src), src);
  globalsFromFile.set(rel(f), new Set([...a.definitions]));
}

const findings = [];
let pagesScanned = 0, inlineBlocks = 0;

for (const f of sources.html) {
  const src = readSource(f);
  const blocks = scriptsFromHtml(src);
  const inline = blocks.filter(b => b.content !== undefined);
  if (inline.length === 0) continue;
  pagesScanned++;
  inlineBlocks += inline.length;

  // co ta strona known z zewnatrz
  const known = new Set(BUILTINS);
  for (const b of blocks) {
    if (!b.external) continue;
    const cel = b.external.replace(/^\.?\//, '').split('?')[0];
    for (const [pathArg, names] of globalsFromFile)
      if (pathArg.endsWith(cel)) for (const n of names) known.add(n);
  }

  // own definitions from ALL inline scripts on this page
  const own = new Set();
  const allCalls = [];
  for (const b of inline) {
    const a = analyse(parser.parse(b.content), b.content);
    for (const d of a.definitions) own.add(d);
    for (const w of a.calls)
      allCalls.push({ ...w, line: w.line + b.lineOffset });
  }

  const seen = new Set();
  for (const w of allCalls) {
    if (own.has(w.name) || known.has(w.name)) continue;
    const key = w.name + '@' + w.line;
    if (seen.has(key)) continue;
    seen.add(key);
    const count = allCalls.filter(x => x.name === w.name).length;
    findings.push({
      file: rel(f), line: w.line, name: w.name, callCount: count,
      definitionsOnPage: own.size,
    });
  }
}

// ---- raport ----
// the ones called ONCE first — a single call to an orphaned name is the typical
// trace of an unfinished removal
// slad po niedokonczonym usunieciu funkcji
findings.sort((a, b) => a.callCount - b.callCount || a.file.localeCompare(b.file));

const { prepare, diffHeader, resultExit } = await import('./snapshot.mjs');
const w = prepare(argv, {
  detector: 'js', root: ROOT, args: argv.slice(1), cfg,
  counts: { pages: pagesScanned, inlineBlocks, scriptFiles: sources.script.length, orphans: findings.length },
  findings: findings.map(z => ({
    rule: 'sierota',
    file: z.file,
    anchor: z.name,
    line: z.line,
    label: z.name + ' — wolane ' + z.callCount + 'x, nigdzie niezdefiniowane',
    meta: { sup: z.definitionsOnPage, odd: z.callCount, conf: 1, callCount: z.callCount },
  })),
});

console.log(t('jsTitle'));
console.log(t('root') + ROOT);
console.log(t('jsStats', pagesScanned, inlineBlocks, sources.script.length));
console.log(t('jsRule', RULE, cfg.describe()));
console.log(t('jsOrphans', w.snap.findings.length, w.diff && !w.showAll ? t('onlyNewShown') : ''));
diffHeader(w);
console.log('');

w.toShow.slice(0, TOP).forEach((f, i) => {
  console.log('## [' + (i + 1) + '] ' + f.anchor + '  —  ' + f.file + ':' + f.line);
  console.log('');
  console.log(t('secInconsistent'));
  console.log(t('jsBody1', f.meta.callCount));
  console.log(t('jsBody2'));
  console.log(t('jsBody3'));
  console.log(t('jsBody4', f.meta.sup));
  console.log('');
  console.log(t('secFix'));
  console.log(t('jsFix'));
  console.log(t('jsFix2', f.file, f.line));
  console.log(t('muteHint'));
  console.log('');
});

resultExit(w.newCount ? 1 : 0);

// One sentence if any source was not valid UTF-8. Printed last, so it is the
// line left on screen rather than something scrolled past.
reportNonUtf8(rel);
