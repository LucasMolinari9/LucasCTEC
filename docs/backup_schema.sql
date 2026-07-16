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
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

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
  cod_origen    character varying,
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

-- cod_origem aqui é código IBGE de MUNICÍPIO, não terminal (ver docs/schema.md)
CREATE TABLE public.itinerario_teste (
  id                numeric,
  codlinha          character varying,
  tipo_logradouro   text,
  nome_logradouro   text,
  cod_origem        integer,
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

-- Staging do ETL (portaria_data + portaria_texto_teste → portaria_teste).
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

CREATE INDEX idx_itinerario_cod_origem ON public.itinerario_teste USING btree (cod_origem);
CREATE INDEX idx_itinerario_codlinha ON public.itinerario_teste USING btree (codlinha);
CREATE INDEX trgm_itinerario_logradouro ON public.itinerario_teste USING gin (nome_logradouro gin_trgm_ops);
-- depende de f_unaccent (seção 6) — rodar essa parte DEPOIS das funções
-- CREATE INDEX trgm_itin_logr_norm ON public.itinerario_teste USING gin (lower(f_unaccent(nome_logradouro)) gin_trgm_ops);

CREATE INDEX idx_portaria_data ON public.portaria_teste USING btree (data_portaria);
CREATE INDEX trgm_portaria_assunto ON public.portaria_teste USING gin (assunto gin_trgm_ops);
CREATE INDEX trgm_portaria_conteudo ON public.portaria_teste USING gin (conteudo gin_trgm_ops);
CREATE INDEX trgm_portaria_numero ON public.portaria_teste USING gin (numero_portaria gin_trgm_ops);

CREATE INDEX idx_qh_intervalo_cod_origen ON public.qh_intervalo_teste USING btree (cod_origen);
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
AS $function$
  select public.unaccent('public.unaccent', $1)
$function$;

-- índice que depende de f_unaccent — criar só agora que a função existe
CREATE INDEX trgm_itin_logr_norm ON public.itinerario_teste
  USING gin (lower(f_unaccent(nome_logradouro)) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.divat_busca_logradouro(termo text)
 RETURNS TABLE(codlinha character varying)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  select distinct i.codlinha
  from public.itinerario_teste i
  where lower(public.f_unaccent(i.nome_logradouro))
        ilike '%' || lower(public.f_unaccent(termo)) || '%'
$function$;

CREATE OR REPLACE FUNCTION public.divat_linhas_regiao(p_regiao text, p_modo text)
 RETURNS TABLE(codlinha character varying)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  with muns as (
    select cod_ibge from public.municipio_teste where regiao_municipio = p_regiao
  ),
  agg as (
    select i.codlinha,
           bool_and(i.cod_origem in (select cod_ibge from muns)) as all_in,
           (array_agg(i.cod_origem order by i.id))[1] as origem_ibge
    from public.itinerario_teste i
    group by i.codlinha
  )
  select a.codlinha from agg a
  where (p_modo = 'dentro' and a.all_in)
     or (p_modo = 'origem' and a.origem_ibge in (select cod_ibge from muns))
$function$;

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

CREATE TRIGGER trg_vigor_auto
  BEFORE INSERT OR UPDATE ON public.portaria_teste
  FOR EACH ROW EXECUTE FUNCTION public.fn_vigor_auto();

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

-- Garante que TABELAS NOVAS no schema public também nasçam só-leitura
-- para anon/authenticated (não repita GRANT de escrita a esses papéis).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;

-- ============================================================
-- 8) REALTIME
-- ⚠️ Hoje só estas 8 tabelas estão na publicação supabase_realtime — as
-- outras 6 tabelas com policy de leitura (itinerario_teste, qh_intervalo_teste,
-- qh_predeterminado_teste, qh_teste, tabela_vista_teste, tarifa_atual_teste)
-- NÃO estão. Isso pode ser intencional (menos volume de eventos) ou uma
-- lacuna — vale confirmar com o dono antes de assumir que é bug.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.codempresa_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_empresa_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_linha_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evento_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.localidades_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.municipio_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.origem_teste;
ALTER PUBLICATION supabase_realtime ADD TABLE public.portaria_teste;

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
