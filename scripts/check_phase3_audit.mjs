// Executa as RPCs diagnosticas pelo login PostgreSQL minimo da Fase 3.
//
// Ambiente por argumento (`node scripts/check_phase3_audit.mjs teste`) ou por DIVAT_ALVO, como os
// demais gates. NAO HA DEFAULT: ate 10/08/2026 este script fazia `process.argv[2] || 'teste'`, o
// que contradizia a regra que o proprio lib/ambiente.mjs enuncia em maiusculas — e, como o
// workflow o invoca sem argumento, o alvo de producao era INALCANCAVEL por ali, justamente no
// workflow que deveria validar a credencial e a migracao de producao (Codex, P1).
// Ate 04/08/2026 este script travava o ref de TESTE e recusava producao de proposito. Isso
// deixou de servir quando a Fase 3 passou a ser aplicavel em producao — e check_data_quality
// depende deste mesmo caminho la. A recusa de ref DESCONHECIDO continua, que e o que protege.
// A guarda de ref/login/senha e a montagem do psql moram em scripts/lib/auditor.mjs, para nao
// divergirem entre os dois gates. A URL nunca e passada na linha de comando nem impressa.
import { conectarAuditor, LOGIN } from './lib/auditor.mjs';

const ambiente = process.argv[2] || process.env.DIVAT_ALVO;
if (!ambiente) {
  console.error('Alvo não definido. Use `node scripts/check_phase3_audit.mjs <teste|producao>` '
    + 'ou DIVAT_ALVO. Não há default: um default silencioso é como um gate acaba falando com o '
    + 'banco errado (issue #74).');
  process.exit(1);
}
let auditor;
try {
  auditor = conectarAuditor({ ambiente });
} catch (e) {
  console.error(e.message);
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

let saida;
try {
  saida = auditor.consultar(query);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let shape;
try {
  const line = saida.trim().split(/\r?\n/).filter(Boolean).at(-1);
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
  // Igualdade, não `startsWith`, e a constante do auditor em vez do literal repetido: um role
  // `divat_auditor_civil` satisfazia esta asserção como se fosse o auditor (issue #101). O
  // `session_user` devolve o nome do role mesmo pelo pooler, que tira o sufixo `.<ref>` no
  // roteamento — não há forma legítima com sufixo a acomodar aqui.
  [String(shape.session_user || '') === LOGIN, 'checagem não executou com o login auditor dedicado'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('✗ Auditoria PostgreSQL da Fase 3 falhou:');
  for (const message of failed) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`✓ Auditor mínimo: ${shape.public_objects} objetos públicos, ${shape.realtime_count} tabelas Realtime, RPCs anônimas na allowlist.`);
