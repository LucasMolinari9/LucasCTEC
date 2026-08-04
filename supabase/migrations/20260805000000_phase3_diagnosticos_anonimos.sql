-- Fase 3, migracao 2 — diagnosticos anonimos.
--
-- A migracao 1 (20260729034018) moveu as QUATRO RPCs diagnosticas para o schema `audit` e
-- revogou o execute de anon. Medido em 04/08/2026, isso cega quatro gates vivos de uma vez,
-- incluindo o DIARIO (check_grants.mjs), que é a compensacao do default nao-fechavel do
-- supabase_admin descrita em docs/seguranca.md 9.1.
--
-- Esta migracao reparte os quatro por CRITERIO, nao por numero (spec secao 2):
--   * divat_api_shape e realtime_tables voltam para `public` e continuam anonimas — o que elas
--     revelam ja esta publicado a mao em docs/schema.md e no CLAUDE.md (ADR-0003), e sao de
--     catalogo, sem varredura. Dois gates seguem sem mudar uma linha.
--   * divat_security_shape (matriz de grants — recon real) e divat_data_quality (59 varreduras
--     completas sobre ~116 mil linhas — alavanca de indisponibilidade) FICAM em `audit`.
--   * divat_security_digest() nasce aqui: resumo em vez de matriz, para o alarme diario
--     sobreviver sem credencial e sem prazo de validade.

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

-- As quatro funcoes de `audit` pertencem a divat_audit_owner, e a migracao 1 termina com
-- `revoke divat_audit_owner, divat_auditor from postgres`. Sem re-conceder, o ALTER FUNCTION
-- ... OWNER TO abaixo falha com 42501 (permissao negada). Revogado de novo no fim.
grant divat_audit_owner to postgres;

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
-- SECURITY INVOKER de proposito: has_table_privilege aceita o papel como argumento e os
-- catalogos pg_class/pg_policy/pg_proc sao legiveis por qualquer papel, entao esta funcao NAO
-- concede poder nenhum a anon. Ela e a ponte estreita — o PostgREST nao expoe pg_catalog, entao
-- sem ela anon nao alcanca catalogo. Nao ha escalada de privilegio a revisar.
--
-- O digest NAO inclui timestamp: divat_security_shape() embute now(), e hashear a saida dele
-- daria digest novo a cada chamada — um gate que grita todo dia e um gate que se ignora.
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
         has_table_privilege('anon', t.oid, 'SELECT')            as anon_select,
         has_table_privilege('anon', t.oid, 'INSERT')            as anon_insert,
         has_table_privilege('anon', t.oid, 'UPDATE')            as anon_update,
         has_table_privilege('anon', t.oid, 'DELETE')            as anon_delete,
         has_table_privilege('anon', t.oid, 'TRUNCATE')          as anon_truncate,
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
funcs as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as assinatura,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
),
canonico as (
  select
    coalesce((select string_agg(
        relname || '|' || relrowsecurity::int
          || '|a' || anon_select::int || anon_insert::int || anon_update::int
                  || anon_delete::int || anon_truncate::int
          || '|u' || auth_select::int || auth_insert::int || auth_update::int
                  || auth_delete::int || auth_truncate::int,
        E'\n' order by relname) from priv), '')
    || E'\n==\n' ||
    coalesce((select string_agg(relname || '|' || polname || '|' || polcmd,
        E'\n' order by relname, polname) from pols), '')
    || E'\n==\n' ||
    coalesce((select string_agg(assinatura || '|' || anon_exec::int || auth_exec::int || prosecdef::int,
        E'\n' order by assinatura) from funcs), '')
    as texto
)
select jsonb_build_object(
  'digest', encode(sha256(convert_to((select texto from canonico), 'UTF8')), 'hex'),
  'tabelas_publicas', (select count(*) from priv),
  'todas_com_rls', (select bool_and(relrowsecurity) from priv),
  'anon_escreve', (select bool_or(anon_insert or anon_update or anon_delete or anon_truncate) from priv),
  'authenticated_tem_privilegio',
      (select bool_or(auth_select or auth_insert or auth_update or auth_delete or auth_truncate) from priv),
  'anon_rpcs', (select count(*) from funcs where anon_exec)
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

  -- Auto-teste: anon precisa CONSEGUIR chamar o digest, e a resposta precisa ter forma util.
  set local role anon;
  d := public.divat_security_digest();
  reset role;

  if jsonb_typeof(d->'digest') <> 'string' or length(d->>'digest') <> 64 then
    raise exception 'Assercao falhou: digest nao e um sha256 hex de 64 caracteres';
  end if;
  if jsonb_typeof(d->'todas_com_rls') <> 'boolean'
     or jsonb_typeof(d->'anon_escreve') <> 'boolean'
     or jsonb_typeof(d->'authenticated_tem_privilegio') <> 'boolean' then
    raise exception 'Assercao falhou: um dos booleanos nao veio como boolean';
  end if;
  if (d->>'anon_escreve')::boolean or not (d->>'todas_com_rls')::boolean then
    raise exception 'Assercao falhou: postura de seguranca ja esta errada antes do commit — %', d;
  end if;
end $$;

revoke divat_audit_owner from postgres;
