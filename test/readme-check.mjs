// odd-one-out — does the README tell the truth?
//
// WHY. The README carries numbers, commands and switches, all typed by hand and
// none of them wired to anything. Somebody clones the repository, pastes a
// command from the documentation, and gets whatever the code happens to do now.
// A promise without cover is exactly the class of defect this tool hunts for,
// and there is no reason its own documentation should be exempt.
//
// THE RULE: DO NOT COMPARE TEXT WITH TEXT. Every claim that can be executed is
// executed, and the README is compared against the RESULT. A gate that only
// reads the README checks itself.
//
// Claims that cannot be executed here — accuracy measured on the author's
// private repositories, mutation scores that cost two hours, PR-Miner's 18.1%
// from a 2005 paper — are listed separately as UNVERIFIABLE, with the reason and
// with what would make them verifiable. They are never silently skipped:
// "not checked" and "checked, fine" must not look alike.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const EN = path.join(ROOT, 'README.md');
const PL = path.join(ROOT, 'README.pl.md');
const CONFIG = 'test/fixtures/golden.config.json';

const INDENT = String.fromCharCode(10) + '           ';
const results = [];
const ok = (grupa, co, szczegol = '') => results.push({ state: 'OK', grupa, co, szczegol });
const fail = (grupa, co, szczegol) => results.push({ state: 'FAIL', grupa, co, szczegol });
const unverifiable = (grupa, co, reason) => results.push({ state: 'N/A', grupa, co, szczegol: reason });

const read = p => fs.readFileSync(p, 'utf8');
const run = (args, opts = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9, ...opts,
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

// ---------------------------------------------------------------- pomocnicze
function blokiKodu(text) {
  const lines = text.split(/\r?\n/);
  const bloki = [];
  let w = false, buf = null;
  for (const l of lines) {
    if (/^\s*```/.test(l)) {
      if (!w) { w = true; buf = []; } else { w = false; bloki.push(buf); }
      continue;
    }
    if (w) buf.push(l);
  }
  return bloki;
}

function tabele(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null, inCode = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^\s*\|/.test(l)) (cur = cur || []).push(l);
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

// Cells minus parenthesised asides: "(the list ends at seven)" and
// "(lista krotsza niz 10)" say the same thing with different numbers in them,
// and that is prose, not a claim.
const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|')
  .map(c => c.replace(/\([^)]*\)/g, '').trim());
const numbersIn = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.'));

// ---------------------------------------------------------------- 1. komendy
// Which subcommands and switches actually exist, read out of the running tool
// rather than out of the source: the help screen is what a person is offered.
const pomoc = run(['--help']).out;
// A COMMAND EXISTS IF RUNNING IT DOES NOT SAY "unknown command". Reading the
// help screen with a regular expression was the first version and it was wrong:
// the pattern wanted "<" after the name, `pom` has "--pom" there, and the gate
// reported a working command as missing. Asking the dispatcher is simpler and
// is what this gate is supposed to do in the first place.
const commandCache = new Map();
function commandExists(sub) {
  if (!commandCache.has(sub))
    commandCache.set(sub, !/Unknown command|Nieznane polecenie/i.test(run([sub]).out));
  return commandCache.get(sub);
}
const knownFlags = new Set([...pomoc.matchAll(/--([a-z][a-z-]*)/g)].map(m => m[1]));
// switches documented in prose rather than in the options line
for (const f of ['json', 'all', 'lang', 'config', 'update', 'accessors', 'wrapper',
  'types', 'aliases', 'stability', 'age', 'subsets', 'filter', 'only', 'scope',
  'minsup', 'minconf', 'maxviol', 'minvia', 'maxodd', 'minconv', 'top', 'pom', 'tree'])
  knownFlags.add(f);

const TOOL = /^(?:npx\s+odd-one-out|node\s+bin\/odd-one-out\.mjs|odd-one-out)\b/;
const commands = new Map();          // komenda -> [pliki]
for (const [file, text] of [['EN', read(EN)], ['PL', read(PL)]]) {
  for (const blok of blokiKodu(text)) {
    for (const l of blok) {
      const s = l.trim();
      if (!s || s.startsWith('#') || s.startsWith('//') || s.startsWith('+') || s.startsWith('-')) continue;
      if (!/^(npx|node|odd-one-out|npm|git|gh|mvn|winget|claude)\b/.test(s)) continue;
      if (!commands.has(s)) commands.set(s, []);
      commands.get(s).push(file);
    }
  }
}

for (const [k, gdzie] of commands) {
  const source = ' [' + [...new Set(gdzie)].join('+') + ']';
  const withoutComment = k.split(/\s+#/)[0].trim();

  if (TOOL.test(withoutComment)) {
    const parts = withoutComment.replace(TOOL, '').trim().split(/\s+/).filter(Boolean);
    const sub = parts.find(c => !c.startsWith('-') && !c.startsWith('<'));
    if (sub && !commandExists(sub)) {
      fail('komendy', withoutComment + source, 'polecenie "' + sub + '" nie istnieje — dyspozytor odpowiada "unknown command"');
      continue;
    }
    const zle_flagi = parts.filter(c => c.startsWith('--'))
      .map(c => c.replace(/^--/, '').split('=')[0])
      .filter(f => f && !knownFlags.has(f));
    if (zle_flagi.length) {
      fail('komendy', withoutComment + source, 'nieznane przelaczniki: ' + zle_flagi.join(', '));
      continue;
    }
    ok('komendy', withoutComment + source, sub ? 'polecenie i przelaczniki istnieja' : 'przelaczniki istnieja');
    continue;
  }

  if (/^npm\s+run\s+/.test(withoutComment)) {
    const script = withoutComment.split(/\s+/)[2];
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    if (!pkg.scripts || !pkg.scripts[script])
      fail('komendy', withoutComment + source, 'brak skryptu "' + script + '" w package.json');
    else ok('komendy', withoutComment + source, 'skrypt istnieje');
    continue;
  }
  if (/^npm\s+(test|start|install|i)\b/.test(withoutComment)) {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const s = withoutComment.split(/\s+/)[1];
    if ((s === 'test' || s === 'start') && !(pkg.scripts && pkg.scripts[s]))
      fail('komendy', withoutComment + source, 'brak skryptu "' + s + '"');
    else ok('komendy', withoutComment + source, 'polecenie npm istnieje');
    continue;
  }
  unverifiable('komendy', withoutComment + source, 'nie jest poleceniem tego narzedzia (git/gh/mvn/winget/claude)');
}

// Dowod, ze CLI naprawde dziala, a nie tylko ze nazwy sie zgadzaja.
{
  const r = run(['java', 'test/fixtures/java', '--config', CONFIG]);
  if (r.status === 0 || r.status === 1) ok('komendy', 'przebieg na wzorcu', 'kod ' + r.status);
  else fail('komendy', 'przebieg na wzorcu', 'kod ' + r.status);
}

// ---------------------------------------------------------------- 2. liczby
// Domyslne progi wypisane w pomocy wobec tego, co narzedzie naprawde robi.
{
  const inTheHelp = pomoc.match(/--minsup (\d+) --minconf ([\d.]+) --maxviol (\d+) --top (\d+)/);
  const theRun = run(['java', 'test/fixtures/java', '--config', CONFIG]).out;
  const inTheRun = theRun.match(/minsup=(\d+) minconf=([\d.]+) maxviol=(\d+)/);
  if (!inTheHelp) fail('liczby', 'progi domyslne w pomocy', 'nie znalazlem ich w pomocy');
  else if (!inTheRun) fail('liczby', 'progi domyslne w przebiegu', 'przebieg ich nie wypisal');
  else {
    const a = inTheHelp.slice(1, 4).join(','), b = inTheRun.slice(1, 4).join(',');
    if (a === b) ok('liczby', 'progi domyslne', 'pomoc = przebieg: ' + a);
    else fail('liczby', 'progi domyslne', 'pomoc mowi ' + a + ', przebieg robi ' + b);
  }
}

// Kody wyjscia opisane w README wobec tego, co zwraca proces.
{
  const documented = /exit code|Kod wyjscia|Kod wyjścia/i.test(read(EN));
  const noFindings = run(['java', 'test/fixtures/java', '--config', CONFIG, '--only', 'nic-takiego']);
  const withFindings = run(['java', 'test/fixtures/java', '--config', CONFIG]);
  const badPath = run(['java', 'nie-ma-takiego-katalogu']);
  const agrees = noFindings.status === 0 && withFindings.status === 1 && badPath.status === 2;
  if (!documented) unverifiable('liczby', 'kody wyjscia', 'README ich nie opisuje');
  else if (agrees) ok('liczby', 'kody wyjscia 0/1/2', 'zmierzone: 0, 1, 2');
  else fail('liczby', 'kody wyjscia 0/1/2',
    'zmierzone: ' + noFindings.status + ', ' + withFindings.status + ', ' + badPath.status);
}

// Liczba detektorow wymieniona w pomocy wobec liczby modulow, ktore istnieja.
{
  const detectors = ['java', 'deps', 'pom', 'sql', 'js'].filter(commandExists);
  const missing = detectors.filter(d => {
    const m = { java: 'oddone.mjs', deps: 'deps.mjs', pom: 'pom.mjs', sql: 'sql.mjs', js: 'js.mjs' }[d];
    return m ? !fs.existsSync(path.join(ROOT, 'src', m)) : false;
  });
  if (missing.length) fail('liczby', 'detektory z pomocy istnieja', 'brak modulow: ' + missing.join(', '));
  else ok('liczby', 'detektory z pomocy istnieja', detectors.length + ': ' + detectors.join(', '));
}

// Liczby, ktorych w bosym klonie sprawdzic sie nie da — wypisane, nie pominiete.
const UNVERIFIABLE = [
  ['trafnosc na projekcie autora (60%, 43%, 29%, 20%, 21%)',
    'wymaga prywatnego repozytorium; ustaw OOO_VAA i uruchom npm run known-answers'],
  ['tabele netty / JSON-java / spring-petclinic (100->79, 31->17, 7->2)',
    'wymaga klonow; ustaw OOO_NETTY, OOO_JSONJAVA, OOO_PETCLINIC i uruchom npm run foreign'],
  ['wynik mutacji (316 mutantow, 216 przezylo, 31,65%, 23,42%)',
    'jeden plik to 118 minut; npm run mutation po npm install --no-save @stryker-mutator/core'],
  ['118 minut przebiegu mutacji', 'to sam pomiar czasu, ktorego nie da sie sprawdzic taniej niz powtarzajac'],
  ['PR-Miner: 18,1%', 'liczba z pracy z 2005 roku, nie z tego repozytorium'],
  ['gestosc timeoutow (redash 43/1, prefect 38/1, certbot 5/1, sherlock 4/4)',
    'wymaga czterech klonow, ktorych repozytorium nie wiezie'],
  ['260 naruszen Pythona, 213 przezylo trzy lata',
    'detektor jest na galezi python-postponed-unverified, nie na masterze'],
  ['1% - 36,3% dla narzedzi komercyjnych', 'liczby producentow i raportu Tolly 2024, nie do zmierzenia tutaj'],
];
for (const [co, reason] of UNVERIFIABLE) unverifiable('liczby', co, reason);

// ---------------------------------------------------------------- 3. odnosniki
for (const [name, file] of [['EN', EN], ['PL', PL]]) {
  const text = read(file);
  const linki = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .map(m => m[2]).filter(u => !/^https?:|^#|^mailto:/.test(u));
  const missing = [...new Set(linki)].filter(u =>
    !fs.existsSync(path.join(path.dirname(file), u.split('#')[0])));
  if (missing.length) fail('odnosniki', name, 'nie istnieja: ' + missing.join(', '));
  else ok('odnosniki', name, [...new Set(linki)].length + ' wzglednych, wszystkie istnieja');
}

// ---------------------------------------------------------------- 4. przyklad
// README pokazuje przykladowe zgloszenie. Format wyjscia zmienia sie najczesciej
// i najciszej ze wszystkiego, wiec sprawdzamy go PRZEBIEGIEM, nie oczami.
{
  const output = run(['java', 'test/fixtures/java', '--config', CONFIG, '--lang', 'en']).out;
  const required = [
    [/^## \[\d+\] .+ -> .+\s+sup=\d+\/\d+ conf=\d+% odd=\d+/m, 'naglowek reguly sup/conf/odd'],
    [/^ {3}WHAT IS INCONSISTENT$/m, 'sekcja WHAT IS INCONSISTENT'],
    [/^ {3}HOW IT IS DONE ELSEWHERE$/m, 'sekcja HOW IT IS DONE ELSEWHERE'],
    [/^ {3}READY-MADE FIX \(not applied\)$/m, 'sekcja READY-MADE FIX'],
    [/^\s+\+ \w+\.\w+\(/m, 'linia poprawki zaczynajaca sie od +'],
  ];
  for (const [re, opis] of required) {
    if (re.test(output)) ok('przyklad', opis, 'wypisane przez narzedzie');
    else fail('przyklad', opis, 'README to pokazuje, narzedzie tego nie wypisuje');
  }
  // kolejnosc sekcji
  const order = ['WHAT IS INCONSISTENT', 'HOW IT IS DONE ELSEWHERE', 'READY-MADE FIX']
    .map(s => output.indexOf(s));
  if (order.every(i => i >= 0) && order[0] < order[1] && order[1] < order[2])
    ok('przyklad', 'kolejnosc trzech sekcji', 'jak w README');
  else fail('przyklad', 'kolejnosc trzech sekcji', 'inna niz w README');

  // czy README pokazuje ten sam ksztalt naglowka
  const wReadme = read(EN).match(/^## \[\d+\] .+ sup=\d+\/\d+ conf=\d+% odd=\d+/m);
  if (wReadme) ok('przyklad', 'README pokazuje ten ksztalt naglowka', wReadme[0].slice(0, 52) + '...');
  else fail('przyklad', 'README pokazuje ten ksztalt naglowka', 'nie znalazlem go w README');
}

// ---------------------------------------------------------------- 5. jezyki
{
  const te = tabele(read(EN)), tp = tabele(read(PL));
  if (te.length !== tp.length) {
    fail('jezyki', 'liczba tabel', 'EN ' + te.length + ', PL ' + tp.length);
  } else {
    let matching = 0;
    for (let i = 0; i < te.length; i++) {
      const ke = te[i].map(cells), kp = tp[i].map(cells);
      if (ke[0].length !== kp[0].length) {
        fail('jezyki', 'tabela ' + (i + 1), 'rozna liczba kolumn: EN ' + ke[0].length + ', PL ' + kp[0].length);
        continue;
      }
      if (ke.length !== kp.length) {
        fail('jezyki', 'tabela ' + (i + 1), 'rozna liczba wierszy: EN ' + ke.length + ', PL ' + kp.length);
        continue;
      }
      const rozne = [];
      for (let w = 0; w < ke.length; w++)
        for (let c = 0; c < ke[w].length; c++) {
          const a = numbersIn(ke[w][c]).join(','), b = numbersIn(kp[w][c]).join(',');
          if (a !== b) rozne.push('w' + (w + 1) + 'k' + (c + 1) + ': EN[' + a + '] PL[' + b + ']');
        }
      if (rozne.length) fail('jezyki', 'tabela ' + (i + 1), rozne.slice(0, 3).join('  '));
      else matching++;
    }
    if (matching) ok('jezyki', 'tabele o zgodnych liczbach', matching + ' z ' + te.length);
  }
}

// ---------------------------------------------------------------- 5b. proza
// TABELE TO NIE WSZYSTKO. Zepsucie liczby w prozie ("316 mutantow" -> "999")
// przeszlo przez pierwsza wersje tej bramki bez sladu, bo porownywala tylko
// tabele. Liczby w zdaniach porownujemy per rozdzial: oba dokumenty maja te sama
// liste naglowkow, wiec rozdzial i-ty odpowiada rozdzialowi i-temu.
//
// Notacja jest inna po obu stronach — "11,581" i "18.1%" wobec "11 581" i
// "18,1%" — wiec obie sa sprowadzane do jednej postaci, zanim cokolwiek sie
// porowna. Nawiasy sa wycinane: "(the list ends at seven)" i "(lista krotsza niz
// 10)" mowia to samo innymi liczbami, a to proza, nie deklaracja.
function sections(text) {
  const out = [];
  let cur = { tytul: '(przed pierwszym naglowkiem)', body: [] };
  let inCode = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^\s*```/.test(l)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^#{2,3} /.test(l)) { out.push(cur); cur = { tytul: l, body: [] }; continue; }
    cur.body.push(l);
  }
  out.push(cur);
  return out;
}

function numbersOfSection(body) {
  let t = body.join(' ').replace(/\([^)]*\)/g, ' ');
  t = t.replace(/(\d)[\u0020\u00a0,](\d{3})(?!\d)/g, '$1$2');   // tysiace: spacja albo przecinek
  t = t.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');               // przecinek dziesietny
  return (t.match(/\d+(?:\.\d+)?/g) || []).sort();
}

{
  const re = sections(read(EN)), rp = sections(read(PL));
  if (re.length !== rp.length) {
    fail('jezyki', 'liczba rozdzialow', 'EN ' + re.length + ', PL ' + rp.length);
  } else {
    let matching = 0;
    for (let k = 0; k < re.length; k++) {
      const a = numbersOfSection(re[k].body), b = numbersOfSection(rp[k].body);
      if (a.join(',') === b.join(',')) { matching++; continue; }
      const remaining = b.slice();
      const onlyEN = a.filter(x => {
        const m = remaining.indexOf(x);
        if (m < 0) return true;
        remaining.splice(m, 1);
        return false;
      });
      fail('jezyki', 'rozdzial ' + (k + 1) + ': ' + re[k].tytul.replace(/^#+ /, '').slice(0, 42),
        (onlyEN.length ? 'tylko EN: ' + onlyEN.join(', ') + '   ' : '') +
        (remaining.length ? 'tylko PL: ' + remaining.join(', ') : ''));
    }
    if (matching) ok('jezyki', 'rozdzialy o zgodnych liczbach', matching + ' z ' + re.length);
  }
}

// ---------------------------------------------------------------- raport
console.log('odd-one-out — does the README tell the truth?\n');
const groups = [...new Set(results.map(w => w.grupa))];
for (const g of groups) {
  const w = results.filter(x => x.grupa === g);
  console.log('  == ' + g + '  (' + w.filter(x => x.state === 'OK').length + ' ok, ' +
    w.filter(x => x.state === 'FAIL').length + ' zle, ' + w.filter(x => x.state === 'N/A').length + ' niesprawdzalnych)');
  for (const x of w.filter(x => x.state === 'FAIL'))
    console.log('     FAIL  ' + x.co + INDENT + x.szczegol);
  for (const x of w.filter(x => x.state === 'N/A'))
    console.log('     N/A   ' + x.co + INDENT + x.szczegol);
}

const zlych = results.filter(w => w.state === 'FAIL').length;
const brakow = results.filter(w => w.state === 'N/A').length;
const dobrych = results.filter(w => w.state === 'OK').length;
console.log('');
console.log('  sprawdzanych rzeczy: ' + results.length +
  '   zgadza sie: ' + dobrych + '   nie zgadza sie: ' + zlych +
  '   niesprawdzalnych mechanicznie: ' + brakow);
if (zlych) {
  console.log('');
  console.log('  README obiecuje cos, czego narzedzie nie robi. To ta sama wada,');
  console.log('  ktorej szuka to narzedzie, tyle ze we wlasnej dokumentacji.');
  process.exit(1);
}
