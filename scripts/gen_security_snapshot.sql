-- gen_security_snapshot.sql — regenera, a partir do estado ATUAL do banco, um snapshot da
-- postura de segurança do schema public (RLS + policies + grants de tabela para anon/authenticated)
-- como comandos SQL de reconstrução.
--
-- Por que existe: o snapshot antigo (divat_security_snapshot_2026-06-26.sql) ficava fora do git
-- (por design) e "se perdeu" — sem apontador de onde estava. Em vez de depender de um arquivo
-- solto, este script torna o snapshot SEMPRE reproduzível: rode-o e a saída É o snapshot do
-- estado corrente. (A baseline SEGURA versionada continua sendo docs/backup_schema.sql.)
--
-- Uso: cole no SQL Editor do Supabase (ou psql -f), e salve a saída como
--   divat_security_snapshot_YYYY-MM-DD.sql   → guardar FORA do git (Drive/local do dono).
--
-- Observação: cobre RLS/policies/grants de tabela do schema public. Não inclui schema/índices/
-- funções (isso está em docs/backup_schema.sql). Nada aqui altera o banco — é só leitura.

with linhas as (
  -- 1) RLS habilitado por tabela
  select 1 as ord,
         format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', schemaname, tablename) as ddl
  from pg_tables
  where schemaname = 'public' and rowsecurity

  union all
  -- 2) Policies (recria nome, escopo, roles, USING e WITH CHECK)
  select 2 as ord,
         format(
           'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
           policyname, schemaname, tablename,
           case when permissive = 'PERMISSIVE' then 'PERMISSIVE' else 'RESTRICTIVE' end,
           cmd,
           array_to_string(roles, ', '),
           coalesce(' USING (' || qual || ')', ''),
           coalesce(' WITH CHECK (' || with_check || ')', '')
         ) as ddl
  from pg_policies
  where schemaname = 'public'

  union all
  -- 3) Grants de tabela concedidos a anon/authenticated (o que a auditoria enxugou)
  select 3 as ord,
         format('GRANT %s ON %I.%I TO %I;', privilege_type, table_schema, table_name, grantee) as ddl
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
)
select ddl from linhas order by ord, ddl;
