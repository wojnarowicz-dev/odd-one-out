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

// TYP ODBIORNIKA. Bez niego `mediaControl.setOnEndOfMedia()` (MediaControl,
// metoda bezargumentowa klasy projektu) i `mediaPlayer.setOnEndOfMedia(...)`
// (javafx.MediaPlayer) licza sie jako ta sama pozycja — bo regula patrzy na
// nazwe metody, a nie na to, na czym jest wolana.
//
// Rozwiazywanie typu jest celowo plytkie i ma dwa zrodla:
//   1. deklaracje zmiennych, pol i parametrow w pliku (nazwa -> typ),
//   2. mapa WYRAZENIE -> TYP zbierana z calego projektu z deklaracji
//      z inicjalizatorem: `MediaPlayer player = mediaView.getMediaPlayer();`
//      uczy, ze `mediaView.getMediaPlayer()` ma typ MediaPlayer.
// Drugie zrodlo jest tu kluczowe: bez niego odbiorniki bedace wywolaniem
// metody zostaja nierozpoznane i wypadaja z populacji razem z prawdziwymi
// odstepstwami.
//
// Zakres jest plikowy, nie blokowy — przeslanianie nazw (`shadowing`) jest
// rzadkie i swiadomie je pomijam; bledne rozpoznanie typu daje ten sam wynik
// co brak rozpoznania, czyli pozycje "?".
const TYPY = String(flag('typy', 'on')) !== 'off';
const exprTypes = new Map();   // znormalizowane wyrazenie -> typ (caly projekt)

const czystyTyp = t => String(t).replace(/<.*/s, '').replace(/\[\]/g, '').trim();
const norm = s => s.replace(/\s+/g, '');

// pierwszy przebieg: mapa wyrazenie -> typ z calego projektu
if (TYPY) {
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const tree = parser.parse(src);
    const zbierz = (node) => {
      if (node.type === 'local_variable_declaration' || node.type === 'field_declaration') {
        const t = node.childForFieldName('type');
        if (t && t.text !== 'var') {
          for (let i = 0; i < node.childCount; i++) {
            const d = node.child(i);
            if (d.type !== 'variable_declarator') continue;
            const val = d.childForFieldName('value');
            if (val && (val.type === 'method_invocation' || val.type === 'field_access'))
              exprTypes.set(norm(val.text), czystyTyp(t.text));
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) zbierz(node.child(i));
    };
    zbierz(tree.rootNode);
  }
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const tree = parser.parse(src);
  parsed++;
  if (tree.rootNode.hasError) parseErrors.push(file);

  // deklaracje w tym pliku: nazwa -> typ
  const varTypes = new Map();
  if (TYPY) {
    const zbierzDekl = (node) => {
      if (node.type === 'local_variable_declaration' || node.type === 'field_declaration') {
        const t = node.childForFieldName('type');
        if (t && t.text !== 'var')
          for (let i = 0; i < node.childCount; i++) {
            const d = node.child(i);
            if (d.type === 'variable_declarator') {
              const n = d.childForFieldName('name');
              if (n) varTypes.set(n.text, czystyTyp(t.text));
            }
          }
      } else if (node.type === 'formal_parameter' || node.type === 'catch_formal_parameter') {
        const t = node.childForFieldName('type');
        const n = node.childForFieldName('name');
        if (t && n && t.text !== 'var') varTypes.set(n.text, czystyTyp(t.text));
      }
      for (let i = 0; i < node.childCount; i++) zbierzDekl(node.child(i));
    };
    zbierzDekl(tree.rootNode);
  }

  // ALIASY. `final MediaPlayer toDispose = player;` a linijke pozniej
  // `toDispose.dispose()` w lambdzie — to ten sam obiekt, ale dla detektora byly
  // to dwa rozne odbiorniki w dwoch roznych jednostkach, wiec `dispose` wygladal
  // na osamotniony. Zgloszenie powstawalo wylacznie ze zmiany nazwy zmiennej.
  //
  // Dwa kroki, oba potrzebne:
  //   1. kanonizacja nazwy: x = y  =>  wywolania na x licza sie jak na y;
  //   2. przypisanie wywolania do jednostki, w ktorej zmienna zostala
  //      ZADEKLAROWANA, a nie w ktorej stoi wywolanie. Bez tego alias w lambdzie
  //      dalej siedzi w osobnej jednostce niz reszta zycia obiektu.
  // DOMYSLNIE WYLACZONE — zmierzone, pogarsza wynik. Poprawia dokladnie ten
  // falszywy alarm, dla ktorego powstalo (Loading.java:974, alias toDispose),
  // ale przypisanie wywolan do jednostki deklaracji scala tez wywolania
  // niezwiazane i tworzy nowe reguly na metodach zapytujacych
  // (setOnError -> getStatus). Bilans na projekcie autora: -1 falszywy alarm,
  // +2 nowe. Trafnosc 29% -> 21%. Zostaje jako opcja: w kodzie, ktory czesciej
  // przepisuje uchwyty miedzy zmiennymi, bilans moze byc odwrotny.
  const ALIASY = String(flag('aliasy', 'off')) === 'on';
  const alias = new Map();       // nazwa -> nazwa kanoniczna
  const deklaracje = new Map();  // nazwa -> [{unit, start, end}]

  // ZAKRESY, NIE SAMA NAZWA. Mapa "nazwa -> jednostka" na caly plik jest bledna:
  // `player` bywa zadeklarowany w trzech metodach i wtedy wszystkie wywolania
  // trafialyby do ostatniej z nich. Zapisujemy wiec zasieg funkcji, w ktorej
  // deklaracja stoi, i przy wywolaniu wybieramy ten, ktory je obejmuje.
  if (ALIASY) {
    const zbierzAliasy = (node, unit, span) => {
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
            if (!deklaracje.has(n.text)) deklaracje.set(n.text, []);
            deklaracje.get(n.text).push({ unit, start: span.start, end: span.end });
          }
        }
      } else if (node.type === 'assignment_expression') {
        const l = node.childForFieldName('left');
        const r = node.childForFieldName('right');
        if (l && r && l.type === 'identifier' && r.type === 'identifier') alias.set(l.text, r.text);
      }
      for (let i = 0; i < node.childCount; i++) zbierzAliasy(node.child(i), unit, span);
    };
    zbierzAliasy(tree.rootNode, null, null);
  }

  // deklaracja obejmujaca dane wywolanie; przy kilku wybieramy najwezsza
  const declUnitDla = (nazwa, poz) => {
    const lista = deklaracje.get(nazwa);
    if (!lista) return null;
    let best = null;
    for (const d of lista) {
      if (poz < d.start || poz > d.end) continue;
      if (!best || (d.end - d.start) < (best.end - best.start)) best = d;
    }
    return best ? best.unit : null;
  };

  const kanon = (n) => {
    let x = n, i = 0;
    while (alias.has(x) && i++ < 8) x = alias.get(x);   // licznik chroni przed cyklem x=y, y=x
    return x;
  };

  // ODBIORNIK UTWORZONY W TEJ SAMEJ JEDNOSTCE (sygnal 2). Zbierane przed
  // glownym przebiegiem, bo `new X()` moze stac po wywolaniach albo przed nimi.
  const noweWJednostce = new Map();   // "linia:rodzaj" -> Set(nazw)
  {
    const zbierzNowe = (node, unit) => {
      if (FUNC_LIKE.has(node.type)) {
        const nn = node.childForFieldName ? node.childForFieldName('name') : null;
        unit = (node.startPosition.row + 1) + ':' +
          (node.type === 'lambda_expression' ? 'lambda' : (nn ? nn.text : node.type));
      }
      const zapamietaj = (nazwa) => {
        const k = unit || 'top';
        if (!noweWJednostce.has(k)) noweWJednostce.set(k, new Set());
        noweWJednostce.get(k).add(nazwa);
      };
      if (node.type === 'variable_declarator') {
        const n = node.childForFieldName('name');
        const v = node.childForFieldName('value');
        if (n && v && v.type === 'object_creation_expression') zapamietaj(n.text);
      } else if (node.type === 'assignment_expression') {
        const l = node.childForFieldName('left');
        const r = node.childForFieldName('right');
        if (l && r && l.type === 'identifier' && r.type === 'object_creation_expression')
          zapamietaj(l.text);
      }
      for (let i = 0; i < node.childCount; i++) zbierzNowe(node.child(i), unit);
    };
    zbierzNowe(tree.rootNode, null);
  }

  const typOdbiornika = (obj, recvText) => {
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
        // odbiornik bedacy prosta nazwa sprowadzamy do nazwy kanonicznej,
        // a wywolanie przypisujemy do jednostki, w ktorej ta nazwa powstala
        let unitDlaWywolania = unit;
        if (ALIASY && obj && obj.type === 'identifier') {
          recv = kanon(obj.text);
          const d = declUnitDla(recv, node.startIndex);
          if (d) unitDlaWywolania = d;
        }
        const key = file + ' ' + (unitDlaWywolania ? unitDlaWywolania.line + ':' + unitDlaWywolania.kind : 'top') + ' ' + recv;
        let u = units.get(key);
        if (!u) {
          u = {
            file,
            unitLine: unitDlaWywolania ? unitDlaWywolania.line : 0,
            unitKind: unitDlaWywolania ? unitDlaWywolania.kind : 'top',
            recv, typ: typOdbiornika(obj, recv), items: new Map(),
            swiezy: (noweWJednostce.get(
              (unitDlaWywolania ? unitDlaWywolania.line + ':' + unitDlaWywolania.kind : 'top')) || new Set()).has(recv),
          };
          units.set(key, u);
        }
        // Pozycja niesie typ odbiornika: MediaPlayer#setOnError to co innego
        // niz MediaControl#setOnEndOfMedia. Nierozpoznany typ daje "?".
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

const rules = [];
for (const [k, ab] of supAB) {
  if (ab < MINSUP) continue;
  const [x, y] = k.split(' ');
  for (const [A, B] of [[x, y], [y, x]]) {
    // --only podaje NAZWY metod; pozycje moga miec prefiks typu (Typ#nazwa)
    const nazwa = s => s.includes('#') ? s.slice(s.indexOf('#') + 1) : s;
    if (ONLY && ONLY.indexOf(nazwa(A)) < 0 && ONLY.indexOf(nazwa(B)) < 0) continue;
    const conf = ab / supA.get(A);
    const viol = supA.get(A) - ab;
    if (conf < MINCONF || viol < 1 || viol > MAXVIOL) continue;
    rules.push({ A, B, sup: ab, supA: supA.get(A), conf, viol, score: ab * conf * conf });
  }
}
rules.sort((a, b) => b.score - a.score);

// ---- stabilnosc wzorca ----
//
// Wzorzec obecny w KAZDYM podzbiorze populacji jest pewniejszy niz taki, ktory
// powstaje dopiero z calosci. Ten drugi czesto oznacza, ze regula zlepila sie
// z kilku niezaleznych zwyczajow panujacych w roznych czesciach projektu.
//
// UWAGA — to jest SPRAWDZENIE, nie zmiana populacji. Reguly sa wydobyte
// z calego zbioru (powyzej) i nic tu tego nie rusza; podzbiory sluza wylacznie
// do policzenia, jak rowno wzorzec sie rozklada. Dzielenie populacji, na ktorej
// PRACUJE detektor, pogarsza wynik — zmierzone przy zasiegu `method` (7%).
//
// Podzial idzie po PLIKU, nie po jednostce: klasa nie ma sie rozjezdzac miedzy
// podzbiory, bo wtedy kazdy podzbior widzialby urwany fragment jej zwyczajow.
const PODZBIORY = Math.max(2, +flag('podzbiory', 4));
const haszPliku = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % PODZBIORY;
};
for (const u of all) u.podzbior = haszPliku(u.file);

for (const r of rules) {
  const supAi = new Array(PODZBIORY).fill(0);
  const supABi = new Array(PODZBIORY).fill(0);
  for (const u of all) {
    if (!u.items.has(r.A)) continue;
    supAi[u.podzbior]++;
    if (u.items.has(r.B)) supABi[u.podzbior]++;
  }

  // podzbior "rozstrzygajacy" to taki, w ktorym poprzednik w ogole wystepuje
  let rozstrzygajace = 0, trzyma = 0;
  for (let i = 0; i < PODZBIORY; i++) {
    if (supAi[i] === 0) continue;
    rozstrzygajace++;
    if (supABi[i] / supAi[i] >= MINCONF) trzyma++;
  }

  // narastajaco: czy regula trzyma sie na kazdym prefiksie podzbiorow
  let kumA = 0, kumAB = 0, prefiksy = 0, prefiksyTrzyma = 0;
  for (let i = 0; i < PODZBIORY; i++) {
    kumA += supAi[i]; kumAB += supABi[i];
    if (kumA === 0) continue;
    prefiksy++;
    if (kumAB / kumA >= MINCONF) prefiksyTrzyma++;
  }

  r.stab = rozstrzygajace === 0 ? null
    : +(((trzyma / rozstrzygajace) + (prefiksy ? prefiksyTrzyma / prefiksy : 1)) / 2).toFixed(2);
  r.stabOpis = rozstrzygajace === 0 ? 'brak danych'
    : trzyma + '/' + rozstrzygajace + ' podzbiorow, ' +
      prefiksyTrzyma + '/' + prefiksy + ' narastajaco';
}

// ---- odsiewanie klasy "setter obok settera" ----
//
// Mechaniczne wspolwystapienia wywolan konfiguracyjnych zajmowaly pierwsze
// dwanascie pozycji rankingu przy odkrywaniu par: setMinHeight -> setMinWidth,
// initModality -> initOwner, setCycleCount -> play. Kolejnosc i komplet sa tam
// przypadkowe, a brak jednego z nich nie jest bledem.
//
// Trzy sygnaly, kazdy wlaczany osobno (--odsiej 1 / 2 / 3 / 1,3), zeby dalo sie
// zmierzyc, ktory co usuwa. Odsiewanie dziala na REGULACH i ZGLOSZENIACH —
// populacja, na ktorej wydobyto reguly, zostaje nietknieta.
//
// UWAGA na granice: `setOnError` zaczyna sie od "set", ale PODPINA OBSLUGE
// ZDARZENIA, a nie ustawia wartosc. Musi przezyc kazdy z sygnalow, inaczej
// tracimy znana odpowiedz MediaPlayer#dispose -> MediaPlayer#setOnError.
// DOMYSLNIE WLACZONE wszystkie trzy — zmierzone, nie zabiera zadnej znanej
// odpowiedzi, a poprawia oba tryby:
//   odkrywanie par: zweryfikowane trafienia z pozycji 88/89 na 13/14 (z 30)
//   --only setOnError: 14 -> 12 zgloszen, trafnosc 29% -> 33%; usuniete dwa
//   to Menu.java:2690 i Preview.java:498, oba wczesniej ocenione jako falszywe
// `--odsiej none` wylacza.
const ODSIEJ_SUROWY = String(flag('odsiej', '1,2,3'));
const ODSIEJ = new Set(
  /^(none|off|brak)$/i.test(ODSIEJ_SUROWY) ? []
    : ODSIEJ_SUROWY.split(',').map(s => s.trim()).filter(Boolean));

const nazwaMetody = s => (s.includes('#') ? s.slice(s.indexOf('#') + 1) : s);
// setter = ustawia wartosc; setOnX NIE jest setterem, tylko podpieciem zdarzenia
const jestSetter = s => /^set[A-Z]/.test(nazwaMetody(s)) && !/^setOn[A-Z]/.test(nazwaMetody(s));
// reaguje na zdarzenie albo je podpina
const jestZdarzeniowa = s => /^(setOn[A-Z]|addEventHandler|addEventFilter|addListener|removeListener|on[A-Z])/
  .test(nazwaMetody(s));
// czynnosc cyklu zycia — ma porzadek w czasie, wiec para z nia NIE jest przypadkowa
const CZYNNOSCI = new Set(['play', 'stop', 'start', 'pause', 'dispose', 'close', 'open', 'show',
  'hide', 'shutdown', 'cancel', 'commit', 'rollback', 'release', 'acquire', 'lock', 'unlock',
  'flush', 'run', 'execute', 'submit', 'seek', 'load', 'reload', 'refresh', 'await', 'join']);
const jestCzynnoscia = s => CZYNNOSCI.has(nazwaMetody(s));

// sygnal 1: obie strony to zwykle settery
const s1 = r => jestSetter(r.A) && jestSetter(r.B);
// sygnal 3: obie ustawiaja stan — zadna nie jest zdarzeniowa ani czynnoscia
const s3 = r => !jestZdarzeniowa(r.A) && !jestZdarzeniowa(r.B) &&
  !jestCzynnoscia(r.A) && !jestCzynnoscia(r.B);
// sygnal 2 dziala na ZGLOSZENIU: odbiornik powstal w tej samej jednostce
const s2 = u => u.swiezy === true;

function odsiane(r, u) {
  if (ODSIEJ.has('1') && s1(r)) return 'setter obok settera';
  if (ODSIEJ.has('3') && s3(r)) return 'obie ustawiaja stan';
  if (ODSIEJ.has('2') && u && s2(u)) return 'odbiornik utworzony w tej jednostce';
  return null;
}

let odsianych = 0;

// ---- report ----
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
console.log('# odd-one-out');
console.log('root=' + ROOT);
console.log('files=' + parsed + ' parseErrors=' + parseErrors.length + ' units=' + all.length +
  ' distinctItems=' + supA.size + ' frequent=' + frequent.size);
if (parseErrors.length) console.log('  !! parse errors in: ' + parseErrors.slice(0, 5).map(rel).join(', '));
if (ODSIEJ.size) console.log('odsiewanie: sygnaly [' + [...ODSIEJ].join(',') + ']');
console.log('scope=' + SCOPE + '  rules(minsup=' + MINSUP + ' minconf=' + MINCONF + ' maxviol=' + MAXVIOL + ')=' + rules.length);
console.log('');

let shown = 0;
for (const r of rules) {
  if (shown >= TOP) break;
  shown++;
  console.log('## [' + shown + '] ' + r.A + ' -> ' + r.B +
    '   sup=' + r.sup + '/' + r.supA + ' conf=' + (r.conf * 100).toFixed(0) + '% odd=' + r.viol +
    (r.stab === null ? '' : ' stab=' + r.stab + ' (' + r.stabOpis + ')'));
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    if (odsiane(r, u)) { odsianych++; continue; }
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
  // Miejsca ZGODNE z wzorcem — potrzebne, zeby porownac wiek odstepstwa
  // z wiekiem reszty. Bez nich sygnal wieku nie ma punktu odniesienia.
  const wzorzec = [];
  for (const u of all) {
    if (!u.items.has(r.A) || !u.items.has(r.B)) continue;
    wzorzec.push({ file: rel(u.file), line: u.items.get(r.B)[0] });
    if (wzorzec.length >= 5) break;
  }
  for (const u of all) {
    if (!u.items.has(r.A) || u.items.has(r.B)) continue;
    if (odsiane(r, u)) continue;
    snapFindings.push({
      rule: r.A + '->' + r.B,
      file: rel(u.file),
      anchor: u.unitKind + '|' + u.recv,
      line: u.items.get(r.A)[0],
      label: r.A + ' -> ' + r.B + '   (recv=' + u.recv + ', ' + u.unitKind + ')',
      meta: {
        sup: r.sup, supA: r.supA, conf: +r.conf.toFixed(2), viol: r.viol,
        unit: u.unitKind + '@' + u.unitLine,
        stab: r.stab, stabOpis: r.stabOpis,
        wzorzec,
      },
    });
  }
}
maybeWriteSnapshot(argv, {
  detector: 'java', root: ROOT, args: argv.slice(1), cfg,
  counts: { pliki: parsed, zasieg: SCOPE, bledyParsowania: parseErrors.length, jednostki: all.length, regul: rules.length },
  findings: snapFindings,
});
