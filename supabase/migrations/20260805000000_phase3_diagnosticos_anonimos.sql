-- Fase 3, migracao 2 — diagnosticos anonimos.
--
-- A migracao 1 (20260729034018) moveu as QUATRO RPCs diagnosticas para o schema `audit` e revogou
-- o execute de anon. Isso cega quatro gates vivos de uma vez, incluindo o DIARIO
-- (check_grants.mjs), que e a compensacao do default nao-fechavel do supabase_admin descrita em
-- docs/seguranca.md 9.1.
--
-- Esta migracao reparte os quatro por CRITERIO, nao por numero (spec secao 2):
--   * divat_api_shape e realtime_tables voltam para `public` e continuam anonimas — o que elas
--     revelam ja esta publicado a mao em docs/schema.md e no CLAUDE.md (ADR-0003), e sao de
--     catalogo, sem varredura.
--   * divat_security_shape (matriz de grants — recon real) e divat_data_quality (59 varreduras
--     completas sobre ~116 mil linhas — alavanca de indisponibilidade) FICAM em `audit`.
--   * divat_security_digest() nasce aqui: resumo em vez de matriz.
--
-- ORDEM DAS DUAS PRIMEIRAS INSTRUCOES E LOAD-BEARING. O `grant divat_audit_owner to postgres`
-- vem ANTES da pre-condicao de proposito: a migracao 1 passa o dono do schema `audit` para
-- divat_audit_owner e concede USAGE so a divat_auditor, entao `postgres` NAO tem USAGE em
-- `audit`. Um to_regprocedure('audit.<f>()') com nome qualificado por schema faz verificacao de
-- ACL e levanta `permission denied for schema audit` — a migracao abortaria na propria
-- pre-condicao, com um erro que parece dizer que a pre-condicao esta errada.
grant divat_audit_owner to postgres;

do $$
begin
  if to_regnamespace('private') is null or to_regnamespace('audit') is null then
    raise exception 'Precondicao falhou: schemas private/audit ausentes — a migracao 20260729034018 nao foi aplicada aqui';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'divat_audit_owner')
     or not exists (select 1 from pg_roles where rolname = 'divat_auditor') then
    raise exception 'Precondicao falhou: papeis de auditoria ausentes';
  end if;

  if to_regprocedure('audit.divat_api_shape()') is null
     or to_regprocedure('audit.realtime_tables()') is null
     or to_regprocedure('audit.divat_security_shape()') is null
     or to_regprocedure('audit.divat_data_quality()') is null then
    raise exception 'Precondicao falhou: as quatro diagnosticas nao estao todas em audit';
  end if;

  if to_regprocedure('public.divat_security_digest()') is not null then
    raise exception 'Precondicao falhou: public.divat_security_digest() ja existe';
  end if;
end $$;

-- --- as duas baratas voltam para public, anonimas e INVOKER --------------------------------
alter function audit.divat_api_shape()  security invoker;
alter function audit.realtime_tables()  security invoker;
alter function audit.divat_api_shape()  owner to postgres;
alter function audit.realtime_tables()  owner to postgres;
alter function audit.divat_api_shape()  set schema public;
alter function audit.realtime_tables()  set schema public;

-- `revoke execute`, nao `revoke all`: scripts/check_migrations.mjs:53 cobra literalmente
-- /revoke\s+execute\s+on\s+function\s+[^;]+\s+from\s+public/ para toda migracao que cria funcao
-- em public. Com `revoke all` o gate acusa "funcao public e criada sem REVOKE EXECUTE de PUBLIC".
revoke execute on function public.divat_api_shape(), public.realtime_tables() from public, authenticated, service_role;
grant execute on function public.divat_api_shape(), public.realtime_tables() to anon;

-- --- o objeto novo: resumo, nunca matriz ----------------------------------------------------
-- SECURITY INVOKER de proposito: has_table_privilege aceita o papel como argumento e os catalogos
-- pg_class/pg_policy/pg_proc/pg_default_acl sao legiveis por qualquer papel, entao esta funcao NAO
-- concede poder nenhum a anon. Ela e a ponte estreita — o PostgREST nao expoe pg_catalog, entao
-- sem ela anon nao alcanca catalogo.
--
-- O digest NAO inclui timestamp: divat_security_shape() embute now(), e hashear a saida dele daria
-- digest novo a cada chamada — um gate que grita todo dia e um gate que se ignora.
--
-- DEZ campos, nao seis. A primeira versao era cega para MAINTAIN, search_path fixo,
-- default_privileges e os schemas audit/private — e default_privileges e A RAZAO de o gate ser
-- diario (SEC-01/SEC-05). Um MAINTAIN reconcedido a anon deixaria o digest byte-identico.
create function public.divat_security_digest()
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
         has_table_privilege('anon', t.oid, 'SELECT')            as anon_select,
         has_table_privilege('anon', t.oid, 'INSERT')            as anon_insert,
         has_table_privilege('anon', t.oid, 'UPDATE')            as anon_update,
         has_table_privilege('anon', t.oid, 'DELETE')            as anon_delete,
         has_table_privilege('anon', t.oid, 'TRUNCATE')          as anon_truncate,
         has_table_privilege('anon', t.oid, 'MAINTAIN')          as anon_maintain,
         has_table_privilege('authenticated', t.oid, 'SELECT')   as auth_select,
         has_table_privilege('authenticated', t.oid, 'INSERT')   as auth_insert,
         has_table_privilege('authenticated', t.oid, 'UPDATE')   as auth_update,
         has_table_privilege('authenticated', t.oid, 'DELETE')   as auth_delete,
         has_table_privilege('authenticated', t.oid, 'TRUNCATE') as auth_truncate
  from tabelas t
),
pols as (
  select c.relname, p.polname, p.polcmd::text as polcmd
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
-- Os TRES schemas: a Fase 3 moveu funcoes sensiveis para audit e o helper para private. Olhar so
-- public deixaria um `grant execute on function audit.divat_data_quality() to anon` invisivel.
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
-- default_privileges: e por causa deste bloco que o gate roda DIARIAMENTE. O default do
-- supabase_admin nao e fechavel (postgres nao e superusuario no Supabase) e faz objeto novo
-- nascer com privilegio para anon/authenticated.
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
    coalesce((select string_agg(
        relname || '|' || relrowsecurity::int
          || '|a' || anon_select::int || anon_insert::int || anon_update::int
                  || anon_delete::int || anon_truncate::int || anon_maintain::int
          || '|u' || auth_select::int || auth_insert::int || auth_update::int
                  || auth_delete::int || auth_truncate::int,
        E'\n' order by relname) from priv), '')
    || E'\n==\n' ||
    coalesce((select string_agg(relname || '|' || polname || '|' || polcmd,
        E'\n' order by relname, polname) from pols), '')
    || E'\n==\n' ||
    coalesce((select string_agg(assinatura || '|' || anon_exec::int || auth_exec::int
                                 || prosecdef::int || search_path_fixo::int,
        E'\n' order by assinatura) from funcs), '')
    || E'\n==\n' ||
    coalesce((select string_agg(dono || '|' || schema || '|' || tipo || '|' || concessoes,
        E'\n' order by dono, schema, tipo) from defaults_perm), '')
    as texto
)
select jsonb_build_object(
  'digest', encode(sha256(convert_to((select texto from canonico), 'UTF8')), 'hex'),
  'tabelas_publicas', (select count(*) from priv),
  -- coalesce FAIL-CLOSED: conjunto vazio significa visao perdida, nao "tudo certo".
  'todas_com_rls', coalesce((select bool_and(relrowsecurity) from priv), false),
  'anon_escreve', coalesce((select bool_or(anon_insert or anon_update or anon_delete or anon_truncate) from priv), true),
  'anon_maintain', coalesce((select bool_or(anon_maintain) from priv), true),
  'authenticated_tem_privilegio',
      coalesce((select bool_or(auth_select or auth_insert or auth_update or auth_delete or auth_truncate) from priv), true),
  'funcoes_definer_anon',    (select count(*) from funcs where prosecdef and anon_exec),
  'funcoes_sem_search_path', (select count(*) from funcs where not search_path_fixo),
  'defaults_permissivos',    (select count(*) from defaults_perm),
  'anon_rpcs',               (select count(*) from funcs where anon_exec and schema = 'public')
);
$function$;

revoke execute on function public.divat_security_digest() from public, authenticated, service_role;
grant execute on function public.divat_security_digest() to anon;

-- --- assercoes: a superficie anonima e EXATAMENTE a esperada -------------------------------
do $$
declare
  anon_rpc_names text[];
  d jsonb;
begin
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

  -- Auto-teste. A GUARDA do current_user existe porque `SET LOCAL` fora de bloco de transacao
  -- so emite WARNING e nao faz nada — a assercao rodaria como postgres, que executa a funcao de
  -- qualquer forma, e passaria tautologicamente. A unica assercao cujo trabalho e provar que
  -- anon alcanca o digest era a que degradava em silencio.
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
     or jsonb_typeof(d->'authenticated_tem_privilegio') <> 'boolean' then
    raise exception 'Assercao falhou: um dos booleanos nao veio como boolean';
  end if;
  if jsonb_typeof(d->'funcoes_definer_anon') <> 'number'
     or jsonb_typeof(d->'funcoes_sem_search_path') <> 'number'
     or jsonb_typeof(d->'defaults_permissivos') <> 'number'
     or jsonb_typeof(d->'anon_rpcs') <> 'number' then
    raise exception 'Assercao falhou: uma das contagens nao veio como number';
  end if;
  if (d->>'anon_escreve')::boolean or (d->>'anon_maintain')::boolean
     or not (d->>'todas_com_rls')::boolean or (d->>'funcoes_definer_anon')::int > 0 then
    raise exception 'Assercao falhou: postura de seguranca ja esta errada antes do commit — %', d;
  end if;
end $$;

revoke divat_audit_owner from postgres;
