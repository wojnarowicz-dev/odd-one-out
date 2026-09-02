// Shared Java parser.
//
// WHY A SEPARATE MODULE: the detectors used to load the wasm grammar from
// 'node_modules/tree-sitter-java/tree-sitter-java.wasm' resolved against the
// CURRENT WORKING DIRECTORY. That only works when the tool is started from its
// own directory — i.e. never after `npm i -g`. Here the path goes through the
// module resolver, so it does not depend on where the command was invoked.
import { Parser, Language } from 'web-tree-sitter';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WASM = require.resolve('tree-sitter-java/tree-sitter-java.wasm');

let cached = null;

export async function javaParser() {
  if (cached) return cached;
  await Parser.init();
  const lang = await Language.load(WASM);
  const p = new Parser();
  p.setLanguage(lang);
  cached = p;
  return p;
}

export { WASM as JAVA_WASM_PATH };
