// Bancada offline do check_grants.mjs — prova que o gate APERTA.
//
// Por que não está no tests/check.js: sobe um processo filho com um `psql` FALSO no PATH; o
// contrato do check.js é ser offline e sem efeitos. Rode à mão:  node tests/check_grants.rig.mjs
//
// Por que existe: um gate de segurança que nunca foi visto falhando é fé, não garantia. Os dois
// últimos casos são os que mais importam — eles cobrem FAIL-OPEN: se a função devolver lista
// vazia ou faltando um campo, o gate tem que ABORTAR, não relatar "nenhum achado". Foi o modo de
// falha que quase entrou (tratar `undefined` como `[]` e sair 0 exatamente ao perder a visão do
// banco).
//
// Técnica do stub (adaptada quando check_grants.mjs migrou de PostgREST/anon para o auditor
// PostgreSQL — scripts/lib/audit-database.mjs): um `psql` FALSO, escrito como script Node
// executável num diretório próprio e posto à frente no PATH do processo filho.
// scripts/lib/audit-database.mjs chama `psql` pelo nome — não sabe, nem precisa saber, que não é
// o binário real. A resposta de cada caso viaja por um ARQUIVO, não por variável de ambiente:
// audit-database.mjs troca TODO o ambiente do processo `psql` por só PGHOST/PGPORT/PGDATABASE/
// PGUSER/PGPASSWORD/PGSSLMODE (de propósito — é o contrato de "nunca vazar segredo por env
// extra"), então nenhuma variável própria do rig atravessaria.
// Unidade equivalente, mais estreita (só a validação de conexão e a invocação do psql, sem
// process real do gate): tests/audit-database.test.mjs.
import { mkdir, writeFile, copyFile, chmod, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = '/tmp/divat-rig-grants';
const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESPOSTA = `${RAIZ}/resposta-atual.json`;

// Não é credencial real — é só uma URL de FORMATO válido para o auditor de teste passar pela
// validação de scripts/lib/audit-database.mjs. O psql que ela "abre" é o falso abaixo; nenhuma
// rede é usada. Montada por PARTES, não como um literal `postgresql://usuário:senha@host`
// inteiro: um scanner de segredo por padrão (GitGuardian) marca qualquer string nesse FORMATO
// como "PostgreSQL Credentials" mesmo com senha obviamente fake — foi o que aconteceu na 1ª
// versão deste arquivo (achado real de CI, corrigido aqui, não escondido).
const AUDITOR_HOST = 'db.gontnlfmothfglssbyyk.supabase.co';
const AUDITOR_USER = 'divat_auditor_ci';
const AUDITOR_SENHA_FALSA = 'senha-de-teste-do-rig';
const URL_AUDITOR_FALSA =
  `postgresql://${AUDITOR_USER}:${AUDITOR_SENHA_FALSA}@${AUDITOR_HOST}:5432/postgres?sslmode=require`;

await rm(RAIZ, { recursive: true, force: true });
await mkdir(`${RAIZ}/scripts/lib`, { recursive: true });
await mkdir(`${RAIZ}/bin`, { recursive: true });
await copyFile(`${REAL}/scripts/check_grants.mjs`, `${RAIZ}/scripts/check_grants.mjs`);
await copyFile(`${REAL}/scripts/lib/audit-database.mjs`, `${RAIZ}/scripts/lib/audit-database.mjs`);

// psql falso: sempre devolve o conteúdo do arquivo RESPOSTA (já preparado como a linha de JSON
// que audit-database.mjs espera) e sai 0. Sem SQL de verdade, sem rede.
await writeFile(`${RAIZ}/bin/psql`, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
process.stdout.write(readFileSync(${JSON.stringify(RESPOSTA)}, 'utf8').trim() + '\\n');
process.exit(0);
`, 'utf8');
await chmod(`${RAIZ}/bin/psql`, 0o755);

// Estado SÃO: espelha o banco de verdade depois das correções do Bloco 1.
const sao = () => ({
  gerado_em: '2026-07-27',
  tabelas: [
    { nome: 'tabela_vista_teste', rls: true, force_rls: false,
      anon: { select: true, insert: false, update: false, delete: false, truncate: false, maintain: false },
      authenticated: { select: true, insert: false, update: false, delete: false, truncate: false, maintain: false },
      policies: [{ nome: 'anon_read_tabela_vista', cmd: 'r' }] },
    { nome: 'evento_dados', rls: true, force_rls: false,
      anon: { select: false, insert: false, update: false, delete: false, truncate: false, maintain: false },
      authenticated: { select: false, insert: false, update: false, delete: false, truncate: false, maintain: false },
      policies: [] },
  ],
  funcoes: [
    { assinatura: 'divat_api_shape()', security_definer: false, search_path_fixo: true,
      public_execute: false, anon_execute: true, authenticated_execute: true },
  ],
  default_privileges: [
    { dono: 'postgres', schema: 'public', tipo: 'r', anon_privs: [], authenticated_privs: [], public_privs: [] },
    { dono: 'supabase_admin', schema: 'public', tipo: 'r',
      anon_privs: ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
      authenticated_privs: ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
      public_privs: [] },
  ],
});

const baseline = {
  gerado_em: '2026-07-27',
  nota: 'teste',
  achados: [
    { tipo: 'default_privilege_permissivo', alvo: 'supabase_admin:public:r', detalhe: 'limitação de plataforma' },
  ],
};

function rodar(extraArgs = []) {
  return new Promise(res => {
    const p = spawn('node', [`${RAIZ}/scripts/check_grants.mjs`, ...extraArgs], {
      cwd: RAIZ,
      env: {
        ...process.env,
        PATH: `${RAIZ}/bin:${process.env.PATH}`,
        SUPABASE_TEST_AUDIT_DATABASE_URL: URL_AUDITOR_FALSA,
      },
    });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

const casos = [];
const caso = (nome, mutar, esperado) => casos.push({ nome, mutar, esperado });

caso('estado são (só a exceção conhecida)', f => f, 0);
caso('RLS desligada', f => { f.tabelas[0].rls = false; return f; }, 1);
caso('grant de INSERT para anon', f => { f.tabelas[0].anon.insert = true; return f; }, 1);
caso('grant de DELETE para authenticated', f => { f.tabelas[0].authenticated.delete = true; return f; }, 1);
caso('MAINTAIN escondido no ACL', f => { f.tabelas[0].anon.maintain = true; return f; }, 1);
caso('policy de escrita', f => { f.tabelas[0].policies.push({ nome: 'x', cmd: 'w' }); return f; }, 1);
caso('função executável por PUBLIC', f => { f.funcoes[0].public_execute = true; return f; }, 1);
caso('função SECURITY DEFINER', f => { f.funcoes[0].security_definer = true; return f; }, 1);
caso('função sem search_path fixo', f => { f.funcoes[0].search_path_fixo = false; return f; }, 1);
caso('default do postgres reaberto', f => { f.default_privileges[0].anon_privs = ['SELECT']; return f; }, 1);
caso('RPC devolve lista vazia (visão perdida)', f => { f.tabelas = []; return f; }, 1);
caso('RPC sem o campo funcoes', f => { delete f.funcoes; return f; }, 1);
// Os dois abaixo são o achado E da auditoria de 08/08/2026: o guard de "lista vazia não é
// tudo certo, é visão perdida" existia SÓ para `tabelas`. Lista vazia em `funcoes` ou em
// `default_privileges` passava no Array.isArray, o laço simplesmente não iterava, e o gate
// imprimia "nenhum achado" — justo nos dois eixos onde mora o risco 9.1 (os defaults do
// supabase_admin, que não são fecháveis). Perder visão ali e sair 0 é o pior resultado.
caso('funcoes vem vazia (visão perdida)', f => { f.funcoes = []; return f; }, 1);
caso('default_privileges vem vazio (visão perdida)', f => { f.default_privileges = []; return f; }, 1);

await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baseline, null, 2));

let falhas = 0;
for (const c of casos) {
  await writeFile(RESPOSTA, JSON.stringify(c.mutar(sao())));
  const { code, out } = await rodar();
  const ok = code === c.esperado;
  if (!ok) falhas++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${c.nome} → saiu ${code}, esperado ${c.esperado}`);
  if (!ok) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
}

// A exceção conhecida DEVE derrubar o gate quando o baseline é ignorado — senão o baseline
// estaria escondendo, não registrando.
await writeFile(RESPOSTA, JSON.stringify(sao()));
const cru = await rodar(['--sem-baseline']);
const okCru = cru.code === 1;
if (!okCru) falhas++;
console.log(`${okCru ? '  ✓' : '  ✗'} --sem-baseline expõe a exceção conhecida → saiu ${cru.code}, esperado 1`);

// A credencial auditora nunca pode vazar na saída do processo — mesmo que o psql falso a
// devolvesse por engano (ele não devolve: só ecoa o arquivo RESPOSTA), a saída do próprio
// check_grants.mjs (stdout+stderr) não deve conter a senha da URL falsa acima.
const semSegredo = !cru.out.includes('senha-de-teste-do-rig');
if (!semSegredo) falhas++;
console.log(`${semSegredo ? '  ✓' : '  ✗'} saída do gate nunca contém a senha da credencial auditora`);

await rm(RAIZ, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada: todos os casos passaram');
process.exit(falhas ? 1 : 0);
