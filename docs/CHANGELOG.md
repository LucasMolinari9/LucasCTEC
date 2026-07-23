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

## 22/07/2026 — Profissionalização do frontend (UX, rotas, CSS próprio)

Revisão completa do frontend (branch `claude/frontend-review-2sty95`, avaliada em preview antes
do merge). Nenhuma mudança de banco. Em resumo:

1. **Rotas por hash** (seção `ROTAS (hash)` no `app.js`): `#/linha/<codlinha>`,
   `#/consulta/<view>` e a combinação. Links compartilháveis/favoritáveis, deep link na
   entrada, e o **Voltar do navegador fecha o modal** (abertura cria UMA entrada de histórico;
   trocas de view internas usam `replaceState`).
2. **CSS extraído para `styles.css`** (o `<style>` do `index.html` saiu; `style-src` segue com
   `'unsafe-inline'` por causa dos `style=""` dinâmicos — accents dos cards e larguras de `th`).
   Os ~30 estilos inline REPETIDOS dos templates viraram classes (`.doc-h3`, `.doc-note`,
   `.doc-count`, `.fd-*`, `.qh-*`, `.doc-obs.tight` etc.). `checarNovaVersao` vigia agora
   **3 ETags** (`index.html`, `app.js`, `styles.css`).
3. **`esc()` também escapa `'`** (`&#39;`) — remove a classe de bug dos atributos single-quoted
   (os `.replace(/'/g,…)` manuais saíram); cópia no `tests/pure.harness.js` atualizada + teste.
4. **`app.js` num IIFE** (nada vaza p/ `window`) e **logo DETRO (SVG ~280 linhas) saiu do JS**
   — vive inline no `#brandLogo` do `index.html`; `docHead` reusa o markup e a cor vem da
   classe `.brand-logo-doc` (fim do `replace(currentColor)`).
5. **supabase-js injetado dinamicamente** pelo `app.js` (só serve o Realtime; script dinâmico é
   async → não bloqueia a primeira pintura). A tag `<script>` dele saiu do `index.html`.
6. **Busca do topo**: busca-enquanto-digita (debounce 300 ms, ≥2 caracteres), navegação por
   teclado (↓/↑/Esc), semântica de combobox (`aria-expanded` etc.) e **consultas no dropdown**
   (digitar "tarifa" acha o card Tarifas — `matchViews`/`VIEW_META`).
7. **Cards**: descrições diferenciadas (a instrução repetida "Busque a linha…" saiu), documentos
   mais usados primeiro, ícones exclusivos (`histEmp`, `fleet`, `ruler`), chip visível nos cards
   que exigem linha ("Requer linha selecionada" → "Linha <nº>" quando há linha ativa) e modo
   compacto no celular (linha única, sem descrição — menos rolagem).
8. **Sem detalhe interno na UI pública**: rodapé sem "Supabase"/"bd_teste" (carimbo `#verTag`
   continua, discreto) e rodapés de documento sem nome de tabela (`tabela_vista_teste` etc. →
   "cadastro DETRO-RJ · DIVAT").
9. **A11y**: toasts com `role="status"` (leitores de tela anunciam avisos e o "Atualizado ao
   vivo").
10. **PWA mínimo**: `manifest.webmanifest` + `vendor/icon.svg` (instalável na tela inicial;
    sem service worker).

## 23/07/2026 — Revisão de segurança guiada pelo checklist do CyberSources

Revisão pontual do frontend e da postura do Supabase, adaptando ao formato do site (estático +
PostgREST, sem servidor próprio) a fatia de "Web Testing/Reconnaissance" do catálogo de
ferramentas [bst04/CyberSources](https://github.com/bst04/CyberSources). Escopo somente-leitura
(headers HTTP, GRANTs/RLS via SQL e Security Advisor, varredura estática de XSS/injeção de
filtro no `app.js`, segredos nos arquivos servidos); nenhuma escrita real foi tentada contra a
API pública (rede de saída bloqueada no ambiente da revisão) — compensado consultando os GRANTs
direto no Postgres, prova mais forte que um teste de caixa-preta.

- **Único achado (médio): HTML injection refletido em 2 telas.** `pesquisaEvento`
  (`app.js`, Pesquisa de Evento) e `mostrarLinhasPorLocalidade` (`app.js`, Ligações por
  Localidade/Município) concatenavam o termo de busca do usuário direto em `innerHTML` na
  mensagem de "nenhum resultado", sem passar por `esc()` — ao contrário do resto do arquivo
  (~150 outros pontos escapam corretamente). Em Localidade/Município a inconsistência era
  visível na própria função: a variável `b` era escapada numa branch e não na outra. A CSP
  `script-src 'self'` (sem `unsafe-inline`) já impedia execução de JS por esse vetor (handlers
  inline como `onerror=` são bloqueados pelo navegador), então o risco real era injeção de HTML
  morto/link de phishing dentro do resultado de busca, não roubo de sessão. **Corrigido**:
  `term`/`a`/`b` agora passam por `esc()` nos dois pontos, igual ao padrão do resto do arquivo —
  diff de 2 linhas, `node tests/check.js` verde (259/259 testes) depois da mudança.
- **Confirmado sem achado**: GRANTs do Postgres mostram só `SELECT` para `anon`/
  `authenticated` em todas as 18 tabelas públicas (zero INSERT/UPDATE/DELETE);
  `rolbypassrls=false` para os dois (só `service_role` ignora RLS); as 4 tabelas de staging do
  ETL seguem "RLS ativo, sem policy" — o padrão intencional já documentado, não uma falha;
  nenhuma chave `service_role` embutida nos arquivos servidos; `ilikeTerm()` neutraliza
  injeção no agrupador `or=(...)` do PostgREST; headers de segurança (CSP, HSTS,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) completos no
  `vercel.json`.
- **Pendente, fora do escopo desta revisão**: ativar *Leaked Password Protection* no Dashboard
  do Supabase (Authentication → Policies) — já listado como pendente no `CLAUDE.md`; não foi
  possível confirmar ao vivo se o signup do Auth está fechado (mesmo bloqueio de rede); hash do
  `vendor/supabase-js-2.110.7.min.js` não foi reconferido contra o pacote oficial do npm.

## 23/07/2026 — Home vira painel lateral (sidebar de tópicos)

- **Home de cards → painel lateral fixo.** A grade de seções empilhadas deu lugar a uma
  **sidebar de tópicos** (nav navy à esquerda) + **painel de conteúdo** que mostra os cards do
  tópico ativo. A casca é montada uma vez e preenchida por `selectTopic`; a seção `RENDER CARDS`
  do `app.js` passou a ter `renderSideNav`/`renderSideContent` (mapa de código no `CLAUDE.md`
  atualizado).
- **Tópico "Gerenciais e Pesquisa" renomeado para "Portarias".** Cor de acento **unificada**
  (mesmo azul de "Documentos da Linha") em todos os cards e no destaque do tópico ativo — parou
  de variar por família.
- **Rota nova `#/topico/<key>`** (deep link do tópico ativo no painel; omitida quando é o
  padrão). Convive com `#/linha/…` e `#/consulta/…`; a busca do topo leva ao tópico dono e
  **realça** o card (sem abrir o documento sozinho).
- **Sub-lista da sidebar só abre por clique explícito** no tópico (nunca sozinha ao virar o
  tópico atual). No **mobile** a sidebar vira faixa horizontal de ícones e a sub-lista some;
  `renderSideNav` faz `scrollIntoView` do tópico ativo para o destaque não ficar fora da faixa
  (deep link / busca).
- **Fix de dado na tela de Tarifas:** "Piso I" é **quilometragem** (extensão da seção), não
  valor — passou a exibir `… km` em vez de `R$ …`.
- `node tests/check.js` verde (260/260). Sem mudança de schema/Realtime — só frontend.
