#!/usr/bin/env node
// odd-one-out — jedno wejście do wszystkich detektorów.
//
// Każdy detektor jest osobnym modułem czytającym process.argv przy imporcie.
// Dyspozytor podmienia argv i importuje właściwy moduł — dzięki temu detektory
// zostają uruchamialne pojedynczo (`node src/sql.mjs ...`) także wtedy, gdy
// woła się je przez to polecenie.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

const COMMANDS = {
  java: {
    module: 'oddone.mjs',
    arg: '<katalog-zrodel-java>',
    opis: 'Pary wywołań na tym samym odbiorniku (PR-Miner). Reguła A->B, odstępstwo = ma A, nie ma B.',
    opcje: '--minsup 3 --minconf 0.6 --maxviol 4 --top 10 --only nazwa1,nazwa2',
  },
  deps: {
    module: 'deps.mjs',
    arg: '<katalog-zrodel-java>',
    opis: 'Zależności rozłożone niespójnie: N klas przez warstwę wspólną, K bezpośrednio.',
    opcje: '--minvia 5 --maxodd 3 --top 10',
  },
  pom: {
    module: 'pom.mjs',
    arg: '--pom <pom.xml> --tree <deptree.txt> [...]',
    opis: 'Martwy wpis w dependencyManagement. Wymaga drzewa z mvn dependency:tree.',
    opcje: '(drzewo musi pochodzić z TEJ SAMEJ rewizji pom.xml i tego samego zestawu profili)',
  },
  sql: {
    module: 'sql.mjs',
    arg: '<katalog-migracji>',
    opis: 'revoke bez grant execute w tej samej migracji.',
    opcje: '--minconv 3',
  },
  js: {
    module: 'js.mjs',
    arg: '<katalog-projektu-web>',
    opis: 'JavaScript i TypeScript: nazwa wolana jak funkcja, ktorej strona nie zna.',
    opcje: '--top 20',
  },
  diff: {
    module: null,
    arg: '<poprzedni.json> <biezacy.json>',
    opis: 'Roznica miedzy dwoma przebiegami: co doszlo, co zniknelo, co zmienilo sile dowodu.',
    opcje: '--all (pokaz takze zgloszenia bez zmian)',
  },
  rank: {
    module: null,
    arg: '<zapis.json> [wiecej.json...]',
    opis: 'Jeden ranking ponad detektorami — co czytac pierwsze.',
    opcje: '--top 20  --wiek <katalog-repo>  --stabilnosc  (oba domyslnie WYLACZONE)',
  },
};

function usage(code = 0) {
  const out = code === 0 ? console.log : console.error;
  out('odd-one-out — szuka odstępstw od konwencji panującej w projekcie.');
  out('');
  out('  Zasada: N razy tak, raz inaczej. Narzędzie nie ma progów z sufitu —');
  out('  porównuje kod do reszty TEGO projektu. Nie zmienia plików: pokazuje');
  out('  gotową poprawkę do wklejenia.');
  out('');
  out('UŻYCIE');
  out('  odd-one-out <polecenie> [argumenty]');
  out('');
  out('JEZYK / LANGUAGE');
  out('  --lang en   (domyslnie) angielski / English');
  out('  --lang pl   polski');
  out('');
  out('POLECENIA');
  for (const [name, c] of Object.entries(COMMANDS)) {
    out('  ' + name.padEnd(6) + c.arg);
    out('         ' + c.opis);
    out('         opcje: ' + c.opcje);
  }
  out('');
  out('PRZYKŁADY');
  out('  odd-one-out java  ./src/main/java --only setOnError');
  out('  odd-one-out deps  ./src/main/java');
  out('  odd-one-out sql   ./supabase/migrations');
  out('  odd-one-out pom   --pom ./pom.xml --tree ./deptree.txt');
  out('');
  out('JAK CZYTAĆ WYNIK');
  out('  sup=8/10 conf=80% odd=2  — 10 miejsc ma poprzednik, 8 z nich ma też');
  out('  następnik; 2 odstają. Im wyższe sup i conf, tym mocniejsza konwencja.');
  out('  Zgłoszenie z odd=1 przy sup>=8 jest najmocniejszym sygnałem.');
  out('  Trafność referencyjna tej klasy narzędzi (PR-Miner): 18,1% — szum jest');
  out('  oczekiwany i nie jest porażką.');
  process.exit(code);
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') usage(0);
if (cmd === '--version' || cmd === '-v') {
  const { createRequire } = await import('node:module');
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}
if (!COMMANDS[cmd]) {
  console.error('Nieznane polecenie: ' + cmd);
  console.error('');
  usage(2);
}
if (rest.length === 0) {
  console.error('Brak argumentu dla polecenia "' + cmd + '": ' + COMMANDS[cmd].arg);
  process.exit(2);
}

if (cmd === 'diff') {
  const { readSnapshot, printDiff } = await import(
    new URL('file://' + path.join(SRC, 'snapshot.mjs').replace(/\\/g, '/')).href);
  // --lang zjada nastepny token, tak samo jak --top w poleceniu rank
  const files = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--lang') { i++; continue; }
    if (rest[i].startsWith('--')) continue;
    files.push(rest[i]);
  }
  if (files.length !== 2) {
    console.error('diff wymaga dwoch plikow: <poprzedni.json> <biezacy.json>');
    process.exit(2);
  }
  const d = printDiff(readSnapshot(files[0]), readSnapshot(files[1]),
    { showUnchanged: rest.includes('--all') });
  // Kod wyjscia niesie informacje dla CI: 1 = sa nowe zgloszenia.
  process.exit(d.nowe.length ? 1 : 0);
}

if (cmd === 'rank') {
  const mod = f => new URL('file://' + path.join(SRC, f).replace(/\\/g, '/')).href;
  const { readSnapshot } = await import(mod('snapshot.mjs'));
  const { printRanking } = await import(mod('rank.mjs'));
  // Flagi z wartością zjadają następny token — bez tego `--top 8` wstawia "8"
  // na listę plików.
  const FLAGI_Z_WARTOSCIA = new Set(['--top', '--wiek', '--lang']);
  const files = [];
  let top = 20, wiek = null;
  for (let i = 0; i < rest.length; i++) {
    if (FLAGI_Z_WARTOSCIA.has(rest[i])) {
      if (rest[i] === '--top') top = +rest[i + 1];
      if (rest[i] === '--wiek') wiek = rest[i + 1];
      i++; continue;
    }
    if (rest[i].startsWith('--')) continue;
    files.push(rest[i]);
  }
  if (files.length === 0) {
    console.error('rank wymaga co najmniej jednego pliku zapisu');
    process.exit(2);
  }
  await printRanking(files.map(readSnapshot), { top, wiek, stabilnosc: rest.includes('--stabilnosc') });
  process.exit(0);
}

// SPRAWDZENIE WEJSCIA — jedno miejsce dla wszystkich detektorow, przed
// uruchomieniem czegokolwiek. Bez tego nieistniejaca sciezka daje surowy
// ENOENT ze sladem stosu, co wyglada na awarie narzedzia, a jest literowka.
{
  const mod = f => new URL('file://' + path.join(SRC, f).replace(/\\/g, '/')).href;
  const { wymagajKatalog, wymagajPlik } = await import(mod('wejscie.mjs'));
  const wartosc = (nazwa) => {
    const i = rest.indexOf(nazwa);
    return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : null;
  };
  if (cmd === 'pom') {
    wymagajPlik(wartosc('--pom'), '--pom <pom.xml>');
    const i = rest.indexOf('--tree');
    if (i < 0) wymagajPlik(null, '--tree <deptree.txt>');
    for (let j = i + 1; j < rest.length && !rest[j].startsWith('--'); j++) wymagajPlik(rest[j], '--tree');
  } else {
    wymagajKatalog(rest.find(a => !a.startsWith('--')), COMMANDS[cmd].arg);
  }
}

// Detektory czytają process.argv.slice(2) — podmieniamy je tak, jakby
// uruchomiono je bezpośrednio.
process.argv = [process.argv[0], path.join(SRC, COMMANDS[cmd].module), ...rest];
await import(new URL('file://' + path.join(SRC, COMMANDS[cmd].module).replace(/\\/g, '/')).href);
