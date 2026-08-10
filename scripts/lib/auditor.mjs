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
// Aceitar dois refs conhecidos NAO e aceitar qualquer um: ref desconhecido, login diferente de
// `divat_auditor_ci`, URL sem senha e `sslmode` abaixo do piso continuam recusados.
//
// Lanca `Error` em vez de chamar `process.exit`: quem decide sair e o call site. O
// check_data_quality.mjs (Tarefa 8) precisa CAPTURAR a falha para cair no fallback datado, e um
// `process.exit` aqui dentro tornaria isso impossivel.

import { spawnSync } from 'node:child_process';

// Reexportado, nao redeclarado: ate 10/08/2026 esta lista era uma COPIA da de lib/ambiente.mjs, e
// duas listas de project ref mantidas a mao sao duas listas que divergem.
import { REFS } from './ambiente.mjs';
export { REFS };

const VARIAVEL = {
  producao: 'SUPABASE_PROD_AUDIT_DATABASE_URL',
  teste: 'SUPABASE_TEST_AUDIT_DATABASE_URL',
};

// O login EXATO do auditor, nao um prefixo: o bootstrap_phase3_auditor.sql cria `divat_auditor_ci`
// com esse nome, e o compromisso de rotacao em scripts/prazos.json e da SENHA (VALID UNTIL), nao
// do nome — entao nao ha variante legitima a acomodar.
export const LOGIN = 'divat_auditor_ci';

// Piso de TLS da conexao. O antigo `sslmode` da URL com `|| 'require'` era default para a URL que
// nao diz NADA; uma dizendo `sslmode=disable` passava direto, e ai quem decidia o piso era o texto
// do secret, nao o codigo. Estes tres verificam o certificado do servidor em algum grau; `disable`,
// `allow` e `prefer` aceitam cair para texto claro.
const SSLMODES_SEGUROS = ['require', 'verify-ca', 'verify-full'];

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

  // Confere a forma DECODIFICADA, que e a que chega ao PGUSER: comparar o texto cru deixaria
  // `divat_auditor_ci%2Evil` (→ `divat_auditor_ci.vil`) passar por uma checagem de prefixo e
  // chegar ao psql como outro login.
  let usuario;
  try { usuario = decodeURIComponent(url.username); }
  catch { throw new Error(`${variavel} tem usuário com escape percent inválido.`); }

  // Aceita a conexao direta OU o pooler. Runner do GitHub e IPv4, e a conexao direta do Supabase
  // e IPv6 — na pratica o caminho que funciona no CI e o pooler.
  const direto = url.hostname === `db.${ref}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && usuario.endsWith(`.${ref}`);
  // No pooler o usuario e `<login>.<ref>`; no direto, o login puro. Comparar o LOGIN inteiro, e nao
  // o comeco da string: `startsWith` aceitava `divat_auditor_civil`, `divat_auditor_ci_backup` e
  // `divat_auditor_ci2` como se fossem o auditor (issue #101).
  const login = pooler ? usuario.slice(0, -(ref.length + 1)) : usuario;
  if ((!direto && !pooler) || login !== LOGIN) {
    throw new Error(`Conexão recusada: host/project ref ou login não pertence ao auditor de ${ambiente}.`);
  }
  if (!url.password) {
    throw new Error('Conexão recusada: a credencial auditora não contém senha.');
  }
  // Recusa ANTES de conectar, e nao no momento da query: secret mal colado tem de falhar na
  // guarda, onde a mensagem diz o que houve.
  const sslmode = url.searchParams.get('sslmode') || 'require';
  if (!SSLMODES_SEGUROS.includes(sslmode)) {
    throw new Error(`Conexão recusada: sslmode='${sslmode}' não protege a conexão. Use ${SSLMODES_SEGUROS.join(', ')}.`);
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
          PGUSER: usuario,
          PGPASSWORD: decodeURIComponent(url.password),
          PGSSLMODE: sslmode,
        },
      });
      if (child.error) throw new Error(`Não foi possível executar psql: ${child.error.message}`);
      if (child.status !== 0) throw new Error(child.stderr.trim() || `psql terminou com status ${child.status}`);
      return child.stdout;
    },
  };
}
