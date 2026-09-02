// odd-one-out — komunikaty w dwóch językach / messages in two languages.
//
// WSZYSTKIE napisy widoczne dla człowieka siedzą TUTAJ, nie w detektorach.
// Detektor woła `t('klucz', argumenty)` i nie wie, w jakim języku pisze.
// Rozsypanie tłumaczeń po plikach kończy się tym, że połowa wyniku zostaje
// w jednym języku — a to widać dopiero u kogoś, kto tego języka nie zna.
//
// Domyślny jest ANGIELSKI, bo repozytorium idzie na GitHub. `--lang pl` daje
// polski.
//
// NIE TŁUMACZYMY: nazw metod, typów, ścieżek, identyfikatorów zgłoszeń,
// nazw reguł ani nazw flag. To są dane, nie tekst.

const argv = process.argv.slice(2);
const iLang = argv.indexOf('--lang');
const LANG = (iLang >= 0 && argv[iLang + 1] && !argv[iLang + 1].startsWith('--')
  ? String(argv[iLang + 1]).toLowerCase()
  : 'en') === 'pl' ? 'pl' : 'en';

export const jezyk = LANG;

const S = {
  // ---------- wspólne ----------
  'root': { en: 'root=', pl: 'root=' },
  'settings': { en: 'settings: ', pl: 'ustawienia: ' },
  'savedRun': { en: 'run snapshot saved: {0}  (findings: {1})', pl: 'zapis przebiegu: {0}  (zgloszen: {1})' },
  'mutedByComment': { en: 'muted by comment: {0}', pl: 'wyciszone komentarzem: {0}' },
  'mutedByConfig': { en: 'muted by config file: {0}', pl: 'wyciszone plikiem konfiguracyjnym: {0}' },
  'diffVsPrevious': { en: 'diff vs previous run: NEW={0}  GONE={1}  CHANGED={2}  unchanged={3}   (--all shows the full list)', pl: 'roznica wobec poprzedniego przebiegu: NOWE={0}  ZNIKNELO={1}  ZMIENIONE={2}  bez zmian={3}   (--all pokazuje cala liste)' },
  'onlyNewShown': { en: '  (shown below: new and changed only)', pl: '  (pokazane ponizej: tylko nowe i zmienione)' },
  'exclusions': { en: 'exclusions={0}', pl: 'wykluczen={0}' },
  'defaults': { en: ' (defaults)', pl: ' (domyslne)' },
  'mutes': { en: '  mutes={0}', pl: '  wyciszen={0}' },
  'noReason': { en: '(no reason given)', pl: '(bez powodu)' },

  // ---------- sekcje zgłoszenia ----------
  'secInconsistent': { en: '   WHAT IS INCONSISTENT', pl: '   CO JEST NIESPOJNE' },
  'secElsewhere': { en: '   HOW IT IS DONE ELSEWHERE', pl: '   JAK ZROBIONO W POZOSTALYCH MIEJSCACH' },
  'secFix': { en: '   READY-MADE FIX (not applied)', pl: '   GOTOWA POPRAWKA (nie zastosowana)' },
  'muteHint': { en: '     If this is deliberate, add next to it:  // odd-one-out: ok — reason', pl: '     Jesli to swiadoma decyzja — dopisz obok:  // odd-one-out: ok — powod' },

  // ---------- ranking ----------
  'rankTitle': { en: '# odd-one-out / ranking', pl: '# odd-one-out / ranking' },
  'rankSnapshots': { en: 'snapshots={0} ({1})', pl: 'zapisow={0} ({1})' },
  'rankFindings': { en: 'findings={0}', pl: 'zgloszen={0}' },
  'rankSkipped': { en: '  non-finding states skipped={0}', pl: '  pominietych stanow niebedacych zgloszeniem={0}' },
  'rankFormula': { en: 'score = 100 x conventionality x population x rarity  (ordinal, not a percentage)', pl: 'ocena = 100 x konwencja x populacja x rzadkosc  (porzadkowa, nie procent)' },
  'rankComponents': { en: '       conventionality={0}%  population={1}  outliers={2}', pl: '       konwencja={0}%  populacja={1}  odstajacych={2}' },
  'rankAlsoViolates': { en: '       same site also violates: {0}', pl: '       to samo miejsce narusza takze: {0}' },
  'rankMore': { en: '\n   ... and {0} more', pl: '\n   ... i {0} dalszych' },
  'rankAge': { en: '       age: {0}', pl: '       wiek: {0}' },
  'rankStability': { en: '       stability: {0}  ({1})', pl: '       stabilnosc: {0}  ({1})' },
  'stabApplied': { en: 'stability component: applied to {0} of {1}', pl: 'skladnik stabilnosci: zastosowany do {0} z {1}' },
  'ageSignal': { en: 'age signal: boosted {0} of {1} (deviation newer than the median of conforming lines)', pl: 'sygnal wieku: podbitych {0} z {1} (odstepstwo nowsze niz mediana linii zgodnych z wzorcem)' },
  'ageNotRepo': { en: '!! {0} is not a git repository — age signal skipped', pl: '!! {0} nie jest repozytorium git — sygnal wieku pominiety' },
  'ageNoData': { en: 'no age data', pl: 'brak danych o wieku' },
  'ageDesc': { en: 'deviation {0}, pattern (median of {1}) {2}{3}', pl: 'odstepstwo {0}, wzorzec (mediana z {1}) {2}{3}' },
  'ageNewer': { en: '  -> NEWER, boost x{0}', pl: '  -> NOWSZE, podbicie x{0}' },
  'ageNotNewer': { en: '  -> not newer, no boost', pl: '  -> nie nowsze, bez podbicia' },

  // ---------- różnica ----------
  'diffTitle': { en: '# odd-one-out / diff between runs', pl: '# odd-one-out / roznica miedzy uruchomieniami' },
  'diffDetector': { en: 'detector={0}  root={1}', pl: 'detektor={0}  root={1}' },
  'diffWhen': { en: 'previous={0}   now={1}', pl: 'poprzednio={0}   teraz={1}' },
  'diffWarnDetectors': { en: '!! WARNING: different detectors ({0} vs {1})', pl: '!! UWAGA: rozne detektory ({0} vs {1})' },
  'diffWarnThresholds': { en: '!! WARNING: different thresholds — [{0}] vs [{1}]. The difference may come from the thresholds, not the code.', pl: '!! UWAGA: rozne progi — [{0}] vs [{1}]. Roznica moze pochodzic z progow, nie z kodu.' },
  'diffCounts': { en: 'NEW={0}  GONE={1}  CHANGED={2}  unchanged={3}', pl: 'NOWE={0}  ZNIKNELO={1}  ZMIENIONE={2}  bez zmian={3}' },
  'diffSecNew': { en: '## NEW — appeared since the previous run', pl: '## NOWE — doszly od ostatniego przebiegu' },
  'diffSecGone': { en: '## GONE — fixed or code removed', pl: '## ZNIKNELO — poprawione albo kod usuniety' },
  'diffSecChanged': { en: '## CHANGED — same site, different strength of evidence', pl: '## ZMIENIONE — to samo miejsce, inna sila dowodu' },
  'diffSecUnchanged': { en: '## UNCHANGED', pl: '## BEZ ZMIAN' },
  'diffNoChange': { en: 'No change since the previous run.', pl: 'Bez zmian wzgledem poprzedniego przebiegu.' },

  // ---------- detektor java ----------
  'javaTitle': { en: '# odd-one-out', pl: '# odd-one-out' },
  'javaStats': { en: 'files={0} parseErrors={1} units={2} distinctItems={3} frequent={4}', pl: 'plikow={0} bledowParsowania={1} jednostek={2} roznychPozycji={3} czestych={4}' },
  'javaParseErrors': { en: '  !! parse errors in: {0}', pl: '  !! bledy parsowania w: {0}' },
  'javaSieve': { en: 'sieve: signals [{0}]', pl: 'odsiewanie: sygnaly [{0}]' },
  'javaRules': { en: 'scope={0}  rules(minsup={1} minconf={2} maxviol={3})={4}', pl: 'zasieg={0}  regul(minsup={1} minconf={2} maxviol={3})={4}' },
  'javaRuleHead': { en: '## [{0}] {1} -> {2}   sup={3}/{4} conf={5}% odd={6}', pl: '## [{0}] {1} -> {2}   sup={3}/{4} conf={5}% odd={6}' },
  'javaStab': { en: ' stab={0} ({1})', pl: ' stab={0} ({1})' },
  'javaStabDesc': { en: '{0}/{1} subsets, {2}/{3} cumulative', pl: '{0}/{1} podzbiorow, {2}/{3} narastajaco' },
  'javaCallsHere': { en: '      calls here: {0}', pl: '      wywolania tutaj: {0}' },

  // ---------- detektor sql ----------
  'sqlTitle': { en: '# odd-one-out / SQL: revoke without grant execute in the same migration', pl: '# odd-one-out / SQL: revoke bez grant execute w tej samej migracji' },
  'sqlDir': { en: 'directory={0}', pl: 'katalog={0}' },
  'sqlStats': { en: 'migrations={0}  GRANT/REVOKE statements={1}', pl: 'migracji={0}  instrukcji GRANT/REVOKE={1}' },
  'sqlPairs': { en: '(migration, function) pairs with revoke+grant in the same file={0} (distinct functions: {1})  WITHOUT GRANT={2}', pl: 'par (migracja, funkcja) z revoke+grant w tym samym pliku={0} (roznych funkcji: {1})  BEZ GRANTU={2}' },
  'sqlTooFew': { en: 'Too few revoke+grant pairs ({0}, threshold={1}) to call it a convention. Reporting nothing.', pl: 'Za malo wystapien pary revoke+grant ({0}, prog={1}), by mowic o konwencji. Nie zglaszam nic.' },
  'sqlNoDeviations': { en: 'No deviations — every migration that revokes also grants EXECUTE.', pl: 'Brak odstepstw — kazda migracja odbierajaca uprawnienia nadaje tez EXECUTE.' },
  'sqlBody1': { en: '     {0}:{1} revokes permissions and stops there:', pl: '     {0}:{1} odbiera uprawnienia i na tym konczy:' },
  'sqlBody2': { en: '     Postgres grants EXECUTE to role `public` when a function is created, so', pl: '     Postgres nadaje EXECUTE roli `public` przy tworzeniu funkcji, wiec' },
  'sqlBody3': { en: '     `revoke ... from public` takes it away from EVERY role that had it only that way —', pl: '     `revoke ... from public` zabiera je KAZDEJ roli, ktora miala je tylko tak —' },
  'sqlBody4': { en: '     including service_role. After this migration only the owner can call it.', pl: '     w tym service_role. Po tej migracji funkcje moze wolac juz tylko wlasciciel.' },
  'sqlBody5': { en: '     Pattern: {0} functions in these migrations have both revoke AND grant, this one does not.', pl: '     Wzorzec: {0} funkcji w tych migracjach ma revoke I grant, ta jedna nie.' },
  'sqlFixedLater': { en: '     NOTE: a later migration already fixes this — {0}', pl: '     UWAGA: pozniejsza migracja juz to naprawia — {0}' },
  'sqlFixedLater2': { en: '     The finding stays as proof that the rule catches this bug at the moment it appears.', pl: '     Zgloszenie zostaje jako dowod, ze regula lapie ten blad w chwili wprowadzenia.' },
  'sqlFixNew': { en: '     // a NEW migration, not an edit to {0} —', pl: '     // NOWA migracja, nie dopisek do {0} —' },
  'sqlFixNew2': { en: '     //   that one is already deployed, and Supabase remembers migrations by name.', pl: '     //   tamta jest juz wdrozona, a Supabase pamieta migracje po nazwie.' },

  // ---------- detektor pom ----------
  'pomTitle': { en: '# odd-one-out / pom.xml: dead entry in dependencyManagement', pl: '# odd-one-out / pom.xml: martwy wpis w dependencyManagement' },
  'pomTrees': { en: 'trees={0} (artifacts in total: {1})', pl: 'drzewa={0} (artefaktow w sumie: {1})' },
  'pomProfiles': { en: 'profiles: {0}', pl: 'profile: {0}' },
  'pomProfilesNone': { en: 'none', pl: 'brak' },
  'pomActiveByDefault': { en: '   (* = activeByDefault)', pl: '   (* = activeByDefault)' },
  'pomCounts': { en: 'dependencyManagement entries={0}  live={1}  DEAD={2}  to check={3}', pl: 'wpisow w dependencyManagement={0}  zywych={1}  MARTWYCH={2}  do sprawdzenia={3}' },
  'pomSuspect1': { en: '!! TO CHECK (not a finding): {0}', pl: '!! DO SPRAWDZENIA (nie zgloszenie): {0}' },
  'pomSuspect2': { en: '   Not in the tree, but IS declared in <dependencies> ({0}:{1}).', pl: '   Nie ma go w drzewie, ale JEST zadeklarowany w <dependencies> ({0}:{1}).' },
  'pomSuspect3': { en: '   Most likely the tree comes from a different pom.xml revision than the one examined,', pl: '   Najpewniej drzewo pochodzi z innej rewizji pom.xml niz badana, albo profil' },
  'pomSuspect4': { en: '   or the profile was inactive during that run. Take the tree from THIS revision and repeat.', pl: '   byl nieaktywny przy tamtym przebiegu. Zdejmij drzewo z TEJ rewizji i powtorz.' },
  'pomNoDead': { en: 'No dead entries.', pl: 'Brak martwych wpisow.' },
  'pomBody1': { en: '     {0}:{1} pins the version of a dependency nobody declares.', pl: '     {0}:{1} przypina wersje zaleznosci, ktorej nikt nie deklaruje.' },
  'pomBody2': { en: '     It is not in the tree {0}.', pl: '     Nie ma jej w drzewie {0}.' },
  'pomScopeProfile': { en: '(profile {0}{1})', pl: '(profil {0}{1})' },
  'pomScopeMain': { en: '(main scope)', pl: '(zakres glowny)' },
  'pomActiveSuffix': { en: ', activeByDefault', pl: ', activeByDefault' },
  'pomInactiveSuffix': { en: ', NOT active by default', pl: ', NIEaktywny domyslnie' },
  'pomBody3': { en: '     In <dependencies> of this pom.xml: {0}. The entry does nothing.', pl: '     W <dependencies> tego pom.xml: {0}. Wpis nie robi nic.' },
  'pomYes': { en: 'present', pl: 'jest' },
  'pomNo': { en: 'ABSENT', pl: 'NIE MA' },
  'pomLive': { en: '     {0}:{1}   {2} — pinned and present in the tree{3}', pl: '     {0}:{1}   {2} — przypiete i obecne w drzewie{3}' },
  'pomAlsoDeclared': { en: ', declared in <dependencies>', pl: ', zadeklarowane w <dependencies>' },
  'pomNoComparable': { en: '     (no live entry in the same scope to compare with)', pl: '     (brak zywego wpisu w tym samym zakresie do porownania)' },
  'pomFix1': { en: '     // {0}:{1} — remove the whole block:', pl: '     // {0}:{1} — usun caly blok:' },
  'pomFix2': { en: '     // or, if this dependency WAS meant to be used, add it to <dependencies>', pl: '     // albo, jesli ta zaleznosc MIALA byc uzywana, dodaj ja do <dependencies>' },
  'pomFix3': { en: '     //   in the same profile (without <version> — dependencyManagement supplies it).', pl: '     //   w tym samym profilu (bez <version> — wersje da dependencyManagement).' },

  // ---------- detektor js ----------
  'jsTitle': { en: '# odd-one-out / js: a name called like a function, defined nowhere', pl: '# odd-one-out / js: nazwa wolana jak funkcja, nigdzie niezdefiniowana' },
  'jsStats': { en: 'pages with inline scripts={0}  inline blocks={1}  script files={2}', pl: 'stron ze skryptami inline={0}  blokow inline={1}  plikow skryptowych={2}' },
  'jsRule': { en: 'rule={0}  {1}', pl: 'regula={0}  {1}' },
  'jsOrphans': { en: 'ORPHANS={0}{1}', pl: 'SIEROT={0}{1}' },
  'jsBody1': { en: '     Called like a function ({0}x on this page), but the page does not know it:', pl: '     Nazwa wolana jak funkcja ({0} raz/y na tej stronie), ale strona jej nie zna:' },
  'jsBody2': { en: '     no definition in its inline scripts, none of the loaded <script src> files exposes it,', pl: '     nie ma definicji w jej skryptach inline, nie wystawia jej zaden z ladowanych', },
  'jsBody3': { en: '     and it is not a built-in.', pl: '     plikow <script src>, nie jest wbudowana.' },
  'jsBody4': { en: '     The page defines {0} other names and those are all recognised.', pl: '     Strona definiuje {0} innych nazw i te sa rozpoznane.' },
  'jsFix': { en: '     Remove the call or restore the definition. If it is a leftover from a removed', pl: '     Usun wywolanie albo przywroc definicje. Jesli to pozostalosc po usunietej' },
  'jsFix2': { en: '     function — delete line {0}:{1}.', pl: '     funkcji — usun linie {0}:{1}.' },

  // ---------- detektor deps ----------
  'depsTitle': { en: '# odd-one-out / category 5: dependencies spread inconsistently', pl: '# odd-one-out / kategoria 5: zaleznosci rozlozone niespojnie' },
  'depsStats': { en: 'classes={0} external ops={1} wrapped ops={2}', pl: 'klasy={0} operacji zewn.={1} operacji opakowanych={2}' },
  'depsThresholds': { en: 'thresholds: minvia={0} maxodd={1}', pl: 'progi: minvia={0} maxodd={1}' },
  'depsCounts': { en: 'divergences={0}  migrations in progress={1}  too little data={2}', pl: 'rozjazdow={0}  migracji w toku={1}  za malo danych={2}' },
  'depsNoDivergence': { en: '\n-> No divergence at these thresholds. What follows are NOT deviations —\n   they are states in which the tool has no grounds to report anything.', pl: '\n-> Zadnego rozjazdu przy tych progach. Ponizej to NIE sa odstepstwa —\n   to stany, w ktorych narzedzie nie ma podstaw, by cokolwiek zglosic.' },
  'depsHead': { en: '## [{0}] {1} — {2}: {3} classes via {4}, {5} directly', pl: '## [{0}] {1} — {2}: {3} klas przez {4}, {5} bezposrednio' },
  'depsTooFew': { en: '     Too few occurrences to speak of a convention ({0} via the layer, threshold={1}). Come back when there are {1}.', pl: '     Za malo wystapien, by mowic o konwencji ({0} przez warstwe, prog={1}). Wroc, gdy bedzie ich {1}.' },
  'depsMigration': { en: '     Both routes are common — there is nothing to call a deviation.', pl: '     Obie drogi sa liczne — nie ma czego nazwac odstepstwem.' },
  'depsMigration2': { en: '     This is not a bug to fix in one place, but an unfinished move to {0}.', pl: '     To nie blad do poprawienia punktowo, tylko niedokonczone przejscie na {0}.' },
  'depsBody': { en: '     {0}.{1} is called directly in {2} class(es), although {3} others go via {4}.', pl: '     {0}.{1} jest wolane wprost w {2} klasie/ach, choc {3} innych idzie przez {4}.' },
  'depsLayer': { en: '     layer: {0}:{1}', pl: '     warstwa: {0}:{1}' },
  'depsCheckReturn': { en: '     // check the return type — {0}', pl: '     // sprawdz zwracany typ — {0}' },
  'depsAddImport': { en: '     // add the import: import {0};', pl: '     // dolóz import: import {0};' },
};

export function t(klucz, ...args) {
  const wpis = S[klucz];
  if (!wpis) return '[[' + klucz + ']]';          // brak klucza widać od razu
  let out = wpis[LANG] !== undefined ? wpis[LANG] : wpis.en;
  args.forEach((a, i) => { out = out.split('{' + i + '}').join(String(a)); });
  return out;
}

export default t;
