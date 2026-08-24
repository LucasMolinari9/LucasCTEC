-- Corrige, para ambientes onde public.divat_security_digest() nunca existiu, a migração
-- 20260822151652_phase3_fecha_security_digest.sql. Medido em 24/08/2026 contra
-- lwzsxuaqqeoamukduhev (produção), antes de qualquer promoção da Fase 3: a função não existe
-- nem em public nem em audit ali — foi criada só no projeto de teste, fora de qualquer
-- migração versionada (mesma origem não determinada do drift já registrado em
-- docs/planos/fase-3-hardening-moderado.md), e a migração original nunca chegou a rodar em
-- produção.
--
-- A migração original só guarda o primeiro passo (mover de public para audit) atrás de um
-- `to_regprocedure(...) is not null`; os passos seguintes (`alter function
-- audit.divat_security_digest() security definer`, os grants, o assert) são incondicionais —
-- e por isso erram com "function does not exist" (42883) num banco onde a função nunca
-- existiu em lugar nenhum, abortando a transação inteira.
--
-- Esta migração NÃO edita o arquivo já aplicado (histórico de migração não se reescreve):
-- é uma migração nova, idempotente em qualquer estado — fecha a função se ela existir em
-- public OU já estiver em audit; não faz nada, sem erro, se ela nunca existiu (produção,
-- hoje) nem se já foi fechada (teste, depois de 20260822151652).

grant divat_audit_owner, divat_auditor to postgres;

do $$
declare
  digest_present boolean := to_regprocedure('public.divat_security_digest()') is not null
                          or to_regprocedure('audit.divat_security_digest()') is not null;
begin
  if digest_present then
    if to_regprocedure('public.divat_security_digest()') is not null then
      alter function public.divat_security_digest() set schema audit;
    end if;

    alter function audit.divat_security_digest() security definer;
    alter function audit.divat_security_digest() owner to divat_audit_owner;

    revoke all on function audit.divat_security_digest() from public, anon, authenticated, service_role;
    grant execute on function audit.divat_security_digest() to divat_auditor;

    if has_function_privilege('anon', 'audit.divat_security_digest()', 'execute')
       or has_function_privilege('authenticated', 'audit.divat_security_digest()', 'execute')
       or not has_function_privilege('divat_auditor', 'audit.divat_security_digest()', 'execute') then
      raise exception 'Fechamento de audit.divat_security_digest() falhou';
    end if;
  end if;
end $$;

revoke divat_audit_owner, divat_auditor from postgres;
