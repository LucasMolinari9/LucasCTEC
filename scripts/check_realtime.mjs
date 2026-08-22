// check_realtime.mjs — Checagem VIVA da sincronização do Realtime (RT_TABLES ↔ banco).
//
// O teste offline tests/realtime.test.js garante que o lado do JS é consistente
// (VIEW_TABLES ⊆ RT_TABLES e RT_TABLES == a lista esperada), mas essa lista esperada é
// mantida À MÃO — pode driftar da publicação real do Postgres. Este script fecha essa
// lacuna: pergunta ao BANCO quais tabelas estão na publicação supabase_realtime e compara
// com RT_TABLES do app.js. Roda depois de mexer no Realtime (e vale como passo de CI).
//
// Uso (precisa de SUPABASE_TEST_AUDIT_DATABASE_URL no ambiente e `psql` no PATH — runbook em
// docs/planos/fase-3-hardening-moderado.md):
//   node scripts/check_realtime.mjs
//
// Requer Node 18+ e o binário `psql` no PATH. RT_TABLES continua lido do app.js (não é
// segredo); a consulta à publicação passa pelo login mínimo `divat_auditor_ci`, via
// scripts/lib/audit-database.mjs — desde esta migração este gate audita o projeto de TESTE
// (gontnlfmothfglssbyyk), não mais produção. Ver docs/seguranca.md § 10.
// Sai com código 0 se bate, 1 se há divergência, erro ou credencial/conexão recusada.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfiguracaoAuditora, executarFuncaoComoArray, AuditDatabaseError } from './lib/audit-database.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function extrair(html, re, oquê) {
  const m = re.exec(html);
  if (!m) { console.error(`Não achei ${oquê} no app.js.`); process.exit(1); }
  return m[1];
}

const html = await readFile(join(ROOT, 'app.js'), 'utf8');

// RT_TABLES é um array de string literais; pega o bloco e extrai os nomes entre aspas.
const bloco = extrair(html, /const RT_TABLES\s*=\s*\[([\s\S]*?)\]/, 'RT_TABLES');
const rtTables = [...bloco.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();

// Pergunta ao banco a publicação real via o auditor mínimo.
let doBanco;
try {
  const config = carregarConfiguracaoAuditora();
  doBanco = executarFuncaoComoArray(config, 'realtime_tables').sort();
} catch (e) {
  if (!(e instanceof AuditDatabaseError)) throw e;
  console.error(e.message);
  console.error('A função audit.realtime_tables() existe e divat_auditor_ci pode executá-la?');
  process.exit(1);
}

const soNoCodigo = rtTables.filter(t => !doBanco.includes(t));
const soNoBanco = doBanco.filter(t => !rtTables.includes(t));

if (soNoCodigo.length === 0 && soNoBanco.length === 0) {
  console.log(`✓ Realtime em sincronia: ${rtTables.length} tabelas (RT_TABLES == publicação supabase_realtime).`);
  process.exit(0);
}

console.error('✗ DRIFT entre RT_TABLES (app.js) e a publicação supabase_realtime do banco:');
if (soNoCodigo.length) console.error(`  Em RT_TABLES mas NÃO na publicação: ${soNoCodigo.join(', ')}`);
if (soNoBanco.length) console.error(`  Na publicação mas NÃO em RT_TABLES: ${soNoBanco.join(', ')}`);
console.error('Corrija: alter publication supabase_realtime add/drop table ...  e/ou ajuste RT_TABLES.');
process.exit(1);
