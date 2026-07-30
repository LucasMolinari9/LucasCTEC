'use strict';
/* Guarda anti-drift do Realtime (atualização ao vivo).
   Rode: node realtime.test.js   (ou, melhor, node check.js para rodar tudo).

   Contexto: a atualização ao vivo de cada card depende de 3 coisas alinhadas:
     (1) a view declarar em VIEW_TABLES TODAS as tabelas que seu loader lê (incl. lookups);
     (2) toda tabela citada em VIEW_TABLES estar assinada em RT_TABLES (o canal);
     (3) toda tabela de RT_TABLES estar na publicação supabase_realtime do banco.
   Em jul/2026 isso estava quebrado: VIEW_TABLES incompleto (bug de código) e 6 tabelas fora
   da publicação (bug de banco). Este teste guarda (1) e (2), que vivem no app.js. O item
   (3) é do banco (offline aqui) — confira com a query documentada abaixo em PUB_ESPERADA. */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}
const setEq = (a, b) => { const A=new Set(a), B=new Set(b); return A.size===B.size && [...A].every(x=>B.has(x)); };

// --- extrai os literais VIEW_TABLES e RT_TABLES direto do app.js ---
function extrai(re, nome){
  const m = re.exec(html);
  if (!m){ ok(false, `achou o literal ${nome} no app.js`); return null; }
  // A regra divat-eval-quebra-csp existe porque a CSP de produção (script-src 'self', sem
  // 'unsafe-eval') mata new Function no NAVEGADOR. Este arquivo roda só no Node (é teste,
  // não é servido), e o alvo é um literal puro — string/array — recortado do app.js.
  // nosemgrep: divat-eval-quebra-csp
  try { return (new Function('return ' + m[1]))(); }   // literais puros (strings/arrays), sem chamadas
  catch(e){ ok(false, `parse do literal ${nome}`, e.message); return null; }
}
const VIEW_TABLES = extrai(/const VIEW_TABLES = (\{[\s\S]*?\});/, 'VIEW_TABLES');
const RT_TABLES   = extrai(/const RT_TABLES = (\[[\s\S]*?\]);/,   'RT_TABLES');

// --- mapa canônico esperado (auditoria jul/2026): tabelas realmente lidas por cada loader,
//     incluindo lookups. Se você alterar VIEW_TABLES no app.js, atualize aqui também —
//     é a guarda que impede a divergência de voltar sem ninguém perceber. ---
const EXPECTED = {
  historicoLinha:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste','tabela_vista_teste'],
  itinerarios:['itinerario_teste','municipio_teste','codempresa_teste'],
  quadroHorarios:['qh_intervalo_teste','qh_predeterminado_teste','qh_teste','tarifa_atual_teste','origem_teste','codempresa_teste','tabela_vista_teste'],
  tarifas:['tarifa_atual_teste','codempresa_teste'],
  frota:['qh_teste','codempresa_teste'],
  estrutura:['tabela_vista_teste','tarifa_atual_teste','itinerario_teste','qh_intervalo_teste','qh_predeterminado_teste','qh_teste','origem_teste','municipio_teste','codempresa_teste'],
  empresasRegulares:['tabela_vista_teste','codempresa_teste'],
  historicoEmpresa:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste'],
  ligacoesPorEmpresa:['tabela_vista_teste','codempresa_teste'],
  secoesPorEmpresa:['tarifa_atual_teste'],
  ligacoesPorLogradouro:['itinerario_teste','tabela_vista_teste','codempresa_teste','municipio_teste'],
  municipioRegiao:['municipio_teste','itinerario_teste','tabela_vista_teste','codempresa_teste'],
  ligacoesPorTerminal:['qh_intervalo_teste','qh_predeterminado_teste','origem_teste','tabela_vista_teste','codempresa_teste','municipio_teste','itinerario_teste'],
  secoesPorLigacao:['tarifa_atual_teste'],
  frotaPorEmpresa:['qh_teste','codempresa_teste'],
  portarias:['portaria_teste'],
  localidades:['tabela_vista_teste','tarifa_atual_teste','itinerario_teste','municipio_teste','localidades_teste','codempresa_teste'],
};

// --- tabelas que DEVEM estar na publicação supabase_realtime do banco (as 14 usadas). Verifique
//     no banco com: select tablename from pg_publication_tables where pubname='supabase_realtime'; ---
const PUB_ESPERADA = ['tabela_vista_teste','itinerario_teste','qh_teste','qh_intervalo_teste',
  'qh_predeterminado_teste','tarifa_atual_teste','municipio_teste','origem_teste','localidades_teste',
  'evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste','portaria_teste'];

if (VIEW_TABLES && RT_TABLES){
  // 1) VIEW_TABLES do app.js bate, view a view, com o mapa canônico (ordem não importa)
  console.log('VIEW_TABLES == mapa canônico');
  const vistas = new Set([...Object.keys(EXPECTED), ...Object.keys(VIEW_TABLES)]);
  for (const v of vistas){
    ok(VIEW_TABLES[v] && EXPECTED[v] && setEq(VIEW_TABLES[v], EXPECTED[v]),
      `VIEW_TABLES.${v}`,
      `index=${JSON.stringify(VIEW_TABLES[v])} esperado=${JSON.stringify(EXPECTED[v])}`);
  }

  // 2) toda tabela citada em qualquer VIEW_TABLES precisa estar assinada em RT_TABLES
  console.log('VIEW_TABLES ⊆ RT_TABLES (tudo que dispara reload está assinado)');
  const rt = new Set(RT_TABLES);
  for (const [v, tabs] of Object.entries(VIEW_TABLES)){
    for (const t of tabs){
      ok(rt.has(t), `${v} → "${t}" está em RT_TABLES`);
    }
  }

  // 3) RT_TABLES == conjunto que deve estar na publicação (mantém o JS e o banco em sincronia)
  console.log('RT_TABLES == conjunto esperado na publicação do banco');
  ok(setEq(RT_TABLES, PUB_ESPERADA), 'RT_TABLES == PUB_ESPERADA (14 tabelas)',
    `RT_TABLES=${JSON.stringify([...RT_TABLES].sort())}`);
}

console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
