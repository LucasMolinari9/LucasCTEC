-- Rollback manual da Fase 3, somente para gontnlfmothfglssbyyk.
-- Requer revisão do snapshot pré-migração. Não executar em produção.
begin;

-- Corta primeiro a credencial externa, se ela tiver sido criada.
do $$
begin
  if exists (select 1 from pg_roles where rolname='divat_auditor_ci') then
    alter role divat_auditor_ci nologin;
  end if;
end $$;

grant divat_audit_owner, divat_auditor to postgres;

alter function audit.divat_api_shape() owner to postgres;
alter function audit.divat_security_shape() owner to postgres;
alter function audit.divat_data_quality() owner to postgres;
alter function audit.realtime_tables() owner to postgres;

alter function audit.divat_api_shape() security invoker;
alter function audit.divat_security_shape() security invoker;
alter function audit.divat_data_quality() security invoker;
alter function audit.realtime_tables() security invoker;

alter function audit.divat_api_shape() set schema public;
alter function audit.divat_security_shape() set schema public;
alter function audit.divat_data_quality() set schema public;
alter function audit.realtime_tables() set schema public;
alter function private.f_unaccent(text) set schema public;
alter function private.fn_vigor_auto() set schema public;

create or replace function public.divat_busca_logradouro(termo text, p_ibge integer default null::integer)
returns table(codlinha character varying)
language sql stable parallel safe
set search_path to 'pg_catalog', 'public'
as $function$
  select distinct i.codlinha
  from public.itinerario_teste i
  where lower(public.f_unaccent(coalesce(i.tipo_logradouro,'') || ' ' || i.nome_logradouro))
        ilike '%' || lower(public.f_unaccent(termo)) || '%'
    and (p_ibge is null or i.cod_municipio_origem = p_ibge)
$function$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.divat_busca_logradouro(text, integer),
  public.divat_linhas_regiao(text, text),
  public.f_unaccent(text),
  public.divat_api_shape(),
  public.divat_security_shape(),
  public.divat_data_quality(),
  public.realtime_tables()
to anon, authenticated;

grant select on
  public.tabela_vista_teste, public.codempresa_teste, public.tarifa_atual_teste,
  public.qh_teste, public.qh_intervalo_teste, public.qh_predeterminado_teste,
  public.itinerario_teste, public.evento_teste, public.evento_empresa_teste,
  public.evento_linha_teste, public.portaria_teste, public.municipio_teste,
  public.localidades_teste, public.origem_teste
to authenticated;

alter default privileges for role divat_audit_owner in schema audit
  grant execute on functions to public;

drop schema audit;
drop schema private;

do $
begin
  if exists (select 1 from pg_roles where rolname='divat_auditor_ci') then
    revoke divat_auditor from divat_auditor_ci;
    drop role divat_auditor_ci;
  end if;
end $;
revoke anon from divat_audit_owner;
revoke divat_audit_owner, divat_auditor from postgres;
drop role divat_auditor;
drop role divat_audit_owner;

commit;
