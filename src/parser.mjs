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
const PYTHON_WASM = require.resolve('tree-sitter-python/tree-sitter-python.wasm');

// One parser per grammar, built once. Parser.init() is global to web-tree-sitter
// and must not be called twice.
const cache = new Map();

async function parserFor(wasm) {
  if (cache.has(wasm)) return cache.get(wasm);
  await Parser.init();
  const lang = await Language.load(wasm);
  const p = new Parser();
  p.setLanguage(lang);
  cache.set(wasm, p);
  return p;
}

export const javaParser = () => parserFor(WASM);
export const pythonParser = () => parserFor(PYTHON_WASM);

export { WASM as JAVA_WASM_PATH };
