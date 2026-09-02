// odd-one-out — a diagnostic: does the Java grammar parse these files cleanly?
//
// Not wired into the CLI; run it directly when a detector reports parse errors
// and you want to see where they are:
//     node src/parsecheck.mjs Foo.java Bar.java
//
// It goes through the shared parser (src/parser.mjs). It used to load the wasm
// grammar from a path relative to the CURRENT WORKING DIRECTORY — the exact
// defect already fixed in parser.mjs, left behind here in the one file nothing
// imports. Two places doing the same thing, one fixed and one not, is the very
// deviation this tool looks for.
import fs from 'node:fs';
import { javaParser } from './parser.mjs';
import { readSource, reportNonUtf8 } from './input.mjs';

const p = await javaParser();

for (const f of process.argv.slice(2)) {
  const src = readSource(f);
  const t = p.parse(src);
  const errs = [];
  const w = n => {
    if (n.type === 'ERROR' || n.isMissing) errs.push(n);
    for (let i = 0; i < n.childCount; i++) w(n.child(i));
  };
  w(t.rootNode);
  console.log('=== ' + f.split(/[\\/]/).pop() + '  errors=' + errs.length);
  for (const e of errs.slice(0, 3)) {
    console.log('  line ' + (e.startPosition.row + 1) + ' [' + (e.isMissing ? 'MISSING ' + e.type : 'ERROR') + ']');
    console.log('    ' + src.slice(e.startIndex, Math.min(e.endIndex, e.startIndex + 120)).replace(/\n/g, ' | '));
  }
}
