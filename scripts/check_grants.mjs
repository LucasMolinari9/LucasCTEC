// check_grants.mjs — Checagem VIVA da postura de segurança do banco (achado SEC-04).
//
// Por que existe: até 27/07/2026 NADA verificava automaticamente RLS, grants, policies e
// privilégios de função. A conferência era um checklist TRIMESTRAL manual em docs/seguranca.md —
// ou seja, uma alteração perigosa feita no painel do Supabase (o dono trabalha lá com service
// role, que ignora RLS) podia ficar viva por meses sem ninguém notar. Este é o alarme.
//
// É o gate que sustenta as correções SEC-01 e SEC-05: sem ele, os default privileges que acabaram
// de ser fechados podem ser reabertos por um clique e nada avisa.
//
// Irmão do check_data_quality.mjs, check_realtime.mjs e check_deriva.mjs: mesmo transporte
// (scripts/lib/audit-database.mjs), mesma forma (função read-only no banco + runner fino aqui).
// A função audit.divat_security_shape() roda pelo login mínimo `divat_auditor_ci` — desde esta
// migração os QUATRO gates auditam o projeto de TESTE (gontnlfmothfglssbyyk), não mais produção:
// a Fase 3 moveu essas funções de `public`/anon para `audit`, e por ora só o projeto de teste tem
// essa migração aplicada (produção não tem o schema `audit` ainda). Ver docs/seguranca.md § 10 e
// docs/planos/fase-3-hardening-moderado.md — inclusive o efeito colateral aceito: enquanto a Fase
// 3 não chegar a produção, este gate deixa de dar cobertura automática ao risco §9.1 lá.
//
// Uso (precisa de SUPABASE_TEST_AUDIT_DATABASE_URL no ambiente e `psql` no PATH — runbook em
// docs/planos/fase-3-hardening-moderado.md):
//   node scripts/check_grants.mjs                     # respeita o baseline
//   node scripts/check_grants.mjs --sem-baseline      # estado cru do banco
//   node scripts/check_grants.mjs --atualizar-baseline  # SÓ LOCAL, nunca no CI
//
// Requer Node 18+ e o binário `psql` no PATH. Sai 1 se houver achado de severidade `erro` fora
// do baseline, ou se a credencial/conexão auditora for recusada (contrato em
// scripts/lib/audit-database.mjs — falha sempre fechado, nunca imprime segredo).
//
// SOBRE O BASELINE: mesmo espírito do data_quality_baseline.json — dívida REGISTRADA, não perdão.
// Hoje ele carrega os defaults do role `supabase_admin`, que concedem escrita a anon/authenticated
// em tabelas de public e NÃO são fecháveis (postgres não é superusuário no Supabase; o comando
// responde 42501). Está no baseline porque é limitação de plataforma aceita e documentada em
// docs/seguranca.md §9.1 — não porque foi perdoado. Por causa dela este gate roda DIARIAMENTE.
//
// ATENÇÃO ao mexer: `--atualizar-baseline` é para registrar uma exceção que você DECIDIU aceitar,
// depois de entender. Rodar por reflexo quando o gate fica vermelho transforma o alarme em
// carimbo. Se o gate acusar grant de escrita novo, a resposta certa é revogar, não baselinar.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfiguracaoAuditora, executarFuncaoJson, AuditDatabaseError } from './lib/audit-database.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'security_baseline.json');

const args = new Set(process.argv.slice(2));
const semBaseline = args.has('--sem-baseline') || args.has('--all');
const atualizar = args.has('--atualizar-baseline');

let forma;
try {
  const config = carregarConfiguracaoAuditora();
  forma = executarFuncaoJson(config, 'divat_security_shape');
} catch (e) {
  if (!(e instanceof AuditDatabaseError)) throw e;
  console.error(e.message);
  console.error('A função audit.divat_security_shape() existe e divat_auditor_ci pode executá-la?');
  process.exit(1);
}

// Se a RPC devolver forma inesperada, PARE. Tratar `undefined` como lista vazia faria o gate
// passar com zero achados exatamente quando perdeu a visão do banco — fail-open silencioso, que é
// o modo de falha que este script existe para não ter.
for (const campo of ['tabelas', 'funcoes', 'default_privileges']) {
  if (!Array.isArray(forma?.[campo])) {
    console.error(`Resposta da RPC sem o campo '${campo}' como lista — abortando em vez de assumir vazio.`);
    process.exit(1);
  }
}
// Lista VAZIA é o mesmo fail-open do campo ausente, com outra roupa: passa no Array.isArray
// acima, o laço da regra simplesmente não itera, e o gate imprime "nenhum achado".
//
// Até 08/08/2026 esta conferência existia só para `tabelas` — e `funcoes`/`default_privileges`
// são justamente os dois eixos onde mora o risco 9.1 (os defaults do `supabase_admin`, que não
// são fecháveis porque `postgres` não é superusuário aqui). Pior que passar em silêncio: com
// `default_privileges` vazio o script anunciava "Resolvido desde o baseline — rode
// --atualizar-baseline", ou seja, convidava a APAGAR do baseline o registro da exceção
// conhecida. Perder a visão passaria a parecer progresso.
const MINIMO = {
  tabelas: 'nenhuma tabela',
  funcoes: 'nenhuma função',
  default_privileges: 'nenhum default privilege',
};
for (const [campo, oQue] of Object.entries(MINIMO)) {
  if (!forma[campo].length) {
    console.error(`A RPC não devolveu ${oQue} ('${campo}'). Isso não é "tudo certo", é visão perdida — abortando.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------------------------
// Regras. Cada uma vira um achado {tipo, alvo, detalhe, severidade}.
// A chave (tipo + alvo) é o que o baseline indexa.
// ---------------------------------------------------------------------------------------------
const ESCRITA = ['insert', 'update', 'delete', 'truncate'];
const achados = [];
const add = (tipo, alvo, detalhe, severidade = 'erro') => achados.push({ tipo, alvo, detalhe, severidade });

for (const t of forma.tabelas) {
  if (!t.rls) add('rls_off', t.nome, `RLS desligada em ${t.nome}`);

  for (const papel of ['anon', 'authenticated']) {
    const p = t[papel] || {};
    const escrita = ESCRITA.filter(k => p[k]);
    if (escrita.length) {
      add('grant_escrita', `${t.nome}:${papel}`, `${papel} tem ${escrita.join('/').toUpperCase()} em ${t.nome}`);
    }
    // MAINTAIN (VACUUM/ANALYZE/CLUSTER/REINDEX/LOCK) não é escrita DML e não passa pelo PostgREST,
    // mas também não é leitura — foi o que sobrou escondido no ACL `anon=rm` até 27/07/2026.
    if (p.maintain) add('grant_maintain', `${t.nome}:${papel}`, `${papel} tem MAINTAIN em ${t.nome}`);
  }

  for (const pol of t.policies || []) {
    // polcmd: r=SELECT, a=INSERT, w=UPDATE, d=DELETE, *=ALL. O portal é só-leitura: só `r` passa.
    if (pol.cmd !== 'r') {
      add('policy_escrita', `${t.nome}:${pol.nome}`, `policy ${pol.nome} em ${t.nome} é '${pol.cmd}', não SELECT`);
    }
  }
}

for (const f of forma.funcoes) {
  if (f.public_execute) add('funcao_public_execute', f.assinatura, `${f.assinatura} é executável por PUBLIC`);
  if (f.security_definer) add('funcao_security_definer', f.assinatura, `${f.assinatura} é SECURITY DEFINER`);
  // search_path fixo é o que impede sequestro de resolução de nome. Numa função INVOKER importa
  // pouco; numa DEFINER é a diferença entre função e escalada de privilégio. Cobrado sempre,
  // porque a função de hoje é INVOKER e a de amanhã pode não ser.
  if (!f.search_path_fixo) add('funcao_sem_search_path', f.assinatura, `${f.assinatura} não fixa search_path`);
}

for (const d of forma.default_privileges) {
  const alvo = `${d.dono}:${d.schema}:${d.tipo}`;
  const partes = [];
  if (d.public_privs?.length) partes.push(`PUBLIC=${d.public_privs.join(',')}`);
  if (d.anon_privs?.length) partes.push(`anon=${d.anon_privs.join(',')}`);
  if (d.authenticated_privs?.length) partes.push(`authenticated=${d.authenticated_privs.join(',')}`);
  if (partes.length) {
    add('default_privilege_permissivo', alvo,
      `objeto novo (${d.tipo}) criado por ${d.dono} em ${d.schema} já nasce com ${partes.join(' ')}`);
  }
}

// ---------------------------------------------------------------------------------------------
const chave = a => `${a.tipo} ${a.alvo}`;

if (atualizar) {
  const registro = {
    gerado_em: new Date().toISOString().slice(0, 10),
    nota: 'Exceções de segurança CONHECIDAS e aceitas. Cada entrada precisa de justificativa em docs/seguranca.md §9. Isto não é perdão: se um achado NOVO aparecer, revogue — não baseline.',
    achados: achados
      .filter(a => a.severidade === 'erro')
      .map(a => ({ tipo: a.tipo, alvo: a.alvo, detalhe: a.detalhe }))
      .sort((x, y) => chave(x).localeCompare(chave(y))),
  };
  await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n', 'utf8');
  console.log(`✓ Baseline reescrito com ${registro.achados.length} exceção(ões) → scripts/security_baseline.json`);
  console.log('  · Confira o diff antes de commitar. Toda entrada nova precisa de justificativa em docs/seguranca.md §9.');
  process.exit(0);
}

let base = new Set();
if (!semBaseline) {
  try {
    const b = JSON.parse(await readFile(BASELINE, 'utf8'));
    base = new Set((b.achados || []).map(chave));
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`Baseline ilegível (${BASELINE}): ${e.message}`); process.exit(1); }
  }
}

const erros = achados.filter(a => a.severidade === 'erro');
const novos = erros.filter(a => !base.has(chave(a)));
const conhecidos = erros.filter(a => base.has(chave(a)));
const resolvidos = [...base].filter(k => !erros.some(a => chave(a) === k));

if (conhecidos.length) {
  console.log(`\n· Exceção conhecida, dentro do baseline (${conhecidos.length}) — ver docs/seguranca.md §9:`);
  for (const a of conhecidos) console.log(`    [${a.tipo}] ${a.detalhe}`);
}
if (resolvidos.length) {
  console.log(`\n✓ Resolvido desde o baseline (${resolvidos.length}) — rode --atualizar-baseline para apertar o gate:`);
  for (const k of resolvidos) console.log(`    ${k.split(' ').join(' → ')}`);
}

if (!novos.length) {
  console.log(`\n✓ Postura de segurança: nenhum achado${base.size ? ' novo' : ''}. ` +
    `(${forma.tabelas.length} tabelas, ${forma.funcoes.length} funções conferidas.)`);
  process.exit(0);
}

console.error(semBaseline
  ? '\n✗ ESTADO CRU DO BANCO (baseline ignorado):'
  : '\n✗ POSTURA DE SEGURANÇA REGREDIU — achado(s) fora do baseline:');
for (const a of novos) console.error(`    [${a.tipo}] ${a.detalhe}`);
console.error('\nO que fazer: REVOGUE o privilégio. Só use --atualizar-baseline se a exceção for');
console.error('deliberada e você a documentar em docs/seguranca.md §9.');
console.error('Para ver o estado cru do banco: node scripts/check_grants.mjs --sem-baseline');
process.exit(1);
