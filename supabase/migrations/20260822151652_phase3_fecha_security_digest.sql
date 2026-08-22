-- Achado medido em 22/08/2026 pelo próprio gate check_deriva.mjs, já rodando contra o banco de
-- teste vivo (pooler IPv4, ver docs/planos/fase-3-hardening-moderado.md): public.divat_security_digest()
-- estava executável por `anon` e sem documentação — nenhum dos dois deveria ser verdade. A função
-- (dono postgres, NÃO security definer) devolve um digest SHA-256 + contagens da postura de
-- segurança inteira (RLS por tabela, grants de anon/authenticated, funções SECURITY DEFINER
-- executáveis por anon, defaults permissivos) cruzando public + audit + private — exatamente o
-- tipo de informação que a Fase 3 existe para tirar do alcance de `anon`. Não é a mesma função que
-- o restante da Fase 3 já fechou (divat_security_shape, essa sim já em `audit` desde
-- 20260729034018_phase3_moderate_hardening.sql) — é uma versão mais nova e mais compacta
-- (hash + contadores, pensada para comparação de baseline), criada depois, direto em `public`, e
-- nunca recebeu o mesmo tratamento. `atualizar-baseline.yml` já citava esse nome antes desta
-- sessão descobrir a função de verdade (ver histórico do arquivo) — a peça que faltava era o
-- fechamento do grant, não o nome.
--
-- Fechar o acesso (não documentar a exposição) porque a exposição em si é o defeito: a Fase 3
-- inteira existe para tirar diagnóstico de segurança do alcance de `anon`, e esta função devolve
-- exatamente esse diagnóstico. Idempotente.

grant divat_audit_owner, divat_auditor to postgres;

do $$
begin
  if to_regprocedure('public.divat_security_digest()') is not null then
    alter function public.divat_security_digest() set schema audit;
  end if;
end $$;

alter function audit.divat_security_digest() security definer;
alter function audit.divat_security_digest() owner to divat_audit_owner;

revoke all on function audit.divat_security_digest() from public, anon, authenticated, service_role;
grant execute on function audit.divat_security_digest() to divat_auditor;

do $$
begin
  if has_function_privilege('anon', 'audit.divat_security_digest()', 'execute')
     or has_function_privilege('authenticated', 'audit.divat_security_digest()', 'execute')
     or not has_function_privilege('divat_auditor', 'audit.divat_security_digest()', 'execute') then
    raise exception 'Fechamento de audit.divat_security_digest() falhou';
  end if;
end $$;

set local role divat_auditor;
do $$
begin
  perform audit.divat_security_digest();
end $$;
reset role;

revoke divat_audit_owner, divat_auditor from postgres;
