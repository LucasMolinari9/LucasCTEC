// check_deriva.mjs — Checagem VIVA de deriva docs × banco (a guarda que faltava).
//
// As 8 divergências da auditoria de 26/07/2026 nasceram todas do mesmo jeito: um fato do
// banco copiado à mão para um doc (CLAUDE.md, docs/schema.md, docs/seguranca.md,
// docs/backup_schema.sql) e nunca mais conferido. Este script fecha o laço para os fatos
// que a API pública consegue ver: chama a RPC `divat_api_shape()` (SECURITY INVOKER,
// EXECUTE p/ anon — rodando como anon devolve exatamente a visão de anon: tabelas, colunas
// e RPCs executáveis) e compara com o que os docs afirmam. O plano original era o OpenAPI
// do PostgREST (GET ${SB_URL}/rest/v1/), mas neste projeto esse endpoint é restrito à
// service_role (HTTP 401 com a anon key — descoberto no 1º run do CI, 26/07/2026); daí a
// RPC, no espírito da realtime_tables. Irmão do check_realtime.mjs; o que ELE já cobre
// (publicação Realtime) e o que a visão de anon não enxerga (RLS/grants/policies — guarda:
// gen_security_snapshot.sql + auditoria periódica do docs/seguranca.md) ficam de fora,
// de propósito.
//
// Desde esta migração, a consulta a divat_api_shape() não passa mais pela anon key/PostgREST:
// vai pelo login mínimo `divat_auditor_ci` via scripts/lib/audit-database.mjs, contra a função
// audit.divat_api_shape() do projeto de TESTE (gontnlfmothfglssbyyk) — não mais produção. Ver
// docs/seguranca.md § 10. A leitura de app.js para achar os `rpc/...` que o FRONT chama (item 3
// abaixo) continua igual: não é credencial, é conteúdo do repo.
//
// Checagens:
//   1. Toda tabela citada em CLAUDE.md / docs/schema.md existe no banco (teria pego os
//      nomes fantasmas do ticket 01 da auditoria).
//   2. Toda coluna do diagrama mermaid (erDiagram) do docs/schema.md existe na tabela real
//      (pegaria um rename de coluna no dia em que acontecer).
//   3. Toda RPC que o app.js chama (rpc/...) existe no banco e responde a anon.
//   4. Toda RPC exposta a anon está documentada no docs/schema.md (seção "Funções e
//      trigger").
//
// Uso (precisa de SUPABASE_TEST_AUDIT_DATABASE_URL no ambiente e `psql` no PATH — runbook em
// docs/planos/fase-3-hardening-moderado.md):
//   node scripts/check_deriva.mjs
//
// Requer Node 18+ e o binário `psql` no PATH.
// Sai com código 0 se tudo confere, 1 se há deriva, erro ou credencial/conexão recusada.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfiguracaoAuditora, executarFuncaoJson, AuditDatabaseError } from './lib/audit-database.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Nomes que casam o padrão de tabela mas NÃO são tabelas do schema public:
const NAO_TABELA = new Set(['bd_teste']); // bd_teste = nome do projeto Supabase
// Staging do ETL: existem no banco mas são invisíveis para anon DE PROPÓSITO (RLS sem
// policy, sem grant) — o OpenAPI de anon não as lista, então não dá para conferi-las daqui.
const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);

const appjs = await readFile(join(ROOT, 'app.js'), 'utf8');

// ---------- lado do REPO (parse antes da rede, para falhar cedo no que for local) ----------

// tabelas citadas nos docs, com doc:linha de cada citação
const DOCS = ['CLAUDE.md', 'docs/schema.md'];
const citacoes = []; // { tabela, doc, linha }
for (const doc of DOCS) {
  const linhas = (await readFile(join(ROOT, doc), 'utf8')).split('\n');
  linhas.forEach((txt, i) => {
    for (const m of txt.matchAll(/\b\w+_teste\b|\bevento_dados\b|\bevento_textos\b|\bportaria_data\b/g)) {
      if (!NAO_TABELA.has(m[0])) citacoes.push({ tabela: m[0], doc, linha: i + 1 });
    }
  });
}

// colunas do diagrama mermaid (erDiagram) do schema.md, com linha
const schemaMd = (await readFile(join(ROOT, 'docs/schema.md'), 'utf8')).split('\n');
const colunas = []; // { tabela, coluna, linha }
{
  let dentroMermaid = false, entidade = null;
  schemaMd.forEach((txt, i) => {
    if (/^```mermaid/.test(txt)) { dentroMermaid = true; return; }
    if (/^```/.test(txt)) { dentroMermaid = false; entidade = null; return; }
    if (!dentroMermaid) return;
    const abre = txt.match(/^\s*(\w+)\s*\{/);
    if (abre) { entidade = abre[1]; return; }
    if (/^\s*\}/.test(txt)) { entidade = null; return; }
    if (!entidade) return; // linhas de relação (||--o{) ficam fora dos blocos
    const campo = txt.trim().split(/\s+/); // ex.: "varchar codlinha PK" → coluna = 2º token
    if (campo.length >= 2) colunas.push({ tabela: entidade, coluna: campo[1], linha: i + 1 });
  });
}

// RPCs que o app.js chama
const rpcsDoFront = [...new Set([...appjs.matchAll(/['"`]rpc\/(\w+)/g)].map(m => m[1]))];

console.log(`Repo lido: ${citacoes.length} citações de tabela nos docs, ` +
  `${colunas.length} colunas no diagrama, ${rpcsDoFront.length} RPCs no app.js.`);

// ---------- lado do BANCO (OpenAPI do PostgREST, como anon) ----------

let api;
try {
  const config = carregarConfiguracaoAuditora();
  api = executarFuncaoJson(config, 'divat_api_shape');
} catch (e) {
  if (!(e instanceof AuditDatabaseError)) throw e;
  console.error(e.message);
  console.error('A função audit.divat_api_shape() existe e divat_auditor_ci pode executá-la? (DDL na baseline docs/backup_schema.sql.)');
  process.exit(1);
}

const tabelasDoBanco = new Set(Object.keys(api.tables || {}));
const rpcsDoBanco = new Set(api.rpcs || []);

// ---------- comparação ----------

const erros = [];

// 1. tabela citada existe no banco (staging fica de fora: invisível para anon por design)
for (const c of citacoes) {
  if (STAGING.has(c.tabela)) continue;
  if (!tabelasDoBanco.has(c.tabela)) {
    erros.push(`${c.doc}:${c.linha} cita a tabela "${c.tabela}", que não existe no banco (ou não está visível para anon).`);
  }
}

// 2. coluna do diagrama existe na tabela real
for (const c of colunas) {
  const cols = api.tables?.[c.tabela];
  if (!cols) { erros.push(`docs/schema.md:${c.linha} — a entidade "${c.tabela}" do diagrama não existe no banco.`); continue; }
  if (!cols.includes(c.coluna)) {
    erros.push(`docs/schema.md:${c.linha} — a coluna "${c.tabela}.${c.coluna}" do diagrama não existe na tabela real.`);
  }
}

// 3. RPC chamada pelo front existe e responde a anon
for (const r of rpcsDoFront) {
  if (!rpcsDoBanco.has(r)) {
    erros.push(`app.js chama rpc/${r}, que não existe no banco (ou não responde a anon).`);
  }
}

// 4. RPC exposta a anon está documentada no schema.md
const schemaTexto = schemaMd.join('\n');
for (const r of rpcsDoBanco) {
  if (!schemaTexto.includes(r)) {
    erros.push(`A RPC "${r}" está exposta a anon no banco mas não aparece no docs/schema.md (seção "Funções e trigger").`);
  }
}

if (erros.length === 0) {
  console.log(`✓ Sem deriva docs×banco: ${tabelasDoBanco.size} tabelas visíveis, ${rpcsDoBanco.size} RPCs conferidas.`);
  process.exit(0);
}

console.error(`✗ DERIVA docs×banco — ${erros.length} divergência(s):`);
for (const e of erros) console.error(`  - ${e}`);
console.error('Corrija o doc (ou o banco) até este script ficar verde — é a guarda contra o drift da auditoria de 26/07/2026.');
process.exit(1);
