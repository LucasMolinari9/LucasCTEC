// Executa as RPCs diagnósticas pelo login PostgreSQL mínimo da Fase 3.
// A URL nunca é passada na linha de comando nem impressa.
import { spawnSync } from 'node:child_process';

const PROJECT_REF = 'gontnlfmothfglssbyyk';
const LOGIN_PREFIX = 'divat_auditor_ci';
const rawUrl = process.env.SUPABASE_TEST_AUDIT_DATABASE_URL;

if (!rawUrl) {
  console.error('SUPABASE_TEST_AUDIT_DATABASE_URL não configurado. Consulte docs/planos/fase-3-hardening-moderado.md.');
  process.exit(1);
}

let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error('SUPABASE_TEST_AUDIT_DATABASE_URL não é uma URL PostgreSQL válida.');
  process.exit(1);
}

const directHost = `db.${PROJECT_REF}.supabase.co`;
const pooler = url.hostname.endsWith('.pooler.supabase.com') && url.username.endsWith(`.${PROJECT_REF}`);
const direct = url.hostname === directHost;
if ((!direct && !pooler) || !url.username.startsWith(LOGIN_PREFIX)) {
  console.error('Conexão recusada: host/project ref ou login não pertence ao auditor do Supabase de teste.');
  process.exit(1);
}
if (!url.password) {
  console.error('Conexão recusada: a credencial auditora não contém senha.');
  process.exit(1);
}

const query = String.raw`
with payload as (
  select
    audit.divat_api_shape() as api,
    audit.divat_security_shape() as security,
    (select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from audit.realtime_tables() t) as realtime,
    (select count(*) from audit.divat_data_quality()) as data_quality_rows
)
select jsonb_build_object(
  'api_rpcs', api->'rpcs',
  'public_objects', jsonb_array_length(security->'tabelas'),
  'all_rls', not exists (
    select 1 from jsonb_array_elements(security->'tabelas') t where not (t->>'rls')::boolean
  ),
  'anon_rpcs', coalesce((
    select jsonb_agg(f->>'assinatura' order by f->>'assinatura')
    from jsonb_array_elements(security->'funcoes') f where (f->>'anon_execute')::boolean
  ), '[]'::jsonb),
  'authenticated_exec_count', (
    select count(*) from jsonb_array_elements(security->'funcoes') f
    where (f->>'authenticated_execute')::boolean
  ),
  'realtime_count', jsonb_array_length(realtime),
  'data_quality_rows', data_quality_rows,
  'direct_table_select', has_table_privilege(current_user, 'public.tabela_vista_teste', 'select'),
  'session_user', session_user
)
from payload;
`;

const child = spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query], {
  encoding: 'utf8',
  env: {
    PATH: process.env.PATH,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: url.pathname.slice(1) || 'postgres',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
  },
});

if (child.error) {
  console.error(`Não foi possível executar psql: ${child.error.message}`);
  process.exit(1);
}
if (child.status !== 0) {
  console.error(child.stderr.trim() || `psql terminou com status ${child.status}`);
  process.exit(1);
}

let shape;
try {
  const line = child.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
  shape = JSON.parse(line);
} catch {
  console.error('Saída do auditor não é JSON válido; abortando em vez de assumir sucesso.');
  process.exit(1);
}

const expectedRpcs = ['divat_busca_logradouro', 'divat_linhas_regiao'];
const expectedSignatures = ['divat_busca_logradouro(text,integer)', 'divat_linhas_regiao(text,text)'];
const checks = [
  [JSON.stringify([...(shape.api_rpcs || [])].sort()) === JSON.stringify(expectedRpcs), 'API expõe RPCs além da allowlist'],
  [JSON.stringify(shape.anon_rpcs) === JSON.stringify(expectedSignatures), 'grants anônimos de função divergiram'],
  [shape.authenticated_exec_count === 0, 'authenticated voltou a executar função pública'],
  [shape.public_objects >= 18 && shape.all_rls === true, 'objeto público sem RLS ou catálogo incompleto'],
  [shape.realtime_count === 14, 'publicação Realtime divergiu das 14 tabelas'],
  [shape.direct_table_select === false, 'credencial auditora ganhou leitura direta de tabela'],
  [typeof shape.data_quality_rows === 'number', 'RPC de qualidade não pôde ser executada'],
  [String(shape.session_user || '').startsWith(LOGIN_PREFIX), 'checagem não executou com o login auditor dedicado'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('✗ Auditoria PostgreSQL da Fase 3 falhou:');
  for (const message of failed) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`✓ Auditor mínimo: ${shape.public_objects} objetos públicos, ${shape.realtime_count} tabelas Realtime, RPCs anônimas na allowlist.`);
