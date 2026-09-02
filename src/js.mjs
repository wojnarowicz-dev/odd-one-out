// odd-one-out / detektor js — JavaScript i TypeScript jedną gramatyką.
//
// GRAMATYKA. Używamy `tree-sitter-typescript` do OBU języków. TypeScript jest
// nadzbiorem JavaScriptu, więc jedna gramatyka wystarcza — sprawdzone na tym
// materiale: 40 plików .js i 10 .ts, zero błędów parsowania. Osobna gramatyka
// dla JS byłaby drugą rzeczą do utrzymania bez zysku.
//
// SKRYPTY INLINE. Strony trzymają JavaScript w <script> wewnątrz HTML-a.
// Wycinamy je wyrażeniem regularnym (to jedyne miejsce, gdzie regex jest na
// miejscu — granice <script> są proste), zapamiętując przesunięcie linii, żeby
// numery w raporcie wskazywały linię w HTML-u, a nie w wycinku.
//
// REGUŁA "SIEROTA": nazwa wołana jak funkcja, której strona nie zna. Strona zna
// trzy rodzaje nazw: własne definicje w swoich skryptach, globalne z plików
// <script src="...">, które ładuje, oraz wbudowane przeglądarki i języka.
// To NIE jest reguła z listy dobrych praktyk — wynik zależy od tego, które
// pliki dana strona ładuje, więc bez wiedzy o projekcie nie da się jej postawić.
import fs from 'node:fs';
import path from 'node:path';
import { t } from './lang.mjs';
import { Parser, Language } from 'web-tree-sitter';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const ROOT = argv[0];
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const TOP = +flag('top', 20);
const REGULA = String(flag('regula', 'sierota'));

const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, ROOT);

await Parser.init();
const TS = await Language.load(require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'));
const parser = new Parser();
parser.setLanguage(TS);

// ---- wbudowane: przeglądarka, język, Deno (funkcje brzegowe) ----
const WBUDOWANE = new Set(`
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

// ---- zbieranie plików ----
function zbierz(dir, acc = { html: [], skrypt: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (cfg.isExcluded(p)) continue;
    if (e.isDirectory()) { zbierz(p, acc); continue; }
    if (/\.html?$/i.test(e.name)) acc.html.push(p);
    else if (/\.(js|mjs|cjs|ts|mts)$/i.test(e.name)) acc.skrypt.push(p);
  }
  return acc;
}

// ---- wycinanie <script> z HTML ----
// KOMENTARZE HTML trzeba wygasić PRZED szukaniem <script>. Bez tego słowo
// "<script>" napisane w komentarzu — a tak dokumentuje się strony — zostaje
// wzięte za otwarcie bloku i sparowane z zamknięciem sto linii dalej, przez co
// CSS i proza z komentarza trafiają do parsera jako JavaScript. Zmierzone:
// dawało to 4 z 5 zgłoszeń (`rgba`, `wspolnego`) na jednej stronie.
//
// Wygaszamy treść komentarza spacjami, ZACHOWUJĄC znaki nowej linii — inaczej
// rozjadą się numery linii w raporcie.
function wygasKomentarze(src) {
  return src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
}

function skryptyZHtml(surowy) {
  const src = wygasKomentarze(surowy);
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const atrybuty = m[1] || '';
    const srcAttr = atrybuty.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (srcAttr) { out.push({ zewnetrzny: srcAttr[1] }); continue; }
    if (/\btype\s*=\s*["']([^"']*)["']/i.test(atrybuty)) {
      const t = atrybuty.match(/\btype\s*=\s*["']([^"']*)["']/i)[1].toLowerCase();
      // application/ld+json i podobne to nie JavaScript
      if (t && !/javascript|module|ecmascript/.test(t)) continue;
    }
    const tresc = m[2];
    const przed = src.slice(0, m.index + m[0].indexOf(tresc));
    out.push({ tresc, offsetLinii: przed.split('\n').length - 1 });
  }
  return out;
}

// ---- definicje i wywołania z drzewa ----
function analizuj(tree, src) {
  const definicje = new Set();
  const wywolania = [];   // {nazwa, linia}
  const globalne = new Set();   // window.X = ...

  const walk = (n) => {
    switch (n.type) {
      case 'function_declaration':
      case 'generator_function_declaration':
      case 'class_declaration': {
        const nm = n.childForFieldName('name');
        if (nm) definicje.add(nm.text);
        break;
      }
      case 'variable_declarator': {
        const nm = n.childForFieldName('name');
        if (nm && nm.type === 'identifier') definicje.add(nm.text);
        break;
      }
      case 'required_parameter':
      case 'optional_parameter': {
        const nm = n.childForFieldName('pattern');
        if (nm && nm.type === 'identifier') definicje.add(nm.text);
        break;
      }
      case 'identifier':
        if (n.parent && n.parent.type === 'formal_parameters') definicje.add(n.text);
        break;
      case 'import_specifier':
      case 'namespace_import': {
        const nm = n.childForFieldName('name') || n.child(n.childCount - 1);
        if (nm) definicje.add(nm.text);
        break;
      }
      case 'assignment_expression': {
        const l = n.childForFieldName('left');
        if (l && l.type === 'member_expression') {
          const o = l.childForFieldName('object');
          const pr = l.childForFieldName('property');
          if (o && pr && (o.text === 'window' || o.text === 'globalThis')) {
            definicje.add(pr.text); globalne.add(pr.text);
          }
        } else if (l && l.type === 'identifier') {
          definicje.add(l.text);
        }
        break;
      }
      case 'call_expression': {
        const f = n.childForFieldName('function');
        if (f && f.type === 'identifier')
          wywolania.push({ nazwa: f.text, linia: f.startPosition.row + 1 });
        break;
      }
      default: break;
    }
    for (let i = 0; i < n.childCount; i++) walk(n.child(i));
  };
  walk(tree.rootNode);
  return { definicje, wywolania, globalne };
}

// ---- przebieg ----
const pliki = zbierz(ROOT);
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

// globalne wystawiane przez pliki skryptowe (window.X = ..., funkcje najwyzszego poziomu)
const globalneZPliku = new Map();   // sciezka wzgledna -> Set(nazw)
for (const f of pliki.skrypt) {
  const src = fs.readFileSync(f, 'utf8');
  const a = analizuj(parser.parse(src), src);
  globalneZPliku.set(rel(f), new Set([...a.definicje]));
}

const zgloszenia = [];
let stronBadanych = 0, skryptowInline = 0;

for (const f of pliki.html) {
  const src = fs.readFileSync(f, 'utf8');
  const bloki = skryptyZHtml(src);
  const inline = bloki.filter(b => b.tresc !== undefined);
  if (inline.length === 0) continue;
  stronBadanych++;
  skryptowInline += inline.length;

  // co ta strona zna z zewnatrz
  const zna = new Set(WBUDOWANE);
  for (const b of bloki) {
    if (!b.zewnetrzny) continue;
    const cel = b.zewnetrzny.replace(/^\.?\//, '').split('?')[0];
    for (const [sciezka, nazwy] of globalneZPliku)
      if (sciezka.endsWith(cel)) for (const n of nazwy) zna.add(n);
  }

  // wlasne definicje ze WSZYSTKICH skryptow inline tej strony
  const wlasne = new Set();
  const wszystkieWywolania = [];
  for (const b of inline) {
    const a = analizuj(parser.parse(b.tresc), b.tresc);
    for (const d of a.definicje) wlasne.add(d);
    for (const w of a.wywolania)
      wszystkieWywolania.push({ ...w, linia: w.linia + b.offsetLinii });
  }

  const widziane = new Set();
  for (const w of wszystkieWywolania) {
    if (wlasne.has(w.nazwa) || zna.has(w.nazwa)) continue;
    const klucz = w.nazwa + '@' + w.linia;
    if (widziane.has(klucz)) continue;
    widziane.add(klucz);
    const ile = wszystkieWywolania.filter(x => x.nazwa === w.nazwa).length;
    zgloszenia.push({
      plik: rel(f), linia: w.linia, nazwa: w.nazwa, wywolan: ile,
      definicjiNaStronie: wlasne.size,
    });
  }
}

// ---- raport ----
// najpierw te wolane RAZ — pojedyncze wywolanie osieroconej nazwy to typowy
// slad po niedokonczonym usunieciu funkcji
zgloszenia.sort((a, b) => a.wywolan - b.wywolan || a.plik.localeCompare(b.plik));

const { przygotuj, naglowekRoznicy } = await import('./snapshot.mjs');
const w = przygotuj(argv, {
  detector: 'js', root: ROOT, args: argv.slice(1), cfg,
  counts: { stron: stronBadanych, blokowInline: skryptowInline, plikowSkryptowych: pliki.skrypt.length, sierot: zgloszenia.length },
  findings: zgloszenia.map(z => ({
    rule: 'sierota',
    file: z.plik,
    anchor: z.nazwa,
    line: z.linia,
    label: z.nazwa + ' — wolane ' + z.wywolan + 'x, nigdzie niezdefiniowane',
    meta: { sup: z.definicjiNaStronie, odd: z.wywolan, conf: 1, wywolan: z.wywolan },
  })),
});

console.log(t('jsTitle'));
console.log(t('root') + ROOT);
console.log(t('jsStats', stronBadanych, skryptowInline, pliki.skrypt.length));
console.log(t('jsRule', REGULA, cfg.opis()));
console.log(t('jsOrphans', w.snap.findings.length, w.roznica && !w.wszystko ? t('onlyNewShown') : ''));
naglowekRoznicy(w);
console.log('');

w.doPokazania.slice(0, TOP).forEach((f, i) => {
  console.log('## [' + (i + 1) + '] ' + f.anchor + '  —  ' + f.file + ':' + f.line);
  console.log('');
  console.log(t('secInconsistent'));
  console.log(t('jsBody1', f.meta.wywolan));
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

process.exitCode = w.nowych ? 1 : 0;
