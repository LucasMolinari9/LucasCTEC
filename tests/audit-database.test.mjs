// tests/audit-database.test.mjs — bancada do transporte compartilhado dos 4 gates com o auditor
// PostgreSQL de teste (scripts/lib/audit-database.mjs).
//
// Duas camadas:
//   1. validação da conexão (pura, sem processo filho) — cobre projeto ref, login exato
//      (direto/pooler), senha e sslmode, e prova que NENHUMA mensagem de erro ecoa o segredo
//      usado no teste;
//   2. invocação do psql — usa um psql FALSO (escrito para um diretório temporário a cada teste)
//      para provar que a URL/senha nunca chegam por argv (só por PGHOST/PGPORT/.../PGPASSWORD) e
//      que stderr do processo nunca é ecoado por este módulo.
//
// Roda com `node --test tests/audit-database.test.mjs`. Não precisa de rede nem de psql real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ENV_VAR,
  AuditDatabaseError,
  validarConexaoAuditora,
  carregarConfiguracaoAuditora,
  executarConsulta,
  auditarJson,
  executarFuncaoJson,
  executarFuncaoComoArray,
} from '../scripts/lib/audit-database.mjs';

const REF_TESTE = 'gontnlfmothfglssbyyk';
const REF_PRODUCAO = 'lwzsxuaqqeoamukduhev';
const SENHA_SECRETA = 'SEGREDO-DE-TESTE-NUNCA-DEVE-VAZAR-9f8a2c';

function url({
  host = `db.${REF_TESTE}.supabase.co`,
  user = 'divat_auditor_ci',
  password = SENHA_SECRETA,
  port = '',
  db = 'postgres',
  sslmode = 'require',
} = {}) {
  const auth = password ? `${user}:${password}` : user;
  const portaTxt = port ? `:${port}` : '';
  // null (não undefined — undefined cairia no valor-padrão da desestruturação) é o sentinela de
  // "sem sslmode na URL", para o caso 'sslmode ausente é recusado'.
  const query = sslmode === null ? '' : `?sslmode=${sslmode}`;
  return `postgresql://${auth}@${host}${portaTxt}/${db}${query}`;
}

// assert.throws() do Node devolve undefined, não o erro — captura à mão para poder inspecionar
// a mensagem (é exatamente a mensagem que este módulo promete nunca fazer vazar segredo).
function capturarErro(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new assert.AssertionError({ message: 'esperava que a função lançasse, mas ela não lançou' });
}

function assertRecusada(rawUrl, trechoEsperado) {
  const err = capturarErro(() => validarConexaoAuditora(rawUrl));
  assert.ok(err instanceof AuditDatabaseError, `esperava AuditDatabaseError, veio ${err?.constructor?.name}`);
  if (trechoEsperado) assert.match(err.message, trechoEsperado);
  // Propriedade central do contrato: nenhuma mensagem de erro pode ecoar o segredo, mesmo
  // quando a conexão é recusada por outro motivo (host, login, sslmode).
  assert.ok(!err.message.includes(SENHA_SECRETA), `mensagem de erro vazou a senha: ${err.message}`);
  if (rawUrl) assert.ok(!err.message.includes(rawUrl), 'mensagem de erro ecoou a URL bruta');
  return err;
}

// ---------------------------------------------------------------------------------------------
// 1. Secret ausente / URL inválida
// ---------------------------------------------------------------------------------------------

test('secret ausente é recusado', () => {
  assertRecusada(undefined, new RegExp(ENV_VAR));
  assertRecusada('', new RegExp(ENV_VAR));
});

test('URL malformada é recusada', () => {
  assertRecusada('isto não é uma url', /URL PostgreSQL válida/);
});

// ---------------------------------------------------------------------------------------------
// 2. Project ref — só o de teste; produção (e qualquer outro) é recusado
// ---------------------------------------------------------------------------------------------

test('project ref de produção é recusado (conexão direta)', () => {
  assertRecusada(url({ host: `db.${REF_PRODUCAO}.supabase.co` }), /recusada/);
});

test('project ref de produção é recusado (pooler)', () => {
  assertRecusada(
    url({ host: 'aws-0-sa-east-1.pooler.supabase.com', user: `divat_auditor_ci.${REF_PRODUCAO}` }),
    /recusada/,
  );
});

test('host desconhecido (nem direto nem pooler) é recusado', () => {
  assertRecusada(url({ host: 'db.outroref.supabase.co' }), /recusada/);
});

// ---------------------------------------------------------------------------------------------
// 3. Login — exatamente divat_auditor_ci (direto) ou divat_auditor_ci.<ref> (pooler)
// ---------------------------------------------------------------------------------------------

test('login com sufixo extra é recusado (conexão direta)', () => {
  assertRecusada(url({ user: 'divat_auditor_ci_extra' }), /recusada/);
});

test('login com prefixo extra é recusado (conexão direta)', () => {
  assertRecusada(url({ user: 'xdivat_auditor_ci' }), /recusada/);
});

test('login parecido mas diferente é recusado (conexão direta)', () => {
  assertRecusada(url({ user: 'divat_auditor' }), /recusada/);
});

test('login exato mas em host de pooler é recusado (formato trocado)', () => {
  assertRecusada(
    url({ host: 'aws-0-sa-east-1.pooler.supabase.com', user: 'divat_auditor_ci' }),
    /recusada/,
  );
});

test('login do pooler sem o sufixo do project ref é recusado', () => {
  assertRecusada(
    url({ host: 'aws-0-sa-east-1.pooler.supabase.com', user: 'divat_auditor_ci' }),
    /recusada/,
  );
});

test('login do pooler com sufixo a mais é recusado', () => {
  assertRecusada(
    url({ host: 'aws-0-sa-east-1.pooler.supabase.com', user: `divat_auditor_ci.${REF_TESTE}.extra` }),
    /recusada/,
  );
});

test('login direto usado com formato de host de pooler é recusado', () => {
  assertRecusada(
    url({ host: `db.${REF_TESTE}.supabase.co`, user: `divat_auditor_ci.${REF_TESTE}` }),
    /recusada/,
  );
});

// ---------------------------------------------------------------------------------------------
// 4. Senha obrigatória
// ---------------------------------------------------------------------------------------------

test('conexão sem senha é recusada', () => {
  assertRecusada(url({ password: '' }), /senha/);
});

// ---------------------------------------------------------------------------------------------
// 5. sslmode — achado do reviewer: disable tinha que passar a ser recusado
// ---------------------------------------------------------------------------------------------

test('sslmode=disable é recusado', () => {
  assertRecusada(url({ sslmode: 'disable' }), /sslmode/);
});

test('sslmode=allow é recusado', () => {
  assertRecusada(url({ sslmode: 'allow' }), /sslmode/);
});

test('sslmode=prefer é recusado', () => {
  assertRecusada(url({ sslmode: 'prefer' }), /sslmode/);
});

test('sslmode ausente é recusado', () => {
  assertRecusada(url({ sslmode: null }), /sslmode/);
});

for (const modo of ['require', 'verify-ca', 'verify-full']) {
  test(`sslmode=${modo} é aceito`, () => {
    const cfg = validarConexaoAuditora(url({ sslmode: modo }));
    assert.equal(cfg.sslmode, modo);
  });
}

// ---------------------------------------------------------------------------------------------
// 6. Caminho feliz — direto e pooler
// ---------------------------------------------------------------------------------------------

test('conexão direta válida é aceita e devolve config correta', () => {
  const cfg = validarConexaoAuditora(url({ port: '5432', db: 'postgres' }));
  assert.deepEqual(cfg, {
    host: `db.${REF_TESTE}.supabase.co`,
    port: '5432',
    database: 'postgres',
    user: 'divat_auditor_ci',
    password: SENHA_SECRETA,
    sslmode: 'require',
  });
});

test('conexão por pooler válida é aceita e devolve config correta', () => {
  const cfg = validarConexaoAuditora(url({
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    user: `divat_auditor_ci.${REF_TESTE}`,
    port: '6543',
  }));
  assert.deepEqual(cfg, {
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: '6543',
    database: 'postgres',
    user: `divat_auditor_ci.${REF_TESTE}`,
    password: SENHA_SECRETA,
    sslmode: 'require',
  });
});

test('carregarConfiguracaoAuditora lê exclusivamente ' + ENV_VAR, () => {
  const cfg = carregarConfiguracaoAuditora({
    [ENV_VAR]: url(),
    SB_URL: 'https://producao.supabase.co', // não deve ser lida nem usada como fallback
    SUPABASE_PROD_AUDIT_DATABASE_URL: url({ host: `db.${REF_PRODUCAO}.supabase.co` }),
  });
  assert.equal(cfg.host, `db.${REF_TESTE}.supabase.co`);
});

// ---------------------------------------------------------------------------------------------
// 7. Invocação do psql — psql FALSO, para provar o transporte sem tocar rede/segredo real
// ---------------------------------------------------------------------------------------------

async function criarPsqlFalso(modo, { stdout = '{}', stderr = '' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'divat-fake-psql-'));
  const caminho = join(dir, 'fake-psql.mjs');
  const debug = join(dir, 'debug.json');
  await writeFile(caminho, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(debug)}, JSON.stringify({
  argv: process.argv.slice(2),
  env: {
    PGHOST: process.env.PGHOST ?? null, PGPORT: process.env.PGPORT ?? null,
    PGDATABASE: process.env.PGDATABASE ?? null, PGUSER: process.env.PGUSER ?? null,
    PGPASSWORD: process.env.PGPASSWORD ?? null, PGSSLMODE: process.env.PGSSLMODE ?? null,
  },
}));
const modo = ${JSON.stringify(modo)};
if (modo === 'ok') {
  process.stdout.write(${JSON.stringify(stdout)} + '\\n');
  process.exit(0);
} else if (modo === 'fail') {
  process.stderr.write(${JSON.stringify(stderr)} + '\\n');
  process.exit(1);
}
`, 'utf8');
  await chmod(caminho, 0o755);
  return { dir, bin: caminho, debug };
}

async function limpar(dir) {
  await rm(dir, { recursive: true, force: true });
}

test('psql falso: caminho feliz não põe URL/senha em argv, só em env PG*', async () => {
  const forma = { tabelas: ['a'], funcoes: ['b'] };
  const { dir, bin, debug } = await criarPsqlFalso('ok', { stdout: JSON.stringify(forma) });
  try {
    const cfg = validarConexaoAuditora(url());
    const resultado = executarFuncaoJson(cfg, 'divat_security_shape', { psqlBin: bin });
    assert.deepEqual(resultado, forma);

    const { readFile } = await import('node:fs/promises');
    const dump = JSON.parse(await readFile(debug, 'utf8'));
    assert.equal(dump.env.PGPASSWORD, SENHA_SECRETA);
    assert.equal(dump.env.PGHOST, `db.${REF_TESTE}.supabase.co`);
    assert.equal(dump.env.PGSSLMODE, 'require');
    for (const arg of dump.argv) {
      assert.ok(!arg.includes(SENHA_SECRETA), `senha vazou em argv: ${arg}`);
      assert.ok(!arg.includes('://'), `URL de conexão vazou em argv: ${arg}`);
    }
  } finally {
    await limpar(dir);
  }
});

test('psql falso: stderr de falha nunca é ecoado pelo módulo', async () => {
  const stderrSensivel = `psql: FATAL: password authentication failed, tentativa com senha ${SENHA_SECRETA}`;
  const { dir, bin } = await criarPsqlFalso('fail', { stderr: stderrSensivel });
  try {
    const cfg = validarConexaoAuditora(url());
    const err = capturarErro(() => executarFuncaoJson(cfg, 'divat_security_shape', { psqlBin: bin }));
    assert.ok(err instanceof AuditDatabaseError);
    assert.ok(!err.message.includes(SENHA_SECRETA), 'stderr sensível vazou na mensagem de erro');
    assert.ok(!err.message.includes('FATAL'), 'stderr cru do psql foi ecoado');
  } finally {
    await limpar(dir);
  }
});

test('psql falso: JSON inválido na saída aborta em vez de assumir sucesso', async () => {
  const { dir, bin } = await criarPsqlFalso('ok', { stdout: 'isto não é json' });
  try {
    const cfg = validarConexaoAuditora(url());
    assert.throws(
      () => executarFuncaoJson(cfg, 'divat_security_shape', { psqlBin: bin }),
      AuditDatabaseError,
    );
  } finally {
    await limpar(dir);
  }
});

test('psql ausente (binário inexistente) aborta com mensagem genérica', () => {
  const cfg = validarConexaoAuditora(url());
  const err = capturarErro(() => executarFuncaoJson(cfg, 'divat_security_shape', { psqlBin: '/caminho/que/nao/existe/psql' }));
  assert.ok(err instanceof AuditDatabaseError);
  assert.ok(!err.message.includes(SENHA_SECRETA));
});

test('executarFuncaoComoArray agrega SETOF em array JSON (registro e escalar)', async () => {
  // divat_data_quality() é SETOF record — jsonb_agg(t) produz array de objetos. O psql falso
  // não roda SQL de verdade; aqui simulamos a RESPOSTA que o Postgres devolveria para a consulta
  // `select coalesce(jsonb_agg(t), '[]'::jsonb) from audit.<nome>() t`.
  const registros = [{ verificacao: 'codlinha_orfa', qtd: 3, detalhe: 'x' }];
  const { dir, bin } = await criarPsqlFalso('ok', { stdout: JSON.stringify(registros) });
  try {
    const cfg = validarConexaoAuditora(url());
    const resultado = executarFuncaoComoArray(cfg, 'divat_data_quality', { psqlBin: bin });
    assert.deepEqual(resultado, registros);
  } finally {
    await limpar(dir);
  }

  // realtime_tables() é SETOF text — jsonb_agg(t) produz array de strings.
  const tabelas = ['tabela_vista_teste', 'itinerario_teste'];
  const par2 = await criarPsqlFalso('ok', { stdout: JSON.stringify(tabelas) });
  try {
    const cfg = validarConexaoAuditora(url());
    const resultado = executarFuncaoComoArray(cfg, 'realtime_tables', { psqlBin: par2.bin });
    assert.deepEqual(resultado, tabelas);
  } finally {
    await limpar(par2.dir);
  }
});

test('executarFuncaoComoArray recusa resposta que não é lista', async () => {
  const { dir, bin } = await criarPsqlFalso('ok', { stdout: JSON.stringify({ nao: 'é array' }) });
  try {
    const cfg = validarConexaoAuditora(url());
    assert.throws(
      () => executarFuncaoComoArray(cfg, 'divat_data_quality', { psqlBin: bin }),
      AuditDatabaseError,
    );
  } finally {
    await limpar(dir);
  }
});

test('nome de função inválido é recusado ANTES de tentar rodar psql', () => {
  const cfg = validarConexaoAuditora(url());
  const err = capturarErro(() => executarFuncaoJson(cfg, 'nome; drop table x', { psqlBin: '/caminho/que/nao/existe/psql' }));
  assert.ok(err instanceof AuditDatabaseError);
  assert.match(err.message, /Nome de função de auditoria inválido/);
});

test('psql resolvido por PATH (comportamento padrão dos gates, sem psqlBin explícito)', async () => {
  const forma = { ok: true };
  const { dir, debug } = await criarPsqlFalso('ok', { stdout: JSON.stringify(forma) });
  const { rename } = await import('node:fs/promises');
  const psqlNoPath = join(dir, 'psql');
  await rename(join(dir, 'fake-psql.mjs'), psqlNoPath);
  await chmod(psqlNoPath, 0o755);

  const pathOriginal = process.env.PATH;
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${pathOriginal}`;
  try {
    const cfg = validarConexaoAuditora(url());
    const resultado = executarFuncaoJson(cfg, 'divat_security_shape'); // sem psqlBin — usa PATH
    assert.deepEqual(resultado, forma);
    const { readFile } = await import('node:fs/promises');
    const dump = JSON.parse(await readFile(debug, 'utf8'));
    assert.equal(dump.env.PGPASSWORD, SENHA_SECRETA);
  } finally {
    process.env.PATH = pathOriginal;
    await limpar(dir);
  }
});

test('auditarJson recusa saída completamente vazia', async () => {
  const { dir, bin } = await criarPsqlFalso('ok', { stdout: '' });
  try {
    const cfg = validarConexaoAuditora(url());
    assert.throws(() => auditarJson(cfg, 'select 1;', { psqlBin: bin }), AuditDatabaseError);
  } finally {
    await limpar(dir);
  }
});

test('executarConsulta devolve stdout cru para quem quiser interpretar diferente de JSON', async () => {
  const { dir, bin } = await criarPsqlFalso('ok', { stdout: 'texto qualquer' });
  try {
    const cfg = validarConexaoAuditora(url());
    const saida = executarConsulta(cfg, 'select 1;', { psqlBin: bin });
    assert.match(saida, /texto qualquer/);
  } finally {
    await limpar(dir);
  }
});
