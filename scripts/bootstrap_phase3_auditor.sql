-- Execute manual e exclusivamente no projeto de teste com psql.
-- Exemplo (sem colocar a senha no histórico):
--   psql "$ADMIN_DATABASE_URL" \
--     --set=auditor_password="$AUDITOR_PASSWORD" \
--     --set=valid_until="2026-10-31 23:59:59+00" \
--     --file=scripts/bootstrap_phase3_auditor.sql
\set ON_ERROR_STOP on

\if :{?auditor_password}
\else
  \echo 'variável auditor_password ausente'
  \quit 1
\endif
\if :{?valid_until}
\else
  \echo 'variável valid_until ausente'
  \quit 1
\endif

select format(
  'create role divat_auditor_ci login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L valid until %L',
  :'auditor_password', :'valid_until'
)
where not exists (select 1 from pg_roles where rolname = 'divat_auditor_ci')
\gexec

select format(
  'alter role divat_auditor_ci with login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L valid until %L',
  :'auditor_password', :'valid_until'
)
\gexec

grant divat_auditor to divat_auditor_ci;

-- Falha se o login terminou com capacidade administrativa ou acesso direto às tabelas.
do $$
begin
  if exists (
    select 1 from pg_roles
    where rolname = 'divat_auditor_ci'
      and (not rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  ) then
    raise exception 'divat_auditor_ci terminou com atributos inválidos';
  end if;

  if has_table_privilege('divat_auditor_ci', 'public.tabela_vista_teste', 'select') then
    raise exception 'divat_auditor_ci não pode ler tabelas diretamente';
  end if;

  if not has_function_privilege('divat_auditor_ci', 'audit.divat_security_shape()', 'execute') then
    raise exception 'divat_auditor_ci não herdou as funções de audit';
  end if;
end $$;
