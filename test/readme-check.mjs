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

const WCIECIE = String.fromCharCode(10) + '           ';
const wyniki = [];
const ok = (grupa, co, szczegol = '') => wyniki.push({ stan: 'OK', grupa, co, szczegol });
const zle = (grupa, co, szczegol) => wyniki.push({ stan: 'FAIL', grupa, co, szczegol });
const nieda = (grupa, co, powod) => wyniki.push({ stan: 'N/A', grupa, co, szczegol: powod });

const czytaj = p => fs.readFileSync(p, 'utf8');
const uruchom = (args, opts = {}) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9, ...opts,
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

// ---------------------------------------------------------------- pomocnicze
function blokiKodu(tekst) {
  const linie = tekst.split(/\r?\n/);
  const bloki = [];
  let w = false, buf = null;
  for (const l of linie) {
    if (/^\s*```/.test(l)) {
      if (!w) { w = true; buf = []; } else { w = false; bloki.push(buf); }
      continue;
    }
    if (w) buf.push(l);
  }
  return bloki;
}

function tabele(tekst) {
  const linie = tekst.split(/\r?\n/);
  const out = [];
  let cur = null, wKod = false;
  for (const l of linie) {
    if (/^\s*```/.test(l)) { wKod = !wKod; continue; }
    if (wKod) continue;
    if (/^\s*\|/.test(l)) (cur = cur || []).push(l);
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

// Cells minus parenthesised asides: "(the list ends at seven)" and
// "(lista krotsza niz 10)" say the same thing with different numbers in them,
// and that is prose, not a claim.
const komorki = (wiersz) => wiersz.trim().replace(/^\||\|$/g, '').split('|')
  .map(c => c.replace(/\([^)]*\)/g, '').trim());
const liczbyZ = (s) => (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.'));

// ---------------------------------------------------------------- 1. komendy
// Which subcommands and switches actually exist, read out of the running tool
// rather than out of the source: the help screen is what a person is offered.
const pomoc = uruchom(['--help']).out;
// A COMMAND EXISTS IF RUNNING IT DOES NOT SAY "unknown command". Reading the
// help screen with a regular expression was the first version and it was wrong:
// the pattern wanted "<" after the name, `pom` has "--pom" there, and the gate
// reported a working command as missing. Asking the dispatcher is simpler and
// is what this gate is supposed to do in the first place.
const pamiecKomend = new Map();
function komendaIstnieje(sub) {
  if (!pamiecKomend.has(sub))
    pamiecKomend.set(sub, !/Unknown command|Nieznane polecenie/i.test(uruchom([sub]).out));
  return pamiecKomend.get(sub);
}
const znaneFlagi = new Set([...pomoc.matchAll(/--([a-z][a-z-]*)/g)].map(m => m[1]));
// switches documented in prose rather than in the options line
for (const f of ['json', 'all', 'lang', 'config', 'update', 'accessors', 'wrapper',
  'types', 'aliases', 'stability', 'age', 'subsets', 'filter', 'only', 'scope',
  'minsup', 'minconf', 'maxviol', 'minvia', 'maxodd', 'minconv', 'top', 'pom', 'tree'])
  znaneFlagi.add(f);

const NARZEDZIE = /^(?:npx\s+odd-one-out|node\s+bin\/odd-one-out\.mjs|odd-one-out)\b/;
const komendy = new Map();          // komenda -> [pliki]
for (const [plik, tekst] of [['EN', czytaj(EN)], ['PL', czytaj(PL)]]) {
  for (const blok of blokiKodu(tekst)) {
    for (const l of blok) {
      const s = l.trim();
      if (!s || s.startsWith('#') || s.startsWith('//') || s.startsWith('+') || s.startsWith('-')) continue;
      if (!/^(npx|node|odd-one-out|npm|git|gh|mvn|winget|claude)\b/.test(s)) continue;
      if (!komendy.has(s)) komendy.set(s, []);
      komendy.get(s).push(plik);
    }
  }
}

for (const [k, gdzie] of komendy) {
  const skad = ' [' + [...new Set(gdzie)].join('+') + ']';
  const bezKomentarza = k.split(/\s+#/)[0].trim();

  if (NARZEDZIE.test(bezKomentarza)) {
    const czesci = bezKomentarza.replace(NARZEDZIE, '').trim().split(/\s+/).filter(Boolean);
    const sub = czesci.find(c => !c.startsWith('-') && !c.startsWith('<'));
    if (sub && !komendaIstnieje(sub)) {
      zle('komendy', bezKomentarza + skad, 'polecenie "' + sub + '" nie istnieje — dyspozytor odpowiada "unknown command"');
      continue;
    }
    const zle_flagi = czesci.filter(c => c.startsWith('--'))
      .map(c => c.replace(/^--/, '').split('=')[0])
      .filter(f => f && !znaneFlagi.has(f));
    if (zle_flagi.length) {
      zle('komendy', bezKomentarza + skad, 'nieznane przelaczniki: ' + zle_flagi.join(', '));
      continue;
    }
    ok('komendy', bezKomentarza + skad, sub ? 'polecenie i przelaczniki istnieja' : 'przelaczniki istnieja');
    continue;
  }

  if (/^npm\s+run\s+/.test(bezKomentarza)) {
    const skrypt = bezKomentarza.split(/\s+/)[2];
    const pkg = JSON.parse(czytaj(path.join(ROOT, 'package.json')));
    if (!pkg.scripts || !pkg.scripts[skrypt])
      zle('komendy', bezKomentarza + skad, 'brak skryptu "' + skrypt + '" w package.json');
    else ok('komendy', bezKomentarza + skad, 'skrypt istnieje');
    continue;
  }
  if (/^npm\s+(test|start|install|i)\b/.test(bezKomentarza)) {
    const pkg = JSON.parse(czytaj(path.join(ROOT, 'package.json')));
    const s = bezKomentarza.split(/\s+/)[1];
    if ((s === 'test' || s === 'start') && !(pkg.scripts && pkg.scripts[s]))
      zle('komendy', bezKomentarza + skad, 'brak skryptu "' + s + '"');
    else ok('komendy', bezKomentarza + skad, 'polecenie npm istnieje');
    continue;
  }
  nieda('komendy', bezKomentarza + skad, 'nie jest poleceniem tego narzedzia (git/gh/mvn/winget/claude)');
}

// Dowod, ze CLI naprawde dziala, a nie tylko ze nazwy sie zgadzaja.
{
  const r = uruchom(['java', 'test/fixtures/java', '--config', CONFIG]);
  if (r.status === 0 || r.status === 1) ok('komendy', 'przebieg na wzorcu', 'kod ' + r.status);
  else zle('komendy', 'przebieg na wzorcu', 'kod ' + r.status);
}

// ---------------------------------------------------------------- 2. liczby
// Domyslne progi wypisane w pomocy wobec tego, co narzedzie naprawde robi.
{
  const wPomocy = pomoc.match(/--minsup (\d+) --minconf ([\d.]+) --maxviol (\d+) --top (\d+)/);
  const przebieg = uruchom(['java', 'test/fixtures/java', '--config', CONFIG]).out;
  const wPrzebiegu = przebieg.match(/minsup=(\d+) minconf=([\d.]+) maxviol=(\d+)/);
  if (!wPomocy) zle('liczby', 'progi domyslne w pomocy', 'nie znalazlem ich w pomocy');
  else if (!wPrzebiegu) zle('liczby', 'progi domyslne w przebiegu', 'przebieg ich nie wypisal');
  else {
    const a = wPomocy.slice(1, 4).join(','), b = wPrzebiegu.slice(1, 4).join(',');
    if (a === b) ok('liczby', 'progi domyslne', 'pomoc = przebieg: ' + a);
    else zle('liczby', 'progi domyslne', 'pomoc mowi ' + a + ', przebieg robi ' + b);
  }
}

// Kody wyjscia opisane w README wobec tego, co zwraca proces.
{
  const opisane = /exit code|Kod wyjscia|Kod wyjścia/i.test(czytaj(EN));
  const bezZgloszen = uruchom(['java', 'test/fixtures/java', '--config', CONFIG, '--only', 'nic-takiego']);
  const zeZgloszeniami = uruchom(['java', 'test/fixtures/java', '--config', CONFIG]);
  const zlaSciezka = uruchom(['java', 'nie-ma-takiego-katalogu']);
  const zgadza = bezZgloszen.status === 0 && zeZgloszeniami.status === 1 && zlaSciezka.status === 2;
  if (!opisane) nieda('liczby', 'kody wyjscia', 'README ich nie opisuje');
  else if (zgadza) ok('liczby', 'kody wyjscia 0/1/2', 'zmierzone: 0, 1, 2');
  else zle('liczby', 'kody wyjscia 0/1/2',
    'zmierzone: ' + bezZgloszen.status + ', ' + zeZgloszeniami.status + ', ' + zlaSciezka.status);
}

// Liczba detektorow wymieniona w pomocy wobec liczby modulow, ktore istnieja.
{
  const detektory = ['java', 'deps', 'pom', 'sql', 'js'].filter(komendaIstnieje);
  const brakujace = detektory.filter(d => {
    const m = { java: 'oddone.mjs', deps: 'deps.mjs', pom: 'pom.mjs', sql: 'sql.mjs', js: 'js.mjs' }[d];
    return m ? !fs.existsSync(path.join(ROOT, 'src', m)) : false;
  });
  if (brakujace.length) zle('liczby', 'detektory z pomocy istnieja', 'brak modulow: ' + brakujace.join(', '));
  else ok('liczby', 'detektory z pomocy istnieja', detektory.length + ': ' + detektory.join(', '));
}

// Liczby, ktorych w bosym klonie sprawdzic sie nie da — wypisane, nie pominiete.
const NIESPRAWDZALNE = [
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
for (const [co, powod] of NIESPRAWDZALNE) nieda('liczby', co, powod);

// ---------------------------------------------------------------- 3. odnosniki
for (const [nazwa, plik] of [['EN', EN], ['PL', PL]]) {
  const tekst = czytaj(plik);
  const linki = [...tekst.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .map(m => m[2]).filter(u => !/^https?:|^#|^mailto:/.test(u));
  const brak = [...new Set(linki)].filter(u =>
    !fs.existsSync(path.join(path.dirname(plik), u.split('#')[0])));
  if (brak.length) zle('odnosniki', nazwa, 'nie istnieja: ' + brak.join(', '));
  else ok('odnosniki', nazwa, [...new Set(linki)].length + ' wzglednych, wszystkie istnieja');
}

// ---------------------------------------------------------------- 4. przyklad
// README pokazuje przykladowe zgloszenie. Format wyjscia zmienia sie najczesciej
// i najciszej ze wszystkiego, wiec sprawdzamy go PRZEBIEGIEM, nie oczami.
{
  const wyjscie = uruchom(['java', 'test/fixtures/java', '--config', CONFIG, '--lang', 'en']).out;
  const wymagane = [
    [/^## \[\d+\] .+ -> .+\s+sup=\d+\/\d+ conf=\d+% odd=\d+/m, 'naglowek reguly sup/conf/odd'],
    [/^ {3}WHAT IS INCONSISTENT$/m, 'sekcja WHAT IS INCONSISTENT'],
    [/^ {3}HOW IT IS DONE ELSEWHERE$/m, 'sekcja HOW IT IS DONE ELSEWHERE'],
    [/^ {3}READY-MADE FIX \(not applied\)$/m, 'sekcja READY-MADE FIX'],
    [/^\s+\+ \w+\.\w+\(/m, 'linia poprawki zaczynajaca sie od +'],
  ];
  for (const [re, opis] of wymagane) {
    if (re.test(wyjscie)) ok('przyklad', opis, 'wypisane przez narzedzie');
    else zle('przyklad', opis, 'README to pokazuje, narzedzie tego nie wypisuje');
  }
  // kolejnosc sekcji
  const kolejnosc = ['WHAT IS INCONSISTENT', 'HOW IT IS DONE ELSEWHERE', 'READY-MADE FIX']
    .map(s => wyjscie.indexOf(s));
  if (kolejnosc.every(i => i >= 0) && kolejnosc[0] < kolejnosc[1] && kolejnosc[1] < kolejnosc[2])
    ok('przyklad', 'kolejnosc trzech sekcji', 'jak w README');
  else zle('przyklad', 'kolejnosc trzech sekcji', 'inna niz w README');

  // czy README pokazuje ten sam ksztalt naglowka
  const wReadme = czytaj(EN).match(/^## \[\d+\] .+ sup=\d+\/\d+ conf=\d+% odd=\d+/m);
  if (wReadme) ok('przyklad', 'README pokazuje ten ksztalt naglowka', wReadme[0].slice(0, 52) + '...');
  else zle('przyklad', 'README pokazuje ten ksztalt naglowka', 'nie znalazlem go w README');
}

// ---------------------------------------------------------------- 5. jezyki
{
  const te = tabele(czytaj(EN)), tp = tabele(czytaj(PL));
  if (te.length !== tp.length) {
    zle('jezyki', 'liczba tabel', 'EN ' + te.length + ', PL ' + tp.length);
  } else {
    let zgodnych = 0;
    for (let i = 0; i < te.length; i++) {
      const ke = te[i].map(komorki), kp = tp[i].map(komorki);
      if (ke[0].length !== kp[0].length) {
        zle('jezyki', 'tabela ' + (i + 1), 'rozna liczba kolumn: EN ' + ke[0].length + ', PL ' + kp[0].length);
        continue;
      }
      if (ke.length !== kp.length) {
        zle('jezyki', 'tabela ' + (i + 1), 'rozna liczba wierszy: EN ' + ke.length + ', PL ' + kp.length);
        continue;
      }
      const rozne = [];
      for (let w = 0; w < ke.length; w++)
        for (let c = 0; c < ke[w].length; c++) {
          const a = liczbyZ(ke[w][c]).join(','), b = liczbyZ(kp[w][c]).join(',');
          if (a !== b) rozne.push('w' + (w + 1) + 'k' + (c + 1) + ': EN[' + a + '] PL[' + b + ']');
        }
      if (rozne.length) zle('jezyki', 'tabela ' + (i + 1), rozne.slice(0, 3).join('  '));
      else zgodnych++;
    }
    if (zgodnych) ok('jezyki', 'tabele o zgodnych liczbach', zgodnych + ' z ' + te.length);
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
function rozdzialy(tekst) {
  const out = [];
  let cur = { tytul: '(przed pierwszym naglowkiem)', tresc: [] };
  let wKod = false;
  for (const l of tekst.split(/\r?\n/)) {
    if (/^\s*```/.test(l)) { wKod = !wKod; continue; }
    if (wKod) continue;
    if (/^#{2,3} /.test(l)) { out.push(cur); cur = { tytul: l, tresc: [] }; continue; }
    cur.tresc.push(l);
  }
  out.push(cur);
  return out;
}

function liczbyRozdzialu(tresc) {
  let t = tresc.join(' ').replace(/\([^)]*\)/g, ' ');
  t = t.replace(/(\d)[\u0020\u00a0,](\d{3})(?!\d)/g, '$1$2');   // tysiace: spacja albo przecinek
  t = t.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2');               // przecinek dziesietny
  return (t.match(/\d+(?:\.\d+)?/g) || []).sort();
}

{
  const re = rozdzialy(czytaj(EN)), rp = rozdzialy(czytaj(PL));
  if (re.length !== rp.length) {
    zle('jezyki', 'liczba rozdzialow', 'EN ' + re.length + ', PL ' + rp.length);
  } else {
    let zgodnych = 0;
    for (let k = 0; k < re.length; k++) {
      const a = liczbyRozdzialu(re[k].tresc), b = liczbyRozdzialu(rp[k].tresc);
      if (a.join(',') === b.join(',')) { zgodnych++; continue; }
      const zostale = b.slice();
      const tylkoEN = a.filter(x => {
        const m = zostale.indexOf(x);
        if (m < 0) return true;
        zostale.splice(m, 1);
        return false;
      });
      zle('jezyki', 'rozdzial ' + (k + 1) + ': ' + re[k].tytul.replace(/^#+ /, '').slice(0, 42),
        (tylkoEN.length ? 'tylko EN: ' + tylkoEN.join(', ') + '   ' : '') +
        (zostale.length ? 'tylko PL: ' + zostale.join(', ') : ''));
    }
    if (zgodnych) ok('jezyki', 'rozdzialy o zgodnych liczbach', zgodnych + ' z ' + re.length);
  }
}

// ---------------------------------------------------------------- raport
console.log('odd-one-out — does the README tell the truth?\n');
const grupy = [...new Set(wyniki.map(w => w.grupa))];
for (const g of grupy) {
  const w = wyniki.filter(x => x.grupa === g);
  console.log('  == ' + g + '  (' + w.filter(x => x.stan === 'OK').length + ' ok, ' +
    w.filter(x => x.stan === 'FAIL').length + ' zle, ' + w.filter(x => x.stan === 'N/A').length + ' niesprawdzalnych)');
  for (const x of w.filter(x => x.stan === 'FAIL'))
    console.log('     FAIL  ' + x.co + WCIECIE + x.szczegol);
  for (const x of w.filter(x => x.stan === 'N/A'))
    console.log('     N/A   ' + x.co + WCIECIE + x.szczegol);
}

const zlych = wyniki.filter(w => w.stan === 'FAIL').length;
const brakow = wyniki.filter(w => w.stan === 'N/A').length;
const dobrych = wyniki.filter(w => w.stan === 'OK').length;
console.log('');
console.log('  sprawdzanych rzeczy: ' + wyniki.length +
  '   zgadza sie: ' + dobrych + '   nie zgadza sie: ' + zlych +
  '   niesprawdzalnych mechanicznie: ' + brakow);
if (zlych) {
  console.log('');
  console.log('  README obiecuje cos, czego narzedzie nie robi. To ta sama wada,');
  console.log('  ktorej szuka to narzedzie, tyle ze we wlasnej dokumentacji.');
  process.exit(1);
}
