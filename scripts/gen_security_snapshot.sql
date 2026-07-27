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
-- Observação: cobre RLS/policies/grants de tabela, DEFAULT PRIVILEGES e ACL de funções do schema
-- public. Não inclui o DDL de tabelas/índices (isso está em docs/backup_schema.sql). Nada aqui
-- altera o banco — é só leitura.
--
-- As seções 4 e 5 nasceram do parecer de revisão de 27/07/2026: o backup automático salva DADOS,
-- não catálogo, então uma mudança de DDL de privilégio não tinha de onde ser desfeita. Sem elas o
-- rollback de um ALTER DEFAULT PRIVILEGES dependia de memória.

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

  union all
  -- 4) DEFAULT PRIVILEGES — o que tabelas/funções/sequências NOVAS herdam.
  -- Não é DDL executável (a ACL é o estado final, não o comando que a produziu): sai comentado,
  -- como registro fiel para comparar depois da mudança e para montar o rollback.
  select 4 as ord,
         format('-- DEFAULT ACL: dono=%s schema=%s tipo=%s acl=%s',
                defaclrole::regrole::text,
                coalesce(defaclnamespace::regnamespace::text, '(global)'),
                case defaclobjtype when 'r' then 'tabelas' when 'S' then 'sequencias'
                     when 'f' then 'funcoes' when 'T' then 'tipos' else defaclobjtype::text end,
                defaclacl::text) as ddl
  from pg_default_acl
  where defaclnamespace = 'public'::regnamespace or defaclnamespace = 0

  union all
  -- 5) Funções de public: ACL efetiva, SECURITY DEFINER e search_path.
  -- proacl NULO não quer dizer "sem acesso" — quer dizer "default do PostgreSQL", que para função
  -- concede EXECUTE a PUBLIC. Por isso o coalesce com acldefault: o snapshot precisa registrar o
  -- privilégio EFETIVO, senão a função mais perigosa aparece como a mais fechada.
  select 5 as ord,
         format('-- FUNCAO: %s definer=%s search_path=%s acl=%s',
                p.oid::regprocedure::text,
                p.prosecdef,
                coalesce(array_to_string(p.proconfig, ' '), '(nenhum)'),
                coalesce(p.proacl, acldefault('f', p.proowner))::text) as ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select ddl from linhas order by ord, ddl;
