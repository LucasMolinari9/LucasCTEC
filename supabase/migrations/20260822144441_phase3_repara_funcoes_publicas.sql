-- Repara drift descoberto em 22/08/2026, medido contra o banco de teste vivo
-- (gontnlfmothfglssbyyk), não suposto: a migração 20260729034018_phase3_moderate_hardening.sql
-- está registrada como aplicada em supabase_migrations.schema_migrations, e o PRÓPRIO ARQUIVO
-- move as QUATRO funções diagnósticas para `audit` com asserts (linhas 99-173 e 175-182) que
-- teriam abortado a transação inteira se qualquer uma ficasse para trás. Ainda assim, o banco
-- vivo tinha só DUAS em `audit` (`divat_security_shape`, `divat_data_quality`); `divat_api_shape`
-- e `realtime_tables` estavam de volta em `public`, executáveis por `anon` — exatamente o estado
-- pré-Fase-3 para essas duas. Não há gatilho, função, cron ou script neste repo que explique o
-- reaparecimento; também foi medido que `postgres` recuperou a associação a `divat_audit_owner` e
-- `divat_auditor`, que a migração original revogava na última linha. A causa não foi determinada
-- — registrada aqui como fato, não escondida. Esta migração é IDEMPOTENTE: repara se dois estão
-- fora do lugar, não faz nada de errado se os quatro já estiverem corretos (ex.: reaplicada por
-- engano, ou se um dia rodar contra um banco que nunca teve o drift).

grant divat_audit_owner, divat_auditor to postgres;

do $$
begin
  if to_regprocedure('public.divat_api_shape()') is not null then
    alter function public.divat_api_shape() set schema audit;
  end if;
  if to_regprocedure('public.realtime_tables()') is not null then
    alter function public.realtime_tables() set schema audit;
  end if;
end $$;

alter function audit.divat_api_shape() security definer;
alter function audit.realtime_tables() security definer;
alter function audit.divat_api_shape() owner to divat_audit_owner;
alter function audit.realtime_tables() owner to divat_audit_owner;

revoke all on function audit.divat_api_shape(), audit.realtime_tables()
  from public, anon, authenticated, service_role;
grant execute on function audit.divat_api_shape(), audit.realtime_tables() to divat_auditor;

-- Prova viva, mesmo padrão da migração original — reconfirma as QUATRO, não só as duas
-- reparadas: se uma das outras duas também tiver regredido nesse meio-tempo, esta migração
-- falha em vez de reparar só metade do problema em silêncio.
do $$
begin
  if has_function_privilege('anon', 'audit.divat_api_shape()', 'execute')
     or has_function_privilege('authenticated', 'audit.divat_api_shape()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.divat_api_shape()', 'execute') then
    raise exception 'Reparo Fase 3 falhou: grants de audit.divat_api_shape() não fecharam';
  end if;

  if has_function_privilege('anon', 'audit.realtime_tables()', 'execute')
     or has_function_privilege('authenticated', 'audit.realtime_tables()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.realtime_tables()', 'execute') then
    raise exception 'Reparo Fase 3 falhou: grants de audit.realtime_tables() não fecharam';
  end if;

  if has_function_privilege('anon', 'audit.divat_security_shape()', 'execute')
     or has_function_privilege('authenticated', 'audit.divat_security_shape()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.divat_security_shape()', 'execute') then
    raise exception 'Reparo Fase 3 falhou: grants de audit.divat_security_shape() regrediram';
  end if;

  if has_function_privilege('anon', 'audit.divat_data_quality()', 'execute')
     or has_function_privilege('authenticated', 'audit.divat_data_quality()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.divat_data_quality()', 'execute') then
    raise exception 'Reparo Fase 3 falhou: grants de audit.divat_data_quality() regrediram';
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
