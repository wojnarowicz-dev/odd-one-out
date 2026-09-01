import { javaParser, JAVA_WASM_PATH } from './parser.mjs';
import { Query } from 'web-tree-sitter';
import fs from 'node:fs';

const p = await javaParser();
const Java = p.language;

const file = process.argv[2] ?? 'test/Smoke.java';
const src = fs.readFileSync(file, 'utf8');
const t0 = Date.now();
const tree = p.parse(src);
const ms = Date.now() - t0;

let nodes = 0, errors = [], missing = [];
const walk = (n) => {
  nodes++;
  if (n.type === 'ERROR') errors.push(n);
  if (n.isMissing) missing.push(n);
  for (let i = 0; i < n.childCount; i++) walk(n.child(i));
};
walk(tree.rootNode);

console.log(`file=${file} bytes=${src.length} nodes=${nodes} parse=${ms}ms`);
console.log(`root=${tree.rootNode.type} hasError=${tree.rootNode.hasError} ERROR_nodes=${errors.length} MISSING=${missing.length}`);
for (const e of errors.slice(0, 5)) console.log(`  ERROR @${e.startPosition.row + 1}: ${src.slice(e.startIndex, Math.min(e.endIndex, e.startIndex + 80)).replace(/\n/g, '\n')}`);
for (const m of missing.slice(0, 5)) console.log(`  MISSING @${m.startPosition.row + 1}: ${m.type}`);

// sanity: can we find methods and calls?
const q = new Query(Java, `
  (method_declaration name: (identifier) @m)
  (method_invocation name: (identifier) @call)
`);
const caps = q.captures(tree.rootNode);
const methods = caps.filter(c => c.name === 'm').map(c => c.node.text);
const calls = caps.filter(c => c.name === 'call').map(c => c.node.text);
console.log(`methods(${methods.length}): ${methods.join(', ')}`);
console.log(`calls(${calls.length}): ${[...new Set(calls)].join(', ')}`);
