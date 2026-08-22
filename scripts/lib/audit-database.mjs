// scripts/lib/audit-database.mjs — transporte compartilhado dos 4 gates vivos para o auditor
// PostgreSQL de teste (`divat_auditor_ci`), substituindo o PostgREST/anon usado até aqui.
//
// Por que existe: até esta mudança, check_grants.mjs / check_deriva.mjs / check_data_quality.mjs
// / check_realtime.mjs liam SB_URL/SB_KEY do app.js por regex e chamavam RPCs `public.*` como
// `anon` — sempre contra o projeto de PRODUÇÃO (`lwzsxuaqqeoamukduhev`), como o
// docs/adr/0002-ambiente-de-teste-isolado.md documentava. A migração
// `20260729034018_phase3_moderate_hardening.sql` (aplicada só no projeto de TESTE,
// `gontnlfmothfglssbyyk`) moveu essas quatro funções para o schema `audit` — no dia em que a
// mesma migração chegar a produção, o caminho antigo quebra de uma vez (ver
// docs/planos/fase-3-hardening-moderado.md, seção "Pré-requisito da promoção a produção"). Este
// módulo é o caminho novo: fala com o auditor mínimo (`divat_auditor_ci`, NOLOGIN exceto para
// este login externo, sem SELECT direto em tabela) do projeto de TESTE, pelo mesmo mecanismo já
// provado em scripts/check_phase3_audit.mjs — psql com a credencial só em variável de ambiente,
// nunca em argv nem em log.
//
// CONSEQUÊNCIA ACEITA (documentada, não escondida): os quatro gates passam a auditar o projeto de
// TESTE, não mais produção — produção não tem o schema `audit` ainda. Ver docs/seguranca.md § 10.
//
// Contrato de segurança (cada regra tem teste em tests/audit-database.test.mjs):
//   - lê exclusivamente SUPABASE_TEST_AUDIT_DATABASE_URL — nenhuma outra variável, nenhum
//     fallback para SB_URL/SB_KEY do app.js;
//   - aceita só o project ref de teste (gontnlfmothfglssbyyk), nunca produção nem qualquer outro;
//   - login precisa ser EXATAMENTE `divat_auditor_ci` (conexão direta) ou
//     `divat_auditor_ci.gontnlfmothfglssbyyk` (conexão por pooler) — login parecido, com
//     prefixo/sufixo a mais, é recusado (comparação por igualdade estrita, não startsWith/prefix);
//   - exige senha não vazia;
//   - só aceita sslmode require, verify-ca ou verify-full — disable (e qualquer outro valor,
//     inclusive ausente) é recusado;
//   - a URL e a senha nunca entram em argv do processo filho: viajam só por PGHOST/PGPORT/
//     PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE, que não aparecem em `ps`;
//   - nenhuma mensagem de erro deste módulo ecoa a URL, a senha ou o stderr do psql (que pode
//     conter host/usuário em mensagens de autenticação) — todo erro é texto genérico fixo aqui;
//   - falha SEMPRE fechado: secret ausente, URL inválida, psql ausente/erro, saída que não é
//     JSON válido — tudo aborta (lança AuditDatabaseError), nunca assume sucesso.
//
// Os quatro gates continuam INDEPENDENTES: cada um chama este módulo para UMA função de auditoria
// só seu, sem depender do resultado dos outros três (diferente de check_phase3_audit.mjs, que
// combina as quatro numa única consulta — propósito diferente, checagem agregada da Fase 3).

import { spawnSync } from 'node:child_process';

export const ENV_VAR = 'SUPABASE_TEST_AUDIT_DATABASE_URL';

const PROJECT_REF = 'gontnlfmothfglssbyyk';
const LOGIN_DIRETO = 'divat_auditor_ci';
const LOGIN_POOLER = `${LOGIN_DIRETO}.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const SSLMODES_ACEITOS = new Set(['require', 'verify-ca', 'verify-full']);
const NOME_FUNCAO_VALIDO = /^[a-z_][a-z0-9_]*$/;

export class AuditDatabaseError extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'AuditDatabaseError';
  }
}

function falhar(mensagem) {
  // Ponto único de erro do módulo: garante que toda mensagem passou por revisão de que não
  // carrega segredo. NUNCA interpole aqui a URL bruta, a senha ou stderr de processo filho.
  throw new AuditDatabaseError(mensagem);
}

// Recebe a URL bruta (normalmente process.env[ENV_VAR]) e devolve a configuração de conexão já
// validada, ou lança AuditDatabaseError com mensagem segura para log. Não lê process.env sozinha
// para ficar testável sem tocar variáveis globais.
export function validarConexaoAuditora(rawUrl) {
  if (!rawUrl) {
    falhar(`${ENV_VAR} não configurado. Este gate exige a credencial do auditor de teste — ver docs/planos/fase-3-hardening-moderado.md.`);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    falhar(`${ENV_VAR} não é uma URL PostgreSQL válida.`);
  }

  const user = decodeURIComponent(url.username || '');
  const isPoolerHost = url.hostname.endsWith('.pooler.supabase.com');
  const isDirectHost = url.hostname === DIRECT_HOST;
  const direto = isDirectHost && user === LOGIN_DIRETO;
  const pooler = isPoolerHost && user === LOGIN_POOLER;

  if (!direto && !pooler) {
    // Mensagem deliberadamente sem ecoar host/usuário recebidos: evita vazar até um começo de
    // ref/login real em log público de CI, e não muda o veredito (recusado é recusado).
    falhar('Conexão recusada: host e login não correspondem exatamente ao auditor de teste esperado ' +
      '(conexão direta exige divat_auditor_ci em db.gontnlfmothfglssbyyk.supabase.co; ' +
      'conexão por pooler exige divat_auditor_ci.gontnlfmothfglssbyyk em host *.pooler.supabase.com).');
  }

  if (!url.password) {
    falhar('Conexão recusada: a credencial auditora não contém senha.');
  }

  const sslmode = url.searchParams.get('sslmode');
  if (!SSLMODES_ACEITOS.has(sslmode)) {
    falhar(`Conexão recusada: sslmode '${sslmode || '(ausente)'}' não é aceito — use require, verify-ca ou verify-full.`);
  }

  return Object.freeze({
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.slice(1) || 'postgres',
    user,
    password: decodeURIComponent(url.password),
    sslmode,
  });
}

// Lê a variável de ambiente e valida — é o ponto de entrada normal de cada gate.
export function carregarConfiguracaoAuditora(env = process.env) {
  return validarConexaoAuditora(env[ENV_VAR]);
}

// Executa uma consulta SQL de UMA linha de saída via psql, com a credencial só em variável de
// ambiente (nunca em argv). Devolve o texto cru do stdout; quem chama decide como interpretar.
export function executarConsulta(config, sql, { psqlBin = 'psql' } = {}) {
  const child = spawnSync(psqlBin, ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      PGHOST: config.host,
      PGPORT: config.port,
      PGDATABASE: config.database,
      PGUSER: config.user,
      PGPASSWORD: config.password,
      PGSSLMODE: config.sslmode,
    },
  });

  if (child.error) {
    // child.error.message pode citar o nome do binário, nunca a URL/senha (não estão em argv) —
    // ainda assim fica genérico, para não depender desse detalhe de implementação do Node.
    falhar('Não foi possível executar o psql (binário ausente ou falha ao iniciar o processo).');
  }
  if (child.status !== 0) {
    // Deliberadamente NÃO ecoa child.stderr: mensagens de autenticação do Postgres podem citar
    // host/usuário/porta, e o contrato deste módulo é nunca imprimir nada que veio da conexão.
    falhar('psql terminou com falha ao consultar o auditor de teste (status ' + child.status + ').');
  }
  return child.stdout;
}

function ultimaLinhaNaoVazia(texto) {
  const linhas = texto.trim().split(/\r?\n/).filter(Boolean);
  return linhas.at(-1);
}

// Executa a consulta e interpreta a última linha não vazia do stdout como JSON.
export function auditarJson(config, sql, opts) {
  const stdout = executarConsulta(config, sql, opts);
  const linha = ultimaLinhaNaoVazia(stdout);
  if (!linha) {
    falhar('Saída do auditor está vazia; abortando em vez de assumir sucesso.');
  }
  try {
    return JSON.parse(linha);
  } catch {
    falhar('Saída do auditor não é JSON válido; abortando em vez de assumir sucesso.');
  }
}

function validarNomeFuncao(nome) {
  if (!NOME_FUNCAO_VALIDO.test(nome)) {
    // Defesa em profundidade: hoje `nome` é sempre um literal de string escrito no próprio gate,
    // nunca entrada externa — mas uma função que monta SQL por concatenação vale a checagem.
    falhar(`Nome de função de auditoria inválido: '${nome}'.`);
  }
}

// audit.<nome>() que já devolve jsonb (ex.: divat_security_shape, divat_api_shape) — um objeto.
export function executarFuncaoJson(config, nome, opts) {
  validarNomeFuncao(nome);
  return auditarJson(config, `select audit.${nome}();`, opts);
}

// audit.<nome>() SETOF (registro ou escalar) — agregado em array JSON no próprio Postgres, para
// sair como uma linha só. Cobre tanto divat_data_quality() (setof record) quanto
// realtime_tables() (setof text): jsonb_agg(t) produz array de objetos ou de escalares conforme
// o tipo de t, sem precisar de dois caminhos diferentes aqui.
export function executarFuncaoComoArray(config, nome, opts) {
  validarNomeFuncao(nome);
  const resultado = auditarJson(config, `select coalesce(jsonb_agg(t), '[]'::jsonb) from audit.${nome}() t;`, opts);
  if (!Array.isArray(resultado)) {
    falhar(`audit.${nome}() não devolveu uma lista — abortando em vez de assumir vazio.`);
  }
  return resultado;
}
