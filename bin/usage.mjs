// odd-one-out — the help screen.
//
// WHY A SEPARATE FILE. The help text used to be hard-coded in the dispatcher
// and was the only output that bypassed the dictionary — so with English as the
// default the first screen a visitor from GitHub saw was in Polish. That is not
// a matter of style: help is the only output a person reads BEFORE deciding
// whether to run the tool a second time.
import { t } from '../src/lang.mjs';

export function help(COMMANDS, code = 0) {
  const w = code === 0 ? console.log : console.error;

  w(t('helpTagline'));
  w('');
  w(t('helpPrinciple'));
  w('');
  w(t('helpUsage'));
  w('  odd-one-out <command> [arguments]');
  w('');
  w(t('helpLangSec'));
  w(t('helpLangEn'));
  w(t('helpLangPl'));
  w('');
  w(t('helpCommands'));
  for (const [name, c] of Object.entries(COMMANDS)) {
    w('  ' + name.padEnd(6) + c.arg);
    w('         ' + t(c.descKey));
    if (c.options) w(t('helpOptions', c.options));
  }
  w('');

  // THE PATH TO THE READABLE OUTPUT. It used to be missing entirely: the
  // examples showed a single detector invocation, while the only output that is
  // actually readable — the merged ranking — was never mentioned in the help.
  w(t('helpStart'));
  w(t('helpStart1'));
  w('       odd-one-out java ./src/main/java --json .odd-one-out/java.json');
  w(t('helpStart2'));
  w('       odd-one-out rank .odd-one-out/java.json');
  w(t('helpStart3'));
  w('');
  w(t('helpExamples'));
  w('  odd-one-out js    ./src/web');
  w('  odd-one-out sql   ./supabase/migrations');
  w('  odd-one-out deps  ./src/main/java');
  w('  odd-one-out pom   --pom ./pom.xml --tree ./deptree.txt');
  w('');
  w(t('helpReading'));
  w(t('helpReading1'));
  w(t('helpReading2'));
  w(t('helpReading3'));
  w(t('helpReading4'));

  process.exit(code);
}
