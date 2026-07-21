# CHANGELOG — Portal DIVAT

Cronologia dos endurecimentos e mudanças estruturais. O `CLAUDE.md` descreve só o **estado
atual + regras**; o histórico de *como se chegou nele* vive aqui (com links para os relatórios
de auditoria em `docs/`).

## 26/06/2026 — Auditoria de segurança (escrita fechada de verdade)

- **Escrita revogada** de `anon` e `authenticated` em todas as tabelas (INSERT/UPDATE/DELETE/
  TRUNCATE/REFERENCES/TRIGGER) + `ALTER DEFAULT PRIVILEGES` para tabelas futuras não voltarem
  a conceder escrita. Desde então **não há caminho de escrita pela API pública**.
- **16 policies `auth_all_*` dropadas** (eram `ALL USING(true) WITH CHECK(true)` — davam escrita
  total a qualquer usuário logado).
- Índices **btree + trigram (`pg_trgm`)** nas colunas de filtro.
- O snapshot de segurança pré-endurecimento gerado nesse dia ficou **obsoleto** — restaurá-lo
  reabriria as brechas; a baseline válida é `docs/backup_schema.sql`.

## 15/07/2026 — PKs e permissões de staging

- **PRIMARY KEY em todas as tabelas.** Onde já havia coluna única (`id`, `cod_ibge`,
  `cod_origem`, `ordem_importacao`), a PK foi promovida sobre ela (sem mudar a forma → ETL
  intacto). As 3 grandes com `id` repetido (`itinerario_teste`, `qh_intervalo_teste`,
  `qh_predeterminado_teste`) ganharam **`row_id` bigint GENERATED ALWAYS AS IDENTITY** (o `id`
  original ficou porque o front ordena por ele).
- FK `fk_tarifa_linha` com índice de cobertura `idx_tarifa_codempresa_codlinha`.
- **Staging do ETL sem grant** para `anon`/`authenticated` (invisíveis pela API pública).

## 16/07/2026 — Realtime completo + runbook de backup

- **6 tabelas centrais** que faltavam entraram na publicação `supabase_realtime` (a atualização
  ao vivo estava quebrada para elas); `VIEW_TABLES` passou a listar também as tabelas lidas por
  baixo via lookups (bug: mudança em lookup não recarregava a tela).
- Runbook **`docs/backup.md`** + baseline **`docs/backup_schema.sql`** + script
  **`scripts/backup_rest.mjs`** (o projeto está no plano Free, sem PITR).
- Relatório: `docs/revisao-externa-2026-07-16.md`.

## 17/07/2026 — Vendoring do supabase-js + renames de schema

- **supabase-js vendorado** em `vendor/supabase-js-2.110.7.min.js` (antes: jsDelivr `@2` sem
  versão fixa nem SRI); jsDelivr saiu da CSP.
- **Desambiguação** `cod_origem` (terminal/origem) × `cod_municipio_origem` (IBGE em
  `itinerario_teste`; antes se chamava `cod_origem`) e typo `cod_origen` corrigido em
  `qh_intervalo_teste`. Índices e `divat_linhas_regiao` acompanharam (`docs/schema.md`).
- Args `tables:[...]` mortos removidos das chamadas de `searchPanel`.
- Relatório: `docs/revisao-externa-2026-07-17.md`.

## 18/07/2026 — Paginação de tela + PDF inteiro

- Listas longas paginadas (25/pág) por `paginateTable`/`paginateLines`; o PDF continua saindo
  **inteiro** (`currentView.pdfHTML` com a lista completa). Corte de 300 no cliente em
  `lineResults` removido. Detalhes: `docs/estrutura-frontend.md` §4.

## 21/07/2026 — Endurecimento final (revisão de arquitetura)

Plano completo em `docs/plano-endurecimento-2026-07-21.md`. Em resumo:

1. **Backup automático**: workflow `.github/workflows/backup.yml` (semanal + manual) roda o
   `backup_rest.mjs` em **modo público** (anon key, 14 tabelas, sem staging), artifact 90 dias.
   O script ganhou os modos completo/público.
2. **Fontes vendoradas** em `vendor/fonts/` (Archivo, IBM Plex Mono/Sans, subset latin, via
   pacotes `@fontsource` 5.3.0); Google Fonts saiu do runtime e da CSP (`font-src 'self'`).
3. **JS extraído para `app.js`** (byte a byte) e **CSP `script-src 'self'`** — fim do
   `'unsafe-inline'` de script. `checarNovaVersao` compara os ETags de `index.html` **e**
   `app.js`; `tests/check.js` compila o `app.js` e **falha** se voltar `<script>` inline no
   HTML; `realtime.test.js`/`check_realtime.mjs` extraem literais do `app.js`.
   Racional: `docs/estrutura-frontend.md` §1.
4. **`pgrst.db_max_rows = 30000`** no role `authenticator` (teto do PostgREST = maior `limit`
   do front).
5. **U+FFFD zerado no banco**: 41 rótulos de `evento_empresa_teste` + 6 textos longos (eventos/
   portarias, finais e staging) + 1 tarifa + 1 `dia_semana` restaurados (contexto inequívoco,
   padrões Latin-1/UTF-8 de mojibake). Único juízo editorial: `evento_empresa_teste.row_id=48`
   era "Suspenção de Intervenção" (typo da origem) → restaurado como "Suspensão de Intervenção".
   **Atenção ETL:** reimportar com encoding errado recria o problema — importar sempre UTF-8.
6. **Docs**: este CHANGELOG criado; `CLAUDE.md` enxuto (só estado atual + regras); fluxo de
   trabalho passa a ser **branch → preview do Vercel → merge na `main`**.
