'use strict';
/* GATE DE PRÉ-PUBLICAÇÃO — rode `node tests/check.js` antes de publicar.
   Faz, em sequência, e agrega o resultado:
     [1] valida a SINTAXE do <script> inline do index.html (sem executar o código);
     [2] guarda anti-drift: confere que as funções copiadas nos *.harness.js ainda
         existem iguais no index.html (avisa se a original mudou e a cópia ficou velha);
     [3] roda todos os *.test.js desta pasta.
   Sai com código != 0 se QUALQUER etapa falhar. Node puro, sem dependências. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;
const INDEX = path.join(__dirname, '..', 'index.html');

let problems = 0;
const fail   = msg => { console.log('  ✗', msg); problems++; };
const okline = msg => console.log('  ✓', msg);

const html = fs.readFileSync(INDEX, 'utf8');

// ---------- [1] sintaxe do <script> inline ----------
console.log('\n[1] Sintaxe do <script> inline (index.html)');
// pega só o bloco bare <script>…</script> (os de CDN têm src=, então não casam)
const m = /<script>\s*\n([\s\S]*?)<\/script>/.exec(html);
if (!m){
  fail('não encontrei o bloco <script> inline (sem src) no index.html');
} else {
  const code = m[1];
  const startIdx = m.index + m[0].indexOf(code);
  const startLine = html.slice(0, startIdx).split('\n').length; // linha real do início do JS
  try {
    new vm.Script(code, { filename: 'index.html' });            // só COMPILA — não roda
    okline(`sintaxe OK (${code.split('\n').length} linhas de JS inline)`);
  } catch (e){
    // mapeia a linha do erro (relativa ao trecho) para a linha real do index.html
    const first = String(e.stack || '').split('\n')[0];
    const mm = /:(\d+)\s*$/.exec(first);
    const real = mm ? (startLine + parseInt(mm[1], 10) - 1) : null;
    fail(`erro de sintaxe no JS inline${real ? ` (≈ index.html linha ${real})` : ''}: ${e.message}`);
  }
}

// ---------- [1b] nenhuma chave service_role embutida no HTML servido ----------
// A chave anon (role=anon) é pública por design; a service_role IGNORA o RLS e
// jamais pode ir para um arquivo entregue ao cliente. Decodifica cada JWT do
// index.html e falha se algum tiver role=service_role (sem falso-positivo na
// palavra "service_role" de comentários/docs).
console.log('\n[1b] Segredo: nenhuma JWT service_role no index.html');
{
  const jwts = html.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g) || [];
  let vazou = false;
  for (const tok of jwts){
    try {
      const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (payload && payload.role === 'service_role') vazou = true;
    } catch (_) { /* token não-JWT: ignora */ }
  }
  if (vazou) fail('CHAVE service_role embutida no index.html — ignora o RLS, NÃO publicar.');
  else okline(`ok (${jwts.length} token(s) JWT no HTML, nenhum service_role)`);
}

// ---------- [2] guarda anti-drift ----------
console.log('\n[2] Guarda anti-drift (cópias verbatim batem com o index.html)');
// trecho distintivo de cada função copiada nos harness; se sumir do index.html,
// a cópia no harness provavelmente ficou desatualizada.
const canon = [
  ['fmtCode',              's.slice(3,6)'],
  ['fmtTime',             'm[1]}:${m[2]}'],
  ['fmtDate',       'm[3]}/${m[2]}/${m[1]}'],
  ['esc',                  "'&':'&amp;'"],
  ['enc',                  'const enc = s => encodeURIComponent(s);'],
  ['orDash',               "==='') ? '—'"],
  ['fmtLineName',          "split(' - ').map(p => p.replace(/ /g, '&nbsp;'))"],
  ['byCodlinha',           "localeCompare(String(b.codlinha||''), undefined, { numeric:true })"],
  ['boolChip',             'chip chip-on'],
  ['isLinhaAtiva',         'const isLinhaAtiva = r => !r.cancelado && !r.paralisado;'],
  ['norm',                 "normalize('NFD')"],
  ['yearOf',               'parseInt(String(d).slice(0,4),10)'],
  ['matchEvent',           'function matchEvent(r, c){'],
  ['groupBy',              'if(!m.has(k))m.set(k,[])'],
  ['countBy',              '(m.get(k)||0)+1'],
  ['fmtMoney',             'minimumFractionDigits:2,maximumFractionDigits:2'],
  ['rowMatchesActiveLine', 'function rowMatchesActiveLine(payload){'],
  ['sbFetch',              "async function sbFetch(table, qs = '') {"],
  ['resumoRelatorio',      'function resumoRelatorio(rows){'],
  ['resumoFrota',          'function resumoFrota(rows){'],
];
for (const [name, snippet] of canon){
  if (html.includes(snippet)) okline(`${name}`);
  else fail(`harness DESATUALIZADO p/ "${name}": não achei no index.html → ${snippet}`);
}

// ---------- [3] roda os testes unitários ----------
console.log('\n[3] Testes unitários (*.test.js)');
const testFiles = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js')).sort();
if (!testFiles.length) fail('nenhum arquivo *.test.js encontrado');
for (const f of testFiles){
  const res = spawnSync(process.execPath, [path.join(TESTS_DIR, f)], { encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  const placar = (out.match(/==== PLACAR: ([\d/]+) ====/) || [])[1] || '?';
  if (res.status === 0){
    okline(`${f} — placar ${placar}`);
  } else {
    fail(`${f} — FALHOU (placar ${placar}, exit ${res.status})`);
    out.split('\n').filter(l => /FALHA|FAIL|Error/.test(l)).forEach(l => console.log('       ', l));
  }
}

// ---------- resumo ----------
console.log('\n' + (problems ? `✗ check.js: ${problems} problema(s) — NÃO publique.` : '✓ check.js: tudo verde.'));
process.exit(problems ? 1 : 0);
