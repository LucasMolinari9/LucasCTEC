-- ============================================================================
-- Portal DIVAT (bd_teste) — SCHEMA-ONLY backup (estrutura, sem dados)
-- Gerado ao vivo em 2026-07-16 a partir do banco de produção (lwzsxuaqqeoamukduhev).
--
-- O QUE ISTO É: reconstrói tabelas, PK/FK, índices, RLS policies, grants,
-- funções, trigger e extensões — tudo que o CSV exportado pelo Table Editor
-- NÃO carrega. Rode este script UMA VEZ contra um banco novo/vazio e depois
-- importe os CSVs (Table Editor → tabela → Import data from CSV) por cima.
--
-- COMO USAR (em caso de perda total do banco):
--   1. Crie um projeto Supabase novo (ou zere o atual, com cuidado).
--   2. SQL Editor → cole este arquivo inteiro → Run.
--   3. Table Editor → em cada uma das 18 tabelas → Import data from CSV
--      (usando os CSVs exportados via Table Editor → Export data).
--   4. Confira o Realtime (seção no fim) e o vercel.json/CSP — nada aqui
--      mexe em configuração de hosting, só no banco.
--
-- NÃO inclui: dados (linhas das tabelas — isso vem dos CSVs), usuários do
-- Auth, Storage, nem extensões padrão do Supabase (pg_stat_statements,
-- uuid-ossp, pgcrypto, supabase_vault) que já vêm em qualquer projeto novo.
-- ============================================================================

-- ============================================================
-- 1) EXTENSIONS (das quais o app depende de verdade)
-- ============================================================
-- SCHEMA extensions, não public: é onde o Supabase realmente as instala, e é o que f_unaccent
-- (seção 5) chama — `extensions.unaccent(...)`. Enquanto isto dizia `WITH SCHEMA public`, um
-- restore limpo criava a extensão no lugar errado, f_unaccent quebrava e o índice GIN que depende
-- dela (seção 5) não era criado — ou seja, esta baseline NÃO restaurava. Achado da revisão externa
-- de 27/07/2026, confirmado contra o banco vivo (as duas extensões estão em `extensions`).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ============================================================
-- 2) TABELAS
-- ============================================================

-- Hub: cadastro de linhas
CREATE TABLE public.tabela_vista_teste (
  id                integer,
  codlinha          character varying NOT NULL,
  numero_ligacao    text,
  nome_ligacao      text,
  nome_lig_cresc    text,
  via               text,
  codempresa        character varying NOT NULL,
  tipo              text,
  licitado          boolean,
  caracteristica    text,
  data_criacao      date,
  processo_criacao  text,
  cancelado         boolean,
  paralisado        boolean,
  sub_judice        boolean,
  transferido       boolean,
  CONSTRAINT pk_tabela_vista PRIMARY KEY (codempresa, codlinha)
);

CREATE TABLE public.codempresa_teste (
  id               integer PRIMARY KEY,
  codempresa       character varying,
  nome_empresa     text,
  situacao         text,
  processo         text,
  data_publicacao  date,
  cassada          boolean,
  sob_intervencao  boolean
);

CREATE TABLE public.tarifa_atual_teste (
  codempresa           character varying,
  codlinha             character varying,
  secao                integer,
  numero_linha         text,
  nome_ligacao         text,
  nome_ligacao_cresc   text,
  via                  text,
  caracteristica       text,
  tipo_ligacao         text,
  rm                   text,
  tarifa               numeric,
  piso_i               numeric,
  data_criacao         date,
  cancelado            boolean,
  data_cancelamento    date,
  transferido          boolean,
  data_transferencia   date,
  paralisado           boolean,
  data_paralisacao     date,
  sub_judice           boolean,
  data_sub_judice      date,
  situacao             text,
  ordem_importacao     integer PRIMARY KEY
);

CREATE TABLE public.qh_teste (
  id                 integer PRIMARY KEY,
  codlinha           character varying,
  codempresa         character varying,
  ultima_alteracao   date,
  frota_micro_a      integer,
  frota_micro_sa     integer,
  frota_micro_ac     integer,
  frota_micro_e      integer,
  frota_micro_sac    integer,
  frota_a            integer,
  frota_sa           integer,
  frota_ac           integer,
  frota_sac          integer,
  frota_e            integer,
  frota_operacional  integer,
  reserva            integer,
  hierarquia         text
);

CREATE TABLE public.qh_intervalo_teste (
  id            integer,
  codlinha      character varying,
  dia_semana    text,
  cod_origem    character varying,
  nome_origem   text,
  hora_inicio   time without time zone,
  hora_fim      time without time zone,
  intervalo     integer,
  row_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE public.qh_predeterminado_teste (
  id            integer,
  codlinha      character varying,
  dia_semana    text,
  cod_origem    character varying,
  nome_origem   text,
  saida         time without time zone,
  row_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

-- cod_municipio_origem é código IBGE de MUNICÍPIO, não terminal (renomeado de cod_origem
-- para desambiguar do cod_origem de terminal em origem_teste/qh_*; ver docs/schema.md)
CREATE TABLE public.itinerario_teste (
  id                    numeric,
  codlinha              character varying,
  tipo_logradouro       text,
  nome_logradouro       text,
  cod_municipio_origem  integer,
  sentido           text,
  codempresa        character varying,
  row_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE public.evento_teste (
  id                integer PRIMARY KEY,
  codempresa        text,
  codlinha          text,
  data_registro     date,
  numero_processo   text,
  evento_empresa    text,
  data_publicacao   date,
  evento_linha      text,
  descricao         text,
  observacao        text
);

CREATE TABLE public.evento_empresa_teste (
  id              integer,
  evento_empresa  text,
  row_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE public.evento_linha_teste (
  id            integer,
  evento_linha  text,
  row_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);

CREATE TABLE public.portaria_teste (
  id                  integer PRIMARY KEY,
  numero_portaria     character varying,
  data_portaria       date,
  data_publicacao     date,
  tipo_portaria       text,
  tipo_legislacao     text,
  assunto             text,
  conteudo            text,
  vigor               boolean,
  portaria_anterior   text
);

CREATE TABLE public.municipio_teste (
  cod_ibge          integer PRIMARY KEY,
  nome_municipio    text,
  regiao_municipio  text,
  regiao_novo       text
);

CREATE TABLE public.localidades_teste (
  localidade        text,
  ordem_importacao  integer PRIMARY KEY
);

CREATE TABLE public.origem_teste (
  cod_origem    integer PRIMARY KEY,
  nome_origem   text
);

-- Staging do ETL (evento_dados + evento_textos → evento_teste). Não lidas
-- pelo portal; RLS fica ligado SEM policy de propósito (ver docs/schema.md).
CREATE TABLE public.evento_dados (
  id                integer PRIMARY KEY,
  codempresa        text,
  codlinha          text,
  data_registro     date,
  evento_linha      text,
  evento_empresa    text,
  data_publicacao   date
);

CREATE TABLE public.evento_textos (
  id                integer PRIMARY KEY,
  numero_processo   text,
  descricao         text,
  observacao        text
);

-- Staging do ETL (portaria_data + portaria_texto_teste → portaria_teste). Não lidas
-- pelo portal; RLS fica ligado SEM policy de propósito (ver docs/schema.md).
CREATE TABLE public.portaria_data (
  id                  integer PRIMARY KEY,
  numero_portaria     character varying,
  data_portaria       date,
  data_publicacao     date,
  vigor               boolean,
  tipo_portaria       text,
  portaria_anterior   text
);

CREATE TABLE public.portaria_texto_teste (
  id                integer PRIMARY KEY,
  tipo_legislacao   text,
  assunto           text,
  conteudo          text
);

-- ============================================================
-- 3) FOREIGN KEY (a única FK real do banco — composta e com CASCADE)
-- ⚠️ ON DELETE CASCADE: apagar uma linha de tabela_vista_teste apaga
-- automaticamente as tarifas dela em tarifa_atual_teste.
-- ============================================================
ALTER TABLE public.tarifa_atual_teste
  ADD CONSTRAINT fk_tarifa_linha
  FOREIGN KEY (codempresa, codlinha)
  REFERENCES public.tabela_vista_teste (codempresa, codlinha)
  ON DELETE CASCADE;

-- ============================================================
-- 4) ÍNDICES (btree de filtro + trigram/GIN de busca ilike)
-- ============================================================
CREATE INDEX idx_codempresa_codempresa ON public.codempresa_teste USING btree (codempresa);

CREATE INDEX idx_evento_codempresa ON public.evento_teste USING btree (codempresa);
CREATE INDEX idx_evento_codlinha ON public.evento_teste USING btree (codlinha);
CREATE INDEX trgm_evento_descricao ON public.evento_teste USING gin (descricao gin_trgm_ops);
CREATE INDEX trgm_evento_observacao ON public.evento_teste USING gin (observacao gin_trgm_ops);

CREATE INDEX idx_itinerario_cod_municipio_origem ON public.itinerario_teste USING btree (cod_municipio_origem);
CREATE INDEX idx_itinerario_codlinha ON public.itinerario_teste USING btree (codlinha);
CREATE INDEX trgm_itinerario_logradouro ON public.itinerario_teste USING gin (nome_logradouro gin_trgm_ops);
-- depende de f_unaccent (seção 6) — rodar essa parte DEPOIS das funções
-- CREATE INDEX trgm_itin_logr_tipo_nome_norm ON public.itinerario_teste USING gin (lower(f_unaccent(coalesce(tipo_logradouro,'') || ' ' || nome_logradouro)) gin_trgm_ops);

CREATE INDEX idx_portaria_data ON public.portaria_teste USING btree (data_portaria);
CREATE INDEX trgm_portaria_assunto ON public.portaria_teste USING gin (assunto gin_trgm_ops);
CREATE INDEX trgm_portaria_conteudo ON public.portaria_teste USING gin (conteudo gin_trgm_ops);
CREATE INDEX trgm_portaria_numero ON public.portaria_teste USING gin (numero_portaria gin_trgm_ops);

CREATE INDEX idx_qh_intervalo_cod_origem ON public.qh_intervalo_teste USING btree (cod_origem);
CREATE INDEX idx_qh_intervalo_codlinha ON public.qh_intervalo_teste USING btree (codlinha);

CREATE INDEX idx_qh_predeterminado_codlinha ON public.qh_predeterminado_teste USING btree (codlinha);

CREATE INDEX idx_qh_codlinha ON public.qh_teste USING btree (codlinha);

CREATE INDEX idx_tabela_vista_codempresa ON public.tabela_vista_teste USING btree (codempresa);
CREATE INDEX idx_tabela_vista_codlinha ON public.tabela_vista_teste USING btree (codlinha);
CREATE INDEX trgm_tabela_vista_nome ON public.tabela_vista_teste USING gin (nome_ligacao gin_trgm_ops);
CREATE INDEX trgm_tabela_vista_nome_cresc ON public.tabela_vista_teste USING gin (nome_lig_cresc gin_trgm_ops);
CREATE INDEX trgm_tabela_vista_via ON public.tabela_vista_teste USING gin (via gin_trgm_ops);

CREATE INDEX idx_tarifa_codempresa ON public.tarifa_atual_teste USING btree (codempresa);
CREATE INDEX idx_tarifa_codempresa_codlinha ON public.tarifa_atual_teste USING btree (codempresa, codlinha);
CREATE INDEX idx_tarifa_codlinha ON public.tarifa_atual_teste USING btree (codlinha);
CREATE INDEX trgm_tarifa_nome ON public.tarifa_atual_teste USING gin (nome_ligacao gin_trgm_ops);

-- ============================================================
-- 5) FUNÇÕES + TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
  select extensions.unaccent('extensions.unaccent', $1)
$function$;
-- Sem EXECUTE para PUBLIC (SEC-05 da auditoria de 27/07/2026 — esta e as duas funções abaixo
-- ficaram de fora do ticket 06 de 26/07 e continuavam com o `=X/postgres` herdado do default do
-- PostgreSQL). Assinatura completa de propósito: sem ela o REVOKE erra a sobrecarga.
REVOKE ALL ON FUNCTION public.f_unaccent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO anon, authenticated;

-- índice que depende de f_unaccent — criar só agora que a função existe
-- casa TIPO + NOME do logradouro (ex. "Rua Acre") — nome_logradouro sozinho não tem o tipo
CREATE INDEX trgm_itin_logr_tipo_nome_norm ON public.itinerario_teste
  USING gin (lower(f_unaccent(coalesce(tipo_logradouro,'') || ' ' || nome_logradouro)) gin_trgm_ops);

-- termo casa TIPO + NOME do logradouro (concat) — nome_logradouro sozinho não guarda o tipo,
-- então buscar "Rua Acre" (como o usuário fala a via) não achava nada antes; "Acre" sozinho
-- continua funcionando (concat com string vazia quando tipo_logradouro é nulo).
-- p_ibge (opcional): filtra por cod_municipio_origem (usa idx_itinerario_cod_municipio_origem)
-- — o mesmo logradouro existe em municípios diferentes, e antes não dava pra restringir.
CREATE OR REPLACE FUNCTION public.divat_busca_logradouro(termo text, p_ibge integer DEFAULT NULL)
 RETURNS TABLE(codlinha character varying)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select distinct i.codlinha
  from public.itinerario_teste i
  where lower(public.f_unaccent(coalesce(i.tipo_logradouro,'') || ' ' || i.nome_logradouro))
        ilike '%' || lower(public.f_unaccent(termo)) || '%'
    and (p_ibge is null or i.cod_municipio_origem = p_ibge)
$function$;
REVOKE ALL ON FUNCTION public.divat_busca_logradouro(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divat_busca_logradouro(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.divat_linhas_regiao(p_regiao text, p_modo text)
 RETURNS TABLE(codlinha character varying)
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with muns as (
    select cod_ibge from public.municipio_teste where regiao_municipio = p_regiao
  ),
  agg as (
    select i.codlinha,
           bool_and(i.cod_municipio_origem in (select cod_ibge from muns)) as all_in,
           (array_agg(i.cod_municipio_origem order by i.id))[1] as origem_ibge
    from public.itinerario_teste i
    group by i.codlinha
  )
  select a.codlinha from agg a
  where (p_modo = 'dentro' and a.all_in)
     or (p_modo = 'origem' and a.origem_ibge in (select cod_ibge from muns))
$function$;
REVOKE ALL ON FUNCTION public.divat_linhas_regiao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.divat_linhas_regiao(text, text) TO anon, authenticated;

-- Zera "vigor" automaticamente quando uma portaria é marcada como REVOGADA
-- (não estava documentado no CLAUDE.md — achado ao gerar este backup).
CREATE OR REPLACE FUNCTION public.fn_vigor_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.tipo_portaria = 'REVOGADA' THEN
    NEW.vigor := false;
  END IF;
  RETURN NEW;
END;
$function$;

-- Sem EXECUTE para PUBLIC/anon/authenticated (REVOKE de 26/07/2026, ticket 06 da auditoria):
-- função de trigger — só o dono escreve em portaria_teste; postgres e service_role mantêm.
REVOKE ALL ON FUNCTION public.fn_vigor_auto() FROM public, anon, authenticated;

CREATE TRIGGER trg_vigor_auto
  BEFORE INSERT OR UPDATE ON public.portaria_teste
  FOR EACH ROW EXECUTE FUNCTION public.fn_vigor_auto();

-- divat_data_quality(): diagnóstico de qualidade pós-ETL (U+FFFD e órfãos referenciais),
-- read-only, roda COMO anon (INVOKER — só enxerga o que o RLS deixa). É a função do runner
-- semanal planejado na issue #63 (check_data_quality.mjs), por isso o EXECUTE de anon é
-- intencional. (Sincronizada do banco vivo em 26/07/2026 — antes faltava na baseline.)
CREATE OR REPLACE FUNCTION public.divat_data_quality()
 RETURNS TABLE(verificacao text, severidade text, qtd bigint, detalhe text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  r record;
  n bigint;
  fffd text := chr(65533);
  portal_tables text[] := array[
    'tabela_vista_teste','itinerario_teste','qh_intervalo_teste','qh_predeterminado_teste',
    'qh_teste','tarifa_atual_teste','evento_teste','localidades_teste','municipio_teste',
    'origem_teste','codempresa_teste','portaria_teste','evento_empresa_teste','evento_linha_teste'
  ];
begin
  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema='public'
      and c.data_type in ('text','character varying')
      and c.table_name = any(portal_tables)
  loop
    execute format('select count(*) from public.%I where %I like %L',
                   r.table_name, r.column_name, '%'||fffd||'%') into n;
    if n > 0 then
      verificacao:='encoding_ufffd'; severidade:='aviso'; qtd:=n;
      detalhe:=r.table_name||'.'||r.column_name; return next;
    end if;
  end loop;

  for r in select t.tbl from unnest(array[
    'itinerario_teste','qh_teste','qh_intervalo_teste','qh_predeterminado_teste',
    'tarifa_atual_teste','evento_teste']) as t(tbl)
  loop
    execute format(
      'select count(distinct f.codlinha) from public.%I f where f.codlinha is not null '
      'and not exists (select 1 from public.tabela_vista_teste v where v.codlinha=f.codlinha)',
      r.tbl) into n;
    if n > 0 then
      verificacao:='codlinha_orfa'; severidade:='erro'; qtd:=n;
      detalhe:=r.tbl||' sem match em tabela_vista_teste'; return next;
    end if;
  end loop;

  select count(*) into n from public.itinerario_teste i
  where i.cod_municipio_origem is not null
    and not exists (select 1 from public.municipio_teste m where m.cod_ibge=i.cod_municipio_origem);
  if n > 0 then
    verificacao:='cod_municipio_origem_invalido'; severidade:='erro'; qtd:=n;
    detalhe:='itinerario_teste.cod_municipio_origem sem match em municipio_teste.cod_ibge'; return next;
  end if;

  for r in select t.tbl from unnest(array['qh_intervalo_teste','qh_predeterminado_teste']) as t(tbl)
  loop
    execute format(
      'select count(*) from public.%I q where q.cod_origem is not null '
      'and not exists (select 1 from public.origem_teste o where o.cod_origem::text=q.cod_origem::text)',
      r.tbl) into n;
    if n > 0 then
      verificacao:='cod_origem_invalido'; severidade:='erro'; qtd:=n;
      detalhe:=r.tbl||'.cod_origem sem match em origem_teste'; return next;
    end if;
  end loop;

  select count(*) into n from public.tabela_vista_teste v
  where v.codempresa is not null
    and not exists (select 1 from public.codempresa_teste c where c.codempresa=v.codempresa);
  if n > 0 then
    verificacao:='codempresa_invalida'; severidade:='aviso'; qtd:=n;
    detalhe:='tabela_vista_teste.codempresa sem match em codempresa_teste'; return next;
  end if;

  return;
end;
$function$;
REVOKE ALL ON FUNCTION public.divat_data_quality() FROM public;
GRANT EXECUTE ON FUNCTION public.divat_data_quality() TO anon, authenticated;

-- divat_api_shape(): o que a API pública enxerga — tabelas/colunas (information_schema,
-- filtrado pelos privilégios de quem chama) e RPCs executáveis pelo chamador. Fonte de
-- fatos do scripts/check_deriva.mjs (o endpoint OpenAPI do PostgREST deste projeto é
-- restrito à service_role — HTTP 401 com anon). SECURITY INVOKER: como anon, devolve
-- exatamente a visão de anon; não vaza nada que a API pública já não mostre.
-- (Criada em 26/07/2026, ticket 08 da auditoria docs×banco.)
CREATE OR REPLACE FUNCTION public.divat_api_shape()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
select jsonb_build_object(
  'tables', (
    select coalesce(jsonb_object_agg(t.table_name, t.cols), '{}'::jsonb) from (
      select c.table_name, jsonb_agg(c.column_name::text order by c.ordinal_position) as cols
      from information_schema.columns c
      where c.table_schema = 'public'
      group by c.table_name
    ) t
  ),
  'rpcs', (
    select coalesce(jsonb_agg(distinct p.proname::text), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege(p.oid, 'execute')
  )
);
$function$;
REVOKE ALL ON FUNCTION public.divat_api_shape() FROM public;
GRANT EXECUTE ON FUNCTION public.divat_api_shape() TO anon, authenticated;

-- realtime_tables(): lista as tabelas da publicação supabase_realtime, read-only. Usada por
-- scripts/check_realtime.mjs para conferir RT_TABLES (app.js) contra o banco.
-- SECURITY INVOKER: o anon enxerga pg_publication_tables direto — testado como anon em
-- 26/07/2026, retorna as 14 tabelas (a baseline dizia DEFINER; INVOKER basta e é mais
-- seguro). Não vaza nada: RT_TABLES já é público no app.js. (Criada em 17/07/2026.)
CREATE OR REPLACE FUNCTION public.realtime_tables()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select tablename::text from pg_publication_tables
  where pubname = 'supabase_realtime'
  order by tablename
$function$;
REVOKE ALL ON FUNCTION public.realtime_tables() FROM public;
GRANT EXECUTE ON FUNCTION public.realtime_tables() TO anon, authenticated;

-- divat_security_shape(): postura de segurança do schema public em fatos DERIVADOS. Usada pelo
-- gate scripts/check_grants.mjs (achado SEC-04 da auditoria de 27/07/2026 — RLS/grants/policies
-- não eram verificados por nada, só por um checklist trimestral manual).
--
-- Devolve fatos derivados e não a ACL crua de propósito: `proacl` NULO não significa "sem acesso",
-- significa "default do PostgreSQL", que para função concede EXECUTE a PUBLIC. Um gate que lesse
-- proacl cru e o tratasse como vazio nasceria FAIL-OPEN — a função recém-criada, que é a mais
-- perigosa, apareceria como a mais fechada. Daí has_*_privilege (respeita herança) e
-- coalesce(proacl, acldefault(...)).
--
-- SECURITY INVOKER: os catálogos são legíveis por PUBLIC, então DEFINER seria privilégio à toa —
-- e DEFINER é justamente um dos padrões que este gate vigia.
CREATE OR REPLACE FUNCTION public.divat_security_shape()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object(
    'gerado_em', now(),
    'tabelas', coalesce((
      select jsonb_agg(t order by t->>'nome') from (
        select jsonb_build_object(
          'nome', c.relname, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
          'anon', jsonb_build_object(
            'select', has_table_privilege('anon', c.oid, 'SELECT'),
            'insert', has_table_privilege('anon', c.oid, 'INSERT'),
            'update', has_table_privilege('anon', c.oid, 'UPDATE'),
            'delete', has_table_privilege('anon', c.oid, 'DELETE'),
            'truncate', has_table_privilege('anon', c.oid, 'TRUNCATE'),
            'maintain', has_table_privilege('anon', c.oid, 'MAINTAIN')),
          'authenticated', jsonb_build_object(
            'select', has_table_privilege('authenticated', c.oid, 'SELECT'),
            'insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
            'update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
            'delete', has_table_privilege('authenticated', c.oid, 'DELETE'),
            'truncate', has_table_privilege('authenticated', c.oid, 'TRUNCATE'),
            'maintain', has_table_privilege('authenticated', c.oid, 'MAINTAIN')),
          'policies', coalesce((
            select jsonb_agg(jsonb_build_object('nome', p.polname, 'cmd', p.polcmd::text) order by p.polname)
            from pg_policy p where p.polrelid = c.oid), '[]'::jsonb)
        ) as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p','v','m')
      ) s), '[]'::jsonb),
    'funcoes', coalesce((
      select jsonb_agg(f order by f->>'assinatura') from (
        select jsonb_build_object(
          'assinatura', p.oid::regprocedure::text,
          'security_definer', p.prosecdef,
          'search_path_fixo', coalesce(array_to_string(p.proconfig,' ') like '%search_path%', false),
          'public_execute', exists (
            select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
          'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
          'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
        ) as f
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      ) s), '[]'::jsonb),
    'default_privileges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dono', d.defaclrole::regrole::text,
        'schema', coalesce(d.defaclnamespace::regnamespace::text, '(global)'),
        'tipo', d.defaclobjtype::text,
        'anon_privs', coalesce((select array_agg(distinct a.privilege_type order by a.privilege_type)
          from aclexplode(d.defaclacl) a where a.grantee = 'anon'::regrole::oid), '{}'),
        'authenticated_privs', coalesce((select array_agg(distinct a.privilege_type order by a.privilege_type)
          from aclexplode(d.defaclacl) a where a.grantee = 'authenticated'::regrole::oid), '{}'),
        'public_privs', coalesce((select array_agg(distinct a.privilege_type order by a.privilege_type)
          from aclexplode(d.defaclacl) a where a.grantee = 0), '{}')
      ) order by d.defaclrole::regrole::text, d.defaclobjtype::text)
      from pg_default_acl d
      where d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0
    ), '[]'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.divat_security_shape() FROM public;
GRANT EXECUTE ON FUNCTION public.divat_security_shape() TO anon, authenticated;

-- ============================================================
-- 6) ROW LEVEL SECURITY — habilitar em TODAS as tabelas
-- ============================================================
ALTER TABLE public.tabela_vista_teste       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codempresa_teste         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifa_atual_teste       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qh_teste                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qh_intervalo_teste       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qh_predeterminado_teste  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerario_teste         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_teste             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_empresa_teste     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_linha_teste       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portaria_teste           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipio_teste          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localidades_teste        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.origem_teste             ENABLE ROW LEVEL SECURITY;
-- staging: RLS ligado, SEM policy, de propósito (invisível pela API pública)
ALTER TABLE public.evento_dados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_textos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portaria_data            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portaria_texto_teste     ENABLE ROW LEVEL SECURITY;

-- Policies de leitura pública (SELECT-only para anon) nas 14 tabelas finais
CREATE POLICY anon_read_tabela_vista      ON public.tabela_vista_teste      FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_codempresa        ON public.codempresa_teste        FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_tarifa_atual      ON public.tarifa_atual_teste      FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_qh                ON public.qh_teste                FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_qh_intervalo      ON public.qh_intervalo_teste      FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_qh_predeterminado ON public.qh_predeterminado_teste FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_itinerario        ON public.itinerario_teste        FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_evento            ON public.evento_teste            FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_evento_empresa    ON public.evento_empresa_teste    FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_evento_linha      ON public.evento_linha_teste      FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_portaria          ON public.portaria_teste          FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_municipio         ON public.municipio_teste         FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_localidades       ON public.localidades_teste       FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_origem            ON public.origem_teste            FOR SELECT TO anon USING (true);

-- ============================================================
-- 7) GRANTS — anon/authenticated só SELECT (postura read-only endurecida
-- na auditoria de 26/06/2026). NUNCA conceder escrita a esses papéis.
-- ============================================================
GRANT SELECT ON
  public.tabela_vista_teste, public.codempresa_teste, public.tarifa_atual_teste,
  public.qh_teste, public.qh_intervalo_teste, public.qh_predeterminado_teste,
  public.itinerario_teste, public.evento_teste, public.evento_empresa_teste,
  public.evento_linha_teste, public.portaria_teste, public.municipio_teste,
  public.localidades_teste, public.origem_teste
TO anon, authenticated;

-- ------------------------------------------------------------
-- 7b) DEFAULT PRIVILEGES — objeto NOVO nasce fechado (default deny).
--
-- Até 27/07/2026 esta seção fazia o OPOSTO: `GRANT SELECT ON TABLES TO anon, authenticated`,
-- com um comentário afirmando que aquilo "garantia que tabelas novas não voltassem a conceder".
-- Não garantia nada — CONCEDIA. Tabela nova nascia legível por anon antes mesmo de alguém ligar
-- RLS nela. Achado SEC-01 da auditoria externa de 27/07/2026.
--
-- Por que REVOKE ALL e não REVOKE SELECT: o ACL era `anon=rm`, e `m` é MAINTAIN — permite VACUUM,
-- ANALYZE, CLUSTER, REINDEX e LOCK TABLE. Não é escrita DML pelo PostgREST, mas não é leitura.
--
-- Por que anon/authenticated também aparecem no revoke de FUNCTIONS: uma probe em transação
-- (27/07/2026) mostrou que o default do Supabase JÁ excluía PUBLIC das funções novas — quem estava
-- aberto era `anon`. Revogar só de PUBLIC, como pediam os relatórios, não fecharia nada: função
-- administrativa criada aqui nasceria chamável pelo PostgREST. O revoke global (sem IN SCHEMA)
-- vai junto por segurança, já que os dois escopos são mesclados na criação do objeto.
--
-- CONSEQUÊNCIA OPERACIONAL: tabela nova agora exige GRANT SELECT + policy EXPLÍCITOS, e RPC nova
-- exige GRANT EXECUTE explícito. Sem isso o portal recebe 401/404 e parece bug do front.
-- Ver a skill db-change.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Os comandos acima valem só para objetos FUTUROS. As tabelas que já existiam nasceram sob o
-- default antigo (`anon=rm`) e ficaram com MAINTAIN — achado do próprio gate check_grants.mjs na
-- primeira vez que rodou contra o banco de verdade, depois de a migração de defaults ter passado.
-- Serve de lembrete: fechar o default NÃO conserta o que já foi criado.
REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- LIMITAÇÃO CONHECIDA E ACEITA: existe um SEGUNDO conjunto de defaults, do role `supabase_admin`,
-- que concede `arwdDxtm` (INSERT/UPDATE/DELETE/TRUNCATE) a anon/authenticated em tabelas de public.
-- Vale só para objetos criados POR esse role — o painel do Supabase cria como `postgres`, então na
-- prática não é atingido. Não dá para fechar: `postgres` não é superusuário no Supabase e o comando
-- abaixo responde `42501: permission denied to change default privileges`.
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--     REVOKE ALL ON TABLES FROM anon, authenticated;
-- Mitigação: o gate scripts/check_grants.mjs roda DIARIAMENTE enquanto esse default existir.

-- ============================================================
-- 8) REALTIME
-- As 14 tabelas lidas pelo portal estão na publicação supabase_realtime.
-- As 6 últimas foram adicionadas na auditoria de Realtime (16/07/2026): antes
-- faltavam (itinerario_teste, qh_intervalo_teste, qh_predeterminado_teste,
-- qh_teste, tabela_vista_teste, tarifa_atual_teste), o que quebrava a atualização
-- ao vivo dos cards que as usam. A regra: toda tabela lida por um card precisa
-- estar aqui E em RT_TABLES/VIEW_TABLES no index.html (ver CLAUDE.md § Realtime).
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.codempresa_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_empresa_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_linha_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.localidades_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.municipio_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.origem_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.portaria_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tabela_vista_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerario_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qh_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qh_intervalo_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qh_predeterminado_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tarifa_atual_teste;

ALTER TABLE public.codempresa_teste     REPLICA IDENTITY FULL;
ALTER TABLE public.evento_teste         REPLICA IDENTITY FULL;
ALTER TABLE public.municipio_teste      REPLICA IDENTITY FULL;
ALTER TABLE public.origem_teste         REPLICA IDENTITY FULL;
ALTER TABLE public.portaria_teste       REPLICA IDENTITY FULL;
-- as demais tabelas usam REPLICA IDENTITY DEFAULT (via PK) — suficiente
-- desde a auditoria de PKs de 15/07/2026.

-- ============================================================
-- FIM. Próximo passo: importar os CSVs (Table Editor → Import data)
-- em cada uma das 18 tabelas acima.
-- ============================================================
