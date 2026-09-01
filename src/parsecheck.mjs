import { Parser, Language } from 'web-tree-sitter';
import fs from 'node:fs';
await Parser.init();
const Java = await Language.load('node_modules/tree-sitter-java/tree-sitter-java.wasm');
const p = new Parser(); p.setLanguage(Java);
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const t = p.parse(src);
  const errs = [];
  const w = n => { if (n.type === 'ERROR' || n.isMissing) errs.push(n); for (let i = 0; i < n.childCount; i++) w(n.child(i)); };
  w(t.rootNode);
  console.log('=== ' + f.split(/[\/]/).pop() + '  errors=' + errs.length);
  for (const e of errs.slice(0, 3)) {
    console.log('  line ' + (e.startPosition.row + 1) + ' [' + (e.isMissing ? 'MISSING ' + e.type : 'ERROR') + ']');
    console.log('    ' + src.slice(e.startIndex, Math.min(e.endIndex, e.startIndex + 120)).replace(/\n/g, ' | '));
  }
}
