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
import { t } from './lang.mjs';

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
const { loadConfig } = await import('./config.mjs');
const cfg = loadConfig(argv, DIR);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql') && !cfg.isExcluded(path.join(DIR, f))).sort();
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
console.log(t('sqlTitle'));
console.log(t('sqlDir', DIR));
console.log(t('sqlStats', files.length, perFile.reduce((s, p) => s + p.acls.length, 0)));
const distinct = new Set(both.map(b => b.name)).size;
console.log(t('sqlPairs', both.length, distinct, onlyRevoke.length));
console.log('');

// ---- zapis przebiegu i roznica ----
const { przygotuj, naglowekRoznicy } = await import('./snapshot.mjs');
const w = przygotuj(argv, {
  detector: 'sql',
  root: DIR,
  cfg,
  args: argv.slice(1),
  counts: { migracje: files.length, parRevokeGrant: both.length, funkcjiZWzorcem: distinct, bezGrantu: onlyRevoke.length },
  findings: onlyRevoke.map(o => ({
    rule: 'revoke-bez-grant-execute',
    file: o.file,
    anchor: o.name,
    line: o.a.line,
    label: o.name + ' — revoke bez grant execute w tej samej migracji',
    meta: { via: distinct, odd: onlyRevoke.length },
  })),
});
const pokaz = new Set(w.doPokazania.map(f => f.file + ':' + f.line));
naglowekRoznicy(w);
console.log('');
process.exitCode = w.nowych ? 1 : 0;

if (both.length < MINCONV) {
  console.log(t('sqlTooFew', both.length, MINCONV));
} else if (onlyRevoke.length === 0) {
  console.log(t('sqlNoDeviations'));
} else {
  onlyRevoke.filter(o => pokaz.has(o.file + ':' + o.a.line)).forEach((o, i) => {
    const fixed = grantedLater.get(o.name);
    console.log('## [' + (i + 1) + '] ' + o.name + '  —  ' + rel(o.file));
    console.log('');
    console.log(t('secInconsistent'));
    console.log(t('sqlBody1', rel(o.file), o.a.line));
    console.log('       ' + o.a.text);
    console.log(t('sqlBody2'));
    console.log(t('sqlBody3'));
    console.log(t('sqlBody4'));
    console.log(t('sqlBody5', distinct));
    console.log('');
    console.log(t('secElsewhere'));
    for (const b of both.slice(0, 2)) {
      console.log('     ' + rel(b.file) + ':' + b.a.line);
      console.log('       ' + b.a.text);
    }
    console.log('');
    console.log(t('secFix'));
    if (fixed && fixed.file > o.file) {
      console.log(t('sqlFixedLater', rel(fixed.file)));
      console.log('       grant execute ... to ' + fixed.roles.join(', '));
      console.log(t('sqlFixedLater2'));
    } else {
      console.log(t('sqlFixNew', rel(o.file)));
      console.log(t('sqlFixNew2'));
      console.log('     grant execute on function ' + o.name + ' ' + (o.a.args || '(...)') +
        ' to service_role;');
    }
    console.log('');
  });
}

