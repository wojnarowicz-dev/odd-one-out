#!/usr/bin/env node
// odd-one-out — a single entry point for every detector.
//
// Each detector is a separate module that reads process.argv on import. The
// dispatcher swaps argv and imports the right module — which keeps the
// detectors runnable on their own (`node src/sql.mjs ...`) as well as through
// this command.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t } from '../src/lang.mjs';
import { valueOf, flagAll as allValues, firstPositional } from '../src/args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

const COMMANDS = {
  java: {
    module: 'oddone.mjs',
    arg: '<java-source-dir>',
    descKey: 'cmdJava',
    options: '--minsup 3 --minconf 0.6 --maxviol 4 --top 10 --only name1,name2',
  },
  deps: {
    module: 'deps.mjs',
    arg: '<java-source-dir>',
    descKey: 'cmdDeps',
    options: '--minvia 5 --maxodd 3 --top 10',
  },
  pom: {
    module: 'pom.mjs',
    arg: '--pom <pom.xml> --tree <deptree.txt> [...]',
    descKey: 'cmdPom',
    options: null,
  },
  sql: {
    module: 'sql.mjs',
    arg: '<migrations-dir>',
    descKey: 'cmdSql',
    options: '--minconv 3',
  },
  js: {
    module: 'js.mjs',
    arg: '<web-project-dir>',
    descKey: 'cmdJs',
    options: '--top 20',
  },
  diff: {
    module: null,
    arg: '<previous.json> <current.json>',
    descKey: 'cmdDiff',
    options: '--all (also show unchanged findings)',
  },
  rank: {
    module: null,
    arg: '<snapshot.json> [more.json...]',
    descKey: 'cmdRank',
    options: '--top 20  --age <repo-dir>  --stability  (both OFF by default)',
  },
};

const { help } = await import(new URL('./usage.mjs', import.meta.url).href);
const usage = (code = 0) => help(COMMANDS, code);

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') usage(0);
if (cmd === '--version' || cmd === '-v') {
  const { createRequire } = await import('node:module');
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}
if (!COMMANDS[cmd]) {
  console.error(t('unknownCommand', cmd));
  console.error('');
  usage(2);
}
if (rest.length === 0) {
  console.error(t('inputMissingArg', cmd + ' ' + COMMANDS[cmd].arg));
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
    console.error(t('diffNeedsTwo'));
    process.exit(2);
  }
  const d = printDiff(readSnapshot(files[0]), readSnapshot(files[1]),
    { showUnchanged: rest.includes('--all') });
  // The exit code carries information for CI: 1 = there are new findings.
  process.exit(d.added.length ? 1 : 0);
}

if (cmd === 'rank') {
  const mod = f => new URL('file://' + path.join(SRC, f).replace(/\\/g, '/')).href;
  const { readSnapshot } = await import(mod('snapshot.mjs'));
  const { printRanking } = await import(mod('rank.mjs'));
  // Flagi z wartością zjadają następny token — bez tego `--top 8` wstawia "8"
  // na listę fileów.
  const FLAGI_Z_WARTOSCIA = new Set(['--top', '--age', '--lang']);
  const files = [];
  let top = 20, wiek = null;
  for (let i = 0; i < rest.length; i++) {
    if (FLAGI_Z_WARTOSCIA.has(rest[i])) {
      if (rest[i] === '--top') top = +rest[i + 1];
      if (rest[i] === '--age') wiek = rest[i + 1];
      i++; continue;
    }
    if (rest[i].startsWith('--')) continue;
    files.push(rest[i]);
  }
  if (files.length === 0) {
    console.error(t('rankNeedsOne'));
    process.exit(2);
  }
  await printRanking(files.map(readSnapshot), { top, wiek, stabilnosc: rest.includes('--stability') });
  process.exit(0);
}

// INPUT VALIDATION — one place for every detector, before anything runs.
// Without it a non-existent path produces a raw ENOENT with a stack trace,
// which looks like the tool crashed when in fact somebody mistyped a path.
{
  const mod = f => new URL('file://' + path.join(SRC, f).replace(/\\/g, '/')).href;
  const { requireDirectory, requireFile } = await import(mod('input.mjs'));

  if (cmd === 'pom') {
    requireFile(valueOf(rest, 'pom'), '--pom <pom.xml>');
    const trees = allValues(rest, 'tree');
    if (trees.length === 0) requireFile(null, '--tree <deptree.txt>');
    for (const tr of trees) requireFile(tr, '--tree');
  } else {
    requireDirectory(firstPositional(rest), COMMANDS[cmd].arg);
  }
}

// The detectors read process.argv.slice(2) — we swap it so they behave as if
// uruchomiono je bezpośrednio.
process.argv = [process.argv[0], path.join(SRC, COMMANDS[cmd].module), ...rest];
await import(new URL('file://' + path.join(SRC, COMMANDS[cmd].module).replace(/\\/g, '/')).href);
