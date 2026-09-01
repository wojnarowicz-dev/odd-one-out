// odd-one-out / para SQL — revoke bez grant execute w tej samej migracji.
//
// PARSOWANIE: nie tree-sitter. GRANT/REVOKE to regularne DDL, a jedyna realna
// pulapka skladniowa w migracjach Postgresa to cytowanie dolarowe ($$ ... $$),
// w ktorym siedza cialla plpgsql pelne srednikow. Naiwny split po ';' rozjezdza
// sie na pierwszej funkcji. Ponizszy tokenizer obsluguje: $tag$, '...' (z ''),
// komentarze -- i /* */. To swiadomy wybor, nie brak parsera.
//
// REGULA: migracja, ktora odbiera uprawnienia do funkcji, ale nie nadaje
// EXECUTE zadnej roli w TYM SAMYM pliku. Postgres nadaje EXECUTE roli `public`
// przy tworzeniu funkcji, wiec `revoke ... from public` zabiera je wszystkim,
// ktorzy mieli je tylko tak — lacznie z service_role.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const DIR = argv[0];
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const MINCONV = +flag('minconv', 3);   // ile migracji musi trzymać wzorzec, by to była konwencja

// --- podzial na instrukcje, swiadomy cytowania dolarowego ---
function statements(sql) {
  const out = [];
  let buf = '', i = 0, start = 0;
  const n = sql.length;
  const push = () => { if (buf.trim()) out.push({ text: buf.trim(), start }); buf = ''; };
  while (i < n) {
    if (!buf.trim()) start = i;
    const c = sql[i], c2 = sql.slice(i, i + 2);
    if (c2 === '--') { const j = sql.indexOf('\n', i); const e = j < 0 ? n : j; buf += ' '; i = e; continue; }
    if (c2 === '/*') { const j = sql.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; buf += ' '; i = e; continue; }
    if (c === "'") {
      let j = i + 1;
      while (j < n) { if (sql[j] === "'") { if (sql[j + 1] === "'") j += 2; else { j++; break; } } else j++; }
      buf += sql.slice(i, j); i = j; continue;
    }
    const dq = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dq) {
      const tag = dq[0];
      const j = sql.indexOf(tag, i + tag.length);
      const e = j < 0 ? n : j + tag.length;
      buf += sql.slice(i, e); i = e; continue;
    }
    if (c === ';') { push(); i++; continue; }
    buf += c; i++;
  }
  push();
  return out;
}

const norm = s => s.replace(/\s+/g, ' ').trim();

// --- wyciagniecie GRANT / REVOKE ---
function acl(stmt) {
  const s = norm(stmt);
  const m = s.match(/^(grant|revoke)\s+(?:grant\s+option\s+for\s+)?(.+?)\s+on\s+(function|procedure|routine|table|sequence|schema)\s+([^\s(]+)\s*(\([^)]*\))?/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const privs = m[2].toLowerCase();
  const objType = m[3].toLowerCase();
  const name = m[4].toLowerCase();
  const args = m[5] ? norm(m[5]) : '';
  const rolesM = s.match(kind === 'grant' ? /\bto\s+(.+)$/i : /\bfrom\s+(.+)$/i);
  const roles = rolesM ? rolesM[1].split(',').map(r => r.trim().toLowerCase()).filter(Boolean) : [];
  return { kind, privs, objType, name, args, roles, text: s };
}

// --- wczytanie migracji ---
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const perFile = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(DIR, f), 'utf8');
  const acls = [];
  for (const st of statements(sql)) {
    const a = acl(st.text);
    if (a) acls.push({ ...a, file: f, line: sql.slice(0, st.start).split('\n').length });
  }
  perFile.push({ file: f, acls });
}

// --- konwencja i odstepstwa, liczone per migracja ---
const FN = new Set(['function', 'procedure', 'routine']);
const both = [], onlyRevoke = [];
for (const pf of perFile) {
  const revoked = new Map(), granted = new Set();
  for (const a of pf.acls) {
    if (!FN.has(a.objType)) continue;
    if (a.kind === 'revoke') { if (!revoked.has(a.name)) revoked.set(a.name, a); }
    else if (/execute|all/.test(a.privs)) granted.add(a.name);
  }
  for (const [name, a] of revoked)
    (granted.has(name) ? both : onlyRevoke).push({ file: pf.file, name, a });
}

// --- czy pozniejsza migracja to naprawila ---
const grantedLater = new Map();
for (const pf of perFile)
  for (const a of pf.acls)
    if (a.kind === 'grant' && FN.has(a.objType) && /execute|all/.test(a.privs))
      if (!grantedLater.has(a.name)) grantedLater.set(a.name, { file: pf.file, roles: a.roles });

const rel = f => f;
console.log('# odd-one-out / SQL: revoke bez grant execute w tej samej migracji');
console.log('katalog=' + DIR);
console.log('migracji=' + files.length + '  instrukcji GRANT/REVOKE=' +
  perFile.reduce((s, p) => s + p.acls.length, 0));
const distinct = new Set(both.map(b => b.name)).size;
console.log('par (migracja, funkcja) z revoke+grant w tym samym pliku=' + both.length +
  ' (roznych funkcji: ' + distinct + ')  BEZ GRANTU=' + onlyRevoke.length);
console.log('');

if (both.length < MINCONV) {
  console.log('Za malo wystapien pary revoke+grant (' + both.length + ', prog=' + MINCONV +
    '), by mowic o konwencji. Nie zglaszam nic.');
} else if (onlyRevoke.length === 0) {
  console.log('Brak odstepstw — kazda migracja odbierajaca uprawnienia nadaje tez EXECUTE.');
} else {
  onlyRevoke.forEach((o, i) => {
    const fixed = grantedLater.get(o.name);
    console.log('## [' + (i + 1) + '] ' + o.name + '  —  ' + rel(o.file));
    console.log('');
    console.log('   CO JEST NIESPOJNE');
    console.log('     ' + rel(o.file) + ':' + o.a.line + ' odbiera uprawnienia i na tym konczy:');
    console.log('       ' + o.a.text);
    console.log('     Postgres nadaje EXECUTE roli `public` przy tworzeniu funkcji, wiec');
    console.log('     `revoke ... from public` zabiera je KAZDEJ roli, ktora miala je tylko tak —');
    console.log('     w tym service_role. Po tej migracji funkcje moze wolac juz tylko wlasciciel.');
    console.log('     Wzorzec: ' + distinct + ' funkcji w tych migracjach ma revoke I grant, ta jedna nie.');
    console.log('');
    console.log('   JAK ZROBIONO W POZOSTALYCH MIEJSCACH');
    for (const b of both.slice(0, 2)) {
      console.log('     ' + rel(b.file) + ':' + b.a.line);
      console.log('       ' + b.a.text);
    }
    console.log('');
    console.log('   GOTOWA POPRAWKA (nie zastosowana)');
    if (fixed && fixed.file > o.file) {
      console.log('     UWAGA: pozniejsza migracja juz to naprawia — ' + rel(fixed.file));
      console.log('       grant execute ... to ' + fixed.roles.join(', '));
      console.log('     Zgloszenie zostaje jako dowod, ze regula lapie ten blad w chwili wprowadzenia.');
    } else {
      console.log('     // NOWA migracja, nie dopisek do ' + rel(o.file) + ' —');
      console.log('     //   tamta jest juz wdrozona, a Supabase pamieta migracje po nazwie.');
      console.log('     grant execute on function ' + o.name + ' ' + (o.a.args || '(...)') +
        ' to service_role;');
    }
    console.log('');
  });
}
