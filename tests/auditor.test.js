'use strict';
/* Conexão auditora da Fase 3 (scripts/lib/auditor.mjs).
   Rode: node auditor.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: `conectarAuditor` é a guarda que impede um secret mal colado apontar o gate de
   teste para produção — e ela passou a ser COMPARTILHADA por dois gates (check_phase3_audit.mjs
   e, na Tarefa 8, check_data_quality.mjs). Guarda de segurança que nunca foi vista recusando é
   fé, não garantia; e depois da extração ninguém mais lê essas 20 linhas.

   Fica aqui, e não num *.rig.mjs manual, porque as recusas são PURAS (nenhuma toca a rede: elas
   rejeitam antes do psql) — cabem no gate de sempre. O único caso que sai do puro é o do
   `consultar`, que usa um `psql` FALSO num diretório temporário: é ele que prova as duas promessas
   que a prosa faz e o olho não confere sozinho — a senha não aparece em `argv` e o `env` do filho
   é montado do zero, sem herdar o `process.env` de quem chama. */

const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}
// Devolve a mensagem do Error lançado, ou null se NÃO lançou (o caso que interessa distinguir:
// "recusou" é diferente de "aceitou em silêncio").
const erro = fn => { try { fn(); return null; } catch (e) { return e.message; } };

const PROD = 'lwzsxuaqqeoamukduhev';
const TESTE = 'gontnlfmothfglssbyyk';
const V_TESTE = 'SUPABASE_TEST_AUDIT_DATABASE_URL';
const V_PROD = 'SUPABASE_PROD_AUDIT_DATABASE_URL';

// Roda `fn` com as duas variáveis do auditor no estado descrito, e devolve tudo como estava —
// mesmo se `fn` lançar. Sem isso um caso contaminaria o seguinte.
function comEnv(vars, fn){
  const antes = {};
  for (const k of [V_TESTE, V_PROD]) antes[k] = process.env[k];
  try {
    for (const k of [V_TESTE, V_PROD]) {
      if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k];
    }
    return fn();
  } finally {
    for (const k of [V_TESTE, V_PROD]) {
      if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k];
    }
  }
}

(async () => {
  const { conectarAuditor, REFS } = await import('../scripts/lib/auditor.mjs');

  console.log('REFS — os dois refs conhecidos, e só eles');
  ok(REFS.producao === PROD && REFS.teste === TESTE, 'REFS traz produção e teste');
  ok(Object.keys(REFS).length === 2, 'REFS não tem um terceiro ambiente');

  console.log('recusa — ambiente e variável');
  ok(/Ambiente desconhecido: 'marte'/.test(
       comEnv({}, () => erro(() => conectarAuditor({ ambiente: 'marte' }))) || ''),
     'ambiente desconhecido recusa (não cai num default)');
  ok(/Ambiente desconhecido/.test(
       comEnv({}, () => erro(() => conectarAuditor({ ambiente: undefined }))) || ''),
     'ambiente ausente recusa');
  ok((comEnv({}, () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || '').startsWith(V_TESTE),
     'sem secret de teste, a mensagem cita a variável de TESTE');
  ok((comEnv({}, () => erro(() => conectarAuditor({ ambiente: 'producao' }))) || '').startsWith(V_PROD),
     'sem secret de produção, a mensagem cita a variável de PRODUÇÃO');
  ok(/não é uma URL PostgreSQL válida/.test(
       comEnv({ [V_TESTE]: 'nao-e-url' }, () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'URL ilegível recusa');

  console.log('recusa — o ref cruzado (o defeito que esta guarda existe para pegar)');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${PROD}.supabase.co/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'URL de PRODUÇÃO no secret de teste recusa');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_PROD]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'producao' }))) || ''),
     'URL de TESTE no secret de produção recusa');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: 'postgres://divat_auditor_ci:x@db.abcdefghijklmnopqrst.supabase.co/postgres' },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'ref desconhecido recusa (aceitar DOIS não virou aceitar QUALQUER um)');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: `postgres://divat_auditor_ci.${PROD}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'pooler com o ref do outro ambiente recusa');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: 'postgres://divat_auditor_ci:x@evil.com/postgres' },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'host de terceiro recusa');

  console.log('recusa — login e senha');
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: `postgres://postgres:x@db.${TESTE}.supabase.co/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'login que não é o do auditor recusa (postgres)');
  ok(/não contém senha/.test(
       comEnv({ [V_TESTE]: `postgres://divat_auditor_ci@db.${TESTE}.supabase.co/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'URL sem senha recusa');

  // O login é `divat_auditor_ci` EXATO — o bootstrap cria esse nome e a rotação de prazos.json é
  // de SENHA (VALID UNTIL), não de nome. Enquanto a comparação era `startsWith`, qualquer role
  // que começasse com o prefixo passava por auditor. Não é explorável de fora (quem escreve o
  // secret já tem a credencial); é a guarda sendo mais frouxa do que se lê — que é como uma
  // guarda deixa de guardar sem ninguém perceber (issue #101).
  for (const impostor of ['divat_auditor_civil', 'divat_auditor_ci_backup', 'divat_auditor_ci2']) {
    ok(/Conexão recusada: host\/project ref/.test(
         comEnv({ [V_TESTE]: `postgres://${impostor}:x@db.${TESTE}.supabase.co/postgres` },
                () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
       `login '${impostor}' recusa (o prefixo não é o login)`);
    ok(/Conexão recusada: host\/project ref/.test(
         comEnv({ [V_TESTE]: `postgres://${impostor}.${TESTE}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` },
                () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
       `no pooler também, login '${impostor}' recusa`);
  }
  // O usuário vai DECODIFICADO para o PGUSER, então é a forma decodificada que precisa bater:
  // conferir o texto cru deixaria `divat_auditor_ci%2Evil` (→ `divat_auditor_ci.vil`) passar por
  // um `startsWith`, e chegaria ao psql como outro login.
  ok(/Conexão recusada: host\/project ref/.test(
       comEnv({ [V_TESTE]: `postgres://divat_auditor_ci%2Evil:x@db.${TESTE}.supabase.co/postgres` },
              () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
     'login percent-encoded que decodifica para outro nome recusa');
  ok(comEnv({ [V_TESTE]: `postgres://divat_auditor_c%69:x@db.${TESTE}.supabase.co/postgres` },
            () => conectarAuditor({ ambiente: 'teste' })).ref === TESTE,
     'login percent-encoded que decodifica para o login CERTO aceita');

  console.log('recusa — sslmode abaixo do piso');
  // `sslmode` vinha da URL com `|| 'require'`, que é default para quando a URL não diz NADA. Uma
  // URL dizendo `sslmode=disable` passava direto: o piso de segurança da conexão era decidido
  // pelo texto do secret, não pelo código (issue #101).
  for (const modo of ['disable', 'allow', 'prefer']) {
    ok(new RegExp(`sslmode='${modo}'`).test(
         comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres?sslmode=${modo}` },
                () => erro(() => conectarAuditor({ ambiente: 'teste' }))) || ''),
       `sslmode=${modo} recusa (o piso é do código, não do secret)`);
  }
  for (const modo of ['require', 'verify-ca', 'verify-full']) {
    ok(comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres?sslmode=${modo}` },
              () => conectarAuditor({ ambiente: 'teste' })).ref === TESTE,
       `sslmode=${modo} aceita`);
  }
  ok(comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres` },
            () => conectarAuditor({ ambiente: 'teste' })).ref === TESTE,
     'URL sem sslmode continua aceita (o default require é o piso, não uma exceção)');

  console.log('aceita — os caminhos legítimos (direto e pooler, nos dois refs)');
  ok(comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres` },
            () => conectarAuditor({ ambiente: 'teste' })).ref === TESTE,
     'conexão direta de teste aceita e devolve o ref');
  ok(comEnv({ [V_PROD]: `postgres://divat_auditor_ci:x@db.${PROD}.supabase.co/postgres` },
            () => conectarAuditor({ ambiente: 'producao' })).ambiente === 'producao',
     'conexão direta de produção aceita (o script deixou de recusar produção)');
  ok(typeof comEnv({ [V_TESTE]: `postgres://divat_auditor_ci.${TESTE}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres` },
                   () => conectarAuditor({ ambiente: 'teste' })).consultar === 'function',
     'pooler aceito (é o caminho que funciona no runner IPv4 do GitHub)');

  console.log('consultar — segredo fora do argv, env montado do zero');
  // psql falso: registra o que recebeu num arquivo e devolve uma linha de saída. Sem ele, as
  // promessas "não aparece em `ps`" e "não herda process.env" seriam só comentário.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-'));
  try {
    const registro = path.join(dir, 'registro.json');
    fs.writeFileSync(path.join(dir, 'psql'),
      `#!${process.execPath}\n`
      + `require('fs').writeFileSync(${JSON.stringify(registro)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }));\n`
      + `process.stdout.write('ruido\\n{"ok":true}\\n');\n`, { mode: 0o755 });
    const pathAntes = process.env.PATH;
    const alheioAntes = process.env.SEGREDO_ALHEIO;
    process.env.PATH = `${dir}${path.delimiter}${pathAntes}`;
    process.env.SEGREDO_ALHEIO = 'nao-deve-vazar';
    // Senha percent-encoded de propósito: é o formato que o Supabase entrega, e sem
    // decodeURIComponent a autenticação falharia com cara de credencial errada.
    const url = `postgres://divat_auditor_ci:se%2Fnh%40@db.${TESTE}.supabase.co:6543/postgres?sslmode=verify-full`;
    let saida;
    try {
      saida = comEnv({ [V_TESTE]: url }, () => conectarAuditor({ ambiente: 'teste' }).consultar('select 1;'));
    } finally {
      process.env.PATH = pathAntes;
      if (alheioAntes === undefined) delete process.env.SEGREDO_ALHEIO; else process.env.SEGREDO_ALHEIO = alheioAntes;
    }
    const reg = JSON.parse(fs.readFileSync(registro, 'utf8'));
    const argv = reg.argv.join(' ');
    ok(!argv.includes('se%2Fnh%40') && !argv.includes('se/nh@') && !argv.includes('postgres://'),
       'senha e URL não aparecem no argv do psql', argv);
    ok(argv.includes('select 1;'), 'o SQL chega ao psql');
    ok(reg.env.PGPASSWORD === 'se/nh@', 'PGPASSWORD chega decodificado', reg.env.PGPASSWORD);
    ok(reg.env.PGUSER === 'divat_auditor_ci', 'PGUSER chega decodificado', reg.env.PGUSER);
    ok(reg.env.PGHOST === `db.${TESTE}.supabase.co` && reg.env.PGPORT === '6543'
       && reg.env.PGDATABASE === 'postgres' && reg.env.PGSSLMODE === 'verify-full',
       'host/porta/banco/sslmode vêm da URL');
    ok(reg.env.SEGREDO_ALHEIO === undefined,
       'o env do filho é montado do zero (não herda process.env)', String(reg.env.SEGREDO_ALHEIO));
    ok(Object.keys(reg.env).sort().join(',') === 'PATH,PGDATABASE,PGHOST,PGPASSWORD,PGPORT,PGSSLMODE,PGUSER',
       'só PATH e as PG* vão para o filho', Object.keys(reg.env).sort().join(','));
    ok(saida.trim().split('\n').filter(Boolean).at(-1) === '{"ok":true}',
       'consultar devolve o stdout cru, para quem chama pegar a última linha');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('consultar — falha do psql vira Error, não sucesso silencioso');
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-test-'));
  try {
    fs.writeFileSync(path.join(dir2, 'psql'),
      `#!${process.execPath}\nprocess.stderr.write('FATAL: password authentication failed\\n');process.exit(2);\n`,
      { mode: 0o755 });
    const pathAntes = process.env.PATH;
    process.env.PATH = `${dir2}${path.delimiter}${pathAntes}`;
    let msg;
    try {
      msg = comEnv({ [V_TESTE]: `postgres://divat_auditor_ci:x@db.${TESTE}.supabase.co/postgres` },
                   () => erro(() => conectarAuditor({ ambiente: 'teste' }).consultar('select 1;')));
    } finally { process.env.PATH = pathAntes; }
    ok(/password authentication failed/.test(msg || ''), 'status != 0 lança com o stderr do psql', String(msg));
  } finally {
    fs.rmSync(dir2, { recursive: true, force: true });
  }

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
