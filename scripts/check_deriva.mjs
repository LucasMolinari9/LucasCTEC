// check_deriva.mjs — Checagem VIVA de deriva docs × banco (a guarda que faltava).
//
// ⚠️ ESCOPO: este gate só enxerga PRODUÇÃO (`Banco - Divat`, ref lwzsxuaqqeoamukduhev). Ele extrai
// SB_URL/SB_KEY por regex do app.js, que são literais de produção — NÃO há flag, variável de
// ambiente nem argumento para apontá-lo para o projeto de teste. Consequência, e é o ponto: o
// banco de TESTE (`divat - TESTE`, gontnlfmothfglssbyyk) não é vigiado por este nem por nenhum
// outro gate do repositório, e nada compara os dois. Dívida registrada em docs/adr/0002.
// (Dito aqui em 31/07/2026 — achado 3 da auditoria cruzada. Antes, só a ADR-0002 sabia disso.)
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
// Checagens:
//   1. Toda tabela citada em CLAUDE.md / docs/schema.md existe no banco (teria pego os
//      nomes fantasmas do ticket 01 da auditoria).
//   2. Toda coluna do diagrama mermaid (erDiagram) do docs/schema.md existe na tabela real
//      (pegaria um rename de coluna no dia em que acontecer).
//   3. Toda RPC que o app.js chama (rpc/...) existe no banco e responde a anon.
//   4. Toda RPC exposta a anon está documentada no docs/schema.md (seção "Funções e
//      trigger").
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_deriva.mjs
//
// Requer apenas Node 18+ (fetch nativo). Nenhuma dependência. Não precisa de chave no
// ambiente: usa a URL e a anon key que já estão públicas no app.js.
// Sai com código 0 se tudo confere, 1 se há deriva (ou erro/rede bloqueada).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Nomes que casam o padrão `*_teste` mas NÃO são tabelas do schema public.
// `bd_teste` é o nome ANTIGO do projeto Supabase de produção (hoje `Banco - Divat`). Em
// 31/07/2026 ele saiu dos títulos do schema.md e do backup.md, e a intenção era apagar esta
// exceção junto — ela existia para contornar aqueles títulos. Ficou porque o CLAUDE.md passou a
// citar o nome antigo de propósito, na nota que explica que ele é resíduo; e o varredor abaixo
// lê o CLAUDE.md. Ou seja: a exceção continua carregando peso, só que por outro motivo.
// Regra geral: nome de PROJETO não é nome de tabela, e o padrão `*_teste` não distingue os dois.
const NAO_TABELA = new Set(['bd_teste']);
// Staging do ETL: existem no banco mas são invisíveis para anon DE PROPÓSITO (RLS sem
// policy, sem grant) — o OpenAPI de anon não as lista, então não dá para conferi-las daqui.
const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);

function extrair(html, re, oquê) {
  const m = re.exec(html);
  if (!m) { console.error(`Não achei ${oquê} no app.js.`); process.exit(1); }
  return m[1];
}

const appjs = await readFile(join(ROOT, 'app.js'), 'utf8');
const SB_URL = extrair(appjs, /const SB_URL\s*=\s*'([^']+)'/, 'SB_URL');
const SB_KEY = extrair(appjs, /const SB_KEY\s*=\s*'([^']+)'/, 'SB_KEY');

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
  const resp = await fetch(`${SB_URL}/rest/v1/rpc/divat_api_shape`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    console.error(`RPC divat_api_shape falhou (HTTP ${resp.status}): ${await resp.text()}`);
    console.error('A função public.divat_api_shape() existe e tem GRANT EXECUTE para anon? (DDL na baseline docs/backup_schema.sql.)');
    console.error('(Se o HTTP 403 vier de um proxy: o ambiente do Claude não alcança *.supabase.co — rode na sua máquina ou no CI.)');
    process.exit(1);
  }
  api = await resp.json();
} catch (e) {
  console.error('Erro de rede ao chamar o Supabase (este script precisa de rede):', e.message);
  console.error('O ambiente do Claude não alcança *.supabase.co — rode na sua máquina ou no CI.');
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
