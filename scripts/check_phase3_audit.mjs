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

// A migração 2 (20260805000000) devolveu divat_api_shape() e realtime_tables() para `public`,
// anônimas — só divat_security_shape() e divat_data_quality() ficaram em `audit`. Até 10/08/2026
// este script ainda chamava audit.divat_api_shape() e audit.realtime_tables(), então o job
// test-auditor quebrava com "função não existe" em vez de validar o rollout (Codex, P1). A
// superfície pública inteira (as 5 RPCs anônimas — produto + diagnóstico) já sai de
// `divat_security_shape()->'funcoes'`, filtrada a `public` e `anon_execute`: não há razão para
// chamar divat_api_shape()/realtime_tables() a partir daqui só para redizer o que a shape já lista.
const query = String.raw`
with payload as (
  select
    audit.divat_security_shape() as security,
    (select count(*) from audit.divat_data_quality()) as data_quality_rows
)
select jsonb_build_object(
  'anon_rpcs', coalesce((
    select jsonb_agg(f->>'assinatura' order by f->>'assinatura')
    from jsonb_array_elements(security->'funcoes') f where (f->>'anon_execute')::boolean
  ), '[]'::jsonb),
  'public_objects', jsonb_array_length(security->'tabelas'),
  'all_rls', not exists (
    select 1 from jsonb_array_elements(security->'tabelas') t where not (t->>'rls')::boolean
  ),
  'authenticated_exec_count', (
    select count(*) from jsonb_array_elements(security->'funcoes') f
    where (f->>'authenticated_execute')::boolean
  ),
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

// As CINCO RPCs anônimas pós-migração-2 (produto + diagnóstico — spec 04/08/2026 §8), na mesma
// ordem que o autoteste da própria migração assertiva (20260805000000): 3 diagnósticas de
// catálogo (divat_api_shape, divat_security_digest, realtime_tables) + 2 de produto
// (divat_busca_logradouro, divat_linhas_regiao). `assinatura` vem de `regprocedure::text`, que não
// usa espaço depois da vírgula — conferido contra Postgres 16 local (o formato não muda no 17).
const expectedAnonRpcs = [
  'divat_api_shape()',
  'divat_busca_logradouro(text,integer)',
  'divat_linhas_regiao(text,text)',
  'divat_security_digest()',
  'realtime_tables()',
];
const checks = [
  [JSON.stringify(shape.anon_rpcs) === JSON.stringify(expectedAnonRpcs), 'RPCs anônimas em public divergiram da allowlist pós-migração-2'],
  [shape.authenticated_exec_count === 0, 'authenticated voltou a executar função pública'],
  [shape.public_objects >= 18 && shape.all_rls === true, 'objeto público sem RLS ou catálogo incompleto'],
  // Inteiro E maior que zero: a função sempre devolve uma linha por verificação (inclusive
  // qtd=0), desde a migração 3 (20260810000000) — `0` aqui não é "nenhum achado", é a RPC não
  // ter executado uma varredura sequer, ou seja, exatamente a cegueira que o runner de qualidade
  // (check_data_quality.mjs) também recusa a aceitar como "tudo certo".
  [Number.isInteger(shape.data_quality_rows) && shape.data_quality_rows > 0, 'RPC de qualidade não devolveu nenhuma linha (não pôde ser executada, ou a fonte cegou)'],
  [shape.direct_table_select === false, 'credencial auditora ganhou leitura direta de tabela'],
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

console.log(`✓ Auditor mínimo: ${shape.public_objects} objetos públicos, ${shape.data_quality_rows} linha(s) de qualidade, RPCs anônimas na allowlist.`);
