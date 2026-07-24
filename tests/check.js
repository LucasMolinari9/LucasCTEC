'use strict';
/* GATE DE PRÉ-PUBLICAÇÃO — rode `node tests/check.js` antes de publicar.
   Faz, em sequência, e agrega o resultado:
     [1] valida a SINTAXE do app.js (sem executar o código) e garante que o
         index.html NÃO tem <script> inline (a CSP publica script-src 'self');
     [2] guarda anti-drift: confere que as funções copiadas nos *.harness.js ainda
         existem iguais no app.js (avisa se a original mudou e a cópia ficou velha);
     [3] roda todos os *.test.js desta pasta.
   Sai com código != 0 se QUALQUER etapa falhar. Node puro, sem dependências. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;
const INDEX = path.join(__dirname, '..', 'index.html');
const APPJS = path.join(__dirname, '..', 'app.js');

let problems = 0;
const fail   = msg => { console.log('  ✗', msg); problems++; };
const okline = msg => console.log('  ✓', msg);

const html = fs.readFileSync(INDEX, 'utf8');
const js   = fs.readFileSync(APPJS, 'utf8');

// ---------- [1] sintaxe do app.js + nenhum <script> inline no index.html ----------
console.log('\n[1] Sintaxe do app.js + index.html sem <script> inline');
try {
  new vm.Script(js, { filename: 'app.js' });                    // só COMPILA — não roda
  okline(`sintaxe OK (${js.split('\n').length} linhas em app.js)`);
} catch (e){
  const first = String(e.stack || '').split('\n')[0];
  const mm = /:(\d+)\s*$/.exec(first);
  fail(`erro de sintaxe no app.js${mm ? ` (linha ${mm[1]})` : ''}: ${e.message}`);
}
// guard anti-regressão da CSP: script-src é 'self' (sem 'unsafe-inline') —
// qualquer <script> sem src= no index.html seria BLOQUEADO no navegador.
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
  fail('<script> inline no index.html — a CSP (script-src \'self\') bloqueia; mova o código para o app.js.');
} else {
  okline('index.html sem <script> inline (compatível com a CSP)');
}

// ---------- [1b] nenhuma chave service_role nos arquivos servidos ----------
// A chave anon (role=anon) é pública por design; a service_role IGNORA o RLS e
// jamais pode ir para um arquivo entregue ao cliente. Decodifica cada JWT do
// index.html e do app.js e falha se algum tiver role=service_role (sem
// falso-positivo na palavra "service_role" de comentários/docs).
console.log('\n[1b] Segredo: nenhuma JWT service_role no index.html/app.js');
{
  const jwts = (html + '\n' + js).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g) || [];
  let vazou = false;
  for (const tok of jwts){
    try {
      const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (payload && payload.role === 'service_role') vazou = true;
    } catch (_) { /* token não-JWT: ignora */ }
  }
  if (vazou) fail('CHAVE service_role embutida em arquivo servido — ignora o RLS, NÃO publicar.');
  else okline(`ok (${jwts.length} token(s) JWT, nenhum service_role)`);
}

// ---------- [2] guarda anti-drift ----------
console.log('\n[2] Guarda anti-drift (cópias verbatim batem com o app.js)');
// trecho distintivo de cada função copiada nos harness; se sumir do app.js,
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
  ['situacaoHTML',         'const situacaoHTML = r => r.cancelado'],
  ['isLinhaAtiva',         'const isLinhaAtiva = r => !r.cancelado && !r.paralisado;'],
  ['isVigente',            'const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;'],
  ['norm',                 "normalize('NFD')"],
  ['yearOf',               'parseInt(String(d).slice(0,4),10)'],
  ['matchEvent',           'function matchEvent(r, c){'],
  ['groupBy',              'if(!m.has(k))m.set(k,[])'],
  ['countBy',              '(m.get(k)||0)+1'],
  ['fmtMoney',             'minimumFractionDigits:2,maximumFractionDigits:2'],
  ['classifyMunLines',     'function classifyMunLines('],
  ['localidadesQueCasam',  'function localidadesQueCasam('],
  ['orIlike',              "const orIlike = (cols, termos) => 'or=('"],
  ['municipiosExatos',     'function municipiosExatos(ibge, termos){'],
  ['rowMatchesActiveLine', 'function rowMatchesActiveLine(payload){'],
  ['beginGen',              'view._gen = (view._gen || 0) + 1;'],
  ['isCurrentGen',          'return !!view && gen === view._gen;'],
  ['commitViewResult',      "if (!isCurrentGen(view, gen)) return false;"],
  ['pushDetail',            "view._detail = { pdfHTML: view.pdfHTML };"],
  ['popDetail',             "view.pdfHTML = view._detail.pdfHTML;"],
  ['sbFetch',              "async function sbFetch(table, qs = '') {"],
  ['resumoRelatorio',      'function resumoRelatorio(rows){'],
  ['resumoFrota',          'function resumoFrota(rows){'],
  ['pageBounds',           'const p = Math.min(Math.max(1, (page|0) || 1), totalPages);'],
];
for (const [name, snippet] of canon){
  if (js.includes(snippet)) okline(`${name}`);
  else fail(`harness DESATUALIZADO p/ "${name}": não achei no app.js → ${snippet}`);
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
