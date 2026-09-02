// odd-one-out — mutation testing (Stryker), behind `npm run full`.
//
// WHY IT IS NOT PART OF `npm test`. Mutation testing rewrites the source
// hundreds of times and runs the whole suite against each version. It answers a
// question no other layer here answers — "would these tests notice if the code
// were wrong?" — and it costs minutes, not seconds. Running it on every change
// would make people stop running the tests.
//
// WHY IT IS NOT A DEPENDENCY. @stryker-mutator/core pulls in a large tree. A
// tool meant to survive `npm i -g` should not carry it for everyone who never
// runs it, so this checks whether it is installed and prints the one command
// that installs it otherwise. A missing runner is a SKIP with the reason and
// exit 2 — never a pass.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);

console.log('odd-one-out — mutation testing\n');

let installed = true;
try {
  require.resolve('@stryker-mutator/core/package.json', { paths: [ROOT] });
} catch {
  installed = false;
}

if (!installed) {
  console.log('  SKIP  @stryker-mutator/core is not installed.');
  console.log('');
  console.log('        npm install --no-save @stryker-mutator/core');
  console.log('');
  console.log('  It is deliberately not a dependency: it is large, and it is only needed');
  console.log('  by "npm run full". Nothing was measured, so nothing is claimed.');
  process.exit(2);
}

const r = spawnSync('npx', ['stryker', 'run'],
  { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', shell: true });

if (r.status !== 0) {
  console.log('\n  Mutation score below the threshold in stryker.config.json, or the run failed.');
  console.log('  A surviving mutant is a change to the source that no test noticed.');
  process.exit(1);
}
