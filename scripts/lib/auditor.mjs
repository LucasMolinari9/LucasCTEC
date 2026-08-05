// auditor.mjs — conexao PostgreSQL pelo login minimo da Fase 3.
//
// Existe porque DOIS gates precisam dela (check_phase3_audit.mjs e check_data_quality.mjs) e a
// guarda de project ref e a parte que nao pode divergir entre eles: e ela que impede um secret
// mal colado apontar um gate de teste para produção, ou vice-versa.
//
// A URL nunca e passada na linha de comando nem impressa — vai por variavel de ambiente do
// processo filho, para nao aparecer em `ps` nem em log de CI. As mensagens de erro citam o NOME
// da variavel, nunca o valor.
//
// Aceitar dois refs conhecidos NAO e aceitar qualquer um: ref desconhecido, login fora do prefixo
// `divat_auditor_ci` e URL sem senha continuam recusados.
//
// Lanca `Error` em vez de chamar `process.exit`: quem decide sair e o call site. O
// check_data_quality.mjs (Tarefa 8) precisa CAPTURAR a falha para cair no fallback datado, e um
// `process.exit` aqui dentro tornaria isso impossivel.

import { spawnSync } from 'node:child_process';

export const REFS = {
  producao: 'lwzsxuaqqeoamukduhev',
  teste: 'gontnlfmothfglssbyyk',
};

const VARIAVEL = {
  producao: 'SUPABASE_PROD_AUDIT_DATABASE_URL',
  teste: 'SUPABASE_TEST_AUDIT_DATABASE_URL',
};

const LOGIN_PREFIX = 'divat_auditor_ci';

export function conectarAuditor({ ambiente }) {
  const ref = REFS[ambiente];
  const variavel = VARIAVEL[ambiente];
  if (!ref) throw new Error(`Ambiente desconhecido: '${ambiente}'. Use 'producao' ou 'teste'.`);

  const bruto = process.env[variavel];
  if (!bruto) {
    throw new Error(`${variavel} não configurado. Consulte docs/planos/fase-3-hardening-moderado.md.`);
  }

  let url;
  try { url = new URL(bruto); }
  catch { throw new Error(`${variavel} não é uma URL PostgreSQL válida.`); }

  // Aceita a conexao direta OU o pooler. Runner do GitHub e IPv4, e a conexao direta do Supabase
  // e IPv6 — na pratica o caminho que funciona no CI e o pooler.
  const direto = url.hostname === `db.${ref}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && url.username.endsWith(`.${ref}`);
  if ((!direto && !pooler) || !url.username.startsWith(LOGIN_PREFIX)) {
    throw new Error(`Conexão recusada: host/project ref ou login não pertence ao auditor de ${ambiente}.`);
  }
  if (!url.password) {
    throw new Error('Conexão recusada: a credencial auditora não contém senha.');
  }

  return {
    ambiente, ref,
    consultar(sql) {
      const child = spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
        encoding: 'utf8',
        // `env` montado explicitamente (so PATH + as PG*): nao herda process.env inteiro, para
        // nao levar segredo alheio ao psql nem depender de PG* de fora.
        env: {
          PATH: process.env.PATH,
          PGHOST: url.hostname,
          PGPORT: url.port || '5432',
          PGDATABASE: url.pathname.slice(1) || 'postgres',
          // decodeURIComponent porque a senha do Supabase costuma vir percent-encoded na URL;
          // sem isso a autenticacao falha com erro que parece de credencial errada.
          PGUSER: decodeURIComponent(url.username),
          PGPASSWORD: decodeURIComponent(url.password),
          PGSSLMODE: url.searchParams.get('sslmode') || 'require',
        },
      });
      if (child.error) throw new Error(`Não foi possível executar psql: ${child.error.message}`);
      if (child.status !== 0) throw new Error(child.stderr.trim() || `psql terminou com status ${child.status}`);
      return child.stdout;
    },
  };
}
