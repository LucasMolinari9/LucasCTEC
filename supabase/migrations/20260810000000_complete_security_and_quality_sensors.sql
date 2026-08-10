-- Fase 3, migração 3 — completa os dois sensores que a revisão do Codex (PR #98, 10/08/2026)
-- encontrou incompletos. NÃO edita as migrações 1 (20260729034018) e 2 (20260805000000): as duas
-- já estão aplicadas no banco de TESTE (ver scripts/security_baseline.json, `ambientes.teste`), e
-- editar uma migração aplicada faz o arquivo parar de descrever o banco que existe. Esta é uma
-- terceira migração, com CREATE OR REPLACE, sobre os dois mesmos objetos.
--
-- ACHADO 1 — o digest de segurança (public.divat_security_digest()) só somava SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE(+MAINTAIN só para anon) na CTE `priv`. Um `GRANT REFERENCES` ou
-- `GRANT TRIGGER` a `authenticated` — ou um `GRANT MAINTAIN` a `authenticated` — não aparecia em
-- lugar NENHUM: nem na serialização canônica (o digest ficava byte-idêntico) nem em
-- `authenticated_tem_privilegio` (que só olhava cinco dos oito privilégios de tabela). O booleano
-- E o hash falhavam JUNTOS — nem o alarme fixo nem a detecção de mudança estrutural enxergavam o
-- grant. Isto importa em particular aqui porque o CLAUDE.md documenta, como LIMITAÇÃO ATIVA, um
-- conjunto de default privileges do `supabase_admin` — não fechável, `postgres` não é
-- superusuário no Supabase — que reconcede a objeto NOVO exatamente
-- `DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` para anon E
-- authenticated (108 grants medidos ao criar um projeto novo). Os três privilégios ausentes do
-- sensor são justamente três dos que essa porta reabre sozinha.
--
-- ACHADO 2 — audit.divat_data_quality() só emitia linha quando a contagem era > 0. Resultado: o
-- runner (scripts/check_data_quality.mjs) não conseguia distinguir "banco limpo" de "a fonte
-- perdeu a visão do banco" — as duas causas produzem `[]` igualzinho. A correção do lado do
-- runner (tratar `[]` como cegueira incondicional) só fecha o buraco de verdade se a FONTE parar
-- de usar lista vazia para as duas coisas — daí a função vir para esta mesma migração.
--
-- RODE DENTRO DE BEGIN/COMMIT (ou `psql --single-transaction`) — mesma exigência da migração 2, e
-- pelo mesmo motivo: o autoteste usa `set local role anon`/`set local role divat_auditor`, que
-- fora de transação só emite WARNING e não faz nada; a guarda do `current_user`/`session_user`
-- pega isso e aborta, mas com autocommit por instrução os REVOKEs finais não rodam e as roles de
-- auditoria ficam concedidas a `postgres` com a migração meio aplicada. Rerodar aborta na
-- pré-condição; a saída é o rollback.
--
-- ORDEM DAS DUAS PRIMEIRAS INSTRUÇÕES É LOAD-BEARING, mesmo motivo da migração 2: `postgres` não
-- tem USAGE em `audit` por padrão (a migração 1 passou o dono do schema para `divat_audit_owner`
-- e concedeu USAGE só a `divat_auditor`), então um `to_regprocedure('audit.<f>()')` levantaria
-- `permission denied for schema audit` ANTES da pré-condição rodar, com um erro que parece dizer
-- que a pré-condição está errada.
grant divat_audit_owner, divat_auditor to postgres;

do $$
begin
  if to_regnamespace('private') is null or to_regnamespace('audit') is null then
    raise exception 'Precondicao falhou: schemas private/audit ausentes — as migracoes anteriores nao foram aplicadas aqui';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'divat_audit_owner')
     or not exists (select 1 from pg_roles where rolname = 'divat_auditor') then
    raise exception 'Precondicao falhou: papeis de auditoria ausentes';
  end if;

  if to_regprocedure('public.divat_security_digest()') is null
     or to_regprocedure('audit.divat_data_quality()') is null then
    raise exception 'Precondicao falhou: divat_security_digest (public) ou divat_data_quality (audit) ausentes — aplique 20260729034018 e 20260805000000 primeiro';
  end if;

  -- Idempotência por CONTEÚDO, não por existência (create or replace não falha em reaplicar
  -- sozinho): `anon_referencia` só existe na serialização canônica DEPOIS desta migração. Se já
  -- estiver lá, rodar de novo não quebraria nada, mas seria uma reaplicação despercebida — melhor
  -- parar e avisar do que confiar em CREATE OR REPLACE ser sempre um no-op inofensivo.
  if pg_get_functiondef('public.divat_security_digest()'::regprocedure) like '%anon_referencia%' then
    raise exception 'Precondicao falhou: public.divat_security_digest() ja inclui anon_referencia — esta migracao ja foi aplicada aqui';
  end if;
end $$;

-- --- ACHADO 1: digest com a matriz COMPLETA de privilégios de tabela -------------------------
--
-- OITO privilégios de tabela, para os dois papéis (anon e authenticated) — os únicos que o
-- Postgres reconhece em `has_table_privilege`: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES, TRIGGER, MAINTAIN. Os três que entram agora (REFERENCES, TRIGGER, e MAINTAIN para
-- authenticated — MAINTAIN de anon já existia) são exatamente os que a limitação ativa do
-- supabase_admin (CLAUDE.md) reconcede sozinha a objeto novo.
--
-- has_any_column_privilege ao lado de has_table_privilege continua só para os privilégios que o
-- Postgres aceita em GRANT por COLUNA: SELECT, INSERT, UPDATE, REFERENCES. DELETE, TRUNCATE,
-- TRIGGER e MAINTAIN são só de tabela inteira — não existe `GRANT DELETE (coluna)`, então
-- has_table_privilege sozinho já é a resposta completa para esses quatro; chamar
-- has_any_column_privilege com um privilégio que não aceita coluna lançaria erro em vez de
-- devolver false.
create or replace function public.divat_security_digest()
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
with tabelas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
priv as (
  select t.relname, t.relrowsecurity,
         (has_table_privilege('anon', t.oid, 'SELECT')      or has_any_column_privilege('anon', t.oid, 'SELECT'))      as anon_select,
         (has_table_privilege('anon', t.oid, 'INSERT')     or has_any_column_privilege('anon', t.oid, 'INSERT'))     as anon_insert,
         (has_table_privilege('anon', t.oid, 'UPDATE')     or has_any_column_privilege('anon', t.oid, 'UPDATE'))     as anon_update,
         has_table_privilege('anon', t.oid, 'DELETE')                                                        as anon_delete,
         has_table_privilege('anon', t.oid, 'TRUNCATE')                                                      as anon_truncate,
         has_table_privilege('anon', t.oid, 'MAINTAIN')                                                      as anon_maintain,
         (has_table_privilege('anon', t.oid, 'REFERENCES') or has_any_column_privilege('anon', t.oid, 'REFERENCES')) as anon_references,
         has_table_privilege('anon', t.oid, 'TRIGGER')                                                       as anon_trigger,
         (has_table_privilege('authenticated', t.oid, 'SELECT') or has_any_column_privilege('authenticated', t.oid, 'SELECT')) as auth_select,
         (has_table_privilege('authenticated', t.oid, 'INSERT') or has_any_column_privilege('authenticated', t.oid, 'INSERT')) as auth_insert,
         (has_table_privilege('authenticated', t.oid, 'UPDATE') or has_any_column_privilege('authenticated', t.oid, 'UPDATE')) as auth_update,
         has_table_privilege('authenticated', t.oid, 'DELETE')                                                as auth_delete,
         has_table_privilege('authenticated', t.oid, 'TRUNCATE')                                              as auth_truncate,
         has_table_privilege('authenticated', t.oid, 'MAINTAIN')                                              as auth_maintain,
         (has_table_privilege('authenticated', t.oid, 'REFERENCES') or has_any_column_privilege('authenticated', t.oid, 'REFERENCES')) as auth_references,
         has_table_privilege('authenticated', t.oid, 'TRIGGER')                                               as auth_trigger
  from tabelas t
),
-- Views/matviews: `has_any_column_privilege` entra aqui também, e por motivo mais grave que em
-- `priv` — `anon_le_view` (mais abaixo) é indicador FIXO, não dado de baseline. Até esta correção,
-- `GRANT SELECT (coluna) ON alguma_view TO anon` sem grant de tabela inteira deixava `anon_select`
-- falso aqui, `anon_le_view` falso no digest, e a leitura passava DESPERCEBIDA — a mesma classe de
-- bypass de RLS que `anon_le_view` existe para pegar, só que pela porta que ele não olhava
-- (Codex, achado da 2ª rodada de revisão).
vis as (
  select c.relname, c.relkind::text as relkind,
         (has_table_privilege('anon', c.oid, 'SELECT')          or has_any_column_privilege('anon', c.oid, 'SELECT'))          as anon_select,
         (has_table_privilege('authenticated', c.oid, 'SELECT') or has_any_column_privilege('authenticated', c.oid, 'SELECT')) as auth_select,
         coalesce((select true from unnest(coalesce(c.reloptions, '{}'::text[])) o
                   where o like 'security\_invoker=%'), false) as security_invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
),
-- POLÍTICAS: até esta correção só `polname`+`polcmd` entravam no digest. Uma policy existente
-- podia ter seu `USING`/`WITH CHECK` trocado por `true`, ou seus papéis alargados de `anon` para
-- `anon, authenticated`, sem mudar nome nem comando — o digest ficava byte-idêntico. `polroles`
-- (papéis alcançados, resolvidos para nome — `polroles = '{0}'` é o caso ALL/PUBLIC, e
-- `0::regrole` imprime `-`), `polpermissive` (PERMISSIVE x RESTRICTIVE muda como a policy combina
-- com as outras) e `polqual`/`polwithcheck` (o predicado em si, via `pg_get_expr` — NULL é
-- legítimo: policy só-INSERT não tem `USING`, só-SELECT não tem `WITH CHECK`) entram na
-- serialização (Codex, achado da 2ª rodada de revisão).
pols as (
  select c.relname, p.polname, p.polcmd::text as polcmd, p.polpermissive,
         coalesce((select string_agg(r::regrole::text, ',' order by r::regrole::text)
                   from unnest(p.polroles) r), '') as polroles,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '')      as polqual,
         coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as polwithcheck
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
funcs as (
  select n.nspname as schema,
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as assinatura,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         p.prosecdef,
         coalesce((select true from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
                   where cfg like 'search\_path=%'), false)        as search_path_fixo
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','audit','private') and p.prokind = 'f'
),
defaults as (
  select d.defaclobjtype::text as tipo,
         coalesce(ns.nspname, '-') as schema,
         pg_get_userbyid(d.defaclrole) as dono,
         d.defaclacl::text[] as acl
  from pg_default_acl d
  left join pg_namespace ns on ns.oid = d.defaclnamespace
),
defaults_perm as (
  select dono, schema, tipo,
         (select string_agg(a, ',' order by a) from unnest(acl) a
          where a like '=%' or a like 'anon=%' or a like 'authenticated=%') as concessoes
  from defaults
  where exists (select 1 from unnest(acl) a
                where a like '=%' or a like 'anon=%' or a like 'authenticated=%')
),
canonico as (
  select
    -- OITO colunas por papel agora (era cinco para anon, cinco para authenticated). A ORDEM é
    -- fixa e documentada aqui porque é ela que qualquer humano lendo um digest antigo x novo
    -- precisa para saber qual dígito é qual privilégio: select,insert,update,delete,truncate,
    -- maintain,references,trigger.
    coalesce((select string_agg(
        relname || '|' || relrowsecurity::int
          || '|a' || anon_select::int || anon_insert::int || anon_update::int
                  || anon_delete::int || anon_truncate::int || anon_maintain::int
                  || anon_references::int || anon_trigger::int
          || '|u' || auth_select::int || auth_insert::int || auth_update::int
                  || auth_delete::int || auth_truncate::int || auth_maintain::int
                  || auth_references::int || auth_trigger::int,
        E'\n' order by relname collate "C") from priv), '')
    || E'\n==\n' ||
    coalesce((select string_agg(relname || '|' || relkind || '|' || anon_select::int
                                 || auth_select::int || security_invoker::int,
        E'\n' order by relname collate "C") from vis), '')
    || E'\n==\n' ||
    coalesce((select string_agg(relname || '|' || polname || '|' || polcmd || '|' || polpermissive::int
                                 || '|' || polroles || '|' || polqual || '|' || polwithcheck,
        E'\n' order by relname collate "C", polname collate "C") from pols), '')
    || E'\n==\n' ||
    coalesce((select string_agg(assinatura || '|' || anon_exec::int || auth_exec::int
                                 || prosecdef::int || search_path_fixo::int,
        E'\n' order by assinatura collate "C") from funcs), '')
    || E'\n==\n' ||
    coalesce((select string_agg(dono || '|' || schema || '|' || tipo || '|' || concessoes,
        E'\n' order by dono collate "C", schema collate "C", tipo collate "C") from defaults_perm), '')
    as texto
)
select jsonb_build_object(
  'digest', encode(sha256(convert_to((select texto from canonico), 'UTF8')), 'hex'),
  'tabelas_publicas', (select count(*) from priv),
  'todas_com_rls', coalesce((select bool_and(relrowsecurity) from priv), false),
  'anon_escreve', coalesce((select bool_or(anon_insert or anon_update or anon_delete or anon_truncate) from priv), true),
  'anon_maintain', coalesce((select bool_or(anon_maintain) from priv), true),
  -- NOVOS indicadores graves de anon (achado 1, itens 3 e 6 da revisão): REFERENCES permite criar
  -- FK apontando para a tabela a partir de qualquer papel que possa criar tabela; TRIGGER permite
  -- anexar função de gatilho na tabela. Nenhum dos dois é leitura, e os dois são exatamente o que
  -- a limitação ativa do supabase_admin reconcede sozinha — por isso viram indicador FIXO, no
  -- mesmo espírito de anon_maintain, não dado de baseline.
  'anon_referencia', coalesce((select bool_or(anon_references) from priv), true),
  'anon_trigger', coalesce((select bool_or(anon_trigger) from priv), true),
  'anon_le_view', coalesce((select bool_or(anon_select) from vis), false),
  -- Agora soma os OITO privilégios de tabela para authenticated, não cinco. É o campo que a
  -- revisão apontou como o mais grave dos dois: ficava `false` byte-a-byte com um
  -- GRANT TRIGGER/REFERENCES/MAINTAIN a authenticated de pé.
  'authenticated_tem_privilegio',
      coalesce((select bool_or(auth_select or auth_insert or auth_update or auth_delete or auth_truncate
                                or auth_maintain or auth_references or auth_trigger) from priv), true),
  'funcoes_definer_anon',    (select count(*) from funcs where prosecdef and anon_exec),
  'funcoes_sem_search_path', (select count(*) from funcs where not search_path_fixo),
  'defaults_permissivos',    (select count(*) from defaults_perm),
  'anon_rpcs',               (select count(*) from funcs where anon_exec and schema = 'public')
);
$function$;

-- Grants reafirmados explicitamente (CREATE OR REPLACE preserva ACL existente, mas reafirmar é
-- barato e deixa a intenção legível sem precisar confiar em estado implícito de uma migração
-- anterior): função de diagnóstico, anônima, nunca authenticated/service_role.
revoke execute on function public.divat_security_digest() from public, authenticated, service_role;
grant execute on function public.divat_security_digest() to anon;

-- --- ACHADO 2: audit.divat_data_quality() devolve UMA LINHA POR VERIFICAÇÃO, sempre -----------
--
-- Idêntica ao original em QUAIS verificações roda e QUANTAS varreduras faz (nenhuma varredura
-- nova, nenhuma removida — só o `if n > 0 then ... end if;` de cada bloco vira `return next`
-- incondicional). O ponto inteiro da mudança: `[]` deixa de poder significar "banco limpo" — só
-- pode significar "a fonte não rodou verificação nenhuma" (permissão revogada, RLS, função
-- trocada de schema, migração pela metade). scripts/check_data_quality.mjs (Tarefa B da revisão)
-- passa a tratar `[]` como cegueira incondicional; esta função é o que torna essa leitura
-- correta — sem a mudança de fonte, `[]` continuaria ambíguo por trás do runner mais rígido.
create or replace function audit.divat_data_quality()
 returns table(verificacao text, severidade text, qtd bigint, detalhe text)
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  r record;
  n bigint;
  fffd text := chr(65533);
  portal_tables text[] := array[
    'tabela_vista_teste','itinerario_teste','qh_intervalo_teste','qh_predeterminado_teste',
    'qh_teste','tarifa_atual_teste','evento_teste','localidades_teste','municipio_teste',
    'origem_teste','codempresa_teste','portaria_teste','evento_empresa_teste','evento_linha_teste'
  ];
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema='public'
      and c.data_type in ('text','character varying')
      and c.table_name = any(portal_tables)
  loop
    execute format('select count(*) from public.%I where %I like %L',
                   r.table_name, r.column_name, '%'||fffd||'%') into n;
    verificacao:='encoding_ufffd'; severidade:='aviso'; qtd:=n;
    detalhe:=r.table_name||'.'||r.column_name; return next;
  end loop;

  for r in select t.tbl from unnest(array[
    'itinerario_teste','qh_teste','qh_intervalo_teste','qh_predeterminado_teste',
    'tarifa_atual_teste','evento_teste']) as t(tbl)
  loop
    execute format(
      'select count(distinct f.codlinha) from public.%I f where f.codlinha is not null '
      'and not exists (select 1 from public.tabela_vista_teste v where v.codlinha=f.codlinha)',
      r.tbl) into n;
    verificacao:='codlinha_orfa'; severidade:='erro'; qtd:=n;
    detalhe:=r.tbl||' sem match em tabela_vista_teste'; return next;
  end loop;

  select count(*) into n from public.itinerario_teste i
  where i.cod_municipio_origem is not null
    and not exists (select 1 from public.municipio_teste m where m.cod_ibge=i.cod_municipio_origem);
  verificacao:='cod_municipio_origem_invalido'; severidade:='erro'; qtd:=n;
  detalhe:='itinerario_teste.cod_municipio_origem sem match em municipio_teste.cod_ibge'; return next;

  for r in select t.tbl from unnest(array['qh_intervalo_teste','qh_predeterminado_teste']) as t(tbl)
  loop
    execute format(
      'select count(*) from public.%I q where q.cod_origem is not null '
      'and not exists (select 1 from public.origem_teste o where o.cod_origem::text=q.cod_origem::text)',
      r.tbl) into n;
    verificacao:='cod_origem_invalido'; severidade:='erro'; qtd:=n;
    detalhe:=r.tbl||'.cod_origem sem match em origem_teste'; return next;
  end loop;

  select count(*) into n from public.tabela_vista_teste v
  where v.codempresa is not null
    and not exists (select 1 from public.codempresa_teste c where c.codempresa=v.codempresa);
  verificacao:='codempresa_invalida'; severidade:='aviso'; qtd:=n;
  detalhe:='tabela_vista_teste.codempresa sem match em codempresa_teste'; return next;

  return;
end;
$function$;

-- Inacessível para public/anon/authenticated/service_role, execução só para o papel auditor —
-- igual à migração 1, reafirmado aqui pelo mesmo motivo do digest: intenção legível sem depender
-- de estado implícito de uma migração anterior.
revoke all on function audit.divat_data_quality() from public, anon, authenticated, service_role;
grant execute on function audit.divat_data_quality() to divat_auditor;

-- --- asserções: fail-closed, a superfície e os dois sensores fazem o que prometem -------------
do $$
declare
  anon_rpc_names text[];
  d jsonb;
  qtd_linhas integer;
begin
  -- A superfície anônima de `public` não muda nesta migração (nem função nova, nem removida) —
  -- reconferida mesmo assim porque é barato e é exatamente o tipo de regressão que passaria
  -- despercebida num CREATE OR REPLACE que só devia mexer no CORPO da função.
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[]) into anon_rpc_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

  if anon_rpc_names <> array['divat_api_shape','divat_busca_logradouro','divat_linhas_regiao',
                             'divat_security_digest','realtime_tables']::text[] then
    raise exception 'Assercao falhou: RPCs anonimas sao %', anon_rpc_names;
  end if;

  if has_function_privilege('anon', 'audit.divat_security_shape()', 'execute')
     or has_function_privilege('anon', 'audit.divat_data_quality()', 'execute') then
    raise exception 'Assercao falhou: uma diagnostica sensivel continua alcancavel por anon';
  end if;

  -- Autoteste do DIGEST, como anon (o consumidor real). GUARDA do current_user: fora de bloco de
  -- transação `SET LOCAL ROLE` só emite WARNING e não faz nada — sem a guarda a asserção rodaria
  -- como postgres, que executa a função de qualquer forma, e passaria tautologicamente.
  set local role anon;
  if current_user <> 'anon' then
    raise exception 'Assercao falhou: SET LOCAL ROLE nao pegou — rode a migracao dentro de BEGIN/COMMIT';
  end if;
  d := public.divat_security_digest();
  reset role;

  if jsonb_typeof(d->'digest') <> 'string' or length(d->>'digest') <> 64 then
    raise exception 'Assercao falhou: digest nao e um sha256 hex de 64 caracteres';
  end if;
  if jsonb_typeof(d->'todas_com_rls') <> 'boolean'
     or jsonb_typeof(d->'anon_escreve') <> 'boolean'
     or jsonb_typeof(d->'anon_maintain') <> 'boolean'
     or jsonb_typeof(d->'anon_referencia') <> 'boolean'
     or jsonb_typeof(d->'anon_trigger') <> 'boolean'
     or jsonb_typeof(d->'anon_le_view') <> 'boolean'
     or jsonb_typeof(d->'authenticated_tem_privilegio') <> 'boolean' then
    raise exception 'Assercao falhou: um dos booleanos nao veio como boolean';
  end if;
  if jsonb_typeof(d->'funcoes_definer_anon') <> 'number'
     or jsonb_typeof(d->'funcoes_sem_search_path') <> 'number'
     or jsonb_typeof(d->'defaults_permissivos') <> 'number'
     or jsonb_typeof(d->'anon_rpcs') <> 'number' then
    raise exception 'Assercao falhou: uma das contagens nao veio como number';
  end if;
  -- A mesma pergunta da migração 1 (era ela quem zerava os seis originais) mais os DOIS novos —
  -- REFERENCES e TRIGGER de anon. Calcular o campo e não conferi-lo era deixar a asserção mais
  -- fraca que a própria função, e foi assim que authenticated_tem_privilegio pôde ficar `false`
  -- byte-a-byte com um GRANT TRIGGER de pé (achado 1 da revisão).
  if (d->>'anon_escreve')::boolean or (d->>'anon_maintain')::boolean
     or (d->>'anon_referencia')::boolean or (d->>'anon_trigger')::boolean
     or (d->>'anon_le_view')::boolean or (d->>'authenticated_tem_privilegio')::boolean
     or not (d->>'todas_com_rls')::boolean or (d->>'funcoes_definer_anon')::int > 0 then
    raise exception 'Assercao falhou: postura de seguranca ja esta errada antes do commit — %', d;
  end if;

  -- Autoteste da QUALIDADE, como divat_auditor (o consumidor real, não postgres/dono): prova que
  -- o grant está mesmo wireado para o papel de produção, e que a função sempre devolve linha —
  -- `qtd_linhas` maior que zero é a garantia que scripts/check_phase3_audit.mjs (item C6/C11) e
  -- scripts/check_data_quality.mjs (item B1) passam a exigir da fonte.
  set local role divat_auditor;
  if current_user <> 'divat_auditor' then
    raise exception 'Assercao falhou: SET LOCAL ROLE divat_auditor nao pegou — rode dentro de BEGIN/COMMIT';
  end if;
  select count(*) into qtd_linhas from audit.divat_data_quality();
  reset role;

  if qtd_linhas is null or qtd_linhas <= 0 then
    raise exception 'Assercao falhou: audit.divat_data_quality() nao devolveu nenhuma linha (esperado > 0, veio %)', qtd_linhas;
  end if;
end $$;

revoke divat_audit_owner, divat_auditor from postgres;
