// Wspólny parser Javy.
//
// DLACZEGO OSOBNY MODUŁ: detektory ładowały wasm ze ścieżki
// 'node_modules/tree-sitter-java/tree-sitter-java.wasm' liczonej względem
// KATALOGU ROBOCZEGO. Działa to wyłącznie wtedy, gdy narzędzie uruchamia się
// z własnego katalogu — czyli nigdy po `npm i -g`. Tutaj ścieżka idzie przez
// resolver modułów, więc jest niezależna od tego, skąd wołamy polecenie.
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
