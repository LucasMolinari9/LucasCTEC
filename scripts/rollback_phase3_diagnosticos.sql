-- Desfaz a migracao 2 da Fase 3 (diagnosticos anonimos), devolvendo o estado que a migracao 1
-- deixou: as quatro diagnosticas em `audit`, SECURITY DEFINER, so para divat_auditor.
--
-- Rode dentro de transacao e confira ANTES do commit:
--   begin; \i scripts/rollback_phase3_diagnosticos.sql   -- confira; depois commit; ou rollback;

grant divat_audit_owner to postgres;

do $$
begin
  if to_regprocedure('public.divat_api_shape()') is null
     or to_regprocedure('public.realtime_tables()') is null then
    raise exception 'Rollback abortado: as funcoes nao estao em public — a migracao 2 nao foi aplicada aqui';
  end if;
end $$;

drop function if exists public.divat_security_digest();

alter function public.divat_api_shape() set schema audit;
alter function public.realtime_tables() set schema audit;
alter function audit.divat_api_shape() security definer;
alter function audit.realtime_tables() security definer;
alter function audit.divat_api_shape() owner to divat_audit_owner;
alter function audit.realtime_tables() owner to divat_audit_owner;

revoke all on function audit.divat_api_shape(), audit.realtime_tables()
  from public, anon, authenticated, service_role;
grant execute on function audit.divat_api_shape(), audit.realtime_tables() to divat_auditor;

do $$
declare anon_rpc_names text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[]) into anon_rpc_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

  if anon_rpc_names <> array['divat_busca_logradouro','divat_linhas_regiao']::text[] then
    raise exception 'Rollback incompleto: RPCs anonimas sao %', anon_rpc_names;
  end if;
end $$;

revoke divat_audit_owner from postgres;
