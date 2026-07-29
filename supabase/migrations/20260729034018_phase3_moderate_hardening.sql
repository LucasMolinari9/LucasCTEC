do $$
declare
  public_tables integer;
begin
  select count(*) into public_tables
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p');

  if public_tables <> 18 then
    raise exception 'Phase 3 precondition failed: expected 18 public tables, found %', public_tables;
  end if;

  if to_regnamespace('private') is not null or to_regnamespace('audit') is not null then
    raise exception 'Phase 3 precondition failed: private/audit schema already exists';
  end if;

  if exists (select 1 from pg_roles where rolname in ('divat_audit_owner','divat_auditor')) then
    raise exception 'Phase 3 precondition failed: audit roles already exist';
  end if;

  if to_regprocedure('public.divat_busca_logradouro(text,integer)') is null
     or to_regprocedure('public.divat_linhas_regiao(text,text)') is null
     or to_regprocedure('public.divat_api_shape()') is null
     or to_regprocedure('public.divat_security_shape()') is null
     or to_regprocedure('public.divat_data_quality()') is null
     or to_regprocedure('public.realtime_tables()') is null
     or to_regprocedure('public.f_unaccent(text)') is null
     or to_regprocedure('public.fn_vigor_auto()') is null then
    raise exception 'Phase 3 precondition failed: expected function set is incomplete';
  end if;
end $$;

create role divat_audit_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls inherit;
create role divat_auditor nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit;
grant anon to divat_audit_owner;
grant divat_audit_owner, divat_auditor to postgres;

create schema private authorization postgres;
create schema audit authorization postgres;
revoke all on schema private, audit from public, anon, authenticated, service_role;
grant usage on schema private to anon;
alter schema audit owner to divat_audit_owner;
grant usage on schema audit to divat_auditor;

alter function public.f_unaccent(text) set schema private;
alter function public.fn_vigor_auto() set schema private;
revoke all on function private.f_unaccent(text), private.fn_vigor_auto() from public, anon, authenticated, service_role;
grant execute on function private.f_unaccent(text) to anon;

create or replace function public.divat_busca_logradouro(termo text, p_ibge integer default null::integer)
returns table(codlinha character varying)
language sql stable parallel safe
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select distinct i.codlinha
  from public.itinerario_teste i
  where lower(private.f_unaccent(coalesce(i.tipo_logradouro,'') || ' ' || i.nome_logradouro))
        ilike '%' || lower(private.f_unaccent(termo)) || '%'
    and (p_ibge is null or i.cod_municipio_origem = p_ibge)
$function$;

alter function public.divat_api_shape() set schema audit;
alter function public.divat_security_shape() set schema audit;
alter function public.divat_data_quality() set schema audit;
alter function public.realtime_tables() set schema audit;

alter function audit.divat_api_shape() security definer;
alter function audit.divat_security_shape() security definer;
alter function audit.divat_data_quality() security definer;
alter function audit.realtime_tables() security definer;

alter function audit.divat_api_shape() owner to divat_audit_owner;
alter function audit.divat_security_shape() owner to divat_audit_owner;
alter function audit.divat_data_quality() owner to divat_audit_owner;
alter function audit.realtime_tables() owner to divat_audit_owner;

revoke all on all functions in schema audit from public, anon, authenticated, service_role;
grant execute on function
  audit.divat_api_shape(),
  audit.divat_security_shape(),
  audit.divat_data_quality(),
  audit.realtime_tables()
to divat_auditor;

revoke all on all tables in schema public from public, authenticated;
revoke all on all sequences in schema public from public, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.divat_busca_logradouro(text, integer),
  public.divat_linhas_regiao(text, text)
to anon;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
alter default privileges for role divat_audit_owner in schema audit revoke execute on functions from public, anon, authenticated;

do $$
declare
  anon_rpc_names text[];
  auth_rpc_count integer;
  anon_select_count integer;
  anon_write_count integer;
  auth_table_priv_count integer;
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[])
    into anon_rpc_names
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and has_function_privilege('anon', p.oid, 'execute');

  if anon_rpc_names <> array['divat_busca_logradouro','divat_linhas_regiao']::text[] then
    raise exception 'Phase 3 assertion failed: anon RPCs are %', anon_rpc_names;
  end if;

  select count(*) into auth_rpc_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','audit')
    and has_function_privilege('authenticated', p.oid, 'execute');

  if auth_rpc_count <> 0 then
    raise exception 'Phase 3 assertion failed: authenticated has % executable functions', auth_rpc_count;
  end if;

  if has_function_privilege('anon', 'audit.divat_api_shape()', 'execute')
     or has_function_privilege('authenticated', 'audit.divat_api_shape()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.divat_api_shape()', 'execute') then
    raise exception 'Phase 3 assertion failed: audit function grants are not closed';
  end if;

  select count(*) into anon_select_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and has_table_privilege('anon', c.oid, 'select');

  if anon_select_count <> 14 then
    raise exception 'Phase 3 assertion failed: expected 14 anon-readable tables, found %', anon_select_count;
  end if;

  select count(*) into anon_write_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and (has_table_privilege('anon',c.oid,'insert')
      or has_table_privilege('anon',c.oid,'update')
      or has_table_privilege('anon',c.oid,'delete')
      or has_table_privilege('anon',c.oid,'truncate'));

  if anon_write_count <> 0 then
    raise exception 'Phase 3 assertion failed: anon has write privileges on % tables', anon_write_count;
  end if;

  select count(*) into auth_table_priv_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and (has_table_privilege('authenticated',c.oid,'select')
      or has_table_privilege('authenticated',c.oid,'insert')
      or has_table_privilege('authenticated',c.oid,'update')
      or has_table_privilege('authenticated',c.oid,'delete')
      or has_table_privilege('authenticated',c.oid,'truncate'));

  if auth_table_priv_count <> 0 then
    raise exception 'Phase 3 assertion failed: authenticated has table privileges on % tables', auth_table_priv_count;
  end if;

  if exists (
    select 1 from pg_roles
    where rolname in ('divat_audit_owner','divat_auditor')
      and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  ) then
    raise exception 'Phase 3 assertion failed: an audit role is overprivileged';
  end if;
end $$;

set local role divat_auditor;
do $$
begin
  perform audit.divat_api_shape();
  perform audit.divat_security_shape();
  perform audit.divat_data_quality();
  perform audit.realtime_tables();
end $$;
reset role;

revoke divat_audit_owner, divat_auditor from postgres;
