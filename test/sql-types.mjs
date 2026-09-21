// odd-one-out — funkcje wyzwalaczy i naprawa w pozniejszej migracji.
//
// PO CO OSOBNA WARSTWA. Golden pilnuje, ze migawka sie nie zmienia. Nie powie
// jednak, DLACZEGO ma wygladac tak, a nie inaczej: liczba 2 w polu
// skippedTriggerFunctions jest tam liczba, a nie zdaniem "trigger i event_trigger
// sa wylaczone, a typ nieznany nie". Ta warstwa sprawdza zdania.
//
// PROG, KTORY MA TU STAC NA ZAWSZE: wylaczenie funkcji wyzwalaczy nie moze zabrac
// ani jednego zgloszenia o zwyklej funkcji. Gdyby regula kiedys zaczela pomijac
// wszystko, czego typu nie zna, ten plik ma sie zrobic czerwony.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CLI = path.join(ROOT, 'bin', 'odd-one-out.mjs');
const CONFIG = 'test/fixtures/golden.config.json';

let passed = 0, failed = 0;
const check = (what, ok, detail = '') => {
  console.log('  ' + (ok ? 'pass' : 'FAIL') + '  ' + what.padEnd(52) + detail);
  ok ? passed++ : failed++;
};

function run(dir) {
  const r = spawnSync(process.execPath, [CLI, 'sql', dir, '--config', CONFIG],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  return { status: r.status, out: r.stdout || '' };
}

function snapshot(dir, name) {
  const file = path.join(ROOT, '.odd-one-out', 'test-' + name + '.json');
  const r = spawnSync(process.execPath, [CLI, 'sql', dir, '--config', CONFIG, '--json', file],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e9 });
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.rmSync(file, { force: true });
  return { snap, status: r.status };
}

console.log('\nodd-one-out — typy funkcji i naprawa w pozniejszej migracji\n');

// ---------------------------------------------------------------- 1. typy
{
  const { out, status } = run('test/fixtures/sql-types');
  const names = [...out.matchAll(/^## \[\d+\] (\S+)/gm)].map(m => m[1]);

  check('funkcja returns trigger nie jest odstepstwem',
    !names.includes('public.widget_stamp'), 'widget_stamp poza lista');
  check('funkcja returns event_trigger nie jest odstepstwem',
    !names.includes('public.widget_watch'), 'widget_watch poza lista');
  check('typ nieznany JEST zglaszany',
    names.includes('public.widget_elsewhere'), 'deklaracji nie ma w katalogu');
  check('zwykla funkcja nadal jest zglaszana  [PROG]',
    names.includes('public.widget_delta'), 'returns void');
  check('pominiete sa policzone, nie przemilczane',
    /skipped: 2 function/.test(out) || /pominietych: 2 funkcji/.test(out));
  check('sa odstepstwa, wiec kod wyjscia 1', status === 1, 'exit ' + status);
}

// ---------------------------------------------------------------- 2. kolejnosc
{
  const { out, status } = run('test/fixtures/sql-regrant');
  const names = [...out.matchAll(/^## \[\d+\] (\S+)/gm)].map(m => m[1]);

  check('nadanie PO odebraniu liczy sie jako naprawa',
    !names.includes('public.gadget_touch') && /0004_regrant_touch\.sql/.test(out));
  check('nadanie PRZED odebraniem naprawa NIE jest',
    names.includes('public.gadget_probe'), 'gadget_probe zostaje odstepstwem');
  check('naprawione pozniej ma wlasna sekcje',
    /FIXED IN A LATER MIGRATION|NAPRAWIONE W POZNIEJSZEJ MIGRACJI/.test(out));
  check('jedno odstepstwo zostalo, wiec kod wyjscia 1', status === 1, 'exit ' + status);
}

// ------------------------------------------------- 3. kod wyjscia bez odstepstw
//
// Sedno zmiany na 0.2.0: katalog, w ktorym KAZDE zgloszenie jest juz naprawione
// pozniejsza migracja, ma konczyc sie zerem. Czerwone budowanie na rzeczy
// naprawionej uczy wylaczac narzedzie.
{
  const { snap, status } = snapshot('test/fixtures/sql-regrant', 'regrant');
  check('naprawione pozniej nie idzie do migawki',
    (snap.findings || []).every(f => f.anchor !== 'public.gadget_touch'),
    (snap.findings || []).length + ' znalezisk w migawce');
  check('licznik naprawionych pozniej jest w migawce',
    snap.counts.fixedInALaterMigration === 1, 'fixedInALaterMigration=' + snap.counts.fixedInALaterMigration);
  check('populacja nadal opisuje calosc',
    snap.counts.withoutGrant === 2, 'withoutGrant=' + snap.counts.withoutGrant);
  check('migawka zapisana, przebieg zakonczony', typeof status === 'number');
}

console.log('');
console.log('  ' + passed + ' passed, ' + failed + ' failed');
console.log('');
process.exit(failed ? 1 : 0);
