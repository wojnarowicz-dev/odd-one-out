// odd-one-out — ekran pomocy.
//
// PO CO OSOBNY PLIK. Tekst pomocy był zaszyty w dyspozytorze i jako jedyny nie
// przechodził przez słownik — przy domyślnym angielskim pierwszy ekran, jaki
// widział ktoś z GitHuba, był po polsku. To nie jest drobiazg stylistyczny:
// pomoc jest jedynym wyjściem, które człowiek ogląda ZANIM zdecyduje, czy
// uruchomić narzędzie drugi raz.
import { t } from '../src/lang.mjs';

export function pomoc(COMMANDS, kod = 0) {
  const w = kod === 0 ? console.log : console.error;

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
  for (const [nazwa, c] of Object.entries(COMMANDS)) {
    w('  ' + nazwa.padEnd(6) + c.arg);
    w('         ' + t(c.opisKey));
    if (c.opcje) w(t('helpOptions', c.opcje));
  }
  w('');

  // SCIEZKA DO CZYTELNEGO WYJSCIA. Wczesniej jej nie bylo: przyklady pokazywaly
  // pojedyncze wywolanie detektora, a jedyne wyjscie, ktore da sie czytac —
  // scalony ranking — nie bylo w pomocy wspomniane ani razu.
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

  process.exit(kod);
}
